import { Container, Graphics } from 'pixi.js';
import { DESIGN, FIELD, SINUS } from './config.js';
import { CAVITIES, NOSE_STROKES } from './cavity.js';

/**
 * The nose: a glowing neon nasal aperture in the upper-middle of the board.
 *
 * THE ONE RULE THIS FILE FOLLOWS. It does not own a single coordinate, and it
 * does not choose a single line width. `cavity.js` exports `NOSE_STROKES` —
 * points plus a radius per stroke — and this draws each one at exactly
 * `radius * 2`. A polyline stroked at width 2r with round caps and joins is
 * precisely the set of points within r of that polyline, which is precisely
 * what the collision test measures. The lit line and the surface the ball
 * bounces off are therefore the same object, not two descriptions of one that
 * have to be kept in step. Change a coordinate or a radius and both move
 * together, because there is only one of each.
 *
 * The halo is the one thing drawn wider than the surface, and it is drawn
 * *under* the body at low alpha so it reads unambiguously as glow spilling off
 * a solid line rather than as more line. That distinction matters here in a way
 * it did not when these strokes were the playfield edge: the ball now passes
 * within a few pixels of the outside of every wall, so a halo the player might
 * mistake for substance is a halo they will blame for a bounce.
 *
 * ASYMMETRIC CLEARANCE. The two cavities are separate Graphics carrying
 * separate colours, because a Graphics has one tint and the two passages drain
 * independently: clear the right and it runs cool while the left is still
 * burning. Each side owns its glow, its strokes and its own eased clearance.
 * The septum, belonging to both, takes the mean.
 *
 * Everything is static after construction:
 *
 *   The **strokes** are stroked once in the constructor and never touched
 *   again. Three tiers — a wide faint bloom, a tight halo, the solid body —
 *   which is far cheaper than a blur filter and does not scale with the size of
 *   the drawing.
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

/** Linear blend between two packed RGB colours. */
function lerpColor(a, b, k) {
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
   * `outline` follows whether the nose is actually collidable on this level.
   * The glow is drawn either way — it is the inflammation readout, and every
   * level has one — but the solid neon strokes are only drawn where the ball
   * really bounces off them. Drawn on a level that does not carry the
   * obstacles, they would be a lie about the physics, and a bad one: a bumper
   * in the middle of the board that the ball flies straight through.
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
     * who has cleared the right passage and not the left should see one nostril
     * running cool while the other still burns, and no amount of shared state
     * can express that.
     *
     * `progress` is per side and eased per side, so a cluster falling on the
     * left cools the left alone at its own pace. `target` is what the scene
     * hands in each frame.
     */
    const f = SINUS.glow.focus;

    this.sides = CAVITIES.map((points, i) => {
      const focus = { x: CX + (i === 0 ? -f.offsetX : f.offsetX), y: f.y };

      const glow = new Graphics();
      glow.blendMode = 'add';
      gradientStack(glow, points, focus, SINUS.glow);

      return {
        focus,
        glow,
        halo: new Graphics(),
        core: new Graphics(),
        progress: 0,
        target: 0,
      };
    });

    /**
     * The septum belongs to both cavities, so it takes the mean of the two.
     *
     * Splitting it down the midline into a left face and a right face was the
     * alternative, and it is worse in every way that matters: the stroke has
     * round caps, so halving it leaves two half-capsules that do not tile back
     * into the shape the ball actually collides with, and the seam falls
     * exactly on the axis of symmetry where any mismatch is most visible. The
     * mean is honest — it is one object dividing two passages — and when both
     * sides agree it looks precisely as it did before the split.
     */
    this.septum = { halo: new Graphics(), core: new Graphics() };

    // Layered by tier rather than by side: every glow, then every halo, then
    // every core. Drawing side-by-side would let the left cavity's bloom sit on
    // top of the right cavity's bright line where they meet at the septum.
    for (const s of this.sides) this.addChild(s.glow);
    for (const s of this.sides) this.addChild(s.halo);
    this.addChild(this.septum.halo);
    for (const s of this.sides) this.addChild(s.core);
    this.addChild(this.septum.core);

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
    const owner = {
      'wall-left': this.sides[0],
      'wall-right': this.sides[1],
      septum: this.septum,
    };

    const tiers = [
      { layer: 'halo', spread: L.bloomSpread, alpha: L.bloomAlpha },
      { layer: 'halo', spread: L.haloSpread, alpha: L.haloAlpha },
      { layer: 'core', spread: 0, alpha: L.coreAlpha },
    ];

    for (const tier of tiers) {
      for (const { id, path, radius } of NOSE_STROKES) {
        const g = owner[id]?.[tier.layer];
        if (!g) continue;

        tracePath(g, path);

        g.stroke({
          // The body tier is exactly the capsule the collision test measures;
          // the two above it are that plus a fixed spill on each side.
          width: radius * 2 + tier.spread * 2,
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
   * inflammation actually subsiding, and it means a Sneeze or an explosive
   * chain cools a passage in one visible sweep.
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
  }
}

/** Flat ground behind the nose. Drawn once, never touched again. */
export function buildSinusGround() {
  return new Graphics()
    .rect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, DESIGN.height - FIELD.top)
    .fill(SINUS.base);
}
