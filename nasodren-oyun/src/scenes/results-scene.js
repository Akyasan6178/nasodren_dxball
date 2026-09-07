import { Graphics } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { DESIGN, RUN } from '../game/config.js';
import { Button, VerticalMenu, makeText, panel } from '../game/ui.js';
import { LevelSelectScene } from './level-select-scene.js';
import { ReviveScene } from './revive-scene.js';

const NAME_MAX = 8;
const VALID = /^[A-Z0-9 ]$/;

/**
 * Game Over / Victory screen, with inline high-score entry.
 *
 * Name entry is keyboard-driven and mirrors the arcade convention, with an
 * on-screen caret so touch users can see the field is live (mobile keyboards
 * open on tap via a hidden input in a fuller build; here Enter simply accepts
 * the default).
 */
export class ResultsScene extends Scene {
  constructor(ctx, params) {
    super(ctx, params);
    this.name = '';
    this.entering = ctx.save.isHighScore(params.score);
    this.submitted = false;
    this._t = 0;
  }

  enter() {
    const { won, score, level } = this.params;
    const { input, audio } = this.ctx;

    const dim = new Graphics().rect(0, 0, DESIGN.width, DESIGN.height).fill(0x07070f);
    this.view.addChild(dim);

    const heading = makeText(won ? 'YOU WIN' : 'GAME OVER', {
      size: 44,
      anchor: 0.5,
      title: true,
      color: won ? 0xffd23f : 0xff4d5a,
    });
    heading.position.set(DESIGN.width / 2, 96);
    this.view.addChild(heading);

    const box = panel(340, 108);
    box.position.set((DESIGN.width - 340) / 2, 140);
    this.view.addChild(box);

    const scoreLabel = makeText('FINAL SCORE', { size: 11, anchor: 0.5, color: 0x6a7bb5 });
    scoreLabel.position.set(DESIGN.width / 2, 156);
    this.view.addChild(scoreLabel);

    const scoreValue = makeText(String(score).padStart(6, '0'), {
      size: 34,
      anchor: 0.5,
      color: 0xffd23f,
      title: true,
    });
    scoreValue.position.set(DESIGN.width / 2, 190);
    this.view.addChild(scoreValue);

    const reached = makeText(
      won ? 'ALL LEVELS CLEARED' : `REACHED LEVEL ${level}`,
      { size: 11, anchor: 0.5, color: 0x9fb0e0 },
    );
    reached.position.set(DESIGN.width / 2, 228);
    this.view.addChild(reached);

    if (this.entering) {
      const prompt = makeText('NEW HIGH SCORE - TYPE YOUR NAME, ENTER TO SAVE', {
        size: 11,
        anchor: 0.5,
        color: 0x86e05a,
      });
      prompt.position.set(DESIGN.width / 2, 268);
      this.view.addChild(prompt);

      this.nameText = makeText('_', { size: 26, anchor: 0.5, color: 0xffffff });
      this.nameText.position.set(DESIGN.width / 2, 300);
      this.view.addChild(this.nameText);

      this._offKey = input.onKey((e) => this._onKey(e));
    }

    // A continue only ever makes sense after a loss — see ReviveScene, which
    // resumes this same run on the level it ended on.
    const run = this.params.run;
    const revivesLeft = !won && run ? RUN.maxRevives - run.revivesUsed : 0;
    const showRevive = revivesLeft > 0;

    // The extra row needs the menu a little tighter to stay clear of the
    // bottom edge when high-score name entry is also showing.
    this.menu = new VerticalMenu(input, audio, { spacing: showRevive ? 44 : 48 });
    this.menu.position.set((DESIGN.width - 260) / 2, this.entering ? 340 : 300);
    this.view.addChild(this.menu);

    if (showRevive) {
      this.menu.add(
        new Button(`REVIVE (${revivesLeft} LEFT)`, () => {
          audio.uiClick();
          this.ctx.sm.change(ReviveScene, { run, levelIndex: this.params.levelIndex });
        }, { accent: 0x86e05a }),
      );
    }

    this.menu.add(
      new Button('PLAY AGAIN', () => {
        this._commit();
        audio.uiClick();
        this.ctx.sm.change(LevelSelectScene, {});
      }),
    );

    this.menu.add(
      new Button('MAIN MENU', async () => {
        this._commit();
        audio.uiClick();
        const { MenuScene } = await import('./menu-scene.js');
        this.ctx.sm.change(MenuScene, {});
      }, { accent: 0xff4d5a }),
    );
  }

  _onKey(e) {
    if (this.submitted) return;

    if (e.code === 'Backspace') {
      this.name = this.name.slice(0, -1);
    } else if (e.code === 'Enter') {
      // Enter is also the menu's activate key; committing here is harmless
      // because _commit() is idempotent.
      this._commit();
      return;
    } else {
      const ch = e.key.toUpperCase();
      if (VALID.test(ch) && this.name.length < NAME_MAX) this.name += ch;
    }

    this._refreshName();
  }

  _refreshName() {
    if (!this.nameText) return;
    this.nameText.text = this.submitted ? this.name : `${this.name}_`;
  }

  /** Idempotent: safe to call from several exit paths. */
  _commit() {
    if (!this.entering || this.submitted) return;
    this.submitted = true;
    this.ctx.save.addScore(this.name || 'PLAYER', this.params.score, this.params.level);
    this._refreshName();
  }

  update(dt) {
    this._t += dt;
    if (this.nameText && !this.submitted) {
      // Blinking caret.
      this.nameText.text = `${this.name}${Math.floor(this._t * 2) % 2 ? '_' : ' '}`;
    }
  }

  exit() {
    this._offKey?.();
  }
}
