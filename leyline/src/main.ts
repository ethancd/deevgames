import Phaser from 'phaser'
import { createGameConfig } from './phaser/GameConfig'
import { initUI } from './ui'

;(window as any).__game = new Phaser.Game(createGameConfig())
initUI()
