import { Container, Graphics } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { COLORS, DESIGN, RUN, SCORE } from '../game/config.js';
import { LEVELS } from '../game/levels.js';
import { Button, makeText, panel } from '../game/ui.js';
import { GameScene } from './game-scene.js';
import { TransitionScene } from './transition-scene.js';

const COLS = 4;
const CELL_W = 132;
const CELL_H = 74;
const GAP = 12;

/**
 * Grid-based level progression screen.
 *
 * Levels unlock as they're cleared; the unlock high-water mark is persisted, so
 * a returning player resumes where they left off. Each tile previews the level's
 * actual layout, rendered straight from its row data.
 */
export class LevelSelectScene extends Scene {
  enter() {
    const { save, audio, sm, input } = this.ctx;

    const title = makeText('SELECT LEVEL', { size: 30, anchor: 0.5, title: true });
    title.position.set(DESIGN.width / 2, 46);
    this.view.addChild(title);

    const hint = makeText(`UNLOCKED  ${save.unlocked} / ${LEVELS.length}`, {
      size: 11,
      anchor: 0.5,
      color: 0x6a7bb5,
    });
    hint.position.set(DESIGN.width / 2, 74);
    this.view.addChild(hint);

    const grid = new Container();
    const totalW = COLS * CELL_W + (COLS - 1) * GAP;
    grid.position.set((DESIGN.width - totalW) / 2, 100);
    this.view.addChild(grid);

    LEVELS.forEach((level, i) => {
      const unlocked = i < save.unlocked;
      const tile = this._buildTile(level, i, unlocked, () => {
        audio.unlock();
        audio.uiClick();
        sm.change(TransitionScene, {
          next: GameScene,
          params: {
            levelIndex: i,
            run: {
              score: 0,
              lives: RUN.startingLives,
              nextExtraLife: SCORE.extraLifeEvery,
              revivesUsed: 0,
              usedTips: [],
            },
          },
        });
      });

      tile.x = (i % COLS) * (CELL_W + GAP);
      tile.y = Math.floor(i / COLS) * (CELL_H + GAP);
      grid.addChild(tile);
    });

    const back = new Button('BACK TO MENU', async () => {
      audio.uiClick();
      const { MenuScene } = await import('./menu-scene.js');
      sm.change(MenuScene, {});
    }, { width: 220, accent: 0xff4d5a });
    back.position.set((DESIGN.width - 220) / 2, DESIGN.height - 62);
    back.setSelected(true);
    this.view.addChild(back);

    this._offKey = input.onKey((e) => {
      if (e.code === 'Escape' || e.code === 'Backspace') back.activate();
    });
  }

  _buildTile(level, index, unlocked, onSelect) {
    const tile = new Container();

    const bg = panel(CELL_W, CELL_H, {
      fill: unlocked ? 0x11122a : 0x0c0d1c,
      border: unlocked ? 0x35d0d8 : 0x2a2f4d,
    });
    tile.addChild(bg);

    const label = makeText(`${index + 1}`, { size: 15, color: unlocked ? 0xffd23f : 0x3d4468 });
    label.position.set(8, 6);
    tile.addChild(label);

    const name = makeText(level.name.toUpperCase(), {
      size: 9,
      color: unlocked ? 0x9fb0e0 : 0x3d4468,
    });
    name.position.set(8, CELL_H - 17);
    tile.addChild(name);

    // Layout thumbnail, drawn from the same rows the level itself uses.
    const preview = new Graphics();
    const pw = 72;
    const cellW = pw / 13;
    const cellH = 3.4;

    // A boss level has no rows, so draw the Construct instead of nothing.
    if (level.boss) {
      const cx = pw / 2;
      const cy = 11;
      const alpha = unlocked ? 0.95 : 0.22;
      preview.circle(cx, cy, 4).fill({ color: 0x7cf9ff, alpha });
      for (const [r, segs] of [[8, 6], [13, 9]]) {
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * Math.PI * 2;
          preview
            .arc(cx, cy, r, a0, a0 + (Math.PI * 2 * 0.72) / segs)
            .stroke({ width: 2, color: r === 8 ? 0x4d7bff : 0x35d0d8, alpha });
        }
      }
      preview.position.set(CELL_W - pw - 8, 10);
      tile.addChild(preview);
    }

    if (!level.boss) level.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;

        let color = 0x8a92a8;
        if (ch >= '1' && ch <= '8') color = COLORS[Number(ch) - 1];
        else if (ch === 'S') color = 0xc8ccd8;
        else if (ch === 'G') color = 0xf0b429;
        else if (ch === 'X') color = 0xd6202f;
        else if (ch === 'B') color = 0xe6ddc6;
        else if (ch === 'I') color = 0x4d7bff;

        preview
          .rect(c * cellW, r * cellH, cellW - 0.6, cellH - 0.6)
          .fill({ color, alpha: unlocked ? 0.95 : 0.22 });
      }
    });

    if (!level.boss) {
      preview.position.set(CELL_W - pw - 8, 10);
      tile.addChild(preview);
    }

    if (unlocked) {
      tile.eventMode = 'static';
      tile.cursor = 'pointer';
      tile.on('pointertap', onSelect);
      tile.on('pointerover', () => {
        bg.alpha = 0.75;
        this.ctx.audio.uiMove();
      });
      tile.on('pointerout', () => {
        bg.alpha = 1;
      });
    } else {
      const lock = makeText('LOCKED', { size: 10, color: 0x3d4468, anchor: [1, 0] });
      lock.position.set(CELL_W - 8, 6);
      tile.addChild(lock);
    }

    return tile;
  }

  exit() {
    this._offKey?.();
  }
}
