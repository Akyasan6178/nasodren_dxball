import { Container, Sprite } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { VFX } from './config.js';
import { TEX } from './textures.js';
import { cosmeticRandom } from '../core/rng.js';

const SHARDS = ['shard0', 'shard1', 'shard2', 'shard3'];

/**
 * Pooled particle system.
 *
 * Two layers, one pool each:
 *
 *   `base`   additive sparks, streaks and flashes. No filter — these fire on
 *            every paddle touch and every wall bounce, so they have to be free.
 *   `bloom`  brick and boss debris, carrying one AdvancedBloomFilter. Hidden
 *            while empty, which makes the renderer skip the pass outright.
 *
 * Sprites are allocated once and recycled forever: no per-frame `new`, no GC
 * pause mid-rally. Every particle in a layer shares a handful of textures and a
 * single blend mode, so the renderer batches each layer into one draw call
 * however many are alive.
 *
 * `VFX.max` is a hard ceiling. When a chain reaction asks for more than the
 * budget allows the extra requests are simply dropped, which is what keeps a
 * twelve-brick cascade costing the same as a single break.
 */
export class Particles extends Container {
  constructor(max = VFX.max) {
    super();
    this.max = max;
    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.base = new Container();
    this.base.eventMode = 'none';
    this.base.interactiveChildren = false;

    this.bloom = new Container();
    this.bloom.eventMode = 'none';
    this.bloom.interactiveChildren = false;
    this.bloom.visible = false;

    const filter = new AdvancedBloomFilter(VFX.bloom);
    // Filter cost scales with the container's bounds; halving resolution halves
    // the passes again. At this blur radius the softness hides the difference.
    filter.resolution = VFX.bloomResolution;
    this.bloom.filters = [filter];

    this.addChild(this.base, this.bloom);

    this._pools = { base: [], bloom: [] };
    this.active = [];
    this._bloomCount = 0;

    // Per-layer budgets. See VFX.bloomShare for why this is split rather than
    // shared: total sprite allocation is bounded at `max`, not 2x `max`.
    const bloomBudget = Math.round(max * VFX.bloomShare);
    this.budgets = { bloom: bloomBudget, base: max - bloomBudget };
    this._live = { base: 0, bloom: 0 };
  }

  get count() {
    return this.active.length;
  }

  _obtain(layerName, texture) {
    if (this._live[layerName] >= this.budgets[layerName]) return null;

    const pool = this._pools[layerName];
    let p = pool.pop();

    if (!p) {
      p = new Sprite(texture);
      p.anchor.set(0.5);
      p.blendMode = 'add';
      p._layer = layerName;
      this[layerName].addChild(p);
    }

    p.texture = texture;
    p.visible = true;
    this._live[layerName]++;
    return p;
  }

  _release(p) {
    p.visible = false;
    this._live[p._layer]--;
    this._pools[p._layer].push(p);
    if (p._layer === 'bloom') {
      this._bloomCount--;
      if (this._bloomCount === 0) this.bloom.visible = false;
    }
  }

  /**
   * Core emitter. Everything else is a preset over this.
   *
   * @param {number} x
   * @param {number} y
   * @param {object} opts
   */
  burst(x, y, opts = {}) {
    const {
      count = 12,
      color = 0xffffff,
      speed = 130,
      speedVariance = 0.6,
      life = 0.45,
      lifeVariance = 0.4,
      size = 1,
      endScale = 0.35,
      gravity = 320,
      spread = Math.PI * 2,
      direction = 0,
      drag = 0.9,
      spin = 0,
      soft = false,
      texture = null,
      shards = false,
      bloom = false,
      alpha = 1,
    } = opts;

    const layerName = bloom ? 'bloom' : 'base';

    for (let i = 0; i < count; i++) {
      const tex = shards
        ? TEX[SHARDS[(cosmeticRandom() * SHARDS.length) | 0]]
        : texture || (soft ? TEX.spark : TEX.particle);

      const p = this._obtain(layerName, tex);
      if (!p) return; // budget exhausted; drop the remainder rather than stall

      const angle = direction + (cosmeticRandom() - 0.5) * spread;
      const spd = speed * (1 + (cosmeticRandom() - 0.5) * speedVariance);
      const s = size * (0.6 + cosmeticRandom() * 0.7);

      p.x = x;
      p.y = y;
      p.tint = color;
      p.alpha = alpha;
      p.rotation = cosmeticRandom() * Math.PI * 2;

      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.spin = spin ? (cosmeticRandom() - 0.5) * 2 * spin : (cosmeticRandom() - 0.5) * 12;
      p.gravity = gravity;
      p.drag = drag;

      p.scaleFrom = s;
      p.scaleTo = s * endScale;
      p.alphaFrom = alpha;
      p.scale.set(s);

      p.life = life * (1 + (cosmeticRandom() - 0.5) * lifeVariance);
      p.maxLife = p.life;

      if (bloom) {
        this._bloomCount++;
        this.bloom.visible = true;
      }

      this.active.push(p);
    }
  }

  /**
   * High-velocity impact sparks: bright, thin, fast, and gone quickly. Fired
   * along the surface normal so they read as a ricochet rather than a puff.
   *
   * @param {number} nx surface normal, pointing away from the surface
   * @param {number} ny
   */
  sparks(x, y, nx, ny, opts = {}) {
    const { count = 10, color = 0xffffff, speed = 280 } = opts;

    this.burst(x, y, {
      count,
      color,
      speed,
      speedVariance: 0.9,
      life: 0.22,
      lifeVariance: 0.6,
      size: 0.9,
      endScale: 0.15,
      gravity: 420,
      drag: 0.86,
      spread: Math.PI * 0.85,
      direction: Math.atan2(ny, nx),
      texture: TEX.streak,
    });
  }

  /**
   * A single bright flash at the point of impact. One sprite, scaling up as it
   * fades — the cheapest possible way to sell an impact.
   */
  flash(x, y, { color = 0xffffff, size = 0.6, life = 0.16 } = {}) {
    const p = this._obtain('base', TEX.glow);
    if (!p) return;

    p.x = x;
    p.y = y;
    p.tint = color;
    p.alpha = 1;
    p.rotation = 0;

    p.vx = 0;
    p.vy = 0;
    p.spin = 0;
    p.gravity = 0;
    p.drag = 1;

    p.scaleFrom = size * 0.35;
    p.scaleTo = size * 1.5;
    p.alphaFrom = 1;
    p.scale.set(p.scaleFrom);

    p.life = life;
    p.maxLife = life;

    this.active.push(p);
  }

  /**
   * Brick destruction: physics-driven fragments that tumble, shrink and fade as
   * they fall. Routed to the bloomed layer.
   */
  debris(x, y, { color = 0xffffff, count = VFX.debris.count, speed = VFX.debris.speed, life = VFX.debris.life, spin = VFX.debris.spin, size = 1 } = {}) {
    this.burst(x, y, {
      count,
      color,
      speed,
      speedVariance: 0.8,
      life,
      lifeVariance: 0.45,
      size,
      endScale: 0.2,
      gravity: 520,
      drag: 0.93,
      spin,
      shards: true,
      bloom: true,
    });
  }

  update(dt) {
    const list = this.active;

    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;

      if (p.life <= 0) {
        this._release(p);
        // Swap-and-pop: O(1) removal, no array shifting during heavy bursts.
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }

      const damp = Math.pow(p.drag, dt * 60);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;

      // t runs 1 -> 0 over the particle's life.
      const t = p.life / p.maxLife;
      p.alpha = p.alphaFrom * t;
      p.scale.set(p.scaleTo + (p.scaleFrom - p.scaleTo) * t);
    }
  }

  clear() {
    for (const p of this.active) this._release(p);
    this.active.length = 0;
    this._bloomCount = 0;
    this._live.base = 0;
    this._live.bloom = 0;
    this.bloom.visible = false;
  }
}
