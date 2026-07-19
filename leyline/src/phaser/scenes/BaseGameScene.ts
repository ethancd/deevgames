import Phaser from 'phaser'
import { World, BuyTreeResult } from '../../sim/World'
import {
  CarriableItem, GridPos, GrowthStage, Layer, Leyline, Plant, ResourceType, RESOURCE_COLORS, RESOURCE_EMOJI, RESOURCE_NAMES, TileType,
  WORLD_COLS, WORLD_ROWS, SeedType, samePos,
} from '../../sim/types'
import { gridToScreen, screenToGrid, isoDepth, isoWorldBounds, HALF_W, HALF_H } from '../IsoUtils'
import { getTimeOfDayTint, getCloudedTint, getHoleLightAlpha } from '../Lighting'
import {
  getTool, setTool, getUnlocks,
  onToolChange, notifyCarriedItem, setUnlocks,
  showTooltip, hideTooltip, onDropRequest, onTreeBuyRequest, requestHelp, requestNewGame,
  notifyWeather,
  notifyEmitProgress,
  onDebugAction, DebugAction,
} from '../../bridge'
import { getDebugPlantMode, isDebugEmissionEnabled } from '../../ui'
import { getStageReq, crystalTypeForSeed, getTransmuteRecipe, getPlantOutput, isSourcePlant, seedLayer, SEED_DISPLAY, STAGE_DISPLAY } from '../../sim/PlantConfig'
import { isWalkable } from '../../sim/Pathfinding'
import { LeylineEngine } from '../../sim/LeylineEngine'
import { tickWeather, advanceClock, weatherFeedTick } from '../../sim/WeatherSystem'
import { MotePool } from '../MotePool'
import { facingFromDelta, PixieDir } from '../PixieSprites'

const TILE_TEXTURE_MAP: Record<TileType, string> = {
  [TileType.GRASS]: 'tile_grass',
  [TileType.WATER]: 'tile_water',
  [TileType.DIRT]: 'tile_dirt',
  [TileType.STONE]: 'tile_stone',
  [TileType.CRYSTAL_RED]: 'tile_crystal_red',
  [TileType.CRYSTAL_BLUE]: 'tile_crystal_blue',
  [TileType.HOLE]: 'tile_hole',
  [TileType.PLANTED]: 'tile_dirt',
  [TileType.PATH]: 'tile_path',
  [TileType.FLOWERS]: 'tile_flowers',
  [TileType.MOSS]: 'tile_moss',
  [TileType.MUSHROOM]: 'tile_mushroom',
  [TileType.MAGIC_TREE]: 'tile_magic_tree',
  [TileType.MOLDERING_LOG]: 'tile_moldering_log',
}

function plantTextureKey(plant: Plant): string {
  return `plant_${plant.seedType}_${plant.stage}`
}

function carriedTextureKey(item: CarriableItem): string {
  if (item.type === 'resource') return `carry_${item.resource}`
  return `carry_seed_${item.seed}`
}

const CARRY_OFFSETS: Record<PixieDir, { x: number; y: number }> = {
  S: { x: 0, y: 4 },
  N: { x: 0, y: -2 },
  E: { x: 4, y: 2 },
  W: { x: -4, y: 2 },
}

const FACING_DELTA: Record<PixieDir, { dcol: number; drow: number }> = {
  N: { dcol: 0, drow: -1 },
  S: { dcol: 0, drow: 1 },
  E: { dcol: 1, drow: 0 },
  W: { dcol: -1, drow: 0 },
}

export abstract class BaseGameScene extends Phaser.Scene {
  protected world!: World
  protected player!: Phaser.GameObjects.Sprite
  protected tileSprites: Phaser.GameObjects.Image[][] = []
  protected plantSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
  protected moveTarget: Phaser.GameObjects.Sprite | null = null
  protected currentPath: GridPos[] | null = null
  protected pathIndex = 0
  protected moveSpeed = 150
  protected isMoving = false
  protected playerBaseY = 0
  protected floatTime = 0
  protected pendingAction: (() => void) | null = null
  private isPinching = false
  private pinchStartDist = 0
  private pinchStartZoom = 1
  private unsubToolChange: (() => void) | null = null
  private unsubDrop: (() => void) | null = null
  private unsubTreeBuy: (() => void) | null = null
  protected leylineGraphics!: Phaser.GameObjects.Graphics
  protected drawPreviewGraphics!: Phaser.GameObjects.Graphics
  protected motePool!: MotePool
  protected leylineEngine!: LeylineEngine
  protected drawingPath: GridPos[] | null = null
  protected portalSprite: Phaser.GameObjects.Sprite | null = null
  protected portalGlow: Phaser.GameObjects.Arc | null = null
  private lastPortalLevel = -1
  private pulseTime = 0
  private activeTooltipPlant: { pos: GridPos; layer: Layer } | null = null
  private activeTooltipPortal = false
  protected facing: PixieDir = 'S'
  protected carriedSprite: Phaser.GameObjects.Sprite | null = null
  private kbUp: Phaser.Input.Keyboard.Key | null = null
  private kbDown: Phaser.Input.Keyboard.Key | null = null
  private kbLeft: Phaser.Input.Keyboard.Key | null = null
  private kbRight: Phaser.Input.Keyboard.Key | null = null
  private kbW: Phaser.Input.Keyboard.Key | null = null
  private kbA: Phaser.Input.Keyboard.Key | null = null
  private kbS: Phaser.Input.Keyboard.Key | null = null
  private kbD: Phaser.Input.Keyboard.Key | null = null
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null
  private boundWheel: ((e: WheelEvent) => void) | null = null
  private weatherHudTimer = 0

  // Lighting state
  protected lightOverlay: Phaser.GameObjects.Rectangle | null = null
  protected cloudFactor = 0
  protected crystalGlows: Map<string, Phaser.GameObjects.Shape> = new Map()
  protected holeLightGlows: Map<string, Phaser.GameObjects.Shape> = new Map()
  private rainGraphics: Phaser.GameObjects.Graphics | null = null
  private rainTime = 0
  private holeSplashes: Array<{ x: number; y: number; sprite: Phaser.GameObjects.Arc; timer: number }> = []
  private splashTimer = 0
  private unsubDebug: (() => void) | null = null
  private debugGraphics: Phaser.GameObjects.Graphics | null = null
  private debugTexts: Phaser.GameObjects.Text[] = []

  abstract getLayer(): Layer
  abstract getGrid(): TileType[][]
  abstract onShovelTap(pos: GridPos): void
  abstract onHoleTap(pos: GridPos): void

  protected onArrivedAt(_pos: GridPos): void {}

  protected getTileTexture(tile: TileType, _row: number, _col: number): string {
    if (tile === TileType.GRASS && (_row + _col) % 3 === 0) return 'tile_grass2'
    return TILE_TEXTURE_MAP[tile]
  }

  create(): void {
    this.world = this.registry.get('world') as World
    this.tileSprites = []
    this.plantSprites = new Map()
    this.portalSprite = null
    this.portalGlow = null
    this.lastPortalLevel = -1
    this.isMoving = false
    this.currentPath = null
    this.pendingAction = null
    this.isPinching = false
    this.floatTime = 0
    this.drawingPath = null
    this.facing = 'S'
    this.carriedSprite = null
    this.weatherHudTimer = 0
    this.lightOverlay = null
    this.cloudFactor = 0
    this.crystalGlows = new Map()
    this.holeLightGlows = new Map()

    this.renderTilemap()
    this.renderPlants()
    this.renderPortal()
    this.createPlayer()
    this.setupCamera()
    this.setupInput()
    this.setupPinchZoom()
    this.setupKeyboard()

    setUnlocks(this.world.state.unlocks)

    this.leylineEngine = this.registry.get('leylineEngine') as LeylineEngine
    this.leylineGraphics = this.add.graphics()
    this.leylineGraphics.setDepth(9100)
    this.drawPreviewGraphics = this.add.graphics()
    this.drawPreviewGraphics.setDepth(9101)
    this.motePool = new MotePool(this, 300)
    this.drawLeylines()

    this.setupLighting()

    this.rainGraphics = this.add.graphics()
    this.rainGraphics.setDepth(9300)
    this.rainGraphics.setScrollFactor(0)

    this.debugGraphics = this.add.graphics()
    this.debugGraphics.setDepth(9400)

    this.unsubDebug = onDebugAction((action) => this.handleDebugAction(action))
    this.unsubToolChange = onToolChange(() => {})
    this.unsubDrop = onDropRequest(() => this.handleDrop())
    this.unsubTreeBuy = onTreeBuyRequest((seed) => this.handleTreeBuy(seed))

    this.syncCarriedSprite()
    notifyWeather(this.world.state.weather)
  }

  shutdown(): void {
    this.unsubToolChange?.()
    this.unsubDrop?.()
    this.unsubTreeBuy?.()
    this.motePool?.destroy()
    this.drawingPath = null
    this.portalGlow?.destroy()
    this.portalGlow = null
    this.portalSprite?.destroy()
    this.portalSprite = null
    this.carriedSprite?.destroy()
    this.carriedSprite = null
    this.lightOverlay?.destroy()
    this.lightOverlay = null
    for (const glow of this.crystalGlows.values()) glow.destroy()
    this.crystalGlows.clear()
    for (const glow of this.holeLightGlows.values()) glow.destroy()
    this.holeLightGlows.clear()
    for (const s of this.holeSplashes) s.sprite.destroy()
    this.holeSplashes.length = 0
    this.rainGraphics?.destroy()
    this.rainGraphics = null
    this.debugGraphics?.destroy()
    this.debugGraphics = null
    for (const t of this.debugTexts) t.destroy()
    this.debugTexts.length = 0
    this.unsubDebug?.()
    if (this.boundKeyDown) {
      window.removeEventListener('keydown', this.boundKeyDown)
      this.boundKeyDown = null
    }
    if (this.boundWheel) {
      this.game.canvas.removeEventListener('wheel', this.boundWheel)
      this.boundWheel = null
    }
  }

  protected renderTilemap(): void {
    const grid = this.getGrid()

    for (let r = 0; r < WORLD_ROWS; r++) {
      this.tileSprites[r] = []
      for (let c = 0; c < WORLD_COLS; c++) {
        const tile = grid[r][c]
        const textureKey = this.getTileTexture(tile, r, c)
        const pos = gridToScreen(c, r)

        const sprite = this.add.image(pos.x, pos.y, textureKey)
        sprite.setDepth((c + r) * 10)
        this.tileSprites[r][c] = sprite
      }
    }
  }

  protected renderPlants(): void {
    const plants = this.world.getPlantsForLayer(this.getLayer())
    for (const plant of plants) {
      this.addPlantSprite(plant)
    }
  }

  protected renderPortal(): void {
    if (this.getLayer() !== Layer.SURFACE) return
    const portal = this.world.state.portal
    const level = Math.min(portal.level, 5)
    const ps = gridToScreen(portal.pos.col, portal.pos.row)

    this.portalGlow = this.add.circle(ps.x, ps.y, HALF_W * 0.8, 0xd946ef, 0.15)
    this.portalGlow.setBlendMode(Phaser.BlendModes.ADD)
    this.portalGlow.setDepth(9050)
    this.tweens.add({
      targets: this.portalGlow,
      scaleX: { from: 0.8, to: 1.6 },
      scaleY: { from: 0.8, to: 1.6 },
      alpha: { from: 0.2, to: 0 },
      duration: 2500,
      repeat: -1,
      ease: 'Sine.easeOut',
    })

    this.portalSprite = this.add.sprite(ps.x, ps.y, `portal_${level}`)
    this.portalSprite.setDepth(9051)
    this.portalSprite.setScale(1.5)
    this.lastPortalLevel = level

    this.tweens.add({
      targets: this.portalSprite,
      scaleX: { from: 1.4, to: 1.7 },
      scaleY: { from: 1.4, to: 1.7 },
      alpha: { from: 0.85, to: 1 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private updatePortalSprite(): void {
    if (this.getLayer() !== Layer.SURFACE || !this.portalSprite) return
    const level = Math.min(this.world.state.portal.level, 5)
    if (level !== this.lastPortalLevel) {
      this.portalSprite.setTexture(`portal_${level}`)
      this.lastPortalLevel = level
      this.showFloatingText(this.world.state.portal.pos, `✨ Portal Level ${level}!`, 0xd946ef)

      const ps = gridToScreen(this.world.state.portal.pos.col, this.world.state.portal.pos.row)
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8
        const particle = this.add.circle(ps.x, ps.y, 3, 0xd946ef, 0.9)
        particle.setDepth(5000)
        this.tweens.add({
          targets: particle,
          x: ps.x + Math.cos(angle) * 40,
          y: ps.y + Math.sin(angle) * 40,
          alpha: 0,
          scale: 0.2,
          duration: 600,
          ease: 'Sine.easeOut',
          onComplete: () => particle.destroy(),
        })
      }
      const flash = this.add.circle(ps.x, ps.y, 6, 0xffffff, 0.8)
      flash.setDepth(5000)
      this.tweens.add({
        targets: flash,
        scale: 4,
        alpha: 0,
        duration: 500,
        ease: 'Sine.easeOut',
        onComplete: () => flash.destroy(),
      })
      this.cameras.main.shake(400, 0.005)
    }
  }

  private processAbsorptions(): void {
    const events = this.leylineEngine.drainAbsorptions()
    for (const ev of events) {
      const color = RESOURCE_COLORS[ev.resourceType]
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * 2 * i) / 4 + Math.random() * 0.5
        const dot = this.add.circle(ev.x, ev.y, 2, color, 0.8)
        dot.setDepth(5000)
        dot.setBlendMode(Phaser.BlendModes.ADD)
        this.tweens.add({
          targets: dot,
          x: ev.x + Math.cos(angle) * 12,
          y: ev.y + Math.sin(angle) * 12,
          alpha: 0,
          scale: 0.3,
          duration: 350,
          ease: 'Sine.easeOut',
          onComplete: () => dot.destroy(),
        })
      }
    }
  }

  protected addPlantSprite(plant: Plant): void {
    const key = `${plant.pos.col},${plant.pos.row}`
    const existing = this.plantSprites.get(key)
    if (existing) existing.destroy()

    const ps = gridToScreen(plant.pos.col, plant.pos.row)
    const sprite = this.add.sprite(ps.x, ps.y, plantTextureKey(plant))
    sprite.setOrigin(0.5, 1.0)
    sprite.setDepth(isoDepth(plant.pos.col, plant.pos.row, 1))

    if (plant.stage === GrowthStage.MATURE) {
      sprite.setDepth(9050 + (plant.pos.col + plant.pos.row) * 0.1)
      this.tweens.add({
        targets: sprite,
        scaleX: { from: 0.95, to: 1.1 },
        scaleY: { from: 0.95, to: 1.1 },
        alpha: { from: 0.85, to: 1 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    this.plantSprites.set(key, sprite)
  }

  protected refreshTile(pos: GridPos): void {
    const tile = this.getGrid()[pos.row][pos.col]
    const textureKey = this.getTileTexture(tile, pos.row, pos.col)
    this.tileSprites[pos.row][pos.col].setTexture(textureKey)
  }

  protected createPlayer(): void {
    const { col, row } = this.world.state.playerPos
    const ps = gridToScreen(col, row)
    this.player = this.add.sprite(ps.x, ps.y, `pixie_${this.facing}_0`)
    this.player.play(`pixie_${this.facing}`)
    this.player.setDepth(9055 + (col + row) * 0.1)
    this.playerBaseY = this.player.y
  }

  protected setupCamera(): void {
    const bounds = isoWorldBounds()
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.width, bounds.height)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
    this.cameras.main.setZoom(2.0)
  }

  private pointerToGrid(pointer: Phaser.Input.Pointer): GridPos | null {
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    return screenToGrid(wp.x, wp.y)
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPinching) return
      if (getTool() !== 'leyline') return
      if (!this.world.state.unlocks.leyline) return

      const pos = this.pointerToGrid(pointer)
      if (!pos) return

      const tile = this.world.getTile(this.getLayer(), pos)
      if (tile === TileType.STONE ||
          tile === TileType.MAGIC_TREE || tile === TileType.MOLDERING_LOG) return

      this.drawingPath = [pos]
      this.updateDrawPreview()
    })

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.drawingPath) return
      if (this.isPinching) {
        this.drawingPath = null
        this.clearDrawPreview()
        return
      }

      const pos = this.pointerToGrid(pointer)
      if (!pos) return

      const last = this.drawingPath[this.drawingPath.length - 1]
      if (samePos(pos, last)) return
      if (Math.abs(pos.col - last.col) + Math.abs(pos.row - last.row) !== 1) return

      const existing = this.drawingPath.findIndex(p => samePos(p, pos))
      if (existing >= 0) {
        this.drawingPath = this.drawingPath.slice(0, existing + 1)
        this.updateDrawPreview()
        return
      }

      if (this.isLeylineTerminal(last, this.getLayer()) && this.drawingPath.length > 1) return

      if (this.world.isSegmentOccupied(last, pos, this.getLayer())) return

      const tile = this.world.getTile(this.getLayer(), pos)
      if (tile === TileType.STONE ||
          tile === TileType.MAGIC_TREE || tile === TileType.MOLDERING_LOG) return

      this.drawingPath.push(pos)
      this.updateDrawPreview()
    })

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.drawingPath) {
        if (this.drawingPath.length >= 2) {
          this.commitLeyline()
        } else if (this.drawingPath.length === 1 && pointer.getDistance() < 10) {
          const pos = this.drawingPath[0]
          const removedId = this.world.removeLeylineAt(pos, this.getLayer())
          if (removedId) {
            this.leylineEngine.onLeylineRemoved(removedId)
            this.drawLeylines()
          }
        }
        this.drawingPath = null
        this.clearDrawPreview()
        return
      }

      if (this.isPinching) return
      if (pointer.getDistance() > 10) return

      const pos = this.pointerToGrid(pointer)
      if (!pos) return
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y)

      this.handleTap(pos, wp)
    })
  }

  private setupPinchZoom(): void {
    const canvas = this.game.canvas
    const touches = new Map<number, { x: number; y: number }>()

    const onTouchStart = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        touches.set(t.identifier, { x: t.clientX, y: t.clientY })
      }
      if (touches.size >= 2) {
        e.preventDefault()
        this.isPinching = true
        const pts = [...touches.values()]
        this.pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        this.pinchStartZoom = this.cameras.main.zoom
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]
        touches.set(t.identifier, { x: t.clientX, y: t.clientY })
      }
      if (this.isPinching && touches.size >= 2) {
        e.preventDefault()
        const pts = [...touches.values()]
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
        if (this.pinchStartDist > 0) {
          const scale = dist / this.pinchStartDist
          const newZoom = Phaser.Math.Clamp(this.pinchStartZoom * scale, 1.2, 4)
          this.cameras.main.setZoom(newZoom)
        }
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        touches.delete(e.changedTouches[i].identifier)
      }
      if (touches.size < 2) {
        if (this.isPinching) {
          this.time.delayedCall(50, () => { this.isPinching = false })
        }
      }
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    this.events.on('shutdown', () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('touchcancel', onTouchEnd)
    })
  }

  protected handleTap(target: GridPos, worldPoint?: { x: number; y: number }): void {
    const debugSeed = getDebugPlantMode()
    if (debugSeed) {
      this.debugPlaceMaturePlant(target, debugSeed)
      return
    }

    const tool = getTool()
    if (tool === 'leyline') return

    this.dismissTooltip()

    const plant = this.world.getPlantAt(target, this.getLayer())
    const tile = this.getGrid()[target.row][target.col]
    const carried = this.world.state.carriedItem

    if (tool === 'shovel') {
      const digResult = this.world.digUpLeyline(target, this.getLayer())
      if (digResult.removed.length > 0) {
        for (const id of digResult.removed) {
          this.leylineEngine.onLeylineRemoved(id)
        }
        this.drawLeylines()
        this.showFloatingText(target, '⛏️ Dug up!', 0xfbbf24)
        return
      }
      if (tile === TileType.HOLE) {
        this.onHoleTap(target)
        return
      }
      this.walkThenAct(target, () => this.onShovelTap(target))
      return
    }

    if (tool === 'plant') {
      this.handlePlantTap(target)
      return
    }

    // Move mode: context-sensitive carry interaction
    if (plant) {
      if (carried && carried.type === 'resource') {
        this.walkThenAct(target, () => this.doDeliverToPlant(target))
      } else {
        this.showPlantTooltip(target, plant)
      }
      return
    }

    if (this.getLayer() === Layer.SURFACE && samePos(target, this.world.state.portal.pos)) {
      this.showPortalTooltip()
      return
    }

    if (tile === TileType.MAGIC_TREE) {
      if (carried && carried.type === 'resource') {
        this.walkThenAct(target, () => this.feedTreeFromCarried(target))
      } else {
        this.walkThenAct(target, () => this.showTreeTooltip(target))
      }
      return
    }

    if (tile === TileType.MOLDERING_LOG) {
      if (!carried) {
        this.walkThenAct(target, () => this.doPickUp(target))
      } else {
        this.showFloatingText(target, 'Hands full!', 0xf87171)
      }
      return
    }

    if (this.isResourceTile(tile)) {
      if (!carried) {
        this.walkThenAct(target, () => this.doPickUp(target))
      } else {
        this.showFloatingText(target, 'Hands full!', 0xf87171)
      }
      return
    }

    const leyAtTile = this.world.state.leylines.find(l =>
      l.layer === this.getLayer() && l.path.some(p => samePos(p, target))
    )
    if (leyAtTile) {
      const res = this.leylineEngine.getActiveResource(leyAtTile.id)
      if (res) {
        if (tile === TileType.HOLE && worldPoint) {
          const hitLey = this.findLeylineNearPoint(worldPoint)
          if (!hitLey) {
            this.handleTapToMove(target)
            return
          }
        }
        const emoji = RESOURCE_EMOJI[res]
        const name = RESOURCE_NAMES[res]
        const scr = this.gridToWorldScreen(target.col, target.row, -HALF_H)
        showTooltip({ screenX: scr.x, screenY: scr.y, html:
          `<div class="tip-header">Leyline</div><div class="tip-desc">Carrying ${emoji} ${name}</div>` })
        return
      }
    }

    this.handleTapToMove(target)
  }

  private handlePlantTap(target: GridPos): void {
    const plant = this.world.getPlantAt(target, this.getLayer())
    const carried = this.world.state.carriedItem

    if (carried && carried.type === 'seed') {
      if (plant) {
        this.showPlantTooltip(target, plant)
        return
      }
      this.walkThenAct(target, () => this.doDeliverToPlant(target))
      return
    }

    if (plant) {
      this.showPlantTooltip(target, plant)
      return
    }

    if (this.getLayer() === Layer.SURFACE && samePos(target, this.world.state.portal.pos)) {
      this.showPortalTooltip()
      return
    }

    this.showFloatingText(target, 'Visit the Magic Tree for seeds', 0xffffff)
  }

  private doDeliverToPlant(pos: GridPos): void {
    const result = this.world.deliverToPlant(pos)

    if (result.type === 'planted') {
      notifyCarriedItem(this.world.state.carriedItem)
      this.addPlantSprite(result.plant)
      this.showFloatingText(pos, `${SEED_DISPLAY[result.plant.seedType].emoji} Planted!`, 0x4ade80)
      this.syncCarriedSprite()
      return
    }

    if (result.type === 'delivered') {
      notifyCarriedItem(this.world.state.carriedItem)
      this.syncCarriedSprite()
      this.showFloatingText(pos, 'Delivered!', 0x4ade80)
      this.showDeliveryEffect(pos, 0x4ade80)

      if (result.advanced) {
        this.time.delayedCall(300, () => {
          const key = `${pos.col},${pos.row}`
          const sprite = this.plantSprites.get(key)
          if (sprite) {
            sprite.setTexture(plantTextureKey(result.plant))

            if (result.plant.stage === GrowthStage.MATURE) {
              this.showFloatingText(pos, `✨ ${STAGE_DISPLAY[result.plant.stage]}!`, 0xfbbf24, -20)
              this.tweens.add({
                targets: sprite,
                scaleX: { from: 0.95, to: 1.1 },
                scaleY: { from: 0.95, to: 1.1 },
                alpha: { from: 0.85, to: 1 },
                duration: 1200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
              })
              const fps = gridToScreen(pos.col, pos.row)
              const flash = this.add.circle(fps.x, fps.y, 4, 0xfef3c7, 0.9)
              flash.setDepth(5000)
              this.tweens.add({
                targets: flash,
                scaleX: 6,
                scaleY: 6,
                alpha: 0,
                duration: 600,
                onComplete: () => flash.destroy(),
              })
            } else {
              this.showFloatingText(pos, `→ ${STAGE_DISPLAY[result.plant.stage]}`, 0x4ade80, -20)
              this.tweens.add({
                targets: sprite,
                scaleX: 1.3,
                scaleY: 1.3,
                duration: 200,
                yoyo: true,
              })
            }
          }
        })
      } else {
        const plant = result.plant
        const req = getStageReq(plant.seedType, plant.stage)
        let progress = ''
        if (req.water > 0) progress += `💧${plant.waterFed}/${req.water}`
        if (req.crystal > 0) {
          const emoji = crystalTypeForSeed(plant.seedType) === 'crystalRed' ? '🔴' : '🔵'
          progress += ` ${emoji}${plant.crystalFed}/${req.crystal}`
        }
        if (req.sunlight > 0) progress += ` ☀️${plant.sunlightFed}/${req.sunlight}`
        this.time.delayedCall(300, () => {
          this.showFloatingText(pos, progress, 0xd1d5db, -20)
        })
      }
      return
    }

    if (result.type === 'not_needed') {
      this.showFloatingText(pos, 'Not needed here', 0xfbbf24)
      return
    }

    if (result.type === 'wrong_type') {
      this.showFloatingText(pos, "Can't place here", 0xf87171)
      return
    }

    if (result.type === 'hands_empty') {
      this.showFloatingText(pos, 'Nothing to give', 0xffffff)
    }
  }

  protected doPickUp(pos: GridPos): void {
    const result = this.world.pickUp(pos)
    if (result.type === 'picked_up') {
      notifyCarriedItem(this.world.state.carriedItem)
      if (result.item.type === 'resource') {
        this.showFloatingText(pos, `${RESOURCE_EMOJI[result.item.resource]} Picked up!`, 0x4ade80)
        this.showPickupEffect(pos, RESOURCE_COLORS[result.item.resource])
      }
      this.syncCarriedSprite()
    } else if (result.type === 'hands_full') {
      this.showFloatingText(pos, 'Hands full!', 0xf87171)
    }
  }

  private showPickupEffect(pos: GridPos, color: number): void {
    const gs = gridToScreen(pos.col, pos.row)
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5
      const dot = this.add.circle(gs.x, gs.y, 2, color, 0.9)
      dot.setDepth(5000)
      this.tweens.add({
        targets: dot,
        x: this.player.x,
        y: this.player.y,
        alpha: 0,
        scale: 0.3,
        duration: 400,
        delay: i * 40,
        ease: 'Sine.easeIn',
        onComplete: () => dot.destroy(),
      })
    }
  }

  private showDeliveryEffect(pos: GridPos, color: number): void {
    const gs = gridToScreen(pos.col, pos.row)
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6
      const dot = this.add.circle(gs.x, gs.y, 2, color, 0.8)
      dot.setDepth(5000)
      dot.setBlendMode(Phaser.BlendModes.ADD)
      this.tweens.add({
        targets: dot,
        x: gs.x + Math.cos(angle) * 15,
        y: gs.y + Math.sin(angle) * 15,
        alpha: 0,
        scale: 0.2,
        duration: 500,
        ease: 'Sine.easeOut',
        onComplete: () => dot.destroy(),
      })
    }
  }

  private handleDrop(): void {
    const dropped = this.world.dropItem()
    if (!dropped) return
    notifyCarriedItem(this.world.state.carriedItem)
    if (dropped.type === 'seed') {
      this.showFloatingText(this.world.state.playerPos, `${SEED_DISPLAY[dropped.seed].emoji} Discarded`, 0xf87171)
    } else {
      this.showFloatingText(this.world.state.playerPos, '💨 Dropped', 0x999999)
    }
    this.syncCarriedSprite()
  }

  private feedTreeFromCarried(treePos: GridPos): void {
    const carried = this.world.state.carriedItem
    if (!carried || carried.type !== 'resource') return
    const emoji = RESOURCE_EMOJI[carried.resource]
    this.world.deliverToTree()
    notifyCarriedItem(null)
    this.syncCarriedSprite()
    this.showFloatingText(treePos, `${emoji} Fed tree!`, 0xa78bfa)
    this.showDeliveryEffect(treePos, 0xa78bfa)
  }

  private showTreeTooltip(pos: GridPos): void {
    const scr = this.gridToWorldScreen(pos.col, pos.row, -HALF_H)
    const buf = this.world.state.treeBuffer
    const ALL_SEEDS: SeedType[] = [
      SeedType.WATER_LILY, SeedType.SUNFLOWER, SeedType.LIFELEAF, SeedType.DEWBELL,
      SeedType.LICHEN, SeedType.ROOTWEAVE, SeedType.GLIMSTONE,
    ]

    let html = `<div class="tip-header">🌳 Magic Tree</div>`

    const bufEntries: string[] = []
    for (const [key, val] of Object.entries(buf)) {
      if (val > 0) {
        const r = key as ResourceType
        bufEntries.push(`${RESOURCE_EMOJI[r]}${val}`)
      }
    }
    html += `<div class="tip-stage">Buffer: ${bufEntries.length > 0 ? bufEntries.join(' ') : 'empty'}</div>`
    html += `<div class="tip-desc" style="margin-bottom:6px">Carry resources here or route leylines</div>`

    for (const seed of ALL_SEEDS) {
      const cost = this.world.getTreeSeedCost(seed)
      const display = SEED_DISPLAY[seed]
      const canAfford = this.world.canAffordTreeSeed(seed)
      const emoji = RESOURCE_EMOJI[cost.resource]
      const cls = canAfford ? 'tree-buy-btn' : 'tree-buy-btn tree-buy-disabled'
      html += `<button class="${cls}" data-seed="${seed}">${display.emoji} ${display.name} — ${emoji}${cost.amount}</button>`
    }

    showTooltip({ screenX: scr.x, screenY: scr.y, html })
  }

  private handleTreeBuy(seed: SeedType): void {
    const result = this.world.buyTreeSeed(seed)
    if (result.type === 'bought') {
      notifyCarriedItem(this.world.state.carriedItem)
      this.syncCarriedSprite()
      const display = SEED_DISPLAY[seed]
      this.showFloatingText({ col: 16, row: 6 }, `${display.emoji} Bought!`, 0xa78bfa)
      this.showPickupEffect({ col: 16, row: 6 }, 0xa78bfa)
      this.dismissTooltip()
    } else if (result.type === 'hands_full') {
      this.showFloatingText(this.world.state.playerPos, 'Hands full!', 0xf87171)
    } else {
      this.showFloatingText(this.world.state.playerPos, "Can't afford", 0xf87171)
    }
  }

  protected syncCarriedSprite(): void {
    const carried = this.world.state.carriedItem
    if (!carried) {
      if (this.carriedSprite) {
        this.carriedSprite.destroy()
        this.carriedSprite = null
      }
      return
    }

    const key = carriedTextureKey(carried)
    if (!this.carriedSprite) {
      this.carriedSprite = this.add.sprite(0, 0, key)
    } else {
      this.carriedSprite.setTexture(key)
    }

    const off = CARRY_OFFSETS[this.facing]
    this.carriedSprite.setPosition(this.player.x + off.x, this.player.y + off.y)
    this.carriedSprite.setDepth(this.player.depth + 1)
  }

  private isResourceTile(tile: TileType): boolean {
    return tile === TileType.WATER || tile === TileType.CRYSTAL_RED ||
           tile === TileType.CRYSTAL_BLUE
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const cam = this.cameras.main
    return {
      x: (wx - cam.worldView.x) * cam.zoom,
      y: (wy - cam.worldView.y) * cam.zoom,
    }
  }

  protected gridToWorldScreen(col: number, row: number, yOffset = 0): { x: number; y: number } {
    const gs = gridToScreen(col, row)
    return this.worldToScreen(gs.x, gs.y + yOffset)
  }

  private findLeylineNearPoint(wp: { x: number; y: number }): Leyline | null {
    const HIT_DIST = 12
    const layer = this.getLayer()
    for (const ley of this.world.state.leylines) {
      if (ley.layer !== layer || ley.path.length < 2) continue
      for (let i = 0; i < ley.path.length - 1; i++) {
        const a = gridToScreen(ley.path[i].col, ley.path[i].row)
        const b = gridToScreen(ley.path[i + 1].col, ley.path[i + 1].row)
        const dx = b.x - a.x, dy = b.y - a.y
        const len2 = dx * dx + dy * dy
        if (len2 === 0) continue
        const t = Math.max(0, Math.min(1, ((wp.x - a.x) * dx + (wp.y - a.y) * dy) / len2))
        const px = a.x + t * dx, py = a.y + t * dy
        const dist = Math.sqrt((wp.x - px) ** 2 + (wp.y - py) ** 2)
        if (dist <= HIT_DIST) return ley
      }
    }
    return null
  }

  private isLeylineTerminal(pos: GridPos, layer: Layer): boolean {
    const tile = this.world.getTile(layer, pos)
    if (tile === TileType.HOLE || tile === TileType.WATER ||
        tile === TileType.CRYSTAL_RED || tile === TileType.CRYSTAL_BLUE) return true
    if (this.world.getPlantAt(pos, layer)) return true
    return false
  }

  private dismissTooltip(): void {
    this.activeTooltipPlant = null
    this.activeTooltipPortal = false
    hideTooltip()
  }

  private refreshActiveTooltip(): void {
    if (this.activeTooltipPortal) {
      this.showPortalTooltip(false)
      return
    }
    if (!this.activeTooltipPlant) return
    const { pos, layer } = this.activeTooltipPlant
    const plant = this.world.getPlantAt(pos, layer)
    if (!plant) {
      this.activeTooltipPlant = null
      this.dismissTooltip()
      return
    }
    this.showPlantTooltip(pos, plant, false)
  }

  private showPlantTooltip(pos: GridPos, plant: Plant, track = true): void {
    if (track) this.activeTooltipPlant = { pos, layer: plant.layer }
    const scr = this.gridToWorldScreen(pos.col, pos.row, -HALF_H)
    const display = SEED_DISPLAY[plant.seedType]
    const stageIcon = plant.stage === GrowthStage.MATURE ? '✨' : '🌱'
    let html = `<div class="tip-header">${display.emoji} ${display.name}</div>`
    html += `<div class="tip-stage">${stageIcon} ${STAGE_DISPLAY[plant.stage]}</div>`

    if (plant.stage !== GrowthStage.MATURE) {
      const req = getStageReq(plant.seedType, plant.stage)
      const needs: string[] = []
      if (req.water > 0) needs.push(`💧 ${plant.waterFed}/${req.water}`)
      if (req.crystal > 0) {
        const emoji = crystalTypeForSeed(plant.seedType) === 'crystalRed' ? '🔴' : '🔵'
        needs.push(`${emoji} ${plant.crystalFed}/${req.crystal}`)
      }
      if (req.sunlight > 0) needs.push(`☀️ ${plant.sunlightFed}/${req.sunlight}`)
      if (needs.length > 0) {
        html += `<div class="tip-needs">Needs: ${needs.join(' ')}</div>`
      }
    }

    const recipe = getTransmuteRecipe(plant.seedType)
    const tile = this.world.getTile(plant.layer, pos)
    const output = getPlantOutput(plant, tile)
    const outEmoji = RESOURCE_EMOJI[output]
    const outName = RESOURCE_NAMES[output]

    if (isSourcePlant(plant.seedType)) {
      html += `<div class="tip-prod">Produces ${outEmoji} ${outName}</div>`
    } else {
      const in1 = RESOURCE_EMOJI[recipe.input1!]
      const in2 = RESOURCE_EMOJI[recipe.input2!]
      html += `<div class="tip-prod">${in1} + ${in2} → ${outEmoji} ${outName}</div>`
      if (plant.stage === GrowthStage.MATURE) {
        html += `<div class="tip-buffer">Buffer: ${in1}${plant.transmuteInput1}/3 ${in2}${plant.transmuteInput2}/3</div>`
      }
    }

    showTooltip({ screenX: scr.x, screenY: scr.y, html })
  }

  private showPortalTooltip(track = true): void {
    if (track) this.activeTooltipPortal = true
    const portal = this.world.state.portal
    const pos = portal.pos
    const scr = this.gridToWorldScreen(pos.col, pos.row, -HALF_H)
    const info = this.world.portalProgress()
    let html = `<div class="tip-header">🌀 Portal</div>`
    html += `<div class="tip-stage">Level ${info.level}</div>`
    html += `<div class="tip-needs">💚 ${info.greenFed}/${info.nextThreshold} 🎵 ${info.musicFed}/${info.nextThreshold}</div>`
    html += `<div class="tip-desc">Feed Green Crystals and Music Notes</div>`
    showTooltip({ screenX: scr.x, screenY: scr.y, html })
  }

  private showTileTooltip(pos: GridPos, tile: TileType): void {
    const scr = this.gridToWorldScreen(pos.col, pos.row, -HALF_H)
    const INFO: Partial<Record<TileType, { name: string; desc: string }>> = {
      [TileType.WATER]: { name: '💧 Water Pool', desc: 'Tap to pick up water' },
      [TileType.CRYSTAL_RED]: { name: '🔴 Red Crystal Vein', desc: 'Tap to pick up crystal' },
      [TileType.CRYSTAL_BLUE]: { name: '🔵 Blue Crystal Vein', desc: 'Tap to pick up crystal' },
      [TileType.HOLE]: { name: '🕳️ Passage', desc: 'Walk here to change layers' },
      [TileType.MAGIC_TREE]: { name: '🌳 Magic Tree', desc: 'Trade resources for seeds' },
      [TileType.MOLDERING_LOG]: { name: '🍄 Moldering Log', desc: 'Tap to pick up life essence' },
    }
    const info = INFO[tile]
    if (!info) return
    const html = `<div class="tip-header">${info.name}</div><div class="tip-desc">${info.desc}</div>`
    showTooltip({ screenX: scr.x, screenY: scr.y, html })
  }

  protected showFloatingText(pos: GridPos, text: string, color: number, yOffset = 0): void {
    const gs = gridToScreen(pos.col, pos.row)
    const x = gs.x
    const y = gs.y + yOffset
    const hex = `#${color.toString(16).padStart(6, '0')}`
    const txt = this.add.text(x, y, text, {
      fontSize: '10px',
      color: hex,
      fontFamily: 'system-ui, sans-serif',
      stroke: '#000000',
      strokeThickness: 2,
    })
    txt.setOrigin(0.5)
    txt.setDepth(5001)
    this.tweens.add({
      targets: txt,
      y: y - 18,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    })
  }

  protected walkThenAct(target: GridPos, action: () => void): void {
    const playerPos = this.world.state.playerPos
    if (playerPos.col === target.col && playerPos.row === target.row) {
      action()
      return
    }

    const neighbors = [
      { col: target.col - 1, row: target.row },
      { col: target.col + 1, row: target.row },
      { col: target.col, row: target.row - 1 },
      { col: target.col, row: target.row + 1 },
    ]

    let bestPath: GridPos[] | null = null
    for (const n of neighbors) {
      if (n.col < 0 || n.col >= WORLD_COLS || n.row < 0 || n.row >= WORLD_ROWS) continue
      const path = this.world.findPath(n)
      if (path && (!bestPath || path.length < bestPath.length)) {
        bestPath = path
      }
    }

    if (Math.abs(playerPos.col - target.col) + Math.abs(playerPos.row - target.row) <= 1) {
      action()
      return
    }

    if (!bestPath || bestPath.length < 2) return

    this.pendingAction = action
    this.currentPath = bestPath
    this.pathIndex = 1
    this.isMoving = true
  }

  protected handleTapToMove(target: GridPos): void {
    const path = this.world.findPath(target)
    if (!path || path.length < 2) return

    this.pendingAction = null

    if (this.moveTarget) this.moveTarget.destroy()
    const mt = gridToScreen(target.col, target.row)
    this.moveTarget = this.add.sprite(mt.x, mt.y, 'move_target')
    this.moveTarget.setDepth(isoDepth(target.col, target.row, 0))
    this.moveTarget.setAlpha(0.8)
    this.tweens.add({
      targets: this.moveTarget,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 600,
      onComplete: () => {
        this.moveTarget?.destroy()
        this.moveTarget = null
      },
    })

    this.currentPath = path
    this.pathIndex = 1
    this.isMoving = true
  }

  private commitLeyline(): void {
    if (!this.drawingPath || this.drawingPath.length < 2) return
    const { consumed } = this.world.addAndMergeLeyline(this.drawingPath, this.getLayer())
    for (const id of consumed) this.leylineEngine.onLeylineRemoved(id)
    this.drawLeylines()
    const endPos = this.drawingPath[this.drawingPath.length - 1]
    this.showFloatingText(endPos, '✨ Path laid!', 0x4ade80)
  }

  protected drawLeylines(): void {
    this.leylineGraphics.clear()
    const leylines = this.world.getLeylines(this.getLayer())

    for (const ley of leylines) {
      if (ley.path.length < 2) continue
      const res = this.leylineEngine.getActiveResource(ley.id)
      const color = res ? RESOURCE_COLORS[res] : 0xcccccc
      const alpha = res ? 0.5 : 0.25

      const first = ley.path[0]
      const fp = gridToScreen(first.col, first.row)
      const isUnderground = this.getLayer() === Layer.UNDERGROUND

      // Underground glow: draw a wider, faint background stroke for a glow effect
      if (isUnderground) {
        this.leylineGraphics.lineStyle(7, color, res ? 0.15 : 0.08)
        this.leylineGraphics.beginPath()
        this.leylineGraphics.moveTo(fp.x, fp.y)
        for (let i = 1; i < ley.path.length; i++) {
          const p = ley.path[i]
          const pp = gridToScreen(p.col, p.row)
          this.leylineGraphics.lineTo(pp.x, pp.y)
        }
        this.leylineGraphics.strokePath()
      }

      if (res) {
        const segments = ley.path.length - 1
        const SHIMMER_STEPS = 6
        const phase = this.pulseTime / 3000
        for (let i = 0; i < segments; i++) {
          const a = ley.path[i]
          const b = ley.path[i + 1]
          const as = gridToScreen(a.col, a.row)
          const bs = gridToScreen(b.col, b.row)
          for (let s = 0; s < SHIMMER_STEPS; s++) {
            const t0 = s / SHIMMER_STEPS
            const t1 = (s + 1) / SHIMMER_STEPS
            const frac = (i + t0) / segments
            const baseShimmer = 0.3 + 0.35 * (Math.sin((frac - phase) * Math.PI * 2) * 0.5 + 0.5)
            const shimmer = isUnderground ? Math.min(baseShimmer + 0.2, 1.0) : baseShimmer
            const x0 = as.x + (bs.x - as.x) * t0
            const y0 = as.y + (bs.y - as.y) * t0
            const x1 = as.x + (bs.x - as.x) * t1
            const y1 = as.y + (bs.y - as.y) * t1
            this.leylineGraphics.lineStyle(3, color, shimmer)
            this.leylineGraphics.beginPath()
            this.leylineGraphics.moveTo(x0, y0)
            this.leylineGraphics.lineTo(x1, y1)
            this.leylineGraphics.strokePath()
          }
        }
      } else {
        this.leylineGraphics.lineStyle(2, color, alpha)
        this.leylineGraphics.beginPath()
        this.leylineGraphics.moveTo(fp.x, fp.y)
        for (let i = 1; i < ley.path.length; i++) {
          const p = ley.path[i]
          const pp = gridToScreen(p.col, p.row)
          this.leylineGraphics.lineTo(pp.x, pp.y)
        }
        this.leylineGraphics.strokePath()
      }

      this.leylineGraphics.fillStyle(color, res ? 0.7 : alpha * 0.6)
      this.leylineGraphics.fillCircle(fp.x, fp.y, 4)

      const last = ley.path[ley.path.length - 1]
      const lp = gridToScreen(last.col, last.row)
      this.leylineGraphics.fillStyle(color, res ? 0.8 : alpha * 0.8)
      this.leylineGraphics.fillCircle(lp.x, lp.y, 3)
    }
  }

  /** Create lighting overlays and glow effects based on current layer. */
  private setupLighting(): void {
    const bounds = isoWorldBounds()
    const pad = 400

    if (this.getLayer() === Layer.SURFACE) {
      // Surface time-of-day multiply overlay
      const tint = getTimeOfDayTint(this.world.state.weather.timeOfDay)
      this.lightOverlay = this.add.rectangle(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
        bounds.width + pad * 2,
        bounds.height + pad * 2,
        tint,
        1.0,
      )
      this.lightOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY)
      this.lightOverlay.setDepth(9000)
      this.lightOverlay.setScrollFactor(1)

      // Magic tree glow
      const treePos = gridToScreen(16, 6)
      const treeGlow = this.add.circle(treePos.x, treePos.y - 24, HALF_W * 1.2, 0xa8e6cf, 0.2)
      treeGlow.setBlendMode(Phaser.BlendModes.ADD)
      treeGlow.setDepth(9050)
      this.tweens.add({
        targets: treeGlow,
        scaleX: { from: 0.9, to: 1.3 },
        scaleY: { from: 0.9, to: 1.3 },
        alpha: { from: 0.2, to: 0.05 },
        duration: 3000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })

      // Magic tree sprite above overlay
      const treeTileSprite = this.tileSprites[6]?.[16]
      if (treeTileSprite) treeTileSprite.setDepth(9050)
    } else {
      // Underground dark overlay — moderately dim, not pitch black
      this.lightOverlay = this.add.rectangle(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
        bounds.width + pad * 2,
        bounds.height + pad * 2,
        0x556655,
        1.0,
      )
      this.lightOverlay.setBlendMode(Phaser.BlendModes.MULTIPLY)
      this.lightOverlay.setDepth(9000)
      this.lightOverlay.setScrollFactor(1)

      // Create crystal glows and hole light shafts
      this.createUndergroundGlows()
    }
  }

  private createUndergroundGlows(): void {
    const grid = this.getGrid()
    const visited = new Set<string>()

    const floodFill = (startR: number, startC: number, tileType: TileType): Array<{c: number, r: number}> => {
      const group: Array<{c: number, r: number}> = []
      const stack = [{r: startR, c: startC}]
      while (stack.length > 0) {
        const {r, c} = stack.pop()!
        const k = `${c},${r}`
        if (visited.has(k)) continue
        if (r < 0 || r >= WORLD_ROWS || c < 0 || c >= WORLD_COLS) continue
        if (grid[r][c] !== tileType) continue
        visited.add(k)
        group.push({c, r})
        stack.push({r: r-1, c}, {r: r+1, c}, {r, c: c-1}, {r, c: c+1})
      }
      return group
    }

    for (let r = 0; r < WORLD_ROWS; r++) {
      for (let c = 0; c < WORLD_COLS; c++) {
        const tile = grid[r][c]

        if ((tile === TileType.CRYSTAL_RED || tile === TileType.CRYSTAL_BLUE) && !visited.has(`${c},${r}`)) {
          const group = floodFill(r, c, tile)
          let cx = 0, cy = 0
          for (const t of group) {
            const s = gridToScreen(t.c, t.r)
            cx += s.x; cy += s.y
          }
          cx /= group.length; cy /= group.length
          const spanC = group.reduce((mx, t) => Math.max(mx, t.c), 0) - group.reduce((mn, t) => Math.min(mn, t.c), Infinity) + 1
          const spanR = group.reduce((mx, t) => Math.max(mx, t.r), 0) - group.reduce((mn, t) => Math.min(mn, t.r), Infinity) + 1
          const w = HALF_W * 2 * (0.8 + 0.4 * (spanC - 1)) * 1.3
          const h = HALF_H * 2 * (0.8 + 0.4 * (spanR - 1)) * 1.3
          const color = tile === TileType.CRYSTAL_RED ? 0xef4444 : 0x6666ff
          const glow = this.add.ellipse(cx, cy, w, h, color, 0.25)
          glow.setBlendMode(Phaser.BlendModes.ADD)
          glow.setDepth(9050)
          this.crystalGlows.set(`group_${c},${r}`, glow)
        }

        if (tile === TileType.HOLE) {
          const sp = gridToScreen(c, r)
          const timeOfDay = this.world.state.weather.timeOfDay
          const tint = getTimeOfDayTint(timeOfDay)
          const alpha = getHoleLightAlpha(timeOfDay)
          const glow = this.add.ellipse(sp.x, sp.y, HALF_W * 2.6, HALF_H * 2.6, tint, alpha)
          glow.setBlendMode(Phaser.BlendModes.ADD)
          glow.setDepth(9050)
          this.holeLightGlows.set(`${c},${r}`, glow)
        }
      }
    }
  }

  /** Update lighting overlays and glow each frame. */
  private updateLighting(delta: number): void {
    const weather = this.world.state.weather

    // Update cloud factor (ramp toward 1 when raining, 0 when clear)
    const rampRate = delta / 60000 // reach target in ~60 seconds
    if (weather.isRaining) {
      this.cloudFactor = Math.min(1.0, this.cloudFactor + rampRate)
    } else {
      this.cloudFactor = Math.max(0.0, this.cloudFactor - rampRate)
    }

    if (this.getLayer() === Layer.SURFACE) {
      // Update surface overlay tint with time-of-day + cloud dimming
      if (this.lightOverlay) {
        const baseTint = getTimeOfDayTint(weather.timeOfDay)
        const finalTint = getCloudedTint(baseTint, this.cloudFactor)
        this.lightOverlay.setFillStyle(finalTint)
      }
    } else {
      // Underground: update hole light shaft glows
      for (const [, glow] of this.holeLightGlows) {
        const tint = getTimeOfDayTint(weather.timeOfDay)
        const cloudedTint = getCloudedTint(tint, this.cloudFactor)
        const baseAlpha = getHoleLightAlpha(weather.timeOfDay)
        // Dim alpha further when cloudy
        const alpha = baseAlpha * (1.0 - this.cloudFactor * 0.3)
        glow.setFillStyle(cloudedTint, alpha)
      }
    }
  }

  protected updateLightShaftTints(): void {}

  private updateRain(delta: number): void {
    if (!this.rainGraphics) return
    this.rainGraphics.clear()

    const isRaining = this.world.state.weather.isRaining

    if (this.getLayer() === Layer.SURFACE && isRaining) {
      this.rainTime += delta
      const cam = this.cameras.main
      const w = cam.width
      const h = cam.height
      const density = 80
      const seed = Math.floor(this.rainTime / 50)

      this.rainGraphics.lineStyle(1, 0x88aadd, 0.4)
      for (let i = 0; i < density; i++) {
        const hash = (seed * 127 + i * 311) & 0xffff
        const x = (hash * 7919) % w
        const yBase = ((hash * 6271 + this.rainTime * 0.8) % (h + 40)) - 20
        this.rainGraphics.beginPath()
        this.rainGraphics.moveTo(x, yBase)
        this.rainGraphics.lineTo(x - 4, yBase + 14)
        this.rainGraphics.strokePath()
      }
    }

    if (this.getLayer() === Layer.UNDERGROUND && isRaining) {
      this.splashTimer += delta
      if (this.splashTimer > 300) {
        this.splashTimer = 0
        const grid = this.getGrid()
        for (let r = 0; r < WORLD_ROWS; r++) {
          for (let c = 0; c < WORLD_COLS; c++) {
            if (grid[r][c] !== TileType.HOLE) continue
            if (Math.random() > 0.3) continue
            const sp = gridToScreen(c, r)
            const ox = (Math.random() - 0.5) * HALF_W * 0.8
            const oy = (Math.random() - 0.5) * HALF_H * 0.8
            const splash = this.add.circle(sp.x + ox, sp.y + oy, 2, 0x88bbee, 0.6)
            splash.setBlendMode(Phaser.BlendModes.ADD)
            splash.setDepth(9060)
            this.holeSplashes.push({ x: sp.x + ox, y: sp.y + oy, sprite: splash, timer: 0 })
          }
        }
      }

      for (let i = this.holeSplashes.length - 1; i >= 0; i--) {
        const s = this.holeSplashes[i]
        s.timer += delta
        const t = s.timer / 400
        s.sprite.setScale(1 + t * 3)
        s.sprite.setAlpha(0.6 * (1 - t))
        if (t >= 1) {
          s.sprite.destroy()
          this.holeSplashes.splice(i, 1)
        }
      }
    } else {
      for (const s of this.holeSplashes) s.sprite.destroy()
      this.holeSplashes.length = 0
    }
  }

  private handleDebugAction(action: DebugAction): void {
    const weather = this.world.state.weather
    if (action.type === 'toggleRain') {
      weather.isRaining = !weather.isRaining
      weather.rainTimer = 60_000
      notifyWeather(weather)
    } else if (action.type === 'toggleDayNight') {
      weather.timeOfDay = weather.timeOfDay >= 0.25 && weather.timeOfDay < 0.75 ? 0.85 : 0.5
      notifyWeather(weather)
    } else if (action.type === 'placeMaturePlant') {
      // Handled in handleTap via getDebugPlantMode()
    }
  }

  private debugPlaceMaturePlant(pos: GridPos, seed: SeedType): void {
    const layer = this.getLayer()
    if (seedLayer(seed) !== layer) {
      this.showFloatingText(pos, 'Wrong layer!', 0xf87171)
      return
    }
    if (this.world.getPlantAt(pos, layer)) {
      this.showFloatingText(pos, 'Occupied!', 0xf87171)
      return
    }
    const key = `${layer}:${pos.col},${pos.row}`
    const plant: Plant = {
      pos: { ...pos }, layer, seedType: seed,
      stage: GrowthStage.MATURE,
      waterFed: 0, crystalFed: 0, sunlightFed: 0,
      transmuteInput1: 0, transmuteInput2: 0,
    }
    this.world.state.plants[key] = plant
    this.addPlantSprite(plant)
    const display = SEED_DISPLAY[seed]
    this.showFloatingText(pos, `${display.emoji} Placed!`, 0x22c55e)
  }

  private updateEmissionDebug(): void {
    if (!this.debugGraphics) return
    this.debugGraphics.clear()
    for (const t of this.debugTexts) t.destroy()
    this.debugTexts.length = 0
    if (!isDebugEmissionEnabled()) return

    const debugData = this.leylineEngine.getEmissionDebug(this.world)
    const layer = this.getLayer()

    for (const entry of debugData) {
      if (entry.layer !== layer) continue
      const sp = gridToScreen(entry.plantPos.col, entry.plantPos.row)

      if (entry.canEmit && entry.targetTile) {
        this.debugGraphics.fillStyle(0x00ff00, 0.5)
        this.debugGraphics.fillCircle(sp.x, sp.y - 12, 4)

        const tp = gridToScreen(entry.targetTile.col, entry.targetTile.row)
        this.debugGraphics.lineStyle(2, 0x00ff00, 0.4)
        this.debugGraphics.beginPath()
        this.debugGraphics.moveTo(sp.x, sp.y - 12)
        this.debugGraphics.lineTo(tp.x, tp.y)
        this.debugGraphics.strokePath()

        this.debugGraphics.fillStyle(0x00ff00, 0.3)
        this.debugGraphics.fillCircle(tp.x, tp.y, 6)

        const label = this.add.text(sp.x, sp.y - 22, entry.reason, { fontSize: '8px', color: '#00ff00' })
        label.setOrigin(0.5, 1).setDepth(9401)
        this.debugTexts.push(label)
      } else {
        this.debugGraphics.fillStyle(0xff4444, 0.5)
        this.debugGraphics.fillCircle(sp.x, sp.y - 12, 4)

        this.debugGraphics.lineStyle(1, 0xff4444, 0.6)
        this.debugGraphics.beginPath()
        this.debugGraphics.moveTo(sp.x - 4, sp.y - 16)
        this.debugGraphics.lineTo(sp.x + 4, sp.y - 8)
        this.debugGraphics.moveTo(sp.x + 4, sp.y - 16)
        this.debugGraphics.lineTo(sp.x - 4, sp.y - 8)
        this.debugGraphics.strokePath()

        const label = this.add.text(sp.x, sp.y - 22, entry.reason, { fontSize: '8px', color: '#ff4444' })
        label.setOrigin(0.5, 1).setDepth(9401)
        this.debugTexts.push(label)
      }
    }
  }

  private drawDirectionArrow(from: GridPos, to: GridPos, color: number, alpha: number): void {
    const fs = gridToScreen(from.col, from.row)
    const ts = gridToScreen(to.col, to.row)
    const mx = (fs.x + ts.x) / 2
    const my = (fs.y + ts.y) / 2
    const adx = ts.x - fs.x
    const ady = ts.y - fs.y
    const len = Math.sqrt(adx * adx + ady * ady)
    if (len === 0) return
    const nx = adx / len
    const ny = ady / len
    const px = -ny
    const py = nx
    const size = 3

    this.leylineGraphics.fillStyle(color, alpha)
    this.leylineGraphics.fillTriangle(
      mx - nx * size + px * size, my - ny * size + py * size,
      mx - nx * size - px * size, my - ny * size - py * size,
      mx + nx * size, my + ny * size,
    )
  }

  private updateDrawPreview(): void {
    this.drawPreviewGraphics.clear()
    if (!this.drawingPath) return

    const color = 0xffffff

    this.drawPreviewGraphics.lineStyle(3, color, 0.5)
    this.drawPreviewGraphics.beginPath()
    const first = this.drawingPath[0]
    const fp = gridToScreen(first.col, first.row)
    this.drawPreviewGraphics.moveTo(fp.x, fp.y)
    for (let i = 1; i < this.drawingPath.length; i++) {
      const p = this.drawingPath[i]
      const pp = gridToScreen(p.col, p.row)
      this.drawPreviewGraphics.lineTo(pp.x, pp.y)
    }
    this.drawPreviewGraphics.strokePath()

    for (let i = 0; i < this.drawingPath.length - 1; i++) {
      const from = this.drawingPath[i]
      const to = this.drawingPath[i + 1]
      const fs = gridToScreen(from.col, from.row)
      const ts = gridToScreen(to.col, to.row)
      const mx = (fs.x + ts.x) / 2
      const my = (fs.y + ts.y) / 2
      const adx = ts.x - fs.x
      const ady = ts.y - fs.y
      const len = Math.sqrt(adx * adx + ady * ady)
      if (len === 0) continue
      const nx = adx / len
      const ny = ady / len
      const px = -ny
      const py = nx
      const s = 3

      this.drawPreviewGraphics.fillStyle(color, 0.6)
      this.drawPreviewGraphics.fillTriangle(
        mx - nx * s + px * s, my - ny * s + py * s,
        mx - nx * s - px * s, my - ny * s - py * s,
        mx + nx * s, my + ny * s,
      )
    }

    this.drawPreviewGraphics.fillStyle(color, 0.4)
    this.drawPreviewGraphics.fillCircle(fp.x, fp.y, 5)

    if (this.drawingPath.length >= 2) {
      const last = this.drawingPath[this.drawingPath.length - 1]
      const lp = gridToScreen(last.col, last.row)
      this.drawPreviewGraphics.fillStyle(color, 0.4)
      this.drawPreviewGraphics.fillCircle(lp.x, lp.y, 4)
    }
  }

  private clearDrawPreview(): void {
    this.drawPreviewGraphics.clear()
  }

  private checkPlantUpdates(): void {
    const plants = this.world.getPlantsForLayer(this.getLayer())
    let hadNewMature = false

    for (const plant of plants) {
      const key = `${plant.pos.col},${plant.pos.row}`
      const sprite = this.plantSprites.get(key)
      if (!sprite) continue

      const expected = `plant_${plant.seedType}_${plant.stage}`
      if (sprite.texture.key !== expected) {
        sprite.setTexture(expected)
        if (plant.stage === GrowthStage.MATURE) {
          hadNewMature = true
          sprite.setDepth(9050 + (plant.pos.col + plant.pos.row) * 0.1)
          this.tweens.add({
            targets: sprite,
            scaleX: { from: 0.95, to: 1.1 },
            scaleY: { from: 0.95, to: 1.1 },
            alpha: { from: 0.85, to: 1 },
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          })
          const cps = gridToScreen(plant.pos.col, plant.pos.row)
          const flash = this.add.circle(cps.x, cps.y, 4, 0xfef3c7, 0.9)
          flash.setDepth(5000)
          this.tweens.add({
            targets: flash,
            scaleX: 6, scaleY: 6, alpha: 0,
            duration: 600,
            onComplete: () => flash.destroy(),
          })
          this.showFloatingText(plant.pos, '✨ Mature!', 0xfbbf24)
        } else {
          this.tweens.add({
            targets: sprite,
            scaleX: 1.3, scaleY: 1.3,
            duration: 200,
            yoyo: true,
          })
        }
      }
    }

    if (hadNewMature) {
      const unlockResult = this.world.checkUnlocks()
      if (unlockResult.leylineJustUnlocked) {
        setUnlocks(this.world.state.unlocks)
        this.showUnlockCelebration('✨ Leylines Unlocked!', 0xfbbf24)
      }
    }
  }

  private showUnlockCelebration(message: string, color: number): void {
    const cam = this.cameras.main
    const cx = cam.scrollX + cam.width / 2
    const cy = cam.scrollY + cam.height / 2

    const hex = `#${color.toString(16).padStart(6, '0')}`
    const txt = this.add.text(cx, cy, message, {
      fontSize: '16px',
      color: hex,
      fontFamily: 'system-ui, sans-serif',
      stroke: '#000000',
      strokeThickness: 3,
    })
    txt.setOrigin(0.5)
    txt.setDepth(5002)
    txt.setScrollFactor(0)
    txt.setPosition(cam.width / 2, cam.height / 2)

    this.tweens.add({
      targets: txt,
      scaleX: { from: 0.5, to: 1.2 },
      scaleY: { from: 0.5, to: 1.2 },
      duration: 400,
      ease: 'Back.easeOut',
    })
    this.tweens.add({
      targets: txt,
      y: txt.y - 40,
      alpha: 0,
      duration: 2500,
      delay: 800,
      onComplete: () => txt.destroy(),
    })

    cam.shake(300, 0.003)
  }

  update(_time: number, delta: number): void {
    this.floatTime += delta
    this.pulseTime += delta
    const floatOffset = Math.sin(this.floatTime / 600) * 3
    this.player.y = this.playerBaseY + floatOffset

    this.leylineEngine.tick(delta, this.world)
    notifyEmitProgress(this.leylineEngine.getEmitProgress(), this.leylineEngine.emittedThisFrame)
    if (this.leylineEngine.emittedThisFrame) {
      advanceClock(this.world.state)
      weatherFeedTick(this.world.state)
    }
    tickWeather(this.world.state, delta)

    this.weatherHudTimer += delta
    if (this.weatherHudTimer >= 1000 || this.leylineEngine.emittedThisFrame) {
      this.weatherHudTimer = 0
      notifyWeather(this.world.state.weather)
    }

    this.drawLeylines()
    this.updateLighting(delta)
    this.updateLightShaftTints()
    this.updateRain(delta)
    this.updateEmissionDebug()
    this.motePool.update(this.leylineEngine.getMotePositions(this.getLayer(), this.world))
    this.processAbsorptions()
    this.refreshActiveTooltip()
    this.checkPlantUpdates()
    this.updatePortalSprite()

    if (this.isMoving && this.currentPath) {
      const target = this.currentPath[this.pathIndex]
      const playerPos = this.world.state.playerPos
      const dcol = target.col - playerPos.col
      const drow = target.row - playerPos.row
      const newFacing = facingFromDelta(dcol, drow)
      if (newFacing !== this.facing) {
        this.facing = newFacing
        this.player.play(`pixie_${this.facing}`)
      }
    }

    if (this.carriedSprite) {
      const off = CARRY_OFFSETS[this.facing]
      const carryBob = Math.sin(this.floatTime / 400) * 1.5
      this.carriedSprite.setPosition(this.player.x + off.x, this.player.y + off.y + carryBob)
      this.carriedSprite.setDepth(this.player.depth + 1)
    }

    if (!this.isMoving || !this.currentPath) {
      this.updateKeyboardMovement()
      return
    }

    const target = this.currentPath[this.pathIndex]
    const targetPos = gridToScreen(target.col, target.row)
    const targetX = targetPos.x
    const targetY = targetPos.y

    const dx = targetX - this.player.x
    const dy = targetY - this.playerBaseY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const step = (this.moveSpeed * delta) / 1000

    if (dist <= step) {
      this.player.x = targetX
      this.playerBaseY = targetY
      this.player.setDepth(9055 + (target.col + target.row) * 0.1)
      this.world.movePlayer(target)

      this.pathIndex++

      const tile = this.getGrid()[target.row]?.[target.col]
      if (tile === TileType.HOLE) {
        this.isMoving = false
        this.currentPath = null
        this.pendingAction = null
        this.onArrivedAt(target)
        return
      }

      if (this.pathIndex >= this.currentPath.length) {
        this.isMoving = false
        this.currentPath = null
        if (this.pendingAction) {
          const action = this.pendingAction
          this.pendingAction = null
          action()
        } else {
          this.onArrivedAt(target)
        }
      }
    } else {
      this.player.x += (dx / dist) * step
      this.playerBaseY += (dy / dist) * step
    }
  }

  // --- Keyboard input ---

  private setupKeyboard(): void {
    const kb = this.input.keyboard
    if (!kb) return

    const cursors = kb.createCursorKeys()
    this.kbUp = cursors.up!
    this.kbDown = cursors.down!
    this.kbLeft = cursors.left!
    this.kbRight = cursors.right!
    this.kbW = kb.addKey('W')
    this.kbA = kb.addKey('A')
    this.kbS = kb.addKey('S')
    this.kbD = kb.addKey('D')

    this.boundKeyDown = (e: KeyboardEvent) => this.onKeyDown(e)
    window.addEventListener('keydown', this.boundKeyDown)

    this.boundWheel = (e: WheelEvent) => {
      e.preventDefault()
      this.adjustZoom(e.deltaY > 0 ? -0.15 : 0.15)
    }
    this.game.canvas.addEventListener('wheel', this.boundWheel, { passive: false })
  }

  private onKeyDown(e: KeyboardEvent): void {
    const modal = document.getElementById('help-modal')
    if (modal && !modal.classList.contains('hidden')) {
      if (e.key === 'Escape' || e.key === '?' || e.key === 'h' || e.key === 'H') {
        requestHelp()
      }
      return
    }

    switch (e.key) {
      case '1': case 'm': case 'M': setTool('move'); break
      case '2': setTool('shovel'); break
      case '3': case 'p': case 'P': setTool('plant'); break
      case '4': case 'l': case 'L':
        if (getUnlocks().leyline) setTool('leyline')
        break
      case 'e': case 'E':
        this.handleInteract()
        break
      case ' ':
        e.preventDefault()
        this.handleInteract()
        break
      case 'Escape':
        this.handleEscape()
        break
      case 'Tab':
        e.preventDefault()
        this.handleLayerSwitch()
        break
      case '?': case 'h': case 'H':
        requestHelp()
        break
      case '=': case '+':
        this.adjustZoom(0.3)
        break
      case '-': case '_':
        this.adjustZoom(-0.3)
        break
    }

  }

  private getHeldDirection(): { dcol: number; drow: number } | null {
    if (this.kbW?.isDown || this.kbUp?.isDown) return { dcol: 0, drow: -1 }
    if (this.kbS?.isDown || this.kbDown?.isDown) return { dcol: 0, drow: 1 }
    if (this.kbA?.isDown || this.kbLeft?.isDown) return { dcol: -1, drow: 0 }
    if (this.kbD?.isDown || this.kbRight?.isDown) return { dcol: 1, drow: 0 }
    return null
  }

  private updateKeyboardMovement(): void {
    const dir = this.getHeldDirection()
    if (!dir) return

    const newFacing = facingFromDelta(dir.dcol, dir.drow)
    if (newFacing !== this.facing) {
      this.facing = newFacing
      this.player.play(`pixie_${this.facing}`)
    }

    const pos = this.world.state.playerPos
    const target = { col: pos.col + dir.dcol, row: pos.row + dir.drow }

    if (target.col < 0 || target.col >= WORLD_COLS || target.row < 0 || target.row >= WORLD_ROWS) return
    if (!isWalkable(this.getGrid()[target.row][target.col])) return

    if (this.moveTarget) {
      this.moveTarget.destroy()
      this.moveTarget = null
    }
    this.pendingAction = null
    this.currentPath = [pos, target]
    this.pathIndex = 1
    this.isMoving = true
  }

  private handleInteract(): void {
    if (this.isMoving) return

    const pos = this.world.state.playerPos
    const tile = this.getGrid()[pos.row][pos.col]

    if (tile === TileType.HOLE) {
      this.onArrivedAt(pos)
      return
    }

    const delta = FACING_DELTA[this.facing]
    const target = { col: pos.col + delta.dcol, row: pos.row + delta.drow }
    if (target.col >= 0 && target.col < WORLD_COLS && target.row >= 0 && target.row < WORLD_ROWS) {
      const facingTile = this.getGrid()[target.row][target.col]
      const plant = this.world.getPlantAt(target, this.getLayer())
      if (plant || facingTile === TileType.MAGIC_TREE || facingTile === TileType.MOLDERING_LOG ||
          this.isResourceTile(facingTile) || facingTile === TileType.HOLE ||
          (this.getLayer() === Layer.SURFACE && samePos(target, this.world.state.portal.pos))) {
        this.handleTap(target)
        return
      }
    }

    if (this.isResourceTile(tile) || tile === TileType.MOLDERING_LOG) {
      this.handleTap(pos)
      return
    }

    const tool = getTool()
    if ((tool === 'shovel' || tool === 'plant') &&
        target.col >= 0 && target.col < WORLD_COLS && target.row >= 0 && target.row < WORLD_ROWS) {
      this.handleTap(target)
    }
  }

  private handleEscape(): void {
    this.dismissTooltip()

    if (this.drawingPath) {
      this.drawingPath = null
      this.drawPreviewGraphics.clear()
    }

    const modal = document.getElementById('help-modal')
    if (modal && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden')
    }

    const wb = document.getElementById('welcome-back')
    if (wb) wb.remove()
  }

  protected handleLayerSwitch(): void {
    if (this.isMoving) return
    const pos = this.world.state.playerPos
    const tile = this.getGrid()[pos.row][pos.col]
    if (tile === TileType.HOLE) {
      this.onArrivedAt(pos)
    } else {
      this.showFloatingText(pos, 'Find a passage first', 0xffffff)
    }
  }

  private adjustZoom(delta: number): void {
    const cam = this.cameras.main
    cam.setZoom(Phaser.Math.Clamp(cam.zoom + delta, 1.2, 4))
  }
}
