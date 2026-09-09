import { Container, Graphics, Sprite } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { COLORS, DESIGN, GRID, RUN, SCORE } from '../game/config.js';
import { LEVELS } from '../game/levels.js';
import { TEX } from '../game/textures.js';
import { Button, makeText, panel } from '../game/ui.js';
import { GameScene } from './game-scene.js';
import { TransitionScene } from './transition-scene.js';

/**
 * Thumbnail geometry. `cellH` is derived from `cellW` by the real grid's own
 * aspect (GRID.cellH/GRID.cellW), not a separate guess — that ratio is what
 * broke when the flat colour-rect preview was first written square-ish and
 * never revisited once bricks became photographic art with their own real
 * proportions to honour.
 */
const PREVIEW_W = 72;
const PREVIEW_CELL_W = PREVIEW_W / GRID.cols;
const PREVIEW_CELL_H = PREVIEW_CELL_W * (GRID.cellH / GRID.cellW);
const PREVIEW_H = PREVIEW_CELL_H * GRID.rows;

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

    const title = makeText('BÖLÜM SEÇ', { size: 30, anchor: 0.5, title: true });
    title.position.set(DESIGN.width / 2, 46);
    this.view.addChild(title);

    const hint = makeText(`AÇIK  ${save.unlocked} / ${LEVELS.length}`, {
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

    const back = new Button('MENÜYE DÖN', async () => {
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

    // Layout thumbnail, drawn from the same rows the level itself uses, and
    // positioned identically for every level so a boss tile's Construct lands
    // in the same box a brick tile's cells do.
    const previewX = CELL_W - PREVIEW_W - 8;
    const previewY = 10;
    const alpha = unlocked ? 0.95 : 0.22;

    // A sliver of the real background, so the thumbnail reads as "this
    // level's board" rather than as isolated dots on flat panel colour —
    // the same art every other screen already shows full-size. Stretched
    // non-uniformly to fill the box exactly, same as the full-screen Sprite
    // in GameScene; dimmed well below the dots so it stays scenery.
    const bgPreview = new Sprite(TEX.background);
    bgPreview.position.set(previewX, previewY);
    bgPreview.width = PREVIEW_W;
    bgPreview.height = PREVIEW_H;
    bgPreview.alpha = unlocked ? 0.45 : 0.12;
    tile.addChild(bgPreview);

    const preview = new Container();
    preview.position.set(previewX, previewY);
    tile.addChild(preview);

    // A boss level has no rows, so draw the Construct instead of nothing.
    if (level.boss) {
      const cx = PREVIEW_W / 2;
      const cy = PREVIEW_H / 2;
      const g = new Graphics();
      g.circle(cx, cy, 4).fill({ color: 0x7cf9ff, alpha });
      for (const [r, segs] of [[8, 6], [13, 9]]) {
        for (let i = 0; i < segs; i++) {
          const a0 = (i / segs) * Math.PI * 2;
          g.arc(cx, cy, r, a0, a0 + (Math.PI * 2 * 0.72) / segs)
            .stroke({ width: 2, color: r === 8 ? 0x4d7bff : 0x35d0d8, alpha });
        }
      }
      preview.addChild(g);
    }

    // Every breakable cell shows the actual tier-1 brick art (what it always
    // looks like at level start — mid-level tiers only ever appear via the
    // 60s buff, which a static thumbnail cannot show anyway), tinted by the
    // same palette colour `_specFor` would give it in the real level. Bone
    // gets its own texture, untinted, same as on the real board.
    if (!level.boss) level.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;

        const isBone = ch === 'B';
        const colorIndex = ch >= '1' && ch <= '8' ? Number(ch) - 1 : r % COLORS.length;

        const dot = new Sprite(isBone ? TEX.brickBone : TEX.brickTier1);
        dot.position.set(c * PREVIEW_CELL_W + 0.3, r * PREVIEW_CELL_H + 0.3);
        dot.width = PREVIEW_CELL_W - 0.6;
        dot.height = PREVIEW_CELL_H - 0.6;
        if (!isBone) dot.tint = COLORS[colorIndex];
        dot.alpha = alpha;
        preview.addChild(dot);
      }
    });

    if (unlocked) {
      tile.eventMode = 'static';
      tile.cursor = 'pointer';
      tile.on('pointerdown', (e) => {
        e.stopPropagation();
        e.nativeEvent?.stopPropagation();
        onSelect();
      });
      tile.on('pointerover', () => {
        bg.alpha = 0.75;
        this.ctx.audio.uiMove();
      });
      tile.on('pointerout', () => {
        bg.alpha = 1;
      });
    } else {
      const lock = makeText('KİLİTLİ', { size: 10, color: 0x3d4468, anchor: [1, 0] });
      lock.position.set(CELL_W - 8, 6);
      tile.addChild(lock);
    }

    return tile;
  }

  exit() {
    this._offKey?.();
  }
}
