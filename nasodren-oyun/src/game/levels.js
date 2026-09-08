/**
 * Level definitions.
 *
 * Each row is a string of exactly GRID.cols characters. Legend:
 *   .      empty
 *   1..8   standard brick, palette index — tier-textured by current HP,
 *          see textureKeyFor in textures.js
 *   B      bone    - indestructible, does not count toward clearing
 *
 * EVERY BREAKABLE CELL IS ONE HIT AND DRAWS AS brick1.png. A digit picks the
 * palette colour its break effects throw off, not its toughness — see
 * `_specFor` in bricks.js, where 1..8 all resolve to `hits: 1`. brick2.png and
 * brick3.png are the 2-hit and 3-hit tiers, reachable only once the corruption
 * meter buffs the field. A layout cannot author them.
 *
 *   <      half-width cell, hugging the LEFT edge of its column
 *   >      half-width cell, hugging the RIGHT edge of its column
 *   o      small square, centred in its column
 *
 * The three shape characters are standard one-hit cells in a smaller box. They
 * exist so a layout can be packed into a curved space, and so the result does
 * not read as a wall; every cell is additionally drawn nudged and tilted, see
 * BRICK.scatter. Bone is full-cell only.
 *
 * `music` selects one of the synthesised tracks in core/audio.js, mirroring the
 * way the original swapped tracks every few levels.
 *
 * `cavity: true` IS ON EVERY PLAYABLE LEVEL, and that is the single strongest
 * constraint in this file. Congestion spawns inside a painted sinus or it does
 * not spawn: a clump floating in the nasal cavity or out in the open board is
 * not congestion, it is a brick wall with a nose drawn behind it.
 * `validateLevels` enforces it and `npm run check:nose` fails the build.
 *
 * WHAT THAT COSTS, WRITTEN DOWN SO NOBODY REDISCOVERS IT THE HARD WAY:
 *
 *   FOURTEEN POSITIONS. Seven per side, and that is the whole board. It was
 *   nominally thirty-two until the containment geometry was retraced from
 *   background.png: the hand-authored curves it replaced described a sinus with
 *   twice the painted area, so half the cells those layouts placed were sitting
 *   in bare navy background and passing validation while doing it. Fourteen is
 *   what the painting actually holds. See the note in anatomy.js.
 *
 *   THE POSITIONS ARE THESE, AND THERE ARE NO OTHERS:
 *
 *     row  0    c5 c7            small only
 *     row  1    c5 c7            half or small
 *     row  2    c4 c8            small only
 *               c5 c7            half or small
 *     row 12    c3 c9            half or small
 *               c4 c8            ANY, including a full cell
 *     row 13    c4 c8            half or small
 *
 *   ROWS 3 TO 11 ARE DEAD, all nine of them, and not because of a margin that
 *   could be tuned. The painting has no enclosed air space between the frontal
 *   chamber's floor at y 148 and the maxillary chamber's roof at y 270 — the
 *   neck that appears to join them is drawn as open turbinate scrolls, and the
 *   two small ethmoid cells that ARE closed measure 28x14px, against a smallest
 *   drawable cell of 18.4x17.1px plus a 7.6px margin. Nothing fits. The dots
 *   in the middle of every layout below are that gap.
 *
 *   ONLY TWO POSITIONS TAKE A FULL CELL, r12c4 and r12c8, in the belly of each
 *   maxillary wing. Everywhere else the chamber has sloped in past halfway and
 *   the validator refuses anything wider than a half. Read the map above, or
 *   run `npm run check:nose` for the live one.
 *
 *   DIFFICULTY CANNOT COME FROM CELL COUNT. With a ceiling of fourteen the
 *   curve is short. What is left is bone placement, which zones are occupied,
 *   how hollow the middle of a chamber is left, and the corruption meter's
 *   `buffAllBricks`, which raises every cell to 2 and then 3 hits mid-level —
 *   also the only thing that puts brick2.png and brick3.png on screen, since a
 *   digit in a layout is always a one-hit cell.
 *
 * BONE IS EXEMPT FROM CONTAINMENT, and it is the one character that is. A
 * sinus is a hole in the facial skeleton, so the bone is by definition what
 * surrounds the air rather than what floats in it — a bone cell out in the dark
 * beside a chamber is anatomically the correct place for it, and reads as the
 * cheekbone the wing is hollowed out of. Levels place it both ways: inside a
 * chamber it is an obstruction the player has to work around, outside one it is
 * a fixed deflector in open board. `validateLevels` skips it; check-nose
 * reports where each one landed.
 *
 * NOTHING IN THE PAINTING IS SOLID. The ball bounces off the plain FIELD
 * rectangle on every level, exactly as it always did; the chambers constrain
 * where cells may be authored, not where the ball may travel.
 */

import { BRICK, BRICK_W, BRICK_H, GRID } from './config.js';
import { rectInsideTract, tractMargin } from './cavity.js';

export const LEVELS = [
  {
    /**
     * Level 1 — Viral ARS (a common cold).
     *
     * TWELVE CELLS OUT OF THE FOURTEEN THE ANATOMY ALLOWS, which sounds packed
     * and is not: the two it leaves out are chosen to break the symmetry rather
     * than to open the board up. This is the mildest presentation in the
     * report, a head cold rather than a sinusitis, and what makes it mild is
     * that nothing here is stacked — the maxillary wings hold three cells each
     * across their whole width instead of the wall of six the later levels
     * build there.
     *
     * SPREAD OVER THE FULL HEIGHT OF THE NOSE, on purpose. Three cells sit up
     * in each frontal chamber at rows 0-2 and three down in each maxillary at
     * rows 12-13, with nine dead rows between them. The ball has to be driven
     * the whole way up the passage and back rather than living in the bottom
     * two rows, which is most of why twelve cells is not a short level.
     *
     * SIX AND SIX IS LOAD-BEARING. Each sinus is coloured by its own clearance
     * ratio, so the two sides must START equal or one reads angrier than the
     * other from the first frame through no fault of the player.
     * scripts/check-nose.mjs fails the build if they drift apart. Bone is
     * excluded from that count.
     *
     * THE POSITIONS ARE NOT MIRRORED, and with this few cells on screen that is
     * the difference between a mess and a rubber stamp. The left half skips
     * r2c5 and keeps r1c5; the right half skips r1c7 and keeps r2c7. Same
     * count, different silhouette, and the shapes differ down the maxillary
     * too — a full cell against the medial wall on both sides, but flanked by a
     * half on the left and by a small plus a half on the right.
     *
     * TWO BONE CELLS, BOTH OUTSIDE THE SINUS, at r12c1 and r12c11. They sit
     * lateral to each maxillary wing, in the dark where the painted cheekbone
     * is, level with the widest part of the chamber they flank. Out there they
     * are not obstructions in front of the mucus — they are two fixed
     * deflectors standing in the open board either side of the nose, and a
     * shot that comes off one arrives at the wing from an angle the paddle
     * cannot set up directly. That is the whole of level 1's difficulty budget
     * spent on geometry rather than on cell count.
     */
    name: 'Viral ARS',
    music: 0,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.......',
      '....o..>o....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.B.>4...4<.B.',
      '....<...>....',
    ],
  },
  {
    /** Pillars — one column per chamber, roof to floor: the section at its most vertical. 10 cells (5/5). */
    name: 'Pillars',
    music: 0,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.>.....',
      '.....<.>.....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '....<...>....',
      '....<...>....',
    ],
  },
  {
    /** Arrowhead — one cell at each roof widening to three at the maxillary belly. 10 cells (5/5). */
    name: 'Arrowhead',
    music: 0,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.............',
      '....oo.oo....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '...o4...4o...',
      '.............',
    ],
  },
  {
    /** Vault — bone in the belly of each wing; the mucus around it has to be dug out past it. 12 cells (6/6), 2 bone inside. */
    name: 'Vault',
    music: 0,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.>.....',
      '....o<.>o....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '...>B...B<...',
      '....<...>....',
    ],
  },
  {
    /** Ghosts — both frontal chambers occupied, both maxillary wings completely empty. 6 cells (3/3). */
    name: 'Ghosts',
    music: 1,
    cavity: true,
    rows: [
      '.............',
      '.....<.>.....',
      '....o<.>o....',
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
      '.............',
    ],
  },
  {
    /** Checkerboard — every cell a small one with a gap around it; nothing can be farmed by ricochet. 8 cells (4/4). */
    name: 'Checkerboard',
    music: 1,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.............',
      '....o...o....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '...o.....o...',
      '....o...o....',
    ],
  },
  {
    /** Fortress — bone in each wing and on each cheek; the only way in is over the top. 6 cells (3/3), 4 bone. */
    name: 'Fortress',
    music: 1,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.............',
      '.....<.>.....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.B..B...B..B.',
      '....<...>....',
    ],
  },
  {
    /** Downpour — halves only, draining down the medial wall of both chambers. 10 cells (5/5). */
    name: 'Downpour',
    music: 1,
    cavity: true,
    rows: [
      '.............',
      '.....<.>.....',
      '.....<.>.....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '...><...><...',
      '....<...>....',
    ],
  },
  {
    /** Bunker — maxillary only, packed, with bone on both cheeks. The frontal chambers are a wasted trip. 6 cells (3/3), 2 bone outside. */
    name: 'Bunker',
    music: 2,
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
      '.............',
      '.............',
      '.B.>4...4<.B.',
      '....<...>....',
    ],
  },
  {
    /** Nova — both medial walls and both floors, the belly of each wing left hollow. 12 cells (6/6). */
    name: 'Nova',
    music: 2,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.>.....',
      '.....<.>.....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '...>4...4<...',
      '....<...>....',
    ],
  },
  {
    /** Gauntlet — bone in both wings AND on both cheeks, twelve cells around it. The most constrained board in the game. 12 cells (6/6), 4 bone. */
    name: 'Gauntlet',
    music: 2,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.>.....',
      '....o<.>o....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.B.>B...B<.B.',
      '....<...>....',
    ],
  },
  {
    /** Brickstorm — all fourteen legal positions. There is no denser layout the painting will take. 14 cells (7/7). */
    name: 'Brickstorm',
    music: 2,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.>.....',
      '....o<.>o....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '...>4...4<...',
      '....<...>....',
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
 * Which shape each layout character asks for. Mirrors CHAR_MAP in bricks.js.
 *
 * Duplicated deliberately, and it is a small duplication with a real payoff:
 * importing bricks.js here would pull the whole display layer — Pixi, the
 * texture atlas, every Sprite — into a module that level tooling and the
 * geometry checker want to load on their own. Anything not listed is a full
 * cell, which is also what bricks.js falls back to.
 */
const SHAPE_FOR = { '<': 'halfLeft', '>': 'halfRight', o: 'small' };

/**
 * The drawn box of one layout cell, in DESIGN space.
 *
 * The variant's own box, not the full cell: a half-width clump is allowed in a
 * column where a full one would not fit, and that is most of what the shape
 * characters are for.
 */
export function cellBox(col, row, ch) {
  const box = BRICK.shapes[SHAPE_FOR[ch] ?? 'full'];
  const w = BRICK_W * box.w;
  const h = BRICK_H * box.h;
  const x0 = GRID.x + col * GRID.cellW + GRID.gap / 2 + (BRICK_W - w) * box.align;
  const y0 = GRID.y + row * GRID.cellH + GRID.gap / 2 + (BRICK_H - h) * 0.5;

  return { x0, y0, x1: x0 + w, y1: y0 + h, w, h };
}

/**
 * Dev guard: catches a mistyped row before it becomes a confusing layout bug.
 *
 * The second half is the one that matters — congestion has to sit INSIDE the
 * chamber it claims to be blocking. A clump adrift in the open board is the
 * thing that would look broken, and it is not visible in a string of dots.
 *
 * BONE IS SKIPPED, which is a rule about anatomy rather than a loophole: the
 * sinus is a void in the facial skeleton, so bone belongs around the air, not
 * in it. Level 1 puts both of its bone cells out on the cheeks for exactly
 * that reason. Bone placed inside a chamber is legal too — it reads as a
 * sclerotic wall thickening into the air space — so neither position is
 * checked, only reported by check-nose.
 *
 * Run from `scripts/check-nose.mjs`, which is where a layout should be taken
 * after touching any coordinate in anatomy.js.
 */
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
      [...row].forEach((ch, c) => {
        if (ch === '.' || ch === 'B') return;

        const { x0, y0, x1, y1, w, h } = cellBox(c, r, ch);

        // See tractMargin(): the nudge, plus what a corner does when the cell
        // is tilted on top of it, plus the visible gap we want to see. Passing
        // a bare BRICK.scatter here is what let cells overlap the wall.
        if (!rectInsideTract(x0, y0, x1, y1, tractMargin(w, h))) {
          problems.push(
            `${label} brick at row ${r} col ${c} ('${ch}') is not inside a sinus chamber — ` +
              'congestion has to sit in the passages it is blocking',
          );
        }
      });
    });
  });

  return problems;
}
