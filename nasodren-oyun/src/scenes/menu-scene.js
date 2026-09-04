import { Container, Sprite } from 'pixi.js';
import { Scene } from '../core/scene-manager.js';
import { COLORS, DESIGN } from '../game/config.js';
import { TEX } from '../game/textures.js';
import { Button, VerticalMenu, makeText, panel } from '../game/ui.js';
import { LevelSelectScene } from './level-select-scene.js';
import { GameScene } from './game-scene.js';

const CONTROL_LABELS = { both: 'MOUSE + KEYS', pointer: 'MOUSE / TOUCH', keys: 'KEYBOARD' };
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

    const title = makeText('BRICKSTORM', { size: 46, anchor: 0.5, title: true, color: 0x35d0d8 });
    title.position.set(DESIGN.width / 2, 92);
    this.view.addChild(title);
    this.title = title;

    const tagline = makeText('A BRICK-BREAKER IN THE CLASSIC STYLE', {
      size: 11,
      anchor: 0.5,
      color: 0x6a7bb5,
    });
    tagline.position.set(DESIGN.width / 2, 128);
    this.view.addChild(tagline);

    const hint = makeText('ARROWS / MOUSE TO NAVIGATE  -  ENTER TO SELECT', {
      size: 10,
      anchor: 0.5,
      color: 0x4a5580,
    });
    hint.position.set(DESIGN.width / 2, DESIGN.height - 22);
    this.view.addChild(hint);

    this.panelLayer = new Container();
    this.view.addChild(this.panelLayer);

    this._showMain();
    this._t = 0;
  }

  /** Slowly drifting bricks — cheap motion that sets the tone. */
  _buildBackdrop() {
    const layer = new Container();
    layer.eventMode = 'none';
    layer.interactiveChildren = false;
    this.drifters = [];

    for (let i = 0; i < 26; i++) {
      const sprite = new Sprite(TEX[`brick${i % COLORS.length}`]);
      sprite.x = Math.random() * DESIGN.width;
      sprite.y = Math.random() * DESIGN.height;
      sprite.alpha = 0.07 + Math.random() * 0.06;
      sprite.speed = 8 + Math.random() * 18;
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
        new Button('START GAME', () => {
          audio.unlock();
          audio.uiClick();
          sm.change(GameScene, { levelIndex: 0 });
        }),
      );

      menu.add(
        new Button('LEVEL SELECT', () => {
          audio.unlock();
          audio.uiClick();
          sm.change(LevelSelectScene, {});
        }),
      );

      menu.add(
        new Button('OPTIONS', () => {
          audio.unlock();
          audio.uiClick();
          this._showOptions();
        }),
      );

      menu.add(
        new Button('HIGH SCORES', () => {
          audio.unlock();
          audio.uiClick();
          this._showScores();
        }),
      );

      const best = save.highScores[0];
      if (best) {
        const label = makeText(`BEST  ${String(best.score).padStart(6, '0')}  ${best.name}`, {
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

      const heading = makeText('OPTIONS', { size: 18, anchor: 0.5 });
      heading.position.set(DESIGN.width / 2, 178);
      this.panelLayer.addChild(heading);

      const menu = this._menu(206, 46);

      const sfxBtn = new Button('', () => {
        audio.setSfxEnabled(!settings.sfx);
        save.flush();
        audio.uiClick();
        sfxBtn.setLabel(`SOUND EFFECTS   ${settings.sfx ? 'ON' : 'OFF'}`);
      });
      sfxBtn.setLabel(`SOUND EFFECTS   ${settings.sfx ? 'ON' : 'OFF'}`);
      menu.add(sfxBtn);

      const musicBtn = new Button('', () => {
        audio.unlock();
        audio.setMusicEnabled(!settings.music);
        save.flush();
        audio.uiClick();
        musicBtn.setLabel(`MUSIC           ${settings.music ? 'ON' : 'OFF'}`);
      });
      musicBtn.setLabel(`MUSIC           ${settings.music ? 'ON' : 'OFF'}`);
      menu.add(musicBtn);

      const controlBtn = new Button('', () => {
        const next = (CONTROL_ORDER.indexOf(settings.control) + 1) % CONTROL_ORDER.length;
        settings.control = CONTROL_ORDER[next];
        save.flush();
        audio.uiClick();
        controlBtn.setLabel(`CONTROL   ${CONTROL_LABELS[settings.control]}`);
      });
      controlBtn.setLabel(`CONTROL   ${CONTROL_LABELS[settings.control]}`);
      menu.add(controlBtn);

      menu.add(
        new Button('BACK', () => {
          audio.uiClick();
          this._showMain();
        }, { accent: 0xff4d5a }),
      );
    });
  }

  _showScores() {
    this._swapPanel(() => {
      const { audio, save } = this.ctx;

      const box = panel(380, 250);
      box.position.set((DESIGN.width - 380) / 2, 152);
      this.panelLayer.addChild(box);

      const heading = makeText('HIGH SCORES', { size: 18, anchor: 0.5 });
      heading.position.set(DESIGN.width / 2, 172);
      this.panelLayer.addChild(heading);

      const scores = save.highScores;

      if (!scores.length) {
        const empty = makeText('NO SCORES YET - GO SET ONE', {
          size: 12,
          anchor: 0.5,
          color: 0x6a7bb5,
        });
        empty.position.set(DESIGN.width / 2, 270);
        this.panelLayer.addChild(empty);
      } else {
        scores.slice(0, 8).forEach((entry, i) => {
          const y = 200 + i * 22;
          const rank = makeText(`${i + 1}.`, { size: 13, color: 0x6a7bb5 });
          rank.position.set(150, y);

          const name = makeText(entry.name, { size: 13, color: 0xffffff });
          name.position.set(184, y);

          const score = makeText(String(entry.score).padStart(6, '0'), {
            size: 13,
            color: 0xffd23f,
            anchor: [1, 0],
          });
          score.position.set(452, y);

          const lvl = makeText(`L${entry.level}`, { size: 11, color: 0x4a5580, anchor: [1, 0] });
          lvl.position.set(492, y + 1);

          this.panelLayer.addChild(rank, name, score, lvl);
        });
      }

      const menu = this._menu(400, 46);
      menu.add(
        new Button('BACK', () => {
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
