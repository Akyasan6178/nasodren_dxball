import { Container, Sprite } from 'pixi.js';
import { BRICK, BRICK_H, BRICK_W, COLORS, GRID, SCORE } from './config.js';
import { TEX, textureKeyFor } from './textures.js';

/**
 * Brick kinds. Only two remain — everything else (silver/gold/explosive/
 * invisible) was retired once the HP-tier art took over as the one damage
 * readout the game needs:
 *
 *   standard    - tier-textured by current HP (see textureKeyFor)
 *   bone        - indestructible, ignored when counting the level as cleared
 */
const CHAR_MAP = {
  B: { kind: 'bone', hits: Infinity, points: 0, breakable: false },

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
    super(TEX[textureKeyFor(spec.kind, colorIndex, shape, spec.hits)]);

    this.kind = spec.kind;
    this.shape = shape;
    this.colorIndex = colorIndex;
    this.color = COLORS[colorIndex];
    this.maxHits = spec.hits;
    this.hits = spec.hits;
    this.breakable = spec.breakable !== false;
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

    // The tier art (brick1/2/3.png) is a fixed source image unrelated to the
    // cell's own design-space size; the older baked-Graphics textures already
    // matched it exactly, so this is a no-op for those and the one line that
    // makes the tier art fit for everything else.
    this.width = this.bw;
    this.height = this.bh;

  }

  get centerX() {
    return this.bx + this.bw / 2;
  }

  get centerY() {
    return this.by + this.bh / 2;
  }

  /**
   * Swaps in the texture matching this brick's current `hits` against its
   * `maxHits` — see `textureKeyFor`. Undamaged shows the tier art
   * (brick1/2/3.png); damaged but still alive shows the cracked art instead
   * (cracked1/2.png) — no separate decal sprite, this is the whole texture.
   */
  refreshDamage() {
    const key = textureKeyFor(this.kind, this.colorIndex, this.shape, this.hits, this.maxHits);
    if (this.texture === TEX[key]) return;
    this.texture = TEX[key];
    // A texture swap can jump between images of different native size (a
    // baked shape-variant vs. the fixed-size tier/cracked art), so the fit
    // has to be reapplied every time, not just once at construction.
    this.width = this.bw;
    this.height = this.bh;
  }

  /**
   * Called by `BrickField.buffAllBricks` after it bumps `hits`/`maxHits`, to
   * refresh this brick's texture to the new, tougher tier.
   */
  applyBuff() {
    this.refreshDamage();
  }

  snapshot() {
    return {
      // The scattered position, not the grid one: every particle, flash and
      // capsule this break spawns has to come from where the cell was drawn.
      x: this.visualX,
      y: this.visualY,
      color: this.color,
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

    /**
     * The layout's original spec per cell, kept even after the live brick at
     * that cell is destroyed and its `grid` slot goes back to null.
     *
     * This is what lets a 30s respawn tick (see `spawnBricks`) offer only
     * cells that legitimately held a brick when the level was authored,
     * rather than any empty cell on the board. On a `cavity: true` level that
     * matters for more than taste: `check-nose` only ever validated the
     * authored layout's own cells against the sinus tracts, so a respawn is
     * only guaranteed geometrically legal if it reuses one of those.
     */
    this._originalSpecs = [];

    for (let r = 0; r < this.rows; r++) {
      const line = levelDef.rows[r];
      const rowArr = new Array(this.cols).fill(null);
      const specRow = new Array(this.cols).fill(null);

      for (let c = 0; c < this.cols; c++) {
        const spec = this._specFor(line[c], r);
        specRow[c] = spec;
        if (!spec) continue;

        const brick = new Brick(spec, c, r);
        rowArr[c] = brick;
        this.addChild(brick);
        if (brick.breakable) this.remaining++;
      }

      this.grid.push(rowArr);
      this._originalSpecs.push(specRow);
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
   * Apply damage to a brick.
   *
   * @returns {{damaged:boolean, blocked:boolean, destroyed:object[]}}
   */
  damage(brick, amount = 1, { fire = false } = {}) {
    const out = { damaged: false, blocked: false, destroyed: [] };
    if (!brick || brick.removed) return out;

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

    this._destroyBrick(brick, out.destroyed);
    return out;
  }

  _destroyBrick(brick, acc) {
    this._remove(brick);
    acc.push(brick.snapshot());
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

  /**
   * 30s dynamic mechanic: refill up to `count` previously-broken cells with
   * fresh one-hit standard bricks.
   *
   * Candidates are cells that are currently empty (`grid[r][c]` is null) but
   * held a breakable brick in the authored layout (`_originalSpecs`) — never
   * a cell that was always empty. That is what keeps a cavity level's
   * containment guarantee intact without this method needing to know
   * anything about the sinus geometry itself: every one of those cells
   * already passed `check-nose` once, when the level was authored.
   *
   * Uses `Math.random()`, the shared gameplay sequence, rather than
   * `cosmeticRandom()` — this changes `remaining` and therefore the level's
   * own clear condition, so it belongs with capsule drops and power-up rolls,
   * not with cosmetic jitter. Safe to call with nothing legal left to fill;
   * it simply does nothing.
   */
  spawnBricks(count) {
    const candidates = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c]) continue;

        const original = this._originalSpecs[r]?.[c];
        if (original && original.breakable !== false) candidates.push([c, r]);
      }
    }

    if (!candidates.length) return;

    const n = Math.min(count, candidates.length);
    for (let i = 0; i < n; i++) {
      // Partial Fisher-Yates: only need `n` distinct picks, not a full shuffle.
      const j = i + Math.floor(Math.random() * (candidates.length - i));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];

      const [c, r] = candidates[i];
      const brick = new Brick({ kind: 'standard', hits: 1, points: SCORE.brick }, c, r);
      this.grid[r][c] = brick;
      this.addChild(brick);
      this.remaining++;
    }
  }

  /**
   * The corruption clock's HP buff, fired at each of `LEVEL_TIMER.buffTimes`
   * (60s, then 120s): every currently alive breakable brick gains +1 HP (both
   * `hits` and `maxHits`), dropping it to a tougher tier texture — see
   * `Brick.applyBuff`.
   *
   * Skips bone — already infinite — via `breakable`.
   */
  buffAllBricks() {
    for (const brick of this.all()) {
      if (!brick.breakable) continue;

      brick.hits += 1;
      brick.maxHits += 1;
      brick.applyBuff();
    }
  }
}
