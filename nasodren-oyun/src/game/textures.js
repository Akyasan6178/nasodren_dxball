import { Graphics } from 'pixi.js';
import { BRICK_W, BRICK_H, COLORS, BALL, LASER } from './config.js';

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
 * The signature chunky bevel: light from the top-left, shadow to the
 * bottom-right, plus a faint horizontal scanline so the face reads as textured
 * rather than flat.
 */
function brickFace(color, opts = {}) {
  const { bevel = 3, speckle = true, stroke = 0x120a18 } = opts;
  const w = BRICK_W;
  const h = BRICK_H;
  const g = new Graphics();

  g.rect(0, 0, w, h).fill(color);

  // Top-left highlight wedge.
  g.poly([0, 0, w, 0, w - bevel, bevel, bevel, bevel, bevel, h - bevel, 0, h])
    .fill({ color: shade(color, 0.45), alpha: 0.95 });

  // Bottom-right shadow wedge.
  g.poly([w, 0, w, h, 0, h, bevel, h - bevel, w - bevel, h - bevel, w - bevel, bevel])
    .fill({ color: shade(color, -0.45), alpha: 0.95 });

  if (speckle) {
    for (let y = bevel + 2; y < h - bevel; y += 4) {
      g.rect(bevel, y, w - bevel * 2, 1).fill({ color: 0x000000, alpha: 0.07 });
    }
  }

  g.rect(0.5, 0.5, w - 1, h - 1).stroke({ width: 1, color: stroke, alpha: 0.75 });

  return g;
}

function metalFace() {
  const w = BRICK_W;
  const h = BRICK_H;
  const g = brickFace(0x8a92a8, { bevel: 4, speckle: false });

  // Brushed diagonal streaks so metal is instantly readable as "don't bother".
  for (let x = -h; x < w; x += 5) {
    g.poly([x, h, x + 2, h, x + 2 + h, 0, x + h, 0]).fill({ color: 0xffffff, alpha: 0.06 });
  }
  return g;
}

function explosiveFace() {
  const w = BRICK_W;
  const h = BRICK_H;
  const g = brickFace(0xd6202f, { bevel: 3, speckle: false });

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
 * Bakes the full atlas. Call once, after the renderer exists.
 * @param {import('pixi.js').Renderer} renderer
 */
export function buildTextures(renderer) {
  COLORS.forEach((color, i) => {
    TEX[`brick${i}`] = bake(renderer, brickFace(color));
  });

  TEX.brickSilver = bake(renderer, brickFace(0xc8ccd8, { bevel: 4 }));
  TEX.brickGold = bake(renderer, brickFace(0xf0b429, { bevel: 4 }));
  TEX.brickMetal = bake(renderer, metalFace());
  TEX.brickExplosive = bake(renderer, explosiveFace());

  TEX.crack1 = bake(renderer, crackOverlay(1));
  TEX.crack2 = bake(renderer, crackOverlay(2));

  TEX.ball = bake(renderer, ballFace());
  TEX.glow = bake(renderer, radialGlow(28, 0xffffff));

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

/** Maps a level-file character to its baked texture key. */
export function textureKeyFor(kind, colorIndex) {
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
      return `brick${colorIndex}`;
  }
}
