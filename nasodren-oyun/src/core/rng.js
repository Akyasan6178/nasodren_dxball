/**
 * Cosmetic random source.
 *
 * Particles, screen shake and other purely visual jitter draw from here rather
 * than from `Math.random()`.
 *
 * The reason is determinism. Gameplay randomness — capsule drops, power-up
 * rolls, launch angles, shield regeneration — shares one global sequence. If
 * effects draw from that same sequence, then adding a few sparks to an impact
 * changes how many numbers get consumed per frame and every later gameplay roll
 * shifts with it. A purely visual change would silently alter which capsules
 * drop, and a seeded replay would stop reproducing.
 *
 * Keeping the two apart means VFX work can never move the simulation, which is
 * exactly the property that makes a visual overhaul safe to ship.
 */

// xorshift32: fast, tiny, and good enough for scatter and jitter.
let state = 0x9e3779b9;

/** @returns {number} in [0, 1) */
export function cosmeticRandom() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return state / 4294967296;
}

/** Symmetric jitter in [-1, 1). */
export function cosmeticSigned() {
  return cosmeticRandom() * 2 - 1;
}

/** Reseed, for reproducible visual capture. */
export function seedCosmetic(seed) {
  state = seed >>> 0 || 0x9e3779b9;
}
