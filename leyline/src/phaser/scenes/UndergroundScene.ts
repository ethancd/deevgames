import { BaseGameScene } from './BaseGameScene'
import { GridPos, Layer, TileType, ResourceType, RESOURCE_COLORS, WORLD_ROWS, WORLD_COLS, samePos } from '../../sim/types'
import { gridToScreen, HALF_W, HALF_H } from '../IsoUtils'
import { notifyCarriedItem, setCurrentLayer } from '../../bridge'

export class UndergroundScene extends BaseGameScene {
  private holePositions: GridPos[] = []

  constructor() {
    super({ key: 'Underground' })
  }

  create(): void {
    super.create()
    setCurrentLayer(Layer.UNDERGROUND)
    notifyCarriedItem(this.world.state.carriedItem)

    this.holePositions = []
    const grid = this.world.state.underground
    for (let r = 0; r < WORLD_ROWS; r++) {
      for (let c = 0; c < WORLD_COLS; c++) {
        if (grid[r][c] === TileType.HOLE) this.holePositions.push({ col: c, row: r })
      }
    }

    this.cameras.main.setBackgroundColor(0x0a0a15)

    this.player.setAlpha(0)
    this.player.setScale(0.5)
    this.tweens.add({
      targets: this.player,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 300,
      ease: 'Back.easeOut',
    })
  }

  getLayer(): Layer {
    return Layer.UNDERGROUND
  }

  getGrid(): TileType[][] {
    return this.world.state.underground
  }

  protected getTileTexture(tile: TileType, row: number, col: number): string {
    if (tile === TileType.HOLE) return 'tile_light_shaft'
    if (tile === TileType.MOLDERING_LOG) return 'tile_moldering_log'
    return super.getTileTexture(tile, row, col)
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

  protected onArrivedAt(pos: GridPos): void {
    const tile = this.world.state.underground[pos.row][pos.col]
    if (tile === TileType.HOLE) {
      this.transitionToSurface(pos)
    }
  }

  onShovelTap(pos: GridPos): void {
    const tile = this.world.state.underground[pos.row][pos.col]

    if (tile === TileType.MOLDERING_LOG) {
      const result = this.world.pickUp(pos)
      if (result.type === 'picked_up') {
        notifyCarriedItem(this.world.state.carriedItem)
        this.syncCarriedSprite()
        this.showCollectEffect(pos, '🌿')
      } else if (result.type === 'hands_full') {
        this.showFloatingText(pos, 'Hands full!', 0xf87171)
      }
      return
    }

    if (tile === TileType.CRYSTAL_RED || tile === TileType.CRYSTAL_BLUE) {
      const result = this.world.pickUp(pos)
      if (result.type === 'picked_up') {
        notifyCarriedItem(this.world.state.carriedItem)
        this.syncCarriedSprite()
        const emoji = tile === TileType.CRYSTAL_RED ? '🔴' : '🔵'
        this.showCollectEffect(pos, emoji)
      } else if (result.type === 'hands_full') {
        this.showFloatingText(pos, 'Hands full!', 0xf87171)
      }
      return
    }

    const result = this.world.dig(pos)
    if (result.type === 'dug') {
      this.tileSprites[pos.row][pos.col].setTexture(`tile_udig_${result.depth}`)
      this.showDigEffect(pos)
    } else if (result.type === 'bedrock_hit') {
      this.refreshTile(pos)
      this.showDigEffect(pos)
    }
  }

  onHoleTap(pos: GridPos): void {
    const pp = this.world.state.playerPos
    const dist = Math.abs(pp.col - pos.col) + Math.abs(pp.row - pos.row)
    if (dist > 1) {
      this.walkThenAct(pos, () => this.transitionToSurface(pos))
      return
    }
    this.transitionToSurface(pos)
  }

  private transitionToSurface(pos: GridPos): void {
    this.isMoving = false
    this.currentPath = null

    this.tweens.add({
      targets: this.player,
      scaleX: { from: 1, to: 1.3 },
      duration: 60,
      yoyo: true,
      repeat: 6,
    })

    this.tweens.add({
      targets: this.player,
      scaleY: 1.2,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
    })

    this.tweens.addCounter({
      from: this.playerBaseY,
      to: this.playerBaseY - 40,
      duration: 500,
      ease: 'Sine.easeIn',
      onUpdate: (tween) => {
        this.playerBaseY = tween.getValue() ?? this.playerBaseY
      },
    })

    const flash = this.add.circle(
      this.player.x, this.playerBaseY,
      4, 0xfef3c7, 0.9,
    )
    flash.setDepth(5000)
    this.tweens.add({
      targets: flash,
      scaleX: 8,
      scaleY: 12,
      alpha: 0,
      y: flash.y - 50,
      duration: 500,
      onComplete: () => flash.destroy(),
    })

    this.time.delayedCall(500, () => {
      this.world.movePlayer(pos)
      this.world.switchLayer()
      this.registry.set('arriveFromBelow', true)
      this.scene.start('Surface')
    })
  }

  private showDigEffect(pos: GridPos): void {
    const s = gridToScreen(pos.col, pos.row)
    for (let i = 0; i < 3; i++) {
      const particle = this.add.circle(
        s.x + (Math.random() - 0.5) * 10,
        s.y,
        2 + Math.random() * 2,
        0x6b4914, 0.8,
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
