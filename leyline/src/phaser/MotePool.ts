import Phaser from 'phaser'
import { RESOURCE_COLORS, MOTE_TEXTURES, ResourceType } from '../sim/types'
import { MoteRenderData } from '../sim/LeylineEngine'

export class MotePool {
  private sprites: Phaser.GameObjects.Image[] = []
  private activeCount = 0

  constructor(scene: Phaser.Scene, count: number) {
    for (let i = 0; i < count; i++) {
      const sprite = scene.add.image(0, 0, 'mote')
      sprite.setVisible(false)
      sprite.setDepth(1500)
      sprite.setBlendMode(Phaser.BlendModes.ADD)
      sprite.setScale(1.5)
      this.sprites.push(sprite)
    }
  }

  update(motes: MoteRenderData[]): void {
    for (let i = 0; i < this.activeCount; i++) {
      this.sprites[i].setVisible(false)
    }

    this.activeCount = Math.min(motes.length, this.sprites.length)

    for (let i = 0; i < this.activeCount; i++) {
      const sprite = this.sprites[i]
      const mote = motes[i]
      sprite.setPosition(mote.x, mote.y)
      sprite.setTexture(MOTE_TEXTURES[mote.resourceType] ?? 'mote')
      sprite.setTint(RESOURCE_COLORS[mote.resourceType])
      sprite.setVisible(true)
    }
  }

  destroy(): void {
    for (const sprite of this.sprites) {
      sprite.destroy()
    }
    this.sprites = []
    this.activeCount = 0
  }
}
