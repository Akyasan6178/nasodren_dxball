import { Graphics } from 'pixi.js';

/**
 * Power-up capsule iconography.
 *
 * Icons are drawn once at boot with Graphics primitives and baked to GPU
 * textures, the same approach the brick atlas uses. Procedural rather than SVG
 * data URIs deliberately: baking is synchronous once the renderer exists, so a
 * capsule can never spawn before its artwork has decoded. No files, no fetch,
 * no race.
 *
 * Every icon is authored inside a 40x40 box and drawn with additive shapes
 * only — no cut-outs. Holes need even-odd fills, which are the first thing to
 * look wrong when a shape is tinted and scaled down to twelve pixels.
 */

const BOX = 40;
const C = BOX / 2; // centre

/** Baked textures, keyed by power-up id. Populated by buildPowerUpIcons(). */
export const ICONS = {};

/*
 * Note on colour: icons bake as white silhouettes and are tinted at use time by
 * the consumer, from `def.color` on the POWERUPS table. Nothing in this module
 * decides what colour a power-up is.
 */

/* --------------------------------------------------------------- helpers -- */

/** Outward/inward arrowhead used by the paddle-width icons. */
function arrow(g, x, y, dir, size = 7) {
  g.poly([x, y - size, x + dir * size, y, x, y + size]).fill(0xffffff);
}

function chevron(g, y, dir, w = 11, h = 6, thickness = 3.4) {
  g.moveTo(C - w, y)
    .lineTo(C, y + dir * h)
    .lineTo(C + w, y)
    .stroke({ width: thickness, color: 0xffffff, cap: 'round', join: 'round' });
}

/* ---------------------------------------------------------------- icons --- */

const DRAWINGS = {
  /** Wide paddle: a bar pushed apart. */
  big(g) {
    g.roundRect(C - 6, C - 3, 12, 6, 3).fill(0xffffff);
    arrow(g, C - 10, C, -1);
    arrow(g, C + 10, C, 1);
  },

  /** Narrow paddle: the same bar squeezed inward. */
  small(g) {
    g.roundRect(C - 4, C - 3, 8, 6, 3).fill(0xffffff);
    arrow(g, C - 16, C, 1);
    arrow(g, C + 16, C, -1);
  },

  /** Grab: a ball held on the bat. */
  catch(g) {
    g.roundRect(C - 13, C + 7, 26, 6, 3).fill(0xffffff);
    g.circle(C, C - 3, 7).fill(0xffffff);
    // Retaining hooks either side.
    g.moveTo(C - 12, C + 6).lineTo(C - 12, C - 1).stroke({ width: 3, color: 0xffffff, cap: 'round' });
    g.moveTo(C + 12, C + 6).lineTo(C + 12, C - 1).stroke({ width: 3, color: 0xffffff, cap: 'round' });
  },

  /** Lasers: bat with two bolts leaving it. */
  laser(g) {
    g.roundRect(C - 13, C + 8, 26, 6, 3).fill(0xffffff);
    for (const dx of [-7, 7]) {
      g.poly([C + dx - 2.6, C + 5, C + dx + 2.6, C + 5, C + dx + 2.6, C - 8, C + dx, C - 14, C + dx - 2.6, C - 8])
        .fill(0xffffff);
    }
  },

  /** Triple ball. */
  multi(g) {
    g.circle(C, C - 8, 6.4).fill(0xffffff);
    g.circle(C - 9, C + 7, 6.4).fill(0xffffff);
    g.circle(C + 9, C + 7, 6.4).fill(0xffffff);
  },

  /** Slow: ball easing downward. */
  slow(g) {
    g.circle(C, C - 7, 6.2).fill(0xffffff);
    chevron(g, C + 3, 1);
    chevron(g, C + 11, 1);
  },

  /** Fast: ball accelerating upward. */
  fast(g) {
    g.circle(C, C + 7, 6.2).fill(0xffffff);
    chevron(g, C - 1, -1);
    chevron(g, C - 9, -1);
  },

  /** Through ball: passes between the bricks instead of bouncing. */
  through(g) {
    g.roundRect(C - 16, C - 12, 7, 24, 2).fill(0xffffff);
    g.roundRect(C + 9, C - 12, 7, 24, 2).fill(0xffffff);
    g.circle(C, C, 6.6).fill(0xffffff);
  },

  /** Bonus points. */
  points(g) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 14 : 6.2;
      pts.push(C + Math.cos(a) * r, C + Math.sin(a) * r);
    }
    g.poly(pts).fill(0xffffff);
  },

  /** Fireball. */
  fire(g) {
    g.moveTo(C, C - 15)
      .bezierCurveTo(C + 11, C - 5, C + 12, C + 6, C + 5, C + 12)
      .bezierCurveTo(C + 2, C + 15, C - 3, C + 15, C - 6, C + 12)
      .bezierCurveTo(C - 13, C + 5, C - 9, C - 3, C - 3, C - 7)
      .bezierCurveTo(C - 4, C - 2, C - 2, C + 1, C + 1, C + 1)
      .bezierCurveTo(C + 5, C + 1, C + 5, C - 6, C, C - 15)
      .fill(0xffffff);
  },

  /** Extra life. */
  life(g) {
    g.moveTo(C, C + 13)
      .bezierCurveTo(C - 17, C + 1, C - 12, C - 13, C - 4, C - 11)
      .bezierCurveTo(C - 1.5, C - 10.4, C, C - 8, C, C - 6.5)
      .bezierCurveTo(C, C - 8, C + 1.5, C - 10.4, C + 4, C - 11)
      .bezierCurveTo(C + 12, C - 13, C + 17, C + 1, C, C + 13)
      .fill(0xffffff);
  },

  /** Level warp: skip ahead. */
  warp(g) {
    g.poly([C - 15, C - 11, C - 2, C, C - 15, C + 11]).fill(0xffffff);
    g.poly([C - 2, C - 11, C + 11, C, C - 2, C + 11]).fill(0xffffff);
    g.roundRect(C + 12, C - 11, 4.5, 22, 2).fill(0xffffff);
  },

  /** Zap: controls inverted. */
  zap(g) {
    g.poly([C + 5, C - 15, C - 10, C + 2, C - 1, C + 2, C - 5, C + 15, C + 10, C - 3, C + 1, C - 3])
      .fill(0xffffff);
  },

  /** Purge Protocol: a shield sweeping the corruption out. */
  purge(g) {
    // Shield outline.
    g.moveTo(C, C - 15)
      .lineTo(C + 12, C - 10)
      .lineTo(C + 12, C + 2)
      .bezierCurveTo(C + 12, C + 10, C + 6, C + 14, C, C + 16)
      .bezierCurveTo(C - 6, C + 14, C - 12, C + 10, C - 12, C + 2)
      .lineTo(C - 12, C - 10)
      .closePath()
      .stroke({ width: 3, color: 0xffffff, join: 'round' });
    // Check mark inside.
    g.moveTo(C - 5.5, C - 1)
      .lineTo(C - 1.5, C + 4)
      .lineTo(C + 6, C - 6)
      .stroke({ width: 3.2, color: 0xffffff, cap: 'round', join: 'round' });
  },

  /** Kill paddle. Built from solid shapes so it survives tinting at 12px. */
  death(g) {
    g.circle(C, C - 3, 11.5).fill(0xffffff);
    g.roundRect(C - 6, C + 6, 12, 8, 3).fill(0xffffff);

    // Sockets and mouth are punched with the pill's own body colour rather than
    // transparency — see the note on cut-outs at the top of this file.
    g.circle(C - 4.4, C - 4, 3.5).fill(0x0b0f22);
    g.circle(C + 4.4, C - 4, 3.5).fill(0x0b0f22);
    g.poly([C, C + 1, C - 2, C + 5, C + 2, C + 5]).fill(0x0b0f22);
    for (const dx of [-3.2, 0, 3.2]) {
      g.rect(C + dx - 0.8, C + 7.5, 1.6, 5).fill(0x0b0f22);
    }
  },
};

/* ----------------------------------------------------------------- bake --- */

/**
 * Bakes every icon to a texture. Call once, after the renderer exists and
 * before any capsule can spawn.
 *
 * @param {import('pixi.js').Renderer} renderer
 */
export function buildPowerUpIcons(renderer) {
  for (const [id, draw] of Object.entries(DRAWINGS)) {
    const g = new Graphics();

    // Transparent bounding box first. generateTexture measures the drawn
    // geometry, so without this each icon would bake to its own tight bounds
    // and they would all end up at slightly different scales on the capsule.
    g.rect(0, 0, BOX, BOX).fill({ color: 0xffffff, alpha: 0 });

    draw(g);

    ICONS[id] = renderer.generateTexture({
      target: g,
      // Baked at 3x: the icon is drawn at ~12px but the board is scaled up to
      // 3x on a large display, so this keeps the edges clean at full size.
      resolution: 3,
      antialias: true,
    });

    g.destroy();
  }

  return ICONS;
}
