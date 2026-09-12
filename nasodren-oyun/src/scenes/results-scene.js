import { Container, Graphics } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { DESIGN, frameDrop, RUN } from '../game/config.js';
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
    this.entering = ctx.save.isHighScore(params.score);
    // Prefilled from whatever this browser last submitted, so a returning
    // player is never asked to retype their name — they can still edit or
    // clear it before the local top-5 prompt accepts Enter.
    this.name = this.entering ? ctx.save.lastPlayerName.slice(0, NAME_MAX) : '';
    this.submitted = false;
    this._globalCommitted = false;
    this._t = 0;
  }

  enter() {
    const { won, score, level } = this.params;
    const { input, audio } = this.ctx;

    const dim = new Graphics().rect(0, 0, DESIGN.width, DESIGN.height).fill(0x07070f);
    this.dim = dim;
    this.view.addChild(dim);

    // The card is composed against the authored frame; this keeps it centred
    // on a portrait board. See frameDrop(). The blackout stays outside it —
    // that one covers the whole box, whatever shape the box is.
    this.content = new Container();
    this.content.y = frameDrop();
    this.view.addChild(this.content);

    const heading = makeText(won ? 'KAZANDIN' : 'OYUN BİTTİ', {
      size: 44,
      anchor: 0.5,
      title: true,
      color: won ? 0xffd23f : 0xff4d5a,
    });
    heading.position.set(DESIGN.width / 2, 96);
    this.content.addChild(heading);

    const box = panel(340, 108);
    box.position.set((DESIGN.width - 340) / 2, 140);
    this.content.addChild(box);

    const scoreLabel = makeText('SONUÇ SKORU', { size: 11, anchor: 0.5, color: 0x6a7bb5 });
    scoreLabel.position.set(DESIGN.width / 2, 156);
    this.content.addChild(scoreLabel);

    const scoreValue = makeText(String(score).padStart(6, '0'), {
      size: 34,
      anchor: 0.5,
      color: 0xffd23f,
      title: true,
    });
    scoreValue.position.set(DESIGN.width / 2, 190);
    this.content.addChild(scoreValue);

    const reached = makeText(
      won ? 'TÜM BÖLÜMLER TAMAMLANDI' : `ULAŞILAN BÖLÜM ${level}`,
      { size: 11, anchor: 0.5, color: 0x9fb0e0 },
    );
    reached.position.set(DESIGN.width / 2, 228);
    this.content.addChild(reached);

    if (this.entering) {
      const prompt = makeText('YENİ YÜKSEK SKOR - ADINI YAZ, KAYDETMEK İÇİN ENTER', {
        size: 11,
        anchor: 0.5,
        color: 0x86e05a,
      });
      prompt.position.set(DESIGN.width / 2, 268);
      this.content.addChild(prompt);

      this.nameText = makeText(`${this.name}_`, { size: 26, anchor: 0.5, color: 0xffffff });
      this.nameText.position.set(DESIGN.width / 2, 300);
      this.content.addChild(this.nameText);

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
    this.content.addChild(this.menu);

    if (showRevive) {
      this.menu.add(
        new Button(`CANLANDIR (${revivesLeft} KALDI)`, () => {
          audio.uiClick();
          this.ctx.sm.change(ReviveScene, { run, levelIndex: this.params.levelIndex });
        }, { accent: 0x86e05a }),
      );
    }

    this.menu.add(
      new Button('TEKRAR OYNA', () => {
        this._commit();
        audio.uiClick();
        this.ctx.sm.change(LevelSelectScene, {});
      }),
    );

    this.menu.add(
      new Button('ANA MENÜ', async () => {
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

  /**
   * The design box changed shape — see SceneManager.resize. Only the pieces
   * measured from the board's floor need moving; everything laid out from the
   * top is already where it belongs.
   */
  resize() {
    // A full-board blackout, so it has to be re-cut rather than repositioned.
    this.dim.clear().rect(0, 0, DESIGN.width, DESIGN.height).fill(0x07070f);
    this.content.y = frameDrop();
  }

  /**
   * Idempotent: safe to call from several exit paths (Enter, then whichever
   * menu button the player clicks next).
   *
   * Two separate writes, and the local one is unconditional on nothing the
   * global one needs: `ctx.save.addScore` only runs for an actual local
   * top-5 (see `this.entering`), but the global submit runs whenever there is
   * a name to put on it at all — a fresh one just typed, or one remembered
   * from a previous run — so a result that misses the local top-5 can still
   * land on the shared leaderboard without ever prompting for anything.
   */
  _commit() {
    if (this._committed) return;
    this._committed = true;

    if (this.entering) {
      this.submitted = true;
      this.ctx.save.addScore(this.name || 'PLAYER', this.params.score, this.params.level);
      this._refreshName();
    }

    const name = this.entering ? this.name || 'PLAYER' : this.ctx.save.lastPlayerName;
    if (name) {
      this.ctx.save.lastPlayerName = name;
      this._submitGlobal(name);
    }
  }

  /**
   * Fire-and-forget global submission — never awaited by a caller, because
   * the score screen must not delay leaving for a network round trip.
   * `Leaderboard.submitScore` already resolves to `null` instead of throwing
   * on absolutely any failure (offline, blocked, RLS, a malformed response),
   * so there is nothing here to catch; `ctx.save` and `ctx.leaderboard` are
   * shared services rather than scene-owned, so both stay valid even if the
   * player has already navigated away by the time this resolves.
   */
  async _submitGlobal(name) {
    const id = await this.ctx.leaderboard.submitScore(name, this.params.score, this.params.level);
    if (id) this.ctx.save.addGlobalScoreId(id);
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
