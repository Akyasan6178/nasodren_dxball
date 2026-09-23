import { Container, Graphics } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { DESIGN, frameDrop, RUN } from '../game/config.js';
import { Button, VerticalMenu, makeText, panel } from '../game/ui.js';
import { LevelSelectScene } from './level-select-scene.js';
import { ReviveScene } from './revive-scene.js';

const NAME_MAX = 8;
const VALID = /^[A-Z0-9 ]$/;

/** Design-space box the invisible `#name-input` overlays, centred on nameText. */
const NAME_FIELD_Y = 300;
const NAME_FIELD_W = 260;
const NAME_FIELD_H = 56;

/**
 * Game Over / Victory screen, with inline high-score entry.
 *
 * The name itself is always drawn as Pixi text with an on-screen blinking
 * caret — that art stays consistent whatever the input method. What drives
 * it is a real, invisible HTML `<input>` (`#name-input`, see index.html and
 * the `.name-input` rules in style.css) overlaid exactly on top of that text
 * and made the direct tap target: a canvas has nothing a mobile browser will
 * open its virtual keyboard for, but a genuinely focused DOM input is. On
 * desktop the same input is just given focus outright, so a physical
 * keyboard keeps working exactly as before.
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

      // Shown only once the player has tried to leave with nothing typed —
      // see _handleNameInputKeydown's Enter branch. Silent rejection would
      // just look like a stuck Enter key; this is the "why didn't that work"
      // answer.
      this.warning = makeText('BİR İSİM YAZMALISIN', { size: 10, anchor: 0.5, color: 0xff4d5a });
      this.warning.position.set(DESIGN.width / 2, 322);
      this.warning.visible = false;
      this.content.addChild(this.warning);

      this._setupNameInput();
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

    // EVERY BUTTON HERE IS GATED ON _isNameValid() WHEN IT EXISTS, CANLANDIR
    // INCLUDED — not just the two that leave for good. VerticalMenu (see
    // ui.js) runs its own independent `input.onKey` listener, entirely apart
    // from `#name-input`'s own keydown handling above, and on Enter it
    // activates whichever button is currently *selected* — index 0 by default,
    // which is
    // CANLANDIR whenever it exists, added first. Leaving it ungated meant an
    // empty-name Enter press was correctly refused by `_commit()` in this
    // scene's own handler and then, on the very same keypress, silently
    // waved through by VerticalMenu's — the player left with the field never
    // resolved, just via a different door. Disabling the button is the real
    // gate (Button.activate() no-ops while `enabled` is false, so the
    // callback body never runs at all); the check inside each callback below
    // is a second, cheap guarantee that nothing can slip through it.
    if (showRevive) {
      this.canlandirBtn = new Button(`CANLANDIR (${revivesLeft} KALDI)`, () => {
        if (!this._isNameValid()) return;
        audio.uiClick();
        this.ctx.sm.change(ReviveScene, { run, levelIndex: this.params.levelIndex });
      }, { accent: 0x86e05a });
      this.menu.add(this.canlandirBtn);
    }

    this.tekrarOynaBtn = new Button('TEKRAR OYNA', () => {
      if (!this._isNameValid()) return;
      this._commit();
      audio.uiClick();
      this.ctx.sm.change(LevelSelectScene, {});
    });
    this.menu.add(this.tekrarOynaBtn);

    this.anaMenuBtn = new Button('ANA MENÜ', async () => {
      if (!this._isNameValid()) return;
      this._commit();
      audio.uiClick();
      const { MenuScene } = await import('./menu-scene.js');
      this.ctx.sm.change(MenuScene, {});
    }, { accent: 0xff4d5a });
    this.menu.add(this.anaMenuBtn);

    this._updateValidity();
  }

  /**
   * Whether the screen may be left. Always true once no name is being
   * asked for at all (`!this.entering`); otherwise requires at least one
   * non-space character — a name of pure spaces is exactly as useless as an
   * empty one and both used to slip through as `'PLAYER'`.
   */
  _isNameValid() {
    return !this.entering || this.name.trim().length > 0;
  }

  /**
   * Keeps every valid/invalid-dependent visual in sync: all three menu
   * buttons that can exist here (see their construction above) and the name
   * field's own colour, which turns the same red as ANA MENÜ's danger
   * accent while empty so the requirement reads as a property of the field
   * itself and not just an inexplicably dead button.
   */
  _updateValidity() {
    const valid = this._isNameValid();
    this.canlandirBtn?.setEnabled(valid);
    this.tekrarOynaBtn?.setEnabled(valid);
    this.anaMenuBtn?.setEnabled(valid);
    if (this.nameText) this.nameText.tint = valid ? 0xffffff : 0xff4d5a;
  }

  /**
   * Wires up `#name-input` (see index.html/style.css) as the real source of
   * truth for the typed name, positioned invisibly over `this.nameText`.
   *
   * `pointerdown` forces an explicit `.focus()` on top of the input's own
   * native tap-to-focus — belt and suspenders against a mobile browser that
   * declines to focus it from the initial (non-gesture) layout call, since a
   * dropped focus here means a player who can never open their keyboard at
   * all. Listeners are stored on `this` so `exit()` can remove exactly these
   * instances; `input.onKey`/the window keydown stream (see core/input.js)
   * plays no part here any more — see `_handleNameInputKeydown`.
   */
  _setupNameInput() {
    const el = document.getElementById('name-input');
    if (!el) return;
    this.inputEl = el;

    el.value = this.name;
    el.maxLength = NAME_MAX;

    this._onNameInput = () => this._handleNameInput();
    this._onNameInputKeydown = (e) => this._handleNameInputKeydown(e);
    this._onNameInputPointerdown = () => el.focus({ preventScroll: true });

    el.addEventListener('input', this._onNameInput);
    el.addEventListener('keydown', this._onNameInputKeydown);
    el.addEventListener('pointerdown', this._onNameInputPointerdown);

    el.classList.add('is-active');
    this._layoutNameInput();
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* a mobile browser refusing an ungestured focus is expected, not fatal */
    }
  }

  /**
   * Design-space box -> screen CSS pixels, via the same viewport scale/offset
   * every other screen-space consumer in this codebase reads. Re-run on
   * `resize()` — see there — since rotating the device moves both.
   */
  _layoutNameInput() {
    if (!this.inputEl) return;
    const { viewport } = this.ctx;
    const rect = viewport.app.canvas.getBoundingClientRect();
    // nameText lives inside `this.content`, which is itself offset by
    // frameDrop() (see enter()/resize()) — the overlay has to add that same
    // offset or it drifts off the real text on any board shorter than the
    // authored frame.
    const left = DESIGN.width / 2 - NAME_FIELD_W / 2;
    const top = frameDrop() + NAME_FIELD_Y - NAME_FIELD_H / 2;

    this.inputEl.style.left = `${rect.left + viewport.root.x + left * viewport.scale}px`;
    this.inputEl.style.top = `${rect.top + viewport.root.y + top * viewport.scale}px`;
    this.inputEl.style.width = `${NAME_FIELD_W * viewport.scale}px`;
    this.inputEl.style.height = `${NAME_FIELD_H * viewport.scale}px`;
  }

  /**
   * Same character set as before (`VALID`, ASCII only — plain `.toUpperCase()`,
   * not a locale-aware one: a Turkish `.toLocaleUpperCase('tr')` would turn a
   * typed "i" into "İ", which `VALID` doesn't allow and would just delete).
   * Mobile keyboards default to lowercase, so this is what makes typing
   * "asya" land in the field as "ASYA" instead of being silently stripped to
   * nothing.
   */
  _handleNameInput() {
    if (this.submitted) return;

    const raw = this.inputEl.value.toUpperCase();
    let clean = '';
    for (const ch of raw) {
      if (VALID.test(ch) && clean.length < NAME_MAX) clean += ch;
    }

    this.name = clean;
    if (this.inputEl.value !== clean) this.inputEl.value = clean;
    if (this.warning) this.warning.visible = false;

    this._refreshName();
    this._updateValidity();
  }

  /**
   * `stopPropagation` on every key is what stops core/input.js's own window
   * `keydown` listener from also seeing this keystroke — without it, typing a
   * space into the name would hit that listener's SWALLOW set and have its
   * default prevented, which for a real focused `<input>` means the space
   * never reaches the field at all. That same stop also means
   * VerticalMenu's own `input.onKey` listener (see ui.js) never gets Enter
   * while this input is focused, so its half of the old dual-fire — actually
   * activating the selected button, not just committing — is replicated
   * explicitly below rather than lost.
   */
  _handleNameInputKeydown(e) {
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (this.submitted) return;

    if (!this._isNameValid()) {
      // Rejected — same rule _commit() itself enforces, surfaced here so an
      // empty Enter reads as "you need to type something" rather than a dead
      // key. Cleared by the next keystroke, above.
      if (this.warning) this.warning.visible = true;
      return;
    }
    this._commit();
    this.menu.buttons[this.menu.index]?.activate();
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
    this._layoutNameInput();
  }

  /**
   * Idempotent: safe to call from several exit paths (Enter, then whichever
   * menu button the player clicks next).
   *
   * REFUSES OUTRIGHT WHEN A NAME IS BEING ASKED FOR AND NONE WAS GIVEN. A
   * blank or pure-space name used to fall back to the literal string
   * `'PLAYER'`, both locally and on the shared leaderboard — every skipped
   * entry landed under the same identity, indistinguishable from every other
   * skipped entry. `_isNameValid()` is also what the two "leave for good"
   * buttons gate themselves on, so in practice this branch only matters for
   * the Enter key path — but it stays here too, unconditionally, rather than
   * trusting the UI gate alone to be the only thing standing between an
   * empty field and a saved score.
   *
   * Two separate writes otherwise, and the local one is unconditional on
   * nothing the global one needs: `ctx.save.addScore` only runs for an
   * actual local top-5 (see `this.entering`), but the global submit runs
   * whenever there is a name to put on it at all — a fresh one just typed,
   * or one remembered from a previous run — so a result that misses the
   * local top-5 can still land on the shared leaderboard without ever
   * prompting for anything.
   */
  _commit() {
    if (this._committed || !this._isNameValid()) return;
    this._committed = true;

    const trimmedName = this.name.trim();

    if (this.entering) {
      this.submitted = true;
      this.name = trimmedName;
      this.ctx.save.addScore(trimmedName, this.params.score, this.params.level);
      this._refreshName();
      // Field is resolved — close the keyboard and stop it eating taps meant
      // for the menu buttons underneath.
      this.inputEl?.blur();
      this.inputEl?.classList.remove('is-active');
    }

    const name = this.entering ? trimmedName : this.ctx.save.lastPlayerName;
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
    if (!this.inputEl) return;
    this.inputEl.removeEventListener('input', this._onNameInput);
    this.inputEl.removeEventListener('keydown', this._onNameInputKeydown);
    this.inputEl.removeEventListener('pointerdown', this._onNameInputPointerdown);
    this.inputEl.classList.remove('is-active');
    this.inputEl.blur();
    this.inputEl.value = '';
  }
}
