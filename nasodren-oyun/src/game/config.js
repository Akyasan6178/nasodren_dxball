/**
 * Central tuning table. Every magic number in the game lives here so the feel
 * can be adjusted without hunting through systems.
 *
 * All gameplay maths happens in DESIGN-space pixels (640x480). The viewport
 * layer scales that box to fit the window, so collision logic never has to
 * know how big the browser is.
 */

export const DESIGN = { width: 640, height: 480 };

export const WALL = 8;          // thickness of the side/top walls
export const HUD_H = 36;        // score bar above the playfield

export const FIELD = {
  left: WALL,
  right: DESIGN.width - WALL,
  top: HUD_H + WALL,
  bottom: DESIGN.height,
};

/** Brick grid. 13 columns x 48px == the 624px of playable width exactly. */
export const GRID = {
  cols: 13,
  rows: 14,
  cellW: 48,
  cellH: 20,
  gap: 2,
  x: FIELD.left,
  y: FIELD.top + 16,
};

/**
 * Mucus cells — what the bricks became.
 *
 * The board is nothing but sweeping neon curves now, and a grid of hard-edged
 * arcade rectangles sitting in the middle of that reads as two different games
 * layered on top of each other. Rounding the cells and dropping them under full
 * opacity puts them in the same world as the strokes, and it earns something
 * mechanical as well: at this alpha the inflammation glow shows THROUGH the
 * congestion, so a passage that is still blocked still reads as hot.
 *
 * ALPHA IS BAKED INTO THE TEXTURE, not applied to the Sprite. `Brick.alpha`
 * is already spoken for twice over — the Sneeze reflex dims whatever
 * survives, and a buffed cell's permanent breathing pulse (see BUFF_PULSE)
 * writes it every frame — and a third writer would mean one silently
 * cancelling another. See textures.js.
 *
 * Bone opts out and stays opaque: it is the one thing on the board the fluid
 * never dissolves, and that has to be legible before the player spends a rally
 * finding out.
 */
export const BRICK = {
  alpha: 0.7,

  /**
   * Shape variants, as fractions of the full cell.
   *
   * A grid of identical rectangles reads as a wall however it is coloured, and
   * congestion is not a wall — it is clumps of differing size packed into a
   * passage. Three sizes is enough to break the repeat; more would stop reading
   * as one substance.
   *
   * `align` places the box inside its own cell. The cell is still the unit of
   * the grid, so a half brick occupies a whole cell and simply does not fill
   * it — which is what lets the ball pass through the empty side of the cell
   * and is most of where the messy silhouette comes from.
   */
  shapes: {
    full: { w: 1, h: 1, align: 0.5 },
    halfLeft: { w: 0.5, h: 1, align: 0 },
    halfRight: { w: 0.5, h: 1, align: 1 },
    small: { w: 0.4, h: 0.95, align: 0.5 },
  },

  /**
   * Visual scatter: how far a cell may be nudged from its grid position, and
   * how far it may be tilted.
   *
   * COSMETIC ONLY. The AABB the ball is tested against stays exactly on the
   * grid — see bricks.js. Moving the collision box with the sprite would make
   * every bounce off a clump unpredictable in precisely the way this whole
   * pivot was meant to remove, and it would cost the constant-time cell lookup
   * `BrickField.candidates` depends on.
   *
   * The offset is DETERMINISTIC per cell rather than random per play. A layout
   * is authored, and an author who nudges two clumps into a pleasing overlap
   * should get that same overlap every time the level loads; re-rolling the
   * mess on each run would also make a level look subtly different in a bug
   * report than it did on the machine that filed it.
   *
   * Tilt is small on purpose. Past about 0.06 rad the corners of a full-width
   * cell start reaching outside the box the ball is tested against, and the
   * player begins to see misses on pixels that were never solid.
   */
  scatter: 4,
  tilt: 0.05,

  /**
   * Breathing room a cell must keep from the sinus wireframe, on top of the
   * worst case of `scatter` and `tilt` combined.
   *
   * WITHOUT THIS THE VALIDATOR WAS UNDERCOUNTING. It passed the box the cell is
   * authored at, offset by `scatter` — but a cell is also TILTED about its own
   * centre, and a corner 24px out swings 1.2px further on top of the nudge. The
   * two bone caps at the roof of level 1 came out at -1.17px: they were drawn
   * overlapping the wall they were supposed to be sitting under, and the check
   * called it legal.
   *
   * Three pixels is what makes the difference visible rather than merely
   * true — a cell that clears the stroke by a hair still reads as fused to it
   * at 640x480. It costs six of the 38 legal cells; see the note in levels.js.
   */
  clearance: 3,
  /** Corner radius. Just under half the cell height, so it reads as a capsule. */
  radius: 7,
};

export const BRICK_W = GRID.cellW - GRID.gap;
export const BRICK_H = GRID.cellH - GRID.gap;

/** Eight-colour brick palette, warm-to-cool as rows descend. */
export const COLORS = [
  0xff4d5a, 0xff9130, 0xffd23f, 0x86e05a,
  0x35d0d8, 0x4d7bff, 0xa963ff, 0xff63c1,
];

export const BALL = {
  /**
   * Physical hitbox radius, in design pixels. Raised from 5 — the ball read
   * as too small even after CYCLAMEN.visualScale made the sprite bigger than
   * its collision box. 7 is a safe ceiling: brick cells are GRID.cellH=20
   * tall, so a 14px ball diameter still fits through a single-row gap with
   * margin, and it stays well under PADDLE.height=14 and even the `tiny`
   * paddle width (34), so no bounce/hitbox math anywhere that reads
   * `ball.radius` needs to change — see ball.js and every `_collide*` method
   * in game-scene.js, all of which already derive from this value rather
   * than a hardcoded number.
   */
  radius: 7,
  /** Starting speed in design-pixels per second. Scaled per level — see DIFFICULTY. */
  baseSpeed: 268,
  /** Hard ceiling on ball speed. Scaled per level — see DIFFICULTY. */
  maxSpeed: 540,
  /** Passive ramp: the rally itself gets faster the longer it runs. */
  rampPerSecond: 0.0055,
  /** Steering ceiling: hitting the paddle edge deflects this far off vertical. */
  maxPaddleAngle: (62 * Math.PI) / 180,
  /**
   * Guard rail against near-horizontal stalemates. The ball's vertical speed is
   * never allowed below this fraction of total speed.
   */
  minVerticalFraction: 0.26,
  /**
   * The mirror guard. Without a floor on the horizontal component the ball
   * settles into a perfectly vertical line, drills one column and then bounces
   * forever in the empty corridor it just carved. Together these two floors pin
   * the trajectory into a 7deg..75deg band off vertical.
   */
  minHorizontalFraction: 0.12,
  /** How much of the paddle's own motion is imparted to the ball. */
  paddleEnglish: 0.16,
  slowFactor: 0.72,
  fastFactor: 1.32,
};

/**
 * Progressive difficulty curve, driven by `levelIndex` alone (0-based; Level
 * 1 is index 0 and always plays at the base tuning above, multiplier 1).
 * Every other system reads its numbers from BALL/PADDLE and multiplies them
 * by what this file computes — nothing outside this block should hard-code a
 * "harder per level" number of its own, so the whole curve stays tunable from
 * one place.
 */
export const DIFFICULTY = {
  /**
   * Per-level ball-speed growth, COMPOUNDING rather than additive — level `i`
   * multiplies both BALL.baseSpeed and BALL.maxSpeed by
   * `(1 + speedGrowthPerLevel) ** i`. At 0.06 that is +6% at level 2, about
   * +34% by level 7, so the climb is gentle early and only bites late,
   * exactly where a returning player's own skill has also grown.
   */
  speedGrowthPerLevel: 0.06,
  /**
   * Ceiling on the multiplier itself. Without this the last levels of a long
   * run would compound past anything the paddle/reaction-time budget was
   * tuned for; 1.7 keeps the hardest level well inside "hard but readable".
   */
  maxSpeedMultiplier: 1.7,

  /**
   * Per-level shrink to the paddle's own "assist" — see BALL.paddleEnglish in
   * `_collidePaddle`. Early levels forgive an imprecise, sliding-into-it
   * bounce; later ones ask for a cleaner hit by numbing how much the paddle's
   * own motion steers the ball.
   */
  paddleControlDropPerLevel: 0.02,
  /** Floor on that scale — control never drops below 60% of its base assist. */
  minPaddleControlScale: 0.6,
};

/**
 * `(1 + speedGrowthPerLevel) ** levelIndex`, clamped to `maxSpeedMultiplier`.
 * Multiply both `BALL.baseSpeed` and `BALL.maxSpeed` by this — see
 * `GameScene._currentSpeed()`.
 */
export function difficultySpeedScale(levelIndex) {
  const raw = (1 + DIFFICULTY.speedGrowthPerLevel) ** Math.max(0, levelIndex);
  return Math.min(DIFFICULTY.maxSpeedMultiplier, raw);
}

/**
 * Linear falloff toward `minPaddleControlScale`. Multiply `BALL.paddleEnglish`
 * by this — see `GameScene._collidePaddle()`.
 */
export function difficultyControlScale(levelIndex) {
  const raw = 1 - DIFFICULTY.paddleControlDropPerLevel * Math.max(0, levelIndex);
  return Math.max(DIFFICULTY.minPaddleControlScale, raw);
}

export const PADDLE = {
  y: 442,
  height: 14,
  /**
   * `tiny` exists only for the Rebound Effect. It is deliberately narrower than
   * anything the original power-down table could reach: the crash has to read as
   * a different category of punishment from an ordinary Narrow Paddle.
   */
  widths: { tiny: 34, small: 54, normal: 88, big: 132 },
  keySpeed: 560,
  /** Pointer smoothing: 1 == instant (pixel-perfect), lower == softer. */
  pointerLerp: 1,
};

export const CAPSULE = {
  w: 34,
  h: 16,
  fallSpeed: 118,
  /** Probability that a destroyed brick releases a capsule. */
  dropChance: 0.27,
};

export const LASER = {
  speed: 640,
  cooldown: 0.22,
  w: 4,
  h: 14,
  damage: 1,
};

export const SCORE = {
  brick: 50,
  capsule: 120,
  levelClear: 1000,
  extraLifeEvery: 20000,
};

export const RUN = {
  startingLives: 3,
  maxLives: 6,
  /** Seconds a timed power-up lasts before expiring. */
  powerDuration: 22,

  /** Continues offered from the Game Over screen, total for one playthrough. */
  maxRevives: 3,
  /** Seconds ReviveScene holds before offering the Skip button. */
  reviveCountdown: 10,
  /**
   * Lives a Revive hands back — deliberately less than `startingLives`. A
   * full refill made a continue strictly better than just being careful in
   * the first place; one life keeps the stakes of the run it is resuming.
   */
  reviveLives: 1,
};

/**
 * The level-wide clock in GameScene._updateLevelTimer, driving two dynamic
 * mechanics defined in bricks.js: a repeating brick respawn and a one-shot
 * difficulty buff. Both restart for free on a fresh GameScene (next level,
 * Restart Level, Revive) since the clock is just a constructor field, never
 * carried on the `run` object.
 */
export const LEVEL_TIMER = {
  /** Seconds between brick-respawn ticks (30, 60, 90s, ...). */
  spawnInterval: 30,
  /** How many bricks a respawn tick fills in, chosen at random per tick. */
  spawnMin: 2,
  spawnMax: 3,
  /** Seconds at which every breakable brick gains +1 HP, once per level. */
  buffAt: 60,
};

/**
 * The permanent "breathing" look a brick gets from the 60s buff — see
 * Brick.applyBuff/tickPulse in bricks.js. Unlike the old flash this never
 * reverts, so it stays tunable on its own rather than as a fading duration.
 */
export const BUFF_PULSE = {
  /** Radians/second of the breathing cycle. */
  speed: 4,
  /** Lowest point of the alpha breath — never fully transparent. */
  alphaMin: 0.72,
  /** Permanent tint shift toward the game's own neon accent. */
  tint: 0x35d0d8,
  /** How strongly that colour is blended in, 0..1. */
  tintMix: 0.55,
};

/** Fixed simulation guard: never integrate more than this in one frame. */
export const MAX_DT = 1 / 30;

/* ============================================================= modes ==== */

/**
 * Mode presets for the main-menu switcher.
 *
 * PLACEHOLDER: nothing in the engine reads these yet, by design. The toggle
 * stores the selection on the shared context as `ctx.mode` and persists it.
 *
 * To wire it up later, the single hook point is `GameScene._currentSpeed()` —
 * multiply the result by `this.ctx.mode.ballSpeedScale` — and
 * `CAPSULE.dropChance` in `_resolveBrickResult`, which becomes
 * `CAPSULE.dropChance * this.ctx.mode.capsuleDropScale`. No other system needs
 * to know a mode exists.
 */
export const MODES = {
  classic: {
    id: 'classic',
    label: 'Classic',
    ballSpeedScale: 1,
    capsuleDropScale: 1,
  },
  turbo: {
    id: 'turbo',
    label: 'Turbo',
    ballSpeedScale: 1.3,
    capsuleDropScale: 1.5,
  },
};

export const DEFAULT_MODE = 'classic';

/* ============================================================== boss ==== */

/**
 * The O.M.E.G.A. Construct.
 *
 * Geometry is expressed in polar terms because that is what the entity
 * actually is: a core with concentric rotating rings. Collision reads these
 * same numbers, so tuning the look and tuning the hitbox are the same edit.
 *
 * Layout sanity, in design pixels:
 *   outer ring reaches 84 + 13/2 = 90.5 from centre
 *   patrol band keeps that inside FIELD, and the centre sits low enough that
 *   the top of the boss clears the corruption meter at y 46..70.
 */
export const BOSS = {
  /** Vertical centre of the patrol band. */
  y: 180,
  patrol: {
    /** Seconds for one full left-right-left sweep. */
    period: 9.5,
    /** Horizontal clearance kept from each wall. */
    margin: 92,
  },

  core: {
    radius: 24,
    health: 12,
    /** Seconds of invulnerability after a hit, so one pass lands one hit. */
    iFrames: 0.18,
  },

  /**
   * Rings are listed inner-first. `coverage` is the fraction of each angular
   * slice a segment occupies; the remainder is the gap the ball must thread.
   *
   * These numbers were set by measurement, not by eye. A ball of radius r
   * effectively widens every segment by r/R on each side, so the usable gap is
   *     (2*PI/N) * (1 - coverage) - 2r/R
   * and the ball has to clear BOTH rings on the same pass. An earlier pass at
   * 6 and 9 segments with 0.72 coverage left each ring only ~10% open, so the
   * combined window was ~1% and the core was effectively unreachable. Fewer,
   * chunkier segments at 0.55 leave each ring ~30% open, which sweeps a real
   * opening past the ball every couple of seconds as the rings counter-rotate.
   */
  rings: [
    { radius: 54, thickness: 15, segments: 5, coverage: 0.55, spin: 0.55 },
    { radius: 84, thickness: 13, segments: 7, coverage: 0.55, spin: -0.38 },
  ],

  shield: {
    hits: 2,
    /** Seconds between regeneration pulses. */
    regenEvery: 13,
    /** Segments restored per pulse. */
    regenBatch: 3,
    /** Seconds a segment takes to materialise (it is intangible until done). */
    regenTime: 0.45,
  },

  fire: {
    /** Seconds between volleys, scaled down by phase. */
    interval: 2.4,
    speed: 205,
    radius: 7,
    /** Horizontal spread of a multi-shot volley, in radians from vertical. */
    spread: 0.26,
  },

  /**
   * Phases escalate as the core is worn down. Thresholds are fractions of core
   * health remaining; the first entry whose threshold the boss is at or below
   * becomes the active phase.
   */
  phases: [
    { threshold: 1.0, patrolScale: 1.0, fireScale: 1.0, shots: 1, spinScale: 1.0 },
    { threshold: 0.66, patrolScale: 1.25, fireScale: 0.72, shots: 2, spinScale: 1.35 },
    { threshold: 0.33, patrolScale: 1.6, fireScale: 0.5, shots: 3, spinScale: 1.8 },
  ],
};

export const CORRUPTION = {
  /** Percentage points added when a glitch packet lands on the paddle. */
  perHit: 16,
  /**
   * Passive bleed-off, percentage points per second, while below the
   * threshold. Set to 0 for a purely monotonic meter.
   */
  decay: 1.5,
  threshold: 100,
  /** Paddle speed multiplier once corrupted. */
  speedScale: 0.5,
};

export const PURGE = {
  /** Seconds of plasma granted by the Purge Protocol. Mirrors PLASMA.durationMs. */
  plasmaDuration: 10,
  /** Score awarded for landing a core hit. */
  coreHitScore: 400,
  bossClearScore: 5000,
};

/* ============================================================ nasodren === */

/**
 * Trial gate for the Nasodren mechanics.
 *
 * Both new features — the Sneeze reflex and the Rebound capsule — are held
 * behind this one switch so the restriction can be lifted in a single edit
 * rather than hunted across three files. It is read once per scene, in the
 * GameScene constructor, and never again at runtime.
 *
 * TESTING BUILD. To ship on every level, set `levelIndex: null` and drop
 * `reboundWeight` to something in the range of the other power-downs (Narrow is
 * 7, Zap is 4) — 45 exists only so the capsule is easy to catch on demand.
 */
export const TRIAL = {
  /**
   * 0-based level index the trial mechanics are restricted to. `null` releases
   * them to every level.
   */
  levelIndex: 0,

  /**
   * Rebound's weight in the drop roll while under test.
   *
   * The base table sums to 76, so 45 makes it roughly 37% of every capsule that
   * falls on the trial level — a handful of bricks, not a whole wall. The
   * capsule is folded into the roll rather than living in the POWERUPS table,
   * so this number cannot disturb the odds on any other level.
   */
  reboundWeight: 45,
};

/**
 * The Rebound Effect — the chemical decongestant trap.
 *
 * Two stages on a single timer slot. `surge` is the illusion of instant relief:
 * the paddle jumps to its widest and the capsule reads as a good pickup.
 * `crash` is rhinitis medicamentosa — the relief expires into a bat narrower
 * than the player has ever had.
 *
 * The surge is short on purpose. Long enough to be enjoyed, too short to be
 * used: the player registers the gift and loses it in the same breath, which is
 * the whole argument the capsule exists to make.
 */
export const REBOUND = {
  /** Seconds of fake relief. */
  surge: 2,
  /** Seconds spent paying for it. */
  crash: 9,
  /** Width states each stage drives. Both must be keys of PADDLE.widths. */
  surgeWidth: 'big',
  crashWidth: 'tiny',
};

/**
 * The Sneeze — the trigeminal reflex.
 *
 * `threshold` bricks destroyed by the ball in one rally, with no paddle touch
 * in between, fires the reflex: the screen shakes and every brick still
 * standing is loosened.
 *
 * Loosening never destroys. A sneeze shifts mucus, it does not clear a cavity,
 * so a multi-hit brick surrenders one hit and a single-hit brick — which has no
 * hit to spare — only fades. Keeping the reflex non-lethal also keeps
 * `brickField.remaining` untouched, which the level-clear check depends on.
 */
export const SNEEZE = {
  threshold: 8,
  /** Hits removed from each surviving multi-hit brick. */
  loosen: 1,
  /**
   * Sprite alpha applied to bricks with nothing left to give.
   *
   * Multiplies BRICK.alpha rather than replacing it — the cell is already
   * translucent, so this is 0.6 OF 0.7, not 0.6 outright. It dims harder than
   * the 0.72 it used to, because the same proportional knock-down is far less
   * legible starting from a translucent cell than it was from an opaque one.
   */
  loosenedAlpha: 0.6,
  label: 'HAPŞU!',
  color: 0x86e05a,
};

/**
 * Cyclamen — the flower Nasodren is actually made from, and now the ball.
 *
 * `petals` and the two hues are the flower; everything else is how it moves.
 *
 * TIP RADIUS VERSUS COLLISION RADIUS. The drawn flower reaches `visualScale`
 * times BALL.radius, so it is a little larger than the circle the physics
 * tests. That overdraw is deliberate and it is bounded on purpose: a soft
 * organic shape reading exactly at its collision radius looks undersized, but
 * push it much past this and the player starts feeling misses on petal tips
 * that were never part of the ball. 1.15 is about the ceiling.
 */
export const CYCLAMEN = {
  petals: 5,
  /** Petal body, and the deeper throat colour at the flower's centre. */
  petal: 0xff66b2,
  throat: 0xcc0099,
  /**
   * How far the flower oversteps the ball's collision radius.
   *
   * THE POINT OF THE BALL IS THAT IT IS A CYCLAMEN, and at 1.15 nobody could
   * tell. BALL.radius is 5, so the art was 11.5 design pixels across; on a
   * 1080p screen the viewport scale is 2.25, which put a 85x89 five-petal
   * flower on screen at about 26 device pixels. At that size it is a magenta
   * dot. 1.55 takes it to 15.5 design pixels, roughly 35 on the same screen,
   * which is where the petal silhouette starts to survive.
   *
   * COSMETIC ONLY — this multiplies the sprite, never `Ball.radius`, so the
   * hitbox and every level's difficulty are untouched. The cost is overhang:
   * the art now reaches 2.75px past the collision circle on each side, so a
   * near miss can look like a graze. That is the ceiling on this number, and
   * it is why the flower did not simply get doubled. If the BALL itself should
   * be bigger rather than just its picture, BALL.radius is the lever — it moves
   * the hitbox, and it changes the balance of all 13 levels.
   */
  visualScale: 1.8,

  /**
   * Tumble in rad/s at BALL.baseSpeed, scaled by the ball's live speed.
   *
   * Tied to speed rather than constant because the flower is the clearest
   * read the player has on how fast the rally has become — the passive ramp
   * (BALL.rampPerSecond) is otherwise invisible until it kills them.
   */
  spin: 2.1,
};

/**
 * Cyclamen petals thrown off a brick as it breaks.
 *
 * The counterpart to MUCUS, and deliberately its opposite in every term.
 * Droplets are heavy, fast and short-lived — fluid draining out of the cavity.
 * Petals are light, slow and long-lived, with `drag` low enough that they shed
 * their launch speed almost immediately and then flutter down under a fraction
 * of the droplets' gravity. Two different substances leaving the same break.
 *
 * Routed to the plain layer rather than the bloomed one, for both a look and a
 * budget reason: petals are matter, not light, so they should not glow the way
 * the fluid does, and MUCUS already spends 11 of the bloom layer's per-break
 * allowance. A twelve-brick cascade would otherwise blow through VFX.bloomShare
 * and start dropping droplets.
 */
export const PETAL = {
  colors: [0xff66b2, 0xcc0099, 0xff99cc, 0xa020ff],
  count: 7,
  speed: 95,
  life: 1.25,
  /** A fraction of MUCUS.gravity: a petal falls far slower than a droplet. */
  gravity: 150,
  /** Lazy tumble, rad/s. Nothing like the debris shards' 9. */
  spin: 2.4,
  size: 1.15,
};

/**
 * The sinus cavity backdrop.
 *
 * Colours and timing only — the shape itself lives in game/cavity.js, next to
 * the collision code that consumes it, the same way the brick artwork lives in
 * textures.js rather than here.
 */
export const SINUS = {
  /** Playfield ground. Space grey-navy, a shade under the wall chrome. */
  base: 0x080d1c,

  /**
   * The neon, in three tiers drawn one over the other.
   *
   * A real neon tube is a bright core inside a tight halo inside a wide,
   * almost-invisible bloom, and two tiers cannot fake the third: with only a
   * halo the line has a hard outer edge and reads as a drawn stroke rather than
   * as something lit. The bloom is very faint and very wide, so it costs one
   * more pass and carries most of the softness.
   *
   * There is no `color` here any more, and no widths either. Width is twice the
   * stroke's collision radius, which CAVITY owns (see cavity.js). Colour is
   * sampled live from `ramp` off the brick ratio, so the whole nose shifts red
   * to cyan as the passages clear — the strokes are baked white and tinted per
   * frame, which is a single write instead of a re-tessellation.
   */
  line: {
    /**
     * The stroke weight the two spreads below are quoted against.
     *
     * Both are scaled by `radius / spreadRef` at draw time, so a stroke half
     * as wide gets half the glow. Set to the sinus walls' own radius, which
     * makes these numbers read as literal pixels for the shapes that dominate
     * the drawing and keeps the septum's hairline from wearing a wall's halo.
     */
    spreadRef: 3.5,

    /** Spread beyond the stroke's own edge, per side, at spreadRef weight. */
    bloomSpread: 12,
    bloomAlpha: 0.07,
    haloSpread: 4,
    haloAlpha: 0.2,
    coreAlpha: 0.95,

    /**
     * The filament: a fourth pass, drawn INSIDE the body rather than around it.
     *
     * This is what separates a neon tube from a thick coloured line, and it is
     * the tier the old three-pass stack was missing. A real lit tube is a
     * white-hot core inside a saturated body inside a halo inside a bloom; with
     * only the outer three the body is the brightest thing present and reads as
     * paint. Drop a near-white filament down its middle and the same stroke
     * reads as glass with something burning in it.
     *
     * `filamentInset` is a fraction of the stroke's own radius, so every stroke
     * gets a filament proportional to its width, and there is no constant here
     * that could drift from the geometry. It is the only tier drawn NARROWER
     * than the collision capsule, which is safe in a way the outer tiers are not:
     * light inside a solid claims nothing about where the solid ends.
     */
    filamentInset: 0.58,
    filamentAlpha: 0.92,
    /** Lift toward white. Must exceed `lift`, or it is just a second body. */
    filamentLift: 0.82,

    /**
     * How far the core is lifted toward white, away from the ramp colour.
     *
     * The core and its own glow are the same hue by construction, so at full
     * inflammation a pure-ramp core is a red line sitting in a red haze and the
     * silhouette goes muddy exactly when it matters most. Lifting only the core
     * keeps a bright filament visible inside the colour without breaking the
     * single-hue lighting model — it reads as the hot part of the tube, which
     * is what it would be.
     */
    lift: 0.34,
  },

  /**
   * Inflammation ramp, sampled per cavity by that cavity's own clearance
   * (0 = untouched, 1 = clear). Endpoints are the brief exactly: inflamed
   * #FF2200 blocked, medical cyan #00FFFF cleared.
   *
   * THE TWO INTERMEDIATE STOPS ARE THE WHOLE POINT. Interpolating the endpoints
   * directly in RGB is what produces mud, and it is measurable rather than a
   * matter of taste: the midpoint of that blend is #809180, a grey-green at 12%
   * saturation. Any straight line through RGB space between two opposed hues
   * passes near the grey axis, and the eye reads that as the light failing
   * rather than as tissue healing.
   *
   * These stops route the hue the other way round the wheel — red, magenta,
   * violet, blue, cyan — so it never goes near yellow or green and never leaves
   * the saturated shell. Measured over the whole ramp: saturation stays at or
   * above 58%, value at or above 77%. It also happens to be the palette the
   * rest of the game is already built from.
   */
  ramp: [
    { at: 0, color: 0xff2200 },
    { at: 0.34, color: 0xff0066 },
    { at: 0.66, color: 0xa020ff },
    { at: 1, color: 0x00ffff },
  ],

  /**
   * Glow opacity at full inflammation, and once the cavity is clear.
   *
   * These are high because the congestion they sit behind is opaque: a glow
   * that only shows through the gaps between bricks does not read as a cavity
   * full of inflamed tissue.
   */
  alphaHot: 0.85,
  alphaClear: 0.3,

  /** Seconds the glow takes to travel to a new clearance value. */
  ease: 1.6,

  /** Inflammation pulse. Both terms scale down to nothing as the cavity clears. */
  throb: { amplitude: 0.13, rate: 2.4 },

  /**
   * The interior gradient, drawn once per nasal cavity.
   *
   * Built as `steps` copies of a cavity polygon, each scaled a little further
   * toward that cavity's focus and filled at `step` alpha additively. The
   * stack accumulates to a soft falloff that is brightest at the focus and
   * fades out against the walls — a gradient in the shape of the passage, which
   * neither a radial blob nor a PixiJS fill gradient can give you. Drawing it
   * per cavity rather than over the whole nose is what puts the light *inside*
   * the two passages instead of washing across the septum.
   *
   * It is tessellated once in the constructor. Per frame the only writes are
   * `tint` and `alpha` on the parent container, so the ramp costs nothing to
   * animate; what it does cost is fill rate, since every layer blends over the
   * one beneath it. Both stacks together now cover roughly a third of the board
   * rather than all of it, so this is markedly cheaper than it was when the
   * cavity ran edge to edge.
   *
   * `focus` is given as an offset from the midline, mirrored per side, so the
   * two cavities cannot drift out of symmetry. It sits low and outboard: the
   * congestion pools in the belly of each passage, over the bricks, not up at
   * the bridge.
   */
  glow: {
    steps: 30,
    step: 0.034,
    /**
     * How far each air space's hot spot is pulled from its own centroid toward
     * the midline, as a fraction.
     *
     * Every region gets a focus INSIDE itself — see sinus.js for why that is a
     * correctness requirement and not a preference. This only decides where in
     * each one the light pools: medially, because that is where a sinus drains
     * from and where mucosal thickening starts.
     */
    medialBias: 0.3,
    /** Floor on the innermost layer, so the hot core is a pool and not a point. */
    minScale: 0.16,
  },
};

/**
 * The sinus wireframe: line widths and tessellation. Geometry lives in
 * game/cavity.js, next to the queries that consume it.
 *
 * IT IS SCENERY. Nothing in the drawing touches the ball — FIELD.left,
 * FIELD.right and FIELD.top are the only surfaces in the game that turn one
 * around, exactly as before any of this existed. An earlier pass made every
 * stroke a solid capsule the ball rebounded off; it was reverted because
 * curved bumpers scatter a shot unpredictably, and a breakout board the player
 * cannot aim in is not a breakout board. The radii below are therefore line
 * widths and nothing else.
 *
 * WHICH LEVELS GET IT. Per level, via `cavity: true` in a LEVELS entry, and it
 * stays opt-in for a reason that survived the reversal: the aperture occupies
 * the middle of the board, and congestion drawn over the open flanks says the
 * blockage is everywhere. A cavity level's layout must sit wholly inside the
 * two tracts, which `validateLevels` enforces through `rectInsideTract`.
 *
 * To bring another level in: re-cut its layout against the usable-cell map that
 * `npm run check:nose` prints, then add the flag and let the checker confirm
 * it. The boss level is refused the flag unconditionally in GameScene; the
 * Construct patrols a band straight through the aperture.
 */
export const CAVITY = {
  /**
   * Line width per structure, as a radius: the stroke is drawn at twice this.
   *
   * THESE ARE DRAWING WIDTHS AND NOTHING ELSE NOW. They were once collision
   * radii, which is why they are radii rather than widths, and after that they
   * doubled as the reach the brick-containment margin was measured from. That
   * second job is gone: the chamber rings in anatomy.js are traced from the
   * air side of the painted wall, so the distance from a brick to a ring is
   * already the distance to the wall and `stroke()` in cavity.js gives every
   * chamber a containment radius of zero. `wallRadius` survives as the width
   * sinus.js would stroke a chamber at, which nothing currently asks it to do.
   *
   * They differ on purpose, and the hierarchy is the drawing's depth cue. A
   * section rendered at one uniform weight reads as a diagram; varying it reads
   * as a scan, where dense cortical bone returns a thicker brighter line than a
   * thin bony septum does. The sinus walls carry the section; the septum is a
   * hairline between them.
   *
   * There used to be a `flatten` here as well, the chord length anatomy.js's
   * hand-authored curves were subdivided at. There are no curves left to
   * subdivide — see the note at the top of that file.
   */
  wallRadius: 3.5,
  septumRadius: 1.5,
};

/**
 * Mucus drainage droplets — what a brick sheds when it breaks.
 *
 * Heavier gravity and far less drag than the debris preset they replace: shards
 * tumble and hang, fluid falls. The tints are picked per particle from the
 * list, which is what stops a burst reading as confetti in a single flat colour.
 */
export const MUCUS = {
  colors: [0x9ff4f8, 0x35d0d8, 0x4d7bff, 0x6fe8ff],
  count: 11,
  speed: 165,
  life: 0.85,
  gravity: 780,
  /** Horizontal squash. A droplet is taller than it is wide. */
  aspect: 0.6,
  /** Baseline scale. Larger than debris shards: fluid reads as volume, not grit. */
  size: 1.5,
};

/* ============================================================= effects === */

/**
 * Screen shake presets, in seconds and design pixels.
 *
 * Intensity is the peak offset; it decays linearly to zero over the duration.
 * These are design-space numbers, so the shake scales with the board rather
 * than being a fixed number of screen pixels on every display.
 */
export const SHAKE = {
  coreHit: { duration: 0.3, intensity: 15 },
  packetHit: { duration: 0.2, intensity: 8 },
  shieldBreak: { duration: 0.1, intensity: 3.5 },
  bossDefeat: { duration: 0.9, intensity: 18 },
  /** Trigeminal reflex. Long and broad — it is a whole-body event, not an impact. */
  sneeze: { duration: 0.45, intensity: 11 },
};

/** Paddle corruption glitch. */
export const GLITCH = {
  slices: 8,
  offset: 12,
  /** Filter padding — must exceed `offset` or slices get clipped at the edge. */
  padding: 18,
  /** Peak per-frame RGB channel separation, in pixels. */
  channelShift: 5,
};

/**
 * Plasma mode — the Purge Protocol override. Boss-exclusive.
 *
 * This is the only thing in the game that grants piercing: the Fireball capsule
 * has been retired from the drop table (see FIREBALL in powerups.js).
 */
export const PLASMA = {
  /** Trail samples. Fixed: the vertex buffer is allocated once for this many. */
  points: 15,
  /** Ribbon width at the head, tapering to zero at the tail. */
  width: 6,
  /** Cyber cyan, applied to the ball sprite and the ribbon alike. */
  tint: 0x00ffff,
  /** Duration of the override, in milliseconds. */
  durationMs: 10000,
  /**
   * Minimum travel before a new sample is recorded. Without it a held or slow
   * ball stacks duplicate points and the normal calculation degenerates.
   */
  minStep: 1.5,
  /** AdvancedBloomFilter settings for the shared plasma layer. */
  bloom: { blur: 5, brightness: 2, threshold: 0.1, quality: 4 },
};

/* ================================================================ vfx === */

/**
 * Particle system budget and impact presets.
 *
 * `max` is a hard ceiling on live particles. The pool never grows past it, so a
 * twelve-brick explosion chain costs the same as a single break — it just draws
 * fewer fragments each. That is the trade that keeps 60fps on a phone.
 */
export const VFX = {
  max: 900,
  /**
   * Share of the budget reserved for the bloomed debris layer.
   *
   * The two layers keep separate pools — a sprite parented to the plain layer
   * cannot serve a bloom request — so without a per-layer split the pools would
   * each grow to `max` and the process could hold twice the sprites the cap
   * implies. Splitting the budget bounds total allocation at `max` exactly, and
   * gives the smaller share to the expensive layer.
   */
  bloomShare: 0.4,

  /** Ball on paddle. */
  paddleImpact: { sparks: 9, flash: 0.55, speed: 260 },
  /** Ball on unbreakable bone / boss cartilage. */
  metalImpact: { sparks: 14, flash: 0.7, speed: 330 },
  /** Ball on wall. */
  wallImpact: { sparks: 4, flash: 0.28, speed: 190 },

  /** Brick destruction debris. */
  debris: { count: 9, speed: 210, life: 0.75, spin: 9 },

  /**
   * Bloom is applied to the debris layer only, and that layer is hidden when
   * empty so the pass is skipped entirely. Filter cost scales with the
   * container's bounds, not the screen, so localised debris stays cheap;
   * half resolution halves it again.
   */
  bloom: { threshold: 0.25, bloomScale: 1.15, brightness: 1.05, blur: 5, quality: 3 },
  bloomResolution: 0.5,
};

/* ============================================================== audio === */

export const SFX = {
  /**
   * Random pitch spread applied to every repeated impact sound. Without it the
   * identical waveform fires dozens of times a second and the ear starts
   * filtering it out as noise.
   */
  pitchVariance: 0.1,

  /**
   * Consecutive brick breaks without a paddle touch climb in semitones, arcade
   * style. Capped at an octave so a long chain doesn't end up inaudible.
   */
  comboSemitone: 1,
  comboMax: 12,
};

export const MUSIC = {
  /** Seconds for a track change to cross over. */
  crossfade: 1.2,
  /** Master music level. */
  level: 0.26,
  /** Which track plays for a given level index (0-based). */
  levelBands: [
    { upTo: 3, track: 'levelA' },
    { upTo: 7, track: 'levelB' },
    { upTo: 11, track: 'levelC' },
  ],
};
