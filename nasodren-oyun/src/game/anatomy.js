import { DESIGN } from './config.js';

/**
 * The paranasal sinuses, as a coronal section, in three vertical zones.
 *
 * Every coordinate in the drawing lives here, in DESIGN space (640x480), and
 * nothing else in the codebase authors a point. `cavity.js` flattens these
 * paths and publishes the regions congestion may occupy; `sinus.js` strokes
 * them as real curve commands.
 *
 * AUTHORED CURVES, NOT A SPLINE. This file used to hold a ring of anchors that
 * cavity.js pushed through a closed Catmull-Rom. That was the right tool for a
 * single organic blob and it is the wrong one for this blueprint, because a
 * spline derives every tangent from the neighbouring anchors and this shape
 * needs three different tangent behaviours stacked on top of each other: a
 * straight medial wall that must not bow, a waist that must pinch to a slot,
 * and a bumpy lateral wall whose whole character is the tangent BREAKS at each
 * bump. A spline smooths all three into the same lazy oval. So each edge is now
 * written as the curve it actually is — cubics where a run sweeps, quadratics
 * where it turns a corner or lifts into a bump, and a line where the anatomy is
 * genuinely straight.
 *
 * THE THREE ZONES, top to bottom. Read them off SINUS_RIGHT below; the comments
 * there mark where each one starts.
 *
 *   ZONE 1 — FRONTAL SINUS (y 51..122). A small cavity above the brow, wider
 *   than the channel beneath it and far smaller than the wing below. IT POINTS
 *   OUTWARD, which took two attempts and is the whole difference between a
 *   teardrop and a bubble. The roof must leave the superomedial corner running
 *   OUT and gently DOWN to a tip at roughly (455, 110), so the corner beside
 *   the septum is the highest thing in the zone and the silhouette narrows as
 *   it goes lateral. Arch the roof up over the middle instead and the same four
 *   points come out a dome — which is what the first cut of this zone was.
 *
 *   ZONE 2 — ETHMOID CHANNEL (y 122..220). The nasal bridge, and the pinch that
 *   makes the two zones either side of it read as separate cavities. It is
 *   about 35px of clear width against 220 at the widest point of the wing. The
 *   lateral wall is a chain of three alternating quadratics — in, out, in — each
 *   about 8px off the run. Those bumps are the ethmoid air cells, and the
 *   tangent discontinuity where two quadratics meet is deliberate: a smooth
 *   sine would read as a wobble in the drawing, whereas a break reads as a cell
 *   boundary.
 *
 *   ZONE 3 — MAXILLARY SINUS (y 220..380). The play area, and the half of the
 *   drawing the bricks live in. The lateral wall leaves the channel and sweeps
 *   high and wide to the cheekbone at x 556 before angling back down and in,
 *   which is the butterfly wing. The floor is deliberately flat — it bows about
 *   10px across 145 of width — because it is the alveolar recess where fluid
 *   actually pools, and because a curved floor would cost the bottom two brick
 *   rows their outer columns.
 *
 * THE MEDIAL WALL IS ONE STRAIGHT LINE from the floor to the frontal roof, at
 * x 336 against a septum at 320. It is the single most load-bearing edge here.
 * Everything else in the section flares, pinches and bumps, and if the inner
 * edge joins in then the drawing has no fixed reference and the three zones stop
 * reading as three zones of one passage. Straight, and parallel to its mirror
 * image across the septum, is what makes the waist look like a waist.
 *
 * MIRRORED. The right side is authored and the left reflected, so the two
 * tracts hold identical layouts and neither side can play differently.
 */

const CX = DESIGN.width / 2;

/**
 * Reflect an authored path about the midline.
 *
 * Every command is a run of x/y pairs after its opcode, so mirroring is the
 * same operation on all four: flip each x about CX and leave the ys alone. The
 * winding reverses with the reflection, which nothing here cares about — the
 * crossing test in cavity.js is even-odd and the strokes are closed loops.
 */
export const mirrorPath = (cmds) =>
  cmds.map((c) => {
    const out = [c[0]];
    for (let i = 1; i < c.length; i += 2) out.push(2 * CX - c[i], c[i + 1]);
    return out;
  });

/**
 * The right half of the section: one continuous cavity through all three zones,
 * clockwise from the top of the medial wall.
 *
 * ONE OUTLINE, NOT THREE SHAPES. The zones are distinct in silhouette and
 * continuous in structure, which is both what the blueprint describes ("the
 * cavities narrow", not "a second cavity begins") and what the neon wants: a
 * single unbroken tube from the brow to the floor reads as lit glass, where
 * three stacked loops would read as three diagram callouts. The septum is what
 * makes the pair distinct, and it runs the full height beside them.
 *
 * THE CLOSING LINE MUST LAND ON THE OPENING MOVE. The last command runs the
 * medial wall back to the y the 'M' opened at, and if those two numbers drift
 * apart nothing in the game notices: the crossing test closes the ring
 * implicitly and keeps answering correctly, the glow fills the shape it meant
 * to, and the only symptom is a length of missing neon on screen. It has
 * happened once already — the frontal roof was raised and the wall underneath
 * it was left ending at the old height, leaving a 24px hole. `check:nose`
 * asserts it now.
 */
export const SINUS_RIGHT = [
  /* --- zone 1: frontal sinus ------------------------------------------- */
  ['M', 336, 72],
  ['Q', 337, 58, 352, 55],                // superomedial corner, tight
  ['C', 384, 50, 424, 70, 452, 100],      // the roof, running OUT and gently down
  ['Q', 462, 114, 442, 122],              // the teardrop's point, turned short

  /* --- zone 2: ethmoid channel ----------------------------------------- */
  ['C', 414, 132, 384, 136, 372, 152],    // the underside collapsing into the bridge
  ['Q', 364, 166, 371, 178],              // air cell, bulging medially
  ['Q', 378, 190, 369, 200],              // air cell, bulging laterally
  ['Q', 360, 210, 368, 220],              // air cell, and the mouth of the wing

  /* --- zone 3: maxillary sinus ----------------------------------------- */
  ['C', 392, 240, 440, 244, 478, 262],    // the wing's upper edge, sweeping wide
  ['C', 528, 286, 562, 314, 556, 342],    // the cheekbone: widest, then down and in
  ['Q', 549, 366, 512, 372],              // the lateral angle rounding onto the floor
  ['C', 460, 380, 400, 378, 366, 368],    // the floor: flat and wide
  ['Q', 344, 361, 338, 338],              // rounding back up onto the medial wall

  /* --- the medial wall: straight, all the way home --------------------- */
  ['L', 336, 72],
];

/**
 * The septum: one hairline down the exact midline, top to bottom.
 *
 * IT SPANS THE WHOLE SECTION, not just the maxillary zone. The frontal
 * cavities are the two closest structures in the drawing — their superomedial
 * corners come within 32px of each other — so a septum that started below them
 * would leave the pair reading as one lobed shape at the top and two chambers
 * at the bottom. Running it from above the roofs to below the floors is what
 * makes every zone a pair.
 *
 * Drawn at CAVITY.septumRadius, which is 1.5 — a 3px stroke, against the 7px
 * the cavity walls get. THE GAP AROUND IT IS THE POINT: the two medial walls
 * sit at x 336 and 304, so the nasal cavity is 32px of dark with a hairline
 * down its centre, and that narrowness is what gives the wings their scale.
 * Widen it and the two halves stop being one section.
 */
export const SEPTUM = [
  ['M', 320, 56],
  ['L', 320, 376],
];
