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
 *   BONE READS OFF A DIFFERENT MAP ENTIRELY — it wants the wall, not the air —
 *   and the levels below author it in the dead middle rows, on the floor of
 *   the frontal chambers, where it gates the climb into them:
 *
 *     row  3    c3 c9     the frontal floor at its lateral tip, covering the
 *                         approach up the flank
 *               c4 c8     the frontal floor straight under the r0..r2 cells
 *     row  4    c5 c7     the frontal floor at its medial corner, covering
 *                         the approach up the septum lane
 *
 *   ROWS 3 AND 4 ARE DEAD FOR CONGESTION, which is what makes this free: a
 *   bone cell there costs the layout none of its fourteen positions and buys
 *   the only vertical obstacle on the board.
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
 * BONE SITS ON A CHAMBER WALL, and that is a rule with teeth rather than an
 * exemption. A sinus is a hole in the facial skeleton, so bone is by
 * definition the boundary of the air space — not something floating in that
 * air, and not something adrift in the dark beside it either.
 * `rectOnTractWall` is what checks it: the wall has to cross the cell, and
 * cross it through the cell's middle band rather than nicking a corner.
 *
 * THIS REPLACED A BLANKET EXEMPTION, and the exemption is why the rule exists.
 * Bone used to be the one character containment did not constrain, on the
 * reasoning that bone is correct on either side of a wall. True as anatomy,
 * useless as a constraint: it let level 1 put its two cells 56px out in bare
 * navy beside the nose and level 4 put its two in the middle of the maxillary
 * air, both passing validation while doing it. Straddling the wall was in fact
 * the one thing the old check actively rejected, as a suspected rendering
 * fault. It is now the only thing it accepts.
 *
 * THE LEGAL POSITIONS ARE ELEVEN PER SIDE, against seven for congestion, so
 * bone is the less constrained character even under the rule. `npm run
 * check:nose` prints the live map and names the wall each authored cell
 * landed on.
 *
 * AND OF THOSE ELEVEN, THE LEVELS BELOW USE THE ONES IN THE MIDDLE ROWS, on
 * the floor of the frontal chambers. That is a level-design choice rather than
 * a geometric constraint, and it is the one that gives bone a job. Congestion
 * lives in two clusters eleven rows apart — the frontal chambers at rows 0..2
 * and the maxillary wings at rows 12..13 — with nothing at all between them,
 * so a ball aimed up the middle used to arrive at the frontal cells having
 * passed nine rows of empty board. Bone on the frontal floor is the only thing
 * standing in that corridor: the climb has to be worked around it instead of
 * driven straight through.
 *
 * BONE ON THE MAXILLARY IS STILL LEGAL and check:nose still prints those
 * positions — the wing roof at r11c4/r11c8 and the cheekbone apex at
 * r12c2/r12c10 both pass. They are simply not where the difficulty is: a
 * blocker beside the maxillary cells sits in a part of the board the ball is
 * already spending its whole time in.
 *
 * NOTHING IN THE PAINTING IS SOLID. The ball bounces off the plain FIELD
 * rectangle on every level, exactly as it always did; the chambers constrain
 * where cells may be authored, not where the ball may travel.
 */

import { BRICK, BRICK_W, BRICK_H, GRID } from './config.js';
import { rectInsideTract, rectOnTractWall, tractMargin } from './cavity.js';

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
     * TWO BONE CELLS ON THE FRONTAL FLOOR, at r4c5 and r4c7. Each one
     * straddles the lowest, most medial point of the frontal chamber above it
     * — (272, 148) on the left and its mirror on the right — so the pair sits
     * either side of the septum lane with the bone half in the air space and
     * half in the floor it is a thickening of.
     *
     * WHAT THEY ARE FOR IS THE CLIMB. This level spreads its twelve cells over
     * the full height of the nose, three per frontal chamber at rows 0..2 and
     * three per wing at rows 12..13, with nine dead rows between. Without
     * anything in that corridor the frontal cells are reachable on a straight
     * drive up the middle. These two stand exactly where that drive arrives,
     * so the shot has to be angled around them or taken up the flank instead.
     *
     * THEY USED TO BE AT r12c1 AND r12c11, out beside the maxillary wings,
     * where they were 56px clear of any wall in bare navy background — two
     * arcade rectangles floating beside a painting of a face — and where they
     * obstructed a part of the board the ball already lives in.
     */
    name: 'Viral ARS',
    music: 0,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.......',
      '....o..>o....',
      '.............',
      '.....B.B.....',
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
    /**
     * Vault — bone across the floor of each frontal chamber, directly under
     * the cells inside it, so the vault has to be opened from the side.
     * 12 cells (6/6), 2 bone.
     *
     * r3c4 and r3c8 sit straight below the r0..r2 clusters, which is what
     * makes this the vault: the three cells above each one cannot be taken on
     * a rising shot through the column they are in. The bone was at
     * r12c4/r12c8 for as long as bone was exempt from containment, floating in
     * the middle of the maxillary air and blocking a corridor the ball was
     * already in.
     */
    name: 'Vault',
    music: 0,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.>.....',
      '....o<.>o....',
      '....B...B....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '...>.....<...',
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
    /**
     * Fortress — a descending stair of bone along each frontal floor; the only
     * way in is around the outside. 6 cells (3/3), 4 bone.
     *
     * r3c4/r3c8 covers the column the frontal cells sit in and r4c5/r4c7
     * covers the medial corner beside the septum lane, so the two routes a
     * rising shot can take into each chamber are both spoken for. With only
     * six cells on the board the whole level is that approach problem.
     */
    name: 'Fortress',
    music: 1,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.............',
      '.....<.>.....',
      '....B...B....',
      '.....B.B.....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
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
    /**
     * Bunker — maxillary only, packed, with bone plugging the mouth of each
     * frontal chamber. 6 cells (3/3), 2 bone.
     *
     * The frontal chambers hold nothing on this level, so r4c5/r4c7 is doing
     * something no other level asks of bone: it makes the wasted trip up there
     * expensive to take by accident, instead of merely pointless.
     */
    name: 'Bunker',
    music: 2,
    cavity: true,
    rows: [
      '.............',
      '.............',
      '.............',
      '.............',
      '.....B.B.....',
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
    /**
     * Gauntlet — bone across both approaches to each frontal chamber, twelve
     * cells around it. The most constrained board in the game.
     * 12 cells (6/6), 4 bone.
     *
     * The widest gate of the five: r3c3/r3c9 takes the frontal floor out at
     * its lateral tip and r4c5/r4c7 takes it at the medial corner, so the
     * flank approach and the septum-lane approach are blocked and the only way
     * left into a full frontal chamber is the narrow column between them.
     * Fortress uses the tighter r3c4/r3c8 pairing instead, which shields the
     * cells more directly but leaves the flank open.
     */
    name: 'Gauntlet',
    music: 2,
    cavity: true,
    rows: [
      '.....o.o.....',
      '.....<.>.....',
      '....o<.>o....',
      '...B.....B...',
      '.....B.B.....',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '.............',
      '...>.....<...',
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
 * BONE IS CHECKED TOO, against the opposite rule: it has to sit ON a chamber
 * wall, because the sinus is a void in the facial skeleton and bone is the
 * skeleton. See `rectOnTractWall`. This used to be the one character nothing
 * checked, which is how two cells ended up 56px out in the dark beside the
 * nose on level 1 and two more floating in the maxillary air on level 4.
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
        if (ch === '.') return;

        const { x0, y0, x1, y1, w, h } = cellBox(c, r, ch);

        // Bone is the wall, so it is measured against the wall rather than
        // against the air. No margin term either: a margin is what keeps
        // congestion clear of the wall, and clearing the wall is the one thing
        // bone must not do.
        if (ch === 'B') {
          if (!rectOnTractWall(x0, y0, x1, y1)) {
            problems.push(
              `${label} bone at row ${r} col ${c} is not on a sinus wall — ` +
                'bone is the skeleton the air space is hollowed out of, so it ' +
                'belongs on the boundary, not adrift inside or outside it',
            );
          }
          return;
        }

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
