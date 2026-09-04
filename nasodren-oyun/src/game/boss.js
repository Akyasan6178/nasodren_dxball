import { Container, Graphics } from 'pixi.js';
import { BOSS, FIELD } from './config.js';

/**
 * The O.M.E.G.A. Construct.
 *
 * A core wrapped in concentric rings of shield segments that counter-rotate.
 * The whole assembly patrols horizontally; the boss container itself is only
 * ever *translated*, never rotated, so a normal computed in boss-local space is
 * already a world-space normal. The rings spin inside it instead.
 *
 * Collision is solved in polar coordinates rather than by approximating each
 * segment with a box. A segment genuinely is an arc — bounded by two radii and
 * two angles — so testing `(distance, angle)` against those four bounds is both
 * exact and rotation-invariant, and it costs one hypot and one atan2 per ring
 * regardless of how many segments are alive.
 */

const TAU = Math.PI * 2;

/**
 * Extra push applied after a bounce so the ball ends up genuinely clear.
 *
 * Two values, because the two faces fail differently. A ball is padded
 * angularly by `ballRadius / distance`, and that padding *grows* as the ball
 * travels inward — so a ball nudged just past a segment's side face, still
 * carrying inward radial velocity, gets recaptured by the very same segment a
 * few pixels later. Across the 13px band that reclaim is worth about 0.7px of
 * arc, so the tangential separation has to clear it with margin. The curved
 * face has no such effect and only needs to break contact.
 */
const SEPARATION_RADIAL = 0.5;
const SEPARATION_TANGENT = 1.75;

/** Wrap to (-PI, PI]. */
function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}

const RING_COLORS = [
  { base: 0x4d7bff, hurt: 0x2b4a99, glow: 0x9ab8ff },
  { base: 0x35d0d8, hurt: 0x1e7377, glow: 0x9fe9ed },
];

/* ---------------------------------------------------------------- shield -- */

class Segment {
  constructor(ring, index) {
    this.ring = ring;
    this.index = index;

    this.baseAngle = (index / ring.count) * TAU;
    this.halfSpan = ((TAU / ring.count) * ring.coverage) / 2;

    this.maxHits = BOSS.shield.hits;
    this.hits = this.maxHits;
    this.alive = true;

    /** 0..1 materialisation progress. Intangible until it reaches 1. */
    this.spawn = 1;

    this.gfx = new Graphics();
    ring.container.addChild(this.gfx);
    this.draw();
  }

  /** Only a fully materialised, living segment can be hit. */
  get solid() {
    return this.alive && this.spawn >= 1;
  }

  /** Angular centre in boss-local space, including the ring's rotation. */
  get angle() {
    return this.ring.container.rotation + this.baseAngle;
  }

  draw() {
    const g = this.gfx;
    g.clear();
    if (!this.alive) return;

    const { radius, thickness } = this.ring;
    const inner = radius - thickness / 2;
    const outer = radius + thickness / 2;
    const a0 = this.baseAngle - this.halfSpan;
    const a1 = this.baseAngle + this.halfSpan;

    const worn = this.hits < this.maxHits;
    const palette = RING_COLORS[this.ring.index % RING_COLORS.length];
    const fill = worn ? palette.hurt : palette.base;

    // Arc band: out along a0, around the outer edge, back down a1, and home
    // along the inner edge.
    g.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner)
      .lineTo(Math.cos(a0) * outer, Math.sin(a0) * outer)
      .arc(0, 0, outer, a0, a1)
      .lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner)
      .arc(0, 0, inner, a1, a0, true)
      .closePath()
      .fill({ color: fill, alpha: 0.95 });

    // Bright leading edge, so rotation direction is readable at a glance.
    g.moveTo(Math.cos(a0) * inner, Math.sin(a0) * inner)
      .arc(0, 0, (inner + outer) / 2, a0, a1)
      .stroke({ width: 2, color: palette.glow, alpha: worn ? 0.45 : 0.9 });

    // Circuit ticks.
    const mid = (inner + outer) / 2;
    for (let i = 1; i < 4; i++) {
      const a = a0 + ((a1 - a0) * i) / 4;
      g.moveTo(Math.cos(a) * (inner + 2), Math.sin(a) * (inner + 2))
        .lineTo(Math.cos(a) * (outer - 2), Math.sin(a) * (outer - 2))
        .stroke({ width: 1, color: 0x000000, alpha: 0.35 });
    }
    void mid;
  }

  damage(amount) {
    this.hits -= amount;
    if (this.hits > 0) {
      this.draw();
      return false;
    }
    this.kill();
    return true;
  }

  kill() {
    this.alive = false;
    this.hits = 0;
    this.spawn = 1;
    this.gfx.clear();
    this.gfx.alpha = 1;
    this.gfx.scale.set(1);
  }

  /** Begin materialising. Stays intangible until `spawn` reaches 1. */
  revive() {
    this.alive = true;
    this.hits = this.maxHits;
    this.spawn = 0;
    this.gfx.alpha = 0;
    this.draw();
  }

  update(dt) {
    if (this.spawn >= 1) return;
    this.spawn = Math.min(1, this.spawn + dt / BOSS.shield.regenTime);
    this.gfx.alpha = this.spawn;
    this.gfx.scale.set(0.82 + 0.18 * this.spawn);
  }

  /** World-space midpoint, for particles and sound placement. */
  midpoint(boss) {
    const a = this.angle;
    return { x: boss.x + Math.cos(a) * this.ring.radius, y: boss.y + Math.sin(a) * this.ring.radius };
  }
}

/* ------------------------------------------------------------------ ring -- */

class Ring {
  constructor(spec, index) {
    this.index = index;
    this.radius = spec.radius;
    this.thickness = spec.thickness;
    this.count = spec.segments;
    this.coverage = spec.coverage;
    this.spin = spec.spin;

    this.container = new Container();
    this.segments = Array.from({ length: this.count }, (_, i) => new Segment(this, i));
  }

  get inner() {
    return this.radius - this.thickness / 2;
  }

  get outer() {
    return this.radius + this.thickness / 2;
  }

  get aliveCount() {
    return this.segments.reduce((n, s) => n + (s.alive ? 1 : 0), 0);
  }

  update(dt, spinScale) {
    this.container.rotation += this.spin * spinScale * dt;
    for (const seg of this.segments) seg.update(dt);
  }

  /**
   * Polar hit test against every live segment.
   *
   * @param {number} lx ball position relative to the boss centre
   * @param {number} ly
   * @param {number} ballR
   * @returns {{seg: Segment, nx: number, ny: number, push: number, tangential: boolean} | null}
   */
  collide(lx, ly, ballR) {
    const dist = Math.hypot(lx, ly);
    if (dist < 1e-4) return null;
    if (dist + ballR < this.inner || dist - ballR > this.outer) return null;

    const theta = Math.atan2(ly, lx);
    // A ball of radius r subtends this half-angle at the current distance, so
    // widening each segment by it is exactly equivalent to shrinking the ball
    // to a point.
    const angularPad = ballR / dist;

    for (const seg of this.segments) {
      if (!seg.solid) continue;

      const delta = wrapAngle(theta - seg.angle);
      const limit = seg.halfSpan + angularPad;
      if (Math.abs(delta) > limit) continue;

      // Depth of penetration through each pair of bounds. The shallower one is
      // the face actually struck — the same principle the brick collision uses,
      // in polar form.
      const radialOverlap = Math.min(this.outer + ballR - dist, dist - (this.inner - ballR));
      const angularOverlap = (limit - Math.abs(delta)) * dist;

      let nx;
      let ny;
      let push;
      let tangential;

      if (radialOverlap <= angularOverlap) {
        // Curved face: the normal is radial, pointing away from the band.
        const sign = dist > this.radius ? 1 : -1;
        nx = (lx / dist) * sign;
        ny = (ly / dist) * sign;
        push = radialOverlap;
        tangential = false;
      } else {
        // Flat side of the arc: the normal is tangential.
        const sign = delta >= 0 ? 1 : -1;
        nx = (-ly / dist) * sign;
        ny = (lx / dist) * sign;
        push = angularOverlap;
        tangential = true;
      }

      return { seg, nx, ny, push, tangential };
    }

    return null;
  }

  /** True if a live segment currently spans this boss-local angle. */
  covers(theta, pad = 0) {
    return this.segments.some(
      (seg) => seg.alive && Math.abs(wrapAngle(theta - seg.angle)) <= seg.halfSpan + pad,
    );
  }
}

/* ------------------------------------------------------------------ boss -- */

export class Boss extends Container {
  constructor() {
    super();

    this.maxHealth = BOSS.core.health;
    this.health = this.maxHealth;
    this.dead = false;

    this.coreRadius = BOSS.core.radius;

    this._t = Math.random() * TAU;
    this._iFrame = 0;
    this._regenTimer = BOSS.shield.regenEvery;
    this._fireTimer = BOSS.fire.interval;
    this._pulse = 0;

    /** Set by the scene: (x, y, dx, dy) => void */
    this.onFire = null;

    this.rings = BOSS.rings.map((spec, i) => new Ring(spec, i));

    this.chassis = new Graphics();
    this.addChild(this.chassis);
    for (const ring of this.rings) this.addChild(ring.container);

    this.core = new Graphics();
    this.addChild(this.core);

    this.patrolMin = FIELD.left + BOSS.patrol.margin;
    this.patrolMax = FIELD.right - BOSS.patrol.margin;

    this.y = BOSS.y;
    this.x = (this.patrolMin + this.patrolMax) / 2;

    this._drawChassis();
    this._drawCore();
  }

  get outerRadius() {
    return this.rings[this.rings.length - 1].outer;
  }

  get shieldsRemaining() {
    return this.rings.reduce((n, r) => n + r.aliveCount, 0);
  }

  /** Active phase spec: the deepest one whose threshold we have reached. */
  get phase() {
    const frac = this.health / this.maxHealth;
    let active = BOSS.phases[0];
    for (const p of BOSS.phases) if (frac <= p.threshold) active = p;
    return active;
  }

  get phaseIndex() {
    return BOSS.phases.indexOf(this.phase);
  }

  _drawChassis() {
    const g = this.chassis;
    g.clear();
    // Faint mainframe housing behind the rings.
    g.circle(0, 0, this.rings[this.rings.length - 1].inner - 2)
      .fill({ color: 0x0a1024, alpha: 0.55 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      g.moveTo(Math.cos(a) * (this.coreRadius + 4), Math.sin(a) * (this.coreRadius + 4))
        .lineTo(Math.cos(a) * (this.rings[0].inner - 3), Math.sin(a) * (this.rings[0].inner - 3))
        .stroke({ width: 2, color: 0x1d3457, alpha: 0.9 });
    }
  }

  _drawCore() {
    const g = this.core;
    const r = this.coreRadius;
    const frac = Math.max(0, this.health / this.maxHealth);

    g.clear();
    g.circle(0, 0, r).fill(0x11162e);
    g.circle(0, 0, r - 4).fill({ color: 0xff4d5a, alpha: 0.18 + 0.5 * (1 - frac) });

    // Quantum lattice.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      g.moveTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6))
        .lineTo(-Math.cos(a) * (r - 6), -Math.sin(a) * (r - 6))
        .stroke({ width: 1.2, color: 0x7cf9ff, alpha: 0.5 });
    }
    g.circle(0, 0, r * 0.36).fill(0x7cf9ff);

    // Health arc — the core is its own health bar.
    g.circle(0, 0, r + 5).stroke({ width: 3, color: 0x1d3457, alpha: 0.8 });
    if (frac > 0) {
      g.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * frac)
        .stroke({ width: 3, color: frac > 0.33 ? 0x35d0d8 : 0xff4d5a, alpha: 1 });
    }
  }

  /* ------------------------------------------------------------ lifecycle */

  update(dt, balls) {
    if (this.dead) return;

    const phase = this.phase;

    // Patrol: a sine sweep is smooth at the turnarounds by construction, with
    // no easing state to keep in sync.
    this._t += (dt / BOSS.patrol.period) * TAU * phase.patrolScale;
    const mid = (this.patrolMin + this.patrolMax) / 2;
    const amp = (this.patrolMax - this.patrolMin) / 2;
    this.x = mid + Math.sin(this._t) * amp;

    for (const ring of this.rings) ring.update(dt, phase.spinScale);

    if (this._iFrame > 0) this._iFrame -= dt;

    // Core idle pulse.
    this._pulse += dt * 3;
    this.core.scale.set(1 + Math.sin(this._pulse) * 0.03);

    this._tickRegen(dt, balls);
    this._tickFire(dt, phase);
  }

  _tickRegen(dt, balls) {
    this._regenTimer -= dt;
    if (this._regenTimer > 0) return;
    this._regenTimer = BOSS.shield.regenEvery;

    const dead = [];
    for (const ring of this.rings) {
      for (const seg of ring.segments) {
        // Never rematerialise on top of a ball — that would trap it inside the
        // ring with no way out, which reads as a bug rather than a mechanic.
        if (!seg.alive && !this._segmentOccupied(seg, balls)) dead.push(seg);
      }
    }

    if (!dead.length) return { revived: 0 };

    let revived = 0;
    for (let i = 0; i < BOSS.shield.regenBatch && dead.length; i++) {
      const pick = dead.splice(Math.floor(Math.random() * dead.length), 1)[0];
      pick.revive();
      revived++;
    }

    this.lastRegen = revived;
    return { revived };
  }

  _segmentOccupied(seg, balls) {
    if (!balls) return false;
    const ring = seg.ring;

    for (const ball of balls) {
      const lx = ball.x - this.x;
      const ly = ball.y - this.y;
      const dist = Math.hypot(lx, ly);
      if (dist + ball.radius < ring.inner || dist - ball.radius > ring.outer) continue;
      if (dist < 1e-4) return true;

      const delta = wrapAngle(Math.atan2(ly, lx) - seg.angle);
      if (Math.abs(delta) <= seg.halfSpan + ball.radius / dist) return true;
    }

    return false;
  }

  _tickFire(dt, phase) {
    if (!this.onFire) return;

    this._fireTimer -= dt;
    if (this._fireTimer > 0) return;
    this._fireTimer = BOSS.fire.interval * phase.fireScale;

    const shots = phase.shots;
    for (let i = 0; i < shots; i++) {
      // Fan the volley around straight down.
      const t = shots === 1 ? 0 : (i / (shots - 1)) * 2 - 1;
      const a = Math.PI / 2 + t * BOSS.fire.spread;
      this.onFire(this.x, this.y + this.coreRadius, Math.cos(a), Math.sin(a));
    }
  }

  /* ------------------------------------------------------------ collision */

  /**
   * Resolve a ball against the construct, mutating the ball on contact exactly
   * as the brick collision does.
   *
   * Shield ordering is handled by geometry rather than by a flag: the rings sit
   * outside the core, so the only way to reach the Quantum Core is through a
   * gap. "Shields breached" is therefore a spatial fact, not a state check.
   *
   * @param {import('./ball.js').Ball} ball
   * @returns {{type:'shield'|'core', destroyed?:boolean, damaged?:boolean, x:number, y:number, ringIndex?:number, segIndex?:number} | null}
   */
  collide(ball) {
    if (this.dead) return null;

    const lx = ball.x - this.x;
    const ly = ball.y - this.y;
    const dist = Math.hypot(lx, ly);

    if (dist > this.outerRadius + ball.radius) return null;

    const pierce = ball.fire || ball.through;

    // Outermost ring first: it is what an incoming ball meets.
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const hit = this.rings[i].collide(lx, ly, ball.radius);
      if (!hit) continue;

      const { seg, nx, ny, push, tangential } = hit;
      const point = seg.midpoint(this);
      const destroyed = seg.damage(pierce ? Infinity : 1);

      // Plasma and through-ball carry straight on through a shield they broke.
      if (!(pierce && destroyed)) this._bounce(ball, nx, ny, push, tangential);

      return {
        type: 'shield',
        destroyed,
        x: point.x,
        y: point.y,
        ringIndex: i,
        segIndex: seg.index,
      };
    }

    if (dist <= this.coreRadius + ball.radius) {
      const nx = dist < 1e-4 ? 0 : lx / dist;
      const ny = dist < 1e-4 ? -1 : ly / dist;

      ball.x = this.x + nx * (this.coreRadius + ball.radius + 0.5);
      ball.y = this.y + ny * (this.coreRadius + ball.radius + 0.5);

      const dot = ball.dx * nx + ball.dy * ny;
      if (dot < 0) {
        ball.dx -= 2 * dot * nx;
        ball.dy -= 2 * dot * ny;
        ball.clampDirection();
      }

      let damaged = false;
      if (this._iFrame <= 0) {
        this._iFrame = BOSS.core.iFrames;
        this.health = Math.max(0, this.health - 1);
        this._drawCore();
        damaged = true;
        if (this.health <= 0) this.kill();
      }

      return { type: 'core', damaged, x: ball.x, y: ball.y };
    }

    return null;
  }

  /**
   * Damage whatever shield segment covers a point, with no reflection. Used by
   * the laser power-up, which should not be dead weight in this level.
   * The core is immune to lasers — it is the ball's prize.
   *
   * @returns {{destroyed:boolean, x:number, y:number, ringIndex:number} | null}
   */
  damageAt(px, py, radius = 2) {
    if (this.dead) return null;

    const lx = px - this.x;
    const ly = py - this.y;
    if (Math.hypot(lx, ly) > this.outerRadius + radius) return null;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const hit = this.rings[i].collide(lx, ly, radius);
      if (!hit) continue;

      const point = hit.seg.midpoint(this);
      const destroyed = hit.seg.damage(1);
      return { destroyed, x: point.x, y: point.y, ringIndex: i };
    }

    return null;
  }

  _bounce(ball, nx, ny, push, tangential) {
    // Push clear of the surface, not onto it. Landing exactly on the boundary
    // leaves the ball touching, and a grazing hit can then register a second
    // contact on the following substep and eat two hits off one segment.
    const separation = tangential ? SEPARATION_TANGENT : SEPARATION_RADIAL;
    ball.x += nx * (push + separation);
    ball.y += ny * (push + separation);

    const dot = ball.dx * nx + ball.dy * ny;
    if (dot < 0) {
      ball.dx -= 2 * dot * nx;
      ball.dy -= 2 * dot * ny;
      ball.clampDirection();
    }
  }

  kill() {
    this.dead = true;
    this.health = 0;
    this.onFire = null;
    for (const ring of this.rings) for (const seg of ring.segments) seg.kill();
    this._drawCore();
    this.visible = false;
  }
}
