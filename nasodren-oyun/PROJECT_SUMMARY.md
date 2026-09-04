# Brickstorm — Technical Handover Summary

> A DX-Ball / Arkanoid-style brick breaker built on **PixiJS v8 + Vite**.
> This document is a complete technical snapshot of the project, intended as
> context for an AI assistant that will help brainstorm and write prompts for
> upcoming features.

---

## 1. Project at a Glance

| Item | Value |
| --- | --- |
| Package name | `brickstorm` (v1.0.0, `"type": "module"`) |
| Language | **Plain JavaScript (ESM)** — *not* TypeScript, despite what some notes say |
| Renderer | PixiJS **8.20.1**, `preference: 'webgpu'` with automatic WebGL fallback |
| Filters | `pixi-filters` **6.1.5** (`AdvancedBloomFilter`, `GlitchFilter`) |
| Bundler | Vite **5.4.21** (`base: './'`, `target: 'es2022'`, sourcemaps on) |
| Node used locally | v24.20.0 |
| Design resolution | Fixed **640 × 480** design space, uniformly scaled + letterboxed |
| Binary assets | **None.** All art, fonts and audio are generated at runtime |
| Build status | `vite build` succeeds — 876 modules, ~442 kB main chunk (137 kB gzip) |
| Levels | 13 (12 brick levels + 1 boss encounter) |
| Persistence | `localStorage` (settings, high scores, unlock high-water mark, mode) |

### Scripts

```bash
npm install
npm run dev        # vite, host:true (LAN address printed for phone testing), auto-open
npm run build      # -> dist/
npm run preview    # serve the built bundle
```

---

## 2. Directory Structure

```
nasodren-oyun/
├── index.html                  Shell + critical inline CSS + HTML overlays
├── vite.config.js
├── package.json
├── CLAUDE.md                   AI collaborator brief
├── README.md
├── public/assets/              Empty (placeholder for future spritesheets)
└── src/
    ├── main.js                 Boot: renderer -> textures -> services -> ticker
    ├── style.css               HTML-layer styling, rotate prompt, safe areas
    ├── core/
    │   ├── pixi-app.js         Application.init, WebGPU→WebGL, HiDPI, resize helper
    │   ├── viewport.js         Fixed-aspect scaled + masked root container
    │   ├── scene-manager.js    Scene base class + deferred scene swap
    │   ├── input.js            Mouse / keyboard / touch → one state object
    │   ├── audio-manager.js    Web Audio synthesis: all SFX + 4 sequenced tracks
    │   ├── assets.js           Pixi Assets manifest + bundle loader (bundles empty)
    │   ├── save.js             localStorage wrapper (defensive, degrades to memory)
    │   └── rng.js              xorshift32 *cosmetic* RNG, isolated from gameplay
    ├── game/
    │   ├── config.js           ★ Every tuning constant in the game
    │   ├── levels.js           Level layouts as character grids
    │   ├── textures.js         Runtime texture atlas baked from Graphics
    │   ├── powerup-icons.js    Baked icon atlas (one per power-up id)
    │   ├── paddle.js           Paddle state machine (width + mode + corruption)
    │   ├── ball.js             Direction/speed model, clamping, plasma mode
    │   ├── bricks.js           Brick types, damage rules, explosion chains, grid
    │   ├── powerups.js         Power-up table, Capsule sprite, stacking rules
    │   ├── projectile.js       GlitchPacket (boss projectile)
    │   ├── boss.js             O.M.E.G.A. Construct: polar-coordinate collision
    │   ├── corruption-meter.js Boss-only "System Corruption" readout
    │   ├── plasma-trail.js     Ribbon trail mesh for plasma balls
    │   ├── particles.js        Pooled particle system, 2 layers (plain + bloom)
    │   ├── hud.js              Score / lives / level / active power-up icons
    │   └── ui.js               BitmapFont install, Button, VerticalMenu, panel
    ├── scenes/
    │   ├── boot-scene.js       Loading screen driven by Assets progress
    │   ├── menu-scene.js       Main menu, Options, High Scores
    │   ├── level-select-scene.js  Unlock grid with live level thumbnails
    │   ├── game-scene.js       ★ Gameplay loop + state machine (1364 lines)
    │   └── results-scene.js    Game over / victory + high-score name entry
    └── ui/
        └── mode-toggle.js      HTML Classic/Turbo switcher (menu-only)
```

`★` = the two files that matter most for any gameplay work.

---

## 3. Application Bootstrap, Game Loop & Asset Management

### 3.1 Boot order (`src/main.js`)

Order is load-bearing: fonts and textures are *generated from the renderer*, so
they must come after `app.init()` and before any scene draws.

```js
async function boot() {
  const root = document.getElementById('game-root');

  const app = await createPixiApp({ parent: root, background: '#05050b' });
  console.info(`[brickstorm] renderer: ${getRendererName(app)}`);

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

  ctx.modeToggle = new ModeToggle(document.getElementById('mode-toggle'), {
    onChange: (config, id) => { ctx.mode = config; audio.uiClick(); },
  });
  ctx.mode = ctx.modeToggle.config;

  // Browsers require a user gesture before audio can start.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown',     () => audio.unlock(), { once: true });

  ctx.sm.change(BootScene, {});

  // v8: the ticker callback receives the Ticker itself. deltaMS is wall-clock ms;
  // clamping stops a stalled tab from teleporting the ball.
  app.ticker.add((ticker) => {
    ctx.sm.update(Math.min(ticker.deltaMS / 1000, MAX_DT));
  });

  revealWhenPainted(app);
  globalThis.__BRICKSTORM__ = ctx;   // debug handle
  return ctx;
}
```

**Single ticker.** There is exactly one `app.ticker.add` in the whole codebase.
Everything else is an `update(dt)` method called down the tree:
`SceneManager.update → Scene.update → paddle / balls / capsules / particles / boss`.
`dt` is in **seconds**, clamped to `MAX_DT = 1/30`.

**Anti-flash boot handoff:** `index.html` carries critical inline CSS that hides
every overlay and shows a `#boot` "Loading…" element. `revealWhenPainted()` waits
one ticker tick *and then* one `requestAnimationFrame` — by then frame 1 is on
screen — before adding `body.is-ready`, which fades the canvas in.

### 3.2 Renderer (`src/core/pixi-app.js`)

```js
const app = new Application();
await app.init({
  preference: 'webgpu',       // silently falls back to WebGL
  background,
  antialias,
  resizeTo: window,
  resolution: Math.min(window.devicePixelRatio || 1, 2),   // capped for phones
  autoDensity: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
});
parent.appendChild(app.canvas);      // v8: app.canvas, not app.view
app.stage.eventMode = 'static';
app.stage.hitArea = app.screen;
globalThis.__PIXI_APP__ = app;       // Pixi Devtools
```

Also exports `getRendererName(app)` and `onResize(app, handler)` (fires once
immediately so layout code has one path for "initial size" and "size changed").

### 3.3 Asset management (`src/core/assets.js`)

The Assets pipeline is **fully wired but the bundles are empty by design** — the
game generates its own art, so it boots instantly with zero binary payload.

```js
export const manifest = {
  bundles: [
    { name: 'preload', assets: [ /* { alias: 'atlas', src: 'sprites/atlas.json' } */ ] },
    { name: 'game',    assets: [] },
  ],
};

export async function loadBundle(name, onProgress) {
  await initAssets();                       // Assets.init({ manifest, basePath: 'assets/' })
  const bundle = manifest.bundles.find((b) => b.name === name);
  if (!bundle || bundle.assets.length === 0) { onProgress?.(1); return {}; }
  return Assets.loadBundle(name, onProgress);
}
```

**Runtime texture baking** (`src/game/textures.js`) is the real asset system:
every visual is drawn once with `Graphics`, baked with
`renderer.generateTexture({ target, resolution: 2, antialias: true })`, and from
then on the game only draws Sprites (which batch).

Baked keys: `brick0..brick7`, `brickSilver`, `brickGold`, `brickMetal`,
`brickExplosive`, `crack1`, `crack2`, `ball`, `glow`, `particle`, `laser`,
`spark`, `streak`, `shard0..shard3`; plus `ICONS[powerupId]` from
`powerup-icons.js` and the plasma trail texture.

Fonts: `BitmapFont.install` at boot (`BrickstormBody`, `BrickstormTitle`), with a
plain `Text` fallback if bitmap generation throws.

### 3.4 Scene system (`src/core/scene-manager.js`)

```js
export class Scene {
  constructor(ctx, params = {}) { this.ctx = ctx; this.params = params; this.view = new Container(); }
  enter() {} update(_dt) {} exit() {}
}

export class SceneManager {
  change(SceneClass, params = {}) { this._pending = { SceneClass, params }; }  // deferred!

  _applyPending() {
    if (!this._pending) return;
    const { SceneClass, params } = this._pending;
    this._pending = null;
    if (this.current) {
      this.current.exit();
      this.layer.removeChild(this.current.view);
      this.current.view.destroy({ children: true });
    }
    const scene = new SceneClass(this.ctx, params);
    this.current = scene;
    this.layer.addChild(scene.view);
    scene.enter();
    document.body.dataset.scene = SceneClass.sceneName ?? '';   // explicit static, minifier-safe
  }

  update(dt) { this._applyPending(); this.current?.update(dt); }
}
```

Swaps are **deferred to the next update**, so a scene can safely call `change()`
from inside its own `update()` or an event handler.
`document.body.dataset.scene` lets CSS reveal menu-only HTML overlays.

Flow: `BootScene → MenuScene → (LevelSelectScene) → GameScene → … → ResultsScene`.
`ResultsScene` and `MenuScene` are `await import()`-ed from `GameScene` to keep
them off the initial path.

---

## 4. Physics & Collision Detection

All physics runs in **design-space pixels (640×480)**. Viewport scale never
enters the maths.

### 4.1 The ball model (`src/game/ball.js`)

A ball stores a **normalised direction + a scalar speed**, never a raw velocity
vector — so power-ups can scale speed without ever corrupting the trajectory.

```js
launch(angle) {                 // angle: radians from straight up, + is right
  this.dx = Math.sin(angle);
  this.dy = -Math.cos(angle);
  this.stuckOffset = null;
  this.normalise();
}

normalise() {
  const len = Math.hypot(this.dx, this.dy) || 1;
  this.dx /= len; this.dy /= len;
  this.clampDirection();
}

/**
 * Keeps the trajectory inside a usable band (~7°..75° off vertical).
 * A near-horizontal ball ping-pongs between the side walls forever;
 * a perfectly vertical one drills one column and loops in the corridor it carved.
 */
clampDirection() {
  const minY = BALL.minVerticalFraction;    // 0.26
  const minX = BALL.minHorizontalFraction;  // 0.12

  const sx = this.dx === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(this.dx);
  const sy = this.dy < 0 ? -1 : 1;

  const dx = Math.max(Math.abs(this.dx), minX);
  const dy = Math.max(Math.abs(this.dy), minY);

  const len = Math.hypot(dx, dy) || 1;
  this.dx = (dx / len) * sx;
  this.dy = (dy / len) * sy;
}

step(dt) { this.x += this.dx * this.speed * dt; this.y += this.dy * this.speed * dt; }
```

Ball flags: `fire` (piercing — now **plasma-only**), `through` (passes breakable
bricks), `stuckOffset` (non-null while held by a sticky paddle), `isPlasmaMode`.

### 4.2 Substepped integration — the anti-tunnelling guarantee

```js
_moveBall(ball, dt) {
  const distance = ball.speed * dt;
  const steps = Math.max(1, Math.ceil(distance / 4));   // never more than ~4px per slice
  const sdt = dt / steps;

  for (let i = 0; i < steps; i++) {
    ball.step(sdt);

    this._collideWalls(ball);
    this._collideBricks(ball);
    if (this.boss) this._collideBoss(ball);   // same substep => can't tunnel a shield gap
    this._collidePaddle(ball);

    if (ball.y - ball.radius > DESIGN.height + 8) { ball.dead = true; return; }
  }
}
```

### 4.3 Walls

Field bounds come from `config.js`: `FIELD = { left: 8, right: 632, top: 44, bottom: 480 }`
(`WALL = 8`, `HUD_H = 36`). The bottom is open — that is the death plane.

```js
_collideWalls(ball) {
  const r = ball.radius;
  let hit = false;

  if (ball.x - r < FIELD.left)        { ball.x = FIELD.left + r;  ball.dx =  Math.abs(ball.dx); hit = true; }
  else if (ball.x + r > FIELD.right)  { ball.x = FIELD.right - r; ball.dx = -Math.abs(ball.dx); hit = true; }

  if (ball.y - r < FIELD.top)         { ball.y = FIELD.top + r;   ball.dy =  Math.abs(ball.dy); hit = true; }

  if (hit) {
    ball.clampDirection();
    this.ctx.audio.wallBounce();
    /* sparks + flash … */
  }
}
```

### 4.4 Paddle deflection — the signature "aimable" bounce

The outgoing angle is a function of **contact position**, not of the incoming
angle. Paddle motion at the moment of contact adds "english" on top.

```js
_collidePaddle(ball) {
  if (ball.dy <= 0 || ball.held) return;

  const p = this.paddle;
  const r = ball.radius;

  if (ball.y + r < p.top  || ball.y - r > p.bottom) return;   // AABB overlap test
  if (ball.x + r < p.left || ball.x - r > p.right)  return;

  ball.y = p.top - r - 0.5;

  if (p.mode === 'sticky') {                                   // Grab power-up
    ball.stuckOffset = clamp(ball.x - p.x, -p.halfWidth + 4, p.halfWidth - 4);
    this.ctx.audio.paddleBounce();
    return;
  }

  let t = (ball.x - p.x) / p.halfWidth;                        // -1 .. 1
  t = clamp(t + (p.vx / PADDLE.keySpeed) * BALL.paddleEnglish, -1, 1);

  ball.launch(t * BALL.maxPaddleAngle);                        // maxPaddleAngle = 62°
  this.ctx.audio.paddleBounce();
  /* sparks biased by t … */
}
```

`p.vx` is recomputed every frame in `Paddle.update` as `(this.x - this._lastX) / dt`.

### 4.5 Bricks — spatial-grid broadphase + shallowest-axis resolution

`BrickField.candidates()` yields only the grid cells overlapping the ball's AABB,
so collision cost is constant regardless of how full the wall is:

```js
*candidates(minX, minY, maxX, maxY) {
  const c0 = Math.max(0, Math.floor((minX - GRID.x) / GRID.cellW));
  const c1 = Math.min(this.cols - 1, Math.floor((maxX - GRID.x) / GRID.cellW));
  const r0 = Math.max(0, Math.floor((minY - GRID.y) / GRID.cellH));
  const r1 = Math.min(this.rows - 1, Math.floor((maxY - GRID.y) / GRID.cellH));

  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const b = this.grid[r]?.[c];
      if (b && !b.removed) yield b;
    }
}
```

Resolution picks the **shallower overlap axis** as the struck face:

```js
_collideBricks(ball) {
  const r = ball.radius;

  for (const brick of this.brickField.candidates(ball.x - r, ball.y - r, ball.x + r, ball.y + r)) {
    // Overlap depth on each axis; the shallower one is the face we struck.
    const ox = brick.bw / 2 + r - Math.abs(ball.x - brick.centerX);
    const oy = brick.bh / 2 + r - Math.abs(ball.y - brick.centerY);
    if (ox <= 0 || oy <= 0) continue;

    const result = this.brickField.damage(brick, 1, { fire: ball.fire });
    this._resolveBrickResult(result, brick, ball.x, ball.y);

    // Through-ball ignores anything it can break; fire ignores what it burned.
    const passes =
      (ball.through && brick.breakable && !result.blocked) ||
      (ball.fire && result.destroyed.length > 0);

    if (!passes) {
      if (ox < oy) {
        const sign = Math.sign(ball.x - brick.centerX) || 1;
        ball.x += sign * ox;
        ball.dx = Math.abs(ball.dx) * sign;
      } else {
        const sign = Math.sign(ball.y - brick.centerY) || 1;
        ball.y += sign * oy;
        ball.dy = Math.abs(ball.dy) * sign;
      }
      ball.clampDirection();
    }

    return;   // one brick per substep keeps reflections predictable in tight corners
  }
}
```

### 4.6 Capsules, lasers and boss projectiles

* **Capsule catch** is a plain AABB test against the paddle box, using constant
  half-extents (`CAPSULE.w/2`, `CAPSULE.h/2`), so the cosmetic pulse `scale`
  never changes how easy a capsule is to collect.
* **Lasers** are upward-moving sprites; each frame they query
  `brickField.candidates(bolt.x, bolt.y - LASER.h, bolt.x, bolt.y)` and stop on
  the first hit, or query `boss.damageAt(...)`. The boss core is immune to lasers.
* **GlitchPacket vs paddle** (`projectile.js`) is an exact circle-vs-AABB test:

```js
hitsPaddle(paddle) {
  const cx = Math.max(paddle.left, Math.min(paddle.right,  this.x));
  const cy = Math.max(paddle.top,  Math.min(paddle.bottom, this.y));
  const dx = this.x - cx, dy = this.y - cy;
  return dx * dx + dy * dy <= this.radius * this.radius;
}
```

### 4.7 Boss collision — polar coordinates (`src/game/boss.js`)

The O.M.E.G.A. Construct is a core wrapped in two counter-rotating rings of arc
segments. Segments are **not** approximated with boxes: a segment genuinely is an
arc bounded by two radii and two angles, so the test is `(distance, angle)`
against four bounds — exact, rotation-invariant, and **O(1) per ring** regardless
of segment count.

```js
collide(lx, ly, ballR) {                 // ring-local; lx/ly are relative to the boss centre
  const dist = Math.hypot(lx, ly);
  if (dist < 1e-4) return null;
  if (dist + ballR < this.inner || dist - ballR > this.outer) return null;

  const theta = Math.atan2(ly, lx);
  // A ball of radius r subtends this half-angle at the current distance, so widening
  // each segment by it is exactly equivalent to shrinking the ball to a point.
  const angularPad = ballR / dist;

  for (const seg of this.segments) {
    if (!seg.solid) continue;

    const delta = wrapAngle(theta - seg.angle);
    const limit = seg.halfSpan + angularPad;
    if (Math.abs(delta) > limit) continue;

    // Shallower penetration = the face actually struck (the brick rule, in polar form).
    const radialOverlap  = Math.min(this.outer + ballR - dist, dist - (this.inner - ballR));
    const angularOverlap = (limit - Math.abs(delta)) * dist;

    let nx, ny, push, tangential;
    if (radialOverlap <= angularOverlap) {            // curved face -> radial normal
      const sign = dist > this.radius ? 1 : -1;
      nx = (lx / dist) * sign;  ny = (ly / dist) * sign;
      push = radialOverlap;  tangential = false;
    } else {                                          // flat side of the arc -> tangential normal
      const sign = delta >= 0 ? 1 : -1;
      nx = (-ly / dist) * sign; ny = (lx / dist) * sign;
      push = angularOverlap; tangential = true;
    }
    return { seg, nx, ny, push, tangential };
  }
  return null;
}
```

Reflection uses asymmetric separation constants (`SEPARATION_RADIAL = 0.5`,
`SEPARATION_TANGENT = 1.75` — the tangential case needs more because angular
padding *grows* as the ball travels inward and would otherwise re-capture it):

```js
_bounce(ball, nx, ny, push, tangential) {
  const separation = tangential ? SEPARATION_TANGENT : SEPARATION_RADIAL;
  ball.x += nx * (push + separation);
  ball.y += ny * (push + separation);

  const dot = ball.dx * nx + ball.dy * ny;
  if (dot < 0) {                    // standard reflection: d - 2(d·n)n
    ball.dx -= 2 * dot * nx;
    ball.dy -= 2 * dot * ny;
    ball.clampDirection();
  }
}
```

"Shields breached" is a **spatial fact, not a state flag**: rings are tested
outermost-first, and the core is only reachable through a real gap. Core hits are
gated by `BOSS.core.iFrames = 0.18 s`, so one pass lands exactly one hit.
Ring geometry was set by measurement: usable gap ≈ `(2π/N)·(1 − coverage) − 2r/R`,
and the ball must clear **both** rings on the same pass — hence 5 and 7 segments
at `coverage 0.55` rather than the original 6/9 at 0.72, which left the core
effectively unreachable.

---

## 5. Game State Management

### 5.1 The run object

A single plain object is threaded through every `GameScene` instance, so score
and lives survive level transitions:

```js
this.run = params.run ?? {
  score: 0,
  lives: RUN.startingLives,            // 3  (game over at lives < 0, i.e. 4 attempts)
  nextExtraLife: SCORE.extraLifeEvery, // 20000
};
```

`addScore()` awards an extra life every 20 000 points (capped at `RUN.maxLives = 6`).

### 5.2 Scene state machine

`GameScene.state`: `'serve' → 'play' → ('lost' | 'clear')`, plus an independent
`this.paused` flag. Pause is triggered by `Esc` / `P` **or** by `visibilitychange`
(losing focus mid-rally would otherwise be a guaranteed death).

### 5.3 Level data — character grids (`src/game/levels.js`)

```
.      empty          1..8   standard brick, palette index (1 hit)
S      silver (2 hits)   G   gold (3 hits)
X      explosive (detonates its 3×3 neighbourhood, chains breadth-first)
M      metal (indestructible, ignored when counting the level cleared)
I      invisible (materialises on first contact, then behaves as standard)
```

```js
export const LEVELS = [
  { name: 'Warm Up', music: 0, rows: ['1111111111111','2222222222222','3333333333333'] },
  { name: 'Pillars', music: 0, rows: ['4.4.4.4.4.4.4','4.4.4.4.4.4.4','5555555555555','.S.S.S.S.S.S.'] },
  { name: 'Arrowhead', … },   { name: 'Vault', … },    { name: 'Ghosts', … },
  { name: 'Checkerboard', … },{ name: 'Fortress', … }, { name: 'Downpour', … },
  { name: 'Bunker', … },      { name: 'Nova', … },     { name: 'Gauntlet', … },
  { name: 'Brickstorm', … },
  { name: 'O.M.E.G.A.', music: 2, boss: true, rows: [] },   // no wall; boss defeat = clear
];
```

Every row string must be exactly `GRID.cols === 13` characters.
`GRID = { cols: 13, rows: 14, cellW: 48, cellH: 20, gap: 2 }` — 13 × 48 = 624 = the
exact playable width. `validateLevels(cols)` exists as a dev guard (see §8).

### 5.4 Brick array structures (`src/game/bricks.js`)

`BrickField extends Container` holds `this.grid` — a **row-major 2-D array of
`Brick | null`** — plus a `remaining` counter of *breakable* bricks:

```js
for (let r = 0; r < this.rows; r++) {
  const line = levelDef.rows[r];
  const rowArr = new Array(this.cols).fill(null);
  for (let c = 0; c < this.cols; c++) {
    const spec = this._specFor(line[c], r);
    if (!spec) continue;
    const brick = new Brick(spec, c, r);
    rowArr[c] = brick;
    this.addChild(brick);
    if (brick.breakable) this.remaining++;
  }
  this.grid.push(rowArr);
}
```

Each `Brick extends Sprite` caches its own AABB at construction (`bx, by, bw, bh`)
because collision reads it every substep. Removal sets `removed = true`,
`visible = false`, nulls the grid cell and decrements `remaining`;
`get cleared() { return this.remaining <= 0; }`.

Damage returns a structured result and resolves explosion chains breadth-first:

```js
damage(brick, amount = 1, { fire = false } = {}) {
  const out = { revealed: false, damaged: false, blocked: false, destroyed: [] };
  if (!brick || brick.removed) return out;

  if (brick.hidden) {                       // invisible brick spends hit #1 appearing…
    brick.reveal(); out.revealed = true;
    if (!fire) return out;                  // …unless the ball is on fire
  }
  if (!brick.breakable) { out.blocked = true; return out; }

  brick.hits -= fire ? Infinity : amount;
  if (brick.hits > 0) { brick.refreshDamage(); out.damaged = true; return out; }

  this._destroyChain(brick, out.destroyed);
  return out;
}

_destroyChain(start, acc) {                 // BFS so clusters cascade exactly once each
  const queue = [start];
  while (queue.length) {
    const brick = queue.shift();
    if (!brick || brick.removed || !brick.breakable) continue;
    this._remove(brick);
    acc.push(brick.snapshot());
    if (brick.kind !== 'explosive') continue;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const n = this.at(brick.col + dc, brick.row + dr);
        if (n && n.breakable) queue.push(n);
      }
  }
}
```

### 5.5 Power-ups (`src/game/powerups.js`)

Weighted drop table; `CAPSULE.dropChance = 0.27` per destroyed brick, capped at
**2 capsules per explosion chain** so a big cascade doesn't bury the player.

| id | letter | label | good | weight |
| --- | --- | --- | --- | --- |
| `big` | B | Wide Paddle | yes | 9 |
| `catch` | C | Grab (sticky) | yes | 8 |
| `laser` | L | Lasers | yes | 8 |
| `multi` | M | Triple Ball | yes | 8 |
| `slow` | S | Slow Ball | yes | 7 |
| `through` | T | Through Ball | yes | 5 |
| `points` | P | Bonus Points (+2500) | yes | 5 |
| `life` | E | Extra Life | yes | 3 |
| `warp` | W | Level Warp | yes | 2 |
| `small` | N | Narrow Paddle | no | 7 |
| `fast` | X | Fast Ball | no | 6 |
| `zap` | Z | Zap (inverted controls) | no | 4 |
| `death` | D | Kill Paddle | no | 4 |
| `fire` | F | Fireball | — | **0 — retired from the table** |
| `purge` | Q | Purge Protocol | yes | **0 — boss-only, dropped on core hit** |

**Timers.** All timed effects live in one `Map` on the scene,
`key → { t, onEnd, powerId }`. Slots deliberately collide so effects cancel rather
than stack, and re-collecting an active power-up refreshes its timer:

```js
setPaddleWidth(state, duration) {          // 'width' slot: Wide <-> Narrow
  this._endTimer('width', false);
  this.paddle.setWidthState(state);
  this._setTimer('width', duration, () => this.paddle.setWidthState('normal'),
                 state === 'big' ? 'big' : 'small');
}

setPaddleMode(mode, duration) {            // 'mode' slot: Grab <-> Lasers
  this._endTimer('mode', false);
  this.paddle.setMode(mode);
  this._setTimer('mode', duration, () => { this.paddle.setMode('normal'); this._releaseHeldBalls(); },
                 mode === 'sticky' ? 'catch' : 'laser');
}

setSpeedModifier(kind, duration) {         // 'speed' slot: Slow <-> Fast
  this._endTimer('speed', false);
  this.speedMod = kind === 'slow' ? BALL.slowFactor : BALL.fastFactor;
  this._setTimer('speed', duration, () => { this.speedMod = 1; }, kind);
}
```

`_updateTimers(dt)` decrements every entry, fires `onEnd`, then rebuilds the HUD
power-up icon row — which itself short-circuits unless the active *set* changed.
Default duration `RUN.powerDuration = 22 s` (Through Ball gets 0.7×, Zap 0.6×).

### 5.6 Ball speed model

```js
_currentSpeed() {
  const base = BALL.baseSpeed + this.levelIndex * BALL.speedPerLevel;   // 268 + 8/level
  const ramp = 1 + BALL.rampPerSecond * this.rallyTime;                 // +0.55 %/s of rally
  return Math.min(BALL.maxSpeed, base * ramp * this.speedMod);          // cap 540
}
```

Multi-ball: `MAX_BALLS = 8`; `splitBalls(2)` fans clones ±0.45 rad off the parent
heading.

### 5.7 Boss-encounter state (level 13 only)

* Scene fields: `this.boss` (`Boss`), `this.packets` (`GlitchPacket[]`),
  `this.corruption` (0–100), `this.corrupted` (bool), `this.plasmaActive`.
* **System Corruption meter**: each glitch packet that lands on the paddle adds
  `CORRUPTION.perHit = 16`; it bleeds off at `1.5`/s **only while below 100**. At
  100 the paddle is Corrupted — `speedScale 0.5` plus a `GlitchFilter` — and locks
  there. The only way back is the **Purge Protocol** capsule, which the boss drops
  on every landed core hit.
* Purge grants **plasma mode**: piercing (it reuses the existing `ball.fire` flag)
  + cyan tint + a bloomed ribbon trail, 10 s, on a **frame-driven** countdown (not
  `setTimeout`), so pausing or backgrounding the tab does not eat it.
* Boss phases escalate at 66 % and 33 % core health (`patrolScale`, `fireScale`,
  `shots`, `spinScale`). Shields regenerate 3 segments every 13 s — but never on
  top of a ball, which would trap it inside the ring.
* Corruption is fully reset on life loss, so the debuff never compounds the
  punishment of losing a ball.

### 5.8 Persistence (`src/core/save.js`)

`localStorage` key `brickstorm.save.v1`:

```js
{ settings: { sfx: true, music: true, control: 'both' },   // 'pointer' | 'keys' | 'both'
  highScores: [ { name, score, level } ],                  // top 10, sorted desc
  unlocked: 1 }                                            // high-water mark
```

Every read is wrapped in try/catch, so private-mode browsers degrade to an
in-memory session instead of throwing. The Classic/Turbo mode is stored
separately under `brickstorm.mode` by `ModeToggle`.

---

## 6. Input Handling & Viewport Responsiveness

### 6.1 Fixed-aspect viewport (`src/core/viewport.js`)

The renderer fills the window, but everything drawn lives inside a 640×480
container that is **uniformly** scaled and centred, with a mask so nothing bleeds
into the letterbox / pillarbox bars.

```js
layout() {
  const { width: sw, height: sh } = this.app.screen;
  const scale = Math.min(sw / this.width, sh / this.height);

  this.scale = scale;
  this.root.scale.set(scale);
  // Round the offset to avoid a half-pixel seam on the letterbox edges.
  this.root.x = Math.round((sw - this.width  * scale) / 2);
  this.root.y = Math.round((sh - this.height * scale) / 2);
}

/** Screen-space (CSS pixel) point -> design-space point. */
toWorld(gx, gy) {
  return { x: (gx - this.root.x) / this.scale, y: (gy - this.root.y) / this.scale };
}
```

Layer order inside `Viewport.root`: `backdrop → maskShape (also the mask) → stage`
(scenes mount into `stage`).

### 6.2 Unified input (`src/core/input.js`)

Mouse, keyboard and touch collapse into one small state object read once per
frame. `input.pointer.x` is the paddle's **control target in design space**, not
a raw cursor position — the two only coincide under a mouse.

**Desktop vs mobile is a deliberate behavioural split:**

```js
const down = (e) => {
  if (this._isUi(e)) return;                    // HTML overlays own their own gestures
  const p = this._screenPoint(e);
  if (!p) return;

  const world = this.viewport.toWorld(p.x, p.y);
  this.pointer.y = world.y;
  this.pointer.down = true;
  this.pointerActive = true;
  this._launchQueued = true;

  if (e.pointerType === 'mouse' || this.absoluteTouch) {
    this._anchor = null;
    this.pointer.x = world.x;                   // MOUSE: absolute — paddle goes where the cursor is
  } else {
    this._anchor = { screenX: p.x, targetX: this.pointer.x };  // TOUCH: anchor for relative drag
  }
  this._clampPointer();
};

const move = (e) => {
  if (this._isUi(e) && !this.pointer.down) return;
  const p = this._screenPoint(e);
  if (!p) return;

  const world = this.viewport.toWorld(p.x, p.y);
  this.pointer.y = world.y;
  this.pointerActive = true;

  if (e.pointerType === 'mouse' || this.absoluteTouch) {
    this.pointer.x = world.x;
  } else if (this._anchor && this.pointer.down) {
    // TOUCH: track the finger's DELTA, divided by the viewport scale so a centimetre
    // of finger travel is a centimetre of paddle travel at any board size.
    this.pointer.x = this._anchor.targetX + (p.x - this._anchor.screenX) / this.viewport.scale;
  }
  this._clampPointer();
};
```

Rationale: a fingertip lands wherever is comfortable and **covers** what is under
it, so snapping the paddle to the touch point would teleport it across the board
and then hide it under the finger. Drag-anywhere relative tracking avoids both.

Coordinate mapping is measured against the live bounding rect, so it stays exact
at any window size, device pixel ratio or browser zoom:

```js
_screenPoint(e) {
  const rect = this.canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: ((e.clientX - rect.left) / rect.width)  * this.canvas.clientWidth,
    y: ((e.clientY - rect.top)  / rect.height) * this.canvas.clientHeight,
  };
}
```

Other input details:

* Key sets — move: `←`/`→`, `A`/`D`; launch: `Space`, `↑`, `W`, `Enter`;
  pause: `Esc`, `P`. Arrow/Space keydowns are `preventDefault`-ed so the page
  never scrolls.
* `consumeLaunch()` / `consumePause()` are **edge-triggered** (true once per press).
* `pointerActive` flips false on keyboard movement, so the paddle does not snap
  back to a stale cursor position.
* `window.blur` clears held keys — no stuck paddle after tabbing away.
* Pointer events landing inside `#ui-layer` are ignored, so tapping an HTML
  control can't also drag the paddle.
* `input.firing` (`pointer.down || Space`) drives laser autofire
  (`LASER.cooldown = 0.22 s`, two bolts per volley).
* `Paddle.update` reads `save.settings.control` (`'both' | 'pointer' | 'keys'`)
  and a corruption/`speedScale` clamp caps per-frame travel, which is what makes
  the Corrupted debuff bite for mouse players too (a pointer would otherwise snap
  instantly and ignore a `keySpeed` nerf).

### 6.3 HTML layer & responsiveness (`index.html` + `src/style.css`)

* `<meta name="viewport" … maximum-scale=1.0, user-scalable=no, viewport-fit=cover>`.
* `body { position: fixed; inset: 0; overflow: hidden; touch-action: none;
  overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }` —
  `overflow: hidden` alone does not stop iOS Safari's rubber-band scroll once the
  dynamic toolbar gets involved; pinning the body does.
* `#ui-layer` uses `padding: max(14px, env(safe-area-inset-*))` for notches, and
  is `pointer-events: none` by default (controls inside opt back in).
* **Portrait rotate prompt** — touch devices only:

```css
@media (max-aspect-ratio: 3 / 4) and (pointer: coarse) {
  body.is-ready .rotate { position: fixed; inset: 0; z-index: 5; display: grid; … }
}
```

  The board is 4:3; on an upright phone the letterboxed playfield collapses to
  about a third of the screen, so the game asks for landscape rather than
  shipping a bad layout. There is **no portrait layout**.
* `@media (prefers-reduced-motion: reduce)` neutralises CSS animation; the same
  preference is read in `GameScene` to disable **screen shake** entirely.
* The Classic/Turbo switcher is an HTML `<button role="switch">` (real focus
  handling and screen-reader semantics for free, immune to letterbox scaling),
  revealed only by `body[data-scene="menu"]`.

---

## 7. Performance Design Notes

Worth knowing before proposing features, because several systems exist
specifically to hold 60 fps on a phone:

* **Everything is a Sprite.** Art is baked to GPU textures at boot, so the
  draw-call count stays flat with hundreds of bricks, particles and balls.
* **Pooled particles** (`particles.js`), hard ceiling `VFX.max = 900`, split into
  two layers with separate pools: `base` (unfiltered additive sparks/flashes) and
  `bloom` (debris, one `AdvancedBloomFilter` at half resolution, hidden when empty
  so the pass is skipped outright). Over-budget requests are simply dropped — a
  twelve-brick cascade costs the same as a single break.
* **One shared plasma layer** carries a single bloom pass for every plasma ball
  and ribbon, instead of one filter chain per ball (up to 8).
* **`GlitchFilter.slices` is never mutated after construction** — that would
  regenerate its displacement texture every frame. Only `seed` and the RGB channel
  offsets are touched, and they are plain uniforms.
* **Two RNG streams.** `core/rng.js` is an xorshift32 *cosmetic* source used by
  particles and screen shake, deliberately isolated from gameplay `Math.random()`
  so a visual change can never shift capsule drops or make a seeded replay diverge.
* **Screen shake offsets `gameContainer` only** — HUD, corruption meter and pause
  overlay stay outside it, and the simulation never sees the offset.
* **Frame-driven timers** everywhere (`_wait`, power-up timers, plasma countdown)
  instead of `setTimeout`, so pausing and backgrounding pause them too.
* **Audio is fully synthesised** (Web Audio oscillators + filtered noise, plus a
  lookahead step sequencer for 4 tracks: `menu`, `levelA/B/C`, `boss`) — no
  samples, no decode step, a few kB of code.

---

## 8. Current Status, Known Gaps & Bugs

### Status

Feature-complete and playable end to end: boot → menu (+ Options, High Scores) →
level select → 12 brick levels → boss encounter → results / high-score entry.
`npm run build` is clean; no runtime errors observed at boot.

### Known gaps and drift (verified against the source)

1. **Language mismatch in the project brief.** `CLAUDE.md` and the README describe
   a TypeScript project; the codebase is **plain JavaScript ESM**. There is no
   `tsconfig.json` and no `.ts` file anywhere.
2. **Classic/Turbo mode is a placeholder.** `ModeToggle` persists the selection to
   `ctx.mode`, but **no gameplay system reads it**. `config.js` documents the two
   intended hook points: multiply `GameScene._currentSpeed()` by
   `ctx.mode.ballSpeedScale`, and `CAPSULE.dropChance` by
   `ctx.mode.capsuleDropScale` inside `_resolveBrickResult`. *(Lowest-effort,
   highest-visibility feature currently on the table.)*
3. **Fireball is retired but still documented.** `FIREBALL` sits outside the
   `POWERUPS` array at weight 0; piercing is now plasma-exclusive. The README
   still lists Fireball as an obtainable power-up, and `setBallFlag('fire', …)` is
   consequently a dead branch — nothing calls it with `'fire'`.
4. **README path drift.** It documents `src/core/audio.js`; the actual file is
   `src/core/audio-manager.js` (a comment in `levels.js` repeats the stale path).
5. **`level.music` is vestigial.** Every level carries a `music: 0|1|2` field, but
   track selection actually comes from `MUSIC.levelBands` +
   `AudioManager.trackForLevel(levelIndex, isBoss)`. The field is never read.
6. **`validateLevels(cols)` is exported but never called.** The row-length guard
   it provides does not run anywhere — not in dev, not in a test.
7. **Mobile pause is unreachable.** The README says pause is `Esc` on mobile, but
   a phone has no `Esc` key and there is no on-screen pause control.
   Backgrounding the tab does auto-pause via `visibilitychange`, which is the only
   mobile route in today.
8. **High-score name entry is keyboard-only.** `ResultsScene` notes in a comment
   that a hidden `<input>` would be needed to open a mobile keyboard; on touch,
   Enter/tap just accepts the default name.
9. **`Input.absoluteTouch` is not exposed.** The option exists, but `main.js`
   constructs `new Input(app, viewport)` with no options and no Options-menu entry
   maps to it, so absolute-touch mode is unreachable at runtime.
10. **Assets bundles are empty**, so the boot progress bar effectively jumps
    straight to 1; `MIN_VISIBLE = 0.7 s` is the only thing keeping the loader on
    screen at all.
11. **Vite code-splitting warning (cosmetic):** `menu-scene.js` is statically
    imported by `boot-scene.js` *and* dynamically imported by three scenes, so it
    cannot be moved into its own chunk.
12. **No tests, no linter, no CI.** There is no test runner, ESLint config or type
    checking in the repo.
13. **Minor determinism hazard:** `Ball.clampDirection()` calls `Math.random()` in
    the `dx === 0` tie-break — gameplay-RNG consumption inside what is otherwise a
    pure geometry helper. Harmless today, but it would need fixing before seeded
    runs or replays.

### Natural next-feature directions

Wiring the Classic/Turbo modes (gap 2) · an on-screen mobile pause/HUD control
(gap 7) · touch-friendly high-score name entry (gap 8) · more levels or a level
editor (the character-grid format makes this cheap) · additional boss encounters
reusing the polar-collision machinery · a settings entry for absolute vs relative
touch (gap 9) · seeded runs and replays (needs gap 13 fixed first) ·
combo/multiplier scoring layered on the existing `audio.brickBreak(step)`
semitone escalation.
