import { BRICK, CAVITY, SINUS } from './config.js';
import {
  FRONTAL_RIGHT,
  MAXILLARY_RIGHT,
  ETHMOID_UPPER_RIGHT,
  ETHMOID_LOWER_RIGHT,
  SEPTUM,
  MIDLINE_X,
  mirrorPolygon,
} from './anatomy.js';

/**
 * The sinus section: traced rings in, regions and distances out.
 *
 * Coordinates live in anatomy.js, recovered from background.png by
 * scripts/trace-sinus.mjs. This file mirrors the authored right half to make
 * the left and publishes the questions the rest of the game asks of the
 * drawing. Everything is in board space — anatomy.js has already carried the
 * traced rings there — like the rest of the gameplay maths.
 *
 * THERE IS NO CURVE FLATTENING HERE ANY MORE. This file used to carry a
 * Bezier evaluator, because anatomy.js held hand-authored 'M'/'L'/'Q'/'C'
 * commands for a wireframe that sinus.js stroked on screen. Nothing strokes it
 * now — the section the player sees is the painting — so the geometry is
 * traced from that painting and arrives as rings of points. Flattening a
 * polyline is a no-op, and keeping the evaluator around to perform it would
 * only invite someone to author a curve that the painting does not have.
 *
 * IT IS SCENERY. Nothing here touches the ball. The playfield is the plain
 * rectangle it always was — `GameScene._collideWalls` owns FIELD.left,
 * FIELD.right and FIELD.top, and nothing else turns a ball around. An earlier
 * pass made every stroke a solid capsule the ball rebounded off; it was
 * reverted because curved bumpers scatter a shot unpredictably, and a breakout
 * board the player cannot aim in is not a breakout board.
 *
 * WHAT THE COORDINATES STILL DECIDE:
 *
 *   `NOSE_STROKES` — every ring in the drawing, with the width to stroke it at
 *   and which side it belongs to. `sinus.js` reads nothing else.
 *
 *   `BRICK_TRACTS` — the four chambers, and the only regions congestion may
 *   occupy. Enforced at level-validation time by `rectInsideTract`: mucus
 *   belongs in the sinuses it is blocking, and a clump floating in the nasal
 *   cavity or out in the open board is what would look broken.
 *
 *   `GLOW_REGIONS` and `GLOW_FOCI` — what the inflammation gradient is filled
 *   into, per side, and the point in each one it is brightest at. Wider than
 *   the tracts: it lights the ethmoid cells too, which hold no bricks.
 */

const CX = MIDLINE_X;

/**
 * Build one stroke entry.
 *
 * `side` is 0 for the left half of the section, 1 for the right, and null for
 * anything on the midline. `sinus.js` tints off this field directly rather than
 * from a table keyed by id — with a table, adding a structure and forgetting
 * its entry means a structure that is silently never drawn.
 *
 * `radius` AND `lineRadius` ARE DELIBERATELY DIFFERENT NUMBERS, and the split
 * is the whole reason this function is not a literal. `radius` is the reach the
 * brick-containment margin is measured from, and it is ZERO for every chamber:
 * these rings are traced from the INNER edge of the painted wall — the air side
 * of it — so the distance from a brick to the ring already IS the distance to
 * the wall, and adding a stroke width on top would charge the margin twice and
 * cost cells the painting has room for. `lineRadius` is half the width to draw
 * the ring at if anything draws it, which nothing currently does; it is what
 * `radius` used to be, and keeping the two apart is what stops re-enabling
 * sinus.js from silently moving every brick.
 */
const stroke = (id, points, radius, side, closed = true) => ({
  id,
  points,
  radius,
  lineRadius: radius || CAVITY.wallRadius,
  side,
  closed,
});

const FRONTAL_LEFT = mirrorPolygon(FRONTAL_RIGHT);
const MAXILLARY_LEFT = mirrorPolygon(MAXILLARY_RIGHT);
const ETHMOID_UPPER_LEFT = mirrorPolygon(ETHMOID_UPPER_RIGHT);
const ETHMOID_LOWER_LEFT = mirrorPolygon(ETHMOID_LOWER_RIGHT);

/**
 * Every ring in the drawing: four chambers, four ethmoid cells, one septum.
 *
 * NINE, WHERE THERE USED TO BE THREE. The old geometry ran each side as a
 * single outline from the brow to the alveolar floor, on the theory that one
 * unbroken tube reads as lit glass where stacked loops read as diagram
 * callouts. That was a good argument about a drawing this code no longer makes.
 * The painting has discrete closed chambers with open turbinate scrolls
 * between them, and the geometry's only remaining job is to answer questions
 * about the painting truthfully.
 *
 * Order is paint order: cavities first, the septum last so the hairline on the
 * midline stays the crispest thing in the section.
 */
export const NOSE_STROKES = [
  stroke('frontal-l', FRONTAL_LEFT, 0, 0),
  stroke('frontal-r', FRONTAL_RIGHT, 0, 1),
  stroke('maxillary-l', MAXILLARY_LEFT, 0, 0),
  stroke('maxillary-r', MAXILLARY_RIGHT, 0, 1),
  stroke('ethmoid-upper-l', ETHMOID_UPPER_LEFT, 0, 0),
  stroke('ethmoid-upper-r', ETHMOID_UPPER_RIGHT, 0, 1),
  stroke('ethmoid-lower-l', ETHMOID_LOWER_LEFT, 0, 0),
  stroke('ethmoid-lower-r', ETHMOID_LOWER_RIGHT, 0, 1),
  stroke('septum', SEPTUM, CAVITY.septumRadius, null, false),
];

/**
 * The strokes on the midline rather than in a paired structure.
 *
 * The septum takes the mean of the two sides' inflammation rather than either
 * one's, because it belongs to neither.
 */
export const MIDLINE_IDS = new Set(['septum']);

/** The midline. Bricks left of it belong to the left sinus, right of it the right. */
export const SEPTUM_X = CX;

const byId = (id) => NOSE_STROKES.find((s) => s.id === id).points;

/**
 * The four chambers: the only regions congestion may occupy.
 *
 * Left entries first to match the order every per-side array in this codebase
 * uses.
 *
 * THE ETHMOID CELLS ARE DELIBERATELY NOT HERE, and it is worth writing down
 * why so nobody adds them back as an oversight. They are genuine air spaces
 * and the glow lights them, but the larger of the four measures 28x14px of
 * clear interior and the smallest cell the game can draw is 18.4x17.1px before
 * its own 7.6px margin. Nothing fits. Listing them as tracts would not gain a
 * single legal position; it would only mean `insideTract` returning true for
 * points no layout can ever use.
 *
 * NOT THE NASAL CAVITY between the two sides either. It is the lane the ball
 * travels up, and mucus drawn there would bury the septum that gives the
 * section its scale.
 */
export const BRICK_TRACTS = [
  byId('frontal-l'),
  byId('maxillary-l'),
  byId('frontal-r'),
  byId('maxillary-r'),
];

/**
 * What the inflammation gradient is filled into, per side.
 *
 * Four polygons a side rather than one, which is what the per-side list was
 * always shaped for: `sinus.js` gives every polygon in the list its own focus,
 * which is a correctness requirement rather than a nicety — see the note on
 * GLOW_FOCI below.
 */
export const GLOW_REGIONS = [
  [byId('frontal-l'), byId('maxillary-l'), byId('ethmoid-upper-l'), byId('ethmoid-lower-l')],
  [byId('frontal-r'), byId('maxillary-r'), byId('ethmoid-upper-r'), byId('ethmoid-lower-r')],
];

/**
 * Where the inflammation gradient is brightest, per polygon of GLOW_REGIONS.
 *
 * IT LIVES HERE RATHER THAN IN sinus.js BECAUSE IT IS A GEOMETRIC INVARIANT
 * AND IT HAS BEEN BROKEN ONCE. `gradientStack` builds its falloff by scaling a
 * polygon about this point, so a focus OUTSIDE the polygon does not dim that
 * region — it marches every layer out of it and the cavity goes dark. That is
 * a property of these coordinates, not of the renderer, and a renderer is a
 * bad place to keep something `check:nose` has to be able to assert.
 *
 * AREA-WEIGHTED, which is the part that broke. Averaging the outline points
 * weights an edge by how many samples it happens to carry, so a long thin
 * passage counts for as much as the wide chamber it opens into. The shoelace
 * centroid weights by area instead, so on the maxillary wing the light pools
 * in the belly of the chamber, over the bricks, rather than up in its narrow
 * mouth.
 *
 * The bias then pulls it toward the midline, because that is where a sinus
 * drains from and where mucosal thickening starts. Purely a look — but it is
 * the look of a scan rather than of a lamp in a box.
 */
function areaCentroid(points) {
  let a = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const cross = points[j][0] * points[i][1] - points[i][0] * points[j][1];
    a += cross;
    cx += (points[j][0] + points[i][0]) * cross;
    cy += (points[j][1] + points[i][1]) * cross;
  }

  a *= 0.5;

  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export const GLOW_FOCI = GLOW_REGIONS.map((polys) =>
  polys.map((points) => {
    const { x, y } = areaCentroid(points);
    return { x: x + (CX - x) * SINUS.glow.medialBias, y };
  }),
);

/* ------------------------------------------------- design-time queries -- */

/** Standard even-odd crossing test. */
function inPolygon(x, y, poly) {
  let hit = false;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }

  return hit;
}

/**
 * Is this point inside a chamber — the region congestion may occupy?
 *
 * Tested against the same rings the painting was traced from, so "inside a
 * tract" means inside the air space the player can actually see rather than a
 * second approximation of it.
 */
export function insideTract(x, y) {
  return BRICK_TRACTS.some((poly) => inPolygon(x, y, poly));
}

/**
 * Is this point inside any air space the inflammation gradient is filled into?
 *
 * Wider than `insideTract`, and the two are not interchangeable. This one
 * answers "would the glow cover this", which includes the ethmoid cells; the
 * other answers "may a brick go here", which does not.
 */
export function insideGlow(x, y) {
  for (const side of GLOW_REGIONS) {
    for (const poly of side) if (inPolygon(x, y, poly)) return true;
  }

  return false;
}

/**
 * Distance from a point to a polyline.
 *
 * Closed rings need the edge from the last point back to the first, which is
 * not in the point list. Walking `i` to `length - 1` and pairing with
 * `i + 1` silently skips it, and on a traced ring that edge can be the long
 * one — the trace starts at the topmost-leftmost pixel, so the seam sits in
 * the middle of a wall rather than at a corner.
 */
function polylineDistance(x, y, points, closed) {
  const n = points.length;
  const last = closed ? n : n - 1;
  let best = Infinity;

  for (let i = 0; i < last; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % n];

    const ex = bx - ax;
    const ey = by - ay;
    const len2 = ex * ex + ey * ey;

    let t = len2 ? ((x - ax) * ex + (y - ay) * ey) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;

    const d = Math.hypot(x - (ax + ex * t), y - (ay + ey * t));
    if (d < best) best = d;
  }

  return best;
}

/** Distance from a point to the nearest stroke's surface. Negative inside it. */
export function strokeDistance(x, y) {
  let best = Infinity;

  for (const s of NOSE_STROKES) {
    const d = polylineDistance(x, y, s.points, s.closed) - s.radius;
    if (d < best) best = d;
  }

  return best;
}

/**
 * Distance from a point to the nearest CHAMBER wall, ignoring every other
 * stroke in the drawing.
 *
 * Unsigned, and separate from `strokeDistance` on purpose. That one answers
 * "how far is the nearest thing in the painting", which for a point beside the
 * ethmoid is an ethmoid cell — scenery, and not a wall a brick is measured
 * against. This one answers "how far is the boundary of a region congestion
 * may occupy", which is the only wall `rectOnTractWall` has any business
 * snapping bone to.
 */
export function tractWallDistance(x, y) {
  let best = Infinity;

  for (const poly of BRICK_TRACTS) {
    const d = polylineDistance(x, y, poly, true);
    if (d < best) best = d;
  }

  return best;
}

/**
 * Does this rectangle sit wholly inside a chamber, clear of the wall?
 *
 * THE LEVEL-DESIGN GUARD. Congestion has to sit inside the passages it is
 * supposed to be blocking; a brick floating in the open board beside the sinus
 * is the thing that would look broken.
 *
 * `margin` is how far clear of the wall the box must stay. Use `tractMargin()`
 * to compute it rather than passing a bare number: a cell is drawn nudged AND
 * tilted, and a caller that accounted only for the nudge was signing off on
 * cells that overlapped the wall.
 *
 * SAMPLED ON A LATTICE SIZED TO THE BOX, not a fixed 5x5. The cost is
 * irrelevant — this runs at level-validation time, never per frame — and the
 * old fixed grid put its samples 11.5px apart across a full-width cell, wide
 * enough for a pinch in a chamber to pass clean between two of them. A lattice
 * is right for a concave polygon in a way that a corners-only test is not: a
 * cell can have all four corners inside a chamber and still bulge out through
 * the wall between them.
 */
export function rectInsideTract(x0, y0, x1, y1, margin = 0) {
  const steps = Math.max(4, Math.ceil(Math.max(x1 - x0, y1 - y0) / 3));

  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * j) / steps;

      if (!insideTract(x, y)) return false;
      if (strokeDistance(x, y) < margin) return false;
    }
  }

  return true;
}

/**
 * The margin a cell of this drawn size must clear the wall by.
 *
 * Three terms, and the middle one is the one that was missing. `scatter` is the
 * translation a cell is nudged by. The tilt term is what a CORNER does on top
 * of that: the cell rotates about its own centre by up to BRICK.tilt, so the
 * point furthest from the centre — half the diagonal away — swings out by that
 * radius times sin(tilt). On a full 46x18 cell that is another 1.2px, which is
 * exactly the amount by which level 1's roof caps were once overlapping the
 * wall while passing validation. `clearance` is then the deliberate visible gap.
 */
export function tractMargin(w, h) {
  return BRICK.scatter + (Math.hypot(w, h) / 2) * Math.sin(BRICK.tilt) + BRICK.clearance;
}

/**
 * Does a chamber wall run through this rectangle, and through the middle of it?
 *
 * THE BONE RULE, and it is the mirror image of `rectInsideTract` rather than
 * an exception to it. Mucus is congestion, so it belongs in the air space and
 * has to sit wholly inside a chamber. Bone is the facial skeleton that air
 * space is hollowed out of, so it belongs ON the boundary — which is the one
 * place nothing ever put it. Bone used to be exempt from containment
 * altogether, and what that exemption bought was level 1's two cells sitting
 * 56px out in bare navy beside the nose and level 4's two floating in the
 * middle of the maxillary air, both passing validation while doing it.
 *
 * TWO CONDITIONS, because the crossing test alone is not enough.
 *
 *   The wall must cross the box. Sampled on a lattice sized to the box, the
 *   same way `rectInsideTract` samples and for the same reason: a pinch in a
 *   traced ring is narrow enough to pass between two samples of a fixed grid.
 *
 *   The crossing must happen near the middle of the cell rather than nicking
 *   a corner. A box whose corner clips the wall by a pixel is not on the wall,
 *   it is beside it, and it reads that way on screen. The tolerance is half
 *   the box's shorter side, so it scales with the grid rather than being a
 *   number someone picked — on a full 46x18 cell that is 9px, and every
 *   position it admits has the wall running through the cell's middle band.
 *
 * Measured against `tractWallDistance`, not `strokeDistance`: the ethmoid
 * cells are scenery, and bone hung on one of those is not bone on a sinus.
 */
export function rectOnTractWall(x0, y0, x1, y1) {
  const steps = Math.max(4, Math.ceil(Math.max(x1 - x0, y1 - y0) / 3));
  let inside = 0;
  let outside = 0;

  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * j) / steps;

      if (insideTract(x, y)) inside++;
      else outside++;
    }
  }

  if (!inside || !outside) return false;

  const tolerance = Math.min(x1 - x0, y1 - y0) / 2;
  return tractWallDistance((x0 + x1) / 2, (y0 + y1) / 2) <= tolerance;
}
