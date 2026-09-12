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
/**
 * Texture-source options for a photographic PNG that gets drawn small.
 *
 * background.png is 1920x1080 and every frame paints it into the 640x480
 * authored frame — cover-fitted at 0.44x on both axes, then cropped by the
 * narrower portrait board rather than squeezed — so the sprite is MINIFIED
 * before the viewport's own uniform scale is applied on top. A minified texture read with a single bilinear tap averages four source
 * texels where nine or sixteen actually contributed, and the detail that gets
 * dropped does not vanish quietly: it aliases into the shimmering, blocky
 * "crunch" the artwork was reported with. Nothing about the PNG is wrong.
 *
 * The fix is a mip chain, which Pixi does NOT build for you — v8 ships
 * `TextureSource.defaultOptions.autoGenerateMipmaps === false`.
 *
 *   scaleMode: 'linear'    sets magFilter, minFilter AND mipmapFilter in one
 *                          assignment, so sampling interpolates BETWEEN mip
 *                          levels (trilinear) instead of snapping to the
 *                          nearest one and popping as the window resizes.
 *                          Stated explicitly rather than left to the default,
 *                          because 'nearest' is the exact failure mode here.
 *
 *   autoGenerateMipmaps    the renderer sizes the chain and fills it during
 *                          the first upload. Do NOT call `updateMipmaps()`
 *                          afterwards — that exists for RenderTextures whose
 *                          contents change; a loaded image uploads once.
 *
 *   maxAnisotropy: 16      LOAD-BEARING HERE, because the minification is
 *                          anisotropic. An isotropic mip lookup picks a single
 *                          level for both axes, so at 0.33x by 0.44x it either
 *                          aliases horizontally or smears vertically — crunch
 *                          traded for mush. 16 is a request, not a promise:
 *                          WebGL clamps it to the driver's
 *                          MAX_TEXTURE_MAX_ANISOTROPY_EXT and WebGPU to the
 *                          adapter limit. Both degrade silently.
 *
 *   addressMode            the image is full-bleed and never tiles. Clamping
 *                          keeps the coarse mip levels — where one texel spans
 *                          a wide slice of the image — from wrapping the
 *                          opposite edge in as a colour fringe on the border.
 *
 * WHY THIS LIVES ON THE MANIFEST AND NOT ON THE SPRITE. The `loadTextures`
 * parser spreads `data` straight into the ImageSource constructor, so these
 * land before the texture has been anywhere near the GPU. That ordering is not
 * cosmetic: `mipLevelCount` is computed once, when the GPU texture is created,
 * from whatever `autoGenerateMipmaps` said at that instant. Set the flag after
 * the first upload and the chain is already one level deep and stays that way.
 *
 * WHO ELSE TAKES IT. Every PNG below that is minified in play, which now means
 * the ball and the three brick tiers as well:
 *
 *   cyclamen-ball.png  85x89 drawn at ~16 design px. Roughly 0.4x, and it
 *                      spins, so without a mip chain the petal edges crawl
 *                      frame to frame — the worst case there is, because a
 *                      rotating sprite re-samples the same texels differently
 *                      every frame and the aliasing shimmers instead of just
 *                      sitting there.
 *
 *   brick1/2/3.png     93x45 drawn into cells from 46x18 down to 18x17 now
 *                      that half and small variants also use the tier art
 *                      (see textureKeyFor). The small end is a 0.2x
 *                      minification — well past where one bilinear tap has
 *                      anything useful to say.
 *
 * loading1.png and siklement.png are the same shape of problem but are left alone:
 * each mip chain costs about a third again in texture memory, and those two are
 * full-screen stills on scenes with nothing else on them, where a soft edge
 * costs nothing and never moves.
 */
const SMOOTH_DOWNSCALE = {
  scaleMode: 'linear',
  autoGenerateMipmaps: true,
  maxAnisotropy: 16,
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
};

export const manifest = {
  bundles: [
    {
      name: 'preload',
      assets: [
        { alias: 'background', src: 'background.png', data: SMOOTH_DOWNSCALE },
        { alias: 'bgRed', src: 'bg-red.png', data: SMOOTH_DOWNSCALE },
        { alias: 'cyclamenBall', src: 'cyclamen-ball.png', data: SMOOTH_DOWNSCALE },
        { alias: 'loading1', src: 'loading1.png' },
        { alias: 'brickTier1', src: 'brick1.png', data: SMOOTH_DOWNSCALE },
        { alias: 'brickTier2', src: 'brick2.png', data: SMOOTH_DOWNSCALE },
        { alias: 'brickTier3', src: 'brick3.png', data: SMOOTH_DOWNSCALE },
        { alias: 'loading2', src: 'loading2.png' },
        { alias: 'loading3', src: 'loading3.png' },
        { alias: 'siklement', src: 'siklement.png' },
        { alias: 'heartIcon', src: 'heart.png', data: SMOOTH_DOWNSCALE },
        { alias: 'paddleSkin', src: 'platform.png', data: SMOOTH_DOWNSCALE },
        { alias: 'pauseIcon', src: 'pause.png', data: SMOOTH_DOWNSCALE },
        { alias: 'continueIcon', src: 'continue.png', data: SMOOTH_DOWNSCALE },
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
