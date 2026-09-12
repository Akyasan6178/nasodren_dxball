import { Container, Sprite } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { BRICK_H, BRICK_W, COLORS, DESIGN, frameDrop } from '../game/config.js';
import { TEX } from '../game/textures.js';
import { Button, VerticalMenu, makeText, panel } from '../game/ui.js';
import { LevelSelectScene } from './level-select-scene.js';
import { GameScene } from './game-scene.js';
import { TransitionScene } from './transition-scene.js';

const CONTROL_LABELS = { both: 'FARE + TUŞLAR', pointer: 'FARE / DOKUNMATİK', keys: 'KLAVYE' };
const CONTROL_ORDER = ['both', 'pointer', 'keys'];

/**
 * Main menu, plus the Options and High Scores panels.
 *
 * Panels are swapped by rebuilding a single child container, so only one
 * VerticalMenu is ever listening for keys at a time.
 */
export class MenuScene extends Scene {
  /** Consumed by SceneManager to gate menu-only HTML overlays. */
  static sceneName = 'menu';

  enter() {
    this._buildBackdrop();

    // Everything composed against the authored frame goes in here, so one
    // container's y keeps the card centred on a portrait board. The brick rain
    // behind it and the hint below it are deliberately outside: the rain fills
    // the whole box and the hint is anchored to the floor.
    this.content = new Container();
    this.content.y = frameDrop();
    this.view.addChild(this.content);

    const title = makeText('BRICKSTORM', { size: 46, anchor: 0.5, title: true, color: 0x35d0d8 });
    title.position.set(DESIGN.width / 2, 92);
    this.content.addChild(title);
    this.title = title;

    const tagline = makeText('KLASİK TARZDA BİR TUĞLA KIRMA OYUNU', {
      size: 11,
      anchor: 0.5,
      color: 0x6a7bb5,
    });
    tagline.position.set(DESIGN.width / 2, 128);
    this.content.addChild(tagline);

    const hint = makeText('OKLAR / FARE İLE GEZİN  -  SEÇMEK İÇİN ENTER', {
      size: 10,
      anchor: 0.5,
      color: 0x4a5580,
    });
    hint.position.set(DESIGN.width / 2, DESIGN.height - 22);
    this.hint = hint;
    this.view.addChild(hint);

    this.panelLayer = new Container();
    this.content.addChild(this.panelLayer);

    this._showMain();
    this._t = 0;
  }

  /**
   * Brick rain: a slow, faint fall of tier bricks and bone behind everything
   * else, each looping back to the top once it drops off the bottom.
   *
   * Was `TEX[brick${i % COLORS.length}]` — a full-cell colour key that
   * stopped existing the moment the HP-tier art took over full cells (see
   * textureKeyFor in textures.js); every sprite here was silently rendering
   * `Texture.EMPTY`. Fixed by drawing from the same tier/bone atlas the real
   * board uses now.
   */
  _buildBackdrop() {
    const layer = new Container();
    layer.eventMode = 'none';
    layer.interactiveChildren = false;
    this.drifters = [];

    const TIER_TEX = [TEX.brickTier1, TEX.brickTier2, TEX.brickTier3];

    for (let i = 0; i < 26; i++) {
      const isBone = Math.random() < 0.18;
      const sprite = new Sprite(isBone ? TEX.brickBone : TIER_TEX[Math.floor(Math.random() * TIER_TEX.length)]);
      sprite.anchor.set(0.5);
      sprite.width = BRICK_W;
      sprite.height = BRICK_H;
      if (!isBone) sprite.tint = COLORS[Math.floor(Math.random() * COLORS.length)];
      sprite.rotation = (Math.random() - 0.5) * 0.3;
      sprite.x = Math.random() * DESIGN.width;
      sprite.y = Math.random() * DESIGN.height;
      sprite.alpha = 0.07 + Math.random() * 0.08;
      sprite.speed = 8 + Math.random() * 22;
      layer.addChild(sprite);
      this.drifters.push(sprite);
    }

    this.view.addChild(layer);
  }

  _swapPanel(build) {
    this.panelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    build();
  }

  _menu(y, spacing = 50) {
    const menu = new VerticalMenu(this.ctx.input, this.ctx.audio, { spacing });
    menu.position.set((DESIGN.width - 260) / 2, y);
    this.panelLayer.addChild(menu);
    return menu;
  }

  _showMain() {
    this._swapPanel(() => {
      const { audio, save, sm } = this.ctx;
      const menu = this._menu(168);

      menu.add(
        new Button('OYUNU BAŞLAT', () => {
          audio.unlock();
          audio.uiClick();
          sm.change(TransitionScene, { next: GameScene, params: { levelIndex: 0 } });
        }),
      );

      menu.add(
        new Button('BÖLÜM SEÇ', () => {
          audio.unlock();
          audio.uiClick();
          sm.change(LevelSelectScene, {});
        }),
      );

      menu.add(
        new Button('AYARLAR', () => {
          audio.unlock();
          audio.uiClick();
          this._showOptions();
        }),
      );

      menu.add(
        new Button('YÜKSEK SKORLAR', () => {
          audio.unlock();
          audio.uiClick();
          this._showScores();
        }),
      );

      const best = save.highScores[0];
      if (best) {
        const label = makeText(`EN İYİ  ${String(best.score).padStart(6, '0')}  ${best.name}`, {
          size: 12,
          anchor: 0.5,
          color: 0xffd23f,
        });
        label.position.set(DESIGN.width / 2, 392);
        this.panelLayer.addChild(label);
      }
    });
  }

  _showOptions() {
    this._swapPanel(() => {
      const { audio, save } = this.ctx;
      const settings = save.settings;

      const box = panel(360, 252);
      box.position.set((DESIGN.width - 360) / 2, 158);
      this.panelLayer.addChild(box);

      const heading = makeText('AYARLAR', { size: 18, anchor: 0.5 });
      heading.position.set(DESIGN.width / 2, 178);
      this.panelLayer.addChild(heading);

      const menu = this._menu(206, 46);

      const sfxBtn = new Button('', () => {
        audio.setSfxEnabled(!settings.sfx);
        save.flush();
        audio.uiClick();
        sfxBtn.setLabel(`SES EFEKTLERİ   ${settings.sfx ? 'AÇIK' : 'KAPALI'}`);
      });
      sfxBtn.setLabel(`SES EFEKTLERİ   ${settings.sfx ? 'AÇIK' : 'KAPALI'}`);
      menu.add(sfxBtn);

      const musicBtn = new Button('', () => {
        audio.unlock();
        audio.setMusicEnabled(!settings.music);
        save.flush();
        audio.uiClick();
        musicBtn.setLabel(`MÜZİK           ${settings.music ? 'AÇIK' : 'KAPALI'}`);
      });
      musicBtn.setLabel(`MÜZİK           ${settings.music ? 'AÇIK' : 'KAPALI'}`);
      menu.add(musicBtn);

      const controlBtn = new Button('', () => {
        const next = (CONTROL_ORDER.indexOf(settings.control) + 1) % CONTROL_ORDER.length;
        settings.control = CONTROL_ORDER[next];
        save.flush();
        audio.uiClick();
        controlBtn.setLabel(`KONTROL   ${CONTROL_LABELS[settings.control]}`);
      });
      controlBtn.setLabel(`KONTROL   ${CONTROL_LABELS[settings.control]}`);
      menu.add(controlBtn);

      menu.add(
        new Button('GERİ', () => {
          audio.uiClick();
          this._showMain();
        }, { accent: 0xff4d5a }),
      );
    });
  }

  _showScores() {
    this._swapPanel(() => {
      const { audio, save } = this.ctx;

      // Every column below is an offset from the box's own x, not an
      // absolute board coordinate — the board is not always 640 wide (see
      // DESIGN.width, which varies by device shape and by the 16:9
      // landscape box), so a hardcoded x is only ever correct for the one
      // width it was tuned against and spills the whole list out from
      // under the panel on any other.
      const boxW = 380;
      const boxX = (DESIGN.width - boxW) / 2;
      const box = panel(boxW, 250);
      box.position.set(boxX, 152);
      this.panelLayer.addChild(box);

      const heading = makeText('YÜKSEK SKORLAR', { size: 18, anchor: 0.5 });
      heading.position.set(DESIGN.width / 2, 172);
      this.panelLayer.addChild(heading);

      const scores = save.highScores;

      if (!scores.length) {
        const empty = makeText('HENÜZ SKOR YOK - İLK SKORU SEN YAP', {
          size: 12,
          anchor: 0.5,
          color: 0x6a7bb5,
        });
        empty.position.set(DESIGN.width / 2, 270);
        this.panelLayer.addChild(empty);
      } else {
        // Column x's, each an offset from boxX so the whole row tracks the
        // panel wherever it lands. `nameW` is a hard ceiling on the one
        // variable-length, player-entered field in this row — the name is
        // already capped at NAME_MAX (8) characters at entry (see
        // results-scene.js), but wrapping it here as well means a widened
        // column, a longer cap, or an unusually wide glyph can never push
        // the name into the score/level columns instead of just failing
        // quietly against a number that no longer applies.
        const rankX = 20;
        const nameX = 54;
        const scoreX = 322;
        const lvlX = 362;
        const nameW = scoreX - nameX - 8;

        scores.slice(0, 8).forEach((entry, i) => {
          const y = 200 + i * 22;
          const rank = makeText(`${i + 1}.`, { size: 13, color: 0x6a7bb5 });
          rank.position.set(boxX + rankX, y);

          const name = makeText(entry.name, {
            size: 13,
            color: 0xffffff,
            wordWrap: true,
            wordWrapWidth: nameW,
          });
          name.position.set(boxX + nameX, y);

          const score = makeText(String(entry.score).padStart(6, '0'), {
            size: 13,
            color: 0xffd23f,
            anchor: [1, 0],
          });
          score.position.set(boxX + scoreX, y);

          const lvl = makeText(`B${entry.level}`, { size: 11, color: 0x4a5580, anchor: [1, 0] });
          lvl.position.set(boxX + lvlX, y + 1);

          this.panelLayer.addChild(rank, name, score, lvl);
        });
      }

      const menu = this._menu(400, 46);
      menu.add(
        new Button('GERİ', () => {
          audio.uiClick();
          this._showMain();
        }, { accent: 0xff4d5a }),
      );
    });
  }

  enterMusic() {
    // playMusic is a no-op when the track is already current, and the request
    // is remembered if audio has not been unlocked yet — so the menu theme
    // starts on the first gesture without any polling.
    this.ctx.audio.playMusic('menu');
  }

  /**
   * The design box changed shape — see SceneManager.resize. Only the pieces
   * measured from the board's floor need moving; everything laid out from the
   * top is already where it belongs.
   */
  resize() {
    this.content.y = frameDrop();
    this.hint.y = DESIGN.height - 22;
  }

  update(dt) {
    this._t += dt;
    this.ctx.audio.playMusic('menu');

    this.title.scale.set(1 + Math.sin(this._t * 2) * 0.012);

    for (const sprite of this.drifters) {
      sprite.y += sprite.speed * dt;
      if (sprite.y > DESIGN.height) {
        sprite.y = -20;
        sprite.x = Math.random() * DESIGN.width;
      }
    }
  }
}
