import { Container, Sprite } from 'pixi.js';
import { BRICK, BRICK_H, BRICK_W, COLORS, GRID, SCORE } from './config.js';
import { TEX, textureKeyFor } from './textures.js';

/**
 * Brick kinds, mirroring the original set.
 *
 *   standard    - one hit, palette-coloured
 *   silver      - two hits, cracks between them
 *   gold        - three hits
 *   explosive   - one hit, detonates its 3x3 neighbourhood (chains)
 *   metal       - indestructible, ignored when counting the level as cleared
 *   invisible   - materialises on first contact, then acts as standard
 */
const CHAR_MAP = {
  S: { kind: 'silver', hits: 2, points: SCORE.tough },
  G: { kind: 'gold', hits: 3, points: SCORE.tough * 1.5 },
  X: { kind: 'explosive', hits: 1, points: SCORE.explosive },
  M: { kind: 'metal', hits: Infinity, points: 0, breakable: false },
  I: { kind: 'invisible', hits: 1, points: SCORE.brick * 1.4, hidden: true },

  /**
   * Shape variants. A standard one-hit cell in a smaller box, worth the same:
   * these exist to break up the silhouette, not to change what a break is
   * worth, and paying less for a small clump would quietly push players toward
   * ignoring exactly the cells that make the layout look congested.
   *
   * `<` and `>` hug the left and right edge of their cell, `o` is a small
   * square in the middle of it. Read the characters as pictures of where the
   * mucus sits in the cell — that is what makes a hand-authored layout legible.
   */
  '<': { kind: 'standard', hits: 1, points: SCORE.brick, shape: 'halfLeft' },
  '>': { kind: 'standard', hits: 1, points: SCORE.brick, shape: 'halfRight' },
  o: { kind: 'standard', hits: 1, points: SCORE.brick, shape: 'small' },
};

/**
 * A stable pseudo-random value in [-1, 1] for this cell and channel.
 *
 * Deterministic on purpose — see BRICK.scatter in config.js. An integer hash
 * rather than a seeded PRNG because there is nothing to carry between calls:
 * each cell asks once, at construction, and must get the same answer on every
 * load, in every session, on every machine.
 */
function cellNoise(col, row, channel) {
  let h = (col * 374761393 + row * 668265263 + channel * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 32768 - 1;
}

export class Brick extends Sprite {
  constructor(spec, col, row) {
    const colorIndex = spec.colorIndex ?? row % COLORS.length;
    const shape = spec.shape ?? 'full';
    super(TEX[textureKeyFor(spec.kind, colorIndex, shape)]);

    this.kind = spec.kind;
    this.shape = shape;
    this.colorIndex = colorIndex;
    this.color = COLORS[colorIndex];
    this.maxHits = spec.hits;
    this.hits = spec.hits;
    this.breakable = spec.breakable !== false;
    this.hidden = spec.hidden === true;
    this.points = Math.round(spec.points ?? SCORE.brick);
    this.removed = false;

    this.col = col;
    this.row = row;

    /**
     * Cached AABB — collision reads these every substep, so never recompute.
     *
     * LOCKED TO THE GRID, and deliberately out of step with where the sprite is
     * drawn. The cell keeps its exact grid box however far the artwork is
     * scattered: a bounce off a clump is a bounce off an axis-aligned rectangle
     * at a position the ball's cell lookup can derive arithmetically, which is
     * what keeps `BrickField.candidates` constant-time and what keeps the
     * rebound predictable. The mess is a costume, not a hitbox.
     */
    const box = BRICK.shapes[shape];
    this.bw = BRICK_W * box.w;
    this.bh = BRICK_H * box.h;
    this.bx = GRID.x + col * GRID.cellW + GRID.gap / 2 + (BRICK_W - this.bw) * box.align;
    this.by = GRID.y + row * GRID.cellH + GRID.gap / 2 + (BRICK_H - this.bh) * 0.5;

    /**
     * Where the cell is actually drawn: its grid centre, nudged and tilted.
     *
     * Anchored at 0.5 so the tilt turns about the middle rather than swinging
     * the cell out of its own column. `visualX`/`visualY` are published because
     * every effect the break spawns has to come from the artwork the player was
     * looking at — a puff of petals appearing four pixels off the clump that
     * produced them reads as a bug, and it is the only thing the scatter can
     * plausibly break.
     */
    this.visualX = this.bx + this.bw / 2 + cellNoise(col, row, 1) * BRICK.scatter;
    this.visualY = this.by + this.bh / 2 + cellNoise(col, row, 2) * BRICK.scatter;

    this.anchor.set(0.5);
    this.position.set(this.visualX, this.visualY);
    this.rotation = cellNoise(col, row, 3) * BRICK.tilt;

    this.crack = null;

    if (this.hidden) this.alpha = 0;
  }

  get centerX() {
    return this.bx + this.bw / 2;
  }

  get centerY() {
    return this.by + this.bh / 2;
  }

  /** Invisible brick becomes solid on first contact. */
  reveal() {
    if (!this.hidden) return;
    this.hidden = false;
    this.alpha = 1;
    this.texture = TEX[textureKeyFor('standard', this.colorIndex, this.shape)];
  }

  /** Show accumulated damage on multi-hit bricks. */
  refreshDamage() {
    const taken = this.maxHits - this.hits;
    if (taken <= 0) return;

    if (!this.crack) {
      this.crack = new Sprite(TEX.crack1);
      // The parent is anchored at 0.5, so a child at the origin sits on the
      // cell's centre. The crack texture is cell-sized, so it needs the same
      // anchor to line up rather than hanging off one corner.
      this.crack.anchor.set(0.5);
      this.addChild(this.crack);
    }
    this.crack.texture = taken >= 2 ? TEX.crack2 : TEX.crack1;
    this.tint = taken >= 2 ? 0xbfbfbf : 0xdedede;
  }

  snapshot() {
    return {
      // The scattered position, not the grid one: every particle, flash and
      // capsule this break spawns has to come from where the cell was drawn.
      x: this.visualX,
      y: this.visualY,
      color: this.kind === 'metal' ? 0x8a92a8 : this.color,
      kind: this.kind,
      points: this.points,
      row: this.row,
    };
  }
}

export class BrickField extends Container {
  /** @param {{rows:string[]}} levelDef */
  constructor(levelDef) {
    super();
    this.interactiveChildren = false;
    this.eventMode = 'none';

    this.rows = levelDef.rows.length;
    this.cols = GRID.cols;
    this.grid = [];
    this.remaining = 0;

    for (let r = 0; r < this.rows; r++) {
      const line = levelDef.rows[r];
      const rowArr = new Array(this.cols).fill(null);

      for (let c = 0; c < this.cols; c++) {
        const spec = this._specFor(line[c], r);
        if (!spec) continue;

        const brick = new Brick(spec, c, r);
        rowArr[c] = brick;
        this.addChild(brick);
        if (brick.breakable) this.remaining++;
      }

      this.grid.push(rowArr);
    }
  }

  _specFor(ch, row) {
    if (!ch || ch === '.') return null;

    if (ch >= '1' && ch <= '8') {
      return { kind: 'standard', hits: 1, points: SCORE.brick, colorIndex: Number(ch) - 1 };
    }

    const mapped = CHAR_MAP[ch];
    if (!mapped) return null;

    return { ...mapped, colorIndex: mapped.colorIndex ?? row % COLORS.length };
  }

  at(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    const b = this.grid[row][col];
    return b && !b.removed ? b : null;
  }

  get cleared() {
    return this.remaining <= 0;
  }

  /**
   * Apply damage to a brick and resolve any explosion chain it starts.
   *
   * @returns {{revealed:boolean, damaged:boolean, blocked:boolean, destroyed:object[]}}
   */
  damage(brick, amount = 1, { fire = false } = {}) {
    const out = { revealed: false, damaged: false, blocked: false, destroyed: [] };
    if (!brick || brick.removed) return out;

    // An invisible brick spends the first hit simply appearing, unless the ball
    // is on fire — fire burns straight through the reveal.
    if (brick.hidden) {
      brick.reveal();
      out.revealed = true;
      if (!fire) return out;
    }

    if (!brick.breakable) {
      out.blocked = true;
      return out;
    }

    brick.hits -= fire ? Infinity : amount;

    if (brick.hits > 0) {
      brick.refreshDamage();
      out.damaged = true;
      return out;
    }

    this._destroyChain(brick, out.destroyed);
    return out;
  }

  /** Breadth-first detonation so explosive clusters cascade exactly once each. */
  _destroyChain(start, acc) {
    const queue = [start];

    while (queue.length) {
      const brick = queue.shift();
      if (!brick || brick.removed || !brick.breakable) continue;

      this._remove(brick);
      acc.push(brick.snapshot());

      if (brick.kind !== 'explosive') continue;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const n = this.at(brick.col + dc, brick.row + dr);
          if (n && n.breakable) queue.push(n);
        }
      }
    }
  }

  _remove(brick) {
    brick.removed = true;
    brick.visible = false;
    this.grid[brick.row][brick.col] = null;
    this.remaining--;
  }

  /**
   * Grid cells overlapping an AABB. Restricting collision to the handful of
   * candidate cells keeps the cost constant no matter how full the wall is.
   */
  *candidates(minX, minY, maxX, maxY) {
    const c0 = Math.max(0, Math.floor((minX - GRID.x) / GRID.cellW));
    const c1 = Math.min(this.cols - 1, Math.floor((maxX - GRID.x) / GRID.cellW));
    const r0 = Math.max(0, Math.floor((minY - GRID.y) / GRID.cellH));
    const r1 = Math.min(this.rows - 1, Math.floor((maxY - GRID.y) / GRID.cellH));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const b = this.grid[r]?.[c];
        if (b && !b.removed) yield b;
      }
    }
  }

  /** Every surviving breakable brick, used by the level-clear sweep. */
  *all() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const b = this.grid[r][c];
        if (b && !b.removed) yield b;
      }
    }
  }
}
