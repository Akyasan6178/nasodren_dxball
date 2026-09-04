import { Container, Graphics } from 'pixi.js';
import { CORRUPTION, FIELD } from './config.js';
import { makeText } from './ui.js';

const W = 148;
const H = 10;
const SEGMENTS = 12;

/**
 * System Corruption meter.
 *
 * Sits top-right inside the playfield rather than in the HUD bar: that bar is
 * already carrying score, level, lives and the active power-up row, and this
 * only exists during a boss encounter. Parking it here means the boss level
 * adds a readout instead of rearranging a HUD the other twelve levels share.
 *
 * The boss patrol band starts below it, so the two never overlap.
 */
export class CorruptionMeter extends Container {
  constructor() {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.value = 0;
    this.corrupted = false;
    this._t = 0;

    const panel = new Graphics();
    panel.roundRect(-8, -6, W + 16, H + 30, 6).fill({ color: 0x07070f, alpha: 0.72 });
    panel
      .roundRect(-8, -6, W + 16, H + 30, 6)
      .stroke({ width: 1, color: 0xff4d5a, alpha: 0.35 });
    this.addChild(panel);

    this.label = makeText('SYSTEM CORRUPTION', { size: 9, color: 0x8a93b8 });
    this.label.position.set(0, 0);
    this.addChild(this.label);

    this.bar = new Graphics();
    this.addChild(this.bar);

    this.readout = makeText('0%', { size: 11, color: 0xff8f9a, anchor: [1, 0] });
    this.readout.position.set(W, -1);
    this.addChild(this.readout);

    // Right-aligned against the playfield edge, under the HUD bar.
    this.position.set(FIELD.right - W - 10, FIELD.top + 8);
    this._draw();
  }

  /** @param {number} value 0..100 */
  set(value) {
    const next = Math.max(0, Math.min(CORRUPTION.threshold, value));
    if (next === this.value) return;
    this.value = next;
    this._draw();
  }

  setCorrupted(on) {
    if (this.corrupted === on) return;
    this.corrupted = on;
    this._draw();
  }

  update(dt) {
    if (!this.corrupted) return;
    // Only the fully-corrupted state animates, so the meter is calm until it
    // matters and then impossible to miss.
    this._t += dt * 8;
    this.label.alpha = 0.55 + Math.abs(Math.sin(this._t)) * 0.45;
    this.readout.tint = Math.sin(this._t * 1.7) > 0 ? 0xff2e97 : 0x00e5ff;
  }

  _draw() {
    const frac = this.value / CORRUPTION.threshold;
    const lit = Math.round(frac * SEGMENTS);
    const g = this.bar;

    g.clear();

    const segW = (W - (SEGMENTS - 1) * 2) / SEGMENTS;
    for (let i = 0; i < SEGMENTS; i++) {
      const x = i * (segW + 2);
      const on = i < lit;

      // Ramp amber to crimson across the strip so the last few cells read as
      // the danger zone without needing a separate marker.
      const t = i / (SEGMENTS - 1);
      const color = t < 0.5 ? 0xffd23f : t < 0.8 ? 0xff9130 : 0xff4d5a;

      g.roundRect(x, 14, segW, H, 2).fill({
        color: on ? color : 0x1b2038,
        alpha: on ? 1 : 0.85,
      });
    }

    if (this.corrupted) {
      g.roundRect(-2, 12, W + 4, H + 4, 3).stroke({ width: 1.5, color: 0xff2e97, alpha: 0.9 });
    }

    this.readout.text = `${Math.round(this.value)}%`;
    this.readout.tint = this.corrupted ? 0xff2e97 : frac > 0.66 ? 0xff4d5a : 0xff8f9a;
    this.label.text = this.corrupted ? 'PADDLE CORRUPTED' : 'SYSTEM CORRUPTION';
    this.label.tint = this.corrupted ? 0xff2e97 : 0x8a93b8;
    if (!this.corrupted) this.label.alpha = 1;
  }
}
