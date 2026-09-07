/**
 * Geometry guard and layout tool for the sinus.
 *
 * The wireframe is authored as curve commands in anatomy.js and everything else
 * is derived from them: the drawn strokes, the two cavity polygons the glow fills, and —
 * since the pivot — the regions a brick is allowed to occupy. Nothing here
 * touches the ball any more; the playfield is the plain FIELD rectangle. What
 * moving a control point CAN still do is push congestion out of the passage it is
 * meant to be blocking, or leave a layout with nowhere legal to put a clump,
 * and neither is visible in a screenshot.
 *
 * Run with `npm run check:nose`. Prints a plan view, a per-shape map of which
 * grid cells each cavity level may use, and exits non-zero on any violation.
 */
import { BRICK, GRID, BRICK_W, BRICK_H, FIELD, PADDLE } from '../src/game/config.js';
import { LEVELS, validateLevels } from '../src/game/levels.js';
import {
  NOSE_STROKES,
  MIDLINE_IDS,
  SEPTUM_X,
  GLOW_REGIONS,
  GLOW_FOCI,
  rectInsideTract,
  insideGlow,
} from '../src/game/cavity.js';

const problems = [];
const notes = [];
const check = (ok, msg) => {
  (ok ? notes : problems).push((ok ? 'ok   ' : 'FAIL ') + msg);
  return ok;
};

/* --- 1. every layout must be legal ------------------------------------- */
const layoutProblems = validateLevels(GRID.cols);
for (const p of layoutProblems) problems.push('FAIL ' + p);
check(layoutProblems.length === 0, 'every cavity level keeps its congestion inside a tract');

/* --- 2. the two cavities must start balanced ---------------------------- */
//
// Each passage is coloured by its OWN clearance ratio, so a level that starts
// uneven shows one sinus permanently angrier than the other through no fault
// of the player. This is the one layout property that is about fairness rather
// than about looks.
const SHAPE_FOR = { '<': 'halfLeft', '>': 'halfRight', o: 'small' };
for (const [i, level] of LEVELS.entries()) {
  if (!level.cavity || level.boss) continue;
  let left = 0;
  let right = 0;
  level.rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.' || ch === 'B') return;
      const box = BRICK.shapes[SHAPE_FOR[ch] ?? 'full'];
      const w = BRICK_W * box.w;
      const x0 = GRID.x + c * GRID.cellW + GRID.gap / 2 + (BRICK_W - w) * box.align;
      if (x0 + w / 2 < SEPTUM_X) left++;
      else right++;
    });
  });
  check(left === right, `level ${i + 1} "${level.name}" starts balanced (${left} left, ${right} right)`);
}

/* --- 4. every closed outline must actually close ------------------------ */
//
// THE ONE DEFECT IN THIS DRAWING THAT NOTHING ELSE CAN SEE. anatomy.js is hand-
// authored curve commands now, and a loop whose closing run stops short of the
// point it opened on is invisible to every consumer: the crossing test closes
// the ring implicitly and keeps answering correctly, the glow fills the shape it
// meant to, and the only symptom is a length of missing neon on screen. It has
// already happened once, when the frontal roof was moved and the medial wall
// underneath it was left ending at the old height.
//
// A pixel of slack, because these are flattened curve endpoints rather than the
// authored numbers, and an exact-equality test would be a trap for the next
// person who closes a loop with a curve instead of a line.
for (const st of NOSE_STROKES) {
  if (!st.closed) continue;
  const [fx, fy] = st.points[0];
  const [lx, ly] = st.points[st.points.length - 1];
  const gap = Math.hypot(lx - fx, ly - fy);
  check(gap < 1, `'${st.id}' closes (${gap.toFixed(2)}px between its ends)`);
}

/* --- 4b. every glow focus must sit inside the shape it lights ---------- */
//
// sinus.js builds each cavity's gradient by scaling its polygon TOWARD this
// point. Inside, that is a falloff. Outside, it is not a dimmer glow — every
// layer marches out of the cavity and the passage goes dark, which is a whole
// half of the board lit wrongly with nothing in the drawing to explain it.
// It is one dot product away from being unnoticeable in a screenshot, and the
// three-zone section walked straight into it: a pinched waist between two
// bulges puts the naive centroid in the pinch.
for (const [i, polys] of GLOW_REGIONS.entries()) {
  polys.forEach((_, j) => {
    const f = GLOW_FOCI[i][j];
    check(
      insideGlow(f.x, f.y),
      `side ${i} region ${j} lights from inside itself (focus ${f.x.toFixed(0)}, ${f.y.toFixed(0)})`,
    );
  });
}

/* --- 5. the section must fit the board --------------------------------- */
//
// The sinuses are easy to grow past the edges of the playfield without
// noticing, because the cheekbone shoulders are the widest thing in the drawing
// and the eye tracks the play instead. Two bounds matter: the field
// itself, and the paddle's band — anatomy drawn down there would sit under the
// bat and read as a rendering fault rather than as scenery.
let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;
for (const s of NOSE_STROKES) {
  for (const [x, y] of s.points) {
    minX = Math.min(minX, x - s.radius);
    maxX = Math.max(maxX, x + s.radius);
    minY = Math.min(minY, y - s.radius);
    maxY = Math.max(maxY, y + s.radius);
  }
}
check(
  minX > FIELD.left && maxX < FIELD.right && minY > FIELD.top,
  `the section fits the playfield (x ${minX.toFixed(0)}..${maxX.toFixed(0)}, y from ${minY.toFixed(0)})`,
);
check(
  maxY < PADDLE.y - PADDLE.height * 2,
  `the section clears the paddle band (lowest ${maxY.toFixed(0)}, paddle at ${PADDLE.y})`,
);

/* --- 6. the tracts must have room for a layout at all ------------------- */
//
// Doubles as the authoring aid. Uses exactly the geometry validateLevels does,
// so what this prints as usable is what the validator will accept.
const cellBox = (c, r, shape) => {
  const box = BRICK.shapes[shape];
  const w = BRICK_W * box.w;
  const h = BRICK_H * box.h;
  const bx = GRID.x + c * GRID.cellW + GRID.gap / 2 + (BRICK_W - w) * box.align;
  const by = GRID.y + r * GRID.cellH + GRID.gap / 2 + (BRICK_H - h) * 0.5;
  return [bx, by, bx + w, by + h];
};
const usable = (c, r, shape) => rectInsideTract(...cellBox(c, r, shape), BRICK.scatter);

let capacity = 0;
const map = [];
for (let r = 0; r < GRID.rows; r++) {
  let line = String(r).padStart(2) + '  ';
  for (let c = 0; c < GRID.cols; c++) {
    const full = usable(c, r, 'full');
    const hl = usable(c, r, 'halfLeft');
    const hr = usable(c, r, 'halfRight');
    const sm = usable(c, r, 'small');
    if (full || hl || hr || sm) capacity++;
    line += full ? ' # ' : hl && hr ? ' = ' : hl ? ' < ' : hr ? ' > ' : sm ? ' o ' : ' . ';
  }
  map.push(line);
}
check(capacity >= 20, `the tracts can hold a layout (${capacity} cells usable by some shape)`);

/* --- plan view ---------------------------------------------------------- */
const W = 92;
const H = 44;
// Framed on the geometry rather than on fixed numbers. The window used to be
// four literals fitted to whatever the drawing was at the time, which is a trap:
// redraw the section wider and the tool silently crops the new cheekbones off
// the very picture you are redrawing them in. A little padding so the outermost
// stroke lands inside the frame instead of on its edge.
const PX0 = minX - 6;
const PX1 = maxX + 6;
const PY0 = minY - 6;
const PY1 = maxY + 6;
const grid = Array.from({ length: H }, () => Array(W).fill(' '));
const plot = (x, y, ch) => {
  const c = Math.round(((x - PX0) / (PX1 - PX0)) * (W - 1));
  const r = Math.round(((y - PY0) / (PY1 - PY0)) * (H - 1));
  if (c >= 0 && c < W && r >= 0 && r < H) grid[r][c] = ch;
};
LEVELS[0].rows.forEach((row, r) => {
  [...row].forEach((ch, c) => {
    if (ch === '.') return;
    const [bx, by, bx1, by1] = cellBox(c, r, SHAPE_FOR[ch] ?? 'full');
    for (let x = bx; x <= bx1; x += 2) for (let y = by; y <= by1; y += 2) plot(x, y, ':');
  });
});
// Walked as SEGMENTS, not vertices, which matters at this resolution: a plan
// view is 92 columns across 480 design pixels, so consecutive flattened points
// land in the same cell and plotting vertices alone draws a dotted line for a
// solid wall.
for (const s of NOSE_STROKES) {
  const ch = MIDLINE_IDS.has(s.id) ? '#' : '@';
  for (let i = 0; i < s.points.length - 1; i++) {
    const [ax, ay] = s.points[i];
    const [bx, by] = s.points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let t = 0; t <= steps; t++) plot(ax + ((bx - ax) * t) / steps, ay + ((by - ay) * t) / steps, ch);
  }
}

console.log('\n  @ cavity wall   # septum   : congestion (level 1)\n');
console.log(grid.map((r) => '  ' + r.join('').replace(/\s+$/, '')).join('\n'));

console.log('\n  Usable cells per shape — # full, < left half, > right half, = either half, o small only\n');
console.log('     ' + Array.from({ length: GRID.cols }, (_, c) => String(c).padStart(3)).join(''));
console.log(map.join('\n'));

console.log('\n' + notes.map((n) => '  ' + n).join('\n'));
if (problems.length) {
  console.log('\n' + problems.map((p) => '  ' + p).join('\n'));
  console.log(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log('\nall geometry checks passed');
