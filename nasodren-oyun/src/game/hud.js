import { Container, Graphics, Sprite } from 'pixi.js';
import { DESIGN, HUD_H } from './config.js';
import { makeText } from './ui.js';
import { ICONS } from './powerup-icons.js';
import { TEX } from './textures.js';

/**
 * Active power-up row: icon size and spacing, in design pixels.
 *
 * Left-aligned in the gap between the score digits and the centred level
 * text, NOT right-aligned under the lives — that used to put both rows
 * right-anchored within a few pixels of each other, so a caught power-up
 * icon sat directly on top of (or immediately beside) the life hearts the
 * moment there was more than one of either on screen.
 */
const POWER_ICON = 15;
const POWER_GAP = 5;
const POWER_ROW_Y = 19;
const POWER_ROW_X = 100;

/** Life icon: footprint and spacing, in design pixels. */
const LIFE_ICON = 16;
const LIFE_GAP = 8;
const LIFE_ROW_Y = HUD_H / 2;

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

    this.scoreLabel = makeText('SKOR', { size: 10, color: 0x6a7bb5 });
    this.scoreLabel.position.set(12, 5);
    this.addChild(this.scoreLabel);

    this.scoreValue = makeText('0', { size: 17, color: 0xffd23f });
    this.scoreValue.position.set(12, 16);
    this.addChild(this.scoreValue);

    this.levelLabel = makeText('BÖLÜM', { size: 10, color: 0x6a7bb5, anchor: [0.5, 0] });
    this.levelLabel.position.set(DESIGN.width / 2, 5);
    this.addChild(this.levelLabel);

    this.levelValue = makeText('1', { size: 15, color: 0xffffff, anchor: [0.5, 0] });
    this.levelValue.position.set(DESIGN.width / 2, 17);
    this.addChild(this.levelValue);

    this.livesIcons = new Container();
    this.addChild(this.livesIcons);

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

    for (const sprite of this.livesIcons.removeChildren()) sprite.destroy();

    // One heart per spare life, right-aligned so the row grows leftward.
    for (let i = 0; i < Math.max(0, lives); i++) {
      const heart = new Sprite(TEX.heartIcon);
      heart.anchor.set(0.5);
      heart.width = LIFE_ICON;
      heart.height = LIFE_ICON;
      heart.position.set(DESIGN.width - 14 - LIFE_ICON / 2 - i * (LIFE_ICON + LIFE_GAP), LIFE_ROW_Y);
      this.livesIcons.addChild(heart);
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

    for (const child of this.powerIcons.removeChildren()) child.destroy({ children: true });
    if (!actives.length) return;

    // Left-aligned row — see POWER_ROW_X — so the order stays stable left to
    // right as power-ups expire off the end.
    let x = POWER_ROW_X;

    for (const def of actives) {
      const texture = ICONS[def.id];
      if (!texture) continue; // atlas not built, or an id with no artwork

      // A dark badge behind each icon. Without it a thin line-art icon at
      // 15px, tinted and sitting on the HUD's own near-black bar, is nearly
      // unreadable — the same problem the falling capsules solve with a dark
      // body under their tinted icon (see powerups.js's Capsule), reused here.
      const badge = new Graphics()
        .roundRect(x - 3, POWER_ROW_Y - 3, POWER_ICON + 6, POWER_ICON + 6, 4)
        .fill({ color: 0x0b0f22, alpha: 0.92 })
        .roundRect(x - 3, POWER_ROW_Y - 3, POWER_ICON + 6, POWER_ICON + 6, 4)
        .stroke({ width: 1, color: def.color, alpha: 0.9 });
      this.powerIcons.addChild(badge);

      const sprite = new Sprite(texture);
      sprite.width = POWER_ICON;
      sprite.height = POWER_ICON;
      sprite.tint = def.color;
      sprite.position.set(x, POWER_ROW_Y);
      this.powerIcons.addChild(sprite);

      x += POWER_ICON + 6 + POWER_GAP;
    }
  }
}
