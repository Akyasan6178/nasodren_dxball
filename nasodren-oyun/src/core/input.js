/**
 * Unified input layer: mouse, keyboard and touch collapse into one small state
 * object the gameplay reads each frame.
 *
 * Pointer position is converted straight to design space, so paddle tracking is
 * pixel-perfect at any window size and any device pixel ratio.
 *
 * Touch uses the standard "drag anywhere" pattern — the paddle follows the
 * finger's X wherever on screen it happens to be, which avoids the finger
 * covering the paddle.
 */
import { DESIGN } from '../game/config.js';

const KEY_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEY_RIGHT = new Set(['ArrowRight', 'KeyD']);
const KEY_LAUNCH = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter']);
const KEY_PAUSE = new Set(['Escape', 'KeyP']);
const SWALLOW = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export class Input {
  /**
   * @param {import('pixi.js').Application} app
   * @param {import('./viewport.js').Viewport} viewport
   * @param {{absoluteTouch?: boolean}} [options]
   */
  constructor(app, viewport, options = {}) {
    this.viewport = viewport;
    this.canvas = app.canvas;

    /** Snap the paddle to the touch point instead of dragging relatively. */
    this.absoluteTouch = options.absoluteTouch ?? false;

    this.keys = new Set();
    // `pointer.x` is the paddle's control target in design space, not a raw
    // cursor position — the two only coincide under a mouse.
    this.pointer = { x: DESIGN.width / 2, y: DESIGN.height / 2, down: false };
    /** True once the player has moved a pointer; keyboard input clears it. */
    this.pointerActive = false;

    this._launchQueued = false;
    this._pauseQueued = false;
    this._keyListeners = new Set();
    this._anchor = null;
    this._bound = [];

    /**
     * Set by the scene while a modal (the pause menu) is on screen.
     *
     * Mouse control is absolute — the paddle tracks wherever the cursor is,
     * even hovering, not just while a button is held — which is exactly right
     * during play but means reaching for an on-screen button (the pause icon,
     * "DEVAM ET", ...) quietly drags the control target there too. That sits
     * harmless while paused (gameplay reads nothing), then snaps the paddle
     * toward the button the instant play resumes. Suspending here stops that
     * drift at the source instead of chasing it after the fact.
     */
    this.suspended = false;

    this._bind();
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._bound.push(() => target.removeEventListener(type, fn, opts));
  }

  /**
   * Client coordinates -> renderer screen space (CSS pixels, thanks to
   * autoDensity). Measuring against the live bounding rect means the mapping
   * stays exact at any window size, device pixel ratio or browser zoom.
   */
  _screenPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    return {
      x: ((e.clientX - rect.left) / rect.width) * this.canvas.clientWidth,
      y: ((e.clientY - rect.top) / rect.height) * this.canvas.clientHeight,
    };
  }

  /** HTML overlays own their own gestures — never steal them for the paddle. */
  _isUi(e) {
    return e.target instanceof Element && e.target.closest('#ui-layer') !== null;
  }

  _bind() {
    /**
     * Mouse and touch want genuinely different mappings.
     *
     * A mouse cursor is precise, visible, and already sits on the playfield, so
     * the paddle goes exactly where it is. A fingertip is none of those things:
     * it lands wherever is comfortable, usually low and off to one side, and it
     * covers whatever is underneath it. Snapping the paddle to the touch point
     * would teleport it across the board and then hide it under the finger.
     *
     * So touch anchors on first contact and afterwards tracks the finger's
     * *delta*, divided by the viewport scale so a centimetre of finger travel is
     * a centimetre of paddle travel however the board is currently scaled.
     */
    const down = (e) => {
      if (this._isUi(e) || this.suspended) return;

      const p = this._screenPoint(e);
      if (!p) return;

      const world = this.viewport.toWorld(p.x, p.y);
      this.pointer.y = world.y;
      this.pointer.down = true;
      this.pointerActive = true;
      this._launchQueued = true;

      if (e.pointerType === 'mouse' || this.absoluteTouch) {
        this._anchor = null;
        this.pointer.x = world.x;
      } else {
        this._anchor = { screenX: p.x, targetX: this.pointer.x };
      }

      this._clampPointer();
    };

    const move = (e) => {
      if (this.suspended) return;
      if (this._isUi(e) && !this.pointer.down) return;

      const p = this._screenPoint(e);
      if (!p) return;

      const world = this.viewport.toWorld(p.x, p.y);
      this.pointer.y = world.y;
      this.pointerActive = true;

      if (e.pointerType === 'mouse' || this.absoluteTouch) {
        this.pointer.x = world.x;
      } else if (this._anchor && this.pointer.down) {
        this.pointer.x = this._anchor.targetX + (p.x - this._anchor.screenX) / this.viewport.scale;
      }

      this._clampPointer();
    };

    const up = () => {
      this.pointer.down = false;
      this._anchor = null;
    };

    this._on(window, 'pointermove', move, { passive: true });
    this._on(window, 'pointerdown', down);
    this._on(window, 'pointerup', up);
    this._on(window, 'pointercancel', up);

    // Suppress the context menu so right-drag doesn't interrupt play.
    this._on(this.canvas, 'contextmenu', (e) => e.preventDefault());

    this._on(window, 'keydown', (e) => {
      if (SWALLOW.has(e.code)) e.preventDefault();
      if (e.repeat) {
        this._notifyKey(e);
        return;
      }

      this.keys.add(e.code);
      if (KEY_LAUNCH.has(e.code)) this._launchQueued = true;
      if (KEY_PAUSE.has(e.code)) this._pauseQueued = true;
      if (KEY_LEFT.has(e.code) || KEY_RIGHT.has(e.code)) this.pointerActive = false;

      this._notifyKey(e);
    });

    this._on(window, 'keyup', (e) => this.keys.delete(e.code));

    // Releasing keys on blur prevents a stuck paddle after tabbing away.
    this._on(window, 'blur', () => {
      this.keys.clear();
      this.pointer.down = false;
      this._anchor = null;
    });
  }

  _notifyKey(e) {
    for (const fn of this._keyListeners) fn(e);
  }

  /** Subscribe to raw keydown events (used by the high-score name entry). */
  onKey(fn) {
    this._keyListeners.add(fn);
    return () => this._keyListeners.delete(fn);
  }

  _clampPointer() {
    this.pointer.x = Math.max(0, Math.min(DESIGN.width, this.pointer.x));
  }

  /** Re-centre the control target without causing a jump on the next drag. */
  setPointerTarget(x) {
    this.pointer.x = x;
    this._anchor = null;
    this._clampPointer();
  }

  /** -1, 0 or 1 from the keyboard. */
  axis() {
    let a = 0;
    for (const code of this.keys) {
      if (KEY_LEFT.has(code)) a -= 1;
      if (KEY_RIGHT.has(code)) a += 1;
    }
    return Math.sign(a);
  }

  get firing() {
    return this.pointer.down || this.keys.has('Space');
  }

  /** Edge-triggered: returns true once per press. */
  consumeLaunch() {
    const v = this._launchQueued;
    this._launchQueued = false;
    return v;
  }

  consumePause() {
    const v = this._pauseQueued;
    this._pauseQueued = false;
    return v;
  }

  clearQueued() {
    this._launchQueued = false;
    this._pauseQueued = false;
  }

  destroy() {
    for (const off of this._bound) off();
    this._bound.length = 0;
    this._keyListeners.clear();
  }
}
