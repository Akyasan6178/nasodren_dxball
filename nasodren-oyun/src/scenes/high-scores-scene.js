import { Container } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { DESIGN, frameDrop } from '../game/config.js';
import { Button, makeText, panel } from '../game/ui.js';

/** Own best scores, kept purely in localStorage — see core/save.js. */
const LOCAL_LIMIT = 5;
/** Shared table, fetched fresh every visit — see core/leaderboard.js. */
const GLOBAL_LIMIT = 20;

/** Gold, for a global row this browser itself submitted. */
const OWN_ROW_COLOR = 0xffd700;

const SIDE_MARGIN = 24;
const COLUMN_GAP = 15;
const COLUMN_W = (DESIGN.width - 2 * SIDE_MARGIN - COLUMN_GAP) / 2;
const PANEL_Y = 106;
const PANEL_H = 300;
/** Inside a panel: heading, then the first row, then a fixed row pitch. */
const HEADING_Y = 14;
const FIRST_ROW_Y = 40;

/**
 * Split-column leaderboard: this browser's own best 5 on the left (always
 * available, purely local), the shared global top 20 on the right (fetched
 * from Supabase on every visit — see core/leaderboard.js).
 *
 * A GLOBAL FAILURE NEVER TOUCHES THE LOCAL COLUMN. The two columns are built
 * from two completely independent data sources and neither's failure can
 * throw — the local list reads straight from `ctx.save`, which never talks
 * to the network, and the global fetch is wrapped by Leaderboard so a
 * missing `.env`, an offline browser, an ad-blocker or a Supabase outage all
 * resolve to the same "could not reach it" message rather than an exception.
 */
export class HighScoresScene extends Scene {
  enter() {
    const { save, leaderboard, audio, input, sm } = this.ctx;

    this.content = new Container();
    this.content.y = frameDrop();
    this.view.addChild(this.content);

    const title = makeText('YÜKSEK SKORLAR', { size: 28, anchor: 0.5, title: true });
    title.position.set(DESIGN.width / 2, 46);
    this.content.addChild(title);

    const localX = SIDE_MARGIN;
    const globalX = SIDE_MARGIN + COLUMN_W + COLUMN_GAP;

    this._buildLocalColumn(localX, save.highScores);
    this._buildGlobalColumn(globalX);

    const back = new Button('GERİ', () => {
      audio.uiClick();
      this._goBack();
    }, { width: 220, accent: 0xff4d5a });
    back.position.set((DESIGN.width - 220) / 2, DESIGN.height - 62);
    this.backButton = back;
    back.setSelected(true);
    this.view.addChild(back);

    this._offKey = input.onKey((e) => {
      if (e.code === 'Escape' || e.code === 'Backspace') back.activate();
    });

    // Guards the async fetch below against writing into a torn-down scene —
    // see exit(). Nothing here can throw, but a resolved promise touching a
    // destroyed Container's children would.
    this._alive = true;

    leaderboard.fetchTop(GLOBAL_LIMIT).then((rows) => {
      if (!this._alive) return;
      this._renderGlobalRows(rows, save.myGlobalScoreIds);
    });
  }

  async _goBack() {
    const { MenuScene } = await import('./menu-scene.js');
    this.ctx.sm.change(MenuScene, {});
  }

  _buildLocalColumn(x, scores) {
    const box = panel(COLUMN_W, PANEL_H);
    box.position.set(x, PANEL_Y);
    this.content.addChild(box);

    const heading = makeText(`YEREL (İLK ${LOCAL_LIMIT})`, { size: 14, color: 0x35d0d8 });
    heading.position.set(x + 12, PANEL_Y + HEADING_Y);
    this.content.addChild(heading);

    if (!scores.length) {
      const empty = makeText('HENÜZ SKOR YOK', { size: 11, color: 0x6a7bb5 });
      empty.position.set(x + 12, PANEL_Y + FIRST_ROW_Y);
      this.content.addChild(empty);
      return;
    }

    scores.slice(0, LOCAL_LIMIT).forEach((entry, i) => {
      this._addRow(x, PANEL_Y + FIRST_ROW_Y + i * 24, COLUMN_W, {
        rank: i + 1,
        name: entry.name,
        score: entry.score,
        level: entry.level,
        size: 13,
        color: 0xffffff,
      });
    });
  }

  _buildGlobalColumn(x) {
    const box = panel(COLUMN_W, PANEL_H);
    box.position.set(x, PANEL_Y);
    this.content.addChild(box);

    const heading = makeText(`GLOBAL (İLK ${GLOBAL_LIMIT})`, { size: 14, color: 0x35d0d8 });
    heading.position.set(x + 12, PANEL_Y + HEADING_Y);
    this.content.addChild(heading);

    const status = makeText('Yükleniyor...', { size: 11, color: 0x6a7bb5 });
    status.position.set(x + 12, PANEL_Y + FIRST_ROW_Y);
    this.content.addChild(status);

    this._globalX = x;
    this._globalStatus = status;
    this._globalRows = new Container();
    this.content.addChild(this._globalRows);
  }

  /**
   * @param {Array<{id:string,player_name:string,score:number,level:number}>|null} rows
   *   `null` means the fetch failed outright (see Leaderboard.fetchTop) —
   *   distinct from an empty array, which means the table is genuinely
   *   empty and reads as "henüz skor yok" rather than a connection error.
   * @param {string[]} ownIds
   */
  _renderGlobalRows(rows, ownIds) {
    this._globalStatus.visible = false;

    if (rows === null) {
      this._globalStatus.visible = true;
      this._globalStatus.text = 'BAĞLANTI KURULAMADI';
      this._globalStatus.tint = 0xff4d5a;
      return;
    }

    if (!rows.length) {
      this._globalStatus.visible = true;
      this._globalStatus.text = 'HENÜZ SKOR YOK';
      return;
    }

    // 20 rows in the same panel height 5 get, so the row pitch and font both
    // come down — a global row still shows rank/name/score, level dropped
    // for room, matching the tighter density the count needs.
    const pitch = Math.min(24, (PANEL_H - FIRST_ROW_Y - 10) / rows.length);
    const rowSize = pitch >= 20 ? 13 : 10;

    rows.forEach((entry, i) => {
      const isOwn = ownIds.includes(entry.id);
      this._addRow(this._globalX, PANEL_Y + FIRST_ROW_Y + i * pitch, COLUMN_W, {
        rank: i + 1,
        name: entry.player_name,
        score: entry.score,
        size: rowSize,
        color: isOwn ? OWN_ROW_COLOR : 0xffffff,
        container: this._globalRows,
      });
    });
  }

  /**
   * One rank/name/score row, name wordWrapped rather than left to overflow —
   * see the Package 7 fix this mirrors: a hardcoded column position is only
   * ever correct for the one panel width it was tuned against, so every
   * offset here is relative to the panel's own `x` and `w`, and the name
   * column is capped to the room actually free between the rank and the
   * right-aligned score.
   */
  _addRow(x, y, w, { rank, name, score, size, color, container = this.content }) {
    const rankText = makeText(`${rank}.`, { size, color: 0x6a7bb5 });
    rankText.position.set(x + 12, y);
    container.addChild(rankText);

    const nameX = x + 34;
    const scoreX = x + w - 12;
    const nameW = scoreX - nameX - 8;

    const nameText = makeText(name, { size, color, wordWrap: true, wordWrapWidth: Math.max(20, nameW) });
    nameText.position.set(nameX, y);
    container.addChild(nameText);

    const scoreText = makeText(String(score).padStart(6, '0'), { size, color: 0xffd23f, anchor: [1, 0] });
    scoreText.position.set(scoreX, y);
    container.addChild(scoreText);
  }

  /**
   * The design box changed shape — see SceneManager.resize. Only the pieces
   * measured from the board's floor need moving; everything laid out from
   * the top is already where it belongs.
   */
  resize() {
    this.content.y = frameDrop();
    this.backButton.y = DESIGN.height - 62;
  }

  exit() {
    this._alive = false;
    this._offKey?.();
  }
}
