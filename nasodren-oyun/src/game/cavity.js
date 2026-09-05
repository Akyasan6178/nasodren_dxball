import { CAVITY, DESIGN } from './config.js';
import { MAXILLARY_RIGHT, SEPTUM, mirrorAnchors } from './anatomy.js';

/**
 * The sinus section: anchors in, strokes and regions out.
 *
 * Coordinates live in anatomy.js. This file does three things with them and
 * nothing else: runs them through a spline, flattens the result to polylines,
 * and publishes the two questions the rest of the game asks of the drawing.
 *
 * IT IS SCENERY. Nothing here touches the ball. The playfield is the plain
 * rectangle it always was — `GameScene._collideWalls` owns FIELD.left,
 * FIELD.right and FIELD.top, and nothing else turns a ball around. An earlier
 * pass made every stroke a solid capsule the ball rebounded off; it was
 * reverted because curved bumpers scatter a shot unpredictably, and a breakout
 * board the player cannot aim in is not a breakout board. So `radius` below is
 * a line width, not a collision reach.
 *
 * WHAT THE COORDINATES STILL DECIDE:
 *
 *   `NOSE_STROKES` — every line in the drawing, with the width to stroke it at
 *   and which side it belongs to. `sinus.js` reads nothing else.
 *
 *   `BRICK_TRACTS` — the two maxillary interiors, and the only regions
 *   congestion may occupy. Enforced at level-validation time by
 *   `rectInsideTract`: mucus belongs in the sinuses it is blocking, and a clump
 *   floating in the nasal cavity or out in the open board is what would look
 *   broken.
 *
 *   `GLOW_REGIONS` — what the inflammation gradient is filled into, per side.
 *   Currently the same two polygons as the tracts, kept separate because the
 *   two answer different questions and have already diverged once.
 *
 * Everything is in DESIGN space (640x480), like the rest of the gameplay maths.
 */

const CX = DESIGN.width / 2;

/**
 * A closed Catmull-Rom spline through every anchor, written out as cubics.
 *
 * Every structure in this section is a closed loop, which is why this is the
 * only spline left in the file — the open variant that used to sit beside it
 * went with the last of the open walls.
 *
 * WHY A SPLINE AND NOT HAND-PLACED CURVE HANDLES. The brief for this drawing is
 * "no straight robotic lines", and hand-authored beziers are exactly how you
 * get them: making a chain of curves smooth by hand means putting every control
 * point on the tangent line it shares with its neighbour, and the segments end
 * up so constrained they flatten out. A Catmull-Rom takes each anchor's tangent
 * from its two neighbours, so smoothness is structural rather than something to
 * verify, and every segment carries its own curvature change. Anchors can be
 * dragged anywhere and the outline stays organic, which is what makes anatomy.js
 * a file a designer can actually edit.
 *
 * Tangents wrap with a modulo because a closed shape has no ends. Clamping them
 * instead would leave a flat spot at whichever anchor happened to be authored
 * first — the kind of defect that reads as amateur without being locatable.
 *
 * `tension` 0.5 is the standard Catmull-Rom. Higher overshoots between anchors;
 * lower pulls toward straight lines.
 */
function closedSplineThrough(anchors, tension = 0.5) {
  const n = anchors.length;
  const at = (i) => anchors[(i + n) % n];

  const tangent = anchors.map((_, i) => [
    (at(i + 1)[0] - at(i - 1)[0]) * tension,
    (at(i + 1)[1] - at(i - 1)[1]) * tension,
  ]);
  const tan = (i) => tangent[(i + n) % n];

  const cmds = [['M', anchors[0][0], anchors[0][1]]];

  for (let i = 0; i < n; i++) {
    const [ax, ay] = at(i);
    const [bx, by] = at(i + 1);

    cmds.push([
      'C',
      ax + tan(i)[0] / 3, ay + tan(i)[1] / 3,
      bx - tan(i + 1)[0] / 3, by - tan(i + 1)[1] / 3,
      bx, by,
    ]);
  }

  return cmds;
}

/**
 * Flatten a path to a polyline.
 *
 * Segment count comes from the control-polygon length rather than a fixed
 * subdivision, so a long lazy curve and a short tight one both end up with
 * roughly `tolerance`-pixel segments. Uniform segment length matters for the
 * broadphase below: one 200px segment would be filed into thirty cells at once
 * and undo the whole point of bucketing.
 */
function flattenPath(cmds, tolerance) {
  const pts = [];
  let cx = 0;
  let cy = 0;

  for (const c of cmds) {
    if (c[0] === 'M' || c[0] === 'L') {
      cx = c[1];
      cy = c[2];
      pts.push([cx, cy]);
      continue;
    }

    if (c[0] === 'Q') {
      const [, qx, qy, ex, ey] = c;
      const approx = Math.hypot(qx - cx, qy - cy) + Math.hypot(ex - qx, ey - qy);
      const steps = Math.max(2, Math.ceil(approx / tolerance));

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        pts.push([
          u * u * cx + 2 * u * t * qx + t * t * ex,
          u * u * cy + 2 * u * t * qy + t * t * ey,
        ]);
      }

      cx = ex;
      cy = ey;
      continue;
    }

    const [, c1x, c1y, c2x, c2y, ex, ey] = c;
    const approx =
      Math.hypot(c1x - cx, c1y - cy) +
      Math.hypot(c2x - c1x, c2y - c1y) +
      Math.hypot(ex - c2x, ey - c2y);
    const steps = Math.max(2, Math.ceil(approx / tolerance));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      pts.push([
        u * u * u * cx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
        u * u * u * cy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey,
      ]);
    }

    cx = ex;
    cy = ey;
  }

  return pts;
}


/* ------------------------------------------------------- assembly ------- */

const F = CAVITY.flatten;

/**
 * Build one stroke entry.
 *
 * `side` is 0 for the left half of the section, 1 for the right, and null for
 * anything on the midline. `sinus.js` tints off this field directly rather than
 * from a table keyed by id — with a table, adding a structure and forgetting
 * its entry means a structure that is silently never drawn.
 */
const stroke = (id, path, radius, side) => ({
  id,
  path,
  points: flattenPath(path, F),
  radius,
  side,
});

const MAX_R_PATH = closedSplineThrough(MAXILLARY_RIGHT);
const MAX_L_PATH = closedSplineThrough(mirrorAnchors(MAXILLARY_RIGHT));

/**
 * Every line in the drawing. Three of them.
 *
 * Order is paint order: the two sinuses first, the septum last so the hairline
 * on the midline stays the crispest thing in the section.
 */
export const NOSE_STROKES = [
  stroke('maxillary-l', MAX_L_PATH, CAVITY.wallRadius, 0),
  stroke('maxillary-r', MAX_R_PATH, CAVITY.wallRadius, 1),
  stroke('septum', SEPTUM, CAVITY.septumRadius, null),
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
 * The two maxillary interiors: the only regions congestion may occupy.
 *
 * Index 0 is the left sinus and 1 the right, matching the order every per-side
 * array in this codebase uses.
 *
 * NOT THE NASAL CAVITY between them. It is 32px of dark with a hairline down
 * it, it is the lane the ball travels up, and mucus drawn there would bury the
 * septum that gives the section its scale. The maxillary sinuses are also where
 * fluid actually collects in sinusitis, so this is the rare case where the game
 * constraint and the anatomy want the same thing.
 */
export const BRICK_TRACTS = [byId('maxillary-l'), byId('maxillary-r')];

/**
 * What the inflammation gradient is filled into, per side.
 *
 * Still a list per side rather than a single polygon, even though each side is
 * currently one shape. That list is what let a side hold two air spaces at once
 * before the drawing was simplified; keeping it costs one array literal, and
 * collapsing it to a bare polygon would have to be undone by whoever adds the
 * next one. sinus.js gives every polygon in the list its own focus, which is a
 * correctness requirement rather than a nicety — see the note there.
 */
export const GLOW_REGIONS = [[byId('maxillary-l')], [byId('maxillary-r')]];

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
 * Is this point inside a maxillary sinus — the region congestion may occupy?
 *
 * Tested against the flattened outline the renderer strokes, so "inside a
 * tract" means inside the shape the player can actually see rather than a
 * second approximation of it.
 */
export function insideTract(x, y) {
  return BRICK_TRACTS.some((poly) => inPolygon(x, y, poly));
}

/**
 * Is this point inside any air space the inflammation gradient is filled into?
 *
 * Wider than `insideTract`, and the two are not interchangeable. This one
 * answers "would the glow cover this", which is the question the face's hollow
 * has to come back `false` for; the other answers "may a brick go here".
 */
export function insideGlow(x, y) {
  for (const side of GLOW_REGIONS) {
    for (const poly of side) if (inPolygon(x, y, poly)) return true;
  }

  return false;
}

/** Distance from a point to the nearest stroke's surface. Negative inside it. */
export function strokeDistance(x, y) {
  let best = Infinity;

  for (const s of NOSE_STROKES) {
    for (let i = 0; i < s.points.length - 1; i++) {
      const [ax, ay] = s.points[i];
      const [bx, by] = s.points[i + 1];

      const ex = bx - ax;
      const ey = by - ay;
      const len2 = ex * ex + ey * ey;

      let t = len2 ? ((x - ax) * ex + (y - ay) * ey) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;

      const d = Math.hypot(x - (ax + ex * t), y - (ay + ey * t)) - s.radius;
      if (d < best) best = d;
    }
  }

  return best;
}

/**
 * Does this rectangle sit wholly inside a tract, clear of the wireframe?
 *
 * THE LEVEL-DESIGN GUARD, AND IT IS THE INVERSE OF THE ONE THAT USED TO LIVE
 * HERE. While the nose was solid the question was "does this brick overlap a
 * stroke", because a brick fused into a wall fought its collision. The nose is
 * scenery now and nothing here touches the ball, so overlapping a stroke is
 * merely ugly — the real requirement flipped: congestion has to sit *inside*
 * the passages it is supposed to be blocking. A brick floating in the open
 * board beside the sinus is the thing that would look broken.
 *
 * `margin` is how far clear of the strokes the box must stay. Callers pass the
 * scatter amount, because a brick is drawn up to BRICK.scatter pixels off its
 * grid cell and a layout that only just fits will spill onto the wireframe once
 * the mess is applied.
 *
 * Sampled on a 5x5 lattice rather than tested analytically. The cost is
 * irrelevant — this runs at level-validation time, never per frame — and a
 * lattice is right for a concave polygon in a way that a corners-only test is
 * not: a cell can have all four corners inside a tract and still bulge across
 * the septum between them.
 */
export function rectInsideTract(x0, y0, x1, y1, margin = 0) {
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const x = x0 + ((x1 - x0) * i) / 4;
      const y = y0 + ((y1 - y0) * j) / 4;

      if (!insideTract(x, y)) return false;
      if (strokeDistance(x, y) < margin) return false;
    }
  }

  return true;
}
