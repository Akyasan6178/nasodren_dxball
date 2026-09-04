import { Assets } from 'pixi.js';

/**
 * Asset manifest.
 *
 * Brickstorm draws its own art at runtime (see game/textures.js), so the bundles
 * ship empty — the game boots instantly and the build has no binary payload.
 *
 * The loader is fully wired regardless: drop spritesheets, fonts or audio into
 * `public/assets/`, list them here, and the boot screen will show real progress
 * for them. `src` may be an array of formats (['x.webp', 'x.png']) and Pixi will
 * choose the best one the browser supports.
 */
export const manifest = {
  bundles: [
    {
      name: 'preload',
      assets: [
        // { alias: 'atlas', src: 'sprites/atlas.json' },
      ],
    },
    {
      name: 'game',
      assets: [],
    },
  ],
};

let ready = null;

export function initAssets() {
  ready ??= Assets.init({
    manifest,
    basePath: 'assets/',
    preferences: { preferWorkers: true },
  });
  return ready;
}

/**
 * @param {string} name
 * @param {(progress:number)=>void} [onProgress] 0..1
 */
export async function loadBundle(name, onProgress) {
  await initAssets();

  const bundle = manifest.bundles.find((b) => b.name === name);

  // An empty bundle resolves instead of throwing, so the game runs before any
  // art has been added.
  if (!bundle || bundle.assets.length === 0) {
    onProgress?.(1);
    return {};
  }

  return Assets.loadBundle(name, onProgress);
}

export async function backgroundLoad(names) {
  await initAssets();
  return Assets.backgroundLoadBundle(names);
}
