import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { SurfaceScene } from './scenes/SurfaceScene'
import { UndergroundScene } from './scenes/UndergroundScene'

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: 'game',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    backgroundColor: '#1a1a2e',
    scene: [BootScene, SurfaceScene, UndergroundScene],
    input: {
      touch: true,
    },
    render: {
      pixelArt: true,
      antialias: false,
    },
  }
}
