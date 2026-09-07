import { Assets } from 'pixi.js';

/**
 * Asset manifest.
 *
 * Most of the game's art is still drawn at runtime (see game/textures.js), but
 * `background` and `cyclamenBall` are real PNGs — Phase 1 of the visual reskin
 * swaps the procedural sinus backdrop and the baked flower ball for hand-made
 * artwork. Both sit in `preload`, not `game`: boot-scene.js blocks on
 * `preload` and only then hands over to the menu, so by the time a scene
 * constructs a background Sprite or a Ball, `textures.js#applyImageAssets()`
 * has already had a chance to overwrite the matching TEX keys.
 *
 * THE FOUR FACE PNGs ARE STILL IN `public/assets/`, deliberately. They were
 * loaded here for the reactive face that used to sit in the middle of the
 * wireframe; that feature is parked for reuse elsewhere, not abandoned, so the
 * artwork stays on disk rather than being deleted and re-exported later. They
 * are simply no longer loaded — four PNGs is around 80KB of boot time to spend
 * on textures nothing draws.
 *
 *   { alias: 'face-sad', src: 'face-sad.png' }, ...and happy, surprised, sneeze
 *
 * `src` may be an array of formats (['x.webp', 'x.png']) and Pixi will choose
 * the best one the browser supports. Do not list a format that is not actually
 * on disk: the picker trusts the list and will happily 404.
 */
export const manifest = {
  bundles: [
    {
      name: 'preload',
      assets: [
        { alias: 'background', src: 'background.png' },
        { alias: 'cyclamenBall', src: 'cyclamen-ball.png' },
        { alias: 'transitionAsset', src: 'ASSET.png' },
        { alias: 'brickTier1', src: 'brick1.png' },
        { alias: 'brickTier2', src: 'brick2.png' },
        { alias: 'brickTier3', src: 'brick3.png' },
        { alias: 'loadingHeart', src: 'loading2.png' },
        { alias: 'loadingFlame', src: 'loading3.png' },
        { alias: 'siklement', src: 'siklement.png' },
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
