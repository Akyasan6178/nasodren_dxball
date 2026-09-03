import './style.css'
import { Application, Text } from 'pixi.js'
import type { Ticker } from 'pixi.js'

class Game {
  private app: Application

  constructor() {
    this.app = new Application()
  }

  public async init(): Promise<void> {
    await this.app.init({
      width: 800,
      height: 600,
      background: '#1a1a1a',
    })

    document.querySelector<HTMLDivElement>('#app')!.appendChild(this.app.canvas)

    this.createTestText()

    this.app.ticker.add(this.update, this)
  }

  private createTestText(): void {
    const text = new Text({
      text: 'test',
      style: {
        fill: '#ffffff',
        fontSize: 48,
      },
    })

    text.anchor.set(0.5)
    text.position.set(this.app.screen.width / 2, this.app.screen.height / 2)

    this.app.stage.addChild(text)
  }

  private update(_ticker: Ticker): void {
    // Oyun döngüsü mantığı buraya eklenecek
  }
}

const game = new Game()
game.init()
