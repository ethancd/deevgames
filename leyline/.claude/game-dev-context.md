# Leyline Garden — Game Dev Session Context

This file is maintained by the orchestrator (main conversation) and read by every specialist agent before making changes. Update it after every completed change.

## Architecture

- **Framework**: Phaser 3.88, Vite, TypeScript strict mode
- **Grid**: 24x16 isometric 2:1 ratio (64x32 diamond tiles, HALF_W=32, HALF_H=16)
- **Layers**: Surface + Underground, connected by holes
- **Tests**: Vitest, ~225 tests. Run with `npx vitest run`
- **Dev server**: port 3003, Tailscale-accessible

## Depth Hierarchy

| Depth | What | Notes |
|-------|------|-------|
| (col+row)*10 | Tile sprites | Base terrain |
| 9000 | Lighting overlay | MULTIPLY blend, full-world rectangle |
| 9050 + iso | Crystal/hole glows | ADD blend, isometric ellipses (2:1 ratio) |
| 9050 + iso | Mature plant sprites | Moved above overlay so they "glow" through night |
| 9050 | Magic tree glow + sprite | Pulsing green ellipse, ADD blend |
| 9051 | Portal sprite | Above overlay |
| 9050 | Portal glow | ADD blend, pulsing scale tween |
| 9055 + iso | Player (fairy) sprite | Above overlay, glows through darkness |
| 9060 | Rain splashes (underground) | ADD blend, expanding circles near holes |
| 9100 | Leyline graphics | Lines + direction arrows |
| 9101 | Leyline draw preview | While drawing new leylines |
| 9200 | Motes | MotePool sprites |
| 9300 | Rain graphics | scrollFactor=0, screen-space diagonal lines |
| 9400 | Debug graphics | Emission indicators |
| 9401 | Debug text labels | Reason strings |

"iso offset" = `(col + row) * 0.1` for relative front-to-back sorting within a depth band.

## Established Patterns — DO NOT violate

- **Glowy things above overlay**: move the SPRITE to depth 9050+, don't add a separate glow circle
- **Isometric glow shapes**: use ELLIPSES with 2:1 aspect ratio, not circles, not diamond polygons
- **Feed timing**: emit-tick counter (FEED_EVERY_N_TICKS=6, every 15s real), NOT a separate ms timer
- **Seed costs**: sunflower=SUNLIGHT, water_lily=WATER, everything else=LIFE_ESSENCE
- **hasPlantNear guard**: only count plants that canAcceptResource (not mature source plants)
- **Mote occupancy**: never filter by progress in isGridTileOccupied; use excludeMote for self-exclusion
- **No extra overlays**: if user says "make X glow", move the existing sprite, don't add decorative circles

## File Ownership Map

### Rendering domain
- `src/phaser/scenes/BaseGameScene.ts` (~1900 lines) — main scene, lighting, glows, rain, debug, tap handling
- `src/phaser/scenes/SurfaceScene.ts` — surface-specific overrides
- `src/phaser/scenes/UndergroundScene.ts` — underground-specific overrides
- `src/phaser/scenes/BootScene.ts` — procedural texture generation
- `src/phaser/Lighting.ts` — getTimeOfDayTint, getCloudedTint, getHoleLightAlpha
- `src/phaser/IsoUtils.ts` — gridToScreen, screenToGrid, isoDepth, isoWorldBounds
- `src/phaser/MotePool.ts` — mote sprite pooling (depth 9200)

### Sim domain
- `src/sim/LeylineEngine.ts` (~530 lines) — mote emission, movement, delivery, relay
- `src/sim/WeatherSystem.ts` (~310 lines) — clock, rain, feeding, idle simulation
- `src/sim/World.ts` — game state, plant placement, dig, seed costs, save/load
- `src/sim/PlantConfig.ts` — growth requirements, recipes, seed metadata
- `src/sim/types.ts` — all interfaces, enums, constants
- `src/sim/Pathfinding.ts` — A* grid pathfinding
- `src/sim/SaveManager.ts` — localStorage persistence

### UI domain
- `src/bridge.ts` — pub/sub event bus between Phaser and DOM
- `src/ui.ts` — toolbar, tooltips, weather HUD, emit clock, debug panel
- `index.html` — DOM structure + CSS

## Current State

- Day/night cycle with MULTIPLY overlay tinting
- Rain: diagonal screen-space lines on surface, expanding splash rings near underground holes
- Crystal glows: flood-fill grouped, isometric ellipses, ADD blend
- Hole light shafts: isometric ellipses modulated by surface time-of-day
- Debug panel: toggle rain, toggle day/night, place mature plants, emission debug overlay
- Emit interval: 2500ms, clock advances 10 in-game min per tick
- 7 seed types across 3 cost tiers
- Carry-one-thing mechanic (pixie carries single resource/seed)

## Known Issues / Unresolved

- Water lily glow height may need adjusting (sprite origin vs visual center)
- Rain visual intensity not verified on device
- Crystal glow sizing for irregular cluster shapes may look off
