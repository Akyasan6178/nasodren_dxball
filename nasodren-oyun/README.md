# Brickstorm

A brick-breaker in the classic mid-90s style, built on PixiJS v8 + Vite.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle -> dist/
npm run preview    # serve the built bundle locally
```

`server.host` is enabled, so `npm run dev` also prints a LAN address you can
open on a phone to test touch controls against your dev machine.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move paddle | Mouse, or `A`/`D`, or arrow keys | Drag anywhere on screen |
| Launch / release ball | Click, `Space`, or `Enter` | Tap |
| Fire lasers (when equipped) | Hold click or `Space` | Hold anywhere |
| Pause | `Esc` or `P` | `Esc` |
| Menus | Arrows + `Enter`, or mouse | Tap |

## Architecture

```
src/
├── main.js                 Bootstraps renderer, services and the scene manager
├── core/
│   ├── pixi-app.js         Application.init, WebGPU -> WebGL fallback, HiDPI
│   ├── viewport.js         Fixed 640x480 stage, uniform scale, letterboxing
│   ├── scene-manager.js    Scene base class + deferred scene swapping
│   ├── input.js            Mouse / keyboard / touch collapsed into one state
│   ├── audio.js            Web Audio synthesis: all SFX + 3 looping tracks
│   ├── assets.js           Pixi Assets manifest and bundle loading
│   └── save.js             localStorage: settings, high scores, unlocks
├── game/
│   ├── config.js           Every tuning constant in the game
│   ├── levels.js           Level layouts as character grids
│   ├── textures.js         Runtime texture atlas baked from Graphics
│   ├── paddle.js           Paddle state machine (width + mode)
│   ├── ball.js             Direction/speed model and trajectory clamping
│   ├── bricks.js           Brick types, damage rules, explosion chains
│   ├── powerups.js         Power-up table, capsules, stacking rules
│   ├── particles.js        Pooled additive-blend particle system
│   ├── hud.js              Score / lives / level / active power-ups
│   └── ui.js               Bitmap fonts, buttons, keyboard menus
└── scenes/
    ├── boot-scene.js       Loading screen driven by Assets progress
    ├── menu-scene.js       Main menu, options, high scores
    ├── level-select-scene.js
    ├── game-scene.js       Gameplay loop and state machine
    └── results-scene.js    Game over / victory + high-score entry
```

### Rendering

`Application.init()` is called with `preference: 'webgpu'`, so Pixi uses WebGPU
where available and falls back to WebGL automatically. The chosen backend is
logged at boot.

All art is drawn once at startup with `Graphics` primitives and baked into GPU
textures via `renderer.generateTexture`. Everything afterwards is Sprites, which
batch — the draw-call count stays flat with hundreds of bricks, particles and
balls on screen. There are no binary assets and no filters in the hot path;
the glow comes from additive-blended sprites.

### Scaling

Gameplay runs in a fixed 640x480 design space. The viewport scales that box
uniformly to fit the window and centres it, producing letterbox or pillarbox
bars as needed. Collision maths never sees a window size.

### Physics

Paddle deflection is a function of *where* the ball lands relative to the
paddle's centre, not of the incoming angle — that's what lets you aim. Paddle
motion at the moment of contact adds english on top. Ball speed ramps with rally
duration and with level number, and is scaled by the Slow/Fast power-ups.

Motion is substepped to at most 4px per slice, so nothing tunnels through a
brick even at maximum speed on a stalled frame. The trajectory is clamped into a
7-75 degree band off vertical, which prevents both the horizontal wall-to-wall
stall and the vertical single-column drill.

### Bricks

Standard (1 hit), silver (2), gold (3), explosive (detonates its 3x3
neighbourhood, chains breadth-first), metal (indestructible, ignored when
counting a level as cleared), invisible (materialises on first contact).

### Power-ups

Wide Paddle, Grab, Lasers, Triple Ball, Slow Ball, Through Ball, Bonus Points,
Fireball, Extra Life, Level Warp, Narrow Paddle, Fast Ball, Zap, Kill Paddle.

Stacking: Wide/Narrow share one slot, Grab/Lasers share the paddle mode slot,
Slow/Fast share the ball-speed slot. Re-collecting an active power-up refreshes
its timer rather than stacking a second one.

### Audio

Everything is synthesised at runtime with the Web Audio API — oscillator and
filtered-noise envelopes for effects, and a lookahead step sequencer for the
three looping tracks (one per level group). Audio unlocks on the first user
gesture, as browsers require.

## Adding real assets

The Assets pipeline is wired but the bundles are empty. Drop spritesheets into
`public/assets/`, list them in `src/core/assets.js`, and overwrite the matching
keys in `src/game/textures.js` — nothing else needs to change, and the boot
screen will start showing real load progress.
