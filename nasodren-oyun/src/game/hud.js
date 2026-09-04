import { Container, Graphics, Sprite } from 'pixi.js';
import { DESIGN, HUD_H } from './config.js';
import { makeText } from './ui.js';
import { ICONS } from './powerup-icons.js';

/** Active power-up row: icon size and spacing, in design pixels. */
const POWER_ICON = 15;
const POWER_GAP = 5;
const POWER_ROW_Y = 19;
const POWER_ROW_RIGHT = DESIGN.width - 12;

/**
 * Top status bar: score, remaining lives, level, and a strip of letters for the
 * power-ups currently ticking down.
 *
 * Only the label text is mutated per frame; the chrome is drawn once.
 */
export class Hud extends Container {
  constructor() {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    const bar = new Graphics();
    bar.rect(0, 0, DESIGN.width, HUD_H).fill(0x07070f);
    bar.rect(0, HUD_H - 2, DESIGN.width, 2).fill({ color: 0x35d0d8, alpha: 0.55 });
    this.addChild(bar);

    this.scoreLabel = makeText('SCORE', { size: 10, color: 0x6a7bb5 });
    this.scoreLabel.position.set(12, 5);
    this.addChild(this.scoreLabel);

    this.scoreValue = makeText('0', { size: 17, color: 0xffd23f });
    this.scoreValue.position.set(12, 16);
    this.addChild(this.scoreValue);

    this.levelLabel = makeText('LEVEL', { size: 10, color: 0x6a7bb5, anchor: [0.5, 0] });
    this.levelLabel.position.set(DESIGN.width / 2, 5);
    this.addChild(this.levelLabel);

    this.levelValue = makeText('1', { size: 15, color: 0xffffff, anchor: [0.5, 0] });
    this.levelValue.position.set(DESIGN.width / 2, 17);
    this.addChild(this.levelValue);

    this.livesGfx = new Graphics();
    this.addChild(this.livesGfx);

    // Active power-ups, drawn as their own icons rather than letters. Shares
    // the baked atlas the falling capsules use, so the thing you caught and the
    // thing on the HUD are visibly the same object.
    this.powerIcons = new Container();
    this.addChild(this.powerIcons);

    this._lives = -1;
    this._powerKey = '';
  }

  setScore(score) {
    this.scoreValue.text = String(score).padStart(6, '0');
  }

  setLevel(index, name) {
    this.levelValue.text = `${index + 1}  ${name.toUpperCase()}`;
  }

  setLives(lives) {
    if (lives === this._lives) return;
    this._lives = lives;

    const g = this.livesGfx;
    g.clear();

    // Miniature paddles, one per spare life.
    for (let i = 0; i < Math.max(0, lives); i++) {
      const x = DESIGN.width - 14 - i * 26;
      g.roundRect(x - 20, 8, 20, 5, 2.5).fill(0x1d2340);
      g.roundRect(x - 20, 8, 20, 5, 2.5).stroke({ width: 1, color: 0x35d0d8, alpha: 0.9 });
    }
  }

  /**
   * @param {{id:string,color:number,label:string}[]} actives
   *
   * Called every frame by the gameplay timer sweep, so the row is only rebuilt
   * when the set of active power-ups actually changes. Rebuilding sprites at
   * 60fps would allocate for nothing.
   */
  setPowers(actives) {
    const key = actives.map((a) => a.id).join(',');
    if (key === this._powerKey) return;
    this._powerKey = key;

    for (const sprite of this.powerIcons.removeChildren()) sprite.destroy();
    if (!actives.length) return;

    // Right-aligned row, laid out left to right so the order stays stable as
    // power-ups expire off the end.
    const total = actives.length * POWER_ICON + (actives.length - 1) * POWER_GAP;
    let x = POWER_ROW_RIGHT - total;

    for (const def of actives) {
      const texture = ICONS[def.id];
      if (!texture) continue; // atlas not built, or an id with no artwork

      const sprite = new Sprite(texture);
      sprite.width = POWER_ICON;
      sprite.height = POWER_ICON;
      sprite.tint = def.color;
      sprite.position.set(x, POWER_ROW_Y);
      this.powerIcons.addChild(sprite);

      x += POWER_ICON + POWER_GAP;
    }
  }
}
