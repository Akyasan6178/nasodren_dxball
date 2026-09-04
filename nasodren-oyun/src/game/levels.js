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
 */

export const LEVELS = [
  {
    name: 'Warm Up',
    music: 0,
    rows: [
      '1111111111111',
      '2222222222222',
      '3333333333333',
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

/** Dev guard: catches a mistyped row before it becomes a confusing layout bug. */
export function validateLevels(cols) {
  const problems = [];

  LEVELS.forEach((level, i) => {
    level.rows.forEach((row, r) => {
      if (row.length !== cols) {
        problems.push(`Level ${i + 1} "${level.name}" row ${r} is ${row.length} chars, expected ${cols}`);
      }
    });
  });

  return problems;
}
