import { DEFAULT_MODE, MODES } from '../game/config.js';

const STORAGE_KEY = 'brickstorm.mode';

/**
 * Main-menu mode switcher.
 *
 * An HTML control rather than a Pixi one: it needs no canvas state, it gets
 * real focus handling and screen-reader semantics for free, and it can't be
 * affected by the letterbox scaling. Visibility is CSS-driven off
 * `body[data-scene]`, which SceneManager maintains, so this class never has to
 * know which screen is showing.
 *
 * The selection is stored and persisted only. Nothing in the engine reads it
 * yet — see the note on MODES in config.js for the two hook points.
 */
export class ModeToggle {
  /**
   * @param {HTMLElement} root
   * @param {{onChange?: (config: object, id: string) => void}} [options]
   */
  constructor(root, options = {}) {
    if (!root) throw new Error('ModeToggle: root element not found');

    this.root = root;
    this.onChange = options.onChange;
    this.order = Object.keys(MODES);

    // Labels come from the config, so renaming a mode is a one-line change.
    for (const el of root.querySelectorAll('.mode__option')) {
      const preset = MODES[el.dataset.mode];
      if (preset) el.textContent = preset.label;
    }

    this.id = this._restore() ?? DEFAULT_MODE;
    this._apply(false);

    root.addEventListener('click', () => this.toggle());

    // The game's Input layer listens for Enter/Space on `window` to launch the
    // ball and drive the Pixi menu, and it calls preventDefault on Space. Both
    // would fire alongside this button while it has focus, so keystrokes that
    // belong to the toggle are handled here and stopped before they bubble out.
    root.addEventListener('keydown', (e) => {
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });
  }

  get config() {
    return MODES[this.id];
  }

  toggle() {
    const next = this.order[(this.order.indexOf(this.id) + 1) % this.order.length];
    this.set(next);
  }

  /** @param {string} id @param {{silent?: boolean}} [opts] */
  set(id, opts = {}) {
    if (!MODES[id] || id === this.id) return;
    this.id = id;
    this._persist();
    this._apply(!opts.silent);
  }

  _apply(notify) {
    // Two modes map cleanly onto a switch; a third would want a radiogroup.
    this.root.setAttribute('aria-checked', String(this.id === 'turbo'));
    this.root.dataset.mode = this.id;
    if (notify) this.onChange?.(this.config, this.id);
  }

  _restore() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && MODES[saved] ? saved : null;
    } catch {
      return null; // private mode / storage disabled
    }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, this.id);
    } catch {
      /* session-only */
    }
  }
}
