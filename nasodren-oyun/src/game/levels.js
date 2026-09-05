/**
 * Level definitions.
 *
 * Each row is a string of exactly GRID.cols characters. Legend:
 *   .      empty
 *   1..8   standard brick, palette index (1 hit)
 *   S      silver  - 2 hits
 *   G      gold    - 3 hits
 *   X      explosive - detonates its 3x3 neighbourhood
 *   M      metal   - indestructible, does not count toward clearing
 *   I      invisible - materialises on first contact, then behaves as standard
 *
 * `music` selects one of the synthesised tracks in core/audio.js, mirroring the
 * way the original swapped tracks every few levels.
 *
 * `cavity: true` stands the nose from game/cavity.js in the middle of the
 * board: three solid neon strokes the ball bounces off, on top of the ordinary
 * FIELD walls. It is opt-in per level because the nose occupies x 143..497 and
 * y 92..342, straight through where most layouts put their bricks, and a brick
 * overlapping a stroke is fused into a solid wall. See CAVITY in config.js.
 */

import { BRICK_W, BRICK_H, GRID } from './config.js';
import { NoseObstacles } from './cavity.js';

export const LEVELS = [
  {
    /**
     * Level 1 — Viral ARS (a common cold).
     *
     * The mildest presentation in the report, and the layout says so: no
     * multi-hit bricks, no metal, no explosives — sixteen single-hit bricks,
     * eight per cavity, every one of them inside the nose.
     *
     * EIGHT AND EIGHT IS LOAD-BEARING NOW THAT CLEARANCE IS ASYMMETRIC. Each
     * cavity is coloured by its own ratio, so the two halves have to start
     * equal or the nose is lopsided from the first frame through no fault of
     * the player. Any layout added here must stay mirror-symmetric for the same
     * reason.
     *
     * THE CONGESTION IS IN THE NASAL CAVITIES AND NOWHERE ELSE. That is the
     * whole argument the level makes, so the open board around the aperture is
     * left open: bricks out there would say the congestion is everywhere, which
     * is not what the product is about. It also gives the ball somewhere to
     * travel — the flanks and the space over the bridge are where a shot goes
     * when an ala throws it back out.
     *
     * SIXTEEN IS THE HONEST NUMBER, and it is set by geometry, not by taste.
     * The grid is 48px to a column and the nose has a narrow bridge, so the
     * upper cavities simply cannot hold a brick. Measured against the strokes,
     * each cavity clears one column (5 on the left, 7 on the right) at y 220
     * and 240, and two (4 and 5, 7 and 8) from y 260 to 318 as the alae flare.
     * Above y 220 the passage is under 46px wide and nothing fits. Widening the
     * nose to fit more would eat either the padding or the inward sweep at the
     * bridge, which are the two things that make it read as a nose.
     *
     * WATCH THE MARGINS IF THE ANCHORS MOVE. The brick grid's middle column
     * spans x 296..342, so its centre is 319 while the nose is mirrored about
     * 320, and that one-pixel offset is enough to clear a column on one side
     * and not the other. Only ever take the symmetric subset: two passages that
     * do not play identically are a bug the player will feel and never be able
     * to name — and now that each cavity is coloured independently, an uneven
     * split would also make one side look permanently worse than the other.
     *
     * COLUMN 6 IS EMPTY ON EVERY ROW. It spans x 296..342 and the septum sits
     * at 314..326 inside it. Below the septum's tip at y 290 it is still left
     * clear, because that column is the approach: the ball comes off the paddle
     * up the midline, catches the rounded tip, and is thrown into one cavity or
     * the other. Fill it and the level loses its central mechanic.
     *
     * The clusters swell from one brick to two and back to one as they descend,
     * which is the shape of the cavity holding them — fluid pools to the shape
     * of what holds it. The pair at row 12 sits on the nostril sills, the last
     * place anything drains from.
     *
     * A brick overlapping a stroke is fused into a solid wall: the bounce off
     * that face is unreadable and the two collisions fight each other.
     * `validateLevels` checks every brick with `NoseObstacles.hitsRect()`, and
     * it is the check to re-run after touching any coordinate in cavity.js.
     *
     * Warm palette indices throughout (2 = orange, 3 = yellow) so the
     * congestion reads hot against the cyan strokes, and the inflammation glow
     * behind it has something to be the colour of.
     */
    name: 'Viral ARS',
    music: 0,
    cavity: true,
    rows: [
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.....2.2.....',
      '.....3.3.....',
      '....22.22....',
      '....33.33....',
      '....22.22....',
    ],
  },  {
    name: 'Pillars',
    music: 0,
    rows: [
      '4.4.4.4.4.4.4',
      '4.4.4.4.4.4.4',
      '5555555555555',
      '.S.S.S.S.S.S.',
    ],
  },
  {
    name: 'Arrowhead',
    music: 0,
    rows: [
      '......1......',
      '.....121.....',
      '....12321....',
      '...1234321...',
      '..123454321..',
      '.12345654321.',
    ],
  },
  {
    name: 'Vault',
    music: 0,
    rows: [
      'MMMMMMMMMMMMM',
      '6666666666666',
      '7.7.7.7.7.7.7',
      'SSSSSSSSSSSSS',
      '.X.........X.',
    ],
  },
  {
    name: 'Ghosts',
    music: 1,
    rows: [
      'IIIIIIIIIIIII',
      '3.3.3.3.3.3.3',
      'IIIIIIIIIIIII',
      '4.4.4.4.4.4.4',
    ],
  },
  {
    name: 'Checkerboard',
    music: 1,
    rows: [
      '1.2.3.4.5.6.7',
      '.2.3.4.5.6.7.',
      '3.4.5.6.7.8.1',
      '.G.G.G.G.G.G.',
    ],
  },
  {
    name: 'Fortress',
    music: 1,
    rows: [
      'MM.........MM',
      'M.SSSSSSSSS.M',
      'M.S.......S.M',
      'M.S.XXXXX.S.M',
      'M.SSSSSSSSS.M',
      'MM.........MM',
    ],
  },
  {
    name: 'Downpour',
    music: 1,
    rows: [
      '8.8.8.8.8.8.8',
      '.7.7.7.7.7.7.',
      '6.6.6.6.6.6.6',
      '.5.5.5.5.5.5.',
      '4.4.4.4.4.4.4',
      '.X.X.X.X.X.X.',
    ],
  },
  {
    name: 'Bunker',
    music: 2,
    rows: [
      'SSSSSSSSSSSSS',
      'S...........S',
      'S.GGGGGGGGG.S',
      'S.G.......G.S',
      'S.G.MMMMM.G.S',
      'S.GGGGGGGGG.S',
      'SSSSSSSSSSSSS',
    ],
  },
  {
    name: 'Nova',
    music: 2,
    rows: [
      '..I.......I..',
      '.II.XXXXX.II.',
      'IIIIIIIIIIIII',
      '.II.XXXXX.II.',
      '..I.......I..',
    ],
  },
  {
    name: 'Gauntlet',
    music: 2,
    rows: [
      'MGMGMGMGMGMGM',
      '1234567812345',
      'MGMGMGMGMGMGM',
      '5678123456781',
      'SSSSSSSSSSSSS',
    ],
  },
  {
    name: 'Brickstorm',
    music: 2,
    rows: [
      'XMXMXMXMXMXMX',
      'GGGGGGGGGGGGG',
      'SISISISISISIS',
      'GGGGGGGGGGGGG',
      'XMXMXMXMXMXMX',
      '.G.G.G.G.G.G.',
    ],
  },
  {
    name: 'O.M.E.G.A.',
    music: 2,
    /**
     * Boss encounter. `rows` is empty on purpose: there is no brick wall, so
     * BrickField builds nothing and the level-clear condition falls through to
     * the boss's own defeat check in GameScene.
     */
    boss: true,
    rows: [],
  },
];

export const LEVEL_COUNT = LEVELS.length;

/**
 * Dev guard: catches a mistyped row before it becomes a confusing layout bug.
 *
 * The second half is the one that matters. On a `cavity` level a brick that
 * overlaps the nose is a brick fused into a solid stroke: the bounce off that
 * face is unreadable, and the brick's own collision fights the stroke's. It is
 * cheap to check and impossible to see coming from a string of dots.
 *
 * NOTE: nothing calls this yet. Wiring it into BootScene and logging the result
 * is a two-line change and worth doing before any more layouts are cut around
 * the nose by hand.
 */
export function validateLevels(cols) {
  const problems = [];
  let bounds = null;

  LEVELS.forEach((level, i) => {
    const label = `Level ${i + 1} "${level.name}"`;

    level.rows.forEach((row, r) => {
      if (row.length !== cols) {
        problems.push(`${label} row ${r} is ${row.length} chars, expected ${cols}`);
      }
    });

    if (!level.cavity || level.boss) return;
    bounds ??= new NoseObstacles();

    level.rows.forEach((row, r) => {
      const y0 = GRID.y + r * GRID.cellH;

      [...row].forEach((ch, c) => {
        if (ch === '.') return;

        const x0 = GRID.x + c * GRID.cellW;
        const struck = bounds.hitsRect(x0, y0, x0 + BRICK_W, y0 + BRICK_H);

        if (struck) {
          problems.push(
            `${label} brick at row ${r} col ${c} overlaps the "${struck}" stroke — it would be fused into a solid wall`,
          );
        }
      });
    });
  });

  return problems;
}
