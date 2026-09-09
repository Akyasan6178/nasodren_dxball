import './style.css';
import { createPixiApp, getRendererName } from './core/pixi-app.js';
import { Viewport } from './core/viewport.js';
import { Input } from './core/input.js';
import { AudioManager } from './core/audio-manager.js';
import { Save } from './core/save.js';
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

  const app = await createPixiApp({ parent: root, background: '#05050b' });
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

  /** Shared service bag handed to every scene. */
  const ctx = { app, viewport, input, audio, save, sm: null, mode: null, modeToggle: null };
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
