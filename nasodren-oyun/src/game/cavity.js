import { CAVITY, DESIGN, SINUS } from './config.js';
import { SINUS_RIGHT, SEPTUM, mirrorPath } from './anatomy.js';

/**
 * The sinus section: authored paths in, strokes and regions out.
 *
 * Coordinates live in anatomy.js, written there as real curve commands. This
 * file does two things with them and nothing else: mirrors the authored right
 * half to make the left, and flattens both to polylines — then publishes the
 * questions the rest of the game asks of the drawing. There is no spline here
 * any more; the three-zone blueprint is authored as curves because a spline
 * cannot hold a straight wall, a pinched waist and a bumpy wall at once. See
 * the note at the top of anatomy.js.
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
 *   `BRICK_TRACTS` — the two cavity interiors, and the only regions
 *   congestion may occupy. Enforced at level-validation time by
 *   `rectInsideTract`: mucus belongs in the sinuses it is blocking, and a clump
 *   floating in the nasal cavity or out in the open board is what would look
 *   broken.
 *
 *   `GLOW_REGIONS` and `GLOW_FOCI` — what the inflammation gradient is filled
 *   into, per side, and the point in each one it is brightest at.
 *   Currently the same two polygons as the tracts, kept separate because the
 *   two answer different questions and have already diverged once.
 *
 * Everything is in DESIGN space (640x480), like the rest of the gameplay maths.
 */

const CX = DESIGN.width / 2;

/**
 * Flatten a path to a polyline.
 *
 * Segment count comes from the control-polygon length rather than a fixed
 * subdivision, so a long lazy curve and a short tight one both end up with
 * roughly `tolerance`-pixel segments.
 *
 * STRAIGHT RUNS ARE SUBDIVIDED TOO, which looks like waste and is not. The
 * containment tests below are happy with a 240px chord — a segment is a segment
 * to a point-in-polygon test — but the glow is not: sinus.js derives each
 * cavity's hot spot from the CENTROID OF THESE POINTS, and the medial wall is
 * now one straight line down a shape whose every other edge is a curve. Emitted
 * as two points it contributes two samples against the lateral wall's sixty,
 * and the focus it drags outward is the focus the whole inflammation gradient
 * is built around. Uniform density is what keeps the centroid a centroid.
 */
function flattenPath(cmds, tolerance) {
  const pts = [];
  let cx = 0;
  let cy = 0;

  for (const c of cmds) {
    if (c[0] === 'M') {
      cx = c[1];
      cy = c[2];
      pts.push([cx, cy]);
      continue;
    }

    if (c[0] === 'L') {
      const [, ex, ey] = c;
      const steps = Math.max(1, Math.ceil(Math.hypot(ex - cx, ey - cy) / tolerance));

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        pts.push([cx + (ex - cx) * t, cy + (ey - cy) * t]);
      }

      cx = ex;
      cy = ey;
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
 *
 * `closed` says the authored path is a loop whose last point must land back on
 * its first. Nothing here enforces it — a gap in a closed outline is invisible
 * to every consumer, which is exactly why it is declared rather than derived:
 * `inPolygon` closes the ring implicitly and gives the right answer regardless,
 * so a broken loop shows up only as a hole in the neon that no test is looking
 * for. `check:nose` reads this flag and looks for it.
 */
const stroke = (id, path, radius, side, closed = true) => ({
  id,
  path,
  points: flattenPath(path, F),
  radius,
  side,
  closed,
});

const SINUS_LEFT = mirrorPath(SINUS_RIGHT);

/**
 * Every line in the drawing. Three of them.
 *
 * Two continuous cavity outlines and the septum between them. Each outline runs
 * all three zones — frontal, ethmoid, maxillary — as one closed path, so a side
 * is one Graphics tinted by one clearance value and the neon reads as one tube
 * from the brow to the floor.
 *
 * Order is paint order: the two cavities first, the septum last so the hairline
 * on the midline stays the crispest thing in the section.
 */
export const NOSE_STROKES = [
  stroke('sinus-l', SINUS_LEFT, CAVITY.wallRadius, 0),
  stroke('sinus-r', SINUS_RIGHT, CAVITY.wallRadius, 1),
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
 * The two cavity interiors: the only regions congestion may occupy.
 *
 * Index 0 is the left side and 1 the right, matching the order every per-side
 * array in this codebase uses.
 *
 * THE WHOLE PASSAGE, ALL THREE ZONES, and that is a containment rule rather
 * than a placement one. A brick is legal anywhere inside this outline, which in
 * principle includes the ethmoid channel and the frontal cavity — but the
 * channel is only ~35px of clear width, so nothing but a small clump fits there
 * once BRICK.scatter's margin is taken off, and the frontal roof clears the top
 * of the brick grid entirely. The geometry does the filtering; run
 * `npm run check:nose` for the map of what each shape may actually occupy.
 *
 * NOT THE NASAL CAVITY between the two. It is 32px of dark with a hairline down
 * it, it is the lane the ball travels up, and mucus drawn there would bury the
 * septum that gives the section its scale.
 */
export const BRICK_TRACTS = [byId('sinus-l'), byId('sinus-r')];

/**
 * What the inflammation gradient is filled into, per side.
 *
 * Still a list per side rather than a single polygon, even though each side is
 * currently one shape. That list is what let a side hold two air spaces at once
 * before the drawing was simplified; keeping it costs one array literal, and
 * collapsing it to a bare polygon would have to be undone by whoever splits the
 * frontal sinus back out into its own loop. sinus.js gives every polygon in the
 * list its own focus, which is a correctness requirement rather than a nicety —
 * see the note there.
 */
export const GLOW_REGIONS = [[byId('sinus-l')], [byId('sinus-r')]];

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
 * passage counts for as much as the wide chamber it opens into; on this
 * three-zone section that put the focus in the ethmoid channel — the ~35px
 * pinch between the frontal cavity and the wing — and a few pixels outside the
 * medial wall once the medial bias had pulled on it. The shoelace centroid
 * weights by area, so the maxillary flare wins by the margin its size deserves
 * and the light pools in the belly of the passage, over the bricks.
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
