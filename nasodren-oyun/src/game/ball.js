import { Container, Sprite } from 'pixi.js';
import { BALL, CYCLAMEN } from './config.js';
import { TEX } from './textures.js';
import { PLASMA } from './config.js';
import { PlasmaTrail } from './plasma-trail.js';
import { cosmeticRandom } from '../core/rng.js';

const FIRE_TINT = 0xff9130;
const THROUGH_TINT = 0xa963ff;
const NORMAL_TINT = 0xffffff;

/**
 * A ball carries a normalised direction plus a scalar speed, rather than a raw
 * velocity vector. Reflections only touch the direction, so power-ups can scale
 * speed independently without ever corrupting the trajectory.
 */
export class Ball extends Container {
  constructor() {
    super();

    this.glow = new Sprite(TEX.glow);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.alpha = 0.3;
    this.glow.scale.set(0.32);
    this.addChild(this.glow);

    this.body = new Sprite(TEX.cyclamenBall);
    this.body.anchor.set(0.5);
    this.addChild(this.body);

    /**
     * Design-space scale for the baked flower.
     *
     * Read off the texture rather than hard-coded, because the cyclamen is
     * drawn and baked far larger than the ball is rendered — see
     * CYCLAMEN_BAKE_R in textures.js for why. Both bakes are the same
     * dimensions, so this is computed once and survives the skin swap.
     */
    this._bodyScale = (BALL.radius * CYCLAMEN.visualScale * 2) / this.body.texture.width;
    this.body.scale.set(this._bodyScale);

    /**
     * Which way this flower turns. Randomised per ball so a Multi-Ball split
     * does not put three identical spinners on screen turning in lockstep.
     */
    this._spinDir = cosmeticRandom() < 0.5 ? -1 : 1;

    this.radius = BALL.radius;
    this.speed = BALL.baseSpeed;
    this.dx = 0;
    this.dy = -1;

    /** Non-null while held by a sticky paddle: offset from paddle centre. */
    this.stuckOffset = null;

    this.fire = false;
    this.through = false;
    this.dead = false;

    /**
     * Ribbon trail, created lazily on first plasma activation. The mesh does
     * NOT live under this container: it is mounted into a shared layer so a
     * single bloom pass covers every plasma ball on screen. Vertices are
     * therefore in design space, not ball-local space.
     */
    this.trail = null;

    /** Piercing + neon override. The only route to piercing in the game. */
    this.isPlasmaMode = false;
    this._plasmaRemaining = 0;

    /**
     * Containers supplied by the scene. During plasma the ball is reparented
     * into `plasmaGroup` so the layer's single AdvancedBloomFilter covers the
     * sprite and its ribbon together — one bloom chain instead of one per ball.
     */
    this.homeLayer = null;
    this.plasmaGroup = null;
    this.trailGroup = null;

    /** Fired when the override times out. */
    this.onPlasmaEnd = null;

    this.refreshTint();
  }

  get held() {
    return this.stuckOffset !== null;
  }

  /** @param {number} angle radians from straight up, positive is right. */
  launch(angle) {
    this.dx = Math.sin(angle);
    this.dy = -Math.cos(angle);
    this.stuckOffset = null;
    this.normalise();
  }

  setDirection(dx, dy) {
    this.dx = dx;
    this.dy = dy;
    this.normalise();
  }

  normalise() {
    const len = Math.hypot(this.dx, this.dy) || 1;
    this.dx /= len;
    this.dy /= len;
    this.clampDirection();
  }

  /**
   * Keeps the trajectory inside a usable band.
   *
   * A near-horizontal ball ping-pongs between the side walls forever; a
   * perfectly vertical one drills a single column and then loops in the empty
   * corridor. Clamping both components stops each failure mode without the
   * player ever feeling steered.
   */
  clampDirection() {
    const minY = BALL.minVerticalFraction;
    const minX = BALL.minHorizontalFraction;

    const sx = this.dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(this.dx);
    const sy = this.dy < 0 ? -1 : 1;

    const dx = Math.max(Math.abs(this.dx), minX);
    const dy = Math.max(Math.abs(this.dy), minY);

    const len = Math.hypot(dx, dy) || 1;
    this.dx = (dx / len) * sx;
    this.dy = (dy / len) * sy;
  }

  setFire(on) {
    this.fire = on;
    this.refreshTint();
  }

  setThrough(on) {
    this.through = on;
    this.refreshTint();
  }

  /**
   * Pick the flower bake that suits the tint about to be applied.
   *
   * A tint is a multiply. The cyclamen's own magenta is what makes it a
   * cyclamen, but multiplying Fire's orange over magenta gives brown and
   * Through's violet gives near-black — the power-up stops being legible at the
   * exact moment it is the most important thing on screen. So a tinted ball
   * draws the pale bake, which carries the flower's shape and shading with the
   * colour stripped out, and comes back to the coloured one when it is plain.
   *
   * The two textures are the same size, so the swap does not disturb
   * `_bodyScale`, and both live in the atlas from boot — no load, no reflow.
   */
  _setSkin(tinted) {
    const texture = tinted ? TEX.cyclamenBallPale : TEX.cyclamenBall;
    if (this.body.texture !== texture) this.body.texture = texture;
  }

  refreshTint() {
    // Plasma owns the sprite's look outright; nothing else may repaint it.
    if (this.isPlasmaMode) {
      this._setSkin(true);
      this.body.tint = PLASMA.tint;
      this.glow.tint = PLASMA.tint;
      return;
    }

    const tint = this.fire ? FIRE_TINT : this.through ? THROUGH_TINT : NORMAL_TINT;
    this._setSkin(tint !== NORMAL_TINT);
    this.body.tint = tint;
    this.glow.tint = tint;
    // Normal-state glow is deliberately subdued — a hint of light around the
    // flower rather than a halo that competes with it. Fire/Through stay
    // louder: those are active power-up states and are supposed to announce
    // themselves.
    this.glow.alpha = this.fire ? 0.95 : this.through ? 0.7 : 0.3;
    this.glow.scale.set(this.fire ? 0.62 : this.through ? 0.42 : 0.32);
  }

  /**
   * Wire up the containers this ball moves between. Called by the scene at
   * construction; without it plasma still runs, just without the bloom layer.
   */
  setLayers({ home, plasmaGroup, trailGroup }) {
    this.homeLayer = home;
    this.plasmaGroup = plasmaGroup;
    this.trailGroup = trailGroup;
  }

  /**
   * Purge Protocol override: piercing physics plus the cyberpunk skin.
   * Idempotent; calling it again refreshes the timer.
   *
   * The countdown is frame-driven rather than a setTimeout. A timeout keeps
   * running through a pause and through a backgrounded tab, so the player would
   * come back to an expired power-up they never got to use.
   *
   * @param {number} durationMs
   */
  activatePlasmaMode(durationMs = PLASMA.durationMs) {
    this._plasmaRemaining = durationMs / 1000;

    if (this.isPlasmaMode) return;
    this.isPlasmaMode = true;

    // Mechanical override: this is what the brick and boss collisions read.
    this.fire = true;
    this.refreshTint();

    // Visual override.
    this.body.tint = PLASMA.tint;
    this.glow.tint = PLASMA.tint;
    this.glow.alpha = 1;
    this.glow.scale.set(0.8);

    if (!this.trail) this.trail = new PlasmaTrail();
    this.trail.reset(this.x, this.y);
    this.trailGroup?.addChild(this.trail.mesh);

    // Into the bloomed layer.
    this.plasmaGroup?.addChild(this);
  }

  /** Idempotent. Restores normal bouncing physics and the default skin. */
  deactivatePlasmaMode() {
    if (!this.isPlasmaMode) return;
    this.isPlasmaMode = false;
    this._plasmaRemaining = 0;

    this.fire = false;

    if (this.trail) {
      this.trail.clear();
      if (this.trail.mesh.parent) this.trail.mesh.parent.removeChild(this.trail.mesh);
    }

    // Back out of the bloomed layer before restoring the tint, so a single
    // frame never renders an untinted ball with bloom still applied.
    this.homeLayer?.addChild(this);

    this.body.tint = 0xffffff;
    this.glow.scale.set(0.42);
    this.refreshTint();
  }

  /**
   * Once-per-frame update: spins the flower, runs the override countdown and
   * rebuilds the ribbon. Physics still advances through `step()` inside the
   * collision substep loop.
   *
   * THIS NOW RUNS ON EVERY BALL, EVERY FRAME. It used to be called only from
   * `_updatePlasmaTrails`, which returns early unless the Purge Protocol is
   * live — fine when the only thing in here was the plasma countdown, useless
   * for a flower that has to turn during ordinary play. The scene calls it from
   * `_updateBalls` instead; see the note there about why it must not be called
   * from both.
   *
   * Only `body` rotates. The glow is a radial falloff, so turning it would be a
   * transform write for an identical image.
   *
   * @param {number} dt seconds
   */
  update(dt) {
    this.body.rotation +=
      dt * CYCLAMEN.spin * (this.speed / BALL.baseSpeed) * this._spinDir;

    if (!this.isPlasmaMode) return;

    this.trail?.update(this.x, this.y);

    this._plasmaRemaining -= dt;
    if (this._plasmaRemaining <= 0) {
      const cb = this.onPlasmaEnd;
      this.deactivatePlasmaMode();
      cb?.(this);
    }
  }

  /** Advance by one substep. */
  step(dt) {
    this.x += this.dx * this.speed * dt;
    this.y += this.dy * this.speed * dt;
  }

  /** A destroyed ball must not leave its ribbon parented to the shared layer. */
  destroy(options) {
    this.deactivatePlasmaMode();
    this.trail?.destroy();
    this.trail = null;
    super.destroy(options);
  }
}
