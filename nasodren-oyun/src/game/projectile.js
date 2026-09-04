import { Container, Graphics } from 'pixi.js';
import { BOSS, DESIGN } from './config.js';

/**
 * Glitch Packet: the corrupted data the Construct spits downward.
 *
 * Rendered as a chromatic-aberration stack — a magenta and a cyan copy jittered
 * either side of a white core — which sells "digital corruption" far more
 * cheaply than a shader would. The jitter is cosmetic only; the collision body
 * is a fixed circle at the container origin.
 */
export class GlitchPacket extends Container {
  constructor(x, y, dx, dy) {
    super();

    this.radius = BOSS.fire.radius;
    this.dx = dx;
    this.dy = dy;
    this.dead = false;

    this._jitter = 0;

    const size = this.radius * 2;
    const shard = (color) => {
      const g = new Graphics();
      g.rect(-size / 2, -size / 2, size, size).fill({ color, alpha: 0.85 });
      g.rect(-size / 2, -1.5, size, 3).fill({ color: 0x000000, alpha: 0.35 });
      return g;
    };

    this.ghostA = shard(0xff2e97);
    this.ghostB = shard(0x00e5ff);
    this.ghostA.x = -1.5;
    this.ghostB.x = 1.5;

    this.body = new Graphics();
    this.body
      .rect(-size / 2 + 1.5, -size / 2 + 1.5, size - 3, size - 3)
      .fill({ color: 0xf2f6ff, alpha: 0.95 });

    this.addChild(this.ghostA, this.ghostB, this.body);
    this.position.set(x, y);
  }

  update(dt) {
    this.y += this.dy * BOSS.fire.speed * dt;
    this.x += this.dx * BOSS.fire.speed * dt;

    // Re-scatter the ghosts a few times a second rather than every frame; the
    // lower rate reads as a digital stutter instead of a blur.
    this._jitter -= dt;
    if (this._jitter <= 0) {
      this._jitter = 0.05;
      this.ghostA.x = -1.5 - Math.random() * 2;
      this.ghostB.x = 1.5 + Math.random() * 2;
      this.ghostA.y = (Math.random() - 0.5) * 2;
      this.ghostB.y = (Math.random() - 0.5) * 2;
      this.rotation = (Math.random() - 0.5) * 0.25;
    }

    if (this.y - this.radius > DESIGN.height) this.dead = true;
  }

  /**
   * Circle against the paddle's axis-aligned box: clamp the centre to the box,
   * then compare the residual distance. Exact, and it costs four clamps.
   *
   * @param {import('./paddle.js').Paddle} paddle
   */
  hitsPaddle(paddle) {
    const cx = Math.max(paddle.left, Math.min(paddle.right, this.x));
    const cy = Math.max(paddle.top, Math.min(paddle.bottom, this.y));
    const dx = this.x - cx;
    const dy = this.y - cy;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }
}
