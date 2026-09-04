import { Graphics } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { loadBundle } from '../core/assets.js';
import { DESIGN } from '../game/config.js';
import { makeText } from '../game/ui.js';
import { MenuScene } from './menu-scene.js';

const BAR_W = 300;
const BAR_H = 10;
const MIN_VISIBLE = 0.7; // don't flash the loader for a single frame

/**
 * Loading screen. Drives Pixi's Assets bundle loader and reports real progress.
 */
export class BootScene extends Scene {
  constructor(ctx, params) {
    super(ctx, params);
    this.progress = 0;
    this.shown = 0;
    this.elapsed = 0;
    this.done = false;
  }

  enter() {
    const title = makeText('BRICKSTORM', { size: 44, anchor: 0.5, title: true, color: 0x35d0d8 });
    title.position.set(DESIGN.width / 2, 180);
    this.view.addChild(title);

    this.status = makeText('LOADING', { size: 12, anchor: 0.5, color: 0x6a7bb5 });
    this.status.position.set(DESIGN.width / 2, 268);
    this.view.addChild(this.status);

    const frame = new Graphics();
    frame
      .roundRect((DESIGN.width - BAR_W) / 2, 290, BAR_W, BAR_H, BAR_H / 2)
      .stroke({ width: 1.5, color: 0x35d0d8, alpha: 0.6 });
    this.view.addChild(frame);

    this.fill = new Graphics();
    this.view.addChild(this.fill);

    loadBundle('preload', (p) => {
      this.progress = p;
    })
      .then(() => {
        this.progress = 1;
        this.done = true;
      })
      .catch((err) => {
        console.error('[boot] asset load failed', err);
        this.progress = 1;
        this.done = true;
        this.status.text = 'LOAD ERROR - CONTINUING';
      });
  }

  update(dt) {
    this.elapsed += dt;

    // Ease the bar toward the real value so it never snaps.
    this.shown += (this.progress - this.shown) * Math.min(1, dt * 8);

    const w = Math.max(0, BAR_W * this.shown);
    this.fill.clear();
    if (w > 1) {
      this.fill
        .roundRect((DESIGN.width - BAR_W) / 2, 290, w, BAR_H, BAR_H / 2)
        .fill({ color: 0x35d0d8, alpha: 0.9 });
    }

    if (this.done && this.elapsed > MIN_VISIBLE && this.shown > 0.99) {
      this.ctx.sm.change(MenuScene, {});
    }
  }
}
