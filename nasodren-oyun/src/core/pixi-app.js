import { Application, RendererType } from 'pixi.js';

/**
 * Creates and initialises the PixiJS v8 Application.
 *
 * v8 notes:
 *  - `new Application()` is cheap and synchronous; all real work happens in the
 *    awaited `app.init()`. Nothing on `app` is usable before that resolves.
 *  - `preference: 'webgpu'` requests the WebGPU renderer and silently falls back
 *    to WebGL when the browser or GPU can't provide it. No manual probing needed.
 *  - The canvas element is `app.canvas` (v7's `app.view` is gone).
 */
export async function createPixiApp({
  parent = document.body,
  background = '#05050b',
  antialias = true,
  maxResolution = 2,
} = {}) {
  const app = new Application();

  await app.init({
    preference: 'webgpu',
    background,
    antialias,

    // Fill the browser window. Equivalent in practice to sizing against
    // #game-root (which is `position: fixed; inset: 0`), but explicit about the
    // intent and immune to anyone later giving that div padding or a border.
    resizeTo: window,

    // Render at device pixel ratio, capped so high-DPI phones don't burn fill
    // rate. autoDensity keeps the CSS size correct.
    resolution: Math.min(window.devicePixelRatio || 1, maxResolution),
    autoDensity: true,

    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });

  parent.appendChild(app.canvas);

  // Root-level pointer routing for Pixi's event system.
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  globalThis.__PIXI_APP__ = app; // for the Pixi Devtools extension

  return app;
}

/** Which backend actually got used, after fallback resolution. */
export function getRendererName(app) {
  return app.renderer.type === RendererType.WEBGPU ? 'WebGPU' : 'WebGL';
}

/**
 * Subscribe to renderer resizes. Fires the handler once immediately so layout
 * code has a single path for "initial size" and "size changed".
 */
export function onResize(app, handler) {
  const listener = () => handler(app.screen.width, app.screen.height);
  app.renderer.on('resize', listener);
  listener();
  return () => app.renderer.off('resize', listener);
}
