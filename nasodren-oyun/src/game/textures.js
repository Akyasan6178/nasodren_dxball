import { Assets, Graphics } from 'pixi.js';
import { BRICK, BRICK_W, BRICK_H, COLORS, BALL, CYCLAMEN, LASER } from './config.js';

/**
 * Runtime texture atlas.
 *
 * Every visual in the game is drawn once with Graphics primitives at boot, then
 * baked to a GPU texture via `renderer.generateTexture`. From that point on the
 * game only ever draws Sprites, which batch aggressively and keep the draw call
 * count flat even with hundreds of bricks, particles and balls on screen.
 *
 * If you later add real spritesheets, load them with Assets and overwrite the
 * matching keys here — nothing else in the codebase needs to change.
 */
export const TEX = {};

const BAKE_RESOLUTION = 2; // render at 2x so the art stays crisp when scaled up

function bake(renderer, g) {
  const texture = renderer.generateTexture({
    target: g,
    resolution: BAKE_RESOLUTION,
    antialias: true,
  });
  g.destroy();
  return texture;
}

function shade(color, amount) {
  const r = (color >> 16) & 0xff;
  const gg = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c) =>
    Math.max(0, Math.min(255, Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount))));
  return (mix(r) << 16) | (mix(gg) << 8) | mix(b);
}

/**
 * A mucus cell: a soft-edged translucent capsule, lit from the top-left.
 *
 * This replaced the arcade bevel — a hard rectangle with a light wedge, a dark
 * wedge and a black outline — and the replacement is not a matter of taste. The
 * board around it is now all sweeping neon curves, and a grid of hard-cornered
 * boxes in the middle of that reads as two games layered on top of each other.
 * A rounded capsule at BRICK.alpha sits in the same world as the strokes.
 *
 * THE SHADING IS BUILT FROM INSET COPIES, not from wedges. A bevel needs
 * corners to catch the light, and this shape has none; what sells volume on a
 * capsule is a bright rim along the top edge and the body darkening as it falls
 * away, which is three concentric round-rects and no polygon maths.
 *
 * Alpha lives on the texture rather than on the Sprite so `Brick.alpha` stays
 * free for what already owns it — the Sneeze loosening survivors, and a
 * buffed cell's permanent breathing pulse (see BUFF_PULSE in config.js).
 */
function brickFace(color, opts = {}) {
  const {
    speckle = true,
    radius = BRICK.radius,
    alpha = BRICK.alpha,
    shape = 'full',
  } = opts;

  // The box this variant fills inside its cell. Only the size matters here —
  // where it sits in the cell is the Brick's business, not the texture's.
  const box = BRICK.shapes[shape];
  const w = BRICK_W * box.w;
  const h = BRICK_H * box.h;
  const g = new Graphics();

  // Body.
  g.roundRect(0, 0, w, h, radius).fill({ color, alpha });

  // Top-left light: an inset copy, pulled up and brightened.
  g.roundRect(1.5, 1, w - 3, h * 0.52, radius - 1)
    .fill({ color: shade(color, 0.42), alpha: alpha * 0.85 });

  // The rim highlight — a thin bright arc along the top, which is the single
  // cue that makes a flat capsule read as a wet one.
  g.roundRect(2.5, 1.5, w - 5, h * 0.3, radius - 1.5)
    .fill({ color: shade(color, 0.7), alpha: alpha * 0.7 });

  // Underside shadow, so the cell has a bottom.
  g.roundRect(2, h * 0.62, w - 4, h * 0.34, radius - 1.5)
    .fill({ color: shade(color, -0.4), alpha: alpha * 0.5 });

  if (speckle) {
    // Two faint blebs rather than scanlines: a stripe reads as machined, a
    // couple of soft spots read as something suspended in fluid.
    g.circle(w * 0.3, h * 0.66, 2.1).fill({ color: 0xffffff, alpha: 0.09 });
    g.circle(w * 0.68, h * 0.4, 1.5).fill({ color: 0xffffff, alpha: 0.07 });
  }

  // Membrane. Brighter than the body and drawn last, so overlapping cells stay
  // individually countable at a glance even at this alpha.
  g.roundRect(0.6, 0.6, w - 1.2, h - 1.2, radius - 0.6)
    .stroke({ width: 1.1, color: shade(color, 0.55), alpha: Math.min(1, alpha + 0.2) });

  return g;
}

/**
 * The one indestructible surface in the game — metal was retired once bone
 * took over the role entirely, so this has no sibling to stay distinct from
 * any more and can afford to be loud about it.
 *
 * Ivory body with the same porous cancellous texture as before, but now
 * rimmed in a stacked cyan glow: several inset strokes fading outward plus
 * one crisp bright edge, all the same accent the rest of the UI already
 * reserves for "this matters" (title text, TIP labels, wall edges). An
 * unbreakable cell reads as special in a vocabulary the player already
 * knows, rather than a colour invented just for this brick.
 *
 * EVERYTHING STAYS INSIDE THE CELL'S OWN BOX. A glow that bled past `w`/`h`
 * would expand `generateTexture`'s bounds, and `Brick` scales this texture
 * uniformly onto `bw`/`bh` — a wider baked canvas would shrink the visible
 * body to make room for the bleed, exactly the mistake the ball's glow
 * avoids by living on its own separate sprite instead. Insetting the rings
 * gets the same energised-edge read without that risk.
 */
function boneFace() {
  const w = BRICK_W;
  const h = BRICK_H;
  const radius = BRICK.radius * 0.6;
  const glowColor = 0x35d0d8;

  const g = brickFace(0xe6ddc6, { speckle: false, alpha: 1, radius });

  // Cancellous pores: small dark voids scattered across the face. The one
  // texture cue that reads as bone rather than as painted stone.
  const pores = [
    [w * 0.22, h * 0.32, 1.1],
    [w * 0.62, h * 0.22, 0.9],
    [w * 0.42, h * 0.55, 1.3],
    [w * 0.78, h * 0.58, 1.0],
    [w * 0.14, h * 0.68, 0.8],
    [w * 0.56, h * 0.78, 1.0],
  ];
  for (const [px, py, pr] of pores) {
    g.circle(px, py, pr).fill({ color: 0x8a7f68, alpha: 0.4 });
  }

  // The glow: a few progressively inset rings, widest and faintest first, so
  // they read as a soft light bleeding in from the edge rather than as a
  // hard band, then one crisp bright line exactly on the boundary.
  for (let i = 3; i >= 1; i--) {
    const inset = i * 1.3;
    g.roundRect(inset, inset, w - inset * 2, h - inset * 2, Math.max(0, radius - inset))
      .stroke({ width: 1.4, color: glowColor, alpha: 0.16 });
  }
  g.roundRect(0.5, 0.5, w - 1, h - 1, radius).stroke({ width: 1.8, color: glowColor, alpha: 0.95 });

  return g;
}

/**
 * A damage decal, laid over a brick that has taken at least one hit but
 * survived it. The HP-tier art alone (brick1/2/3.png) already changes which
 * image a brick shows, but the three tiers read close enough in colour that
 * a player mid-rally was missing the swap — this is the second, unmissable
 * cue layered on top: real cracks, not just a different shade of pill.
 *
 * Baked at one fixed full-cell size regardless of which shape actually wears
 * it. `Brick._updateCrack` stretches the sprite onto `bw`/`bh` exactly like
 * it already does for the tier texture, so a half or small cell gets the
 * same crack, proportionally squashed — consistent with how the tier art
 * itself is fit to every shape now.
 *
 * `level` 1 is one hairline seam (one hit taken); `level` 2 is a wider spread
 * plus a second seam (two or more taken), so the decal itself communicates
 * how close the cell is to breaking, not just that it is damaged at all.
 */
function crackOverlay(level) {
  const w = BRICK_W;
  const h = BRICK_H;
  const g = new Graphics();

  const seams =
    level === 1
      ? [[w * 0.34, 2, w * 0.46, h - 3]]
      : [
          [w * 0.3, 2, w * 0.44, h - 3],
          [w * 0.62, 1, w * 0.5, h - 2],
          [w * 0.72, h * 0.4, w * 0.9, h - 4],
        ];

  for (const [x1, y1, x2, y2] of seams) {
    // A slight kink partway along each seam, not a straight cut — a real
    // fracture does not run in one line.
    const mx = (x1 + x2) / 2 + (level === 1 ? 2.5 : -2);
    const my = (y1 + y2) / 2;

    g.moveTo(x1, y1).lineTo(mx, my).lineTo(x2, y2).stroke({ width: 1.6, color: 0x000000, alpha: 0.6 });
    g.moveTo(x1, y1).lineTo(mx, my).lineTo(x2, y2).stroke({ width: 0.6, color: 0x000000, alpha: 0.9 });
  }

  // A faint overall darkening so a damaged cell reads as bruised even at a
  // glance that misses the seams themselves.
  g.roundRect(0, 0, w, h, BRICK.radius).fill({ color: 0x000000, alpha: level === 1 ? 0.08 : 0.16 });

  return g;
}

/** Fake radial falloff by stacking translucent circles — no filter, no cost. */
function radialGlow(radius, color, steps = 14) {
  const g = new Graphics();
  for (let i = steps; i > 0; i--) {
    const t = i / steps;
    g.circle(radius, radius, radius * t).fill({ color, alpha: 0.055 * (1 - t) + 0.02 });
  }
  return g;
}

function ballFace() {
  const r = BALL.radius;
  const g = new Graphics();
  g.circle(r + 1, r + 1, r).fill(0xdff6ff);
  g.circle(r + 1, r + 1, r).stroke({ width: 1, color: 0x8fd8ff, alpha: 0.9 });
  g.circle(r * 0.62 + 1, r * 0.6 + 1, r * 0.34).fill({ color: 0xffffff, alpha: 0.95 });
  return g;
}

/**
 * The logical radius the cyclamen is drawn at before baking.
 *
 * Nothing to do with BALL.radius, and much larger than it. The ball is ten
 * pixels across; five petals, a throat and a highlight drawn at that size are
 * an unreadable smudge, and BAKE_RESOLUTION alone cannot fix it because the
 * tessellator is working from five-pixel curves in the first place. So the
 * flower is drawn big, baked big, and scaled down by the Sprite — downsampling
 * a large texture is what the GPU's filtering is for, and it costs nothing at
 * draw time. ball.js derives its scale from the baked texture's own width, so
 * this number can move without anything else needing to know.
 */
export const CYCLAMEN_BAKE_R = 30;

/**
 * A stylised top-down cyclamen.
 *
 * Five petals swept back from the centre, which is the flower's one unmistakable
 * feature — a real cyclamen's petals reflex upward and away, so from above it
 * reads as a pinwheel rather than as a daisy. Each petal is an ellipse pushed
 * out along its own axis and rotated into place, with a second smaller ellipse
 * lapped over its base to fill the gap at the throat.
 *
 * `pale` bakes the identical geometry in white with the colour carried only as
 * luminance. That variant exists for the power-up states: `Ball.refreshTint`
 * multiplies a tint over the sprite, and multiplying Fire's orange over a
 * magenta flower gives brown. Swapping to the pale bake means a tinted ball is
 * the tint's colour exactly, at the shape's own shading — see ball.js.
 */
function cyclamenFlower(pale = false) {
  const R = CYCLAMEN_BAKE_R;
  const c = R + 2; // centre, with room for the outer stroke
  const g = new Graphics();

  const petal = pale ? 0xffffff : CYCLAMEN.petal;
  const throat = pale ? 0xb4b4b4 : CYCLAMEN.throat;

  // Semi-axes of one petal: long axis outward, short axis across.
  const along = R * 0.5;
  const across = R * 0.3;
  const dist = R * 0.46;
  const SEGMENTS = 20;

  for (let i = 0; i < CYCLAMEN.petals; i++) {
    const a = (i / CYCLAMEN.petals) * Math.PI * 2 - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pts = [];

    // Built as an explicit rotated polygon rather than `ellipse()`, because
    // Pixi's ellipse is axis-aligned and these have to point outward — five
    // upright ellipses arranged in a ring read as a daisy, and a cyclamen's
    // whole silhouette is the pinwheel its reflexed petals make from above.
    for (let s = 0; s < SEGMENTS; s++) {
      const t = (s / SEGMENTS) * Math.PI * 2;

      // Taper across the petal's own length: full width at the tip, pinched to
      // 45% at the base, so the five shapes meet the throat instead of
      // colliding with each other around it.
      const taper = 0.45 + 0.55 * ((Math.cos(t) + 1) / 2);

      const u = dist + Math.cos(t) * along;
      const v = Math.sin(t) * across * taper;

      pts.push(c + u * ca - v * sa, c + u * sa + v * ca);
    }

    g.poly(pts).fill({ color: petal, alpha: 0.97 });
  }

  // The throat, lapped over every petal base so the five ellipses read as one
  // flower instead of as five separate blobs meeting at the middle.
  g.circle(c, c, R * 0.34).fill({ color: throat, alpha: 0.95 });
  g.circle(c, c, R * 0.16).fill({ color: pale ? 0xffffff : 0xffd9f0, alpha: 0.95 });

  // Off-centre specular, the same lighting the old ball had. Keeps the flower
  // reading as a lit object rather than as a flat icon at ten pixels across.
  g.circle(c - R * 0.16, c - R * 0.2, R * 0.13).fill({ color: 0xffffff, alpha: 0.75 });

  return g;
}

/**
 * A single petal, for the brick-break spray. White, like every other particle
 * texture, so `Particles` can draw each one's colour from PETAL.colors.
 *
 * Asymmetric on purpose: wider at the base than the tip, which is what makes a
 * tumbling one read as a petal rather than as a rotating pill.
 */
function petalShape() {
  const g = new Graphics();
  g.ellipse(7, 5, 6.5, 4).fill(0xffffff);
  g.ellipse(3.5, 5, 3.5, 2.4).fill({ color: 0xffffff, alpha: 0.85 });
  return g;
}

/**
 * A teardrop, for mucus.
 *
 * Replaces the stretched circle the droplets preset used to borrow from
 * TEX.spark. A circle squashed by MUCUS.aspect is symmetrical top to bottom,
 * which is the one thing a falling droplet is not; giving it a tapered top
 * costs the same single sprite and reads as surface tension. The preset's
 * `spin: 0` is what keeps that taper pointing the right way.
 */
function dropletShape() {
  const g = new Graphics();
  g.circle(6, 7.5, 4.5).fill(0xffffff);
  g.poly([6, 0, 9.6, 8, 2.4, 8]).fill(0xffffff);
  g.circle(4.6, 6.2, 1.5).fill({ color: 0xffffff, alpha: 0.55 });
  return g;
}

/**
 * Bakes the full atlas. Call once, after the renderer exists.
 * @param {import('pixi.js').Renderer} renderer
 */
export function buildTextures(renderer) {
  // Every palette colour in every SHAPE VARIANT — halfLeft/halfRight/small
  // only, not full. A full-shape standard cell goes through the HP tier
  // system below instead (see textureKeyFor), so a per-colour full-cell bake
  // would never be read; a half-width cell is not a squashed full one either
  // way — its corner radius, rim highlight and membrane all have to stay the
  // same physical size, or the small clumps read as a different material.
  const shapeVariants = Object.keys(BRICK.shapes).filter((s) => s !== 'full');
  COLORS.forEach((color, i) => {
    for (const shape of shapeVariants) {
      TEX[brickKey(i, shape)] = bake(renderer, brickFace(color, { shape }));
    }
  });

  // HP-tier fallbacks for the standard full-cell brick — see textureKeyFor.
  // This is only ever seen if brick1/2/3.png fail to load;
  // `applyImageAssets()` overwrites all three keys with the real art the
  // moment the preload bundle resolves.
  TEX.brickTier1 = bake(renderer, brickFace(0x35d0d8));
  TEX.brickTier2 = bake(renderer, brickFace(0xffd23f));
  TEX.brickTier3 = bake(renderer, brickFace(0xff4d5a));

  TEX.brickBone = bake(renderer, boneFace());

  TEX.crack1 = bake(renderer, crackOverlay(1));
  TEX.crack2 = bake(renderer, crackOverlay(2));

  // TransitionScene's two flanking loading icons. Same fallback contract as
  // everything else in this file: a plain baked placeholder until
  // `applyImageAssets()` swaps in loading2.png/loading3.png.
  TEX.loading2 = bake(renderer, new Graphics().roundRect(0, 0, 40, 40, 10).fill(0xff4d5a));
  TEX.loading3 = bake(renderer, new Graphics().roundRect(0, 0, 40, 40, 10).fill(0xffd23f));

  // HUD life icon and the paddle skin. Same fallback contract as everything
  // else — a plain baked placeholder until heart.png/platform.png land.
  TEX.heartIcon = bake(renderer, new Graphics().circle(10, 10, 9).fill(0xff4d5a));
  TEX.paddleSkin = bake(renderer, new Graphics().roundRect(0, 0, 88, 14, 7).fill(0x35d0d8));

  // The HUD pause/resume toggle. Same fallback contract — a plain baked
  // placeholder until pause.png/continue.png land.
  TEX.pauseIcon = bake(renderer, new Graphics().roundRect(0, 0, 20, 20, 5).fill(0x35d0d8));
  TEX.continueIcon = bake(renderer, new Graphics().roundRect(0, 0, 20, 20, 5).fill(0x86e05a));

  TEX.ball = bake(renderer, ballFace());
  TEX.glow = bake(renderer, radialGlow(28, 0xffffff));

  // The cyclamen, in two bakes: the flower in its own colours for the default
  // ball, and a white one for every state that tints. See ball.js.
  //
  // This is the fallback: `applyImageAssets()` overwrites both keys with the
  // real cyclamen-ball.png once it lands, so these only ever appear if that
  // load fails.
  TEX.cyclamenBall = bake(renderer, cyclamenFlower(false));
  TEX.cyclamenBallPale = bake(renderer, cyclamenFlower(true));

  // ReviveScene's centrepiece. Same fallback contract as everything else in
  // this file: the procedural flower stands in until siklement.png lands.
  TEX.siklement = bake(renderer, cyclamenFlower(false));

  TEX.petal = bake(renderer, petalShape());
  TEX.droplet = bake(renderer, dropletShape());

  const particle = new Graphics().roundRect(0, 0, 5, 5, 1.5).fill(0xffffff);
  TEX.particle = bake(renderer, particle);

  const laser = new Graphics();
  laser.rect(0, 0, LASER.w, LASER.h).fill(0xff5a7a);
  laser.rect(LASER.w * 0.35, 1, LASER.w * 0.3, LASER.h - 2).fill(0xffffff);
  TEX.laser = bake(renderer, laser);

  const spark = new Graphics().circle(4, 4, 4).fill(0xffffff);
  TEX.spark = bake(renderer, spark);

  // Thin streak, for high-velocity impact sparks. Stretching a circle looks
  // like a smear; a purpose-built capsule reads as a spark.
  const streak = new Graphics().roundRect(0, 0, 14, 3, 1.5).fill(0xffffff);
  TEX.streak = bake(renderer, streak);

  // Four irregular shards so brick debris never reads as a grid of identical
  // squares. Baked once and picked at random per fragment.
  const SHARDS = [
    [0, 0, 9, 2, 7, 8, 1, 6],
    [1, 0, 8, 3, 4, 9, 0, 5],
    [0, 2, 6, 0, 9, 6, 3, 9],
    [2, 0, 9, 4, 5, 9, 0, 7],
  ];
  SHARDS.forEach((pts, i) => {
    TEX[`shard${i}`] = bake(renderer, new Graphics().poly(pts).fill(0xffffff));
  });

  return TEX;
}

/**
 * Phase 1 of the visual reskin: swap the procedural bakes for real artwork.
 *
 * Called from boot-scene.js once the `preload` bundle (see core/assets.js)
 * has resolved, so `background.png`, `cyclamen-ball.png` and `loading1.png`
 * (one of the transition-scene centrepieces) are all already in the Assets
 * cache before any scene constructs a Sprite from these keys.
 *
 * `TEX.cyclamenBall` and `TEX.cyclamenBallPale` both point at the same
 * texture — there is only one piece of ball artwork, not a separate
 * white/tintable variant like the two procedural bakes had. `ball.js` still
 * swaps between the two keys for its power-up states; the swap is just a
 * no-op now; the tint colour itself still changes.
 *
 * Guarded so a failed or still-pending load falls back to the baked
 * placeholder from `buildTextures()` instead of handing a scene an
 * undefined texture. `TEX.loading1` has no baked fallback — it is new
 * artwork with nothing to fall back to — so TransitionScene must only ever
 * run after this has had a chance to set it.
 */
export function applyImageAssets() {
  const background = Assets.get('background');
  if (background) TEX.background = background;

  // The red congestion overlay — see GameScene._buildField/_updateBgCrossfade.
  // No baked fallback, same as `background` above: it is a full-screen
  // photograph with nothing procedural to stand in for it.
  const bgRed = Assets.get('bgRed');
  if (bgRed) TEX.bgRed = bgRed;

  const cyclamenBall = Assets.get('cyclamenBall');
  if (cyclamenBall) {
    TEX.cyclamenBall = cyclamenBall;
    TEX.cyclamenBallPale = cyclamenBall;
  }

  const loading1 = Assets.get('loading1');
  if (loading1) TEX.loading1 = loading1;

  // The HP-tier art. Same fallback contract as the two above: each key keeps
  // its baked placeholder colour until its real PNG lands.
  const brickTier1 = Assets.get('brickTier1');
  if (brickTier1) TEX.brickTier1 = brickTier1;
  const brickTier2 = Assets.get('brickTier2');
  if (brickTier2) TEX.brickTier2 = brickTier2;
  const brickTier3 = Assets.get('brickTier3');
  if (brickTier3) TEX.brickTier3 = brickTier3;

  const loading2 = Assets.get('loading2');
  if (loading2) TEX.loading2 = loading2;
  const loading3 = Assets.get('loading3');
  if (loading3) TEX.loading3 = loading3;

  const siklement = Assets.get('siklement');
  if (siklement) TEX.siklement = siklement;

  const heartIcon = Assets.get('heartIcon');
  if (heartIcon) TEX.heartIcon = heartIcon;
  const paddleSkin = Assets.get('paddleSkin');
  if (paddleSkin) TEX.paddleSkin = paddleSkin;

  const pauseIcon = Assets.get('pauseIcon');
  if (pauseIcon) TEX.pauseIcon = pauseIcon;
  const continueIcon = Assets.get('continueIcon');
  if (continueIcon) TEX.continueIcon = continueIcon;
}


/** Atlas key for a standard cell. `full` keeps the original bare key. */
export const brickKey = (colorIndex, shape) =>
  shape === 'full' ? `brick${colorIndex}` : `brick${colorIndex}_${shape}`;

/** Which HP maps to which tier image — 1 hit left, 2, or 3-and-up. */
function tierKeyFor(hits) {
  if (hits <= 1) return 'brickTier1';
  if (hits === 2) return 'brickTier2';
  return 'brickTier3';
}

/**
 * Maps a level-file character to its texture key. Only two kinds exist —
 * standard and bone, see bricks.js's CHAR_MAP — so this is a short rule
 * rather than the wider dispatch it used to be.
 *
 * EVERY STANDARD CELL RESOLVES BY HP, WHATEVER SHAPE IT IS. It used to be only
 * full cells: half and small variants stayed on the palette-coloured bakes,
 * because those were the only textures actually cut to the smaller boxes. That
 * split stopped being tenable the moment the layouts were rebuilt inside the
 * sinus tracts. The antrum is one column wide at the roof and four at the
 * floor, so most of the board is now half and small cells — and a level was
 * ending up half hand-drawn Graphics and half photographic brick art, side by
 * side in the same clump. One material, or the level does not read as one
 * surface.
 *
 * Squashing a 93x45 source into a 23x18 half cell does distort it, and that is
 * the price. `Brick` reapplies `width`/`height` on every tier swap, so the fit
 * is handled; what it cannot do is preserve the aspect. Cropping a frame out of
 * the source instead would keep it, at the cost of slicing through the art's
 * own rounded edges — worth revisiting if the squash reads badly at speed.
 *
 * A standard cell resolves by its CURRENT `hits` every time
 * `refreshDamage`/`applyBuff` calls in, which is exactly the information the
 * tier art carries. Bone keeps its own fixed texture regardless of hits,
 * because it is never meant to look like it is running low — it never is.
 *
 * The palette-coloured shape bakes are still built in `buildTextures()` and are
 * now unreferenced by this function. They are deliberately not deleted: they
 * are the only art cut to the true half/small boxes, so they are what a crop-
 * based fix would be measured against.
 */
export function textureKeyFor(kind, colorIndex, shape = 'full', hits = 1) {
  if (kind === 'bone') return 'brickBone';
  return tierKeyFor(hits);
}
