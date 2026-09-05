import { CAVITY, DESIGN, FIELD } from './config.js';

/**
 * The nose: a nasal aperture drawn in the upper-middle of the board, and the
 * solid obstacles the ball bounces off.
 *
 * WHAT CHANGED, AND WHY THE MODEL CHANGED WITH IT
 *
 * An earlier pass had the nose *be* the playfield — walls running edge to edge
 * with the ball sealed inside them. That drew a box, not a nose. Pulling the
 * shape in so it floats with padding around it looks right, but it quietly
 * inverts the physics: once there is open board outside the nose, the ball can
 * be on *either* side of every line, so nothing here contains anything. The
 * rectangular FIELD is the boundary again, and the nose is a cluster of
 * two-sided solids sitting in the middle of it.
 *
 * So every wall is a CAPSULE CHAIN: a polyline plus a radius. That is not an
 * approximation of the drawing, it is the drawing. A polyline stroked with
 * round caps and round joins is exactly the set of points within `radius` of
 * the polyline, so if `sinus.js` strokes these same points at width
 * `2 * radius` — which is all it does — then the lit line and the collision
 * surface are the same object, and they cannot drift apart. There is no
 * separate collision geometry to keep in sync.
 *
 * It also solves the problem that killed the previous approach. A curved nose
 * wall is not convex, so the polygon test that handled the old septum would
 * have been wrong for it. Capsules do not care about curvature: the test is
 * always "closest point on a segment", which is correct for any shape a stroke
 * can make, including the hook of the ala where the path doubles back on
 * itself.
 *
 * Everything is in DESIGN space (640x480), like the rest of the gameplay maths.
 *
 * THE COST MODEL
 *
 * The curves are flattened once at construction and filed into one uniform
 * grid. A ball reads the single cell it occupies — a handful of segments — so
 * collision is effectively constant-time per substep no matter how finely the
 * walls are tessellated. Since the nose covers maybe a third of the board, most
 * substeps find an empty cell and cost one array lookup.
 */

const CX = DESIGN.width / 2;

/**
 * The right lateral wall, authored top-first. Mirrored for the left.
 *
 * Read as anatomy this is the piriform aperture: a short dorsum at the bridge,
 * a fast flare out to the ala, around the outside of the wing, and back inward
 * along the nostril sill — stopping short of the middle, because the gap
 * between this and the septum is the nostril.
 *
 * PROPORTIONS ARE THE POINT OF THIS SHAPE. The nose has to be recognisable at
 * a glance and it has to leave the board playable, and those pull against each
 * other. What holds:
 *
 *   Padding on every side. The widest point reaches x 493 and the stroke adds
 *   3.5, so the silhouette stops at 497 against a wall at 632 — 135px of clear
 *   board either flank, which the ball uses to travel around the outside. The
 *   crown sits at y 96 less the stroke, 48px below the ceiling.
 *
 *   The bottom stops at y 341. The paddle's top edge is at 435, so the whole
 *   lower quarter of the board is free for the bat to move and for droplets to
 *   fall through. Nothing anatomical goes anywhere near it.
 *
 *   The dorsum is short and flares early. A long narrow bridge is a better
 *   nose in profile, but this is a front view, and a narrow upper cavity is a
 *   cavity no brick fits in — see levels.js for how tight that got.
 *
 * Commands: ['M', x, y] move, ['L', x, y] line, ['Q', cx, cy, x, y] quadratic.
 * The left wall is a reflection, which is what guarantees the two nostrils play
 * identically — an asymmetric bounce here would read as a physics bug, not as
 * character.
 */
export const NOSE_ANCHORS = [
  [330, 92],    // bridge — the top of the dorsum, narrow
  [342, 144],   // upper dorsum: barely widens, so the wall sweeps INTO the bridge
  [378, 194],   // the flare opens
  [416, 228],
  [452, 258],   // the inflection — concave above, convex below
  [478, 288],
  [494, 314],   // widest point of the wing
  [484, 334],
  [446, 342],   // the base: flat, wide, rounded
  [398, 336],
  [360, 322],   // sill inner end, stopping short of the columella
];

/**
 * The septum, straight down the midline.
 *
 * Deliberately a plain vertical bar rather than the tapered wedge this used to
 * be. Thickness is uniform per wall — that is the price of the capsule model,
 * and it is worth paying, because a taper would need the stroke to change
 * width along its length and PixiJS strokes one width per call. Stroking it in
 * pieces to fake a taper is exactly the graphics-versus-physics drift the
 * capsule model exists to make impossible.
 *
 * It is also the more useful bumper. A uniform bar deflects predictably off its
 * faces and unpredictably off its rounded tip, which is the read the player
 * needs: the faces are a wall, the tip is a coin toss between nostrils.
 *
 * The tip stops at y 290, well above the sill at 314, and the 40px of daylight
 * between the two is the nostril the ball threads to get inside. Lengthen it
 * and the passages seal.
 */
export const SEPTUM_WALL = [
  ['M', 320, 108],
  ['L', 320, 288],
];

/**
 * Turn anchor points into a chain of cubic Beziers through every one of them.
 *
 * This is a Catmull-Rom spline written out as Beziers, and it is why the wall
 * is authored as bare points rather than as curves with control handles.
 *
 * The shape needs an inflection — concave where it sweeps into the bridge,
 * convex around the ala — and that is exactly what a chain of quadratics
 * cannot hold. A quadratic has no inflection of its own, so the curvature can
 * only change at a join, and making those joins smooth by hand means placing
 * every control point on the tangent line shared with its neighbour. Get one
 * wrong and the outline kinks; get them all right and the segments are so
 * constrained they straighten out, which is precisely how the previous pass
 * ended up reading as a tent.
 *
 * A cubic spline removes the choice. Each anchor's tangent is taken from its
 * two neighbours, so smoothness is structural rather than something to verify,
 * and each segment carries its own curvature change. Anchors can be dragged
 * anywhere and the curve stays organic — which makes this the shape a designer
 * can actually tune.
 *
 * `tension` 0.5 is the standard Catmull-Rom. Higher overshoots between
 * anchors; lower pulls toward straight lines.
 */
function splineThrough(anchors, tension = 0.5) {
  const n = anchors.length;
  const tangent = anchors.map((_, i) => {
    const prev = anchors[Math.max(0, i - 1)];
    const next = anchors[Math.min(n - 1, i + 1)];
    return [(next[0] - prev[0]) * tension, (next[1] - prev[1]) * tension];
  });

  const cmds = [['M', anchors[0][0], anchors[0][1]]];

  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = anchors[i];
    const [bx, by] = anchors[i + 1];

    cmds.push([
      'C',
      ax + tangent[i][0] / 3, ay + tangent[i][1] / 3,
      bx - tangent[i + 1][0] / 3, by - tangent[i + 1][1] / 3,
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

/**
 * Reflect a command list about the midline.
 *
 * The mirrored *path* is needed as well as the mirrored points, because the
 * renderer draws the real curve rather than the polyline — see NOSE_STROKES.
 * Reflecting the commands rather than re-authoring them is what guarantees the
 * two sides are bit-identical mirrors, control points included.
 */
const mirrorPath = (cmds) =>
  cmds.map((c) => {
    const out = [c[0]];
    for (let i = 1; i < c.length; i += 2) out.push(2 * CX - c[i], c[i + 1]);
    return out;
  });

/** The authored curve for the right wall, and its exact reflection. */
export const NOSE_WALL = splineThrough(NOSE_ANCHORS);
const WALL_LEFT_PATH = mirrorPath(NOSE_WALL);

/** The midline. Bricks left of it belong to the left cavity, right of it the right. */
export const SEPTUM_X = CX;

/**
 * Every stroke in the drawing: the curve it is drawn from, the polyline the
 * ball is tested against, and the radius that is both its collision reach and
 * half its drawn width.
 *
 * TWO REPRESENTATIONS OF ONE CURVE, AND WHAT THAT COSTS. `sinus.js` strokes
 * `path` with real quadratics, so the visible line is the mathematically exact
 * curve with no facets anywhere. Collision runs on `points`, the same curve
 * flattened to chords, because a closed-form circle-versus-bezier test is a
 * quartic root solve and this has to run several times per ball per frame.
 *
 * So the drawing and the physics are no longer the *same* object, the way they
 * were when both were the polyline — they are the same curve to within the
 * flattening error, and that error is a number this codebase measures rather
 * than assumes. At CAVITY.flatten the chords sit a small fraction of a pixel
 * inside the true curve, which is two orders of magnitude under the ball's 5px
 * radius: the ball bounces where the light is. Lowering `flatten` tightens it
 * further at no collision cost, since the broadphase keeps lookups constant
 * regardless of segment count.
 *
 * Nothing else draws, and nothing else collides. Adding a decorative line means
 * adding a wall the ball bounces off, and that is intentional: the drawing is
 * not allowed to make a claim the physics does not honour.
 */
export const NOSE_STROKES = [
  {
    id: 'wall-left',
    path: WALL_LEFT_PATH,
    points: flattenPath(WALL_LEFT_PATH, CAVITY.flatten),
    radius: CAVITY.wallRadius,
  },
  {
    id: 'wall-right',
    path: NOSE_WALL,
    points: flattenPath(NOSE_WALL, CAVITY.flatten),
    radius: CAVITY.wallRadius,
  },
  {
    id: 'septum',
    path: SEPTUM_WALL,
    points: flattenPath(SEPTUM_WALL, CAVITY.flatten),
    radius: CAVITY.septumRadius,
  },
];

const WALL_LEFT = NOSE_STROKES[0].points;
const WALL_RIGHT = NOSE_STROKES[1].points;
const SEPTUM = NOSE_STROKES[2].points;

/**
 * The two nasal cavity interiors, as closed polygons, for the inflammation
 * glow to be drawn into.
 *
 * Each runs down its own lateral wall to the sill, crosses the nostril to the
 * bottom of the septum, and comes back up the midline. They are traced along
 * the wall *axes*, not their inner faces, so the glow runs under the strokes
 * and there is no seam where the light stops short of the line that is
 * supposed to be containing it. The strokes are drawn on top, so the overlap
 * never shows.
 *
 * Both share the septum axis at x = CX, so they meet edge to edge and always
 * carry the same tint — there is nothing for a join to reveal.
 */
export const CAVITIES = [
  [...WALL_LEFT, [CX, SEPTUM[SEPTUM.length - 1][1]], [CX, SEPTUM[0][1]]],
  [...WALL_RIGHT, [CX, SEPTUM[SEPTUM.length - 1][1]], [CX, SEPTUM[0][1]]],
];

/**
 * Ball-vs-nose collision over the flattened strokes.
 *
 * One instance per scene, built once. It holds no per-frame state, so it is
 * cheap to keep alive for the life of a level. The rectangular field bounds are
 * not its business — `GameScene._collideWalls` still owns those.
 */
export class NoseObstacles {
  constructor(strokes = NOSE_STROKES) {
    this.strokes = strokes;
    this.segments = [];

    for (const stroke of strokes) {
      const { points, radius, id } = stroke;

      for (let i = 0; i < points.length - 1; i++) {
        const [ax, ay] = points[i];
        const [bx, by] = points[i + 1];

        const ex = bx - ax;
        const ey = by - ay;
        const len = Math.hypot(ex, ey);
        if (len < 1e-6) continue;

        this.segments.push({
          id,
          ax, ay, ex, ey, radius,
          len2: ex * ex + ey * ey,
          /**
           * A perpendicular, used only as the degenerate fallback when a ball
           * centre lands exactly on the axis. Which side it points is
           * arbitrary; that it is *stable* is the property that matters, so a
           * ball in that state cannot be flipped back and forth.
           */
          px: -ey / len,
          py: ex / len,
          minX: Math.min(ax, bx),
          maxX: Math.max(ax, bx),
          minY: Math.min(ay, by),
          maxY: Math.max(ay, by),
        });
      }
    }

    // --- broadphase ----------------------------------------------------
    //
    // A uniform 2D grid, filed with each segment's padded bounding box.
    //
    // Horizontal bands alone are not enough, and the failure is specific to
    // shapes like this one: the sill under each wing is 90px of near-horizontal
    // stroke inside an 8px slice of y, so a y-only index files a dozen segments
    // into one bucket and a ball anywhere along the bottom of the nose tests
    // all of them. Splitting x as well puts every bucket at a handful of
    // segments regardless of which way the stroke happens to run.
    this.cellW = CAVITY.cellW;
    this.cellH = CAVITY.cellH;
    this.originX = -CAVITY.cellW;
    this.originY = FIELD.top - 32;
    this.cols = Math.ceil((DESIGN.width + CAVITY.cellW * 2 - this.originX) / this.cellW);
    this.rows = Math.ceil((DESIGN.height + 32 - this.originY) / this.cellH);

    this.cells = Array.from({ length: this.cols * this.rows }, () => []);

    for (const s of this.segments) {
      // The pad is what makes a single lookup sufficient: a ball is filed
      // against every segment whose reach comes within one substep of its
      // cell, so its rim cannot touch a stroke that was not in the bucket its
      // centre landed in. It scales with the stroke's own radius, because a
      // fat stroke reaches further than a thin one.
      const pad = s.radius + CAVITY.cellPad;

      const c0 = this._col(s.minX - pad);
      const c1 = this._col(s.maxX + pad);
      const r0 = this._row(s.minY - pad);
      const r1 = this._row(s.maxY + pad);

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(s);
      }
    }
  }

  _col(x) {
    const i = Math.floor((x - this.originX) / this.cellW);
    return i < 0 ? 0 : i >= this.cols ? this.cols - 1 : i;
  }

  _row(y) {
    const i = Math.floor((y - this.originY) / this.cellH);
    return i < 0 ? 0 : i >= this.rows ? this.rows - 1 : i;
  }

  /**
   * Test a circle against every stroke.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} r
   * @returns {{nx: number, ny: number, depth: number, id: string} | null}
   *   The normal to bounce off, how far to push out along it, and which stroke
   *   was struck — or null if the circle is clear.
   *
   * Contacts are accumulated and the normals averaged, weighted by penetration
   * so the segment the ball is actually buried in dominates. Adjacent capsules
   * overlap at every joint of a flattened curve, and picking one joint's normal
   * in isolation makes the ball tick left and right as it slides along a wall.
   * Averaging gives the smooth tangent the curve is meant to have, and pushing
   * out by the deepest single penetration clears all of them at once.
   *
   * The ball cannot pass through a wall. Contact begins at `r + radius` from
   * the axis — 8.5px on a lateral wall, 11 on the septum — and a substep is
   * 4px, so it is resolved several steps before the centre could reach the
   * axis and come out the far side.
   */
  collide(x, y, r) {
    const near = this._near(x, y);
    if (!near.length) return null;

    let nx = 0;
    let ny = 0;
    let depth = 0;
    let hits = 0;
    let id = null;

    for (const s of near) {
      // Closest point on the axis, as a parameter along it.
      let t = ((x - s.ax) * s.ex + (y - s.ay) * s.ey) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;

      const dx = x - (s.ax + s.ex * t);
      const dy = y - (s.ay + s.ey * t);

      const reach = r + s.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= reach * reach) continue;

      const d = Math.sqrt(d2);
      const push = reach - d;

      // Dead on the axis: no direction to push away from. Unreachable at 4px
      // substeps (see above), so this only guards against a ball placed here
      // rather than one that arrived here.
      const ux = d > 1e-6 ? dx / d : s.px;
      const uy = d > 1e-6 ? dy / d : s.py;

      nx += ux * push;
      ny += uy * push;
      if (push > depth) {
        depth = push;
        id = s.id;
      }
      hits++;
    }

    if (!hits) return null;

    const len = Math.hypot(nx, ny);
    if (len < 1e-6) return null;

    return { nx: nx / len, ny: ny / len, depth, id };
  }

  /** Segments that could touch a circle centred here. */
  _near(x, y) {
    return this.cells[this._row(y) * this.cols + this._col(x)];
  }

  /**
   * Does any stroke overlap this rectangle?
   *
   * @returns {string | null} The id of the first stroke that does.
   *
   * This is the level-design guard, and it is the check that matters now that
   * the nose is an obstacle rather than a boundary: a brick overlapping a
   * stroke is a brick fused into a solid wall. The ball can still reach most of
   * it, so it is not always a soft-lock — but it looks broken, the bounce off
   * that face is unreadable, and the brick's own collision fights the wall's.
   *
   * Each segment is walked at one-pixel steps and tested point-against-box.
   * Sub-pixel exactness is not the goal — catching a designer's mistake is, and
   * segments are only 7px long, so this is far finer than the error it exists
   * to find. It runs in `validateLevels`, never per frame.
   */
  hitsRect(x0, y0, x1, y1) {
    for (const s of this.segments) {
      const steps = Math.max(1, Math.ceil(Math.hypot(s.ex, s.ey)));

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = s.ax + s.ex * t;
        const py = s.ay + s.ey * t;

        const dx = Math.max(x0 - px, 0, px - x1);
        const dy = Math.max(y0 - py, 0, py - y1);

        if (dx * dx + dy * dy < s.radius * s.radius) return s.id;
      }
    }

    return null;
  }
}
