import { BaseGameScene } from './BaseGameScene'
import { GridPos, Layer, ResourceType, TileType, RESOURCE_COLORS, WORLD_COLS, WORLD_ROWS, samePos } from '../../sim/types'
import { gridToScreen, screenToGrid, HALF_W, HALF_H } from '../IsoUtils'
import { notifyCarriedItem, setCurrentLayer } from '../../bridge'
import { markDirty } from '../../sim/SaveManager'

const SUN_SPAWN_MIN = 4000
const SUN_SPAWN_MAX = 7000
const SUN_FALL_SPEED = 12
const SUN_LIFETIME = 15000
const SUN_SIZE = 10

interface SunMote {
  sprite: Phaser.GameObjects.Ellipse
  glow: Phaser.GameObjects.Ellipse
  x: number
  y: number
  age: number
  col: number
}

export class SurfaceScene extends BaseGameScene {
  private sunMotes: SunMote[] = []
  private sunSpawnTimer = 0
  private nextSunSpawn = 3000
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

    this.sunMotes = []
    this.sunSpawnTimer = 0
    this.nextSunSpawn = 2000

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

  shutdown(): void {
    super.shutdown()
    for (const sun of this.sunMotes) {
      sun.sprite.destroy()
      sun.glow.destroy()
    }
    this.sunMotes = []
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
        this.showCollectEffect(pos, '💧')
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

  protected handleTap(target: GridPos): void {
    if (this.trySunMoteTap(target)) return
    super.handleTap(target)
  }

  update(time: number, delta: number): void {
    super.update(time, delta)
    this.updateSunMotes(delta)
  }

  private updateSunMotes(delta: number): void {
    this.sunSpawnTimer += delta
    if (this.sunSpawnTimer >= this.nextSunSpawn) {
      this.sunSpawnTimer = 0
      this.nextSunSpawn = SUN_SPAWN_MIN + Math.random() * (SUN_SPAWN_MAX - SUN_SPAWN_MIN)
      this.spawnSunMote()
    }

    const toRemove: number[] = []
    for (let i = 0; i < this.sunMotes.length; i++) {
      const sun = this.sunMotes[i]
      sun.age += delta
      sun.y += SUN_FALL_SPEED * delta / 1000

      sun.sprite.setPosition(sun.x, sun.y)
      sun.glow.setPosition(sun.x, sun.y)

      const fadeStart = SUN_LIFETIME * 0.6
      if (sun.age > fadeStart) {
        const fade = 1 - (sun.age - fadeStart) / (SUN_LIFETIME - fadeStart)
        sun.sprite.setAlpha(Math.max(0, fade))
        sun.glow.setAlpha(Math.max(0, fade * 0.4))
      }

      const gp = screenToGrid(sun.x, sun.y)
      if (gp) {
        const plant = this.world.getPlantAt(gp, Layer.SURFACE)
        if (plant && plant.stage !== 'mature') {
          const result = this.world.feedPlantResource(gp, Layer.SURFACE, ResourceType.SUNLIGHT)
          if (result.type === 'fed') {
            this.showCollectEffect(gp, '☀️')
            toRemove.push(i)
            continue
          }
        }
      }

      const bottomRight = gridToScreen(WORLD_COLS - 1, WORLD_ROWS - 1)
      if (sun.age >= SUN_LIFETIME || sun.y > bottomRight.y + HALF_H * 4) {
        toRemove.push(i)
      }
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      const sun = this.sunMotes[toRemove[i]]
      sun.sprite.destroy()
      sun.glow.destroy()
      this.sunMotes.splice(toRemove[i], 1)
    }
  }

  private spawnSunMote(): void {
    const col = 1 + Math.floor(Math.random() * (WORLD_COLS - 2))
    const row = Math.floor(Math.random() * WORLD_ROWS)
    const s = gridToScreen(col, row)
    const x = s.x + (Math.random() - 0.5) * HALF_W
    const y = s.y - HALF_H * 8

    const glow = this.add.ellipse(x, y, SUN_SIZE * 3, SUN_SIZE * 3, 0xfbbf24, 0.4)
    glow.setDepth(5000)

    const sprite = this.add.ellipse(x, y, SUN_SIZE, SUN_SIZE, 0xfef3c7, 1)
    sprite.setDepth(5001)

    this.tweens.add({
      targets: sprite,
      scaleX: { from: 0.9, to: 1.1 },
      scaleY: { from: 0.9, to: 1.1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    this.sunMotes.push({ sprite, glow, x, y, age: 0, col })
  }

  private trySunMoteTap(target: GridPos): boolean {
    const ts = gridToScreen(target.col, target.row)

    for (let i = this.sunMotes.length - 1; i >= 0; i--) {
      const sun = this.sunMotes[i]
      const dx = sun.x - ts.x
      const dy = sun.y - ts.y
      if (dx * dx + dy * dy < (HALF_W * HALF_W * 4)) {
        const pickResult = this.world.pickUpSunlight()
        if (pickResult.type !== 'picked_up') {
          this.showFloatingText(target, 'Hands full!', 0xf87171)
          return true
        }
        notifyCarriedItem(this.world.state.carriedItem)
        this.syncCarriedSprite()

        const pos = screenToGrid(sun.x, sun.y) ?? target
        this.showCollectEffect(pos, '☀️')

        sun.sprite.destroy()
        sun.glow.destroy()
        this.sunMotes.splice(i, 1)
        return true
      }
    }
    return false
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
