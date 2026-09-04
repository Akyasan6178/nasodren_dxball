import { Geometry, Graphics, Mesh, Texture } from 'pixi.js';
import { PLASMA } from './config.js';

/**
 * Plasma ball ribbon.
 *
 * A triangle strip built from the ball's recent positions. Two vertices per
 * sample, offset along the local normal, with the width tapering to nothing at
 * the tail.
 *
 * API note for PixiJS v8: `DRAW_MODES.TRIANGLE_STRIP` no longer exists. Draw
 * mode moved onto Geometry as the WebGPU-style `topology: 'triangle-strip'`,
 * which is what this uses.
 *
 * Everything is allocated once. The vertex buffer is sized for the maximum
 * sample count at construction and only ever mutated in place, so a trail
 * costs zero allocations per frame no matter how long it runs. When fewer
 * samples exist than slots, the spare slots collapse onto the tail point and
 * render as degenerate (zero-area) triangles rather than resizing the buffer.
 */

const MAX_POINTS = PLASMA.points;
const VERTEX_COUNT = MAX_POINTS * 2;

/** Head-to-tail alpha ramp, baked once. */
let TRAIL_TEXTURE = Texture.WHITE;

/**
 * @param {import('pixi.js').Renderer} renderer
 */
export function buildTrailTexture(renderer) {
  const steps = 48;
  const w = 8;
  const h = 96;
  const g = new Graphics();

  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    // Vertical ramp, to match the v-along-the-ribbon UV layout. Squared
    // falloff: the head stays hot while the tail drops away quickly.
    g.rect(0, (i * h) / steps, w, h / steps + 1).fill({ color: 0xffffff, alpha: t * t });
  }

  TRAIL_TEXTURE = renderer.generateTexture({ target: g, resolution: 1, antialias: false });
  g.destroy();
  return TRAIL_TEXTURE;
}

export class PlasmaTrail {
  constructor() {
    /** Sample positions in design space, oldest first. Flat x,y pairs. */
    this.points = new Float32Array(MAX_POINTS * 2);
    this.count = 0;

    this.positions = new Float32Array(VERTEX_COUNT * 2);
    this.uvs = new Float32Array(VERTEX_COUNT * 2);

    // UVs never change. u is 0/1 across the ribbon, v runs tail-to-head along
    // it — the layout from the brief. The gradient texture is therefore baked
    // vertically so v samples the alpha ramp; with Texture.WHITE these would be
    // inert and the ribbon would have no fade at all.
    for (let i = 0; i < MAX_POINTS; i++) {
      const v = i / (MAX_POINTS - 1);
      this.uvs[i * 4 + 0] = 0;
      this.uvs[i * 4 + 1] = v;
      this.uvs[i * 4 + 2] = 1;
      this.uvs[i * 4 + 3] = v;
    }

    this.geometry = new Geometry({
      attributes: { aPosition: this.positions, aUV: this.uvs },
      topology: 'triangle-strip',
    });

    this.mesh = new Mesh({ geometry: this.geometry, texture: TRAIL_TEXTURE });
    this.mesh.blendMode = 'add';
    this.mesh.tint = PLASMA.tint;
    this.mesh.visible = false;

    this._positionBuffer = this.geometry.getBuffer('aPosition');
    this._lastX = 0;
    this._lastY = 0;
  }

  /** Start fresh at a position, discarding any previous path. */
  reset(x, y) {
    this.count = 0;
    this._lastX = x;
    this._lastY = y;
    this.mesh.visible = false;
  }

  clear() {
    this.count = 0;
    this.mesh.visible = false;
  }

  /**
   * Record the ball's position and rebuild the strip.
   * @returns {boolean} whether the mesh has anything to draw
   */
  update(x, y) {
    const dx = x - this._lastX;
    const dy = y - this._lastY;

    if (this.count === 0 || dx * dx + dy * dy >= PLASMA.minStep * PLASMA.minStep) {
      this._push(x, y);
      this._lastX = x;
      this._lastY = y;
    } else {
      // Not far enough for a new sample, but keep the head glued to the ball so
      // the ribbon never visibly detaches.
      if (this.count > 0) {
        this.points[(this.count - 1) * 2] = x;
        this.points[(this.count - 1) * 2 + 1] = y;
      }
    }

    if (this.count < 2) {
      this.mesh.visible = false;
      return false;
    }

    this._rebuild();
    this.mesh.visible = true;
    return true;
  }

  _push(x, y) {
    if (this.count === MAX_POINTS) {
      // Drop the oldest sample. copyWithin on 40 floats is a memmove, not a
      // loop, and avoids the bookkeeping a ring buffer would need at rebuild.
      this.points.copyWithin(0, 2);
      this.points[(MAX_POINTS - 1) * 2] = x;
      this.points[(MAX_POINTS - 1) * 2 + 1] = y;
    } else {
      this.points[this.count * 2] = x;
      this.points[this.count * 2 + 1] = y;
      this.count++;
    }
  }

  _rebuild() {
    const pts = this.points;
    const pos = this.positions;
    const n = this.count;
    const last = n - 1;

    // Spare slots sit on the tail sample, producing zero-area triangles.
    const offset = MAX_POINTS - n;

    let prevNx = 0;
    let prevNy = 0;

    for (let slot = 0; slot < MAX_POINTS; slot++) {
      const i = slot < offset ? 0 : slot - offset;

      const px = pts[i * 2];
      const py = pts[i * 2 + 1];

      // Central difference gives a normal that stays smooth through curves;
      // one-sided at the ends.
      const a = Math.max(0, i - 1);
      const b = Math.min(last, i + 1);
      let tx = pts[b * 2] - pts[a * 2];
      let ty = pts[b * 2 + 1] - pts[a * 2 + 1];

      const len = Math.hypot(tx, ty);
      let nx;
      let ny;

      if (len < 1e-4) {
        // Coincident samples carry no direction; reuse the last good normal
        // rather than emitting NaN.
        nx = prevNx;
        ny = prevNy;
      } else {
        tx /= len;
        ty /= len;
        nx = -ty;
        ny = tx;
        prevNx = nx;
        prevNy = ny;
      }

      // Taper across the live samples only, so a short trail still fades.
      const t = last > 0 ? i / last : 0;
      const halfWidth = (PLASMA.width * t) / 2;

      pos[slot * 4 + 0] = px + nx * halfWidth;
      pos[slot * 4 + 1] = py + ny * halfWidth;
      pos[slot * 4 + 2] = px - nx * halfWidth;
      pos[slot * 4 + 3] = py - ny * halfWidth;
    }

    this._positionBuffer.update();
  }

  destroy() {
    this.mesh.destroy();
    this.geometry.destroy();
  }
}
