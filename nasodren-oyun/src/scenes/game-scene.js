import { Container, Graphics, Sprite } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { cosmeticSigned } from '../core/rng.js';
import { Scene } from '../core/scene-manager.js';
import {
  BALL,
  CAPSULE,
  CORRUPTION,
  DESIGN,
  FIELD,
  HUD_H,
  LASER,
  MAX_DT,
  PADDLE,
  PLASMA,
  PURGE,
  REBOUND,
  SHAKE,
  SNEEZE,
  RUN,
  SCORE,
  VFX,
  WALL,
} from '../game/config.js';
import { LEVELS } from '../game/levels.js';
import { TEX } from '../game/textures.js';
import { BrickField } from '../game/bricks.js';
import { Paddle } from '../game/paddle.js';
import { Ball } from '../game/ball.js';
import { Particles } from '../game/particles.js';
import {
  Capsule,
  POWERUP_BY_ID,
  PURGE_PROTOCOL,
  applyPowerUp,
  rollPowerUp,
} from '../game/powerups.js';
import { Boss } from '../game/boss.js';
import { GlitchPacket } from '../game/projectile.js';
import { CorruptionMeter } from '../game/corruption-meter.js';
import { Hud } from '../game/hud.js';
import { Button, VerticalMenu, makeText, panel } from '../game/ui.js';

const MAX_BALLS = 8;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The gameplay scene: paddle, balls, bricks, capsules, lasers, and the state
 * machine that ties them together.
 *
 * States: 'serve' -> 'play' -> ('lost' | 'clear') -> next scene.
 */
export class GameScene extends Scene {
  constructor(ctx, params) {
    super(ctx, params);

    this.levelIndex = params.levelIndex ?? 0;
    this.level = LEVELS[this.levelIndex];

    this.run = params.run ?? {
      score: 0,
      lives: RUN.startingLives,
      nextExtraLife: SCORE.extraLifeEvery,
    };

    this.state = 'serve';
    this.paused = false;

    this.balls = [];
    this.capsules = [];
    this.lasers = [];

    this.speedMod = 1;
    this.zapped = false;
    this.rallyTime = 0;

    /**
     * Bricks the ball has destroyed since it last touched the paddle — the
     * Sneeze combo counter.
     *
     * Kept here rather than read off the audio manager's own combo: that one is
     * reset from inside the audio layer (paddleBounce, lifeLost, levelWin) to
     * drive pitch escalation, and gameplay should not depend on when a sound
     * system decides a streak is over.
     */
    this.rallyBreaks = 0;

    /** Live floating labels. Ticked by _updateFloaters, owned by this scene. */
    this._floaters = [];

    this.laserCooldown = 0;

    /** key -> { t, onEnd, powerId } */
    /**
     * Screen shake. Offsets `gameContainer` only, never the simulation: the
     * ball, paddle and bricks keep their design-space coordinates, so shaking
     * cannot perturb collision or pointer mapping.
     */
    this.shakeOrigin = { x: 0, y: 0 };
    this.shake = { time: 0, duration: 0, intensity: 0 };

    // Shake is a real accessibility problem for motion-sensitive players.
    this.reduceMotion =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    this.plasmaActive = false;

    /** Boss encounter state. Null on every ordinary level. */
    this.boss = null;
    this.packets = [];
    this.corruption = 0;
    this.corrupted = false;

    this.timers = new Map();
    this._pending = [];
    this._offVisibility = null;
  }

  // --- setup ---------------------------------------------------------------

  enter() {
    const { audio, save } = this.ctx;

    // Everything that shakes lives in here. HUD, corruption meter and the pause
    // overlay stay outside it — shaking readable text is unpleasant and makes
    // the score hard to track during a hit.
    this.gameContainer = new Container();
    this.view.addChild(this.gameContainer);

    this._buildField();

    this.particles = new Particles();
    this.brickField = new BrickField(this.level);

    this.capsuleLayer = new Container();
    this.laserLayer = new Container();
    this.ballLayer = new Container();

    // One shared layer for every plasma ribbon, carrying a single bloom pass.
    // A filter per ball would mean up to eight full bloom chains per frame; one
    // layer means one, and it is skipped entirely while hidden.
    this.plasmaLayer = new Container();
    this.plasmaLayer.visible = false;
    this.plasmaLayer.eventMode = 'none';
    this.plasmaLayer.interactiveChildren = false;
    this.plasmaLayer.filters = [new AdvancedBloomFilter(PLASMA.bloom)];

    // Ribbons underneath, balls on top, both inside the one filtered layer.
    this.trailGroup = new Container();
    this.plasmaBallGroup = new Container();
    this.plasmaLayer.addChild(this.trailGroup, this.plasmaBallGroup);

    this.paddle = new Paddle();

    this.gameContainer.addChild(
      this.brickField,
      this.capsuleLayer,
      this.laserLayer,
      this.particles,
      this.plasmaLayer,
      this.ballLayer,
      this.paddle,
    );

    if (this.level.boss) this._buildBoss();

    this.hud = new Hud();
    this.view.addChild(this.hud);

    this.message = makeText('', { size: 26, color: 0xffffff, anchor: 0.5, title: true });
    this.message.position.set(DESIGN.width / 2, 300);
    this.message.visible = false;
    this.view.addChild(this.message);

    this._refreshHud();
    this._serve();

    audio.playLevelMusic(this.levelIndex, !!this.level.boss);
    save.unlock(this.levelIndex + 1);

    // Losing focus mid-rally is a guaranteed death otherwise.
    const onVisibility = () => {
      if (document.hidden && !this.paused) this._setPaused(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    this._offVisibility = () => document.removeEventListener('visibilitychange', onVisibility);
  }

  _buildField() {
    const g = new Graphics();

    g.rect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, DESIGN.height - FIELD.top)
      .fill(0x0a0a18);

    // Side and top walls. These are also the collision surfaces.
    const wallFill = { color: 0x232a4d };
    g.rect(0, HUD_H, WALL, DESIGN.height - HUD_H).fill(wallFill);
    g.rect(DESIGN.width - WALL, HUD_H, WALL, DESIGN.height - HUD_H).fill(wallFill);
    g.rect(0, HUD_H, DESIGN.width, WALL).fill(wallFill);

    const edge = { width: 1.5, color: 0x35d0d8, alpha: 0.5 };
    g.moveTo(WALL, FIELD.top).lineTo(WALL, DESIGN.height).stroke(edge);
    g.moveTo(DESIGN.width - WALL, FIELD.top).lineTo(DESIGN.width - WALL, DESIGN.height).stroke(edge);
    g.moveTo(WALL, FIELD.top).lineTo(DESIGN.width - WALL, FIELD.top).stroke(edge);

    // Faint deadline so the drop zone reads clearly.
    g.moveTo(FIELD.left, PADDLE.y + 26)
      .lineTo(FIELD.right, PADDLE.y + 26)
      .stroke({ width: 1, color: 0xff4d5a, alpha: 0.16 });

    this.gameContainer.addChild(g);
  }

  /**
   * Stand up the O.M.E.G.A. encounter.
   *
   * The boss sits behind the balls and capsules but above the playfield chrome,
   * so a ball threading a shield gap is never hidden behind the construct.
   */
  _buildBoss() {
    this.boss = new Boss();
    this.packetLayer = new Container();
    this.corruptionMeter = new CorruptionMeter();

    this.gameContainer.addChildAt(
      this.boss,
      this.gameContainer.getChildIndex(this.brickField) + 1,
    );
    this.gameContainer.addChild(this.packetLayer);
    this.view.addChild(this.corruptionMeter);

    this.boss.onFire = (x, y, dx, dy) => {
      const packet = new GlitchPacket(x, y, dx, dy);
      this.packetLayer.addChild(packet);
      this.packets.push(packet);
      this.ctx.audio.laser();
    };
  }

  _updateBoss(dt) {
    const boss = this.boss;
    if (!boss) return;

    const before = boss.shieldsRemaining;
    boss.update(dt, this.balls);
    if (boss.shieldsRemaining > before) this.ctx.audio.powerUp(false);

    this.corruptionMeter.update(dt);

    // Passive bleed-off, but only while the paddle is still clean. Once the
    // meter tops out it locks: the Purge Protocol is the only way back.
    if (!this.corrupted && this.corruption > 0 && CORRUPTION.decay > 0) {
      this._setCorruption(this.corruption - CORRUPTION.decay * dt);
    }

    this._updatePackets(dt);
  }

  _updatePackets(dt) {
    const p = this.paddle;

    for (let i = this.packets.length - 1; i >= 0; i--) {
      const packet = this.packets[i];
      packet.update(dt);

      if (!packet.dead && packet.hitsPaddle(p)) {
        packet.dead = true;
        this._setCorruption(this.corruption + CORRUPTION.perHit);
        this.triggerShake(SHAKE.packetHit.duration, SHAKE.packetHit.intensity);

        this.ctx.audio.metalPing();
        this.particles.burst(packet.x, packet.y, {
          count: 12,
          color: 0xff2e97,
          speed: 150,
          life: 0.4,
          size: 0.9,
          soft: true,
        });
      }

      if (packet.dead) {
        packet.destroy({ children: true });
        this.packets.splice(i, 1);
      }
    }
  }

  _clearPackets() {
    for (const packet of this.packets) {
      if (!packet.destroyed) packet.destroy({ children: true });
    }
    this.packets.length = 0;
  }

  _setCorruption(value) {
    const next = Math.max(0, Math.min(CORRUPTION.threshold, value));
    if (next === this.corruption) return;

    this.corruption = next;
    this.corruptionMeter?.set(next);

    const shouldCorrupt = next >= CORRUPTION.threshold;
    if (shouldCorrupt === this.corrupted) return;

    this.corrupted = shouldCorrupt;
    this.paddle.setCorrupted(shouldCorrupt);
    this.corruptionMeter?.setCorrupted(shouldCorrupt);

    if (shouldCorrupt) this.paddle.activateGlitch();
    else this.paddle.deactivateGlitch();

    if (shouldCorrupt) {
      this.ctx.audio.lifeLost();
      this._flashMessage('PADDLE CORRUPTED', 0xff2e97);
    }
  }

  /**
   * Purge Protocol pickup: the full system reboot.
   *
   * Reuses the existing `fire` ball flag for the plasma upgrade rather than
   * introducing a parallel one — fireball already means "destroy without
   * bouncing", which is exactly the behaviour wanted against the shields, and
   * the boss collision honours it alongside through-ball.
   */
  purgeProtocol() {
    this._setCorruption(0);

    if (this.corrupted) {
      this.corrupted = false;
      this.corruptionMeter?.setCorrupted(false);
    }
    this.paddle.setCorrupted(false);
    this.paddle.deactivateGlitch();

    // The single entry point to piercing. Boss-exclusive by construction: the
    // Purge Protocol capsule only drops from a Quantum Core hit.
    this._setPlasma(true, PLASMA.durationMs);
    // Display-only timer so the HUD shows the override ticking down.
    this._setTimer('plasma', PLASMA.durationMs / 1000, () => {}, 'purge');

    this.ctx.audio.extraLife();
    this._flashMessage('SYSTEM PURGED', 0x7cf9ff);

    this.particles.burst(this.paddle.x, this.paddle.top, {
      count: 40,
      color: 0x7cf9ff,
      speed: 260,
      life: 0.7,
      size: 1.2,
      soft: true,
      spread: Math.PI,
      direction: -Math.PI / 2,
    });
  }

  /* ----------------------------------------------------------- screen shake */

  /**
   * Kick off a shake.
   *
   * A weaker request never cuts short a stronger one already running: comparing
   * *current* amplitude rather than peak means a light packet hit during the
   * tail of a core hit is ignored, instead of visibly flattening it.
   *
   * @param {number} duration seconds
   * @param {number} intensity peak offset in design pixels
   */
  triggerShake(duration, intensity) {
    if (this.reduceMotion) return;

    const s = this.shake;
    if (s.time > 0) {
      const current = s.intensity * (s.time / s.duration);
      if (current > intensity) return;
    }

    s.duration = duration;
    s.time = duration;
    s.intensity = intensity;
  }

  _updateShake(dt) {
    const s = this.shake;
    const c = this.gameContainer;

    if (s.time <= 0) return;

    s.time -= dt;

    if (s.time <= 0) {
      s.time = 0;
      // Snap back exactly, never to an approximate rest position.
      c.position.set(this.shakeOrigin.x, this.shakeOrigin.y);
      return;
    }

    // Cosmetic source: shake must never consume gameplay randomness.
    const amplitude = s.intensity * (s.time / s.duration);
    c.x = this.shakeOrigin.x + cosmeticSigned() * amplitude;
    c.y = this.shakeOrigin.y + cosmeticSigned() * amplitude;
  }

  /* --------------------------------------------------------------- plasma */

  /**
   * Boss-exclusive Purge Protocol override.
   *
   * Each ball runs its own countdown, so this only has to switch state; the
   * layer is hidden the moment the last ball drops out, which skips the bloom
   * pass entirely.
   *
   * @param {boolean} on
   * @param {number} [durationMs]
   */
  _setPlasma(on, durationMs = PLASMA.durationMs) {
    this.plasmaActive = on;
    if (!this.plasmaLayer) return;

    for (const ball of this.balls) {
      if (on) ball.activatePlasmaMode(durationMs);
      else ball.deactivatePlasmaMode();
    }

    this.plasmaLayer.visible = on;
    if (!on) this._endTimer('plasma', false);
  }

  /** Remaining override time, so a ball spawned mid-plasma inherits it. */
  _plasmaRemainingMs() {
    const entry = this.timers.get('plasma');
    return entry ? Math.max(0, entry.t) * 1000 : PLASMA.durationMs;
  }

  _updatePlasmaTrails(dt) {
    if (!this.plasmaActive) return;

    for (const ball of this.balls) ball.update(dt);

    // The balls own the countdown; when none is left in plasma, stand down.
    if (!this.balls.some((b) => b.isPlasmaMode)) this._setPlasma(false);
  }

  // --- run state -----------------------------------------------------------

  addScore(points) {
    this.run.score += points;

    if (this.run.score >= this.run.nextExtraLife) {
      this.run.nextExtraLife += SCORE.extraLifeEvery;
      this.addLife();
    }

    this.hud.setScore(this.run.score);
  }

  addLife() {
    if (this.run.lives < RUN.maxLives) {
      this.run.lives++;
      this.hud.setLives(this.run.lives);
    }
    this.ctx.audio.extraLife();
  }

  _refreshHud() {
    this.hud.setScore(this.run.score);
    this.hud.setLives(this.run.lives);
    this.hud.setLevel(this.levelIndex, this.level.name);
  }

  // --- timers / power-ups --------------------------------------------------

  _setTimer(key, duration, onEnd, powerId) {
    this.timers.set(key, { t: duration, onEnd, powerId });
  }

  _endTimer(key, invoke = true) {
    const entry = this.timers.get(key);
    if (!entry) return;
    this.timers.delete(key);
    if (invoke) entry.onEnd?.();
  }

  /**
   * End every timer, running its onEnd so no power-up state survives the wipe.
   *
   * Drains rather than snapshots. An onEnd is allowed to install a follow-up in
   * the slot it just vacated — the Rebound's second stage does exactly that —
   * and a single pass over a snapshot would leave that replacement ticking into
   * the next life, where it would fire against a freshly reset paddle. The
   * pass guard bounds a pathological chain; nothing in the game gets near it.
   */
  _clearAllTimers() {
    for (let pass = 0; this.timers.size > 0 && pass < 8; pass++) {
      for (const key of [...this.timers.keys()]) this._endTimer(key, true);
    }
  }

  _updateTimers(dt) {
    for (const [key, entry] of [...this.timers]) {
      entry.t -= dt;
      if (entry.t <= 0) this._endTimer(key, true);
    }

    const actives = [];
    for (const entry of this.timers.values()) {
      const def = POWERUP_BY_ID[entry.powerId];
      if (def) actives.push(def);
    }
    this.hud.setPowers(actives);
  }

  setPaddleWidth(state, duration) {
    // Wide and Narrow share one slot: the newest pickup replaces the old.
    this._endTimer('width', false);
    this.paddle.setWidthState(state);
    this._setTimer('width', duration, () => this.paddle.setWidthState('normal'), state === 'big' ? 'big' : 'small');
  }

  /**
   * The Rebound Effect — the chemical decongestant trap capsule.
   *
   * Two stages sharing the single 'width' slot, which is what makes it behave
   * correctly against the rest of the table: a Wide or Narrow capsule caught
   * mid-rebound goes through `setPaddleWidth`, which cancels this slot without
   * invoking its onEnd, so the collapse is called off and the player is never
   * left with two owners fighting over the bat width. That is also the intended
   * escape hatch — the natural extract can rescue you from the rebound.
   *
   * Stage two is installed from stage one's onEnd. That is safe with the
   * existing wheel: `_updateTimers` walks a snapshot of the map and `_endTimer`
   * deletes the entry before calling onEnd, so the replacement lands in the map
   * without being decremented a second time in the same frame.
   */
  reboundEffect() {
    this._endTimer('width', false);

    // Instant relief: the widest the bat ever gets. Eased, like every other
    // width change, because this stage is supposed to feel earned.
    this.paddle.setWidthState(REBOUND.surgeWidth);

    this._setTimer('width', REBOUND.surge, () => this._reboundCrash(), 'rebound');
  }

  /** Rhinitis medicamentosa: the relief expires narrower than it began. */
  _reboundCrash() {
    // Reachable from _clearAllTimers during a death or a level change. Restore
    // the neutral width and install nothing — punishing a paddle that is about
    // to be reset just leaks a timer into the next life.
    if (this.state !== 'play' && this.state !== 'serve') {
      this.paddle.setWidthState('normal');
      return;
    }

    // Snapped, not eased. See Paddle.setWidthState.
    this.paddle.setWidthState(REBOUND.crashWidth, true);

    this.ctx.audio.powerUp(false);
    this.triggerShake(SHAKE.packetHit.duration, SHAKE.packetHit.intensity);

    this.particles.burst(this.paddle.x, this.paddle.y, {
      count: 16,
      color: 0xd6202f,
      speed: 150,
      life: 0.5,
      size: 1,
      soft: true,
    });

    this._floatText('REBOUND!', this.paddle.x, this.paddle.top - 34, 0xd6202f, { size: 18 });

    // Same slot again, so the recovery stays cancellable by any width capsule
    // the player can still reach with a 34px bat. Reported to the HUD as
    // 'small': that icon already means "your paddle is narrow", and the player
    // does not need a third piece of iconography to be told so.
    this._setTimer('width', REBOUND.crash, () => this.paddle.setWidthState('normal'), 'small');
  }

  setPaddleMode(mode, duration) {
    this._endTimer('mode', false);
    this.paddle.setMode(mode);
    this._setTimer('mode', duration, () => {
      this.paddle.setMode('normal');
      this._releaseHeldBalls();
    }, mode === 'sticky' ? 'catch' : 'laser');
  }

  /**
   * Timed ball modifier. Only Through Ball reaches this now — piercing via
   * `fire` is owned exclusively by plasma mode and is never granted by a
   * capsule.
   *
   * @param {'fire'|'through'} flag
   * @param {number} duration seconds
   */
  setBallFlag(flag, duration) {
    const setter = flag === 'fire' ? 'setFire' : 'setThrough';
    for (const b of this.balls) b[setter](true);

    this._endTimer(flag, false);
    this._setTimer(flag, duration, () => {
      for (const b of this.balls) b[setter](false);
    }, flag);
  }

  setSpeedModifier(kind, duration) {
    // Slow and Fast occupy the same slot and cancel one another.
    this._endTimer('speed', false);
    this.speedMod = kind === 'slow' ? BALL.slowFactor : BALL.fastFactor;
    this._setTimer('speed', duration, () => {
      this.speedMod = 1;
    }, kind);
  }

  setZap(duration) {
    this._endTimer('zap', false);
    this.zapped = true;
    this._setTimer('zap', duration, () => {
      this.zapped = false;
    }, 'zap');
  }

  killPaddle() {
    this._loseLife();
  }

  warpLevel() {
    this._completeLevel(true);
  }

  splitBalls(extra) {
    const sources = this.balls.slice(0, Math.max(1, Math.floor(MAX_BALLS / (extra + 1))));

    for (const src of sources) {
      for (let i = 0; i < extra; i++) {
        if (this.balls.length >= MAX_BALLS) return;

        const ball = this._createBall();
        ball.position.copyFrom(src.position);

        // Fan the clones out from the parent's heading.
        const angle = Math.atan2(src.dy, src.dx) + (i === 0 ? 0.45 : -0.45);
        ball.setDirection(Math.cos(angle), Math.sin(angle));
        if (ball.dy > 0 && ball.y > PADDLE.y - 60) ball.dy = -Math.abs(ball.dy);
        ball.normalise();
      }
    }
  }

  // --- balls ---------------------------------------------------------------

  _createBall() {
    const ball = new Ball();
    ball.setFire(this.timers.has('fire'));
    ball.setThrough(this.timers.has('through'));
    ball.speed = this._currentSpeed();
    this.ballLayer.addChild(ball);

    ball.setLayers({
      home: this.ballLayer,
      plasmaGroup: this.plasmaBallGroup,
      trailGroup: this.trailGroup,
    });
    ball.onPlasmaEnd = () => {
      if (!this.balls.some((b) => b.isPlasmaMode)) this._setPlasma(false);
    };

    if (this.plasmaActive) ball.activatePlasmaMode(this._plasmaRemainingMs());
    this.balls.push(ball);
    return ball;
  }

  _currentSpeed() {
    const base = BALL.baseSpeed + this.levelIndex * BALL.speedPerLevel;
    const ramp = 1 + BALL.rampPerSecond * this.rallyTime;
    return Math.min(BALL.maxSpeed, base * ramp * this.speedMod);
  }

  _serve() {
    this.state = 'serve';
    this.rallyTime = 0;
    this.rallyBreaks = 0;

    for (const ball of this.balls) ball.destroy({ children: true });
    this.balls.length = 0;
    this.ballLayer.removeChildren();

    const ball = this._createBall();
    ball.stuckOffset = 0;
    ball.x = this.paddle.x;
    ball.y = this.paddle.top - ball.radius - 1;

    this._showMessage(this.levelIndex === 0 ? 'CLICK OR PRESS SPACE' : 'GET READY', 1.4);
  }

  _releaseHeldBalls() {
    for (const ball of this.balls) {
      if (!ball.held) continue;
      const t = clamp(ball.stuckOffset / this.paddle.halfWidth, -1, 1);
      const angle = t * BALL.maxPaddleAngle * 0.8;
      ball.launch(Math.abs(angle) < 0.12 ? (Math.random() - 0.5) * 0.4 : angle);
    }
  }

  // --- main loop -----------------------------------------------------------

  update(dt) {
    const { input, audio } = this.ctx;

    if (input.consumePause()) {
      this._setPaused(!this.paused);
      return;
    }
    if (this.paused) return;

    dt = Math.min(dt, MAX_DT);

    this._tickPending(dt);
    this._updateTimers(dt);

    this.paddle.update(dt, input, this.ctx.save.settings, this.zapped);

    if (this.state === 'play') this.rallyTime += dt;

    // Launch / release from the sticky paddle.
    if (input.consumeLaunch()) {
      audio.unlock();
      if (this.state === 'serve') {
        this.state = 'play';
        this._releaseHeldBalls();
        this._hideMessage();
      } else if (this.state === 'play') {
        this._releaseHeldBalls();
      }
    }

    this._updateLasers(dt);
    this._updateBoss(dt);
    this._updateBalls(dt);
    this._updateCapsules(dt);
    this._updatePlasmaTrails(dt);
    this.particles.update(dt);
    this._updateFloaters(dt);

    if (this.paddle.corrupted) this.paddle.updateGlitch(dt);
    this._updateShake(dt);

    if (this.state === 'play' && this._levelBeaten()) this._completeLevel(false);
  }

  /**
   * A boss level has no brick wall, so `brickField.cleared` is true from the
   * first frame. The encounter ends when the Construct does.
   */
  _levelBeaten() {
    if (this.boss) return this.boss.dead;
    return this.brickField.cleared;
  }

  _updateBalls(dt) {
    const speed = this._currentSpeed();

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      if (ball.held) {
        ball.x = clamp(
          this.paddle.x + ball.stuckOffset,
          FIELD.left + ball.radius,
          FIELD.right - ball.radius,
        );
        ball.y = this.paddle.top - ball.radius - 1;
        continue;
      }

      ball.speed = speed;
      this._moveBall(ball, dt);

      if (ball.dead) {
        this.particles.burst(ball.x, Math.min(ball.y, DESIGN.height - 4), {
          count: 10,
          color: 0xff4d5a,
          speed: 90,
          gravity: -60,
          size: 0.9,
        });
        ball.destroy({ children: true });
        this.balls.splice(i, 1);
      }
    }

    if (this.state === 'play' && this.balls.length === 0) this._loseLife();
  }

  /**
   * Substepped integration.
   *
   * The ball is advanced in slices no larger than a few pixels so it can never
   * tunnel through a brick or the paddle, no matter how high the speed gets or
   * how badly a frame stalls.
   */
  _moveBall(ball, dt) {
    const distance = ball.speed * dt;
    const steps = Math.max(1, Math.ceil(distance / 4));
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      ball.step(sdt);

      this._collideWalls(ball);
      this._collideBricks(ball);
      // Runs inside the same substep as the brick test, so a ball threading a
      // shield gap at full speed can't tunnel through a segment either.
      if (this.boss) this._collideBoss(ball);
      this._collidePaddle(ball);

      if (ball.y - ball.radius > DESIGN.height + 8) {
        ball.dead = true;
        return;
      }
    }
  }

  _collideWalls(ball) {
    const r = ball.radius;
    let hit = false;

    if (ball.x - r < FIELD.left) {
      ball.x = FIELD.left + r;
      ball.dx = Math.abs(ball.dx);
      hit = true;
    } else if (ball.x + r > FIELD.right) {
      ball.x = FIELD.right - r;
      ball.dx = -Math.abs(ball.dx);
      hit = true;
    }

    if (ball.y - r < FIELD.top) {
      ball.y = FIELD.top + r;
      ball.dy = Math.abs(ball.dy);
      hit = true;
    }

    if (hit) {
      ball.clampDirection();
      this.ctx.audio.wallBounce();

      // Normal points back into the field, so sparks spray off the wall.
      const nx = ball.x < DESIGN.width / 2 ? 1 : -1;
      const along = ball.y - r < FIELD.top + 1 ? 0 : nx;
      this.particles.sparks(ball.x, ball.y, along, along === 0 ? 1 : -0.2, {
        count: VFX.wallImpact.sparks,
        color: 0x9fe9ed,
        speed: VFX.wallImpact.speed,
      });
      this.particles.flash(ball.x, ball.y, { color: 0x9fe9ed, size: VFX.wallImpact.flash });
    }
  }

  /**
   * Signature paddle deflection.
   *
   * The bounce angle is a function of where the ball lands relative to the
   * paddle's centre, not of the incoming angle — that is what lets a player aim.
   * Dead centre returns the ball straight up; the outer edge deflects it by
   * `maxPaddleAngle`. Paddle motion at the moment of contact adds a little
   * english on top, so you can nudge a shot by sliding into it.
   */
  _collidePaddle(ball) {
    if (ball.dy <= 0 || ball.held) return;

    const p = this.paddle;
    const r = ball.radius;

    if (ball.y + r < p.top || ball.y - r > p.bottom) return;
    if (ball.x + r < p.left || ball.x - r > p.right) return;

    ball.y = p.top - r - 0.5;

    // The rally is over the moment the ball comes home, however it is received.
    // Grab counts: the ball is on the bat, the streak has been interrupted.
    this.rallyBreaks = 0;

    if (p.mode === 'sticky') {
      ball.stuckOffset = clamp(ball.x - p.x, -p.halfWidth + 4, p.halfWidth - 4);
      this.ctx.audio.paddleBounce();
      return;
    }

    let t = (ball.x - p.x) / p.halfWidth;
    t = clamp(t + (p.vx / PADDLE.keySpeed) * BALL.paddleEnglish, -1, 1);

    ball.launch(t * BALL.maxPaddleAngle);
    this.ctx.audio.paddleBounce();

    // Sparks fire straight up off the bat, biased by where the ball landed, so
    // the visual echoes the shot the player just aimed.
    this.particles.sparks(ball.x, p.top, t * 0.7, -1, {
      count: VFX.paddleImpact.sparks,
      color: 0x35d0d8,
      speed: VFX.paddleImpact.speed,
    });
    this.particles.flash(ball.x, p.top, { color: 0x9ff4f8, size: VFX.paddleImpact.flash });
  }

  _collideBricks(ball) {
    const r = ball.radius;

    for (const brick of this.brickField.candidates(
      ball.x - r,
      ball.y - r,
      ball.x + r,
      ball.y + r,
    )) {
      // Overlap depth on each axis; the shallower one is the face we struck.
      const ox = brick.bw / 2 + r - Math.abs(ball.x - brick.centerX);
      const oy = brick.bh / 2 + r - Math.abs(ball.y - brick.centerY);
      if (ox <= 0 || oy <= 0) continue;

      const result = this.brickField.damage(brick, 1, { fire: ball.fire });
      this._resolveBrickResult(result, brick, ball.x, ball.y);

      // Counted here rather than inside _resolveBrickResult, which the lasers
      // also call: the reflex is built by the ball's unbroken run at the wall,
      // and letting turret fire feed it would make it trivial to farm.
      if (result.destroyed.length > 0) {
        this.rallyBreaks += result.destroyed.length;
        if (this.rallyBreaks >= SNEEZE.threshold) this._triggerSneeze();
      }

      // Through-ball ignores anything it can break; fire ignores what it burned.
      const passes =
        (ball.through && brick.breakable && !result.blocked) ||
        (ball.fire && result.destroyed.length > 0);

      if (!passes) {
        if (ox < oy) {
          const sign = Math.sign(ball.x - brick.centerX) || 1;
          ball.x += sign * ox;
          ball.dx = Math.abs(ball.dx) * sign;
        } else {
          const sign = Math.sign(ball.y - brick.centerY) || 1;
          ball.y += sign * oy;
          ball.dy = Math.abs(ball.dy) * sign;
        }
        ball.clampDirection();
      }

      // One brick per substep keeps reflections predictable in tight corners.
      return;
    }
  }

  /**
   * Ball against the Construct. The boss owns the geometry and performs the
   * reflection; the scene reacts to what happened.
   */
  _collideBoss(ball) {
    const hit = this.boss.collide(ball);
    if (!hit) return;

    const { audio } = this.ctx;

    if (hit.type === 'shield') {
      if (hit.destroyed) {
        audio.brickBreak(hit.ringIndex * 3);
        this.addScore(SCORE.brick);
        this.triggerShake(SHAKE.shieldBreak.duration, SHAKE.shieldBreak.intensity);
        this.particles.debris(hit.x, hit.y, {
          color: hit.ringIndex === 0 ? 0x4d7bff : 0x35d0d8,
          count: 12,
          speed: 240,
        });
        this.particles.flash(hit.x, hit.y, { color: 0xbfe4ff, size: 0.7 });
      } else {
        audio.metalPing();
        this.particles.sparks(hit.x, hit.y, 0, -1, {
          count: 8,
          color: 0xdfe8ff,
          speed: 240,
        });
      }
      return;
    }

    // Core contact.
    if (!hit.damaged) {
      audio.metalPing();
      return;
    }

    audio.explosion();
    this.addScore(PURGE.coreHitScore);
    this.triggerShake(SHAKE.coreHit.duration, SHAKE.coreHit.intensity);

    this.particles.debris(hit.x, hit.y, {
      color: 0x7cf9ff,
      count: 22,
      speed: 300,
      life: 0.85,
      size: 1.2,
    });
    this.particles.flash(hit.x, hit.y, { color: 0xffffff, size: 1.6, life: 0.26 });

    if (this.boss.dead) {
      this._onBossDefeated();
      return;
    }

    // Every landed core hit drops the relief capsule.
    this._spawnPurgeCapsule(this.boss.x, this.boss.y);
    this._flashMessage('CORE BREACH', 0x7cf9ff);
  }

  _spawnPurgeCapsule(x, y) {
    const capsule = new Capsule(PURGE_PROTOCOL, x, y);
    this.capsuleLayer.addChild(capsule);
    this.capsules.push(capsule);
  }

  _onBossDefeated() {
    this.boss.onFire = null;
    this._clearPackets();
    this.addScore(PURGE.bossClearScore);
    this._flashMessage('CONSTRUCT PURGED', 0x7cf9ff);
    this.triggerShake(SHAKE.bossDefeat.duration, SHAKE.bossDefeat.intensity);

    for (let i = 0; i < 10; i++) {
      this._wait(i * 0.09, () =>
        this.particles.burst(
          this.boss.x + (Math.random() - 0.5) * 160,
          this.boss.y + (Math.random() - 0.5) * 160,
          { count: 22, color: 0x7cf9ff, speed: 240, life: 0.7, size: 1.2, soft: true },
        ),
      );
    }

    this.ctx.audio.explosion();
  }

  _resolveBrickResult(result, brick, x, y) {
    const { audio } = this.ctx;

    if (result.blocked) {
      audio.metalPing();

      // Metal gives nothing back but sparks — the loudest visual in the game
      // for the least productive hit.
      const nx = x - brick.centerX;
      const ny = y - brick.centerY;
      const len = Math.hypot(nx, ny) || 1;
      this.particles.sparks(x, y, nx / len, ny / len, {
        count: VFX.metalImpact.sparks,
        color: 0xfff0c2,
        speed: VFX.metalImpact.speed,
      });
      this.particles.flash(x, y, { color: 0xffffff, size: VFX.metalImpact.flash });
      return;
    }

    if (result.revealed && !result.destroyed.length) {
      audio.brickHit(brick.row);
      this.particles.burst(brick.centerX, brick.centerY, {
        count: 8,
        color: brick.color,
        speed: 70,
        life: 0.3,
        size: 0.7,
      });
      return;
    }

    if (result.damaged) {
      audio.brickHit(brick.row);
      this.particles.burst(x, y, { count: 5, color: 0xffffff, speed: 80, life: 0.24, size: 0.6 });
      return;
    }

    if (!result.destroyed.length) return;

    let explosive = false;
    let drops = 0;

    for (const info of result.destroyed) {
      this.addScore(info.points);

      if (info.kind === 'explosive') {
        explosive = true;
        this.particles.debris(info.x, info.y, {
          color: 0xffd23f,
          count: VFX.blast.count,
          speed: VFX.blast.speed,
          life: VFX.blast.life,
          spin: VFX.blast.spin,
          size: 1.3,
        });
        this.particles.flash(info.x, info.y, { color: 0xfff0c2, size: 1.4, life: 0.24 });
      } else {
        this.particles.debris(info.x, info.y, { color: info.color });
        this.particles.flash(info.x, info.y, { color: info.color, size: 0.5 });
      }

      // Cap drops so a big chain doesn't bury the player in capsules.
      if (drops < 2 && Math.random() < CAPSULE.dropChance) {
        drops++;
        this._spawnCapsule(info.x, info.y);
      }
    }

    if (explosive) audio.explosion();
    else audio.brickBreak(brick.row);
  }

  // --- capsules ------------------------------------------------------------

  _spawnCapsule(x, y) {
    const capsule = new Capsule(rollPowerUp(), x, y);
    this.capsuleLayer.addChild(capsule);
    this.capsules.push(capsule);
  }

  _updateCapsules(dt) {
    const p = this.paddle;

    // Iterate a snapshot: applying a power-up can empty the live array from
    // underneath us (Kill Paddle loses a life, Level Warp ends the level), and
    // both call _clearCapsules().
    const snapshot = this.capsules.slice();

    for (const capsule of snapshot) {
      if (capsule.destroyed) continue;

      capsule.update(dt);

      const caught =
        capsule.y + capsule.halfH >= p.top &&
        capsule.y - capsule.halfH <= p.bottom &&
        capsule.x + capsule.halfW >= p.left &&
        capsule.x - capsule.halfW <= p.right;

      if (caught) {
        this.ctx.audio.powerUp(capsule.def.good);
        this.particles.burst(capsule.x, capsule.y, {
          count: 14,
          color: capsule.def.color,
          speed: 120,
          life: 0.4,
          size: 0.9,
          soft: true,
        });
        this._flashMessage(capsule.def.label, capsule.def.color);

        const def = capsule.def;
        this._removeCapsule(capsule);
        applyPowerUp(this, def);
        continue;
      }

      if (capsule.y - capsule.halfH > DESIGN.height) this._removeCapsule(capsule);
    }
  }

  _removeCapsule(capsule) {
    const i = this.capsules.indexOf(capsule);
    if (i >= 0) this.capsules.splice(i, 1);
    if (!capsule.destroyed) capsule.destroy({ children: true });
  }

  _clearCapsules() {
    for (const c of this.capsules) {
      if (!c.destroyed) c.destroy({ children: true });
    }
    this.capsules.length = 0;
  }

  // --- lasers --------------------------------------------------------------

  _updateLasers(dt) {
    const { input, audio } = this.ctx;

    this.laserCooldown -= dt;

    if (
      this.state === 'play' &&
      this.paddle.mode === 'laser' &&
      input.firing &&
      this.laserCooldown <= 0
    ) {
      this.laserCooldown = LASER.cooldown;
      for (const side of [-1, 1]) {
        const bolt = new Sprite(TEX.laser);
        bolt.anchor.set(0.5, 1);
        bolt.blendMode = 'add';
        bolt.x = this.paddle.x + side * (this.paddle.halfWidth - 7);
        bolt.y = this.paddle.top - 4;
        this.laserLayer.addChild(bolt);
        this.lasers.push(bolt);
      }
      audio.laser();
    }

    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const bolt = this.lasers[i];
      bolt.y -= LASER.speed * dt;

      let consumed = bolt.y < FIELD.top;

      if (!consumed) {
        for (const brick of this.brickField.candidates(bolt.x, bolt.y - LASER.h, bolt.x, bolt.y)) {
          const result = this.brickField.damage(brick, LASER.damage);
          this._resolveBrickResult(result, brick, bolt.x, bolt.y);
          consumed = true;
          break;
        }
      }

      if (!consumed && this.boss) {
        const hit = this.boss.damageAt(bolt.x, bolt.y - LASER.h / 2, LASER.w / 2);
        if (hit) {
          consumed = true;
          if (hit.destroyed) {
            audio.brickBreak(hit.ringIndex * 3);
            this.addScore(SCORE.brick);
          } else {
            audio.metalPing();
          }
          this.particles.burst(hit.x, hit.y, {
            count: hit.destroyed ? 14 : 4,
            color: hit.ringIndex === 0 ? 0x4d7bff : 0x35d0d8,
            speed: 150,
            life: 0.4,
            size: 0.9,
          });
        }
      }

      if (consumed) {
        bolt.destroy();
        this.lasers.splice(i, 1);
      }
    }

    if (this.state === 'play' && this._levelBeaten()) this._completeLevel(false);
  }

  _clearLasers() {
    for (const b of this.lasers) b.destroy();
    this.lasers.length = 0;
  }

  // --- life / level transitions -------------------------------------------

  _loseLife() {
    if (this.state === 'lost' || this.state === 'clear') return;

    this.state = 'lost';
    this.ctx.audio.lifeLost();

    this.particles.burst(this.paddle.x, this.paddle.y, {
      count: 30,
      color: 0xff4d5a,
      speed: 200,
      life: 0.7,
      size: 1.2,
      soft: true,
    });

    this._clearAllTimers();
    this._clearCapsules();
    this._clearLasers();
    this._clearPackets();
    this._clearFloaters();
    this.speedMod = 1;
    this.zapped = false;
    this.rallyBreaks = 0;

    // Losing a ball already costs a life; carrying the corruption debuff into
    // the next one would compound the punishment.
    this.corruption = 0;
    this.corrupted = false;
    this.corruptionMeter?.set(0);
    this.corruptionMeter?.setCorrupted(false);
    this.paddle.deactivateGlitch();
    this._setPlasma(false);

    for (const ball of this.balls) ball.destroy({ children: true });
    this.balls.length = 0;

    this.run.lives--;
    this.hud.setLives(this.run.lives);

    if (this.run.lives < 0) {
      this._showMessage('GAME OVER', 0);
      this.ctx.audio.gameOver();
      this._wait(2.2, () => this._finish(false));
    } else {
      this._showMessage('BALL LOST', 1.2);
      this._wait(1.3, () => {
        this.paddle.reset();
        this._serve();
      });
    }
  }

  _completeLevel(warped) {
    if (this.state === 'clear') return;

    this.state = 'clear';
    this.ctx.audio.levelWin();
    this.addScore(SCORE.levelClear + this.run.lives * 250);

    this._clearCapsules();
    this._clearLasers();
    this._clearPackets();
    if (this.boss) this.boss.onFire = null;
    for (const ball of this.balls) ball.destroy({ children: true });
    this.balls.length = 0;

    this._showMessage(warped ? 'LEVEL WARP' : 'LEVEL CLEAR', 0);

    for (let i = 0; i < 6; i++) {
      this._wait(i * 0.12, () =>
        this.particles.burst(
          FIELD.left + Math.random() * (FIELD.right - FIELD.left),
          FIELD.top + Math.random() * 220,
          { count: 18, color: 0xffd23f, speed: 200, life: 0.7, size: 1.1, soft: true },
        ),
      );
    }

    this._wait(1.9, () => {
      const next = this.levelIndex + 1;
      this.ctx.save.unlock(next + 1);

      if (next >= LEVELS.length) this._finish(true);
      else this.ctx.sm.change(GameScene, { levelIndex: next, run: this.run });
    });
  }

  async _finish(won) {
    this.ctx.audio.stopMusic();
    const { ResultsScene } = await import('./results-scene.js');
    this.ctx.sm.change(ResultsScene, {
      won,
      score: this.run.score,
      level: this.levelIndex + 1,
    });
  }

  // --- messages & deferred work -------------------------------------------

  _showMessage(text, duration) {
    this.message.text = text;
    this.message.tint = 0xffffff;
    this.message.visible = true;
    if (duration > 0) this._wait(duration, () => this._hideMessage());
  }

  _flashMessage(text, color) {
    this.message.text = text.toUpperCase();
    this.message.tint = color;
    this.message.visible = true;
    this._wait(0.9, () => this._hideMessage());
  }

  _hideMessage() {
    this.message.visible = false;
  }

  /* ------------------------------------------------------------- sneeze -- */

  /**
   * The trigeminal reflex.
   *
   * Fires once the ball has broken SNEEZE.threshold bricks without returning to
   * the paddle, then resets the counter so a genuinely long rally can sneeze
   * again every eight breaks.
   *
   * Nothing here removes a brick. Multi-hit bricks give up one hit and
   * single-hit bricks — which have none to give — only fade, so the reflex can
   * never clear the last brick and end a level on its own, and
   * `brickField.remaining` is left exactly as it was for the clear check.
   *
   * Safe to call from inside a collision substep: it mutates `hits`, `alpha`
   * and the crack sprite, and touches neither the grid array nor `removed`, so
   * the generator `_collideBricks` is iterating stays valid.
   */
  _triggerSneeze() {
    this.rallyBreaks = 0;

    this.triggerShake(SHAKE.sneeze.duration, SHAKE.sneeze.intensity);
    this.ctx.audio.explosion();

    for (const brick of this.brickField.all()) {
      // Metal is not mucus, and an invisible brick stays hidden — revealing the
      // wall's secrets is a level-design decision, not a side effect of a combo.
      if (!brick.breakable || brick.hidden) continue;

      if (brick.hits > SNEEZE.loosen) {
        brick.hits -= SNEEZE.loosen;
        brick.refreshDamage();
      } else {
        brick.alpha = SNEEZE.loosenedAlpha;
      }
    }

    // One puff for the whole reflex, not one per brick. The particle pool is
    // hard-capped (VFX.max), so a burst per brick would drain the budget and
    // starve every impact effect on screen for the next second.
    this.particles.burst(this.paddle.x, this.paddle.top - 12, {
      count: 24,
      color: SNEEZE.color,
      speed: 270,
      life: 0.55,
      size: 1.1,
      soft: true,
    });

    this._floatText(SNEEZE.label, this.paddle.x, this.paddle.top - 46, SNEEZE.color, { size: 24 });
  }

  /* ------------------------------------------------------ floating text -- */

  /**
   * A short-lived label that rises and fades at a point on the field.
   *
   * Deliberately not `_flashMessage`. That one drives the single centred
   * message label, which the state machine also owns for GET READY / BALL LOST
   * — a sneeze mid-rally would steal it, and the deferred `_hideMessage` it
   * queues would then blank whatever the state machine posted next.
   *
   * Parented to `gameContainer`, so the label rides the shake it just fired.
   */
  _floatText(text, x, y, color = 0xffffff, { size = 22, life = 1.1, rise = 44 } = {}) {
    const label = makeText(text, { size, color, anchor: 0.5, title: true });
    label.position.set(clamp(x, FIELD.left + 48, FIELD.right - 48), y);

    this.gameContainer.addChild(label);
    this._floaters.push({ label, t: 0, life, rise, y0: y });
  }

  _updateFloaters(dt) {
    for (let i = this._floaters.length - 1; i >= 0; i--) {
      const f = this._floaters[i];
      f.t += dt;

      const k = f.t / f.life;

      if (k >= 1) {
        f.label.destroy();
        this._floaters.splice(i, 1);
        continue;
      }

      f.label.y = f.y0 - f.rise * k;
      // Hold at full opacity for the first third so the word is actually read,
      // then fade over the remainder.
      f.label.alpha = k < 0.34 ? 1 : 1 - (k - 0.34) / 0.66;
      // A single pop on entry, settling back to 1.
      f.label.scale.set(1 + Math.sin(Math.min(1, k * 4.5) * Math.PI) * 0.2);
    }
  }

  _clearFloaters() {
    for (const f of this._floaters) f.label.destroy();
    this._floaters.length = 0;
  }

  /** Frame-driven delay so pausing also pauses pending transitions. */
  _wait(seconds, fn) {
    this._pending.push({ t: seconds, fn });
  }

  _tickPending(dt) {
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const job = this._pending[i];
      job.t -= dt;
      if (job.t <= 0) {
        this._pending.splice(i, 1);
        job.fn();
      }
    }
  }

  // --- pause ---------------------------------------------------------------

  _setPaused(on) {
    if (this.paused === on) return;
    this.paused = on;
    this.ctx.audio.setMuted(on);

    if (on) this._buildPauseMenu();
    else this._destroyPauseMenu();

    this.ctx.input.clearQueued();
  }

  _buildPauseMenu() {
    const { input, audio } = this.ctx;

    this.pauseLayer = new Container();

    const dim = new Graphics().rect(0, 0, DESIGN.width, DESIGN.height).fill({
      color: 0x05050b,
      alpha: 0.78,
    });
    this.pauseLayer.addChild(dim);

    const box = panel(300, 250);
    box.position.set((DESIGN.width - 300) / 2, 110);
    this.pauseLayer.addChild(box);

    const title = makeText('PAUSED', { size: 30, anchor: 0.5, title: true });
    title.position.set(DESIGN.width / 2, 152);
    this.pauseLayer.addChild(title);

    const menu = new VerticalMenu(input, audio, { spacing: 50 });
    menu.position.set((DESIGN.width - 240) / 2, 195);

    menu.add(
      new Button('RESUME', () => this._setPaused(false), { width: 240 }),
    );
    menu.add(
      new Button('RESTART LEVEL', () => {
        audio.setMuted(false);
        this.ctx.sm.change(GameScene, {
          levelIndex: this.levelIndex,
          run: { score: 0, lives: RUN.startingLives, nextExtraLife: SCORE.extraLifeEvery },
        });
      }, { width: 240 }),
    );
    menu.add(
      new Button('QUIT TO MENU', async () => {
        audio.setMuted(false);
        audio.stopMusic();
        const { MenuScene } = await import('./menu-scene.js');
        this.ctx.sm.change(MenuScene, {});
      }, { width: 240, accent: 0xff4d5a }),
    );

    this.pauseLayer.addChild(menu);
    this.view.addChild(this.pauseLayer);
  }

  _destroyPauseMenu() {
    if (!this.pauseLayer) return;
    this.view.removeChild(this.pauseLayer);
    this.pauseLayer.destroy({ children: true });
    this.pauseLayer = null;
  }

  exit() {
    this._setPlasma(false);
    this.paddle?.deactivateGlitch();
    this.gameContainer?.position.set(this.shakeOrigin.x, this.shakeOrigin.y);
    if (this.boss) this.boss.onFire = null;
    this.packets.length = 0;
    this._offVisibility?.();
    this._destroyPauseMenu();
    this._clearFloaters();
    this.ctx.audio.setMuted(false);
    this.timers.clear();
    this._pending.length = 0;
  }
}
