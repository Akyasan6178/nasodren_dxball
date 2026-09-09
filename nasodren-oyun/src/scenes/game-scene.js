import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { cosmeticSigned } from '../core/rng.js';
import { Scene } from '../core/scene-manager.js';
import {
  BALL,
  CAPSULE,
  CAVITY,
  CORRUPTION,
  DESIGN,
  difficultyControlScale,
  difficultySpeedScale,
  FIELD,
  HUD_H,
  LASER,
  LEVEL_TIMER,
  MAX_DT,
  PADDLE,
  PLASMA,
  PURGE,
  REBOUND,
  SHAKE,
  SNEEZE,
  TRIAL,
  RUN,
  SCORE,
  VFX,
  WALL,
} from '../game/config.js';
import { LEVELS } from '../game/levels.js';
import { TEX } from '../game/textures.js';
import { BrickField } from '../game/bricks.js';
import { SEPTUM_X } from '../game/cavity.js';
import { Paddle } from '../game/paddle.js';
import { Ball } from '../game/ball.js';
import { Particles } from '../game/particles.js';
import {
  Capsule,
  POWERUP_BY_ID,
  PURGE_PROTOCOL,
  REBOUND_CAPSULE,
  applyPowerUp,
  rollPowerUp,
} from '../game/powerups.js';
import { Boss } from '../game/boss.js';
import { GlitchPacket } from '../game/projectile.js';
import { CorruptionMeter } from '../game/corruption-meter.js';
import { Hud } from '../game/hud.js';
import { Button, VerticalMenu, makeText, panel } from '../game/ui.js';
import { TransitionScene } from './transition-scene.js';

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
      // Revive system state — see revive-scene.js. Threaded through every
      // GameScene on this run exactly like score and lives already are, so it
      // survives level transitions without any separate global.
      revivesUsed: 0,
      usedTips: [],
    };

    /**
     * Whether the Nasodren trial mechanics are live on this level.
     *
     * Resolved once, here, rather than tested against `levelIndex` at each call
     * site: a scene plays exactly one level, so the answer cannot change while
     * it runs, and the hot paths that consult it (one per destroyed brick) get
     * a boolean read instead of a config lookup.
     */
    this.trialMechanics = TRIAL.levelIndex === null || this.levelIndex === TRIAL.levelIndex;

    /**
     * Progressive difficulty — see DIFFICULTY in config.js. Resolved once,
     * here, for the same reason `trialMechanics` is: `levelIndex` cannot
     * change while this scene is alive, so every frame that reads it (ball
     * speed every substep, paddle English on every bounce) gets a plain
     * number instead of recomputing a power/clamp each time.
     */
    this._speedScale = difficultySpeedScale(this.levelIndex);
    this._controlScale = difficultyControlScale(this.levelIndex);

    /**
     * Capsules folded into this level's drop roll on top of the global table.
     *
     * Built once and reused for every roll, so spawning a capsule allocates
     * nothing extra. Empty on a non-trial level, which makes `rollPowerUp`
     * behave exactly as it did before the Rebound existed.
     */
    this._dropExtras = this.trialMechanics
      ? [{ def: REBOUND_CAPSULE, weight: TRIAL.reboundWeight }]
      : [];

    /**
     * Does this level stage its congestion inside the sinus?
     *
     * A pure presentation flag, and it is worth being explicit that it is no
     * longer anything else. It used to build a cluster of solid strokes the
     * ball bounced off; that idea is gone, because curved bumpers make a
     * breakout board impossible to aim in — see the note at the top of
     * cavity.js. What the flag decides now is entirely visual: whether the
     * wireframe is staged behind the play, and whether this level's
     * layout is validated for containment inside the tracts.
     *
     * FIELD is the boundary, on this level and every other, exactly as it was
     * before any of this. `_collideWalls` is the only thing that turns a ball
     * around, and nothing in the substep loop consults the anatomy.
     *
     * The boss is refused the flag regardless: the Construct patrols a band
     * straight through the aperture and would sit on top of the drawing.
     */
    this.cavityLevel = !!this.level.cavity && !this.level.boss;

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

    /**
     * Level-wide clock for the dynamic mechanics in bricks.js: a repeating
     * brick respawn every LEVEL_TIMER.spawnInterval seconds, and a one-shot
     * difficulty buff at LEVEL_TIMER.buffAt. A plain constructor field, so
     * Restart Level, Revive and advancing to the next level all reset it for
     * free — every one of those builds a fresh GameScene rather than reusing
     * this one.
     */
    this.levelTimer = 0;
    this._spawnTick = 0;
    this._buffed = false;
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

    // Denominators for the two fullness ratios that drive the nose colour, one
    // per cavity. Captured here because bricks only ever leave, so the counts at
    // construction are the totals this level started with.
    this.initialBrickCount = this._countBricksBySide();
    this.remainingBricks = { ...this.initialBrickCount };
    this._lastRemaining = this.brickField.remaining;

    this._buildSinusMeter();

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

    this._buildPauseButton();

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
    // Phase 1 reskin: a static background.png Sprite stands in for the
    // procedural sinus ground + glowing backdrop (see sinus.js, still intact
    // but no longer wired in here). Stretched to the full design canvas so it
    // always fills the scene regardless of the source image's own aspect
    // ratio. `this.backdrop` stays null; `_updateBackdrop` no-ops on that.
    this.backdrop = null;

    const background = new Sprite(TEX.background);

    // The mip chain and the anisotropic sampler are declared at load time on
    // the manifest entry in core/assets.js — that is the authoritative place,
    // because `mipLevelCount` is frozen when the GPU texture is created, and a
    // flag set after that is a flag set too late.
    //
    // This is the belt to that pair of braces, and it is not superfluous: a Vite
    // hot reload can hand this scene a source that was created before the
    // manifest entry above existed, and it would still be doing the same brutal
    // minification. Cheap and idempotent — the setters only write fields, and
    // the single `update()` is what publishes the change: without it the style
    // keeps its cached resource id and the renderer never rebuilds the sampler.
    //
    // GUARDED ON TEX.background, and that guard is the whole reason this is four
    // lines instead of three. `background` is the ONE image key in textures.js
    // with no procedural fallback bake, so a failed load leaves it undefined and
    // `new Sprite(undefined)` quietly resolves to the shared Texture.EMPTY. Force
    // a mip chain onto that and every white 1x1 in the game inherits it.
    if (TEX.background) {
      const source = background.texture.source;
      source.autoGenerateMipmaps = true;
      source.style.scaleMode = 'linear'; // magFilter + minFilter + mipmapFilter
      source.style.maxAnisotropy = 16;
      source.style.update();
    }

    // COVER-FIT, NOT STRETCH — and this, not the sampler above, is the bigger
    // half of the quality problem. background.png is 1920x1080 (aspect 1.778)
    // and the design box is 640x480 (aspect 1.333). Assigning `width` and
    // `height` scales the two axes INDEPENDENTLY: 0.333x across against 0.444x
    // down, so the artwork was squeezed 25% horizontally. Every curve in it was
    // drawn as an ellipse, and — worse for sharpness — each axis was resampled
    // at a different rate, which no amount of filtering can undo because the
    // distortion is in the geometry, not the sampling.
    //
    // Scale uniformly by whichever axis needs more coverage and let the surplus
    // hang off the sides. It is free to let it overflow: Viewport installs a
    // 640x480 mask on its root (see core/viewport.js), so the crop is already
    // being done by the same mask that draws the letterbox bars.
    //
    // WHAT THIS COSTS: 16:9 into 4:3 crops 240px from each end of the source,
    // leaving a 1440x1080 window onto the art. Anything composed hard against
    // the left or right edge of the PNG is now off-screen. If that matters more
    // than the distortion did, `Math.min` here letterboxes instead — but the
    // real answer is a 4:3 re-export, which also fixes the resolution ceiling
    // noted below.
    const cover = Math.max(
      DESIGN.width / background.texture.width,
      DESIGN.height / background.texture.height,
    );
    background.anchor.set(0.5);
    background.scale.set(cover);
    background.position.set(DESIGN.width / 2, DESIGN.height / 2);

    // THE REMAINING CEILING IS THE ASSET, NOT THE CODE, and it is worth writing
    // down so the next person does not go looking for another filter flag. With
    // cover-fit the visible 1440x1080 of source has to cover a board that is
    // 640*s by 480*s device pixels, where s = min(screenW/640, screenH/480) and
    // the screen is already multiplied by a device pixel ratio capped at 2:
    //
    //   1366x768  DPR 1   board 1024x768    0.71x  minified, mipmaps handle it
    //   1920x1080 DPR 1   board 1440x1080   1.00x  exactly native, ideal
    //   2560x1440 DPR 1   board 1920x1440   1.33x  MAGNIFIED, soft
    //   1440x900  DPR 2   board 2400x1800   1.67x  MAGNIFIED, visibly soft
    //
    // Past 1080p the texture is being enlarged, and mipmaps do nothing for
    // magnification — they only ever supply SMALLER levels. A 2560x1920 export
    // (4:3, so nothing is cropped either) stays native up to a 4.0x viewport,
    // which covers every case in that table.
    // The source art reads far brighter than the play layer sitting on top
    // of it — bricks and the ball were getting lost against it. A flat
    // multiply tint is the cheapest fix: darkens the whole image with zero
    // extra draw call, no separate overlay Sprite to keep in sync.
    background.tint = 0x666666;
    this.gameContainer.addChild(background);

    const g = new Graphics();

    // Side and top walls: structural chrome, and the collision surfaces. The
    // nose floats clear of all three by well over a hundred pixels, so these
    // are the boundary on every level again.
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
      this._flashMessage('RAKET BOZULDU', 0xff2e97);
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
    this._flashMessage('SİSTEM ARINDIRILDI', 0x7cf9ff);

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

  _updatePlasmaTrails() {
    if (!this.plasmaActive) return;

    // The per-ball tick — countdown and ribbon both — now runs in
    // `_updateBalls`, unconditionally, because the cyclamen has to spin outside
    // plasma too. Ticking here as well would decrement the countdown twice a
    // frame. All this method still owns is the stand-down.
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
    const base = BALL.baseSpeed * this._speedScale;
    const ramp = 1 + BALL.rampPerSecond * this.rallyTime;
    return Math.min(BALL.maxSpeed * this._speedScale, base * ramp * this.speedMod);
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

    this._showMessage(this.levelIndex === 0 ? 'TIKLA VEYA SPACE TUŞUNA BAS' : 'HAZIR OL', 1.4);
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
    this._updateLevelTimer(dt);

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
    this._updatePlasmaTrails();
    this.particles.update(dt);
    this._updateFloaters(dt);
    this._updateBackdrop(dt);
    this._updateSinusMeter(dt);

    if (this.paddle.corrupted) this.paddle.updateGlitch(dt);
    this._updateShake(dt);

    if (this.state === 'play' && this._levelBeaten()) this._completeLevel(false);
  }

  /**
   * Count the live breakable bricks either side of the septum.
   *
   * Walked off `brickField.grid` rather than decremented as bricks die. There
   * are several paths that destroy a brick — the ball, a laser, the Purge —
   * and a counter threaded through all of them is a counter that will
   * eventually be wrong on one of them, at which point a cavity either never
   * cools or cools early and nobody can tell why. Recounting has no such
   * failure mode.
   *
   * It is also cheaper than it looks. `_updateBackdrop` only calls this when
   * `brickField.remaining` has actually changed, so it runs a handful of times
   * per level rather than sixty times a second, and even then it is one pass
   * over at most 182 cells.
   *
   * A brick is assigned by the centre of its own box, so a brick straddling the
   * midline lands on the side it mostly sits in. Nothing in the shipped layouts
   * straddles — column 6 is empty on every row, because the septum is in it.
   */
  _countBricksBySide() {
    const side = { left: 0, right: 0 };

    for (const row of this.brickField.grid) {
      for (const brick of row) {
        if (!brick || brick.removed || !brick.breakable) continue;
        side[brick.centerX < SEPTUM_X ? 'left' : 'right']++;
      }
    }

    return side;
  }

  /**
   * Drive each cavity's colour from its own fullness ratio.
   *
   * ASYMMETRIC CLEARANCE. The two passages are tracked separately, so a player
   * who chews through the right cluster watches the right maxillary sinus cool
   * to cyan while the left is still inflamed. That is the whole point of the split:
   * `ratio` is per side, `1` while that side is fully blocked and `0` once it
   * is empty, and each side reaches the healthy end the moment its own last
   * brick goes — not when the level does.
   *
   * The backdrop is handed `1 - ratio` because everything downstream — the ramp
   * stops, the glow opacity, the throb — is authored as *clearance*, and
   * flipping the sense here rather than in four places there keeps one
   * convention through the whole chain.
   *
   * A side with no bricks of its own falls back to the level's overall ratio
   * rather than reporting 0. Otherwise any layout that happens to put nothing
   * in one passage would light that passage healthy-cyan from the first frame,
   * which is a claim about the player's progress that they have not earned. A
   * level with no bricks at all — the boss — holds both sides inflamed, which
   * is the right read for the chronic encounter anyway.
   *
   * WHERE THE COLOUR MATHS LIVES, AND WHY IT IS NOT IN THIS FILE. The
   * interpolation is in sinus.js, next to the drawing it feeds. Two reasons,
   * and both are about correctness rather than tidiness. The ratios are not
   * applied raw: each is eased toward over SINUS.ease seconds, because snapping
   * a colour to the live brick count steps that half of the drawing on every
   * break and reads as a flicker, while travelling toward it reads as
   * inflammation subsiding — and those two eased values are per-frame state
   * belonging to the thing being coloured. And each resulting colour drives
   * three tints with a different lift on one of them, which is a fact about how
   * the nose is drawn, not about how the level is going. This method owns the
   * question; sinus.js owns the answer.
   */
  _updateBackdrop(dt) {
    // Deactivated for Phase 1 — see _buildField(). Left in place rather than
    // deleted so the eased-clearance readout can be rewired onto the new
    // artwork later.
    if (!this.backdrop) return;

    if (this._lastRemaining !== this.brickField.remaining) {
      this._lastRemaining = this.brickField.remaining;
      this.remainingBricks = this._countBricksBySide();
    }

    const total = this.initialBrickCount;
    const overall = total.left + total.right > 0
      ? (this.remainingBricks.left + this.remainingBricks.right) / (total.left + total.right)
      : 1;

    const ratio = (key) =>
      total[key] > 0 ? this.remainingBricks[key] / total[key] : overall;

    this.backdrop.update(dt, 1 - ratio('left'), 1 - ratio('right'));
  }

  /**
   * Dynamic sinus-fullness meter: a small four-stage image in the corner of
   * the field — sinus1 (most inflamed/congested) down to sinus4 (cleanest) —
   * that tracks the level's own breakable-brick count. Scenery only: nothing
   * here is solid, and nothing here feeds back into `remaining` or the
   * level-clear check, which read the brick field directly regardless of
   * what this is currently showing.
   *
   * Positioned in the one corner of the field no layout ever authors a cell
   * into — columns 0-2 are outside the range `validateLevels` allows any
   * shape to occupy, see the note at the top of levels.js — so the meter
   * never has a brick drawn over it on any level, boss included.
   *
   * Skipped entirely on a level with nothing breakable to begin with (a
   * boss encounter): a meter with `_sinusTotal <= 0` would only ever divide
   * by zero.
   */
  _buildSinusMeter() {
    this._sinusTotal = this.brickField.remaining;
    if (this._sinusTotal <= 0) {
      this.sinusSprites = null;
      return;
    }

    // sinus1..4.png are all the same 134x102 source, so one aspect serves
    // every stage; `applyImageAssets()` may not have landed the real art yet
    // when this runs, so this is worked out from the ratio rather than read
    // off whichever texture (baked placeholder or real PNG) happens to be
    // in TEX.sinus1 at this exact moment.
    const w = 70;
    const h = w * (102 / 134);
    const x = FIELD.left + 14;
    const y = FIELD.top + 14;

    this.sinusSprites = ['sinus1', 'sinus2', 'sinus3', 'sinus4'].map((key, i) => {
      const sprite = new Sprite(TEX[key]);
      sprite.position.set(x, y);
      sprite.width = w;
      sprite.height = h;
      // Only the first stage starts visible — the level opens at 100%
      // remaining, which is stage 1 by definition.
      sprite.alpha = i === 0 ? 1 : 0;
      this.gameContainer.addChild(sprite);
      return sprite;
    });
  }

  /**
   * Eases every stage's alpha toward 1 (its own tier is current) or 0
   * (it isn't), every frame — a plain per-frame lerp is what turns "the tier
   * changed" into a crossfade with no extra timer or tween state to manage.
   *
   * Tier bounds match the brief exactly: 100-75% remaining is stage 1 (most
   * inflamed), stepping down to under 25% for stage 4 (cleanest).
   */
  _updateSinusMeter(dt) {
    if (!this.sinusSprites) return;

    // The 30s respawn mechanic (`spawnBricks`, see bricks.js) can push
    // `remaining` back above the count `_sinusTotal` was captured at when the
    // level opened. Left alone, that produces a ratio over 1.0 forever after
    // — the meter reads the level as permanently at its most-congested stage
    // no matter how much the player actually clears, since `remaining` can
    // never again reach the old (now too-small) denominator. Raising the
    // denominator to match keeps "remaining / total" meaning what it always
    // meant — the fraction of currently-possible bricks still standing — so a
    // respawn wave correctly reads as renewed congestion rather than breaking
    // the percentage math.
    if (this.brickField.remaining > this._sinusTotal) this._sinusTotal = this.brickField.remaining;

    const ratio = this.brickField.remaining / this._sinusTotal;
    const tier = ratio >= 0.75 ? 0 : ratio >= 0.5 ? 1 : ratio >= 0.25 ? 2 : 3;

    const FADE_RATE = 2.5; // higher = snappier crossfade, in units of 1/second
    for (let i = 0; i < this.sinusSprites.length; i++) {
      const target = i === tier ? 1 : 0;
      const sprite = this.sinusSprites[i];
      sprite.alpha += (target - sprite.alpha) * Math.min(1, dt * FADE_RATE);
    }
  }

  /**
   * Two dynamic mechanics on one clock, both defined on `brickField` (see
   * bricks.js) so this method stays a scheduler rather than a second copy of
   * their rules: a brick respawn every `LEVEL_TIMER.spawnInterval` seconds,
   * and a once-per-level HP buff at `LEVEL_TIMER.buffAt`.
   *
   * Never called while paused — `update()` returns before reaching this line
   * whenever `this.paused` is true — and reset for free on every fresh
   * GameScene, so Restart Level, Revive and the next level all start clean.
   */
  _updateLevelTimer(dt) {
    // Once the level is won there is nothing left for either mechanic to act
    // on — and a brick popping in during the "LEVEL CLEAR" transition would
    // read as a bug, not a feature.
    if (this.state === 'clear') return;

    this.levelTimer += dt;
    this.brickField.tickBuffs(dt);

    const tick = Math.floor(this.levelTimer / LEVEL_TIMER.spawnInterval);
    if (tick > this._spawnTick) {
      this._spawnTick = tick;
      const span = LEVEL_TIMER.spawnMax - LEVEL_TIMER.spawnMin + 1;
      const count = LEVEL_TIMER.spawnMin + Math.floor(Math.random() * span);
      this.brickField.spawnBricks(count);
    }

    if (!this._buffed && this.levelTimer >= LEVEL_TIMER.buffAt) {
      this._buffed = true;
      this.brickField.buffAllBricks();
    }
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
        // A held flower still turns. It is the only thing moving on the board
        // during a serve, and a frozen one reads as the game having hung.
        ball.update(dt);
        continue;
      }

      ball.speed = speed;
      this._moveBall(ball, dt);

      /**
       * Per-frame visual tick, once per ball, and ONLY from here.
       *
       * This used to live in `_updatePlasmaTrails`, which is gated on
       * `plasmaActive` — that was fine while the method held nothing but the
       * Purge countdown, and wrong the moment the cyclamen needed to spin
       * during ordinary play. Calling it from both places would run the plasma
       * countdown twice per frame and halve the power-up's duration, so
       * `_updatePlasmaTrails` no longer calls it at all.
       *
       * After the move rather than before, so the plasma ribbon samples the
       * position the ball actually ended the frame at.
       */
      ball.update(dt);

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

  /**
   * Ball against the playfield boundary: the rectangle, on every level.
   *
   * Called from inside the substep loop, so it cannot be tunnelled through.
   */
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
    t = clamp(t + (p.vx / PADDLE.keySpeed) * BALL.paddleEnglish * this._controlScale, -1, 1);

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
      // Gated to the trial level (TRIAL in config.js). Leading with the boolean
      // means every other level pays one register test per brick and nothing
      // else — the counter is not even maintained where it cannot fire.
      if (this.trialMechanics && result.destroyed.length > 0) {
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
    this._flashMessage('ÇEKİRDEK İHLALİ', 0x7cf9ff);
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
    this._flashMessage('YAPI ARINDIRILDI', 0x7cf9ff);
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

      // Bone gives nothing back but sparks — the loudest visual in the game
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

    if (result.damaged) {
      audio.brickHit(brick.row);
      // Tinted with the fluid palette rather than white: a partial hit is the
      // first fluid working loose, not a chip of stone.
      this.particles.burst(x, y, { count: 5, color: 0x9ff4f8, speed: 80, life: 0.24, size: 0.6 });
      return;
    }

    if (!result.destroyed.length) return;

    let drops = 0;

    for (const info of result.destroyed) {
      this.addScore(info.points);

      // Two substances leaving one break: the fluid the cavity is losing, and
      // the cyclamen that shifted it. They are emitted together and then
      // separate on their own, because PETAL and MUCUS disagree about gravity,
      // drag and life by roughly an order of magnitude each — the droplets are
      // gone before the petals have finished falling.
      this.particles.droplets(info.x, info.y);
      this.particles.petals(info.x, info.y);
      // The flash stays on the brick's own colour: it is the moment of the
      // break, before the fluid it was holding has gone anywhere.
      this.particles.flash(info.x, info.y, { color: info.color, size: 0.5 });

      // Cap drops so a big cascade doesn't bury the player in capsules.
      if (drops < 2 && Math.random() < CAPSULE.dropChance) {
        drops++;
        this._spawnCapsule(info.x, info.y);
      }
    }

    audio.brickBreak(brick.row);
  }

  // --- capsules ------------------------------------------------------------

  _spawnCapsule(x, y) {
    const capsule = new Capsule(rollPowerUp(this._dropExtras), x, y);
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

    // Game Over fires the moment lives hits zero — there is no bonus ball
    // hiding behind a 0 on the HUD. Reaching Revive or Results with `lives`
    // still readable as 0 (not -1) is what that display is showing.
    if (this.run.lives <= 0) {
      this._showMessage('OYUN BİTTİ', 0);
      this.ctx.audio.gameOver();
      this._wait(2.2, () => this._finish(false));
    } else {
      this._showMessage('TOP KAYBEDİLDİ', 1.2);
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

    this._showMessage(warped ? 'BÖLÜM ATLANDI' : 'BÖLÜM TAMAMLANDI', 0);

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
      else this.ctx.sm.change(TransitionScene, { next: GameScene, params: { levelIndex: next, run: this.run } });
    });
  }

  async _finish(won) {
    this.ctx.audio.stopMusic();
    const { ResultsScene } = await import('./results-scene.js');
    this.ctx.sm.change(ResultsScene, {
      won,
      score: this.run.score,
      level: this.levelIndex + 1,
      // Only meaningful on a loss — see ResultsScene's Revive button — but
      // passed either way rather than made conditional, so this stays the
      // one place that assembles a ResultsScene handoff.
      levelIndex: this.levelIndex,
      run: this.run,
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
   * and the tier texture, and touches neither the grid array nor `removed`,
   * so the generator `_collideBricks` is iterating stays valid.
   */
  _triggerSneeze() {
    this.rallyBreaks = 0;

    this.triggerShake(SHAKE.sneeze.duration, SHAKE.sneeze.intensity);
    this.ctx.audio.explosion();

    for (const brick of this.brickField.all()) {
      // Bone is not mucus — nothing to loosen.
      if (!brick.breakable) continue;

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

  /**
   * Touch-friendly pause/resume toggle, top of the HUD bar. Sits in the one
   * span of that bar nothing else ever reaches into: level text is centred
   * and short enough to stay inside ~410px, the lives row is right-aligned
   * and never reaches left of ~490px even at RUN.maxLives hearts, so 450px
   * has a clear ~80px lane on every level.
   *
   * ESC (see `update()`'s `input.consumePause()`) and this button both do
   * nothing but call `_setPaused` — that shared call is what keeps the two
   * in sync, not any bookkeeping between them.
   */
  _buildPauseButton() {
    const cx = 450;
    const cy = HUD_H / 2;
    const hitW = 44;
    const hitH = HUD_H;

    const btn = new Sprite(TEX.pauseIcon);
    btn.anchor.set(0.5);
    btn.width = 22;
    btn.height = 22;
    btn.position.set(cx, cy);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    // Generously larger than the icon itself — a thumb is not a mouse
    // pointer, and this is the one control on screen with no room to grow
    // its own art to match.
    btn.hitArea = new Rectangle(-hitW / 2, -hitH / 2, hitW, hitH);
    // `pointerdown`, not `pointertap` — instant on both mouse and touch, no
    // down/up gesture to resolve first. Stopping propagation on the Pixi
    // event AND its native event is what actually matters here: without it,
    // this same press also reaches `Input`'s window-level listener (see
    // input.js), which reads it as ordinary field input and drags the
    // paddle's control target to this button's screen position — invisible
    // while the pause menu covers the field, but it snaps the paddle here the
    // instant play resumes, which reads as "the pause button is broken."
    btn.on('pointerdown', (e) => {
      e.stopPropagation();
      e.nativeEvent?.stopPropagation();
      this.ctx.audio.uiClick();
      this._setPaused(!this.paused);
    });

    this.pauseButton = btn;
    this.view.addChild(btn);
  }

  _setPaused(on) {
    if (this.paused === on) return;
    this.paused = on;
    this.ctx.audio.setMuted(on);
    this.pauseButton.texture = on ? TEX.continueIcon : TEX.pauseIcon;
    this.ctx.input.suspended = on;
    // Reaching for "DEVAM ET" (or the corner icon) with a mouse leaves the
    // cursor sitting over that button, which is exactly where `suspended`
    // stops the control target from drifting to — but the drift already
    // happened on the way there, before this call. Resyncing to the paddle's
    // actual position is what stops that stale target from being read on the
    // very first frame back, snapping the paddle toward the button.
    if (!on) this.ctx.input.setPointerTarget(this.paddle.x);

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

    const title = makeText('DURAKLATILDI', { size: 30, anchor: 0.5, title: true });
    title.position.set(DESIGN.width / 2, 152);
    this.pauseLayer.addChild(title);

    const menu = new VerticalMenu(input, audio, { spacing: 50 });
    menu.position.set((DESIGN.width - 240) / 2, 195);

    menu.add(
      new Button('DEVAM ET', () => this._setPaused(false), { width: 240 }),
    );
    menu.add(
      new Button('BÖLÜMÜ YENİDEN BAŞLAT', () => {
        audio.setMuted(false);
        this.ctx.sm.change(TransitionScene, {
          next: GameScene,
          params: {
            levelIndex: this.levelIndex,
            run: {
              score: 0,
              lives: RUN.startingLives,
              nextExtraLife: SCORE.extraLifeEvery,
              revivesUsed: 0,
              usedTips: [],
            },
          },
        });
      }, { width: 240 }),
    );
    menu.add(
      new Button('MENÜYE ÇIK', async () => {
        audio.setMuted(false);
        audio.stopMusic();
        const { MenuScene } = await import('./menu-scene.js');
        this.ctx.sm.change(MenuScene, {});
      }, { width: 240, accent: 0xff4d5a }),
    );

    this.pauseLayer.addChild(menu);
    this.view.addChild(this.pauseLayer);

    // Re-added rather than newly built: `addChild` on an existing child moves
    // it to the top of the display list, so the corner toggle stays above the
    // dim overlay and clickable — tapping it again resumes exactly like
    // RESUME does.
    this.view.addChild(this.pauseButton);
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
    // Belt-and-suspenders: the pause menu's own buttons (restart, exit to
    // menu) change scene directly without going through `_setPaused(false)`,
    // so this is the one place guaranteed to run on every way out of a paused
    // GameScene — leaving `suspended` stuck true would silently freeze paddle
    // and pointer input in whatever scene comes next.
    this.ctx.input.suspended = false;
  }
}
