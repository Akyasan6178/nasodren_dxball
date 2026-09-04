import { Container, Graphics } from 'pixi.js';
import { onResize } from './pixi-app.js';

/**
 * Fixed-aspect viewport.
 *
 * The renderer fills the window, but everything the game draws lives inside a
 * DESIGN-sized container that is uniformly scaled and centred. Uniform scale is
 * the important part: art never stretches, and collision maths can stay in
 * design pixels forever without caring about the window.
 *
 * Leftover space becomes letterbox/pillarbox bars, and a mask stops anything
 * from bleeding into them.
 */
export class Viewport {
  constructor(app, width, height) {
    this.app = app;
    this.width = width;
    this.height = height;
    this.scale = 1;

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
    const scale = Math.min(sw / this.width, sh / this.height);

    this.scale = scale;
    this.root.scale.set(scale);
    // Round the offset to avoid a half-pixel seam on the letterbox edges.
    this.root.x = Math.round((sw - this.width * scale) / 2);
    this.root.y = Math.round((sh - this.height * scale) / 2);
  }

  /** Screen-space (CSS pixel) point -> design-space point. */
  toWorld(gx, gy) {
    return {
      x: (gx - this.root.x) / this.scale,
      y: (gy - this.root.y) / this.scale,
    };
  }
}
