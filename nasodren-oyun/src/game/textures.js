import { Graphics } from 'pixi.js';
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
 * free for what already owns it — invisible bricks fading in, and the Sneeze
 * loosening survivors. Two independent things writing one property is how the
 * reveal ends up cancelling the reflex.
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

function metalFace() {
  const w = BRICK_W;
  const h = BRICK_H;

  // Opaque, and the only brick that is. Metal is not mucus — it is the one
  // thing on the board the fluid never dissolves, and reading it as solid
  // against everything else being translucent is exactly the information the
  // player needs before they waste a rally on it.
  const g = brickFace(0x8a92a8, { speckle: false, alpha: 1, radius: BRICK.radius * 0.45 });

  // Brushed streaks, clipped to the cell so they cannot spill past its corners.
  for (let x = -h; x < w; x += 5) {
    g.poly([
      Math.max(1, x), h - 1,
      Math.max(1, x + 2), h - 1,
      Math.min(w - 1, x + 2 + h), 1,
      Math.min(w - 1, x + h), 1,
    ]).fill({ color: 0xffffff, alpha: 0.06 });
  }
  return g;
}

function explosiveFace() {
  const w = BRICK_W;
  const h = BRICK_H;
  const g = brickFace(0xd6202f, { speckle: false, alpha: Math.min(1, BRICK.alpha + 0.18) });

  const cx = w / 2;
  const cy = h / 2;

  // Starburst core.
  const spikes = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = i % 2 === 0 ? 7 : 3.2;
    spikes.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.62);
  }
  g.poly(spikes).fill({ color: 0xffd23f });
  g.circle(cx, cy, 2.4).fill({ color: 0xfff6d0 });

  return g;
}

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
    g.moveTo(x1, y1)
      .lineTo((x1 + x2) / 2 + 3, (y1 + y2) / 2)
      .lineTo(x2, y2)
      .stroke({ width: 1.4, color: 0x000000, alpha: 0.55 });
  }
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
  // Every palette colour in every shape. Twenty-four small textures rather
  // than one scaled at draw time: a half-width cell is not a squashed full one
  // — its corner radius, rim highlight and membrane all have to stay the same
  // physical size, or the small clumps read as a different material.
  COLORS.forEach((color, i) => {
    for (const shape of Object.keys(BRICK.shapes)) {
      TEX[brickKey(i, shape)] = bake(renderer, brickFace(color, { shape }));
    }
  });

  TEX.brickSilver = bake(renderer, brickFace(0xc8ccd8));
  TEX.brickGold = bake(renderer, brickFace(0xf0b429));
  TEX.brickMetal = bake(renderer, metalFace());
  TEX.brickExplosive = bake(renderer, explosiveFace());

  TEX.crack1 = bake(renderer, crackOverlay(1));
  TEX.crack2 = bake(renderer, crackOverlay(2));

  TEX.ball = bake(renderer, ballFace());
  TEX.glow = bake(renderer, radialGlow(28, 0xffffff));

  // The cyclamen, in two bakes: the flower in its own colours for the default
  // ball, and a white one for every state that tints. See ball.js.
  TEX.cyclamenBall = bake(renderer, cyclamenFlower(false));
  TEX.cyclamenBallPale = bake(renderer, cyclamenFlower(true));

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

/** Atlas key for a standard cell. `full` keeps the original bare key. */
export const brickKey = (colorIndex, shape) =>
  shape === 'full' ? `brick${colorIndex}` : `brick${colorIndex}_${shape}`;

/**
 * Maps a level-file character to its baked texture key.
 *
 * ONLY STANDARD CELLS CARRY SHAPE VARIANTS, and that is a design rule rather
 * than an oversight. Silver and gold take multiple hits and show cracks drawn
 * to a full cell; metal has to read as an immovable slab; an explosive
 * detonates its whole 3x3 neighbourhood. Shrinking any of those would make the
 * cell claim something its behaviour does not honour — a small square that
 * blows up its neighbours is a nasty surprise, not a design flourish. A layout
 * that asks for one in a half cell silently gets the full box, which is the
 * safe direction to fail in.
 */
export function textureKeyFor(kind, colorIndex, shape = 'full') {
  switch (kind) {
    case 'silver':
      return 'brickSilver';
    case 'gold':
      return 'brickGold';
    case 'metal':
      return 'brickMetal';
    case 'explosive':
      return 'brickExplosive';
    default:
      return brickKey(colorIndex, shape);
  }
}
