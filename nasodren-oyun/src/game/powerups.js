import { Container, Graphics, Sprite } from 'pixi.js';
import { CAPSULE, RUN, SCORE } from './config.js';
import { TEX } from './textures.js';
import { ICONS } from './powerup-icons.js';

/**
 * The power-up table.
 *
 * `weight` controls the drop mix — helpful capsules are common, run-enders are
 * rare, and level warps are rarest of all. `good` drives the pickup jingle and
 * the capsule colour so a player can read a falling capsule at a glance.
 */
export const POWERUPS = [
  { id: 'big',      letter: 'B', label: 'Wide Paddle',  good: true,  weight: 9,  color: 0x35d0d8 },
  { id: 'catch',    letter: 'C', label: 'Grab',         good: true,  weight: 8,  color: 0x86e05a },
  { id: 'laser',    letter: 'L', label: 'Lasers',       good: true,  weight: 8,  color: 0xff4d5a },
  { id: 'multi',    letter: 'M', label: 'Triple Ball',  good: true,  weight: 8,  color: 0xffd23f },
  { id: 'slow',     letter: 'S', label: 'Slow Ball',    good: true,  weight: 7,  color: 0x4d7bff },
  { id: 'through',  letter: 'T', label: 'Through Ball', good: true,  weight: 5,  color: 0xa963ff },
  { id: 'points',   letter: 'P', label: 'Bonus Points', good: true,  weight: 5,  color: 0xffd23f },
  { id: 'life',     letter: 'E', label: 'Extra Life',   good: true,  weight: 3,  color: 0xff63c1 },
  { id: 'warp',     letter: 'W', label: 'Level Warp',   good: true,  weight: 2,  color: 0xffffff },

  { id: 'small',    letter: 'N', label: 'Narrow Paddle', good: false, weight: 7, color: 0xb06cff },
  { id: 'fast',     letter: 'X', label: 'Fast Ball',     good: false, weight: 6, color: 0xff9130 },
  { id: 'zap',      letter: 'Z', label: 'Zap',           good: false, weight: 4, color: 0xff63c1 },
  { id: 'death',    letter: 'D', label: 'Kill Paddle',   good: false, weight: 4, color: 0xd6202f },
];

/**
 * Fireball — RETIRED from the drop table.
 *
 * Piercing is now exclusive to the O.M.E.G.A. encounter and reachable only
 * through the Purge Protocol. The definition is kept (weight 0, outside
 * POWERUPS) so `POWERUP_BY_ID.fire` still resolves for the HUD and its icon is
 * not orphaned. Re-enabling it is one line: move this entry back into the
 * POWERUPS array.
 */
export const FIREBALL = {
  id: 'fire',
  letter: 'F',
  label: 'Fireball',
  good: true,
  weight: 0,
  color: 0xff9130,
};

/**
 * Purge Protocol — the boss-only relief capsule.
 *
 * Deliberately NOT a member of POWERUPS. That array is what `rollPowerUp`
 * weights over, so adding an entry would change the odds of every other
 * capsule in all thirteen levels. It is dropped explicitly by the boss on a
 * core hit and never appears in a random roll.
 */
export const PURGE_PROTOCOL = {
  id: 'purge',
  letter: 'Q',
  label: 'Purge Protocol',
  good: true,
  weight: 0,
  color: 0x7cf9ff,
};

/**
 * The Rebound Effect — the chemical decongestant trap.
 *
 * Deliberately NOT a member of POWERUPS, for the same reason Purge Protocol is
 * not: that array is what `rollPowerUp` weights over and what TOTAL_WEIGHT is
 * computed from, so an entry here would shift the odds of every other capsule
 * in all thirteen levels. Sitting outside it, the Rebound can be folded into
 * the roll by whoever is running the level — currently the trial level only,
 * see TRIAL in config.js — at whatever weight that caller wants, and levels
 * that do not ask for it keep the original drop mix exactly.
 *
 * `good: true` is not a mistake and not a balance decision — it is the
 * mechanic. It drives the pickup jingle and the catch banner, so the capsule
 * congratulates the player on catching it, exactly as a chemical spray
 * announces two seconds of relief before rhinitis medicamentosa arrives. The
 * red body is the only tell, and it is a fair one: every other red thing in
 * this game hurts.
 *
 * The `weight` here is a floor, not the value used: callers pass the weight
 * they want alongside the definition.
 */
export const REBOUND_CAPSULE = {
  id: 'rebound',
  letter: 'R',
  label: 'Decongestant',
  good: true,
  weight: 0,
  color: 0xd6202f,
};

export const POWERUP_BY_ID = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));

// Registered for lookups (HUD icons, timers) without joining the drop table.
POWERUP_BY_ID[PURGE_PROTOCOL.id] = PURGE_PROTOCOL;
POWERUP_BY_ID[FIREBALL.id] = FIREBALL;
POWERUP_BY_ID[REBOUND_CAPSULE.id] = REBOUND_CAPSULE;

const TOTAL_WEIGHT = POWERUPS.reduce((sum, p) => sum + p.weight, 0);

/** Shared empty pool, so the common no-extras call allocates nothing. */
const NO_EXTRAS = Object.freeze([]);

/**
 * Weighted pick from the table, plus any capsules the current level adds.
 *
 * `extras` lets a level fold in a definition that is not part of the global
 * drop mix, at a weight of its own choosing, without that weight touching the
 * odds anywhere else. Passing nothing reproduces the original roll exactly:
 * same table, same TOTAL_WEIGHT, same distribution.
 *
 * @param {ReadonlyArray<{def: object, weight: number}>} [extras]
 */
export function rollPowerUp(extras = NO_EXTRAS) {
  let total = TOTAL_WEIGHT;
  for (const e of extras) total += e.weight;

  let roll = Math.random() * total;

  for (const p of POWERUPS) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }

  // Extras are drawn from the tail of the range, so they only ever come up on a
  // roll the base table could not have consumed.
  for (const e of extras) {
    roll -= e.weight;
    if (roll <= 0) return e.def;
  }

  return POWERUPS[0];
}

/** Lighten a colour toward white, for the icon tint and the rim highlight. */
function lighten(color, amount) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

const BODY = 0x0b0f22;
const ICON_PX = 12.5;

/**
 * A falling capsule.
 *
 * Presentation only — the collision box is still exactly CAPSULE.w x CAPSULE.h,
 * reported through the same halfW/halfH getters the game scene reads. The pulse
 * animates `scale`, which the catch test never consults, so nothing here changes
 * how easy a capsule is to collect.
 *
 * Built as a lit pill: an additive glow behind, a dark body, a specular sweep
 * across the top, a coloured rim, and the effect's icon in the middle.
 *
 * The colour is `def.color` — the value on the POWERUPS table above and the
 * single source of truth for this power-up everywhere it appears: the capsule,
 * the HUD icon, the catch particle burst and the pickup banner all read it, so
 * a power-up looks the same wherever the player sees it.
 */
export class Capsule extends Container {
  constructor(def, x, y) {
    super();

    this.def = def;
    this.collected = false;

    const w = CAPSULE.w;
    const h = CAPSULE.h;
    const accent = def.color;

    // Additive halo. Reuses the glow texture already baked for the ball.
    this.glow = new Sprite(TEX.glow);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.tint = accent;
    this.glow.alpha = 0.4;
    this.glow.width = w * 1.9;
    this.glow.height = h * 2.6;
    this.addChild(this.glow);

    const body = new Graphics();

    // Shell.
    body.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: BODY, alpha: 0.95 });

    // Tone wash, strongest at the ends so the middle stays readable.
    body.roundRect(-w / 2, -h / 2, w, h, h / 2).fill({ color: accent, alpha: 0.16 });

    // Specular sweep across the upper half — the thing that makes it read as
    // glass rather than a flat chip.
    body.roundRect(-w / 2 + 2.5, -h / 2 + 1.5, w - 5, h * 0.34, h * 0.17)
      .fill({ color: 0xffffff, alpha: 0.22 });

    // Rim.
    body.roundRect(-w / 2 + 0.8, -h / 2 + 0.8, w - 1.6, h - 1.6, h / 2)
      .stroke({ width: 1.6, color: accent, alpha: 1 });

    this.addChild(body);

    const icon = new Sprite(ICONS[def.id]);
    icon.anchor.set(0.5);
    icon.width = ICON_PX;
    icon.height = ICON_PX;
    icon.tint = lighten(accent, 0.5);
    this.addChild(icon);
    this.icon = icon;

    this.position.set(x, y);
    this._t = Math.random() * Math.PI * 2;
  }

  get halfW() {
    return CAPSULE.w / 2;
  }

  get halfH() {
    return CAPSULE.h / 2;
  }

  update(dt) {
    this.y += CAPSULE.fallSpeed * dt;

    // Slow breathing pulse. Uniform scale keeps the pill undistorted and the
    // icon legible; the earlier version squashed x only, which made the artwork
    // wobble. Purely cosmetic: collision reads the constants, not the transform.
    this._t += dt * 4.2;
    const wave = Math.sin(this._t);

    this.scale.set(1 + wave * 0.06);
    this.glow.alpha = 0.34 + (wave + 1) * 0.16;
    this.icon.alpha = 0.9 + (wave + 1) * 0.05;
  }
}

/**
 * Applies a power-up. All stacking rules live here.
 *
 * Rules mirror the original:
 *  - Wide and Narrow share one slot; picking one cancels the other.
 *  - Grab and Lasers share the paddle's mode slot; the newest wins.
 *  - Slow and Fast share the ball-speed slot and cancel each other.
 *  - Re-collecting an active power-up refreshes its timer rather than stacking.
 *
 * @param {import('../scenes/game-scene.js').GameScene} scene
 * @param {object} def
 */
export function applyPowerUp(scene, def) {
  const D = RUN.powerDuration;

  switch (def.id) {
    case 'big':
      scene.setPaddleWidth('big', D);
      break;

    case 'small':
      scene.setPaddleWidth('small', D);
      break;

    case 'catch':
      scene.setPaddleMode('sticky', D);
      break;

    case 'laser':
      scene.setPaddleMode('laser', D);
      break;

    case 'multi':
      scene.splitBalls(2);
      break;

    case 'through':
      scene.setBallFlag('through', D * 0.7);
      break;

    case 'slow':
      scene.setSpeedModifier('slow', D);
      break;

    case 'fast':
      scene.setSpeedModifier('fast', D);
      break;

    case 'life':
      scene.addLife();
      break;

    case 'points':
      scene.addScore(2500);
      break;

    case 'warp':
      scene.warpLevel();
      break;

    case 'rebound':
      // Two-stage: enlarge now, collapse in REBOUND.surge seconds. The scene
      // owns the chaining because the scene owns the timer wheel.
      scene.reboundEffect();
      break;

    case 'zap':
      scene.setZap(D * 0.6);
      break;

    case 'death':
      scene.killPaddle();
      break;

    case 'purge':
      // Boss-only. Full system reboot: corruption cleared, paddle speed
      // restored, plasma ball granted.
      scene.purgeProtocol();
      break;

    default:
      break;
  }

  if (def.id !== 'points') scene.addScore(SCORE.capsule);
}
