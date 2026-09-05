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
 *   <      half-width cell, hugging the LEFT edge of its column
 *   >      half-width cell, hugging the RIGHT edge of its column
 *   o      small square, centred in its column
 *
 * The three shape characters are standard one-hit cells in a smaller box. They
 * exist so a layout can be packed into a curved space, and so the result does
 * not read as a wall; every cell is additionally drawn nudged and tilted, see
 * BRICK.scatter. The special kinds — S, G, X, M, I — are full-cell only.
 *
 * `music` selects one of the synthesised tracks in core/audio.js, mirroring the
 * way the original swapped tracks every few levels.
 *
 * `cavity: true` stages the level inside the sinus wireframe from
 * game/cavity.js. NOTHING THERE IS SOLID — the
 * ball bounces off the plain FIELD rectangle on every level, exactly as it
 * always did. What the flag costs a layout is containment: every cell must sit
 * wholly inside one of the two cavity tracts, which `validateLevels` checks.
 * Run `npm run check:nose` for a map of which cells each shape may occupy.
 */

import { BRICK, BRICK_W, BRICK_H, GRID } from './config.js';
import { rectInsideTract } from './cavity.js';

export const LEVELS = [
  {
    /**
     * Level 1 — Viral ARS (a common cold).
     *
     * EIGHT CLUMPS, AND THE BOARD IS 96% EMPTY. That is the level's whole
     * argument. This is the mildest presentation in the report — a head cold,
     * not a sinusitis — and a screen packed wall to wall says the opposite
     * before the player has touched anything. An earlier cut filled every legal
     * cell in both sinuses; it validated, it looked congested, and it was
     * telling the wrong story about the condition the product treats.
     *
     * LOW IN THE SINUS, BECAUSE THAT IS WHERE FLUID SITS. Every clump is in the
     * bottom four rows, around the alveolar recess — the dependent part of a
     * maxillary sinus, and the last place anything drains from. Nothing sits up
     * near the cheekbone, where a real early effusion never would.
     *
     * The four on a side are staggered rather than stacked: a half hugging the
     * inner wall, a half out at the lateral angle, then two in the floor. Four
     * cells in one column would read as a bar, which is the exact thing the
     * scatter and the shape variants exist to prevent.
     *
     * FOUR AND FOUR IS LOAD-BEARING. Each sinus is coloured by its own
     * clearance ratio, so the two sides must START equal or one reads angrier
     * than the other from the first frame through no fault of the player. The
     * checker fails the build if they drift apart. Positions are mirrored; the
     * *shapes* deliberately are not — the left has a small clump high and a
     * full one low, the right the reverse — and with only eight cells on screen
     * that difference is most of what stops the pair looking stamped.
     *
     * THE MIDDLE COLUMN IS THE NASAL CAVITY. Column 6 spans x 296..344 and the
     * two sinuses stop at x 304 and 336, so nothing can be placed there: the
     * containment check rejects it, because the gap between the medial walls is
     * not a tract. It is also the lane the ball travels up.
     *
     * READING THE MAP. `<` and `>` are half-width cells hugging the left and
     * right of their column, `o` is a small square in the middle of one, and a
     * digit is a full cell in that palette colour. Every cell is also drawn
     * nudged and tilted by BRICK.scatter — deterministically, so this layout
     * looks the same on every load. Run `npm run check:nose` for a map of which
     * cells each shape may legally occupy.
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
      '.............',
      '.............',
      '.....<.>.....',
      '...>.....<...',
      '....3...o....',
      '....o...o....',
    ],
  },
  {
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
 * The second half is the one that matters, and it INVERTED with the pivot. The
 * old question was whether a brick overlapped a nose stroke, because a brick
 * fused into a solid wall fought its own collision. Nothing here is solid any
 * more, so overlapping a stroke is merely untidy — what matters now is that
 * congestion sits INSIDE the passages it claims to be blocking. A clump adrift
 * in the open board is the thing that would look broken, and neither failure is
 * visible in a string of dots.
 *
 * Run from `scripts/check-nose.mjs`, which is where a layout should be taken
 * after touching any coordinate in cavity.js.
 */
/**
 * Which shape each layout character asks for. Mirrors CHAR_MAP in bricks.js.
 *
 * Duplicated deliberately, and it is a small duplication with a real payoff:
 * importing bricks.js here would pull the whole display layer — Pixi, the
 * texture atlas, every Sprite — into a module that level tooling and the
 * geometry checker want to load on their own. Anything not listed is a full
 * cell, which is also what bricks.js falls back to.
 */
const SHAPE_FOR = { '<': 'halfLeft', '>': 'halfRight', o: 'small' };

export function validateLevels(cols) {
  const problems = [];

  LEVELS.forEach((level, i) => {
    const label = `Level ${i + 1} "${level.name}"`;

    level.rows.forEach((row, r) => {
      if (row.length !== cols) {
        problems.push(`${label} row ${r} is ${row.length} chars, expected ${cols}`);
      }
    });

    if (!level.cavity || level.boss) return;

    level.rows.forEach((row, r) => {
      const y0 = GRID.y + r * GRID.cellH + GRID.gap / 2;

      [...row].forEach((ch, c) => {
        if (ch === '.') return;

        // The variant's own box, not the full cell: a half-width clump is
        // allowed in a column where a full one would not fit, and that is most
        // of what the shape characters are for.
        const box = BRICK.shapes[SHAPE_FOR[ch] ?? 'full'];
        const w = BRICK_W * box.w;
        const h = BRICK_H * box.h;
        const x0 = GRID.x + c * GRID.cellW + GRID.gap / 2 + (BRICK_W - w) * box.align;
        const yy = y0 + (BRICK_H - h) * 0.5;

        // The scatter margin: a cell is drawn up to BRICK.scatter off its grid
        // position, so a layout that only just fits would spill onto the
        // wireframe the moment the mess is applied.
        if (!rectInsideTract(x0, yy, x0 + w, yy + h, BRICK.scatter)) {
          problems.push(
            `${label} brick at row ${r} col ${c} ('${ch}') is not inside a sinus tract — ` +
              'congestion has to sit in the passages it is blocking',
          );
        }
      });
    });
  });

  return problems;
}
