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
 *
 * `loading1` is the virus, `loading2` the heart, `loading3` the cyclamen
 * flower — the same order `TIPS_BY_KEY` below keys its tip pools by, so
 * whichever centrepiece a visit lands on, the tip shown under it is always
 * about that same thing rather than any of the other two.
 */
const CENTER_KEYS = ['loading1', 'loading2', 'loading3'];

/**
 * The tip block, measured DOWN FROM THE BOTTOM OF THE CENTREPIECE rather than
 * from either edge of the board.
 *
 * IT USED TO BE A RIGHT-HAND COLUMN — anchored to `DESIGN.width - 20`, wrapped
 * at 230, sitting beside the centrepiece. That works on a 640-wide board and
 * not at all on a 480-wide one: a 230px column next to a 160px centrepiece
 * leaves the two overlapping. So the tip is centred UNDER the art in both
 * boxes, which is how a portrait screen reads it anyway — top to bottom rather
 * than left to right.
 *
 * MEASURING FROM THE ART IS WHAT MAKES ONE LAYOUT SERVE BOTH BOXES. The art is
 * centred on the box, so this lands the title at y 354 on the 480-tall
 * landscape board — within 4px of the 350 it was authored at — and at y 541 on
 * the 854-tall portrait one, in both cases clear of a four-line body and of
 * the loading caption 26px off the floor.
 */
const ART_CLEARANCE = CENTER_SIZE / 2 + BOB_AMPLITUDE + 22;
const TIP_LINE_GAP = 22;
const TIP_WRAP_WIDTH = 400;

/** Where the tip title sits, for the board's current height. */
const tipTitleY = () => DESIGN.height / 2 + ART_CLEARANCE;

/**
 * Same heavy stroke/shadow treatment on every label here — see heavyText().
 * Oxanium first, same fallback stack as ui.js if it never loads — see the
 * @font-face in style.css and the preload in main.js.
 */
const FONT_STACK = 'Oxanium, ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

/**
 * Cyclamen tips — shown under `loading3` (the cyclamen flower).
 *
 * Shared with revive-scene.js, which tracks its own history against this
 * same list: ReviveScene's centrepiece is always the cyclamen (siklement.png),
 * so it never needed a per-image pool of its own the way TransitionScene now
 * does — see `TIPS_BY_KEY` below.
 */
export const TIPS = [
  'Siklamen çiçeği özütü (saponin), burun mukozasında refleks bir etki yaratarak sinüslerde biriken mukusun doğal yollarla atılmasını sağlar.',
  'Siklamen bitkisinin yumrularından elde edilen bu özüt, kana karışmadan sadece lokal olarak burun boşluğunda etki gösterir.',
  'Antik çağlardan beri tıbbi amaçlarla kullanılan siklamen, günümüzde rinosinüzit tedavisinde bitkisel bir çözüm olarak öne çıkmaktadır.',
  'Siklamen özütü uygulandığında, burun içindeki silyaların hareketliliğini artırarak sinüslerin temizlenme sürecini hızlandırır.',
  "Doğada genellikle gölgelik orman altlarında yetişen siklamen, halk arasında 'tavşankulağı' olarak da bilinir.",
];

/** Sinüzit, iltihap ve virüsler — shown under `loading1` (the virus). */
const TIPS_VIRUS = [
  'Sinüzit, burun ve sinüs boşluklarını kaplayan mukozanın iltihaplanmasıdır; vakaların büyük bölümü bir üst solunum yolu virüsüyle başlar.',
  'Virüsler sinüs kanallarının iç yüzeyindeki mukozayı şişirerek doğal drenaj açıklıklarını daraltır ve mukusun içeride birikmesine yol açar.',
  'Akut viral sinüzit genellikle 7-10 gün içinde kendiliğinden geriler; belirtilerin bu sürenin ötesinde şiddetlenmesi bakteriyel bir sürece işaret edebilir.',
];

/** Genel vücut sağlığı, yorgunluk ve bağışıklık — shown under `loading2` (the heart). */
const TIPS_HEART = [
  'Kronikleşen sinüzit, bağışıklık sisteminin sürekli düşük düzeyde iltihapla uğraşmasına yol açarak günlük enerji seviyesini düşürebilir.',
  'Sinüs tıkanıklığı gece boyunca rahat nefes almayı zorlaştırır; bozulan uyku kalitesi ertesi gün hissedilen yorgunluğun başlıca sebeplerindendir.',
  'Güçlü ve dengeli bir bağışıklık sistemi, sinüslerdeki mukus birikimini daha hızlı temizleyerek iltihabın kronikleşmesini önlemede kilit rol oynar.',
];

/** Which tip pool belongs under which centrepiece — see CENTER_KEYS above. */
const TIPS_BY_KEY = {
  loading1: TIPS_VIRUS,
  loading2: TIPS_HEART,
  loading3: TIPS,
};

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
 * `applyImageAssets()` populates `TEX.loading1` during the boot preload) and
 * would otherwise flash past in a single frame.
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

    // Picked once, here, rather than separately in `_buildAsset` and
    // `_buildTip` — the tip has to match whichever centrepiece this visit
    // actually shows, not an independent roll of its own. See TIPS_BY_KEY.
    this._centerKey = CENTER_KEYS[Math.floor(cosmeticRandom() * CENTER_KEYS.length)];

    this._buildAsset();
    this._buildLoadingText();
    this._buildTip();
  }

  _buildAsset() {
    const sprite = new Sprite(TEX[this._centerKey]);
    sprite.anchor.set(0.5);
    sprite.scale.set(CENTER_SIZE / sprite.texture.width);
    sprite.position.set(DESIGN.width / 2, DESIGN.height / 2);
    this.art = sprite;
    this.view.addChild(sprite);

    this.asset = sprite;
    this._baseY = sprite.y;
  }

  _buildLoadingText() {
    const text = heavyText('Yükleniyor', { size: 22, color: 0xffffff, align: 'center' });
    text.anchor.set(0.5);
    text.position.set(DESIGN.width / 2, DESIGN.height - 26);
    this.caption = text;
    this.view.addChild(text);
    this.loadingText = text;
  }

  _buildTip() {
    const pool = TIPS_BY_KEY[this._centerKey];
    const tip = pool[Math.floor(cosmeticRandom() * pool.length)];

    const title = heavyText('İPUCU:', { size: 14, color: 0x35d0d8, align: 'center' });
    title.anchor.set(0.5, 0);
    title.position.set(DESIGN.width / 2, tipTitleY());
    this.tipTitle = title;
    this.view.addChild(title);

    const body = heavyText(tip, {
      size: 13,
      color: 0xffffff,
      align: 'center',
      wordWrapWidth: TIP_WRAP_WIDTH,
    });
    body.anchor.set(0.5, 0);
    body.position.set(DESIGN.width / 2, tipTitleY() + TIP_LINE_GAP);
    this.tipBody = body;
    this.view.addChild(body);
  }

  /**
   * The design box changed shape — see SceneManager.resize. Only the pieces
   * measured from the board's floor need moving; everything laid out from the
   * top is already where it belongs.
   */
  resize() {
    // All four re-read rather than one: the art is centred on the box, so it
    // moves with the floor even though it is not anchored to it, and the tip
    // block is measured up from the floor outright.
    this.art.y = DESIGN.height / 2;
    // The bob in update() reads this, so a resize that forgot it would snap the
    // centrepiece back to the old floor on the very next frame.
    this._baseY = this.art.y;
    this.caption.y = DESIGN.height - 26;
    this.tipTitle.y = tipTitleY();
    this.tipBody.y = tipTitleY() + TIP_LINE_GAP;
  }

  update(dt) {
    this._elapsed += dt;

    this.asset.y = this._baseY + Math.sin(this._elapsed * BOB_SPEED) * BOB_AMPLITUDE;

    this._dotTimer += dt;
    while (this._dotTimer >= DOT_INTERVAL) {
      this._dotTimer -= DOT_INTERVAL;
      this._dotCount = (this._dotCount + 1) % (MAX_DOTS + 1);
      this.loadingText.text = 'Yükleniyor' + '.'.repeat(this._dotCount);
    }

    if (this._elapsed >= HOLD_SECONDS) {
      this.ctx.sm.change(this._next, this._nextParams);
    }
  }
}
