import { Sprite } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { DESIGN, RUN } from '../game/config.js';
import { TEX } from '../game/textures.js';
import { Button, panel } from '../game/ui.js';
import { heavyText, TIPS } from './transition-scene.js';
import { cosmeticRandom } from '../core/rng.js';
import { GameScene } from './game-scene.js';

/** The centrepiece: huge, unmissable — this screen has exactly one job. */
const ART_SIZE = 280;
const ART_Y = 226;

const TIP_TITLE_Y = 396;
const TIP_BODY_Y = 416;
const TIP_WRAP_WIDTH = 560;

/** Compact top-right chip: the countdown while it runs, the button once it's spent. */
const CORNER_W = 108;
const CORNER_H = 38;
const CORNER_X = DESIGN.width - 20 - CORNER_W;
const CORNER_Y = 20;

/**
 * The hold behind a spent Revive (see the button on ResultsScene).
 *
 * A frame-driven countdown — `RUN.reviveCountdown` seconds — but no longer an
 * auto-hand-off: once it reaches zero the corner chip swaps from a countdown
 * to a "GEÇ" button, and only clicking that button hands `run.lives` back
 * (`RUN.reviveLives` — deliberately less than a fresh `startingLives`, so a
 * continue is a reprieve, not a full reset) and resumes `GameScene` on the
 * same `levelIndex` the player died on, same `run` object, same score — a
 * fresh brick layout for that level, exactly like choosing it again from
 * Level Select, but continuing the run rather than starting one.
 *
 * `run.usedTips` is what keeps the five cyclamen facts from repeating across
 * a single playthrough's revives: it lives on the `run` object threaded
 * through every GameScene, exactly like `score` and `lives` already do, so it
 * survives the level transitions in between.
 */
export class ReviveScene extends Scene {
  enter() {
    const { run, levelIndex } = this.params;
    this.run = run;
    this.levelIndex = levelIndex;
    this._elapsed = 0;
    this._ready = false;

    // Committed the moment this scene is entered, not when the player
    // actually leaves it — spending the continue is what got them here.
    this.run.revivesUsed++;

    this._buildArt();
    this._buildHeading();
    this._buildTip();
    this._buildCorner();
  }

  _buildArt() {
    const sprite = new Sprite(TEX.siklement);
    sprite.anchor.set(0.5);
    sprite.scale.set(ART_SIZE / sprite.texture.width);
    sprite.position.set(DESIGN.width / 2, ART_Y);
    this.view.addChild(sprite);
  }

  _buildHeading() {
    const heading = heavyText('CANLANDIR', { size: 24, color: 0x86e05a, align: 'center' });
    heading.anchor.set(0.5);
    heading.position.set(DESIGN.width / 2, 24);
    this.view.addChild(heading);

    const sub = heavyText(`DEVAM ${this.run.revivesUsed} / ${RUN.maxRevives}`, {
      size: 12,
      color: 0x9fb0e0,
      align: 'center',
    });
    sub.anchor.set(0.5);
    sub.position.set(DESIGN.width / 2, 48);
    this.view.addChild(sub);
  }

  /** Picks a tip this playthrough's revives have not shown yet, set below the art. */
  _buildTip() {
    const used = this.run.usedTips ?? (this.run.usedTips = []);
    const available = TIPS.map((_, i) => i).filter((i) => !used.includes(i));
    // RUN.maxRevives is always less than TIPS.length, so this never actually
    // runs dry; the fallback just means a repeat is better than no tip at all.
    const pool = available.length ? available : TIPS.map((_, i) => i);
    const idx = pool[Math.floor(cosmeticRandom() * pool.length)];
    used.push(idx);

    const title = heavyText('İPUCU:', { size: 14, color: 0x35d0d8, align: 'center' });
    title.anchor.set(0.5);
    title.position.set(DESIGN.width / 2, TIP_TITLE_Y);
    this.view.addChild(title);

    const body = heavyText(TIPS[idx], {
      size: 13,
      color: 0xffffff,
      align: 'center',
      wordWrapWidth: TIP_WRAP_WIDTH,
    });
    body.anchor.set(0.5, 0);
    body.position.set(DESIGN.width / 2, TIP_BODY_Y);
    this.view.addChild(body);
  }

  /** One corner chip, two faces: a countdown while running, a Skip button once spent. */
  _buildCorner() {
    this.timerBox = panel(CORNER_W, CORNER_H, { fill: 0x11122a, border: 0x35d0d8, alpha: 0.92 });
    this.timerBox.position.set(CORNER_X, CORNER_Y);
    this.view.addChild(this.timerBox);

    this.timerText = heavyText(String(RUN.reviveCountdown), { size: 18, color: 0xffffff, align: 'center' });
    this.timerText.anchor.set(0.5);
    this.timerText.position.set(CORNER_X + CORNER_W / 2, CORNER_Y + CORNER_H / 2);
    this.view.addChild(this.timerText);

    this.skipButton = new Button('GEÇ', () => {
      this.ctx.audio.uiClick();
      this.run.lives = RUN.reviveLives;
      this.ctx.sm.change(GameScene, { levelIndex: this.levelIndex, run: this.run });
    }, { width: CORNER_W, height: CORNER_H, size: 15, accent: 0x86e05a });
    this.skipButton.position.set(CORNER_X, CORNER_Y);
    this.skipButton.setSelected(true);
    this.skipButton.visible = false;
    this.view.addChild(this.skipButton);

    // No VerticalMenu here — it's a single standalone button — so Enter/Space
    // is wired directly rather than left mouse-only.
    this._offKey = this.ctx.input.onKey((e) => {
      if (this._ready && (e.code === 'Enter' || e.code === 'Space')) {
        this.skipButton.activate();
      }
    });
  }

  exit() {
    this._offKey?.();
  }

  update(dt) {
    this._elapsed += dt;

    if (!this._ready) {
      const remaining = Math.max(0, RUN.reviveCountdown - this._elapsed);
      this.timerText.text = String(Math.ceil(remaining));

      if (this._elapsed >= RUN.reviveCountdown) {
        this._ready = true;
        this.timerBox.visible = false;
        this.timerText.visible = false;
        this.skipButton.visible = true;
      }
    }
  }
}
