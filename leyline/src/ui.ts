import {
  getTool, setTool,
  onToolChange,
  getUnlocks, onUnlocksChange, onTooltipChange,
  onCarriedItemChange,
  requestDrop, requestTreeBuy, onHelpRequest, onNewGameRequest,
  onWeatherChange,
  onEmitProgress,
  requestDebugAction,
} from './bridge'
import { ToolMode, CarriableItem, SeedType, Layer, ResourceType, WeatherState, RESOURCE_EMOJI, RESOURCE_NAMES } from './sim/types'
import { seedLayer, SEED_DISPLAY, getTransmuteRecipe, isSourcePlant } from './sim/PlantConfig'
import { clearSave } from './sim/SaveManager'
import { IdleSummary, formatElapsed } from './sim/IdleSimulator'

let tooltipTimer = 0

export function initUI(): void {
  const container = document.getElementById('ui-overlay')
  if (!container) return

  container.innerHTML = `
    <div id="toolbar">
      <button id="btn-move" class="tool-btn active" data-tool="move">
        👣 Move
      </button>
      <button id="btn-shovel" class="tool-btn" data-tool="shovel">
        ⛏️ Dig
      </button>
      <button id="btn-plant" class="tool-btn" data-tool="plant">
        🌱 Plant
      </button>
      <button id="btn-leyline" class="tool-btn hidden" data-tool="leyline">
        ✨ Leyline
      </button>
      <div id="carried-display">
        <span id="carried-item">🤲 Empty</span>
      </div>
      <button id="btn-help" class="tool-btn" style="font-size:14px;padding:6px 10px;">
        ❓
      </button>
      <button id="btn-newgame" class="tool-btn" style="font-size:12px;padding:6px 10px;">
        New
      </button>
    </div>
  `

  const btnMove = document.getElementById('btn-move')!
  const btnShovel = document.getElementById('btn-shovel')!
  const btnPlant = document.getElementById('btn-plant')!
  const btnLeyline = document.getElementById('btn-leyline')!
  const carriedEl = document.getElementById('carried-display')!

  function updateButtons(tool: ToolMode): void {
    btnMove.classList.toggle('active', tool === 'move')
    btnShovel.classList.toggle('active', tool === 'shovel')
    btnPlant.classList.toggle('active', tool === 'plant')
    btnLeyline.classList.toggle('active', tool === 'leyline')
  }

  function updateLeylineVisibility(): void {
    const unlocks = getUnlocks()
    btnLeyline.classList.toggle('hidden', !unlocks.leyline)
  }

  function selectTool(tool: ToolMode) {
    return (e: Event) => {
      e.stopPropagation()
      if (tool === 'leyline' && !getUnlocks().leyline) return
      setTool(tool)
      updateButtons(tool)
    }
  }

  btnMove.addEventListener('pointerdown', selectTool('move'))
  btnShovel.addEventListener('pointerdown', selectTool('shovel'))
  btnPlant.addEventListener('pointerdown', selectTool('plant'))
  btnLeyline.addEventListener('pointerdown', selectTool('leyline'))

  carriedEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    requestDrop()
  })

  document.getElementById('btn-newgame')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    if (confirm('Start a new game? All progress will be lost.')) {
      clearSave()
      location.reload()
    }
  })

  onNewGameRequest(() => {
    if (confirm('Start a new game? All progress will be lost.')) {
      clearSave()
      location.reload()
    }
  })

  updateButtons(getTool())
  updateLeylineVisibility()

  onToolChange(updateButtons)
  onUnlocksChange(() => updateLeylineVisibility())

  onCarriedItemChange((item: CarriableItem | null) => {
    const el = document.getElementById('carried-item')!
    if (!item) {
      el.textContent = '🤲 Empty'
      carriedEl.classList.remove('carrying')
    } else if (item.type === 'resource') {
      el.textContent = `${RESOURCE_EMOJI[item.resource]} ${RESOURCE_NAMES[item.resource]}`
      carriedEl.classList.add('carrying')
    } else {
      const display = SEED_DISPLAY[item.seed]
      el.textContent = `${display.emoji} ${display.name}`
      carriedEl.classList.add('carrying')
    }
  })

  setupTooltip()
  setupHelpModal()
  setupWeatherHud()
  setupEmitClock()
  setupDebugPanel()
}

function setupTooltip(): void {
  const tooltip = document.getElementById('game-tooltip')
  if (!tooltip) return

  onTooltipChange((data) => {
    if (!data) {
      tooltip.classList.add('hidden')
      return
    }

    tooltip.innerHTML = data.html
    tooltip.style.left = '-999px'
    tooltip.classList.remove('hidden')

    const tw = tooltip.offsetWidth
    const th = tooltip.offsetHeight

    let x = data.screenX - tw / 2
    let y = data.screenY - th - 12

    const vw = window.innerWidth
    if (x < 8) x = 8
    if (x + tw > vw - 8) x = vw - 8 - tw
    if (y < 8) y = data.screenY + 24

    tooltip.style.left = `${Math.round(x)}px`
    tooltip.style.top = `${Math.round(y)}px`

    const buyBtns = tooltip.querySelectorAll('.tree-buy-btn')
    if (buyBtns.length > 0) {
      buyBtns.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
          e.stopPropagation()
          const seed = (btn as HTMLElement).dataset.seed as SeedType
          if (seed) requestTreeBuy(seed)
        })
      })
    }

    clearTimeout(tooltipTimer)
    tooltipTimer = window.setTimeout(() => {
      tooltip.classList.add('hidden')
    }, buyBtns.length > 0 ? 8000 : 4000) as unknown as number
  })
}

function setupHelpModal(): void {
  const modal = document.createElement('div')
  modal.id = 'help-modal'
  modal.className = 'hidden'
  modal.innerHTML = `
    <div class="help-backdrop"></div>
    <div class="help-content">
      <div class="help-header">
        <span>🌿 Plant Guide</span>
        <button id="help-close">✕</button>
      </div>
      <div class="help-body">
        ${buildHelpContent()}
      </div>
    </div>
  `
  document.body.appendChild(modal)

  document.getElementById('help-close')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    modal.classList.add('hidden')
  })

  modal.querySelector('.help-backdrop')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    modal.classList.add('hidden')
  })

  document.getElementById('btn-help')!.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    modal.classList.toggle('hidden')
  })

  onHelpRequest(() => {
    modal.classList.toggle('hidden')
  })
}

function buildHelpContent(): string {
  const PLANTS: Array<{ seed: SeedType; where: string }> = [
    { seed: SeedType.WATER_LILY, where: 'On water tiles' },
    { seed: SeedType.SUNFLOWER, where: 'On dug dirt' },
    { seed: SeedType.LIFELEAF, where: 'On dug dirt' },
    { seed: SeedType.DEWBELL, where: 'On dug dirt' },
    { seed: SeedType.LICHEN, where: 'On crystal veins' },
    { seed: SeedType.ROOTWEAVE, where: 'On dug dirt' },
    { seed: SeedType.GLIMSTONE, where: 'On dug dirt' },
  ]

  let extra = ''
  extra += `<div class="help-plant">
    <div class="help-name">🌳 Magic Tree <span class="help-layer">Surface</span></div>
    <div class="help-detail">Trade resources for seeds</div>
    <div class="help-detail">☀️→Sunflower, 💧→Water Lily, 🌿→others (cost doubles)</div>
  </div>`
  extra += `<div class="help-plant">
    <div class="help-name">🍄 Moldering Log <span class="help-layer">Underground</span></div>
    <div class="help-detail">Pick up 🌿 Life Essence (renewable)</div>
  </div>`

  extra += `<div class="help-plant" style="border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:12px;margin-bottom:4px">
    <div class="help-name">⌨️ Keyboard Shortcuts</div>
    <div class="help-detail" style="white-space:pre-line;line-height:1.8">
Move: WASD / Arrow Keys
Interact: E / Space
Drop: Q
Tools: 1 Move · 2 Dig · 3 Plant · 4 Leyline
Zoom: +/− or Scroll Wheel
Layer: Tab (on passage)
Help: H or ?
New Game: N
Cancel: Escape</div>
  </div>`

  return extra + PLANTS.map(p => {
    const d = SEED_DISPLAY[p.seed]
    const recipe = getTransmuteRecipe(p.seed)
    const layer = seedLayer(p.seed) === Layer.SURFACE ? 'Surface' : 'Underground'
    const source = isSourcePlant(p.seed)

    let prod: string
    if (p.seed === SeedType.LICHEN) {
      prod = 'Produces: 🔴/🔵 Crystal (matches vein)'
    } else if (source) {
      prod = `Produces: ${RESOURCE_EMOJI[recipe.output]} ${RESOURCE_NAMES[recipe.output]}`
    } else {
      const i1 = RESOURCE_EMOJI[recipe.input1!]
      const i2 = RESOURCE_EMOJI[recipe.input2!]
      const o = RESOURCE_EMOJI[recipe.output]
      const on = RESOURCE_NAMES[recipe.output]
      prod = `${i1} + ${i2} → ${o} ${on}`
    }

    return `<div class="help-plant">
      <div class="help-name">${d.emoji} ${d.name} <span class="help-layer">${layer}</span></div>
      <div class="help-detail">${p.where}</div>
      <div class="help-detail">${prod}</div>
    </div>`
  }).join('')
}

function formatTimeOfDay(t: number): string {
  // 0.0 = midnight (12:00 AM), 0.25 = 6:00 AM, 0.5 = 12:00 PM, 0.75 = 6:00 PM
  const totalHours = t * 24
  let hours = Math.floor(totalHours)
  const minutes = Math.floor((totalHours - hours) * 60)
  const ampm = hours < 12 ? 'AM' : 'PM'
  hours = hours % 12
  if (hours === 0) hours = 12
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

function weatherIcon(weather: WeatherState): string {
  const day = weather.timeOfDay >= 0.25 && weather.timeOfDay < 0.75
  if (weather.isRaining) return '🌧️'
  return day ? '☀️' : '🌙'
}

function setupWeatherHud(): void {
  const iconEl = document.getElementById('hud-weather-icon')
  const clockEl = document.getElementById('hud-clock')
  const dayEl = document.getElementById('hud-day')
  if (!iconEl || !clockEl || !dayEl) return

  onWeatherChange((weather: WeatherState) => {
    iconEl.textContent = weatherIcon(weather)
    clockEl.textContent = formatTimeOfDay(weather.timeOfDay)
    dayEl.textContent = `Day ${weather.dayCount ?? 1}`
  })
}

function setupEmitClock(): void {
  const needle = document.getElementById('emit-needle')
  const tick = document.getElementById('emit-tick')
  if (!needle || !tick) return

  let flashTimer = 0

  onEmitProgress((progress: number, fired: boolean) => {
    const deg = progress * 360
    needle.style.transform = `translateX(-50%) rotate(${deg}deg)`

    if (fired) {
      tick.classList.add('flash')
      flashTimer = Date.now()
    } else if (flashTimer && Date.now() - flashTimer > 200) {
      tick.classList.remove('flash')
      flashTimer = 0
    }
  })
}

let _debugPlantMode: SeedType | null = null
export function getDebugPlantMode(): SeedType | null { return _debugPlantMode }

function setupDebugPanel(): void {
  if (window.innerWidth < 1024) return

  const panel = document.createElement('div')
  panel.id = 'debug-panel'
  panel.innerHTML = `
    <div id="debug-toggle">🔧 Debug</div>
    <div id="debug-body" class="hidden">
      <div class="dbg-section">
        <div class="dbg-label">Weather</div>
        <button class="dbg-btn" data-action="toggleRain">☔ Toggle Rain</button>
        <button class="dbg-btn" data-action="toggleDayNight">🌙 Toggle Day/Night</button>
      </div>
      <div class="dbg-section">
        <div class="dbg-label">Place Mature Plant</div>
        <div id="dbg-plant-grid"></div>
        <div id="dbg-plant-status" class="dbg-hint">Click a seed, then tap a tile</div>
      </div>
      <div class="dbg-section">
        <label class="dbg-label"><input type="checkbox" id="dbg-emission"> Show Emission Debug</label>
      </div>
    </div>
  `
  document.body.appendChild(panel)

  const toggle = document.getElementById('debug-toggle')!
  const body = document.getElementById('debug-body')!
  toggle.addEventListener('click', () => body.classList.toggle('hidden'))

  panel.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const action = (btn as HTMLElement).dataset.action!
      if (action === 'toggleRain') requestDebugAction({ type: 'toggleRain' })
      if (action === 'toggleDayNight') requestDebugAction({ type: 'toggleDayNight' })
    })
  })

  const plantGrid = document.getElementById('dbg-plant-grid')!
  const plantStatus = document.getElementById('dbg-plant-status')!
  const seeds: SeedType[] = [
    SeedType.WATER_LILY, SeedType.SUNFLOWER, SeedType.LIFELEAF,
    SeedType.DEWBELL, SeedType.LICHEN, SeedType.ROOTWEAVE, SeedType.GLIMSTONE,
  ]
  for (const seed of seeds) {
    const display = SEED_DISPLAY[seed]
    const btn = document.createElement('button')
    btn.className = 'dbg-seed-btn'
    btn.textContent = `${display.emoji}`
    btn.title = display.name
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (_debugPlantMode === seed) {
        _debugPlantMode = null
        plantStatus.textContent = 'Click a seed, then tap a tile'
        plantGrid.querySelectorAll('.dbg-seed-btn').forEach(b => b.classList.remove('active'))
      } else {
        _debugPlantMode = seed
        plantStatus.textContent = `Placing: ${display.name} — tap tile`
        plantGrid.querySelectorAll('.dbg-seed-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
      }
    })
    plantGrid.appendChild(btn)
  }
}

export function isDebugEmissionEnabled(): boolean {
  const cb = document.getElementById('dbg-emission') as HTMLInputElement | null
  return cb?.checked ?? false
}

export function showWelcomeBack(summary: IdleSummary): void {
  const overlay = document.createElement('div')
  overlay.id = 'welcome-back'

  const lines: string[] = []

  for (const [res, count] of Object.entries(summary.deliveries)) {
    const r = res as ResourceType
    lines.push(`<div class="wb-item">${RESOURCE_EMOJI[r]} +${count} ${RESOURCE_NAMES[r]} delivered</div>`)
  }
  for (const adv of summary.plantsAdvanced) {
    lines.push(`<div class="wb-item">${adv.name}: ${adv.from} → ${adv.to}</div>`)
  }
  if (summary.portalGreenGained > 0) {
    lines.push(`<div class="wb-item">Portal: +${summary.portalGreenGained} 💚 Green Crystal</div>`)
  }
  if (summary.portalMusicGained > 0) {
    lines.push(`<div class="wb-item">Portal: +${summary.portalMusicGained} 🎵 Music Notes</div>`)
  }

  overlay.innerHTML = `
    <div class="wb-card">
      <div class="wb-title">Welcome Back!</div>
      <div class="wb-time">Away for ${formatElapsed(summary.elapsedMs)}</div>
      <div class="wb-items">${lines.join('')}</div>
      <div class="wb-tap">Tap to continue</div>
    </div>
  `
  document.body.appendChild(overlay)

  overlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    overlay.remove()
  })
}

