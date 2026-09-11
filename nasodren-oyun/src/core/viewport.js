import { Container, Graphics } from 'pixi.js';
import { onResize } from './pixi-app.js';
import {
  applyDesignHeight,
  applyHudScale,
  hudLift,
  resolveDesignHeight,
  resolveHudScale,
} from '../game/config.js';

/**
 * Fixed-WIDTH viewport.
 *
 * The renderer fills the window, but everything the game draws lives inside a
 * DESIGN-sized container that is uniformly scaled and positioned. Uniform
 * scale is the important part: art never stretches, and collision maths can
 * stay in design pixels forever without caring about the window.
 *
 * Leftover space becomes letterbox/pillarbox bars, and a mask stops anything
 * from bleeding into them.
 *
 * IT USED TO BE FIXED-ASPECT AND ALWAYS LANDSCAPE. There are two boxes now —
 * 640x480 and 480x854 — and config.js picks one from the screen's shape before
 * this class is constructed, so nothing in here has to know which it got. The
 * width of whichever box it is stays fixed at every size (see
 * resolveDesignHeight in config.js for why the width is the anchor) and the
 * height is the free axis, growing downward on a screen taller than the box.
 *
 * A phone held upright used to be shown a "rotate your device" card instead of
 * the game, then an adaptive 640-wide board that fitted the screen's width by
 * shrinking everything on it. The narrower portrait box is what finally makes
 * the ball and the paddle physically bigger there, since the fit-to-width
 * scale is the only thing that decides that — and giving the landscape screen
 * its own box back is what stops a widescreen monitor being handed a tall
 * narrow strip in exchange.
 *
 * THIS CLASS OWNS THAT DECISION for the whole codebase. It is the only caller
 * of `applyDesignHeight`, it is the only thing here that knows the screen
 * size, and it hands the rest of the game a design box that is already correct
 * by the time any scene is constructed.
 */
export class Viewport {
  /**
   * @param {import('pixi.js').Application} app
   * @param {number} width design-space width; the anchor, never recomputed
   * @param {number} height initial design height, replaced on the first layout
   * @param {{onLayout?: (info: {boxChanged: boolean}) => void}} [options]
   */
  constructor(app, width, height, options = {}) {
    this.app = app;
    this.width = width;
    this.height = height;
    this.scale = 1;

    /**
     * Called after every layout, with whether the design box changed shape.
     *
     * Assignable after construction because the first layout runs inside this
     * constructor — before there is a SceneManager to tell — and that first
     * layout never needs the callback: nothing has been built yet to reflow.
     */
    this.onLayout = options.onLayout ?? null;

    this.root = new Container();
    app.stage.addChild(this.root);

    // Playfield backdrop, also the mask geometry.
    this.backdrop = new Graphics().rect(0, 0, width, height).fill(0x0b0b16);
    this.root.addChild(this.backdrop);

    this.maskShape = new Graphics().rect(0, 0, width, height).fill(0xffffff);
    this.root.addChild(this.maskShape);
    this.root.mask = this.maskShape;

    /** Scenes mount here. */
    this.stage = new Container();
    this.root.addChild(this.stage);

    this.dispose = onResize(app, () => this.layout());
  }

  layout() {
    const { width: sw, height: sh } = this.app.screen;

    // The box's floor first, because the scale below is fitted to the box this
    // resolves. applyDesignHeight is what moves FIELD.bottom and PADDLE.y with
    // it, and it reports whether anything actually moved.
    const designHeight = resolveDesignHeight(sw, sh);
    let changed = applyDesignHeight(designHeight);
    this.height = designHeight;

    const scale = Math.min(sw / this.width, sh / this.height);

    this.scale = scale;
    this.root.scale.set(scale);
    // Round the offsets to avoid a half-pixel seam on the letterbox edges.
    this.root.x = Math.round((sw - this.width * scale) / 2);

    // VERTICAL SLACK IS BIASED UPWARD ON A PORTRAIT SCREEN rather than split
    // evenly the way the horizontal slack is. A phone's spare height belongs
    // under the board: that is where the thumb dragging the paddle already
    // rests, and Input's drag-anywhere touch mapping makes the strip live
    // control surface rather than a dead bar. A quarter is still left on top,
    // which is what the HUD grows into and what keeps a notch clear of it.
    //
    // THERE IS MUCH LESS OF IT TO SHARE OUT NOW. A 480x854 board on a 390x844
    // phone leaves 150 CSS pixels against the 500 the old always-landscape box
    // left, so this is a nudge rather than the load-bearing decision it used to
    // be. The test is the SCREEN's shape rather than the board's, which matters
    // on the rotated-after-boot case: a portrait board on a screen that has
    // since turned landscape wants its slack split evenly like any pillarbox.
    const slack = sh - this.height * scale;
    this.root.y = Math.round(slack * (sh > sw ? 0.25 : 0.5));

    // The HUD's size, resolved last because it is bounded by the headroom the
    // two lines above just decided. See resolveHudScale.
    if (applyHudScale(resolveHudScale(scale, this.root.y / scale))) changed = true;

    if (changed) this._redrawBox();

    this.onLayout?.({ boxChanged: changed });
  }

  /**
   * Re-cut the backdrop and the mask to the current box.
   *
   * THE MASK REACHES ABOVE y 0 by `hudLift()`, which is the one thing in the
   * drawing allowed to live outside the board: the HUD bar grows upward into
   * the letterbox on a phone, because everything below y 36 is playfield. Cut
   * the mask at 0 and that extension is invisible — clipped by the same mask
   * that draws the letterbox bars.
   *
   * The backdrop stays at the board, so the strip above stays the page's own
   * black rather than the board's slightly lighter navy.
   */
  _redrawBox() {
    const lift = hudLift();

    this.backdrop.clear().rect(0, 0, this.width, this.height).fill(0x0b0b16);
    this.maskShape
      .clear()
      .rect(0, -lift, this.width, this.height + lift)
      .fill(0xffffff);
  }

  /** Screen-space (CSS pixel) point -> design-space point. */
  toWorld(gx, gy) {
    return {
      x: (gx - this.root.x) / this.scale,
      y: (gy - this.root.y) / this.scale,
    };
  }
}
