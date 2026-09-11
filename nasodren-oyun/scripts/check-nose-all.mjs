/**
 * Run the geometry guard once per design box.
 *
 * WHY A WRAPPER RATHER THAN A LOOP INSIDE check-nose.mjs. The box is chosen at
 * MODULE LOAD in config.js, and everything downstream of that choice —
 * the placed rings in anatomy.js, every tract and glow region cavity.js builds
 * from them, the level validation levels.js runs on import — is computed once
 * per process. There is no way to re-shape inside a single run short of
 * invalidating the ES module graph, so each shape gets its own process.
 *
 * WHY BOTH SHAPES ARE CHECKED. The two boxes are the same frame translated by
 * FRAME_X, so containment against the painting is identical in them by
 * construction. What is NOT identical is everything measured against the board
 * rather than the painting: the side walls, the paddle band, the usable-cell
 * count. Portrait is the tighter box on all three, but "tighter" is an argument
 * and running both is a fact.
 *
 * Spawning with an env var rather than a shell prefix keeps this working on
 * Windows, where an npm script runs through cmd.exe and `VAR=x node ...` is a
 * syntax error rather than an assignment.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(here, 'check-nose.mjs');

const shapes = ['portrait', 'landscape'];
let failed = false;

for (const shape of shapes) {
  console.log(`\n${'='.repeat(72)}\n  ${shape.toUpperCase()} BOX\n${'='.repeat(72)}`);

  const run = spawnSync(process.execPath, [target], {
    stdio: 'inherit',
    env: { ...process.env, NASODREN_SHAPE: shape },
  });

  if (run.status !== 0) failed = true;
}

if (failed) {
  console.error('\ngeometry checks FAILED in at least one box');
  process.exit(1);
}

console.log('\ngeometry checks passed in both boxes');
