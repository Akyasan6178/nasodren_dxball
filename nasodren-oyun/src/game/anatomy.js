import { DESIGN_FRAME, FRAME_CX, frameX, frameY } from './config.js';

/**
 * The paranasal sinuses, as a coronal section — TRACED FROM assets/background.png.
 *
 * EVERY LITERAL IN THIS FILE IS IN FRAME SPACE — the 640x480 box the painting
 * is cover-fitted into — and `place()` below is the single point at which they
 * become board coordinates, in whichever of the two boxes config.js chose at
 * boot. Nothing else in the codebase authors a point. `cavity.js` publishes the regions congestion may
 * occupy from these rings.
 *
 * MEASURED, NOT AUTHORED, AND THAT IS THE WHOLE POINT OF THIS REWRITE. This
 * file used to hold hand-written curve commands for a wireframe that
 * `sinus.js` stroked on screen. That wireframe is no longer drawn: since the
 * Phase 1 reskin the section the player sees IS background.png, a 1920x1080
 * painting, cover-fitted into the design box by `GameScene._buildField`. The
 * authored curves stayed behind as the brick-containment geometry and quietly
 * stopped describing anything visible — they ran to x 556 where the painted
 * cheekbone stops at 504, and more than HALF of the region they called "inside
 * a sinus" was bare navy background. A layout could pass `check:nose` with
 * clumps floating in open space beside the nose, which is precisely the defect
 * the containment rule exists to prevent.
 *
 * So the rings below are the painting's own cavities, recovered from the pixels:
 * the neon's white core is the wall, the enclosed regions inside it are the air
 * spaces, and each ring is that region's boundary simplified to about 0.9px.
 * Re-derive them with scripts/trace-sinus.mjs if the art is ever re-exported.
 *
 * FOUR CHAMBERS PLUS FOUR CELLS, NOT ONE CONTINUOUS PASSAGE. The old geometry
 * ran each side as a single outline from the brow to the alveolar floor,
 * pinched at the ethmoid. The painting does not do that. It has two large
 * closed chambers per side — frontal above, maxillary below — and between them
 * two small closed air cells; the neck that appears to join them is drawn as
 * open turbinate scrolls, so there is no enclosed interior at all between
 * y 148 and y 201. Nothing can be placed there, and a continuous outline
 * claiming otherwise is what let the old geometry drift.
 *
 * THE RIGHT SIDE IS TRACED AND THE LEFT IS ITS MIRROR, which is a deliberate
 * departure from the pixels. The painting's two halves were rasterised
 * independently and differ by about a percent in area — its axis lands within
 * a pixel of 320, but the halves are not reflections of each other to better
 * than a few pixels anywhere. Mirroring about CX keeps the two
 * tracts identical, so a cell legal in column 8 is legal in column 4 and
 * neither sinus can play differently from the other — which the per-side
 * clearance colouring and the balanced-start check in check-nose.mjs both
 * depend on. The cost is that a mirrored ring can sit up to 3.8px outside the
 * painted left cavity; the brick margin is 8px, so every legal cell still
 * clears the painted wall by at least 1.5px. check:nose prints that number.
 */

/**
 * The painting's midline, in board coordinates.
 *
 * Exported because `cavity.js` and `sinus.js` both mirror about it and both
 * used to derive it as `DESIGN.width / 2`. That happens to be the same number,
 * since the frame is placed centred horizontally in both boxes — but it is the
 * same number by coincidence rather than by construction, and the coincidence
 * breaks the moment FRAME_CX stops being the box's midpoint. One definition, in
 * the file that owns the geometry.
 */
export const MIDLINE_X = frameX(DESIGN_FRAME.width / 2);

const CX = MIDLINE_X;

/**
 * Frame space -> board space.
 *
 * EVERY RING BELOW IS WRITTEN IN THE COORDINATES trace-sinus.mjs PRINTS, which
 * are the 640x480 frame the painting is cover-fitted into, and this is the one
 * place they become board coordinates. Keeping the literals in frame space is
 * deliberate: re-running `scripts/trace-sinus.mjs` after an art re-export must
 * stay a copy-paste, not a copy-paste-and-subtract-80.
 *
 * IT IS THE SAME TRANSFORM THE BACKGROUND SPRITE GETS, which is the whole
 * point: `frameX`/`frameY` are a similarity — one scale about one centre — and
 * the painting, these rings and the brick grid all go through them, so a ring
 * lands on the pixel of background.png it was traced from no matter how the
 * frame is placed. In the landscape box the placement is the identity. Move
 * FRAME_CY or FRAME_SCALE and the rings follow the painting for free; that is
 * why there is no second offset anywhere to keep in sync.
 */
const place = (poly) => poly.map(([x, y]) => [frameX(x), frameY(y)]);

/**
 * Reflect a ring about the midline.
 *
 * The winding reverses with the reflection, so the point order is reversed to
 * put it back — `areaCentroid` in cavity.js takes a signed area and would
 * hand back a centroid negated about the origin from a ring wound the other
 * way. The crossing test does not care; that one does.
 */
export const mirrorPolygon = (poly) => poly.map(([x, y]) => [2 * CX - x, y]).reverse();

/**
 * The right frontal sinus: the upper chamber, above the brow.
 *
 * x 343.6..472.0, y 30.2..148.0 — 7830 design px².
 * Its roof runs out and gently down to a lateral tip, so the corner beside the
 * septum is the highest thing in the zone. Grid rows 0..2 reach into it.
 */
export const FRONTAL_RIGHT = place([
  [362.2, 30.2], [370.7, 30.2], [372, 32.9], [376, 32.9], [376, 34.2], [381.3, 38.2],
  [381.3, 42.2], [384, 43.6], [384, 47.6], [386.7, 48.9], [386.7, 52.9], [392, 56.9],
  [392, 60.9], [394.7, 62.2], [398.7, 67.6], [402.7, 67.6], [406.7, 72.9], [410.7, 72.9],
  [412, 75.6], [416, 75.6], [417.3, 78.2], [421.3, 78.2], [421.3, 79.6], [424, 80.9],
  [424, 84.9], [426.7, 86.2], [426.7, 87.6], [429.3, 88.9], [438.7, 99.6], [442.7, 99.6],
  [444, 102.2], [448, 102.2], [449.3, 104.9], [456, 104.9], [457.3, 107.6], [464, 107.6],
  [465.3, 110.2], [469.3, 110.2], [469.3, 114.2], [472, 115.6], [472, 121.3], [470.7, 121.3],
  [466.7, 126.7], [462.7, 126.7], [461.3, 129.3], [434.2, 129.3], [432.9, 126.7], [409.3, 126.7],
  [408, 129.3], [398.7, 129.3], [397.3, 132], [393.3, 132], [392, 134.7], [388, 134.7],
  [386.7, 137.3], [382.7, 137.3], [378.7, 142.7], [374.7, 142.7], [373.3, 145.3], [369.3, 145.3],
  [368, 148], [354.2, 148], [354.2, 146.7], [343.6, 137.3], [343.6, 107.6], [346.2, 106.2],
  [346.2, 88.9], [348.9, 87.6], [348.9, 46.2], [351.6, 44.9], [351.6, 40.9], [354.2, 39.6],
  [354.2, 35.6], [355.6, 35.6], [356.9, 32.9], [360.9, 32.9],
]);

/**
 * The right maxillary sinus: the lower chamber, and the one the play happens in.
 *
 * x 367.6..504.0, y 270.2..388.0 — 8950 design px².
 * A wing that leaves the ethmoid narrow, flares to the cheekbone at x 504 and
 * closes back down onto a flat alveolar floor. IT IS WIDE ONLY IN A NARROW
 * BAND: 133px across at y 304, under 45px at y 280 and again by y 360, which
 * is why the grid only offers four cell positions per side down here. Rows
 * 12..13 reach into it; the floor below y 340 is past the last grid row.
 */
export const MAXILLARY_RIGHT = place([
  [380.9, 270.2], [394.7, 270.2], [396, 272.9], [400, 272.9], [401.3, 275.6], [405.3, 275.6],
  [406.7, 278.2], [410.7, 278.2], [412, 280.9], [418.7, 280.9], [420, 283.6], [426.7, 283.6],
  [428, 286.2], [440, 286.2], [441.3, 288.9], [458.7, 288.9], [460, 291.6], [480, 291.6],
  [481.3, 294.2], [490.7, 294.2], [492, 296.9], [496, 296.9], [496, 298.2], [501.3, 302.2],
  [501.3, 306.2], [504, 307.6], [504, 313.3], [501.3, 314.7], [501.3, 318.7], [500, 318.7],
  [496, 324], [492, 324], [490.7, 326.7], [484, 326.7], [480, 332], [476, 332],
  [474.7, 334.7], [464, 344], [464, 348], [458.7, 352], [458.7, 356], [453.3, 360],
  [453.3, 364], [450.7, 365.3], [450.7, 369.3], [448, 370.7], [448, 374.7], [446.7, 374.7],
  [437.3, 385.3], [433.3, 385.3], [432, 388], [418.2, 388], [416.9, 385.3], [412.9, 385.3],
  [412.9, 384], [404.9, 377.3], [404.9, 373.3], [402.2, 372], [402.2, 365.3], [399.6, 364],
  [399.6, 357.3], [396.9, 356], [396.9, 349.3], [394.2, 348], [394.2, 341.3], [391.6, 340],
  [391.6, 336], [388.9, 334.7], [388.9, 330.7], [386.2, 329.3], [386.2, 325.3], [380.9, 321.3],
  [380.9, 317.3], [375.6, 313.3], [375.6, 309.3], [370.2, 305.3], [370.2, 301.3], [367.6, 300],
  [367.6, 280.9], [368.9, 280.9], [375.6, 272.9], [379.6, 272.9],
]);

/**
 * The two right ethmoid air cells, between the chambers.
 *
 * x 338.2..357.3, y 200.9..222.7 and x 338.2..370.7, y 238.2..262.7.
 * SCENERY ONLY — they are not brick tracts. The larger of the two has a
 * 28x14px interior once the walls are cleared, and the smallest cell the game
 * can draw is 18.4x17.1px before its own 7.6px margin, so nothing fits in
 * either. They are here so the inflammation glow lights every air space the
 * painting shows rather than only the two it can hold mucus in.
 */
export const ETHMOID_UPPER_RIGHT = place([
  [346.2, 200.9], [348, 203.6], [352, 203.6], [352, 204.9], [354.7, 206.2], [354.7, 210.2],
  [357.3, 211.6], [357.3, 220], [356, 220], [354.7, 222.7], [348.9, 222.7], [347.6, 220],
  [343.6, 220], [343.6, 218.7], [338.2, 214.7], [338.2, 206.2], [339.6, 206.2], [340.9, 203.6],
  [344.9, 203.6],
]);

export const ETHMOID_LOWER_RIGHT = place([
  [346.2, 238.2], [360, 238.2], [361.3, 240.9], [365.3, 240.9], [365.3, 242.2], [370.7, 246.2],
  [370.7, 254.7], [369.3, 254.7], [368, 257.3], [356, 257.3], [354.7, 260], [350.7, 260],
  [349.3, 262.7], [340.9, 262.7], [340.9, 261.3], [338.2, 260], [338.2, 248.9], [340.9, 247.6],
  [340.9, 243.6], [342.2, 243.6],
]);

/**
 * The septum: the midline, spanning the painted ridge between the chambers.
 *
 * Measured the same way as the rings — the vertical extent of the white core
 * in the ten pixels either side of the painting's axis. It is not a
 * containment boundary: the chambers already stop at their own medial walls,
 * 24px apart at the frontal and 96px at the maxillary. It is kept because it
 * is the line the two halves are read against, and because `SEPTUM_X` is what
 * `GameScene` asks which sinus a broken brick belonged to.
 */
export const SEPTUM = place([
  [320, 170.7],
  [320, 362.2],
]);
