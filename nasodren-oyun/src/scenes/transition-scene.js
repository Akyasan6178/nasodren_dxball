import { Sprite, Text } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { DESIGN } from '../game/config.js';
import { TEX } from '../game/textures.js';
import { cosmeticRandom } from '../core/rng.js';

/** Minimum time on screen. Long enough to read a tip even when every asset is already cached. */
const HOLD_SECONDS = 5;

/** Hover bob: how far the centrepiece drifts, and how fast. */
const BOB_AMPLITUDE = 12;
const BOB_SPEED = 2.2; // rad/s

/** Seconds per added dot in the "Loading" cycle, before it wraps back to none. */
const DOT_INTERVAL = 0.4;
const MAX_DOTS = 3;

/** The centrepiece is baked to a fixed design-space size regardless of the source art's own resolution. */
const CENTER_SIZE = 160;

/**
 * One centrepiece per visit, picked at random from this pool — three
 * different transition-screen "photos" rather than three icons crowded onto
 * one screen. `applyImageAssets()` in textures.js has already pointed every
 * one of these keys at its real PNG by the time this runs.
 */
const CENTER_KEYS = ['transitionAsset', 'loadingHeart', 'loadingFlame'];

const TIP_TITLE_Y = 350;
const TIP_BODY_Y = 372;
const TIP_RIGHT_MARGIN = 20;
const TIP_WRAP_WIDTH = 230;

/** Same heavy stroke/shadow treatment on every label here — see heavyText(). */
const FONT_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

/** Shared with revive-scene.js, which tracks its own history against the same list. */
export const TIPS = [
  'Siklamen çiçeği özütü (saponin), burun mukozasında refleks bir etki yaratarak sinüslerde biriken mukusun doğal yollarla atılmasını sağlar.',
  'Siklamen bitkisinin yumrularından elde edilen bu özüt, kana karışmadan sadece lokal olarak burun boşluğunda etki gösterir.',
  'Antik çağlardan beri tıbbi amaçlarla kullanılan siklamen, günümüzde rinosinüzit tedavisinde bitkisel bir çözüm olarak öne çıkmaktadır.',
  'Siklamen özütü uygulandığında, burun içindeki silyaların hareketliliğini artırarak sinüslerin temizlenme sürecini hızlandırır.',
  "Doğada genellikle gölgelik orman altlarında yetişen siklamen, halk arasında 'tavşankulağı' olarak da bilinir.",
];

/**
 * A bold, stroked, drop-shadowed label — plain `Text`, not the shared
 * `makeText` helper: a bitmap font (what `makeText` reaches for once one is
 * installed) is a pre-rasterised atlas with a single fixed look, so it has no
 * way to carry a per-instance stroke or shadow. This scene draws over the
 * darkened background.png (see Phase 1's tint in game-scene.js) and needs
 * every label to stay readable against whatever busy artwork is behind it,
 * which is exactly what the outline + shadow are for.
 *
 * Exported for revive-scene.js, which wants the exact same treatment for its
 * own redesigned tip text rather than a second copy of this recipe.
 */
export function heavyText(text, { size = 20, color = 0xffffff, align = 'left', wordWrapWidth = 0 } = {}) {
  return new Text({
    text,
    style: {
      fontFamily: FONT_STACK,
      fontSize: size,
      fontWeight: '900',
      fill: color,
      stroke: { color: 0x000000, width: Math.max(3, Math.round(size * 0.22)) },
      dropShadow: { color: 0x000000, alpha: 0.65, blur: 3, distance: 3, angle: Math.PI / 2 },
      align,
      wordWrap: wordWrapWidth > 0,
      wordWrapWidth,
    },
  });
}

/**
 * Between-scenes hold: shown while starting a run and between levels, so the
 * player always gets a beat to read a tip even though every asset here is
 * already in the Assets cache by the time this runs (see textures.js —
 * `applyImageAssets()` populates `TEX.transitionAsset` during the boot
 * preload) and would otherwise flash past in a single frame.
 *
 * Usage: `sm.change(TransitionScene, { next: SomeScene, params: {...} })`.
 * `next`/`params` describe the scene to hand off to once `HOLD_SECONDS` has
 * elapsed — this scene never knows or cares what that scene is.
 */
export class TransitionScene extends Scene {
  enter() {
    const { next, params = {} } = this.params;
    this._next = next;
    this._nextParams = params;
    this._elapsed = 0;
    this._dotTimer = 0;
    this._dotCount = 0;

    this._buildAsset();
    this._buildLoadingText();
    this._buildTip();
  }

  _buildAsset() {
    const key = CENTER_KEYS[Math.floor(cosmeticRandom() * CENTER_KEYS.length)];

    const sprite = new Sprite(TEX[key]);
    sprite.anchor.set(0.5);
    sprite.scale.set(CENTER_SIZE / sprite.texture.width);
    sprite.position.set(DESIGN.width / 2, DESIGN.height / 2);
    this.view.addChild(sprite);

    this.asset = sprite;
    this._baseY = sprite.y;
  }

  _buildLoadingText() {
    const text = heavyText('Loading', { size: 22, color: 0xffffff, align: 'center' });
    text.anchor.set(0.5);
    text.position.set(DESIGN.width / 2, DESIGN.height - 26);
    this.view.addChild(text);
    this.loadingText = text;
  }

  _buildTip() {
    const tip = TIPS[Math.floor(cosmeticRandom() * TIPS.length)];

    const title = heavyText('TIP:', { size: 14, color: 0x35d0d8 });
    title.anchor.set(1, 0);
    title.position.set(DESIGN.width - TIP_RIGHT_MARGIN, TIP_TITLE_Y);
    this.view.addChild(title);

    const body = heavyText(tip, {
      size: 13,
      color: 0xffffff,
      align: 'right',
      wordWrapWidth: TIP_WRAP_WIDTH,
    });
    body.anchor.set(1, 0);
    body.position.set(DESIGN.width - TIP_RIGHT_MARGIN, TIP_BODY_Y);
    this.view.addChild(body);
  }

  update(dt) {
    this._elapsed += dt;

    this.asset.y = this._baseY + Math.sin(this._elapsed * BOB_SPEED) * BOB_AMPLITUDE;

    this._dotTimer += dt;
    while (this._dotTimer >= DOT_INTERVAL) {
      this._dotTimer -= DOT_INTERVAL;
      this._dotCount = (this._dotCount + 1) % (MAX_DOTS + 1);
      this.loadingText.text = 'Loading' + '.'.repeat(this._dotCount);
    }

    if (this._elapsed >= HOLD_SECONDS) {
      this.ctx.sm.change(this._next, this._nextParams);
    }
  }
}
