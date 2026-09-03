import './style.css'
import { Application } from 'pixi.js'
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

    this.app.ticker.add(this.update, this)
  }

  private update(_ticker: Ticker): void {
    // Oyun döngüsü mantığı buraya eklenecek
  }
}

const game = new Game()
game.init()
