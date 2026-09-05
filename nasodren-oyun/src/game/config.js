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
  /** Alpha applied to bricks with nothing left to give. */
  loosenedAlpha: 0.72,
  label: 'ACHOO!',
  color: 0x86e05a,
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
    /** Spread beyond the stroke's own edge, per side. */
    bloomSpread: 12,
    bloomAlpha: 0.07,
    haloSpread: 4,
    haloAlpha: 0.2,
    coreAlpha: 0.95,

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
    focus: { offsetX: 62, y: 252 },
    /** Floor on the innermost layer, so the hot core is a pool and not a point. */
    minScale: 0.16,
  },
};

/**
 * The nose: a nasal aperture floating in the upper-middle of the board.
 *
 * Geometry lives in game/cavity.js, next to the collision code that consumes
 * it. What is here is the switch and the tolerances.
 *
 * IT IS NOT THE PLAYFIELD. It used to be — walls running edge to edge with the
 * ball sealed inside them — and that drew a box rather than a nose. Pulling the
 * shape in so it floats with clear board around it fixes the look and inverts
 * the physics: FIELD is the boundary again, and the nose is a cluster of
 * two-sided solid strokes standing in the middle of it. `GameScene` bounces the
 * ball off the rectangle first and the nose second, every substep.
 *
 * WHICH LEVELS GET IT. The switch is per level: `cavity: true` in a LEVELS
 * entry. It stays opt-in even though the nose no longer bounds anything,
 * because the nose occupies x 143..497 and y 92..342 — straight through where
 * levels 2 to 12 put their walls. A brick fused into a solid stroke is not
 * always a soft-lock now that the ball can travel around the outside, but the
 * bounce off that face is unreadable and the brick's own collision fights the
 * stroke's.
 *
 * To bring another level in: re-cut its layout so no brick overlaps the nose,
 * then add the flag and let `validateLevels` confirm it with
 * `NoseObstacles.hitsRect()`. The boss level is refused the flag
 * unconditionally in GameScene; the Construct patrols a band straight through
 * the aperture.
 */
export const CAVITY = {
  /**
   * Curve flattening, in design pixels of segment length.
   *
   * This is now the *only* difference between what is drawn and what the ball
   * hits: the renderer strokes the true quadratics, collision runs on these
   * chords. 4 holds the gap under a fiftieth of a pixel on the tightest bend
   * here — the turn of the ala — which is two orders of magnitude inside the
   * ball's 5px radius, so the ball bounces where the light is.
   *
   * Collision cost is unaffected by this number: the broadphase keeps a lookup
   * at a handful of segments however finely the curve is cut (see cavity.js).
   * The only thing lowering it spends is the one-time tessellation at level
   * load, which is why it can afford to be this tight.
   */
  flatten: 4,

  /**
   * Stroke radii, in design pixels. These are the collision radii *and* half
   * the drawn line width — see cavity.js for why those cannot be two numbers.
   *
   * The septum is the fatter of the two because it is the bumper: it has to
   * read as a solid object from across the board, and a wider body makes the
   * deflection off its rounded tip land further from centre.
   */
  wallRadius: 3.5,
  septumRadius: 6,

  /**
   * Broadphase grid cell, and the margin a segment's box is inflated by beyond
   * its own stroke radius when it is filed.
   *
   * The pad has to cover the ball's radius plus one substep of travel (5 + 4),
   * because a lookup reads exactly one cell — the one the ball's centre is in.
   * 12 leaves headroom for a larger ball if one is ever added.
   */
  cellW: 40,
  cellH: 20,
  cellPad: 12,

  /**
   * Extra push-out applied on top of the measured penetration.
   *
   * Without it a ball resolved to exactly touching re-triggers the same contact
   * on the next substep, and since the reflection is gated on the ball actually
   * moving inward it does not flip twice — but it does fire the bounce sound
   * and the sparks twice. Half a pixel of clearance is cheaper than tracking
   * contact state.
   */
  skin: 0.5,
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
