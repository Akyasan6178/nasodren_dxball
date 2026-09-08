/**
 * Recover the sinus geometry from the background painting.
 *
 * WHY THIS EXISTS. The section the player sees is public/assets/background.png,
 * a 1920x1080 painting; `src/game/anatomy.js` holds the same cavities as
 * DESIGN-space rings so the brick-containment rule can be tested against them.
 * Those two have to agree, and for a while they did not — the hand-authored
 * curves that used to live in anatomy.js described a sinus twice the painted
 * one's area, so more than half of "inside a tract" was bare background. This
 * script is what closes that gap: run it after the art is re-exported and paste
 * the rings it prints into anatomy.js.
 *
 *   node scripts/trace-sinus.mjs            # print the rings
 *   node scripts/trace-sinus.mjs --report   # print measurements instead
 *
 * HOW IT SEPARATES AIR FROM WALL. The neon has three distinct pixel
 * populations and only the middle one is ambiguous: the wall's core is
 * whitened (R >= 70, because the glow itself is pure cyan with R near zero),
 * the air inside a chamber is saturated cyan (B ~250), and the outer halo
 * bleeding into the background is dimmer cyan. Thresholding on brightness
 * alone cannot split air from halo — the fill is a radial gradient and its
 * tips come out darker than the halo is bright. So the wall is found first, by
 * its whiteness, and flood fill does the rest: an enclosed region of non-wall
 * pixels IS an air space, whatever its brightness, and the halo is excluded
 * for free because it reaches the border of the frame.
 *
 * There is no image library in this project and there does not need to be —
 * a PNG is one zlib stream plus a filter byte per scanline, which is all
 * `readPNG` below undoes.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ART = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'background.png');

/** The painting's wall-colour test. See the note above. */
const WALL_R = 70;
const WALL_B = 180;

/**
 * How far the wall mask is grown before flood filling, in source pixels.
 *
 * The white core is antialiased and a pixel of it here and there falls under
 * the threshold, which on a closed ring is not a cosmetic problem: a
 * single-pixel puncture leaks the flood fill out of the chamber and the region
 * is lost entirely rather than coming out slightly wrong. Two pixels closes
 * every gap in this painting, and it errs in the safe direction — it costs
 * about 0.9 design px off each chamber, so the ring lands inside the true air
 * space rather than outside it.
 */
const DILATE = 2;

/** Ring simplification tolerance, in source pixels. About 0.9 design px. */
const EPSILON = 2;

/** A region has to be this big and this lit to count as an air space. */
const MIN_AREA = 300;
const LIT_B = 195;

/* ------------------------------------------------------------ png ------- */

/** Minimal PNG reader: 8-bit, non-interlaced. Enough for this one asset. */
function readPNG(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path} is not a PNG`);

  let p = 8;
  let w = 0;
  let h = 0;
  let depth = 0;
  let ctype = 0;
  let interlace = 0;
  const idat = [];

  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);

    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;

    p += 12 + len;
  }

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (depth !== 8 || interlace || !channels) {
    throw new Error(`unsupported PNG: depth ${depth}, colour type ${ctype}, interlace ${interlace}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);

  // Undo the per-scanline filter. The filter byte says how the row was
  // predicted from the pixel to the left (a), the one above (b) and the one
  // above-left (c).
  let src = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[src++];
    const cur = out.subarray(y * stride, (y + 1) * stride);
    raw.copy(cur, 0, src, src + stride);
    src += stride;
    const prior = y ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prior ? prior[i] : 0;
      const c = prior && i >= channels ? prior[i - channels] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }

  return { width: w, height: h, channels, pixels: out };
}

/* -------------------------------------------------------- regions ------- */

const img = readPNG(ART);
const { width: W, height: H, channels: CH, pixels: PX } = img;
const red = (i) => PX[i * CH];
const blue = (i) => PX[i * CH + 2];

let wall = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) if (red(i) >= WALL_R && blue(i) >= WALL_B) wall[i] = 1;

for (let d = 0; d < DILATE; d++) {
  const next = new Uint8Array(wall);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!wall[i] && (wall[i - 1] || wall[i + 1] || wall[i - W] || wall[i + W])) next[i] = 1;
    }
  }
  wall = next;
}

// Flood fill the non-wall pixels. A region that never reaches the border of
// the frame is enclosed by the neon, which is what an air space is.
const label = new Int32Array(W * H).fill(-1);
const regions = [];
const stack = new Int32Array(W * H);

for (let seed = 0; seed < W * H; seed++) {
  if (wall[seed] || label[seed] !== -1) continue;

  const id = regions.length;
  let sp = 0;
  stack[sp++] = seed;
  label[seed] = id;
  let n = 0;
  let lit = 0;
  let sx = 0;
  let sy = 0;
  let open = false;

  while (sp) {
    const i = stack[--sp];
    const x = i % W;
    const y = (i - x) / W;
    n++;
    sx += x;
    sy += y;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) open = true;
    if (blue(i) >= LIT_B) lit++;

    if (x > 0 && !wall[i - 1] && label[i - 1] === -1) { label[i - 1] = id; stack[sp++] = i - 1; }
    if (x < W - 1 && !wall[i + 1] && label[i + 1] === -1) { label[i + 1] = id; stack[sp++] = i + 1; }
    if (y > 0 && !wall[i - W] && label[i - W] === -1) { label[i - W] = id; stack[sp++] = i - W; }
    if (y < H - 1 && !wall[i + W] && label[i + W] === -1) { label[i + W] = id; stack[sp++] = i + W; }
  }

  regions.push({ id, n, lit, open, cx: sx / n, cy: sy / n });
}

const spaces = regions.filter((r) => !r.open && r.n >= MIN_AREA && r.lit / r.n > 0.5);

// Name them by where they sit. The four large ones are the chambers; the small
// ones stacked between them are the ethmoid air cells.
for (const r of spaces) {
  const side = r.cx < W / 2 ? 'LEFT' : 'RIGHT';
  if (r.n > 20000) r.name = `${r.cy < H / 2 ? 'FRONTAL' : 'MAXILLARY'}_${side}`;
  else r.name = `ETHMOID_${r.cy < H * 0.48 ? 'UPPER' : 'LOWER'}_${side}`;
}

/* -------------------------------------------------------- contour ------- */

/** Moore-neighbour boundary following, from the topmost-leftmost pixel. */
function contour(id) {
  let sx = -1;
  let sy = -1;
  for (let y = 0; y < H && sx < 0; y++) {
    for (let x = 0; x < W; x++) if (label[y * W + x] === id) { sx = x; sy = y; break; }
  }

  const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const inR = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === id;
  const pts = [[sx, sy]];
  let cx = sx;
  let cy = sy;
  let dir = 6;

  for (;;) {
    let moved = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + 5 + k) % 8;
      const nx = cx + N8[d][0];
      const ny = cy + N8[d][1];
      if (inR(nx, ny)) { cx = nx; cy = ny; dir = d; pts.push([cx, cy]); moved = true; break; }
    }
    if (!moved || (cx === sx && cy === sy)) break;
  }

  return pts;
}

/** Douglas-Peucker on an OPEN polyline. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;

  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const todo = [[0, pts.length - 1]];

  while (todo.length) {
    const [a, b] = todo.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let wi = -1;

    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > worst) { worst = d; wi = i; }
    }

    if (worst > eps) { keep[wi] = 1; todo.push([a, wi], [wi, b]); }
  }

  return pts.filter((_, i) => keep[i]);
}

/**
 * Simplify a closed ring.
 *
 * DO NOT HAND A RING STRAIGHT TO DOUGLAS-PEUCKER. Its two endpoints coincide,
 * so the anchor chord has zero length, every point measures zero against it,
 * and the entire ring collapses to a single point — silently, with no error
 * and no exception, which cost an afternoon the first time. Split it at the
 * point farthest from the start and simplify the two open halves instead.
 */
function simplifyRing(pts, eps) {
  const [ax, ay] = pts[0];
  let far = 0;
  let fd = -1;
  pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - ax, p[1] - ay);
    if (d > fd) { fd = d; far = i; }
  });

  return simplify(pts.slice(0, far + 1), eps).concat(simplify(pts.slice(far), eps).slice(1));
}

/* ---------------------------------------------------------- output ------ */

// The cover-fit GameScene._buildField applies, so the mapping is uniform and
// centred. Mirrors Math.max(DESIGN.width / w, DESIGN.height / h) there.
const SCALE = Math.max(640 / W, 480 / H);
const toDesign = ([x, y]) => [
  +((x - W / 2) * SCALE + 320).toFixed(1),
  +((y - H / 2) * SCALE + 240).toFixed(1),
];
const designY = (y) => (y - H / 2) * SCALE + 240;

const shoelace = (p) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
};

const ORDER = [
  'FRONTAL_RIGHT', 'MAXILLARY_RIGHT', 'ETHMOID_UPPER_RIGHT', 'ETHMOID_LOWER_RIGHT',
  'FRONTAL_LEFT', 'MAXILLARY_LEFT', 'ETHMOID_UPPER_LEFT', 'ETHMOID_LOWER_LEFT',
];

const rings = new Map();
for (const name of ORDER) {
  const r = spaces.find((s) => s.name === name);
  if (!r) continue;

  const ring = simplifyRing(contour(r.id), EPSILON).map(toDesign);
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx === lx && fy === ly) ring.pop();
  if (shoelace(ring) < 0) ring.reverse();
  rings.set(name, { ring, px: r.n });
}

// The septum is a stroke rather than a region: the vertical run of white core
// within ten pixels of the painting's midline.
let sTop = -1;
let sBot = -1;
for (let y = 0; y < H; y++) {
  let hit = false;
  for (let x = (W >> 1) - 10; x <= (W >> 1) + 10; x++) {
    const i = y * W + x;
    if (red(i) >= WALL_R && blue(i) >= WALL_B) hit = true;
  }
  if (hit) { if (sTop < 0) sTop = y; sBot = y; }
}

if (process.argv.includes('--report')) {
  console.log(`\n  ${ART}`);
  console.log(`  ${W}x${H}, ${CH} channels, design scale ${SCALE.toFixed(5)}\n`);
  console.log('  air space              source px     design area   bbox (design space)');

  for (const [name, { ring, px }] of rings) {
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    console.log(
      `  ${name.padEnd(21)} ${String(px).padStart(8)}   ${shoelace(ring).toFixed(0).padStart(8)} px²   ` +
        `x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}` +
        `  y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}`,
    );
  }

  // How far off true mirror symmetry the painting is. anatomy.js mirrors about
  // 320 regardless — see the note there — so this is the error that choice buys.
  const axes = [];
  for (const key of [...rings.keys()].filter((k) => k.endsWith('RIGHT'))) {
    const left = rings.get(key.replace('RIGHT', 'LEFT'));
    if (!left) continue;
    const mid = (r) => r.ring.reduce((a, q) => a + q[0], 0) / r.ring.length;
    axes.push((mid(rings.get(key)) + mid(left)) / 2);
  }
  console.log(`\n  painted symmetry axis  x ${(axes.reduce((a, b) => a + b, 0) / axes.length).toFixed(2)}   (anatomy.js mirrors about 320)`);
  console.log(`  septum ridge           y ${designY(sTop).toFixed(1)}..${designY(sBot).toFixed(1)}`);
} else {
  const fmt = (ring) => {
    const out = [];
    for (let i = 0; i < ring.length; i += 6) {
      out.push('  ' + ring.slice(i, i + 6).map(([x, y]) => `[${x}, ${y}]`).join(', ') + ',');
    }
    return out.join('\n');
  };

  console.log('// Paste into src/game/anatomy.js. Only the RIGHT rings are used there —');
  console.log('// the left side is mirrorPolygon() of them. See the note in that file.\n');
  for (const name of ['FRONTAL_RIGHT', 'MAXILLARY_RIGHT', 'ETHMOID_UPPER_RIGHT', 'ETHMOID_LOWER_RIGHT']) {
    if (rings.has(name)) console.log(`export const ${name} = [\n${fmt(rings.get(name).ring)}\n];\n`);
  }
  console.log(`export const SEPTUM = [\n  [320, ${designY(sTop).toFixed(1)}],\n  [320, ${designY(sBot).toFixed(1)}],\n];`);
}
