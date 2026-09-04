import { Container, Sprite } from 'pixi.js';
import { BRICK_H, BRICK_W, COLORS, GRID, SCORE } from './config.js';
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
};

export class Brick extends Sprite {
  constructor(spec, col, row) {
    const colorIndex = spec.colorIndex ?? row % COLORS.length;
    super(TEX[textureKeyFor(spec.kind, colorIndex)]);

    this.kind = spec.kind;
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

    // Cached AABB — collision reads these every substep, so never recompute.
    this.bx = GRID.x + col * GRID.cellW + GRID.gap / 2;
    this.by = GRID.y + row * GRID.cellH + GRID.gap / 2;
    this.bw = BRICK_W;
    this.bh = BRICK_H;

    this.position.set(this.bx, this.by);

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
    this.texture = TEX[textureKeyFor('standard', this.colorIndex)];
  }

  /** Show accumulated damage on multi-hit bricks. */
  refreshDamage() {
    const taken = this.maxHits - this.hits;
    if (taken <= 0) return;

    if (!this.crack) {
      this.crack = new Sprite(TEX.crack1);
      this.addChild(this.crack);
    }
    this.crack.texture = taken >= 2 ? TEX.crack2 : TEX.crack1;
    this.tint = taken >= 2 ? 0xbfbfbf : 0xdedede;
  }

  snapshot() {
    return {
      x: this.centerX,
      y: this.centerY,
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
