import { Container, Graphics, Sprite } from 'pixi.js';
import { DESIGN, HUD, HUD_H, HUD_UNIT, IS_PORTRAIT, hudLift } from './config.js';
import { makeText } from './ui.js';
import { ICONS } from './powerup-icons.js';
import { TEX } from './textures.js';

/**
 * HUD metrics at scale 1, in design pixels.
 *
 * EVERY NUMBER HERE IS MULTIPLIED BY `HUD.scale * HUD_UNIT` — see `this.k`
 * below, and never use HUD.scale on its own in this file. The bar was authored
 * for a screen where 36 design pixels of it come out around 68 CSS pixels tall;
 * on a 390px-wide phone the same bar is 22 CSS pixels and its 22px pause glyph
 * lands at 13, which is below the size anything can be read or tapped at.
 *
 * THE TWO FACTORS ARE DIFFERENT KINDS OF THING. HUD_UNIT is the BOX's authored
 * bar size — 1 in landscape, 1.39 in portrait, fixed at load — and HUD.scale is
 * what the runtime adds on top for the screen actually in front of the player.
 * Multiplying both into one number is what makes a portrait bar 35% bigger
 * everywhere at once: the digits, the hearts, the badges and the bar itself.
 *
 * Scaling the contents rather than the container is what keeps the
 * right-anchored lives inside the board: a container scale would push x 626 out
 * to x 1127.
 *
 * THE BAR GROWS UPWARD, into the letterbox space above the board, because
 * everything below y 36 is spoken for — the top wall at 36..44 and row 0's
 * bricks from y 61. `hudLift()` is how far up it reaches, and Viewport
 * extends its mask by the same amount so the extension is not clipped away.
 */
const M = {
  pad: 12,
  scoreLabelSize: 10,
  scoreLabelY: 5,
  scoreValueSize: 17,
  scoreValueY: 16,

  levelLabelSize: 10,
  levelLabelY: 5,
  levelValueSize: 15,
  levelValueY: 17,

  lifeIcon: 16,
  lifeGap: 8,

  powerIcon: 15,
  powerGap: 5,
  powerPad: 3,
  /** Clear space between the last score digit and the first badge. */
  powerRowGap: 24,

  /**
   * The pause toggle's margin from the bar's right edge.
   *
   * IT USED TO BE AN ABSOLUTE x OF 450, chosen as the one span of the 640-wide
   * bar nothing else reached into. The 480-wide portrait bar has no such span —
   * 450 is underneath the right-anchored lives — so the toggle takes the right
   * edge outright and the lives fall back from it. That is the better place for
   * it on a phone anyway: under the thumb rather than out in the middle.
   */
  pauseMargin: 12,
  pauseIcon: 22,

  /** Clear space between the pause glyph and the last heart. */
  pauseLivesGap: 12,

  /** Drop below the bar's bottom edge for the badge row, when it sits there. */
  powerRowDrop: 6,
};

/**
 * Whether the power-up badges get a line of their own under the bar.
 *
 * FIVE REGIONS DO NOT FIT ACROSS 480 DESIGN PIXELS at the size the portrait bar
 * is now drawn at. Score, badges, level, hearts and the pause toggle fitted
 * comfortably across 640 and fitted across 480 only while everything was small;
 * once the bar grew 35% the badge row reached past the middle and
 * `_applyLevelText` started hiding the level indicator outright — which is one
 * of the three things the enlargement was asked for.
 *
 * So in portrait the badges drop to their own line immediately under the bar,
 * in the band the re-centred painting opened up above the brow, and the level
 * gets the middle of the bar to itself. In landscape they stay inline, where
 * there has always been room and where there is painting immediately below the
 * bar to drop onto.
 */
const POWER_ROW_BELOW = IS_PORTRAIT;

/**
 * A tap target of at least this many CSS pixels, whatever the board's scale.
 *
 * Independent of `HUD.scale` on purpose: the icon can only grow as far as the
 * headroom above the board allows, but the hit area is invisible and can be
 * generous regardless. A phone in landscape has no headroom at all, so its
 * glyph stays small while its target does not.
 */
const TAP_CSS = 48;
const TAP_MAX = 72;

/**
 * Top status bar: score, remaining lives, level, and the power-ups currently
 * ticking down.
 *
 * Only the label text is mutated per frame; the chrome is drawn once per
 * layout. `layout()` is re-run whenever the design box or the HUD scale
 * changes — see GameScene.resize.
 */
export class Hud extends Container {
  constructor() {
    super();
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.bar = new Graphics();
    this.addChild(this.bar);

    this.scoreLabel = makeText('SKOR', { size: M.scoreLabelSize, color: 0x6a7bb5 });
    this.addChild(this.scoreLabel);

    this.scoreValue = makeText('0', { size: M.scoreValueSize, color: 0xffd23f });
    this.addChild(this.scoreValue);

    this.levelLabel = makeText('BÖLÜM', {
      size: M.levelLabelSize,
      color: 0x6a7bb5,
      anchor: [0.5, 0],
    });
    this.addChild(this.levelLabel);

    this.levelValue = makeText('1', { size: M.levelValueSize, color: 0xffffff, anchor: [0.5, 0] });
    this.addChild(this.levelValue);

    this.livesIcons = new Container();
    this.addChild(this.livesIcons);

    // Active power-ups, drawn as their own icons rather than letters. Shares
    // the baked atlas the falling capsules use, so the thing you caught and
    // the thing on the HUD are visibly the same object.
    this.powerIcons = new Container();
    this.addChild(this.powerIcons);

    /** Last values seen, so a re-layout can rebuild from them. */
    this._score = 0;
    this._level = { index: 0, name: '' };
    this._lives = -1;
    this._actives = [];
    this._powerKey = '';
    /** Right edge of the badge row, or 0 when there is no row. */
    this._powerRowRight = 0;

    this.setScore(0);
    this.layout();
  }

  /* ------------------------------------------------------------ layout -- */

  /**
   * The multiplier every metric in `M` is drawn at.
   *
   * One place, because HUD.scale alone is the bug this replaced: it is only
   * half the factor, and a method that forgot HUD_UNIT would draw a
   * correctly-sized bar with landscape-sized glyphs inside it.
   */
  get k() {
    return HUD.scale * HUD_UNIT;
  }

  /** The bar's top edge, which is above y 0 whenever the scale is above 1. */
  get top() {
    return -hudLift();
  }

  /** Vertical centre of the bar, which is what the icon rows sit on. */
  get midY() {
    return (this.top + HUD_H) / 2;
  }

  /**
   * Where the pause toggle goes, in design pixels.
   *
   * Published from here rather than computed in GameScene so that the icon and
   * the lane `_applyLevelText` keeps clear for it can never disagree.
   */
  pauseSlot(viewportScale = 1) {
    const k = this.k;
    const size = M.pauseIcon * k;
    const tap = Math.min(TAP_MAX, Math.max(44, TAP_CSS / (viewportScale || 1)));
    const x = DESIGN.width - (M.pauseMargin + M.pauseIcon / 2) * k;

    return { x, y: this.midY, size, hitW: tap, hitH: Math.max(HUD_H, tap) };
  }

  /**
   * The x the right-anchored heart row grows leftward from.
   *
   * Derived from `pauseSlot` rather than from a margin of its own, so the two
   * right-hand regions of the bar cannot drift apart as the scale changes. On
   * the old 640-wide bar the lives had the right edge to themselves and the
   * pause toggle had its own lane at 450; on 480 they share the corner, and
   * this is the line where one stops and the other starts.
   */
  get livesRight() {
    const { x, size } = this.pauseSlot();
    return x - size / 2 - M.pauseLivesGap * this.k;
  }

  layout() {
    const k = this.k;
    const top = this.top;

    // The bar's own rect is the one thing here measured in HUD_H rather than in
    // k: HUD_H is already the box's authored height, so multiplying it by
    // HUD_UNIT a second time would draw it 39% too tall in portrait.
    this.bar
      .clear()
      .rect(0, top, DESIGN.width, HUD_H - top)
      .fill(0x07070f)
      .rect(0, HUD_H - 2 * HUD.scale, DESIGN.width, 2 * HUD.scale)
      .fill({ color: 0x35d0d8, alpha: 0.55 });

    this.scoreLabel.style.fontSize = M.scoreLabelSize * k;
    this.scoreLabel.position.set(M.pad * k, top + M.scoreLabelY * k);

    this.scoreValue.style.fontSize = M.scoreValueSize * k;
    this.scoreValue.position.set(M.pad * k, top + M.scoreValueY * k);

    this.levelLabel.style.fontSize = M.levelLabelSize * k;
    this.levelLabel.position.set(DESIGN.width / 2, top + M.levelLabelY * k);

    this.levelValue.style.fontSize = M.levelValueSize * k;
    this.levelValue.position.set(DESIGN.width / 2, top + M.levelValueY * k);

    // Power-up badges share the score value's centre line and start a fixed
    // gap past its last digit. Both are read off the live text object rather
    // than hard-coded, so the two stay on one row whatever metrics the font
    // resolves to — the bitmap atlas and the plain-Text fallback in ui.js do
    // not agree on line height, and the score is padded to a fixed six digits
    // so its width never moves once measured.
    const badge = (M.powerIcon + M.powerPad * 2) * k;
    const scoreH = this.scoreValue.height || M.scoreValueSize * k;
    const scoreW = this.scoreValue.width || M.scoreValueSize * k * 3.6;

    if (POWER_ROW_BELOW) {
      // Its own line, hard against the bar's left margin and just under the
      // accent stripe. Nothing else is down here, so there is no measuring to
      // do and no neighbour to yield to.
      this._powerRowX = Math.round(M.pad * k);
      this._powerRowY = Math.round(HUD_H + M.powerRowDrop * k) + M.powerPad * k;
    } else {
      this._powerRowX = Math.round(this.scoreValue.x + scoreW + M.powerRowGap * k);
      // Clamped inside the bar so a tall glyph box cannot push a badge over the
      // accent line along the bar's bottom edge.
      this._powerRowY =
        Math.round(
          Math.min(
            Math.max(this.scoreValue.y + scoreH / 2 - badge / 2, top + 2),
            HUD_H - 2 * k - badge,
          ),
        ) + M.powerPad * k;
    }

    // Both rows are rebuilt rather than rescaled: they are pools of sprites
    // sized at construction, and the caches below are what stop that happening
    // every frame. setPowers finishes by re-measuring the level label, which is
    // why it goes last.
    this._lives = -1;
    this._powerKey = '';
    this.setLives(this._livesValue ?? 0);
    this._powerKey = '';
    this.setPowers(this._actives);
    this._applyLevelText();
  }

  /* -------------------------------------------------------------- state -- */

  setScore(score) {
    this._score = score;
    this.scoreValue.text = String(score).padStart(6, '0');
  }

  setLevel(index, name) {
    this._level = { index, name };
    this._applyLevelText();
  }

  /**
   * Write the level label into whatever room its two neighbours leave it.
   *
   * THE LABEL IS THE PART OF THE BAR THAT YIELDS, and it is worth saying why
   * it is that one. On a phone at scale 1.8 the badge row and the centred
   * level text want the same middle third of the bar: five badges — the most
   * the five timer slots in GameScene can produce — reach x 400, and the level
   * text is centred on 320. Something has to give, and the level name is the
   * only thing up there the player already knows: it was on the transition
   * card a moment ago and it does not change for the rest of the level, while
   * an active power-up is live state that does.
   *
   * SO IT DEGRADES IN THREE STEPS as power-ups accumulate — full name, bare
   * number, nothing — each one measured against the actual rendered width
   * rather than a table of which names fit at which scale. On a desktop the
   * row is narrow enough in design pixels that step one always wins, which is
   * why none of this is visible there.
   */
  _applyLevelText() {
    const { index, name } = this._level;
    const number = String(index + 1);
    const k = this.k;
    const gap = 8 * k;

    // The lane is bounded on the right by the HEART ROW and on the left by
    // whichever of the badge row or the score digits reaches further. It used
    // to be the pause glyph on the right; on the narrow bar the hearts sit
    // between the glyph and the middle, so they are the nearer neighbour.
    const right = this.livesRight - this.livesIcons.width - gap;
    // The badge row is only a neighbour while it shares this line; when it has
    // its own it cannot crowd the level text however many power-ups are up.
    const badgeRight = POWER_ROW_BELOW ? 0 : this._powerRowRight;
    const left = Math.max(badgeRight, this.scoreValue.x + this.scoreValue.width) + gap;

    const centre = DESIGN.width / 2;
    const room = Math.min(centre - left, right - centre);

    const fits = () => this.levelValue.width / 2 <= room;

    this.levelValue.text = name ? `${index + 1}  ${name.toUpperCase()}` : number;
    if (!fits()) this.levelValue.text = number;

    const visible = fits();
    this.levelValue.visible = visible;
    this.levelLabel.visible = visible;
  }

  setLives(lives) {
    this._livesValue = lives;
    if (lives === this._lives) return;
    this._lives = lives;

    const k = this.k;
    const icon = M.lifeIcon * k;
    const gap = M.lifeGap * k;
    const right = this.livesRight;

    for (const sprite of this.livesIcons.removeChildren()) sprite.destroy();

    // One heart per spare life, right-aligned so the row grows leftward — from
    // the pause toggle's left edge rather than the board's, see livesRight.
    for (let i = 0; i < Math.max(0, lives); i++) {
      const heart = new Sprite(TEX.heartIcon);
      heart.anchor.set(0.5);
      heart.width = icon;
      heart.height = icon;
      heart.position.set(right - icon / 2 - i * (icon + gap), this.midY);
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
    this._actives = actives;

    const key = actives.map((a) => a.id).join(',');
    if (key === this._powerKey) return;
    this._powerKey = key;

    for (const child of this.powerIcons.removeChildren()) child.destroy({ children: true });

    if (!actives.length) {
      this._powerRowRight = 0;
      this._applyLevelText();
      return;
    }

    const k = this.k;
    const icon = M.powerIcon * k;
    const pad = M.powerPad * k;
    const size = icon + pad * 2;

    // Left-aligned row — see `_powerRowX` — so the order stays stable left to
    // right as power-ups expire off the end.
    let x = this._powerRowX;
    const y = this._powerRowY;

    for (const def of actives) {
      const texture = ICONS[def.id];
      if (!texture) continue; // atlas not built, or an id with no artwork

      // A dark badge behind each icon. Without it a thin line-art icon at this
      // size, tinted and sitting on the HUD's own near-black bar, is nearly
      // unreadable — the same problem the falling capsules solve with a dark
      // body under their tinted icon (see powerups.js's Capsule), reused here.
      const badge = new Graphics()
        .roundRect(x - pad, y - pad, size, size, 4 * k)
        .fill({ color: 0x0b0f22, alpha: 0.92 })
        .roundRect(x - pad, y - pad, size, size, 4 * k)
        .stroke({ width: 1, color: def.color, alpha: 0.9 });
      this.powerIcons.addChild(badge);

      const sprite = new Sprite(texture);
      sprite.width = icon;
      sprite.height = icon;
      sprite.tint = def.color;
      sprite.position.set(x, y);
      this.powerIcons.addChild(sprite);

      x += size + M.powerGap * k;
    }

    // Minus the trailing gap: the row ends at the last badge, not after it.
    this._powerRowRight = x - M.powerGap * k - pad;
    this._applyLevelText();
  }
}
