import { Container } from 'pixi.js';

/**
 * Base class for every screen. Scenes own a single display Container and are
 * fully torn down on exit — no scene ever leaks a ticker callback or listener.
 */
export class Scene {
  constructor(ctx, params = {}) {
    this.ctx = ctx;
    this.params = params;
    this.view = new Container();
  }

  /** Called after the view is mounted. */
  enter() {}

  /** @param {number} dt seconds since last frame, already clamped. */
  update(_dt) {}

  /** Called before the view is unmounted. Release listeners here. */
  exit() {}
}

export class SceneManager {
  constructor(ctx, layer) {
    this.ctx = ctx;
    this.layer = layer;
    this.current = null;
    this._pending = null;
  }

  /**
   * Queue a scene change. The swap is deferred to the next update so a scene can
   * safely call `change()` from inside its own update or an event handler
   * without destroying the objects still being iterated.
   */
  change(SceneClass, params = {}) {
    this._pending = { SceneClass, params };
  }

  _applyPending() {
    if (!this._pending) return;

    const { SceneClass, params } = this._pending;
    this._pending = null;

    if (this.current) {
      this.current.exit();
      this.layer.removeChild(this.current.view);
      this.current.view.destroy({ children: true });
    }

    const scene = new SceneClass(this.ctx, params);
    this.current = scene;
    this.layer.addChild(scene.view);
    scene.enter();

    // Publish the active scene so HTML overlays can show themselves only where
    // they belong (the mode switcher is menu-only). Read from an explicit
    // static, never from `SceneClass.name` — minifiers mangle class names and
    // this would silently break in a production build.
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.scene = SceneClass.sceneName ?? '';
    }
  }

  update(dt) {
    this._applyPending();
    this.current?.update(dt);
  }
}
