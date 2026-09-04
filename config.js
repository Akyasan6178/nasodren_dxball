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

export const BRICK_W = GRID.cellW - GRID.gap;
export const BRICK_H = GRID.cellH - GRID.gap;

/** Eight-colour brick palette, warm-to-cool as rows descend. */
export const COLORS = [
  0xff4d5a, 0xff9130, 0xffd23f, 0x86e05a,
  0x35d0d8, 0x4d7bff, 0xa963ff, 0xff63c1,
];

export const BALL = {
  radius: 5,
  /** Starting speed in design-pixels per second. */
  baseSpeed: 268,
  maxSpeed: 540,
  /** Each level starts marginally faster than the last. */
  speedPerLevel: 8,
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

export const PADDLE = {
  y: 442,
  height: 14,
  widths: { small: 54, normal: 88, big: 132 },
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
  tough: 90,
  explosive: 140,
  capsule: 120,
  levelClear: 1000,
  extraLifeEvery: 20000,
};

export const RUN = {
  startingLives: 3,
  maxLives: 6,
  /** Seconds a timed power-up lasts before expiring. */
  powerDuration: 22,
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
  /** Ball on unbreakable metal / boss cartilage. */
  metalImpact: { sparks: 14, flash: 0.7, speed: 330 },
  /** Ball on wall. */
  wallImpact: { sparks: 4, flash: 0.28, speed: 190 },

  /** Brick destruction debris. */
  debris: { count: 9, speed: 210, life: 0.75, spin: 9 },
  /** Explosive brick. */
  blast: { count: 18, speed: 330, life: 0.9, spin: 14 },

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
