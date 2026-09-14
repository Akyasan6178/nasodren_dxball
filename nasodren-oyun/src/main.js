import './style.css';
import { createPixiApp, getRendererName } from './core/pixi-app.js';
import { Viewport } from './core/viewport.js';
import { Input } from './core/input.js';
import { AudioManager } from './core/audio-manager.js';
import { Save } from './core/save.js';
import { Leaderboard } from './core/leaderboard.js';
import { SceneManager } from './core/scene-manager.js';
import { DESIGN, MAX_DT } from './game/config.js';
import { buildTextures } from './game/textures.js';
import { buildPowerUpIcons } from './game/powerup-icons.js';
import { buildTrailTexture } from './game/plasma-trail.js';
import { installFonts } from './game/ui.js';
import { ModeToggle } from './ui/mode-toggle.js';
import { BootScene } from './scenes/boot-scene.js';

async function boot() {
  const root = document.getElementById('game-root');

  // Run concurrently with renderer init — the two are independent, and both
  // take real time (WebGPU/WebGL setup, a font-file download).
  const [app] = await Promise.all([
    createPixiApp({ parent: root, background: '#05050b' }),
    preloadFonts(),
  ]);
  console.info(`[brickstorm] renderer: ${getRendererName(app)}`);

  // Fonts and art are generated from the renderer, so they must come after init
  // and before any scene tries to draw.
  installFonts();
  buildTextures(app.renderer);
  buildPowerUpIcons(app.renderer);
  buildTrailTexture(app.renderer);

  const viewport = new Viewport(app, DESIGN.width, DESIGN.height);
  const save = new Save();
  const audio = new AudioManager(save.settings);
  const input = new Input(app, viewport);
  const leaderboard = new Leaderboard();

  /** Shared service bag handed to every scene. */
  const ctx = { app, viewport, input, audio, save, leaderboard, sm: null, mode: null, modeToggle: null };
  ctx.sm = new SceneManager(ctx, viewport.stage);

  // Rotating a phone, or dragging a desktop window into a taller shape, moves
  // the board's floor. Wired after the SceneManager exists because Viewport's
  // constructor has already run one layout by this point — the one that gave
  // this process its design box in the first place, back when there was
  // nothing built to tell about it.
  viewport.onLayout = ({ boxChanged }) => {
    if (boxChanged) ctx.sm.resize();
  };

  // Main-menu mode switcher. Stores the selection on the context; no gameplay
  // system reads it yet.
  ctx.modeToggle = new ModeToggle(document.getElementById('mode-toggle'), {
    onChange: (config, id) => {
      ctx.mode = config;
      audio.uiClick();
      console.info(`[brickstorm] mode -> ${id}`, config);
    },
  });
  ctx.mode = ctx.modeToggle.config;

  // Browsers require a user gesture before audio can start.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  ctx.sm.change(BootScene, {});

  // In v8 the ticker callback receives the Ticker itself. deltaMS is wall-clock
  // milliseconds; clamping it stops a stalled tab from teleporting the ball.
  app.ticker.add((ticker) => {
    ctx.sm.update(Math.min(ticker.deltaMS / 1000, MAX_DT));
  });

  revealWhenPainted(app);

  globalThis.__BRICKSTORM__ = ctx;
  return ctx;
}

/**
 * Waits for Oxanium (see the @font-face in style.css) to actually be usable
 * before any text gets drawn with it.
 *
 * WHY THIS HAS TO BLOCK BOOT, RATHER THAN JUST DECLARING THE @font-face AND
 * MOVING ON. `installFonts()` bakes PixiJS's bitmap font atlases by rendering
 * text to a hidden canvas ONCE, at startup — it is a screenshot of whatever
 * font the browser had ready at that exact moment, not a live reference that
 * updates when Oxanium finishes downloading a moment later. Skip this wait
 * and the bake would silently keep the CSS stack's fallback (system
 * monospace) baked in for the rest of the session, however long the real
 * font took to arrive.
 *
 * Requesting two weights covers the two BitmapFont installs in ui.js
 * (`normal`/`bold`) — one physical variable-font file backs both, so this
 * is two cheap loads of an already-fetched resource, not two downloads.
 *
 * NEVER FATAL. A blocked or 404'd font file must not hang boot forever —
 * `document.fonts.load` rejects rather than hanging on a real failure, and
 * the catch here means that rejection just falls back to style.css's own
 * `font-family` stack (Oxanium, then the system monospace it replaced).
 */
async function preloadFonts() {
  try {
    await Promise.all([
      document.fonts.load('400 16px Oxanium'),
      document.fonts.load('700 16px Oxanium'),
    ]);
  } catch (err) {
    console.warn('[brickstorm] Oxanium failed to preload — falling back to the system stack.', err);
  }
}

/**
 * Hands the screen over from the HTML loading text to the canvas.
 *
 * `app.init()` resolving only means the renderer exists — it has not drawn
 * anything yet, so revealing here would show an empty canvas for a frame or
 * two. The ticker callback runs before Pixi's own render call (which sits at
 * LOW priority), so we wait one tick and then one animation frame: by the time
 * that fires, frame one is on screen and the reveal is genuinely seamless.
 */
function revealWhenPainted(app) {
  app.ticker.addOnce(() => {
    requestAnimationFrame(() => {
      document.getElementById('boot')?.setAttribute('hidden', '');
      document.body.classList.add('is-ready');
    });
  });
}

boot().catch((error) => {
  console.error(error);
  const el = document.getElementById('boot');
  if (el) {
    el.removeAttribute('hidden');
    el.textContent = 'This browser could not start the game renderer.';
  }
});
