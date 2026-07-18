# Leyline Garden — Game Design Document

A cozy mobile web game about growing magical plants, building resource networks, and nurturing a garden across two layers of a small isometric world.

## World

**Grid**: 24 columns x 16 rows, isometric 2:1 diamond tiles (64x32 pixels).

**Two layers** connected by holes:
- **Surface** — grass, water, paths, flowers, the Magic Tree, and the Portal
- **Underground** — dirt, stone, crystal veins (red and blue), the Moldering Log

The player digs holes (5 digs on a tile) to connect the layers. Leyline motes can relay through holes between layers.

### Fixed Landmarks

| Landmark | Location | Layer | Purpose |
|----------|----------|-------|---------|
| Water pool | (2-4, 2-4) 3x3 | Surface | Plant Water Lilies here |
| Magic Tree | (16, 6) | Surface | Buy seeds with accumulated resources |
| Portal | (12, 4) | Surface | End-game progression target |
| Moldering Log | (12, 10) | Underground | Pick up Life Essence |
| Red Crystal vein | (5-8, 3-4) | Underground | Plant Lichen here; pick up Red Crystal |
| Blue Crystal vein | (9-12, 19-20) | Underground | Plant Lichen here; pick up Blue Crystal |

## Player

A fairy/pixie who floats around the garden.

**Movement**: Tap to walk, keyboard arrows, or WASD. A* pathfinding across walkable tiles.

**Carry-one-thing**: The fairy carries exactly one item at a time — a resource or a seed. Tap a resource tile to pick up, tap a plant to deliver. Drop returns seeds to stock; resources are discarded.

**Tools** (toolbar at bottom):
- **Move** — walk around, context-sensitive interaction (pick up, deliver, inspect)
- **Dig** — dig tiles toward creating holes (5 digs = hole)
- **Plant** — select and place seeds
- **Leyline** — draw leyline paths (unlocked after first Water Lily + Sunflower reach maturity)

## Resources

| Resource | Emoji | How to get | Primary use |
|----------|-------|------------|-------------|
| Water | 💧 | Water Lily output; rain feeds plants; pick up from water tile | Plant growth, Tree buffer |
| Sunlight | ☀️ | Sunflower output; sunny weather feeds plants | Plant growth, Tree buffer |
| Red Crystal | 🔴 | Lichen on red tile; pick up from crystal tile | Plant growth, transmute input |
| Blue Crystal | 🔵 | Lichen on blue tile; pick up from crystal tile | Plant growth, transmute input |
| Life Essence | 🌿 | Lifeleaf/Rootweave output; pick up from Moldering Log | Seed currency, transmute input |
| Music Notes | 🎵 | Dewbell output | Portal fuel |
| Green Crystal | 💚 | Glimstone output | Portal fuel |

## Plants

Seven plant types across two layers, each with 4 growth stages: Seed → Sprout → Sapling → Mature.

### Source Plants (emit freely when mature)

| Plant | Layer | Where to plant | Output | Growth needs (per stage) |
|-------|-------|----------------|--------|--------------------------|
| Water Lily | Surface | Water tiles only | Water | Sunlight: 2/3/4 |
| Sunflower | Surface | Dug ground (depth 1-4) | Sunlight | Water: 2/3/4 |
| Lichen | Underground | Crystal tiles only | Red or Blue Crystal (matches tile) | Water: 2/3/4 |

Source plants are the foundation — they emit one mote per connected leyline every 2.5 seconds with no input cost.

### Transmute Plants (require inputs to emit)

| Plant | Layer | Output | Recipe | Growth needs (water/crystal/sun per stage) |
|-------|-------|--------|--------|---------------------------------------------|
| Lifeleaf | Surface | Life Essence | 3 Water + 3 Sunlight | 2/0/1 → 3/0/2 → 5/0/3 |
| Dewbell | Surface | Music Notes | 3 Red Crystal + 3 Blue Crystal | 2/0/1 → 3/0/1 → 5/0/2 |
| Rootweave | Underground | Life Essence | 3 Water + 3 Red Crystal | 2/0/1 → 2/1/1 → 3/2/2 |
| Glimstone | Underground | Green Crystal | 3 Life Essence + 3 Sunlight | 2/0/1 → 2/1/1 → 3/2/2 |

Transmute plants accumulate their two inputs (max 3 each). When both hit 3, they emit one output mote and reset both to 0.

### Growth

Plants are fed by:
1. **Weather** — every 15 seconds: sunny days give sunlight, rain gives water (surface plants + underground plants near holes)
2. **Leyline motes** — automated delivery of any resource type
3. **Manual carry** — the fairy picks up a resource and delivers it

When a stage's requirements are met, the plant immediately advances and counters reset.

## Leylines

Paths drawn across adjacent tiles (8-directional) that carry resource motes from sources to consumers.

### How motes flow
1. Every 2.5s, each mature source plant emits one mote onto each connected leyline (if space available)
2. Motes travel at 2 tiles/second along the leyline path
3. At the leyline endpoint, delivery is attempted in priority order:
   - **Portal** (if adjacent, accepts Green Crystal and Music Notes)
   - **Mature transmute plant** (absorbs as transmute input)
   - **Growing plant** (feeds growth requirements)
   - **Magic Tree** (accepts any resource into tree buffer)
   - **Hole relay** (spawns mote on opposite layer if outgoing leyline exists)
   - **Downstream leyline** (chains to adjacent leyline if no plants nearby)
4. If nothing accepts the mote, it stalls at the endpoint (blocks subsequent motes)

### Constraints
- Max 200 motes globally
- A leyline is "full" when mote count >= path length - 1
- Two motes cannot occupy the same grid tile
- Hole relay only triggers if no resource-accepting plants are near the hole

### Resource chains

The intended progression builds resource chains of increasing complexity:

```
Water Lily → Water ────────────┐
                               ├→ Lifeleaf → Life Essence ──────┐
Sunflower → Sunlight ──────────┘                                 ├→ Glimstone → Green Crystal → Portal
                               ┌→ (via hole relay + weather) ───┘
Lichen (red) → Red Crystal ────┤
                               ├→ Dewbell → Music Notes → Portal
Lichen (blue) → Blue Crystal ──┘
                               ┌→ Rootweave → Life Essence
Water (via hole) ──────────────┤
Lichen (red) → Red Crystal ────┘
```

## Magic Tree

Located at (16, 6) on surface. Accumulates resources fed via leylines or weather, then sells seeds.

### Seed Costs

| Tier | Seeds | Cost resource | Ladder |
|------|-------|---------------|--------|
| 1 | Sunflower, Water Lily, Lichen | Sunflower=Sunlight, Lily=Water, Lichen=Life Essence | 1, 2, 5, 10, 20, 30, 40, 50 |
| 2 | Lifeleaf, Rootweave | Life Essence | 2, 5, 10, 25, 50, 100 |
| 3 | Dewbell, Glimstone | Life Essence | 10, 25, 50, 100, 250, 500, 1000 |

Each purchase advances the ladder position for that seed type. After the ladder is exhausted, cost stays at the final value.

### Tree feeding
- Weather: 1 sunlight every 15s (sunny day), 1 water every 15s (rain)
- Leylines: any resource delivered to an adjacent leyline endpoint

## Portal

Located at (12, 4) on surface. The end-game progression target.

**Accepts**: Green Crystal and Music Notes (via leyline delivery or manual carry).

**Leveling**: Level = min(green crystal progress, music notes progress). Each level requires 10^(level+1) of each resource. Level 1 = 10 each, Level 2 = 100 more each, Level 3 = 1000 more, etc.

## Weather & Time

**Day/Night cycle**: 24 in-game hours = ~6 real minutes (144 emit ticks).

| Time | Phase | Effect |
|------|-------|--------|
| 0.00 | Midnight | Dark, no feeding |
| 0.25 | Dawn | Daytime begins |
| 0.50 | Noon | Brightest |
| 0.75 | Dusk | Night begins |

**Rain**: 30% chance when dry period ends. Lasts 30-120s real time. Dry periods: 60-120s.

**Feeding schedule** (every 6 emit ticks = 15s real time):
- Sunny day: plants get sunlight, tree gets 1 sunlight
- Rain (any time): plants get water, tree gets 1 water
- Night + clear: nothing
- Underground plants near holes also receive the surface weather benefit

## Digging

- Surface: dig grass, flowers, moss, mushrooms, paths (depth 1-4 = plantable, depth 5 = hole)
- Underground: dig dirt only (depth 5 = stone, no hole from below)
- Leylines crossing a dig tile are removed when the tile is dug

## Idle / Away Mechanics

When the player returns after being away (10s minimum, 24h cap):
- Clock advances proportionally
- Estimated weather split: 35% sunlight, 30% water feeding
- Leyline emissions simulated in 4 propagation waves
- Plants grow, transmute plants produce, portal accumulates
- Welcome-back summary shows what happened

## Unlock Progression

1. **Start**: Move + Dig + Plant tools available
2. **First Water Lily + Sunflower reach maturity**: Leyline tool unlocks
3. **Build leyline chains**: Automate resource flow
4. **Grow transmute plants**: Produce advanced resources
5. **Feed portal**: Level up with Green Crystal + Music Notes

## Visual Design

- Procedurally generated pixel art (no external assets)
- Isometric 2:1 diamond grid
- Day/night lighting via MULTIPLY overlay (everything dims except "glowy" entities)
- Glowy entities (mature plants, fairy, portal, tree, motes, leylines, crystals) render above the overlay
- Rain: diagonal screen-space streaks on surface, expanding splash rings near underground holes
- Crystal glows: isometric ellipses, flood-fill grouped for adjacent blocks
