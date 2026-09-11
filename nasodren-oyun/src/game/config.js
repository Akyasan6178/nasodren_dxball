/**
 * Central tuning table. Every magic number in the game lives here so the feel
 * can be adjusted without hunting through systems.
 *
 * All gameplay maths happens in DESIGN-space pixels. The viewport layer scales
 * that box to fit the window, so collision logic never has to know how big the
 * browser is.
 *
 * THERE ARE TWO BOXES AND THE SCREEN PICKS ONE AT BOOT — 480x854 on a screen
 * taller than it is wide, 640x480 on one wider than it is tall. See the
 * device-shape section immediately below.
 *
 * ONE PIECE OF ART AND ONE SET OF GEOMETRY SERVE BOTH BOXES, which is the only
 * reason two boxes are affordable. The painting and the traced sinus rings are
 * authored in a 640x480 FRAME, and each box PLACES that frame with a single
 * similarity transform — `frameX`/`frameY` below. The landscape box places it
 * at 1:1 and is therefore the authored layout verbatim; the portrait box zooms
 * it 1.15x and re-centres it. Everything that has to agree with the painting
 * goes through those two functions and nothing else: the background sprite, the
 * traced rings, the brick grid, the boss lane.
 *
 * WHY THE PORTRAIT BOX IS NARROWER THAN THE FRAME RATHER THAN A SCALED COPY OF
 * IT. The board always fits to the screen's WIDTH, so the physical size of a
 * brick is decided by one ratio and one ratio only: the brick's design width
 * over the board's design width. A 48px cell in a 640px box is 7.5% of the
 * screen; the same cell in a 480px box is 10%, and at FRAME_SCALE 1.15 it is
 * 11.5%. Narrowing the box is the lever that makes the ball, the paddle and
 * the bricks physically bigger on a phone; the frame zoom is a second, smaller
 * one on top of it. Rescaling the frame to FIT the narrower box instead —
 * cellW 48 -> 36, or the 34 an early pass reached for — cancels the first one
 * exactly: 36/480 is 7.5% again, the same screen pixels, the same complaint.
 */

/* ==================================================== device shape ====== */

/**
 * Which box this session is laid out in, decided ONCE at module load.
 *
 * IT IS THE SCREEN'S SHAPE, NOT ITS SIZE, and not a user-agent string. A
 * desktop browser window dragged tall gets the portrait board and is right to;
 * a tablet held sideways gets the landscape one. There is no device sniffing
 * here and there should not be — the only thing the layout cares about is
 * whether it has more width to spend or more height.
 *
 * DECIDED ONCE, AND THAT IS A REAL LIMITATION worth stating rather than
 * hiding. Rotating a phone after boot does NOT re-shape the board: it stays
 * the box it started in and Viewport pillarboxes or letterboxes it, which is
 * playable but smaller than the other box would have been. Re-shaping live
 * would mean re-deriving the placed rings in anatomy.js and everything
 * cavity.js builds from them, all of which is computed at module load — a
 * bigger change than a resize handler, and one the check:nose script would
 * have to be taught to cover. A reload picks up the new shape.
 */
const SHAPE_OVERRIDE =
  typeof process !== 'undefined' ? process.env?.NASODREN_SHAPE : undefined;

function detectPortrait() {
  // An explicit override wins, which is what lets check:nose validate both
  // boxes from Node — see the check:nose script in package.json.
  if (SHAPE_OVERRIDE === 'portrait') return true;
  if (SHAPE_OVERRIDE === 'landscape') return false;

  // No window means a build step or a validation script rather than a browser.
  // Portrait is the default because it is the TIGHTER box: the painted section
  // clears the side walls by 20px there against 128px in landscape, so a
  // geometry check that passes portrait passes both.
  if (typeof window === 'undefined') return true;

  return window.innerWidth < window.innerHeight;
}

/** True on a screen taller than it is wide. Read by config, not by gameplay. */
export const IS_PORTRAIT = detectPortrait();

/**
 * The design box.
 *
 * 640x480 is the authored frame verbatim — the board this game shipped with,
 * and what a widescreen monitor gets back. 480x854 is 9:16, the shape a phone
 * actually is.
 *
 * `height` moves after load in the LANDSCAPE box only; see
 * `resolveDesignHeight` in the responsive-layout section for why the portrait
 * one is pinned.
 */
export const DESIGN = IS_PORTRAIT ? { width: 480, height: 854 } : { width: 640, height: 480 };

/**
 * The frame the art and the geometry were authored in.
 *
 * background.png is cover-fitted into THIS box and the rings in anatomy.js are
 * traced from the result, so the painted nose and the brick-containment
 * geometry only agree with each other at 640x480. It is constant in the
 * strongest sense in this file: the box is chosen, the frame is placed, this
 * never moves, and anything that has to line up with the painting measures
 * from here.
 */
export const DESIGN_FRAME = { width: 640, height: 480 };

/**
 * The painted section's vertical extent, in FRAME coordinates.
 *
 * The top of the frontal chambers and the floor of the maxillary wings — the
 * first and last painted thing on the board. `npm run check:nose` prints both
 * as "the section fits between the walls" and "the section clears the paddle
 * band"; if the art is ever re-exported, take them from there.
 *
 * They are here rather than in anatomy.js because the vertical composition is
 * built on them: FRAME_CY centres THIS span in the play area, not the frame's
 * own box, and the difference is 35px of empty painting the frame carries
 * above the brow.
 */
export const SECTION = { top: 30.2, bottom: 388 };

export const WALL = 8;          // thickness of the side walls

/**
 * The TOP wall's thickness, which in portrait is also the power-up shelf.
 *
 * 8 IN LANDSCAPE, WHERE IT IS JUST A WALL. In portrait the badge row moved out
 * of the bar and onto its own line (see POWER_ROW_BELOW in hud.js), and a row
 * of chips floating on open board would be a row of chips the ball flies behind
 * — the band under the bar is live playfield, and the ball is in it every time
 * it turns around above the bricks.
 *
 * Thickening the top wall to hold the row solves both halves at once: the
 * badges get a solid surface to sit on rather than hovering over the painting,
 * and the ball bounces at FIELD.top BELOW them, so it can never be hidden. 58
 * is the 50px bar's badge line (11..50 past the bar at the current scale) plus
 * 8px of clearance under it.
 */
export const WALL_TOP = IS_PORTRAIT ? 58 : WALL;

/**
 * The HUD bar's height at scale 1, and the unit every metric in hud.js is a
 * fraction of.
 *
 * BIGGER IN PORTRAIT, AND THIS IS WHERE THE "TOO SMALL TO READ" FIX LIVES.
 * Every number in hud.js is multiplied by `HUD.scale * HUD_UNIT`, so raising
 * the authored bar height raises the score digits, the level text and the
 * hearts with it rather than just adding empty bar. 50/36 is 1.39x before the
 * runtime scale, which lands the score value at 25.6 CSS pixels on a 390px
 * phone against the 19 it was — the 35% the bar was asked to grow by.
 *
 * IT IS ONLY AFFORDABLE BECAUSE THE PAINTING MOVED DOWN. On the old layout the
 * frame started at y 0 and the bar had to fit above the brow in 36 pixels; the
 * portrait frame now starts at y 160, so the bar can take the room it needs
 * out of the gap instead of out of the playfield.
 */
const HUD_BASE_H = 36;
export const HUD_H = IS_PORTRAIT ? 50 : HUD_BASE_H;
export const HUD_UNIT = HUD_H / HUD_BASE_H;

/**
 * The paddle's rest line.
 *
 * THE PORTRAIT VALUE IS A THUMB-ZONE DECISION, not a margin. 130 design pixels
 * of board below the paddle is 106 CSS pixels on a 390px phone — about a
 * thumb-width — and it is what stops the hand that is dragging the paddle from
 * covering the paddle. Sitting it on the floor of the board the way the
 * landscape layout does would put the contact point and the thing it controls
 * in the same place.
 *
 * Declared before FIELD because the death line is measured from it, and before
 * the frame placement because the play area it centres the painting in runs
 * from the top wall down to here.
 */
const PADDLE_REST_Y = IS_PORTRAIT ? 724 : 442;

/**
 * How far below the paddle a ball is still in play.
 *
 * 38 is the landscape board's own paddle-to-floor gap, so `FIELD.bottom` comes
 * out at exactly DESIGN.height there and that box is unchanged. In portrait it
 * puts the death line at 762, which is the point: the 92 pixels below it are
 * the thumb zone, and a ball that has passed the paddle should be gone before
 * it reaches the hand rather than falling through it for another 130px.
 */
const BALL_FLOOR_GAP = 38;

/**
 * The playfield's bounds.
 *
 * `bottom` IS THE DEATH LINE AND IT IS READ, which it was not before this
 * change: game-scene.js tested `ball.y > DESIGN.height + 8` and this field was
 * written by `applyDesignHeight` and then used by nobody. On a board whose
 * floor is also its paddle line those two agree; on one with a thumb zone
 * under the paddle they do not.
 */
export const FIELD = {
  left: WALL,
  right: DESIGN.width - WALL,
  top: HUD_H + WALL_TOP,
  bottom: PADDLE_REST_Y + BALL_FLOOR_GAP,
};

/* =================================================== frame placement ==== */

/**
 * How much bigger the painting is in this box than it was authored.
 *
 * 1 IN LANDSCAPE BY DEFINITION — that box IS the frame. 1.15 in portrait, and
 * the ceiling is 1.17: the painted section reaches frame x 504, which is 184
 * from the midline, and 184 * 1.17 + 8 (the wall) is 224 against the 240 the
 * half-box has. At 1.15 the section lands at board x 28..452 and clears each
 * wall by 20px, which is the margin this is trading against zoom. Push it past
 * 1.17 and the cheekbone is drawn underneath the wall.
 *
 * THE GRID SCALES WITH IT AND HAS TO. The cells are laid out to land inside
 * the painted cavities, so a zoom that moves the cavities and not the cells
 * slides every cell off the chamber it belongs to. GRID.cellW below is the
 * authored 48 through this same factor, which is why check:nose reports the
 * same fourteen legal positions in both boxes.
 */
export const FRAME_SCALE = IS_PORTRAIT ? 1.15 : 1;

/** The frame's centre, in board coordinates. Horizontally it is the box's. */
export const FRAME_CX = DESIGN.width / 2;

/**
 * Vertically it is wherever it takes to CENTRE THE PAINTED SECTION IN THE PLAY
 * AREA — the band from the top wall down to the paddle — rather than to centre
 * the frame in the box.
 *
 * THIS IS THE ANSWER TO "HOW DO I KEEP THE GRID ALIGNED WHEN THE BACKGROUND
 * MOVES": you do not move them separately. The background sprite, the traced
 * rings and the brick grid are all placed by `frameX`/`frameY` from this one
 * pair of numbers, so there is no second offset to keep in sync and no way for
 * them to disagree. Change FRAME_SCALE or FRAME_CY and all three move together
 * by construction.
 *
 * CENTRING THE SECTION, NOT THE FRAME, is worth the extra term. The frame
 * carries 30px of empty painting above the brow and 92px below the maxillary
 * floor, so centring the frame itself would hang the nose 35px high and leave
 * the dead space this change exists to remove.
 *
 * THE SPLIT IS BIASED TOWARD THE LANE, 65/35. The slack is 205px and an even
 * split would give a hundred pixels above the brow and a hundred below the
 * maxillary floor; the band below is reaction time and the band above is only
 * room for the ball to turn around in, so it gets the larger share. At 0.65 the
 * lane is 133 design pixels — 0.50s of fall at BALL.baseSpeed, against 0.2s on
 * the landscape board and the 1.54s this layout replaced — and the band above
 * the brow is still 72px, several ball diameters. LANE_BIAS is the knob if that
 * reads as too tight or too generous; nothing else has to move with it.
 *
 * In landscape all of this collapses: FRAME_SCALE is 1 and the value is pinned
 * to the frame's own centre, so the placement is the identity.
 */
const LANE_BIAS = 0.65;

function resolvePortraitFrameCy() {
  const sectionH = (SECTION.bottom - SECTION.top) * FRAME_SCALE;
  const slack = PADDLE_REST_Y - FIELD.top - sectionH;

  // Where the top of the painted brow lands, then back out the frame centre it
  // implies. Two steps rather than one because the first is the number anyone
  // eyeballing the layout actually cares about.
  const sectionTop = FIELD.top + slack * (1 - LANE_BIAS);
  return sectionTop - (SECTION.top - DESIGN_FRAME.height / 2) * FRAME_SCALE;
}

export const FRAME_CY = IS_PORTRAIT ? resolvePortraitFrameCy() : DESIGN_FRAME.height / 2;

/**
 * Frame space -> board space. The only conversion there is.
 *
 * `frameLen` is for lengths rather than positions — a cell width, a stroke —
 * which take the scale but not the translation.
 */
export const frameX = (x) => (x - DESIGN_FRAME.width / 2) * FRAME_SCALE + FRAME_CX;
export const frameY = (y) => (y - DESIGN_FRAME.height / 2) * FRAME_SCALE + FRAME_CY;
export const frameLen = (n) => n * FRAME_SCALE;

/**
 * Brick grid. 13 columns x 48px, authored against the 640-wide frame and
 * carried into whichever box is active by the frame placement above.
 *
 * EVERY FIELD HERE GOES THROUGH THAT PLACEMENT, including the cell size. These
 * cells are not laid out to fill the board — they are laid out to land inside
 * the painted sinus cavities, so they scale and translate with the painting or
 * they stop lining up with it. Deriving cellW from DESIGN.width instead, so
 * that thirteen columns centre in 480, would slide every cell off its chamber:
 * check:nose counts 14 legal positions and would find rather fewer, and the two
 * bone cells per level that have to SIT ON a chamber wall would be sitting on
 * paint. The grid centres on the PAINTING, not on the box.
 */
export const GRID = {
  cols: 13,
  rows: 14,
  cellW: frameLen(48),
  cellH: frameLen(20),
  gap: frameLen(2),
  /**
   * The frame's own left wall and first grid row, placed.
   *
   * NEGATIVE IN PORTRAIT — around -119 — and that is correct. Column i spans
   * `GRID.x + i * cellW`, so anchoring at the frame's wall keeps every column
   * index pointing at exactly the painted cavity it points at in the other box,
   * and the seven congestion positions per side are the same seven cells in
   * levels.js for both. Columns 0 and 1 hang off the left edge of the board and
   * 11 and 12 off the right; no level has ever placed a cell there, and
   * check:nose now fails any that tries.
   */
  x: frameX(WALL),
  y: frameY(HUD_BASE_H + WALL + 16),
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
  /**
   * Corner radius. Just under half the cell height, so it reads as a capsule —
   * placed through the frame scale like the cell it is rounding, or a zoomed
   * board would draw the same 7px corner on a 15% larger brick.
   */
  radius: frameLen(7),
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
  /** The paddle's rest line. See PADDLE_REST_Y, where it and FIELD are set. */
  y: PADDLE_REST_Y,
  height: 14,
  /**
   * `tiny` exists only for the Rebound Effect. It is deliberately narrower than
   * anything the original power-down table could reach: the crash has to read as
   * a different category of punishment from an ordinary Narrow Paddle.
   *
   * UNCHANGED BY THE PIVOT, which makes the normal paddle 18% of the board's
   * width instead of 14%. That is a deliberate easing: the complaint the pivot
   * answers was that the paddle is too small to hit anything with on a phone,
   * and rescaling these to hold the old fraction would have handed back exactly
   * the pixels the narrower board just won.
   */
  widths: { tiny: 34, small: 54, normal: 88, big: 132 },
  keySpeed: 560,
  /** Pointer smoothing: 1 == instant (pixel-perfect), lower == softer. */
  pointerLerp: 1,
};

/**
 * How long a capsule takes to fall from the top of the grid to the paddle.
 *
 * THE DURATION IS THE AUTHORED VALUE, NOT THE SPEED, which is what lets one
 * number serve both boxes and survive every change to the vertical layout. The
 * original 118 px/s crossed the landscape board's 382px grid-to-paddle gap in
 * 3.24 seconds; the portrait gap is 505px, and 118 there would have turned
 * every capsule into a four-and-a-half-second wait. Holding the 3.24 seconds
 * and solving for the speed gives 118 in landscape and 156 in portrait — the
 * same drop, felt the same way, in two boxes.
 */
const CAPSULE_FALL_SECONDS = 3.24;

export const CAPSULE = {
  w: 34,
  h: 16,
  /**
   * Design pixels per second, derived from the lane this box actually has.
   * `applyDesignHeight` scales it again from here for screens taller than the
   * base box, by the same reasoning.
   */
  fallSpeed: Math.round((PADDLE.y - GRID.y) / CAPSULE_FALL_SECONDS),
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
  /**
   * Vertical centre of the patrol band, PLACED WITH THE PAINTING.
   *
   * The construct patrols the nasal cavity between the frontal chambers and
   * the ethmoid, so its lane is a fact about the painting rather than about
   * the board: left at a bare 180 it would sit above the brow on the portrait
   * board, where the frame now starts at y 160. frameY is the identity in
   * landscape, so the authored 180 is unchanged there.
   */
  y: frameY(180),
  patrol: {
    /** Seconds for one full left-right-left sweep. */
    period: 9.5,
    /**
     * Horizontal clearance kept from each wall.
     *
     * 92 IS THE AUTHORED LANDSCAPE VALUE and 40 is what the narrower board
     * needs. The construct reaches 90.5px from its centre, so it has 283px of
     * inner width to move in on the portrait board against 443 in landscape;
     * keeping 92 there would have left it a 99px sweep, pacing on the spot. 40
     * gives it 203, close to the 259 it sweeps in landscape.
     */
    margin: IS_PORTRAIT ? 40 : 92,
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

/* ==================================================== responsive layout == */

/**
 * See the device-shape and frame-placement sections at the top of this file
 * for the two boxes and the transform that places the authored frame inside
 * whichever one is active. They live up there because `FIELD` and `GRID` are
 * defined from them.
 */

/**
 * The board's base height, and the shape the whole game is laid out for.
 *
 * 480x854 is 9:16 — the shape a phone actually is, near enough that a modern
 * 19.5:9 handset letterboxes by about a tenth of its height rather than the
 * two thirds the old 4:3 board lost. 480 is the authored frame height, which a
 * landscape screen fills exactly. Every card scene composes against the
 * authored 640x480 frame and is centred into whichever box this is by
 * `frameDrop()`, which is therefore 187 in portrait and 0 in landscape.
 *
 * IT IS A FLOOR, NOT A FIXED SIZE. `resolveDesignHeight` never returns less
 * than this, and grows it on a screen taller than the box.
 */
export const BASE_HEIGHT = DESIGN.height;

/**
 * How tall the design box may grow on a screen taller than 9:16.
 *
 * THE ONLY THING THIS BUYS IS LANE LENGTH, which is worth stating plainly
 * because it is not obvious and it was got wrong once. The board always fits
 * to width, so the scale is fixed by the screen's width alone: the painted
 * nose is 276px across on a 390px-wide phone at EVERY value of this constant.
 * Raising it does not make the nose, the bricks or the ball one pixel bigger.
 * All it does is stretch the empty lane between the maxillary floor and the
 * paddle, and turn black margin below the board into board.
 *
 * SO THE QUESTION IS ONLY HOW MUCH REACTION ROOM THE BOX WANTS. In portrait,
 * the lane below the painting's lowest point is already 412px at the base
 * height — about 1.5s of fall at BALL.baseSpeed — and 940 takes it to 498 and
 * covers a 19.5:9 handset nearly edge to edge. An earlier pass on the
 * landscape board tried to fill the screen this way without narrowing it and
 * was reported as far too stretched; the difference in portrait is that the
 * board got BIGGER as well as taller, so the extra height is lane the player
 * can see the ball falling through rather than a corridor watched from far
 * away.
 *
 * IN LANDSCAPE THIS IS THE AUTHORED 560, which is the value that shipped: a
 * 134px lane, two and a half times the frame's own 54, for the narrow-window
 * case. A landscape SCREEN is wider than 4:3 and never reaches it.
 *
 * IN PORTRAIT IT IS NOW THE BASE HEIGHT, WHICH PINS THE BOX. That is a change
 * from when it was 940, and the reason is that the portrait box's vertical
 * composition is now tuned as a whole: FRAME_CY centres the painted section
 * between the top wall and the paddle, so growing the board only stretches the
 * thumb zone and the lane below a nose that stays where it is. A taller phone
 * letterboxes instead, and Viewport puts three quarters of that slack BELOW the
 * board — which is thumb zone under another name, and costs the player nothing.
 *
 * Retune whichever number matters to trade lane against black margin; nothing
 * else has to move, and CAPSULE.fallSpeed follows it automatically.
 */
const MAX_DESIGN_HEIGHT = IS_PORTRAIT ? BASE_HEIGHT : 560;

/**
 * Distances measured from the board's FLOOR rather than its ceiling, captured
 * at the base height before anything can move them.
 *
 * This is the complete list, which is the point of writing it down. Everything
 * else in the game measures down from y 0 — the HUD, the walls' top edge, the
 * brick grid, the painted section, the corruption meter — and a taller board is
 * invisible to all of it.
 */
const PADDLE_BOTTOM_INSET = BASE_HEIGHT - PADDLE.y;
const CAPSULE_BASE_FALL = CAPSULE.fallSpeed;
const CAPSULE_BASE_LANE = PADDLE.y - GRID.y;
const FLOOR_TO_DEATH_LINE = BASE_HEIGHT - FIELD.bottom;

/**
 * How tall the design box should be for a screen of this size.
 *
 * WIDTH IS THE ANCHOR AND HEIGHT IS THE FREE AXIS. The board's width is what
 * the whole layout is built around — the placed art frame, the thirteen grid
 * columns carried in with it, the HUD's regions — so it stays at whatever the
 * chosen box set it to and the box grows downward instead. `fitted` is the
 * height at which the box would exactly fill the screen once its width does.
 *
 * ON ANY SCREEN AT LEAST AS WIDE AS THE BOX THIS RETURNS THE BASE HEIGHT, and
 * since the box was chosen from the screen's own shape at boot that is the
 * overwhelmingly common case in both: a landscape screen gets 640x480, a phone
 * gets 480x854. It has anything to say only about a screen TALLER than the box
 * it picked — a 19.5:9 handset against the 9:16 portrait box, or a narrow
 * window against the 4:3 landscape one.
 */
export function resolveDesignHeight(screenW, screenH) {
  if (!screenW || !screenH) return BASE_HEIGHT;

  const fitted = (DESIGN.width * screenH) / screenW;
  return Math.round(Math.max(BASE_HEIGHT, Math.min(MAX_DESIGN_HEIGHT, fitted)));
}

/**
 * Move the board's floor, and the handful of things measured from it.
 *
 * Called from Viewport.layout on every resize, so it is idempotent and cheap.
 * The boolean is what callers use to skip the expensive follow-up work — a
 * scene reflow, a chrome redraw — on the resizes that did not change the box,
 * which is most of them.
 */
export function applyDesignHeight(height) {
  if (height === DESIGN.height) return false;

  DESIGN.height = height;
  PADDLE.y = height - PADDLE_BOTTOM_INSET;
  // The death line rides with the paddle, not with the board: see FIELD.bottom.
  FIELD.bottom = height - FLOOR_TO_DEATH_LINE;

  // Capsules scale with the lane they fall down, so a power-up released at the
  // top of the grid takes the same time to reach the paddle as it does at the
  // base height. See CAPSULE.fallSpeed for why that duration is the thing
  // being held constant rather than the speed.
  //
  // THE BALL IS DELIBERATELY NOT SCALED HERE. Scaling it too would make a tall
  // board play identically to a short one, only zoomed, and the extra reaction
  // time in the lane below the nose is the entire reason for the tall board.
  CAPSULE.fallSpeed = (CAPSULE_BASE_FALL * (PADDLE.y - GRID.y)) / CAPSULE_BASE_LANE;

  return true;
}

/**
 * How far to drop a group that was composed against the authored frame so that
 * it stays centred on the board.
 *
 * It is for the menu, picker, revive and result CARDS, which are composed
 * top-down against the frame's 480 and would otherwise huddle in the top half
 * of a 854-tall board with the rest of it empty. GameScene deliberately does
 * NOT use it for the playfield: that layout is anchored to the ceiling (the
 * HUD, the brick grid, the painting) and to the floor (the paddle) rather than
 * centred, which is the whole reason the box grows downward. Its pause card
 * does use it.
 *
 * IT IS ZERO IN THE LANDSCAPE BOX BY CONSTRUCTION, since that box IS the
 * authored frame, and 187 in the portrait one at the base height. So every
 * card screen is laid out exactly as authored on a desktop and shares the
 * portrait board's extra height out evenly on a phone, from one set of
 * coordinates.
 */
export function frameDrop() {
  return (DESIGN.height - DESIGN_FRAME.height) / 2;
}

/* ======================================================== HUD scaling == */

/**
 * Live HUD scale. 1 on a desktop, up to HUD_MAX_SCALE on a phone.
 *
 * A mutable field for the same reason `DESIGN.height` is one: every reader
 * wants the current value at call time, and threading it through Hud, the
 * pause button and Viewport as an argument would mean three places that can
 * disagree about how big the bar is.
 */
export const HUD = { scale: 1 };

/**
 * The physical size the bar is aiming for, in CSS pixels.
 *
 * 36 design pixels of bar comes out at 68 CSS pixels on a 1440px desktop and
 * 22 on a 390px phone, where the 22px pause glyph inside it lands at 13 — too
 * small to read and well under any reasonable tap target.
 *
 * RAISED FROM 40 TO 54, which is the other half of the readability fix (see
 * HUD_H for the first). 40 was a floor for legibility at arm's length and read
 * as exactly that — legible, not comfortable. 54 puts the score value at 25.6
 * CSS pixels and a heart at 24 on a 390px phone, both about a third up. The
 * scale needed to reach it is derived rather than tabulated, and on the
 * landscape board the bar is already past it, so nothing changes there.
 */
const HUD_TARGET_CSS = 54;

/**
 * Ceiling on the scale, because the bar competes for width as it grows.
 *
 * WIDTH IS WHAT SETS IT, so it differs by box, and it is multiplied by
 * HUD_UNIT before it reaches any metric — so the portrait ceiling of 1.4 is
 * really 1.94 worth of authored size. The bar has to hold a six-digit score,
 * the level text, three hearts and the pause toggle across 480 design pixels,
 * and past 1.94 the hearts reach far enough in that `Hud._applyLevelText`
 * cannot fit even a bare level number between them and the score.
 *
 * THE BADGE ROW IS NO LONGER IN THAT COMPETITION IN PORTRAIT — it moved to its
 * own line under the bar, which is what bought the level indicator the room to
 * stay visible at this size. See M.powerRowBelow in hud.js.
 */
const HUD_MAX_SCALE = IS_PORTRAIT ? 1.4 : 1.8;

/**
 * How big the HUD should be for this board scale and this much headroom.
 *
 * TWO LIMITS, AND THE SECOND IS THE INTERESTING ONE. The bar grows UPWARD,
 * into the letterbox space above the board, because everything below y 36 is
 * spoken for: the top wall sits at 36..44 and row 0's bricks start at y 61.
 * So the scale can only rise as far as there is empty screen above the board
 * to rise into, which is what `headroom` measures.
 *
 * A phone in PORTRAIT normally clears both limits comfortably: a 390x844
 * screen leaves 46 design pixels of headroom above a 480x854 board, which
 * affords 2.28, and HUD_TARGET_CSS asks for only 1.37. A phone held LANDSCAPE
 * is now pillarboxed rather than letterboxed — it is wider than the board, not
 * taller — so it has no headroom at all, this returns 1, and the glyphs stay
 * their authored size. The pause button's tap target does not depend on this
 * (see TAP_CSS in hud.js), so it stays reachable either way.
 *
 * @param {number} viewportScale design pixels -> CSS pixels
 * @param {number} headroom design pixels of empty screen above the board
 */
export function resolveHudScale(viewportScale, headroom) {
  if (!viewportScale) return 1;

  const wanted = HUD_TARGET_CSS / (HUD_H * viewportScale);
  const affordable = 1 + Math.max(0, headroom) / HUD_H;

  return Math.max(1, Math.min(HUD_MAX_SCALE, wanted, affordable));
}

/** True if the scale actually moved, which is what gates a re-layout. */
export function applyHudScale(scale) {
  if (scale === HUD.scale) return false;
  HUD.scale = scale;
  return true;
}

/**
 * How far above y 0 the bar reaches at the current scale.
 *
 * Viewport extends its mask by this much, or the extension is clipped away by
 * the same mask that draws the letterbox bars.
 */
export function hudLift() {
  return (HUD.scale - 1) * HUD_H;
}
