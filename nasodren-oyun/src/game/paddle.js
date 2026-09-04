import { Container, Graphics } from 'pixi.js';
import { GlitchFilter } from 'pixi-filters';
import { CORRUPTION, DESIGN, FIELD, GLITCH, PADDLE } from './config.js';

/** GlitchFilter fill modes. 0 leaves displaced slices transparent. */
const FILL_TRANSPARENT = 0;

const MODE_COLORS = {
  normal: 0x35d0d8,
  sticky: 0x86e05a,
  laser: 0xff4d5a,
};

/**
 * The paddle owns its own width/mode state machine.
 *
 * Width changes are eased rather than snapped, matching the way the original
 * grew and shrank the bat over a few frames — it reads as a physical object
 * instead of a teleporting rectangle.
 */
export class Paddle extends Container {
  constructor() {
    super();

    this.gfx = new Graphics();
    this.addChild(this.gfx);

    this.widthState = 'normal';
    /** 'normal' | 'sticky' | 'laser' */
    this.mode = 'normal';

    this.w = PADDLE.widths.normal;
    this.targetW = this.w;
    this.h = PADDLE.height;

    /**
     * Movement speed multiplier. 1 is the base game. Anything below it caps how
     * far the paddle may travel per frame, which is what makes the Corrupted
     * status bite under a mouse as well as the keyboard — a pointer normally
     * snaps instantly, so scaling `keySpeed` alone would leave mouse players
     * untouched by the debuff.
     */
    this.speedScale = 1;
    this.corrupted = false;

    /** GlitchFilter instance, created on demand and torn down on release. */
    this._glitch = null;
    // Reused for every channel-offset write so the per-frame update allocates
    // nothing.
    this._channel = { x: 0, y: 0 };

    this.vx = 0;
    this._lastX = DESIGN.width / 2;
    this._drawnW = -1;
    this._drawnMode = null;
    this._drawnCorrupt = false;

    this.x = DESIGN.width / 2;
    this.y = PADDLE.y;

    this.redraw();
  }

  get halfWidth() {
    return this.w / 2;
  }

  get left() {
    return this.x - this.halfWidth;
  }

  get right() {
    return this.x + this.halfWidth;
  }

  get top() {
    return this.y - this.h / 2;
  }

  get bottom() {
    return this.y + this.h / 2;
  }

  setWidthState(state) {
    this.widthState = state;
    this.targetW = PADDLE.widths[state];
  }

  setMode(mode) {
    this.mode = mode;
  }

  /** @param {number} scale 1 = unmodified. */
  setSpeedScale(scale) {
    this.speedScale = scale;
  }

  setCorrupted(on) {
    this.corrupted = on;
    this.setSpeedScale(on ? CORRUPTION.speedScale : 1);
  }

  /**
   * Switch on the corruption glitch. Idempotent.
   *
   * The filter is built once and left alone apart from its uniforms. In
   * particular `slices` is never touched after construction: changing it forces
   * GlitchFilter to regenerate its displacement texture, which is far too
   * expensive to do per frame. `seed` and the channel offsets are plain
   * uniforms and cost nothing.
   */
  activateGlitch() {
    if (this._glitch) return;

    this._glitch = new GlitchFilter({
      slices: GLITCH.slices,
      offset: GLITCH.offset,
      direction: 0,
      fillMode: FILL_TRANSPARENT,
      average: false,
      seed: Math.random(),
    });

    // Displaced slices travel outside the paddle's bounds; without padding they
    // get clipped at the edge of the filter's render target.
    this._glitch.padding = GLITCH.padding;

    this.filters = [this._glitch];
  }

  /** Idempotent. Removes the filter entirely so no pass is rendered. */
  deactivateGlitch() {
    if (!this._glitch) return;

    // An empty array means the renderer skips the filter step outright.
    this.filters = [];
    this._glitch.destroy?.();
    this._glitch = null;
  }

  /**
   * Per-frame twitch. Called by the scene only while corrupted.
   * @param {number} dt
   */
  updateGlitch(dt) {
    const g = this._glitch;
    if (!g) return;

    g.seed = Math.random();

    const shift = GLITCH.channelShift;
    const c = this._channel;

    c.x = (Math.random() * 2 - 1) * shift;
    c.y = (Math.random() * 2 - 1) * shift * 0.4;
    g.red = c;

    c.x = (Math.random() * 2 - 1) * shift;
    c.y = (Math.random() * 2 - 1) * shift * 0.4;
    g.blue = c;

    void dt;
  }

  /** Full reset after losing a life. */
  reset() {
    this.setWidthState('normal');
    this.setMode('normal');
    this.setCorrupted(false);
    this.deactivateGlitch();
    this.w = this.targetW;
    this.x = DESIGN.width / 2;
    this._lastX = this.x;
    this.vx = 0;
    this.redraw();
  }

  /**
   * @param {number} dt
   * @param {import('../core/input.js').Input} input
   * @param {{control:string}} settings
   * @param {boolean} inverted  Zap power-down: mirror the controls.
   */
  update(dt, input, settings, inverted = false) {
    const startX = this.x;
    const usePointer = settings.control !== 'keys' && input.pointerActive;

    if (usePointer) {
      const center = DESIGN.width / 2;
      const px = inverted ? center * 2 - input.pointer.x : input.pointer.x;
      // pointerLerp of 1 gives the pixel-perfect 1:1 tracking the original had.
      this.x += (px - this.x) * PADDLE.pointerLerp;
    } else if (settings.control !== 'pointer') {
      const axis = input.axis() * (inverted ? -1 : 1);
      this.x += axis * PADDLE.keySpeed * dt;
    }

    // Corrupted: clamp how far the paddle may move this frame, whatever drove
    // it. At scale 1 this branch is skipped entirely, so the base game's motion
    // is bit-for-bit unchanged.
    if (this.speedScale < 1) {
      const maxStep = PADDLE.keySpeed * this.speedScale * dt;
      const delta = this.x - startX;
      if (Math.abs(delta) > maxStep) this.x = startX + Math.sign(delta) * maxStep;
    }

    // Ease the width toward its target.
    if (Math.abs(this.w - this.targetW) > 0.3) {
      this.w += (this.targetW - this.w) * Math.min(1, dt * 14);
    } else {
      this.w = this.targetW;
    }

    this.x = Math.max(FIELD.left + this.halfWidth, Math.min(FIELD.right - this.halfWidth, this.x));

    // Paddle velocity feeds "english" into the ball on contact.
    this.vx = dt > 0 ? (this.x - this._lastX) / dt : 0;
    this._lastX = this.x;

    if (
      Math.abs(this.w - this._drawnW) > 0.4 ||
      this.mode !== this._drawnMode ||
      this.corrupted !== this._drawnCorrupt
    ) {
      this.redraw();
    }
  }

  redraw() {
    const w = this.w;
    const h = this.h;
    const half = w / 2;
    const accent = MODE_COLORS[this.mode];

    this._drawnW = w;
    this._drawnMode = this.mode;
    this._drawnCorrupt = this.corrupted;

    const g = this.gfx;
    g.clear();

    // Body.
    g.roundRect(-half, -h / 2, w, h, h / 2).fill(0x1d2340);
    g.roundRect(-half, -h / 2, w, h * 0.5, h / 3).fill({ color: 0xffffff, alpha: 0.12 });
    g.roundRect(-half + 0.75, -h / 2 + 0.75, w - 1.5, h - 1.5, h / 2)
      .stroke({ width: 1.5, color: accent, alpha: 0.95 });

    // Central energy strip: the colour tells you the current mode at a glance.
    g.roundRect(-half + 6, -2, w - 12, 4, 2).fill({ color: accent, alpha: 0.9 });

    if (this.mode === 'sticky') {
      // Grab pads along the top edge.
      for (let x = -half + 8; x < half - 6; x += 10) {
        g.circle(x, -h / 2 + 2, 1.8).fill({ color: 0xd6ffca, alpha: 0.9 });
      }
    }

    if (this.corrupted) {
      // Chromatic tear across the bat: purely cosmetic, but it makes the
      // sluggishness feel like a fault rather than lag.
      g.roundRect(-half + 2, -h / 2 + 1, w - 4, 3, 1.5).fill({ color: 0xff2e97, alpha: 0.75 });
      g.roundRect(-half + 5, h / 2 - 4, w - 10, 3, 1.5).fill({ color: 0x00e5ff, alpha: 0.75 });
    }

    if (this.mode === 'laser') {
      // Barrels at both tips.
      for (const s of [-1, 1]) {
        g.rect(s * (half - 7) - 2.5, -h / 2 - 6, 5, 8).fill(0x2a3050);
        g.rect(s * (half - 7) - 1.5, -h / 2 - 6, 3, 8).fill({ color: accent, alpha: 0.95 });
      }
    }
  }
}
