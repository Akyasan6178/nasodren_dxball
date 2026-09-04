import { BitmapFont, BitmapText, Container, Graphics, Rectangle, Text } from 'pixi.js';

/**
 * UI toolkit: bitmap fonts plus the handful of widgets the menus need.
 *
 * Fonts are generated at boot with `BitmapFont.install`, which rasterises a
 * system font into a texture atlas. BitmapText then renders glyphs as batched
 * quads — important for the HUD, which changes every frame and would otherwise
 * force a canvas re-rasterisation on every score tick.
 */

export const FONT_BODY = 'BrickstormBody';
export const FONT_TITLE = 'BrickstormTitle';

const CHARS = [
  ['a', 'z'],
  ['A', 'Z'],
  ['0', '9'],
  " !\"#$%&'()*+,-./:;<=>?@[]^_`{|}~",
];

const STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, "Courier New", monospace';

/**
 * False if bitmap font generation failed (very old browser, blocked canvas
 * readback). makeText then falls back to regular Text so the game still runs,
 * just with a slower text path.
 */
let bitmapReady = false;

export function installFonts() {
  try {
    _installBitmapFonts();
    bitmapReady = true;
  } catch (err) {
    console.warn('[ui] bitmap fonts unavailable, falling back to Text', err);
    bitmapReady = false;
  }
}

function _installBitmapFonts() {
  BitmapFont.install({
    name: FONT_BODY,
    style: { fontFamily: STACK, fontSize: 22, fontWeight: 'bold', fill: 0xffffff },
    chars: CHARS,
    resolution: 2,
  });

  BitmapFont.install({
    name: FONT_TITLE,
    style: {
      fontFamily: STACK,
      fontSize: 52,
      fontWeight: 'bold',
      fill: 0xffffff,
      letterSpacing: 2,
    },
    chars: CHARS,
    resolution: 2,
  });
}

/**
 * @param {string} text
 * @param {{size?:number,color?:number,title?:boolean,anchor?:number|[number,number]}} opts
 */
export function makeText(text, opts = {}) {
  const { size = 16, color = 0xffffff, title = false, anchor = 0 } = opts;

  const family = title ? FONT_TITLE : FONT_BODY;

  const t = bitmapReady
    ? new BitmapText({ text, style: { fontFamily: family, fontSize: size } })
    : new Text({
        text,
        style: { fontFamily: STACK, fontSize: size, fontWeight: 'bold', fill: 0xffffff },
      });

  t.tint = color;
  if (Array.isArray(anchor)) t.anchor.set(anchor[0], anchor[1]);
  else t.anchor.set(anchor);

  return t;
}

/** Neon-edged panel used behind menus and dialogs. */
export function panel(w, h, { fill = 0x11122a, border = 0x35d0d8, alpha = 0.92 } = {}) {
  const g = new Graphics();
  g.roundRect(0, 0, w, h, 6).fill({ color: fill, alpha });
  g.roundRect(0.5, 0.5, w - 1, h - 1, 6).stroke({ width: 1.5, color: border, alpha: 0.85 });
  return g;
}

export class Button extends Container {
  /**
   * @param {string} label
   * @param {(btn: Button) => void} onActivate
   */
  constructor(label, onActivate, { width = 260, height = 42, size = 18, accent = 0x35d0d8 } = {}) {
    super();

    this.accent = accent;
    this.w = width;
    this.h = height;
    this.onActivate = onActivate;
    this.selected = false;
    this.enabled = true;

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.label = makeText(label, { size, anchor: 0.5 });
    this.label.position.set(width / 2, height / 2);
    this.addChild(this.label);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, width, height);

    this.on('pointerover', () => this.emit('hover', this));
    this.on('pointertap', () => this.activate());

    this.redraw();
  }

  setLabel(text) {
    this.label.text = text;
  }

  setSelected(on) {
    if (this.selected === on) return;
    this.selected = on;
    this.redraw();
  }

  setEnabled(on) {
    this.enabled = on;
    this.alpha = on ? 1 : 0.35;
    this.cursor = on ? 'pointer' : 'default';
    this.redraw();
  }

  activate() {
    if (!this.enabled) return;
    this.onActivate?.(this);
  }

  redraw() {
    const { w, h, accent, selected } = this;
    this.bg.clear();
    this.bg
      .roundRect(0, 0, w, h, 5)
      .fill({ color: selected ? accent : 0x161a35, alpha: selected ? 0.22 : 0.85 });
    this.bg
      .roundRect(0.5, 0.5, w - 1, h - 1, 5)
      .stroke({ width: selected ? 2 : 1.2, color: accent, alpha: selected ? 1 : 0.5 });

    this.label.tint = selected ? 0xffffff : 0xb9c2e8;

    // Selection carets, the classic "you are here" marker.
    if (selected) {
      this.bg.poly([-14, h / 2 - 6, -6, h / 2, -14, h / 2 + 6]).fill(accent);
      this.bg.poly([w + 14, h / 2 - 6, w + 6, h / 2, w + 14, h / 2 + 6]).fill(accent);
    }
  }
}

/**
 * Keyboard/pointer menu. Arrow keys move the caret, Enter activates, and
 * hovering with a mouse moves the caret to match — so both input styles agree on
 * what "selected" means.
 */
export class VerticalMenu extends Container {
  constructor(input, audio, { spacing = 52 } = {}) {
    super();
    this.input = input;
    this.audio = audio;
    this.spacing = spacing;
    this.buttons = [];
    this.index = 0;

    this._offKey = input.onKey((e) => this._onKey(e));
  }

  add(button) {
    button.y = this.buttons.length * this.spacing;
    button.on('hover', () => this.select(this.buttons.indexOf(button), true));
    this.buttons.push(button);
    this.addChild(button);
    this.select(this.index, false);
    return button;
  }

  select(index, sound = true) {
    if (index < 0 || index >= this.buttons.length) return;
    if (index === this.index && this.buttons[index].selected) return;

    this.index = index;
    this.buttons.forEach((b, i) => b.setSelected(i === index));
    if (sound) this.audio.uiMove();
  }

  _move(delta) {
    const n = this.buttons.length;
    if (!n) return;

    let i = this.index;
    for (let step = 0; step < n; step++) {
      i = (i + delta + n) % n;
      if (this.buttons[i].enabled) break;
    }
    this.select(i);
  }

  _onKey(e) {
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        this._move(-1);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this._move(1);
        break;
      case 'Enter':
      case 'Space':
        this.audio.uiClick();
        this.buttons[this.index]?.activate();
        break;
      default:
        break;
    }
  }

  destroy(options) {
    this._offKey?.();
    super.destroy(options);
  }
}
