import { Container, Graphics } from 'pixi.js';
import { DESIGN, FIELD, SINUS } from './config.js';
import { GLOW_FOCI, GLOW_REGIONS, NOSE_STROKES } from './cavity.js';

/**
 * The paranasal sinuses, drawn as a glowing neon coronal section.
 *
 * THE ONE RULE THIS FILE FOLLOWS. It does not own a single coordinate, and it
 * does not choose a single line width. `cavity.js` exports `NOSE_STROKES` —
 * points plus a radius per stroke — and this draws each one at exactly
 * `radius * 2`. Change a coordinate or a radius and the drawing moves together
 * with the region a layout is allowed to occupy, because there is only one of
 * each.
 *
 * NONE OF IT IS SOLID. The ball bounces off the FIELD rectangle and nothing
 * else — these strokes are scenery, and the radii they are drawn at are line
 * widths rather than collision reaches. That is why the halo can be drawn wider
 * than the body without any care about what it implies: there is no bounce here
 * for a player to mistake it for.
 *
 * ASYMMETRIC CLEARANCE. The two halves of the section are separate Graphics
 * carrying separate colours, because a Graphics has one tint and the two sinuses
 * drain independently: clear the right and it runs cool while the left is still
 * burning. Each side owns its glow, its strokes and its own eased clearance. The
 * midline structures, belonging to both, take the mean.
 *
 * Everything is static after construction:
 *
 *   The **strokes** are stroked once in the constructor and never touched
 *   again. Four tiers — a wide faint bloom, a tight halo, the solid body, and a
 *   near-white filament threaded down the middle of it — which is far cheaper
 *   than a blur filter and does not scale with the size of the drawing. The
 *   filament is the tier that makes these read as lit glass rather than as
 *   thick coloured lines; see SINUS.line.filamentInset for why it is inset by a
 *   fraction of each stroke's own radius rather than by a constant.
 *
 *   The **inflammation** is one stack of scaled copies of each cavity polygon,
 *   filled additively and tessellated once. Per frame the only writes are
 *   `tint`, `alpha` and a transform, so recolouring a passage uploads nothing
 *   to the GPU.
 *
 * Everything is authored in the 640x480 design space, so it lines up with the
 * brick grid and the collision maths without knowing anything about the
 * viewport.
 */

const CX = DESIGN.width / 2;

/**
 * Replay an authored path into a Graphics as real curve commands.
 *
 * The one place the renderer sees the source geometry rather than the
 * flattened approximation. A 'C' command becomes a genuine `bezierCurveTo` and
 * a 'Q' a `quadraticCurveTo`, so PixiJS tessellates for the screen instead of
 * inheriting the chord length collision picked.
 */
function tracePath(g, cmds) {
  for (const c of cmds) {
    if (c[0] === 'M') g.moveTo(c[1], c[2]);
    else if (c[0] === 'L') g.lineTo(c[1], c[2]);
    else if (c[0] === 'Q') g.quadraticCurveTo(c[1], c[2], c[3], c[4]);
    else g.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
  }
}

/**
 * Concentric copies of a polygon, stacked into a falloff centred on `focus`.
 *
 * Many thin layers rather than a few thick ones: at a dozen steps the
 * individual outlines are visible as contour banding, and at thirty the
 * accumulation is smooth for the same peak opacity. It is tessellated once, so
 * the extra layers cost nothing per frame beyond the fill they blend.
 */
function gradientStack(g, points, focus, { steps, step, minScale }) {
  for (let i = steps; i > 0; i--) {
    const t = minScale + (1 - minScale) * (i / steps);

    const flat = new Array(points.length * 2);
    for (let p = 0; p < points.length; p++) {
      flat[p * 2] = focus.x + (points[p][0] - focus.x) * t;
      flat[p * 2 + 1] = focus.y + (points[p][1] - focus.y) * t;
    }

    g.poly(flat).fill({ color: 0xffffff, alpha: step });
  }
}

/**
 * Linear blend between two packed RGB colours.
 *
 * Exported for the septum face, which lifts the shared hue toward white by its
 * own factor exactly as the stroke cores do. Re-implementing this next to the
 * face would be four lines of trivial arithmetic and one more place for the two
 * halves of the same drawing to drift apart.
 */
export function lerpColor(a, b, k) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;

  const r = ar + (((b >> 16) & 0xff) - ar) * k;
  const g = ag + (((b >> 8) & 0xff) - ag) * k;
  const bl = ab + ((b & 0xff) - ab) * k;

  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/**
 * Sample the inflammation ramp.
 *
 * Piecewise rather than a single red-to-cyan blend. Interpolating #FF2200 and
 * #00FFFF directly in RGB passes through #809180 at the midpoint — a grey-green
 * at 12% saturation — which reads as the light failing rather than as tissue
 * healing. The stops in SINUS.ramp route the hue the long way round the wheel,
 * through magenta and violet, so it never leaves the saturated shell.
 */
function sampleRamp(t) {
  const stops = SINUS.ramp;

  for (let i = 1; i < stops.length; i++) {
    if (t > stops[i].at) continue;

    const lo = stops[i - 1];
    const hi = stops[i];
    const span = hi.at - lo.at;

    return lerpColor(lo.color, hi.color, span > 0 ? (t - lo.at) / span : 0);
  }

  return stops[stops.length - 1].color;
}

export class SinusBackdrop extends Container {
  /**
   * @param {boolean} reduceMotion Suppress the throb for motion-sensitive players.
   * @param {boolean} outline Stroke the nose.
   *
   * `outline` follows the level's `cavity` flag. The glow is drawn either way
   * — it is the inflammation readout, and every level has one — but the neon
   * strokes are only drawn where the layout was authored to sit inside them.
   * On a level whose bricks run the full width of the board, the wireframe
   * would be congestion-shaped scenery with congestion all over the top of it.
   */
  constructor(reduceMotion = false, outline = true) {
    super();

    this.eventMode = 'none';
    this.interactiveChildren = false;

    this.reduceMotion = reduceMotion;
    this._t = 0;

    /**
     * The two cavities, each owning its own light, its own strokes and its own
     * eased clearance.
     *
     * They are separate Graphics because they carry separate colours, and a
     * Graphics has one tint. That is the whole reason for the split: a player
     * who has cleared the right maxillary sinus and not the left should see that
     * side run cool while the other still burns, and no amount of shared state
     * can express that.
     *
     * `progress` is per side and eased per side, so a cluster falling on the
     * left cools the left alone at its own pace. `target` is what the scene
     * hands in each frame.
     */
    this.sides = GLOW_REGIONS.map((polys, side) => {
      /**
       * EACH POLYGON GETS ITS OWN FOCUS, and that is a correctness rule rather
       * than a refinement. `gradientStack` builds its falloff by scaling the
       * polygon about the focus, so a focus outside the polygon does not dim
       * that region — it marches every layer out of it. A side holds one air
       * space today and held two before the frontal sinus was folded into the
       * same outline; with one shared focus the second one emptied itself
       * across the board instead of lighting. A focus has to be inside the
       * shape it lights, which is why cavity.js derives these next to the
       * coordinates and `check:nose` asserts it — see the note there.
       */
      const glow = new Graphics();
      glow.blendMode = 'add';

      const foci = GLOW_FOCI[side];

      polys.forEach((points, j) => gradientStack(glow, points, foci[j], SINUS.glow));

      return {
        // The throb scales the whole side about one point, so it takes the
        // first region's focus. With one region per side that is the whole
        // passage's own centre of area, which lands in the maxillary flare —
        // by far the largest volume, and the one the pulse should look
        // centred on.
        focus: foci[0],
        glow,
        halo: new Graphics(),
        core: new Graphics(),
        filament: new Graphics(),
        progress: 0,
        target: 0,
      };
    });

    /**
     * The midline structures take the mean of the two sides.
     *
     * The septum belongs to both halves of the section, so it cannot carry
     * one side's colour. Splitting them
     * down the middle into a left face and a right face was the alternative,
     * and it is worse in every way that matters: the strokes have round caps,
     * so halving one leaves two half-capsules that do not tile back into the
     * shape, and the seam falls exactly on the axis of symmetry where any
     * mismatch is most visible. The mean is honest, and when both sides agree
     * it looks precisely as it would have anyway.
     */
    this.septum = { halo: new Graphics(), core: new Graphics(), filament: new Graphics() };

    // Layered by tier rather than by side: every glow, then every halo, then
    // every core, then every filament. Drawing side-by-side would let the left
    // cavity's bloom sit on top of the right cavity's bright line where they
    // meet at the septum — and would bury the filaments, which have to be the
    // last thing painted or they are not the brightest thing in the stroke.
    for (const s of this.sides) this.addChild(s.glow);
    for (const s of this.sides) this.addChild(s.halo);
    this.addChild(this.septum.halo);
    for (const s of this.sides) this.addChild(s.core);
    this.addChild(this.septum.core);
    for (const s of this.sides) this.addChild(s.filament);
    this.addChild(this.septum.filament);

    if (outline) this._strokeNose();

    this.update(0, 0, 0);
  }

  /**
   * Bloom, halo, then the solid body — for each wall, onto its own side's
   * Graphics.
   *
   * The paths are drawn as real cubics: `bezierCurveTo` straight off each
   * stroke's authored spline, not the flattened polyline the physics uses.
   * PixiJS then tessellates for the screen, so the outline stays smooth at any
   * viewport scale instead of carrying the chord length collision needs.
   *
   * Every pass takes its width from the stroke's own radius, so there is no
   * width constant in this method that could drift. Colour is baked white and
   * supplied by `tint` in `update`, which is what lets each cavity be recoloured
   * independently without re-tessellating a single path.
   *
   * All of it runs once, in the constructor.
   */
  _strokeNose() {
    const L = SINUS.line;

    // Which Graphics pair each stroke belongs to. The wall ids come from
    // cavity.js; anything unrecognised would silently vanish, so this is a
    // lookup rather than a positional assumption about NOSE_STROKES.
    // Which Graphics set each stroke draws into, read straight off the stroke's
    // own `side` field. This used to be a lookup table keyed by id; at nineteen
    // strokes that became untenable — every structure added to anatomy.js would
    // have needed a matching entry here, and the failure mode for forgetting is
    // a structure that is silently never drawn.
    const ownerFor = (side) => (side === null ? this.septum : this.sides[side]);

    const tiers = [
      { layer: 'halo', spread: L.bloomSpread, alpha: L.bloomAlpha },
      { layer: 'halo', spread: L.haloSpread, alpha: L.haloAlpha },
      { layer: 'core', spread: 0, alpha: L.coreAlpha },
      { layer: 'filament', inset: L.filamentInset, alpha: L.filamentAlpha },
    ];

    for (const tier of tiers) {
      for (const { path, radius, side } of NOSE_STROKES) {
        const g = ownerFor(side)[tier.layer];

        /**
         * The outer tiers spill past the body; the filament is inset into it.
         *
         * BOTH SCALE WITH THE STROKE'S OWN WIDTH. The spreads used to be
         * absolute, which was fine while every stroke was about the same
         * weight, and stopped being fine the moment the septum dropped to a
         * 3px hairline: a fixed 12px bloom and 4px halo around a 3px line is a
         * 27px glow with a thread in the middle of it, which is exactly the
         * sausage the thin septum exists to avoid. Scaling against
         * `spreadRef` — the sinus walls' own radius — leaves the wings looking
         * precisely as they did and gives the hairline a hairline's glow.
         */
        const width =
          tier.inset === undefined
            ? radius * 2 + tier.spread * 2 * (radius / L.spreadRef)
            : radius * 2 * (1 - tier.inset);

        if (width < 0.5) continue;

        tracePath(g, path);

        g.stroke({
          // The body tier is exactly the capsule the collision test measures;
          // the two above it are that plus a fixed spill on each side, and the
          // filament is light living inside the solid.
          width,
          color: 0xffffff,
          alpha: tier.alpha,
          cap: 'round',
          join: 'round',
        });
      }
    }
  }

  /**
   * Paint one cavity from its own eased clearance.
   *
   * Three tint writes and two transform writes. Every path was baked white, so
   * this recolours a whole passage without touching a vertex — which is what
   * makes per-side colour free rather than a second draw budget.
   */
  _paint(side, dt, k) {
    side.progress += (side.target - side.progress) * k;

    const p = side.progress;
    const hue = sampleRamp(p);

    side.glow.tint = hue;
    side.halo.tint = hue;
    side.core.tint = lerpColor(hue, 0xffffff, SINUS.line.lift);
    side.filament.tint = lerpColor(hue, 0xffffff, SINUS.line.filamentLift);

    const alpha = SINUS.alphaHot + (SINUS.alphaClear - SINUS.alphaHot) * p;

    // The throb is this passage's own pulse: strongest while it is blocked,
    // gone once it is clear. Two cavities at different clearances therefore
    // beat at different rates, which is the read we want — one side settling
    // while the other is still angry.
    const heat = 1 - p;
    const throb = this.reduceMotion
      ? 0
      : Math.sin(this._t * SINUS.throb.rate * (0.5 + heat)) * SINUS.throb.amplitude * heat;

    side.glow.alpha = alpha * (1 + throb);

    // Scaled about this cavity's own focus, so it swells in place instead of
    // sliding across the septum.
    const s = 1 + throb * 0.18;
    side.glow.scale.set(s);
    side.glow.position.set(side.focus.x * (1 - s), side.focus.y * (1 - s));
  }

  /**
   * @param {number} dt
   * @param {number} leftProgress 0 = left cavity fully blocked, 1 = clear.
   * @param {number} rightProgress the same for the right.
   *
   * The eased chase is the point of this method. Snapping a colour to the live
   * brick count would step that half of the drawing on every break, which reads
   * as a flicker; travelling toward it over SINUS.ease seconds reads as
   * inflammation actually subsiding, and it means a Sneeze cools a passage in
   * one visible sweep.
   */
  update(dt, leftProgress, rightProgress) {
    this._t += dt;

    this.sides[0].target = leftProgress;
    this.sides[1].target = rightProgress;

    const k = SINUS.ease > 0 ? Math.min(1, dt / SINUS.ease) : 1;

    for (const side of this.sides) this._paint(side, dt, k);

    // The divider takes the mean of the two eased values, so it reads as the
    // boundary between whatever the two passages currently are.
    const mid = (this.sides[0].progress + this.sides[1].progress) / 2;
    const hue = sampleRamp(mid);

    this.septum.halo.tint = hue;
    this.septum.core.tint = lerpColor(hue, 0xffffff, SINUS.line.lift);
    this.septum.filament.tint = lerpColor(hue, 0xffffff, SINUS.line.filamentLift);

  }
}

/** Flat ground behind the nose. Drawn once, never touched again. */
export function buildSinusGround() {
  return new Graphics()
    .rect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, DESIGN.height - FIELD.top)
    .fill(SINUS.base);
}
