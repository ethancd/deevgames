import { BaseGameScene } from './BaseGameScene'
import { GridPos, Layer, ResourceType, TileType, RESOURCE_COLORS, WORLD_COLS, WORLD_ROWS, samePos } from '../../sim/types'
import { gridToScreen, HALF_W, HALF_H } from '../IsoUtils'
import { notifyCarriedItem, setCurrentLayer } from '../../bridge'

export class SurfaceScene extends BaseGameScene {
  private holePositions: GridPos[] = []

  constructor() {
    super({ key: 'Surface' })
  }

  create(): void {
    super.create()
    setCurrentLayer(Layer.SURFACE)
    notifyCarriedItem(this.world.state.carriedItem)

    this.holePositions = []
    const grid = this.world.state.surface
    for (let r = 0; r < WORLD_ROWS; r++) {
      for (let c = 0; c < WORLD_COLS; c++) {
        if (grid[r][c] === TileType.HOLE) this.holePositions.push({ col: c, row: r })
      }
    }

    const fromBelow = this.registry.get('arriveFromBelow') as boolean
    if (fromBelow) {
      this.registry.remove('arriveFromBelow')
      this.player.setScale(0.3)
      this.player.setAlpha(0)
      this.playerBaseY -= 40

      this.tweens.add({
        targets: this.player,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 400,
        ease: 'Back.easeOut',
      })

      this.tweens.add({
        targets: this.player,
        scaleX: { from: 0.7, to: 1.1 },
        duration: 80,
        yoyo: true,
        repeat: 5,
      })

      const realY = this.playerBaseY + 40
      this.tweens.addCounter({
        from: this.playerBaseY,
        to: realY,
        duration: 500,
        ease: 'Sine.easeOut',
        onUpdate: (tween) => {
          this.playerBaseY = tween.getValue() ?? this.playerBaseY
        },
      })

      const flash = this.add.rectangle(
        this.player.x, this.player.y - 20,
        HALF_W * 6, HALF_H * 6, 0xfef3c7, 0.6,
      )
      flash.setDepth(5000)
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scaleX: 2,
        scaleY: 2,
        duration: 400,
        onComplete: () => flash.destroy(),
      })
    }
  }

  getLayer(): Layer {
    return Layer.SURFACE
  }

  getGrid(): TileType[][] {
    return this.world.state.surface
  }

  protected updateLightShaftTints(): void {
    const allLeylines = this.world.state.leylines
    const SUNLIGHT_TINT = RESOURCE_COLORS[ResourceType.SUNLIGHT]

    for (const hole of this.holePositions) {
      const sprite = this.tileSprites[hole.row][hole.col]

      let tintColor = SUNLIGHT_TINT
      for (const ley of allLeylines) {
        if (ley.path.length < 2) continue
        const res = this.leylineEngine.getActiveResource(ley.id)
        if (!res || res === ResourceType.SUNLIGHT) continue
        const end = ley.path[ley.path.length - 1]
        if (samePos(end, hole)) {
          tintColor = RESOURCE_COLORS[res]
          break
        }
      }

      sprite.setTint(tintColor)
    }
  }

  onShovelTap(pos: GridPos): void {
    const tile = this.world.state.surface[pos.row][pos.col]

    if (tile === TileType.WATER) {
      const result = this.world.pickUp(pos)
      if (result.type === 'picked_up') {
        notifyCarriedItem(this.world.state.carriedItem)
        this.syncCarriedSprite()
        this.showCollectEffect(pos, '\u{1F4A7}')
      } else if (result.type === 'hands_full') {
        this.showFloatingText(pos, 'Hands full!', 0xf87171)
      }
      return
    }

    const result = this.world.dig(pos)
    if (result.type === 'dug') {
      this.tileSprites[pos.row][pos.col].setTexture(`tile_dig_${result.depth}`)
      this.showDigEffect(pos)
    } else if (result.type === 'hole_created') {
      this.tileSprites[pos.row][pos.col].setTexture('tile_hole')
      this.showDigEffect(pos)
    }
  }

  onHoleTap(pos: GridPos): void {
    this.handleTapToMove(pos)
  }

  protected onArrivedAt(pos: GridPos): void {
    const tile = this.world.state.surface[pos.row][pos.col]
    if (tile === TileType.HOLE) {
      this.transitionToUnderground(pos)
    }
  }

  private transitionToUnderground(pos: GridPos): void {
    this.isMoving = false
    this.currentPath = null

    this.cameras.main.shake(200, 0.005)

    this.tweens.add({
      targets: this.player,
      scaleX: 0.3,
      scaleY: 0.3,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
    })

    const overlay = this.add.rectangle(
      this.player.x, this.playerBaseY,
      HALF_W * 4, HALF_H * 4, 0x000000, 0,
    )
    overlay.setDepth(5000)
    this.tweens.add({
      targets: overlay,
      alpha: 0.8,
      scaleX: 8,
      scaleY: 8,
      duration: 500,
    })

    this.time.delayedCall(500, () => {
      this.world.movePlayer(pos)
      this.world.switchLayer()
      this.scene.start('Underground')
    })
  }

  private showDigEffect(pos: GridPos): void {
    const s = gridToScreen(pos.col, pos.row)
    for (let i = 0; i < 3; i++) {
      const particle = this.add.circle(
        s.x + (Math.random() - 0.5) * 10,
        s.y,
        2 + Math.random() * 2,
        0x8b6914, 0.8,
      )
      particle.setDepth(5000)
      this.tweens.add({
        targets: particle,
        y: s.y - 10 - Math.random() * 15,
        x: particle.x + (Math.random() - 0.5) * 20,
        alpha: 0,
        duration: 300 + Math.random() * 200,
        onComplete: () => particle.destroy(),
      })
    }
  }

  private showCollectEffect(pos: GridPos, emoji: string): void {
    const s = gridToScreen(pos.col, pos.row)
    const txt = this.add.text(s.x, s.y, emoji, { fontSize: '14px' })
    txt.setOrigin(0.5)
    txt.setDepth(5000)
    this.tweens.add({
      targets: txt,
      y: s.y - 20,
      alpha: 0,
      duration: 600,
      onComplete: () => txt.destroy(),
    })
  }
}
