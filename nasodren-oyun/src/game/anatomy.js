import { DESIGN } from './config.js';

/**
 * The maxillary sinuses, as a coronal section.
 *
 * Every coordinate in the drawing lives here, in DESIGN space (640x480), and
 * nothing else in the codebase authors a point. `cavity.js` splines them and
 * publishes the regions congestion may occupy; `sinus.js` strokes them.
 *
 * THREE STROKES: two sinuses and the septum between them.
 *
 * THE SHAPE IS AN INVERTED SOFT PYRAMID, NOT A LOBE. Two previous passes got
 * this wrong in the same way and it is worth naming the failure, because it is
 * the one a rounded closed spline falls into by default: given anchors spaced
 * evenly around a blob, the curve comes out as an oval, and an oval either side
 * of a midline reads as lungs. A maxillary sinus is not a balloon. It is a
 * pyramid lying on its side in the cheekbone, and in coronal section that means
 * four edges that each do a different job:
 *
 *   MEDIAL WALL — straight, and near-vertical. This is the wall of the nasal
 *   cavity, and it is the single most load-bearing edge in the drawing: it is
 *   what stops the shape reading as round. It leans 12px over 90 of height,
 *   which is about 7 degrees, and anchors along it are near-collinear on
 *   purpose so the spline cannot bow them outward.
 *
 *   TOP EDGE — climbs from a tight superomedial apex out to the cheekbone. The
 *   apex is where the sinus tapers up and in toward the nasal bridge, and it is
 *   an acute corner: the medial wall arrives travelling straight down while the
 *   top edge leaves travelling up and out.
 *
 *   LATERAL WALL — reaches its widest around a third of the way down, then
 *   angles DOWN AND IN. This is the cheekbone, and the inward angle is what
 *   makes the shape a pyramid rather than a barrel.
 *
 *   FLOOR — narrow. About 45px across against a maximum width of 182, so a
 *   taper to a quarter. This is the alveolar recess, sitting over the tooth
 *   roots; it is the dependent part of the sinus, where fluid actually collects,
 *   and it is why the level's clumps sit in it.
 *
 * MIRRORED. The right sinus is authored and the left reflected, so the two
 * tracts hold identical layouts and neither side can play differently.
 */

const CX = DESIGN.width / 2;

/** Reflect a list of [x, y] anchors about the midline. */
export const mirrorAnchors = (pts) => pts.map(([x, y]) => [2 * CX - x, y]);

/**
 * The right maxillary sinus, clockwise from the superomedial apex.
 *
 * Read the four runs against the blueprint above:
 *
 *   [334,152] -> [498,158]   the top edge, climbing out to the cheekbone
 *   [518,204] -> [458,328]   the lateral wall, widest then angling down and in
 *   [428,354] -> [372,312]   the narrow floor, rounding through its lowest point
 *   [348,274] -> [334,152]   the medial wall, straight and near-vertical
 *
 * The medial wall's four anchors sit within 14px of each other in x across 122
 * of height. That is not slack to be tidied up later — it is what holds the
 * edge straight through the spline, and moving any one of them outward is how
 * this shape turns back into a lobe.
 */
export const MAXILLARY_RIGHT = [
  [334, 152],  // superomedial apex — tight, tucked toward the nasal bridge
  [366, 137],  // top edge climbing outward
  [410, 128],  // crest
  [458, 134],
  [498, 158],  // cheekbone shoulder — high and wide
  [518, 204],  // widest point of the section
  [512, 252],  // the lateral wall starts angling down AND IN
  [492, 296],
  [458, 328],
  [428, 354],  // the floor: narrow, rounded, and the lowest point in the drawing
  [398, 344],
  [372, 312],  // rounding back up onto the medial wall
  [348, 274],  // medial wall begins — straight from here to the apex
  [340, 222],
  [336, 184],
];

/**
 * The septum: one thin line down the exact midline.
 *
 * Drawn at CAVITY.septumRadius, which is 1.5 — a 3px stroke, against the 7px
 * the sinus walls get. It used to be 6, a 12px capsule with a wide halo on top,
 * and at that weight it was the heaviest object on the board: a bar down the
 * middle of the screen rather than a divider between two chambers.
 *
 * THE GAP AROUND IT IS THE POINT. The two medial walls sit at x 336 and 304, so
 * the nasal cavity is 32px of dark with a hairline down its centre. That
 * narrowness is what gives the pair of sinuses their scale — widen it and they
 * stop being two halves of one section and become two separate objects.
 *
 * It spans the sinuses' own vertical extent rather than the full board, so it
 * reads as the wall between them rather than as a rule drawn over them.
 */
export const SEPTUM = [
  ['M', 320, 146],
  ['L', 320, 336],
];
