import Phaser from 'phaser'
import { Layer, SeedType, ResourceType } from '../../sim/types'
import { World } from '../../sim/World'
import { LeylineEngine } from '../../sim/LeylineEngine'
import { clearSave, loadState, saveState } from '../../sim/SaveManager'
import { simulateIdle, hasSummaryContent } from '../../sim/IdleSimulator'
import { showWelcomeBack } from '../../ui'
import { ISO_TILE_W, ISO_TILE_H } from '../IsoUtils'
import { generatePixieTextures } from '../PixieSprites'

const W = ISO_TILE_W
const H = ISO_TILE_H
const HW = W / 2
const HH = H / 2

function fillDiamond(g: Phaser.GameObjects.Graphics, color: number, alpha = 1): void {
  g.fillStyle(color, alpha)
  g.beginPath()
  g.moveTo(HW, 0)
  g.lineTo(W, HH)
  g.lineTo(HW, H)
  g.lineTo(0, HH)
  g.closePath()
  g.fillPath()
}

function strokeDiamond(g: Phaser.GameObjects.Graphics, color: number, lineWidth: number, alpha = 1): void {
  g.lineStyle(lineWidth, color, alpha)
  g.beginPath()
  g.moveTo(HW, 0)
  g.lineTo(W, HH)
  g.lineTo(HW, H)
  g.lineTo(0, HH)
  g.closePath()
  g.strokePath()
}

function makeTile(scene: Phaser.Scene, key: string, color: number, detail?: (g: Phaser.GameObjects.Graphics) => void): void {
  const g = scene.add.graphics()
  fillDiamond(g, color)
  strokeDiamond(g, 0x000000, 1, 0.08)
  if (detail) detail(g)
  g.generateTexture(key, W, H)
  g.destroy()
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  create(): void {
    const loaded = loadState()
    let savedState = loaded?.state ?? null

    if (savedState && 'collectors' in savedState) {
      clearSave()
      savedState = null
    }

    let idleSummary = null
    if (savedState && loaded) {
      const elapsedMs = Date.now() - loaded.savedAt
      if (elapsedMs > 10_000) {
        const summary = simulateIdle(savedState, elapsedMs)
        if (hasSummaryContent(summary)) {
          idleSummary = summary
          saveState(savedState)
        }
      }
    }

    this.registry.set('world', new World(savedState ?? undefined))
    this.registry.set('leylineEngine', new LeylineEngine())
    this.generateTextures()

    const startScene = savedState?.playerLayer === Layer.UNDERGROUND ? 'Underground' : 'Surface'
    this.scene.start(startScene)

    if (idleSummary) {
      showWelcomeBack(idleSummary)
    }
  }

  private generateTextures(): void {
    this.generateTileTextures()
    this.generateDigTextures()
    this.generatePortalTextures()
    this.generatePlantTextures()
    this.generateMoteTextures()
    this.generateMarkerTextures()
    generatePixieTextures(this)
    this.generateCarriedItemTextures()
  }

  private generateTileTextures(): void {
    makeTile(this, 'tile_grass', 0x3a7d44)
    makeTile(this, 'tile_grass2', 0x4a8d54)

    makeTile(this, 'tile_water', 0x3b82f6, g => {
      g.lineStyle(1, 0x93c5fd, 0.4)
      g.beginPath(); g.moveTo(14, 13); g.lineTo(22, 11); g.lineTo(28, 13); g.strokePath()
      g.beginPath(); g.moveTo(36, 19); g.lineTo(44, 17); g.lineTo(50, 19); g.strokePath()
    })

    makeTile(this, 'tile_dirt', 0x8b6914, g => {
      g.fillStyle(0x6b5010, 0.5)
      g.fillCircle(24, 14, 1.5)
      g.fillCircle(40, 16, 1)
      g.fillCircle(30, 20, 1.5)
    })

    makeTile(this, 'tile_stone', 0x6b7280, g => {
      g.lineStyle(1, 0x9ca3af, 0.2)
      g.lineBetween(20, 12, 34, 18)
      g.lineBetween(38, 10, 44, 20)
    })

    makeTile(this, 'tile_crystal_red', 0xb91c1c, g => {
      g.fillStyle(0xef4444, 0.9)
      g.fillTriangle(24, 10, 20, 16, 28, 16)
      g.fillTriangle(38, 12, 34, 18, 42, 18)
      g.fillStyle(0xfca5a5, 0.8)
      g.fillCircle(26, 12, 1.5)
      g.fillCircle(40, 14, 1)
      g.fillCircle(32, 20, 1.5)
    })

    makeTile(this, 'tile_crystal_blue', 0x3730a3, g => {
      g.fillStyle(0x6366f1, 0.9)
      g.fillTriangle(24, 10, 20, 16, 28, 16)
      g.fillTriangle(38, 12, 34, 18, 42, 18)
      g.fillStyle(0xa5b4fc, 0.8)
      g.fillCircle(26, 12, 1.5)
      g.fillCircle(40, 14, 1)
      g.fillCircle(32, 20, 1.5)
    })

    makeTile(this, 'tile_path', 0xc4a97d)

    makeTile(this, 'tile_flowers', 0x3a7d44, g => {
      const colors = [0xf472b6, 0xfbbf24, 0xc084fc, 0xfb923c, 0x67e8f9]
      const pos = [[20, 12], [40, 14], [28, 18], [48, 16], [34, 22]]
      for (let i = 0; i < 5; i++) {
        g.fillStyle(colors[i], 0.9)
        g.fillCircle(pos[i][0], pos[i][1], 2)
      }
    })

    makeTile(this, 'tile_moss', 0x2d6b3a, g => {
      g.fillStyle(0x4a8d54, 0.4)
      g.fillEllipse(26, 14, 10, 6)
      g.fillEllipse(40, 18, 8, 5)
    })

    makeTile(this, 'tile_mushroom', 0x3a7d44, g => {
      g.fillStyle(0xd97706, 0.9)
      g.fillEllipse(HW, HH - 2, 10, 6)
      g.fillStyle(0xfef3c7, 0.9)
      g.fillRect(HW - 2, HH + 1, 4, 5)
      g.fillStyle(0xfef3c7, 0.7)
      g.fillCircle(HW - 2, HH - 3, 1.5)
      g.fillCircle(HW + 2, HH - 4, 1)
    })

    // Magic tree
    const tg = this.add.graphics()
    fillDiamond(tg, 0x3a7d44)
    tg.fillStyle(0x5c3a1a, 1); tg.fillRect(HW - 3, HH - 6, 6, 12)
    tg.fillStyle(0x4a2e10, 0.8); tg.fillRect(HW - 2, HH + 2, 4, 6)
    tg.fillStyle(0x7c3aed, 0.9); tg.fillEllipse(HW, HH - 8, 18, 12)
    tg.fillStyle(0x6d28d9, 0.7); tg.fillEllipse(HW - 4, HH - 6, 10, 8)
    tg.fillStyle(0xa78bfa, 0.6); tg.fillEllipse(HW + 4, HH - 10, 8, 6)
    tg.fillStyle(0xfef3c7, 0.9); tg.fillCircle(HW - 3, HH - 9, 1)
    tg.fillStyle(0xfef3c7, 0.7); tg.fillCircle(HW + 5, HH - 7, 1)
    tg.fillStyle(0xfef3c7, 0.6); tg.fillCircle(HW, HH - 12, 1)
    strokeDiamond(tg, 0x000000, 1, 0.08)
    tg.generateTexture('tile_magic_tree', W, H)
    tg.destroy()

    // Moldering log
    const mlg = this.add.graphics()
    fillDiamond(mlg, 0x8b6914)
    mlg.fillStyle(0x5c3a1a, 0.9); mlg.fillEllipse(HW, HH + 1, 24, 7)
    mlg.fillStyle(0x4a2e10, 0.7); mlg.fillEllipse(HW, HH + 1, 20, 5)
    mlg.lineStyle(1, 0x3a1e0a, 0.4); mlg.lineBetween(HW - 8, HH, HW + 8, HH + 2)
    mlg.fillStyle(0xd97706, 0.9); mlg.fillEllipse(HW - 6, HH - 2, 5, 3)
    mlg.fillStyle(0xef4444, 0.8); mlg.fillEllipse(HW + 4, HH - 3, 4, 3)
    mlg.fillStyle(0xfef3c7, 0.7); mlg.fillRect(HW - 7, HH, 2, 3)
    mlg.fillStyle(0xfef3c7, 0.7); mlg.fillRect(HW + 3, HH - 1, 2, 3)
    mlg.fillStyle(0x4ade80, 0.5); mlg.fillCircle(HW + 8, HH, 2)
    mlg.fillStyle(0x4ade80, 0.4); mlg.fillCircle(HW - 3, HH + 3, 1.5)
    strokeDiamond(mlg, 0x000000, 1, 0.08)
    mlg.generateTexture('tile_moldering_log', W, H)
    mlg.destroy()

    // Hole
    const hg = this.add.graphics()
    fillDiamond(hg, 0x1a1a0a)
    hg.fillStyle(0x0a0a00, 1)
    hg.fillEllipse(HW, HH, W * 0.45, H * 0.5)
    strokeDiamond(hg, 0x3a3a2a, 1, 0.5)
    hg.generateTexture('tile_hole', W, H)
    hg.destroy()

    // Light shaft
    const lg = this.add.graphics()
    fillDiamond(lg, 0x8b6914)
    lg.fillStyle(0xfef3c7, 0.5)
    lg.fillEllipse(HW, HH, W * 0.45, H * 0.45)
    lg.fillStyle(0xffffff, 0.25)
    lg.fillEllipse(HW, HH, W * 0.25, H * 0.25)
    lg.lineStyle(1, 0xfde68a, 0.3)
    lg.lineBetween(HW - 4, 4, HW - 2, HH - 4)
    lg.lineBetween(HW + 4, 4, HW + 2, HH - 4)
    lg.generateTexture('tile_light_shaft', W, H)
    lg.destroy()
  }

  private generateDigTextures(): void {
    const surfColors = [0x5a6d34, 0x4a5d24, 0x3a4d14, 0x2a3d04]
    for (let i = 0; i < 4; i++) {
      const g = this.add.graphics()
      fillDiamond(g, surfColors[i])
      strokeDiamond(g, 0x000000, 1, 0.15)
      g.lineStyle(1, 0x1a1a0a, 0.3 + i * 0.15)
      g.lineBetween(W * 0.25, H * 0.35, W * 0.5, H * 0.55)
      if (i >= 1) g.lineBetween(W * 0.6, H * 0.25, W * 0.4, H * 0.6)
      if (i >= 2) g.lineBetween(W * 0.3, H * 0.65, W * 0.7, H * 0.7)
      if (i >= 3) {
        g.lineBetween(W * 0.15, H * 0.45, W * 0.85, H * 0.4)
        g.fillStyle(0x1a1a0a, 0.2)
        g.fillCircle(HW, HH, 4)
      }
      g.generateTexture(`tile_dig_${i + 1}`, W, H)
      g.destroy()
    }

    const ugColors = [0x7a5910, 0x6a4908, 0x5a3900, 0x4a2900]
    for (let i = 0; i < 4; i++) {
      const g = this.add.graphics()
      fillDiamond(g, ugColors[i])
      strokeDiamond(g, 0x000000, 1, 0.15)
      g.lineStyle(1, 0x1a0a00, 0.3 + i * 0.15)
      g.lineBetween(W * 0.25, H * 0.35, W * 0.5, H * 0.55)
      if (i >= 1) g.lineBetween(W * 0.6, H * 0.25, W * 0.4, H * 0.6)
      if (i >= 2) g.lineBetween(W * 0.3, H * 0.65, W * 0.7, H * 0.7)
      if (i >= 3) {
        g.lineBetween(W * 0.15, H * 0.45, W * 0.85, H * 0.4)
        g.fillStyle(0x4a4a4a, 0.3)
        g.fillCircle(HW, HH, 4)
      }
      g.generateTexture(`tile_udig_${i + 1}`, W, H)
      g.destroy()
    }
  }

  private generatePortalTextures(): void {
    const PT = 40
    const pc = PT / 2
    for (let level = 0; level <= 5; level++) {
      const g = this.add.graphics()
      const brightness = Math.min(0.3 + level * 0.14, 1)
      const rings = 1 + Math.min(level, 3)

      for (let r = rings; r >= 1; r--) {
        g.fillStyle(0xd946ef, brightness * (0.15 + r * 0.1))
        g.fillCircle(pc, pc, 3 + r * 3)
      }

      g.fillStyle(0xffffff, brightness * 0.4)
      g.fillCircle(pc, pc, 4)

      if (level >= 1) {
        g.lineStyle(1, 0x22c55e, brightness * 0.6)
        g.strokeCircle(pc, pc, 8 + level)
      }
      if (level >= 2) {
        g.lineStyle(1, 0xd946ef, brightness * 0.5)
        g.strokeCircle(pc, pc, 12 + level)
      }

      g.generateTexture(`portal_${level}`, PT, PT)
      g.destroy()
    }
  }

  private generatePlantTextures(): void {
    // SEED: 16×12, SPROUT: 20×24, SAPLING: 28×40, MATURE: 40×64

    // --- Water Lily ---
    this.plantTex('plant_water_lily_seed', 16, 12, (g, cx, bot) => {
      g.fillStyle(0x2d8b6a, 0.9); g.fillEllipse(cx, bot - 2, 6, 4)
    })
    this.plantTex('plant_water_lily_sprout', 20, 24, (g, cx, bot) => {
      g.fillStyle(0x3a9d7a, 0.8); g.fillEllipse(cx, bot - 3, 10, 5)
      g.fillStyle(0xfbcfe8, 0.5); g.fillCircle(cx, bot - 6, 2)
    })
    this.plantTex('plant_water_lily_sapling', 28, 40, (g, cx, bot) => {
      g.fillStyle(0x3a9d7a, 0.9); g.fillEllipse(cx, bot - 4, 14, 6)
      g.lineStyle(1, 0x2d8b6a, 0.8); g.lineBetween(cx, bot - 6, cx, bot - 18)
      g.fillStyle(0xfbcfe8, 0.7); g.fillEllipse(cx, bot - 20, 6, 8)
    })
    this.plantTex('plant_water_lily_mature', 40, 64, (g, cx, bot) => {
      g.fillStyle(0x3b82f6, 0.1); g.fillCircle(cx, cx, 18)
      g.fillStyle(0x2d8b6a, 1); g.fillEllipse(cx, bot - 4, 22, 8)
      g.fillStyle(0x3a9d7a, 0.8); g.fillEllipse(cx, bot - 5, 18, 7)
      g.fillStyle(0xfbcfe8, 1); g.fillCircle(cx, bot - 14, 6)
      g.fillStyle(0xffffff, 0.9); g.fillCircle(cx, bot - 14, 3)
      const petals = [0, 72, 144, 216, 288]
      for (const a of petals) {
        const r = Math.PI * a / 180
        g.fillStyle(0xf9a8d4, 0.85)
        g.fillEllipse(cx + Math.cos(r) * 8, bot - 14 + Math.sin(r) * 8, 4, 5)
      }
    })

    // --- Sunflower ---
    this.plantTex('plant_sunflower_seed', 16, 12, (g, cx, bot) => {
      g.fillStyle(0x8b6914, 1); g.fillEllipse(cx, bot - 2, 6, 4)
    })
    this.plantTex('plant_sunflower_sprout', 20, 24, (g, cx, bot) => {
      g.lineStyle(2, 0x4a8d54, 1); g.lineBetween(cx, bot, cx, bot - 14)
      g.fillStyle(0x6abe45, 1); g.fillEllipse(cx - 4, bot - 10, 5, 3)
    })
    this.plantTex('plant_sunflower_sapling', 28, 40, (g, cx, bot) => {
      g.lineStyle(2, 0x3a7d44, 1); g.lineBetween(cx, bot, cx, bot - 28)
      g.fillStyle(0x4a8d54, 1)
      g.fillEllipse(cx - 6, bot - 18, 8, 5)
      g.fillEllipse(cx + 6, bot - 22, 8, 5)
      g.fillStyle(0xfbbf24, 0.8); g.fillCircle(cx, bot - 30, 4)
    })
    this.plantTex('plant_sunflower_mature', 40, 64, (g, cx, bot) => {
      g.fillStyle(0xfbbf24, 0.12); g.fillCircle(cx, 20, 18)
      g.lineStyle(3, 0x2d6b3a, 1); g.lineBetween(cx, bot, cx, bot - 48)
      g.fillStyle(0x3a7d44, 1)
      g.fillEllipse(cx - 8, bot - 24, 10, 6)
      g.fillEllipse(cx + 8, bot - 32, 10, 6)
      g.fillStyle(0x92400e, 1); g.fillCircle(cx, bot - 52, 7)
      const petals = [0, 45, 90, 135, 180, 225, 270, 315]
      for (const a of petals) {
        const r = Math.PI * a / 180
        g.fillStyle(0xfbbf24, 0.95)
        g.fillEllipse(cx + Math.cos(r) * 10, bot - 52 + Math.sin(r) * 10, 5, 4)
      }
      g.fillStyle(0xfef3c7, 0.6); g.fillCircle(cx, bot - 52, 3)
    })

    // --- Lifeleaf ---
    this.plantTex('plant_lifeleaf_seed', 16, 12, (g, cx, bot) => {
      g.fillStyle(0x166534, 1); g.fillEllipse(cx, bot - 2, 6, 4)
    })
    this.plantTex('plant_lifeleaf_sprout', 20, 24, (g, cx, bot) => {
      g.lineStyle(2, 0x22c55e, 1); g.lineBetween(cx, bot, cx, bot - 14)
      g.fillStyle(0x4ade80, 0.9); g.fillEllipse(cx - 4, bot - 10, 6, 4)
    })
    this.plantTex('plant_lifeleaf_sapling', 28, 40, (g, cx, bot) => {
      g.lineStyle(2, 0x16a34a, 1); g.lineBetween(cx, bot, cx, bot - 28)
      g.fillStyle(0x22c55e, 1)
      g.fillEllipse(cx - 6, bot - 14, 9, 5)
      g.fillEllipse(cx + 5, bot - 22, 9, 5)
      g.fillStyle(0x4ade80, 0.6); g.fillCircle(cx, bot - 28, 3)
    })
    this.plantTex('plant_lifeleaf_mature', 40, 64, (g, cx, bot) => {
      g.fillStyle(0x4ade80, 0.12); g.fillCircle(cx, 20, 18)
      g.lineStyle(3, 0x166534, 1); g.lineBetween(cx, bot, cx, bot - 44)
      g.fillStyle(0x16a34a, 1)
      g.fillEllipse(cx - 8, bot - 16, 12, 6)
      g.fillEllipse(cx + 7, bot - 24, 12, 6)
      g.fillEllipse(cx - 4, bot - 36, 10, 6)
      g.fillStyle(0x4ade80, 0.9); g.fillCircle(cx, bot - 46, 6)
      g.fillStyle(0xbbf7d0, 0.7); g.fillCircle(cx, bot - 46, 3)
      g.fillStyle(0x4ade80, 0.4)
      g.fillCircle(cx - 6, bot - 38, 2)
      g.fillCircle(cx + 5, bot - 40, 2)
    })

    // --- Dewbell ---
    this.plantTex('plant_dewbell_seed', 16, 12, (g, cx, bot) => {
      g.fillStyle(0x4a6980, 1); g.fillEllipse(cx, bot - 2, 6, 4)
    })
    this.plantTex('plant_dewbell_sprout', 20, 24, (g, cx, bot) => {
      g.lineStyle(2, 0x4a8d7a, 1); g.lineBetween(cx, bot, cx, bot - 14)
      g.fillStyle(0x7dd3c0, 1); g.fillEllipse(cx + 3, bot - 10, 5, 3)
    })
    this.plantTex('plant_dewbell_sapling', 28, 40, (g, cx, bot) => {
      g.lineStyle(2, 0x3a7d6a, 1); g.lineBetween(cx, bot, cx, bot - 28)
      g.fillStyle(0x4a8d7a, 1); g.fillEllipse(cx - 5, bot - 18, 6, 5)
      g.fillStyle(0x6366f1, 0.7); g.fillEllipse(cx + 2, bot - 30, 7, 9)
    })
    this.plantTex('plant_dewbell_mature', 40, 64, (g, cx, bot) => {
      g.fillStyle(0x6366f1, 0.1); g.fillCircle(cx, 20, 18)
      g.lineStyle(3, 0x2d6b5a, 1); g.lineBetween(cx, bot, cx, bot - 40)
      g.fillStyle(0x3a7d6a, 1)
      g.fillEllipse(cx - 6, bot - 18, 9, 6)
      g.fillEllipse(cx + 6, bot - 24, 9, 6)
      g.fillStyle(0x818cf8, 1)
      g.fillEllipse(cx - 5, bot - 44, 9, 12)
      g.fillEllipse(cx + 5, bot - 50, 9, 12)
      g.fillStyle(0xc7d2fe, 0.8)
      g.fillCircle(cx - 4, bot - 48, 2)
      g.fillCircle(cx + 6, bot - 54, 2)
      g.fillStyle(0xc7d2fe, 0.6); g.fillCircle(cx, bot - 38, 1.5)
    })

    // --- Lichen ---
    this.plantTex('plant_lichen_seed', 16, 12, (g, cx, bot) => {
      g.fillStyle(0x6b7280, 0.8); g.fillEllipse(cx, bot - 2, 7, 4)
      g.fillStyle(0x9ca3af, 0.5); g.fillCircle(cx - 1, bot - 3, 2)
    })
    this.plantTex('plant_lichen_sprout', 20, 24, (g, cx, bot) => {
      g.fillStyle(0x6b7280, 0.9); g.fillEllipse(cx, bot - 3, 10, 5)
      g.fillStyle(0x9ca3af, 0.6)
      g.fillEllipse(cx + 2, bot - 4, 5, 3)
      g.fillEllipse(cx - 3, bot - 3, 4, 3)
    })
    this.plantTex('plant_lichen_sapling', 28, 40, (g, cx, bot) => {
      g.fillStyle(0x6b7280, 1); g.fillEllipse(cx, bot - 4, 16, 7)
      g.fillStyle(0x9ca3af, 0.7)
      g.fillEllipse(cx + 4, bot - 5, 6, 4)
      g.fillEllipse(cx - 5, bot - 4, 5, 3)
      g.fillStyle(0xd1d5db, 0.4); g.fillCircle(cx, bot - 8, 3)
    })
    this.plantTex('plant_lichen_mature', 40, 64, (g, cx, bot) => {
      g.fillStyle(0x9ca3af, 0.1); g.fillCircle(cx, 20, 18)
      g.fillStyle(0x4b5563, 1); g.fillEllipse(cx, bot - 4, 24, 8)
      g.fillStyle(0x6b7280, 0.9)
      g.fillEllipse(cx + 4, bot - 6, 10, 6)
      g.fillEllipse(cx - 5, bot - 5, 8, 5)
      g.fillStyle(0x9ca3af, 0.8); g.fillEllipse(cx, bot - 10, 12, 6)
      g.fillStyle(0xd1d5db, 0.6)
      g.fillCircle(cx - 3, bot - 12, 3)
      g.fillCircle(cx + 4, bot - 10, 2)
      g.fillStyle(0xf3f4f6, 0.4); g.fillCircle(cx, bot - 14, 2)
    })

    // --- Rootweave ---
    this.plantTex('plant_rootweave_seed', 16, 12, (g, cx, bot) => {
      g.fillStyle(0x7f1d1d, 1); g.fillEllipse(cx, bot - 2, 6, 4)
    })
    this.plantTex('plant_rootweave_sprout', 20, 24, (g, cx, bot) => {
      g.lineStyle(2, 0x991b1b, 0.8); g.lineBetween(cx, bot, cx - 3, bot - 12)
      g.lineStyle(1, 0x7f1d1d, 0.6); g.lineBetween(cx, bot - 5, cx + 4, bot - 10)
    })
    this.plantTex('plant_rootweave_sapling', 28, 40, (g, cx, bot) => {
      g.lineStyle(2, 0xb91c1c, 0.9)
      g.lineBetween(cx, bot, cx - 6, bot - 18)
      g.lineBetween(cx, bot, cx + 6, bot - 14)
      g.lineBetween(cx - 6, bot - 18, cx - 10, bot - 26)
      g.lineStyle(1, 0x991b1b, 0.7)
      g.lineBetween(cx + 6, bot - 14, cx + 9, bot - 24)
      g.fillStyle(0xef4444, 0.5); g.fillCircle(cx - 8, bot - 26, 3)
    })
    this.plantTex('plant_rootweave_mature', 40, 64, (g, cx, bot) => {
      g.fillStyle(0xef4444, 0.1); g.fillCircle(cx, 20, 18)
      g.lineStyle(3, 0xdc2626, 1)
      g.lineBetween(cx, bot, cx - 8, bot - 24)
      g.lineBetween(cx, bot, cx + 8, bot - 20)
      g.lineBetween(cx - 8, bot - 24, cx - 14, bot - 40)
      g.lineBetween(cx + 8, bot - 20, cx + 14, bot - 36)
      g.lineStyle(2, 0xb91c1c, 0.8)
      g.lineBetween(cx - 4, bot - 12, cx - 12, bot - 10)
      g.lineBetween(cx + 4, bot - 10, cx + 10, bot - 6)
      g.fillStyle(0xef4444, 0.9); g.fillCircle(cx, bot - 30, 5)
      g.fillStyle(0xfca5a5, 0.8); g.fillCircle(cx, bot - 30, 3)
      g.fillStyle(0xef4444, 0.6)
      g.fillCircle(cx - 13, bot - 40, 3)
      g.fillCircle(cx + 13, bot - 36, 3)
    })

    // --- Glimstone ---
    this.plantTex('plant_glimstone_seed', 16, 12, (g, cx, bot) => {
      g.fillStyle(0x3730a3, 1); g.fillEllipse(cx, bot - 2, 6, 4)
    })
    this.plantTex('plant_glimstone_sprout', 20, 24, (g, cx, bot) => {
      g.fillStyle(0x4f46e5, 0.9)
      g.fillTriangle(cx, bot - 14, cx - 4, bot, cx + 4, bot)
    })
    this.plantTex('plant_glimstone_sapling', 28, 40, (g, cx, bot) => {
      g.fillStyle(0x6366f1, 0.9)
      g.fillTriangle(cx, bot - 26, cx - 5, bot, cx + 3, bot)
      g.fillStyle(0x818cf8, 0.8)
      g.fillTriangle(cx + 4, bot - 18, cx + 1, bot, cx + 8, bot)
      g.fillStyle(0xa5b4fc, 0.5); g.fillCircle(cx, bot - 18, 2)
    })
    this.plantTex('plant_glimstone_mature', 40, 64, (g, cx, bot) => {
      g.fillStyle(0x6366f1, 0.1); g.fillCircle(cx, 20, 18)
      g.fillStyle(0x4338ca, 1)
      g.fillTriangle(cx, bot - 50, cx - 7, bot, cx + 5, bot)
      g.fillStyle(0x6366f1, 0.95)
      g.fillTriangle(cx + 6, bot - 38, cx + 2, bot, cx + 12, bot)
      g.fillStyle(0x818cf8, 0.9)
      g.fillTriangle(cx - 5, bot - 32, cx - 10, bot, cx, bot)
      g.fillStyle(0xa5b4fc, 0.7); g.fillCircle(cx - 2, bot - 30, 3)
      g.fillStyle(0xc7d2fe, 0.6); g.fillCircle(cx + 6, bot - 24, 2)
      g.fillStyle(0xe0e7ff, 0.5); g.fillCircle(cx, bot - 46, 2)
    })
  }

  private plantTex(key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics, cx: number, bot: number) => void): void {
    const g = this.add.graphics()
    draw(g, w / 2, h - 1)
    g.generateTexture(key, w, h)
    g.destroy()
  }

  private generateMoteTextures(): void {
    const S = 10
    const cx = S / 2
    const cy = S / 2

    this.moteTex('mote_water', S, g => {
      g.fillStyle(0xffffff, 0.25); g.fillCircle(cx, cy, cx)
      g.fillStyle(0xffffff, 0.7); g.fillCircle(cx, cy + 1, 3)
      g.fillStyle(0xffffff, 0.85); g.fillTriangle(cx, 1, cx - 2.5, cy, cx + 2.5, cy)
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy, 1.2)
    })

    this.moteTex('mote_sun', S, g => {
      g.fillStyle(0xffffff, 0.25); g.fillCircle(cx, cy, cx)
      g.fillStyle(0xffffff, 0.85)
      g.fillTriangle(cx, 0, cx - 1.5, cy - 1.5, cx + 1.5, cy - 1.5)
      g.fillTriangle(cx, S, cx - 1.5, cy + 1.5, cx + 1.5, cy + 1.5)
      g.fillTriangle(0, cy, cx - 1.5, cy - 1.5, cx - 1.5, cy + 1.5)
      g.fillTriangle(S, cy, cx + 1.5, cy - 1.5, cx + 1.5, cy + 1.5)
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy, 2)
    })

    this.moteTex('mote_diamond', S, g => {
      g.fillStyle(0xffffff, 0.25); g.fillCircle(cx, cy, cx)
      g.fillStyle(0xffffff, 0.85)
      g.fillTriangle(cx, 1, 1, cy, cx, S - 1)
      g.fillTriangle(cx, 1, S - 1, cy, cx, S - 1)
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy - 1, 1.2)
    })

    this.moteTex('mote_leaf', S, g => {
      g.fillStyle(0xffffff, 0.25); g.fillCircle(cx, cy, cx)
      g.fillStyle(0xffffff, 0.8); g.fillEllipse(cx, cy, 5, 8)
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy - 1, 1.2)
    })

    this.moteTex('mote_note', S, g => {
      g.fillStyle(0xffffff, 0.25); g.fillCircle(cx, cy, cx)
      g.fillStyle(0xffffff, 0.9); g.fillEllipse(cx - 1, cy + 2, 3.5, 2.5)
      g.lineStyle(1.5, 0xffffff, 0.9); g.lineBetween(cx + 0.5, cy + 2, cx + 0.5, cy - 3)
      g.fillStyle(0xffffff, 0.7); g.fillTriangle(cx + 0.5, cy - 3, cx + 0.5, cy - 1, cx + 3.5, cy - 2)
    })

    const mg = this.add.graphics()
    mg.fillStyle(0xffffff, 0.3); mg.fillCircle(4, 4, 4)
    mg.fillStyle(0xffffff, 0.7); mg.fillCircle(4, 4, 2.5)
    mg.fillStyle(0xffffff, 1); mg.fillCircle(4, 4, 1)
    mg.generateTexture('mote', 8, 8)
    mg.destroy()
  }

  private moteTex(key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.add.graphics()
    draw(g)
    g.generateTexture(key, size, size)
    g.destroy()
  }

  private generateMarkerTextures(): void {
    // Move target - diamond outline
    const mg = this.add.graphics()
    strokeDiamond(mg, 0xfbbf24, 2, 0.6)
    mg.generateTexture('move_target', W, H)
    mg.destroy()

    // Shovel target - diamond outline
    const sg = this.add.graphics()
    strokeDiamond(sg, 0xf59e0b, 2, 0.8)
    sg.generateTexture('shovel_target', W, H)
    sg.destroy()

    // Fallback player (circle, replaced by pixie)
    const pg = this.add.graphics()
    pg.fillStyle(0xfbbf24, 0.2); pg.fillCircle(7, 11, 7)
    pg.fillStyle(0xfbbf24, 0.9); pg.fillCircle(7, 11, 4)
    pg.fillStyle(0xfef3c7, 1); pg.fillCircle(7, 11, 2)
    pg.generateTexture('player', 14, 22)
    pg.destroy()
  }

  private generateCarriedItemTextures(): void {
    const S = 10
    const c = S / 2

    // Resources
    this.carryTex('carry_water', S, g => {
      g.fillStyle(0x3b82f6, 0.9); g.fillCircle(c, c + 1, 3)
      g.fillStyle(0x3b82f6, 0.9); g.fillTriangle(c, 1, c - 2.5, c, c + 2.5, c)
      g.fillStyle(0x93c5fd, 0.6); g.fillCircle(c - 1, c - 1, 1)
    })
    this.carryTex('carry_sunlight', S, g => {
      g.fillStyle(0xfbbf24, 0.4); g.fillCircle(c, c, c)
      g.fillStyle(0xfbbf24, 0.9); g.fillCircle(c, c, 3)
      g.fillStyle(0xfef3c7, 1); g.fillCircle(c, c, 1.5)
    })
    this.carryTex('carry_crystal_red', S, g => {
      g.fillStyle(0xef4444, 0.9); g.fillTriangle(c, 1, 1, c, c, S - 1)
      g.fillStyle(0xef4444, 0.9); g.fillTriangle(c, 1, S - 1, c, c, S - 1)
      g.fillStyle(0xfca5a5, 0.7); g.fillCircle(c, c - 1, 1.5)
    })
    this.carryTex('carry_crystal_blue', S, g => {
      g.fillStyle(0x6366f1, 0.9); g.fillTriangle(c, 1, 1, c, c, S - 1)
      g.fillStyle(0x6366f1, 0.9); g.fillTriangle(c, 1, S - 1, c, c, S - 1)
      g.fillStyle(0xa5b4fc, 0.7); g.fillCircle(c, c - 1, 1.5)
    })
    this.carryTex('carry_life_essence', S, g => {
      g.fillStyle(0x4ade80, 0.8); g.fillEllipse(c, c, 6, 8)
      g.lineStyle(1, 0x22c55e, 0.6); g.lineBetween(c, 2, c, S - 2)
      g.fillStyle(0xbbf7d0, 0.5); g.fillCircle(c, c - 1, 1.5)
    })
    this.carryTex('carry_crystal_green', S, g => {
      g.fillStyle(0x22c55e, 0.9); g.fillTriangle(c, 1, 1, c, c, S - 1)
      g.fillStyle(0x22c55e, 0.9); g.fillTriangle(c, 1, S - 1, c, c, S - 1)
      g.fillStyle(0x86efac, 0.7); g.fillCircle(c, c - 1, 1.5)
    })
    this.carryTex('carry_music_notes', S, g => {
      g.fillStyle(0xd946ef, 0.9); g.fillEllipse(c - 1, c + 2, 3.5, 2.5)
      g.lineStyle(1.5, 0xd946ef, 0.9); g.lineBetween(c + 0.5, c + 2, c + 0.5, c - 3)
      g.fillStyle(0xd946ef, 0.7); g.fillTriangle(c + 0.5, c - 3, c + 0.5, c - 1, c + 3.5, c - 2)
    })

    // Seeds
    const seedColors: Record<string, number> = {
      [SeedType.WATER_LILY]: 0x2d8b6a,
      [SeedType.SUNFLOWER]: 0x8b6914,
      [SeedType.LIFELEAF]: 0x166534,
      [SeedType.DEWBELL]: 0x4a6980,
      [SeedType.LICHEN]: 0x6b7280,
      [SeedType.ROOTWEAVE]: 0x7f1d1d,
      [SeedType.GLIMSTONE]: 0x3730a3,
    }
    for (const [seed, color] of Object.entries(seedColors)) {
      this.carryTex(`carry_seed_${seed}`, S, g => {
        g.fillStyle(0x8b6914, 0.8); g.fillEllipse(c, c + 1, 6, 5)
        g.fillStyle(color, 0.9); g.fillEllipse(c, c, 5, 4)
        g.fillStyle(0xfef3c7, 0.3); g.fillCircle(c - 1, c - 1, 1.5)
      })
    }
  }

  private carryTex(key: string, size: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    const g = this.add.graphics()
    draw(g)
    g.generateTexture(key, size, size)
    g.destroy()
  }
}
