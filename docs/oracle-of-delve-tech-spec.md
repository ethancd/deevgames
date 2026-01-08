# Oracle of Delve - Technical Specification

## 1. Overview

**Game Title:** Oracle of Delve (working title: "Gem Wizard Delve")

**Genre:** Roguelike Dungeon Crawler / Turn-Based Combat

**Platform:** Mobile (Vertical Screen, Phone-Optimized)

**Target Session Length:** 5-10 minutes per run

**Core Hook:** Descend a dungeon, blast enemies with elemental attacks, draft powerful gems to build game-breaking combinations. Die or win in ~10 rooms.

---

## 2. Game Concept

A fast-paced, roguelike dungeon crawler focused on tactical turn-based combat and strategic gem drafting. Players progress through increasingly difficult rooms, making choices about risk/reward paths, building their character through gem acquisition, and learning enemy patterns through repeated playthroughs.

**Key Design Pillars:**
- **Simplicity First:** Extremely simple UI/UX, mobile-optimized for quick sessions
- **Build Discovery:** Gems combine in interesting ways to create powerful synergies
- **Risk/Reward:** Path choices between harder (better rewards) and easier (safer) routes
- **Learn Through Play:** Enemy behaviors and optimal strategies discovered organically

---

## 3. Core Game Loop

### Run Structure
1. **Enter Room** → See 2-4 enemies with visible stats (HP, element, turn order position)
2. **Combat** → Fight until all enemies dead or player dies
3. **Draft** → Choose 1 gem from 3 options
4. **Path Choice** → Select next room:
   - **Hard Path:** Tougher enemies, better gem rarity
   - **Easy Path:** Weaker enemies, common gem drops
5. **Repeat** → Continue for ~10 rooms
6. **Boss Fight** → Room 10 features a boss with higher HP and complex attack patterns

### Win/Loss Conditions
- **Win:** Defeat the boss on room 10
- **Loss:** Player HP reaches 0 (triggers run end, try again)

---

## 4. Combat System

### Turn Order System
- **Timeline Display:** Visual representation showing player + all enemies in speed order
- **Speed-Based:** Faster units get more frequent turns
- **Preview:** Players can see who acts next in the turn queue
- **Dynamic:** Speed can be modified by gems (e.g., Topaz: +1 speed) and status effects (e.g., Slow)

### Player Turn
1. **Attack Selection:** Choose one of 2-3 available attacks
2. **Target Selection:** Choose which enemy to target
3. **Execution:** Attack resolves with damage calculation

### Attack Types

#### 1. Basic Attack
- Always available
- Low damage
- No cooldown
- Reliable fallback option

#### 2. Charged/Big Attack
- High damage
- **Cooldown:** X turns after use, OR
- **Charging:** Requires charging for one turn before use
- Risk/reward: powerful but requires planning

#### 3. Status Attack
- Applies status effects to enemies:
  - **Freeze:** Skips enemy's next turn
  - **Burn:** Damage over time (DoT)
  - **Slow:** Reduces enemy speed (fewer turns)
- Tactical utility over raw damage

### Enemy Turn
- **Player Knowledge:** Player knows it's the enemy's turn but NOT what action they'll take
- **Enemy Behaviors:** Different enemy types have distinct AI patterns
  - Learn through repeated encounters
  - Examples: Aggressive attackers, defensive tanks, healers, buffers, AOE specialists
- **Unpredictability:** Creates tension and forces adaptation

### Elemental System

**Elements:** Fire, Ice, Lightning (potentially more in V3)

**Enemy Properties:**
- **Weaknesses:** Taking bonus damage from specific elements
- **Resistances:** Taking reduced damage from specific elements

**Damage Calculation:**
- **Weakness Hit:** Bonus damage (e.g., +50%)
- **Resistance Hit:** Reduced damage (e.g., -50%)
- **Neutral:** Standard damage

**Strategic Depth:** Players must build diverse elemental options to handle various enemy compositions

---

## 5. Health & Death System

### Health Mechanics
- **HP Persistence:** Player HP carries across all rooms in a run
- **No Healing (V1):** HP loss is permanent for the run
- **Potential V2+:** Healing gems or room rewards (e.g., Bloodstone: "Gain HP when you kill with charged attack")

### Death
- **Run End:** When HP reaches 0, run ends immediately
- **No Lives:** Single life per run
- **Restart:** Player starts a new run from room 1
- **Meta-Progression (V3):** Unlock new gems into the draft pool for future runs

---

## 6. Gems & Items System

### Gem Drafting
- **Frequency:** After each combat encounter
- **Choice:** Pick 1 gem from 3 random options
- **Build Crafting:** Players construct their build through sequential choices
- **Rarity Tiers:** Common, Uncommon, Rare (affected by path choice)

### V1 Gems (Stat Modifiers)

Simple, straightforward stat boosts:

| Gem | Effect |
|-----|--------|
| **Ruby** | +2 Fire Damage |
| **Sapphire** | +2 Ice Damage |
| **Topaz** | +1 Speed (more turns relative to enemies) |
| **Garnet** | +5 Max HP |
| **Onyx** | Basic Attack Cooldown -1 |
| **Amethyst** | Charged Attack Damage +50% |

**Design Philosophy:** Start simple to establish core loop, then add complexity

### V2+ Gems (Synergy & Combos)

Complex interactions that create build diversity:

| Gem | Effect |
|-----|--------|
| **Prism** | Gems count double for effects (multiplier) |
| **Frostfire** | Fire attacks also proc Ice weakness (dual-element) |
| **Bloodstone** | Gain HP when you kill with Charged Attack (sustain) |

**Design Philosophy:** Encourage players to discover powerful combinations and "game-breaking" builds

---

## 7. UI/UX Requirements

### Platform Constraints
- **Orientation:** Vertical screen (portrait mode)
- **Device:** Mobile phone optimized
- **One-Handed Play:** All interactions within thumb reach

### Design Principles
- **Extreme Simplicity:** Minimal clutter, clear information hierarchy
- **Tappable Everything:** Large touch targets for attacks, enemies, gems
- **Visual Feedback:**
  - Damage numbers on hit
  - Turn order timeline always visible
  - Enemy HP bars clearly displayed
  - Status effect indicators

### Core UI Elements

#### Combat Screen
```
┌─────────────────────┐
│   Turn Timeline     │  ← Visual queue of turn order
├─────────────────────┤
│                     │
│   Enemy Display     │  ← 2-4 enemies with HP, element icon
│   [E1] [E2] [E3]    │
│                     │
├─────────────────────┤
│   Player HP: 45/50  │
├─────────────────────┤
│  [Attack 1]         │  ← Large tappable buttons
│  [Attack 2]         │
│  [Attack 3]         │
└─────────────────────┘
```

#### Draft Screen
```
┌─────────────────────┐
│  Choose a Gem:      │
├─────────────────────┤
│  ┌─────────┐        │
│  │  Ruby   │        │  ← Large gem cards
│  │ +2 Fire │        │     with clear descriptions
│  └─────────┘        │
│  ┌─────────┐        │
│  │ Topaz   │        │
│  │ +1 Speed│        │
│  └─────────┘        │
│  ┌─────────┐        │
│  │ Garnet  │        │
│  │ +5 HP   │        │
│  └─────────┘        │
└─────────────────────┘
```

#### Path Choice Screen
```
┌─────────────────────┐
│  Choose Next Room:  │
├─────────────────────┤
│                     │
│  ┌─────────────┐    │
│  │  Hard Path  │    │
│  │ 🔥🔥🔥       │    │
│  │ Better Gems │    │
│  └─────────────┘    │
│                     │
│  ┌─────────────┐    │
│  │  Easy Path  │    │
│  │ 🌿🌿         │    │
│  │ Common Gems │    │
│  └─────────────┘    │
└─────────────────────┘
```

### Animation & Feedback
- Damage numbers animate on hit
- Enemy HP bars deplete with animation
- Turn order timeline updates smoothly
- Status effects pulse/glow
- Keep animations snappy (< 0.5s per action)

---

## 8. Technical Architecture

### Technology Stack
- **Framework:** Ruby on Rails (existing codebase)
- **Frontend:** React (based on existing Forge implementation)
- **State Management:** React hooks/context
- **Styling:** CSS modules or Tailwind (consistent with existing patterns)

### Data Flow

```
GameState
  ├─ run: RunState
  │   ├─ currentRoom: number (1-10)
  │   ├─ playerHP: number
  │   ├─ playerMaxHP: number
  │   ├─ gems: Gem[]
  │   ├─ attackOptions: Attack[]
  │   └─ completedRooms: number[]
  │
  ├─ combat: CombatState | null
  │   ├─ enemies: Enemy[]
  │   ├─ turnQueue: TurnQueueEntry[]
  │   ├─ currentTurnIndex: number
  │   └─ statusEffects: StatusEffect[]
  │
  ├─ draft: DraftState | null
  │   └─ gemChoices: Gem[3]
  │
  └─ pathChoice: PathChoiceState | null
      ├─ hardOption: PathOption
      └─ easyOption: PathOption
```

### Core Game Systems

#### 1. Combat Engine
**Responsibilities:**
- Turn queue calculation based on speed stats
- Attack resolution and damage calculation
- Status effect application and tracking
- Enemy AI behavior execution

**Key Functions:**
```javascript
// Calculate turn order based on speed
calculateTurnQueue(player, enemies) -> TurnQueueEntry[]

// Process player attack
resolvePlayerAttack(attack, target, player, enemies) -> CombatResult

// Process enemy turn
resolveEnemyTurn(enemy, player) -> CombatResult

// Apply status effects at turn start/end
processStatusEffects(entity) -> StatusEffectResult[]

// Check win/loss conditions
checkCombatEnd(player, enemies) -> 'victory' | 'defeat' | 'ongoing'
```

#### 2. Gem System
**Responsibilities:**
- Gem generation with rarity weighting
- Stat modification application
- Synergy effect calculation (V2+)

**Key Functions:**
```javascript
// Generate gem choices based on current room/path
generateGemChoices(roomNumber, pathDifficulty) -> Gem[3]

// Apply gem effects to player stats
applyGemEffects(player, gems) -> PlayerStats

// Calculate synergies (V2+)
calculateSynergies(gems) -> SynergyEffect[]
```

#### 3. Enemy Generation
**Responsibilities:**
- Enemy composition based on room difficulty
- Stat scaling across rooms
- Behavior pattern assignment

**Key Functions:**
```javascript
// Generate enemy encounter
generateEnemies(roomNumber, difficulty) -> Enemy[]

// Scale enemy stats
scaleEnemyStats(baseEnemy, roomNumber) -> Enemy

// Assign AI behavior
assignBehavior(enemy) -> AIBehavior
```

#### 4. Progression System
**Responsibilities:**
- Room advancement
- Path choice logic
- Run state management

**Key Functions:**
```javascript
// Advance to next room
advanceRoom(currentRoomNumber, pathChoice) -> Room

// End run (victory or defeat)
endRun(result, player) -> RunSummary

// Calculate run rewards (V3 meta-progression)
calculateRunRewards(result, player) -> Reward[]
```

---

## 9. Data Models

### Player
```javascript
{
  id: string,
  hp: number,
  maxHP: number,
  speed: number,
  gems: Gem[],
  attacks: Attack[],
  statusEffects: StatusEffect[]
}
```

### Enemy
```javascript
{
  id: string,
  type: EnemyType,  // 'goblin' | 'orc' | 'wizard' | etc.
  hp: number,
  maxHP: number,
  speed: number,
  element: Element,  // 'fire' | 'ice' | 'lightning'
  weaknesses: Element[],
  resistances: Element[],
  behavior: AIBehavior,
  statusEffects: StatusEffect[]
}
```

### Gem
```javascript
{
  id: string,
  name: string,
  description: string,
  rarity: 'common' | 'uncommon' | 'rare',
  effects: GemEffect[],
  // V2+: synergy tags for combo detection
  tags?: string[]
}
```

### GemEffect
```javascript
{
  type: 'stat_boost' | 'damage_modifier' | 'cooldown_reduction' | 'synergy',
  stat?: 'hp' | 'speed' | 'fire_damage' | 'ice_damage' | etc.,
  value: number,
  // V2+: conditional effects
  condition?: EffectCondition
}
```

### Attack
```javascript
{
  id: string,
  name: string,
  type: 'basic' | 'charged' | 'status',
  element: Element | null,
  baseDamage: number,
  cooldown: number,
  currentCooldown: number,
  // For charged attacks
  requiresCharge?: boolean,
  isCharged?: boolean,
  // For status attacks
  statusEffect?: StatusEffectTemplate
}
```

### StatusEffect
```javascript
{
  id: string,
  type: 'freeze' | 'burn' | 'slow',
  duration: number,  // turns remaining
  // For DoT effects
  damagePerTurn?: number,
  // For stat modifiers
  statModifier?: {
    stat: string,
    value: number
  }
}
```

### TurnQueueEntry
```javascript
{
  entityId: string,
  entityType: 'player' | 'enemy',
  speed: number,
  nextTurnTick: number  // When this entity acts next
}
```

### Room
```javascript
{
  roomNumber: number,
  difficulty: 'easy' | 'normal' | 'hard' | 'boss',
  enemies: Enemy[],
  // For path choice
  nextRoomOptions?: {
    hard: RoomTemplate,
    easy: RoomTemplate
  }
}
```

---

## 10. Version Roadmap

### V0 — The Crunch (Prototype)
**Goal:** Validate core combat feel

**Features:**
- Single room
- 2 enemies with HP bars
- Player has ONE basic attack
- Fixed turn order: Player, Enemy, Enemy, Player, Enemy, Enemy...
- Kill them before they kill you
- **No gems, no draft, no complexity** — just the combat feel

**Implementation Priority:**
1. Basic turn-based combat engine
2. Damage calculation
3. HP tracking and display
4. Win/loss detection
5. Simple UI: enemy display, attack button, HP bars

**Target Timeline:** Playable in 10 minutes

---

### V1 — The Loop (MVP)
**Goal:** Complete core game loop

**Features:**
- **3 rooms** (increasing difficulty)
- **Gem drafting** after each room (1 of 3 choices)
- **2 attacks:**
  - Basic attack (always available)
  - 1 elemental attack (fire, ice, or lightning)
- **Elemental weaknesses:** Enemies have 1 weakness
- **Room progression:** Linear (no path choice yet)

**New Systems:**
1. Gem system (V1 stat-mod gems only)
2. Draft UI
3. Elemental damage calculation
4. Room generation
5. Multi-room run state

**Data Models Needed:**
- Gem definitions
- Attack templates
- Enemy templates with weaknesses
- Run state tracking

**Success Criteria:**
- Can complete a 3-room run
- Gem choices feel meaningful
- Elemental interactions are clear

---

### V2 — The Run (Full Game)
**Goal:** Complete roguelike experience

**Features:**
- **10 rooms + boss** (room 10)
- **Path choice system:**
  - Hard path: tougher enemies, better gem rarity
  - Easy path: weaker enemies, common gems
- **3 attack options** (basic + 2 elemental/special)
- **Cooldown system:** Charged attacks have cooldowns
- **Status effects:**
  - Freeze: Skip enemy turn
  - Burn: Damage over time
  - Slow: Reduce enemy speed
- **Speed-based turn order:** Faster units act more frequently

**New Systems:**
1. Path choice logic and UI
2. Boss encounter system
3. Cooldown tracking
4. Status effect engine
5. Speed-based turn queue calculation
6. Rarity-weighted gem generation

**Balancing Considerations:**
- Enemy stat scaling curve (rooms 1-10)
- Gem rarity distribution
- Hard vs. Easy path rewards
- Boss HP and damage

**Success Criteria:**
- Complete 10-room run feels satisfying
- Path choices create meaningful risk/reward decisions
- Boss fights feel epic and challenging

---

### V3 — The Depth (Content & Systems)
**Goal:** Replayability and depth

**Features:**
- **Synergy gems:**
  - Prism (gems count double)
  - Frostfire (fire attacks proc ice weakness)
  - Bloodstone (heal on charged kill)
- **Enemy behaviors:**
  - Healer: Restores ally HP
  - Buffer: Grants allies stat boosts
  - AOE: Hits player multiple times
- **More elements:** Add 2+ new elements beyond Fire/Ice/Lightning
- **Meta-progression:**
  - Unlock new gems into the draft pool
  - Track run statistics
  - Achievements/milestones

**New Systems:**
1. Synergy detection engine
2. Complex enemy AI behaviors
3. Multi-target attacks
4. Meta-progression database
5. Unlock system

**Balancing Considerations:**
- Synergy power levels (avoid broken combos too early)
- Enemy behavior counterplay
- Unlock pacing

**Success Criteria:**
- Players discover interesting build synergies
- Enemy variety requires tactical adaptation
- Meta-progression provides long-term goals

---

## 11. Implementation Priorities

### Phase 1: Core Combat (V0)
**Estimated Effort:** 1-2 days

1. **Turn-based combat engine**
   - Turn queue management
   - Basic attack resolution
   - Damage calculation
2. **Combat UI**
   - Enemy display with HP
   - Attack button
   - Turn indicator
3. **Win/loss detection**

**Deliverable:** Playable single-room combat prototype

---

### Phase 2: Game Loop (V1)
**Estimated Effort:** 3-5 days

1. **Gem system foundation**
   - Gem data models
   - Stat modification logic
   - Draft UI
2. **Multi-room progression**
   - Room state management
   - Run state tracking
3. **Elemental system**
   - Element types
   - Weakness/resistance calculation
   - Multiple attack options
4. **Enemy generation**
   - Enemy templates
   - Room-based difficulty scaling

**Deliverable:** Complete 3-room MVP with drafting

---

### Phase 3: Full Roguelike (V2)
**Estimated Effort:** 5-7 days

1. **Path choice system**
   - Path UI
   - Difficulty branching logic
   - Rarity weighting
2. **Advanced combat**
   - Cooldown system
   - Charged attacks
   - Status effects (freeze, burn, slow)
3. **Speed-based turn order**
   - Dynamic turn queue
   - Speed stat effects
4. **Boss encounters**
   - Boss templates
   - Complex attack patterns
5. **Balancing**
   - Stat curves
   - Gem rarity tables
   - Enemy composition rules

**Deliverable:** Full 10-room game with path choices and boss

---

### Phase 4: Depth & Polish (V3)
**Estimated Effort:** 7-10 days

1. **Synergy gems**
   - Combo detection
   - Complex effect resolution
2. **Enemy AI behaviors**
   - Healer logic
   - Buffer logic
   - AOE attacks
3. **Meta-progression**
   - Unlock system
   - Persistent player data
   - Run statistics
4. **Content expansion**
   - Additional elements
   - New gem types
   - New enemy types
5. **Polish**
   - Animations
   - Sound effects
   - Tutorial/onboarding

**Deliverable:** Feature-complete game with high replayability

---

## 12. Testing & Balancing

### Testing Priorities

#### V0 Testing
- Combat feels responsive and clear
- Damage numbers are readable
- Turn order is obvious

#### V1 Testing
- Gem choices feel meaningful
- Elemental weaknesses are noticeable
- Difficulty scales smoothly across 3 rooms

#### V2 Testing
- Path choices create real strategic decisions
- Cooldowns don't feel punishing
- Status effects have clear visual feedback
- Boss feels challenging but fair

#### V3 Testing
- Synergies are discoverable
- Enemy behaviors have clear counters
- Meta-progression provides long-term goals

### Balancing Approach

**Stat Scaling Formula:**
```
Enemy HP = BaseHP * (1 + (RoomNumber - 1) * 0.25)
Enemy Damage = BaseDamage * (1 + (RoomNumber - 1) * 0.2)
```

**Gem Rarity Distribution:**
| Path | Common | Uncommon | Rare |
|------|--------|----------|------|
| Easy | 70% | 25% | 5% |
| Hard | 40% | 40% | 20% |
| Boss Victory | 20% | 40% | 40% |

**Key Balancing Levers:**
1. Enemy HP scaling per room
2. Enemy damage scaling per room
3. Gem power levels
4. Attack cooldowns
5. Status effect durations
6. Player starting HP

---

## 13. Technical Risks & Mitigation

### Risk 1: Turn Order Complexity
**Risk:** Speed-based turn order can be confusing or difficult to visualize

**Mitigation:**
- Clear timeline UI showing upcoming turns
- Visual indicators for "next to act"
- Tutorial explaining turn order in V0
- Playtest heavily before V2 launch

### Risk 2: Mobile Touch Targets
**Risk:** Small buttons may be hard to tap accurately

**Mitigation:**
- Minimum 44x44px touch targets (iOS HIG standard)
- Generous padding around buttons
- Visual feedback on tap (button state changes)
- Playtest on actual devices

### Risk 3: Gem Synergy Balance
**Risk:** Some gem combos may be overpowered or useless

**Mitigation:**
- Start simple (V1: stat-mods only)
- Introduce synergies gradually (V2+)
- Track win rates by gem composition
- Be willing to nerf/buff gems based on data

### Risk 4: Session Length Variability
**Risk:** Runs may take too long or feel too short

**Mitigation:**
- Target 5-10 minutes for V2 (10 rooms)
- Playtest and adjust:
  - Enemy HP values
  - Number of enemies per room
  - Animation speeds
- Consider "fast mode" option for experienced players

---

## 14. Future Considerations (Post-V3)

### Potential Features
1. **Additional Game Modes:**
   - Daily Challenge (fixed seed)
   - Endless Mode (survive as long as possible)
   - Boss Rush

2. **Expanded Meta-Progression:**
   - Character classes with different starting attacks
   - Permanent upgrades (e.g., "Start with +10 Max HP")
   - Achievement system with rewards

3. **Social Features:**
   - Leaderboards
   - Share builds/seeds
   - Replay system

4. **Monetization (If Applicable):**
   - Cosmetic gem skins
   - Additional character classes
   - Premium daily challenges

5. **Content Packs:**
   - New element types
   - New enemy factions
   - New biomes/themes

---

## 15. Appendix: Design Philosophy

### Core Tenets

1. **Mobile-First:**
   - Every interaction optimized for touch
   - Quick sessions for commutes/breaks
   - Vertical orientation for one-handed play

2. **Learn Through Play:**
   - Minimal tutorials
   - Mechanics are discoverable
   - Enemy behaviors learned via observation

3. **Meaningful Choices:**
   - Every gem draft matters
   - Path choices create strategy
   - No "obviously correct" decisions

4. **Build Diversity:**
   - Multiple viable strategies
   - Synergies create unique playstyles
   - Encourage experimentation

5. **Respect Player Time:**
   - 5-10 minute runs
   - No grinding required
   - Fast restart after death

### Inspiration & Reference Games
- **Slay the Spire:** Card drafting, path choices, synergy building
- **Into the Breach:** Timeline visibility, tactical depth
- **Hades:** Fast-paced runs, build variety, roguelike structure
- **Downwell:** Vertical mobile gameplay, simple controls
- **Pokémon:** Elemental weaknesses/resistances

---

## 16. Open Questions

1. **Art Style:** What visual style fits the fantasy theme and mobile constraints?
2. **Sound Design:** How much audio feedback is needed? (SFX, music, voiceovers?)
3. **Tutorial:** How much onboarding is necessary for V1?
4. **Save System:** Should runs be saveable mid-run, or only at room completion?
5. **Difficulty Modes:** Should there be multiple difficulty settings, or just the path choice system?
6. **Gem Pool Size:** How many gems should exist at launch? (V1: ~10, V2: ~20, V3: ~30+?)

---

## 17. Success Metrics

### V0 Playtest Goals
- Can new players understand combat within 30 seconds?
- Does combat feel satisfying and clear?

### V1 MVP Goals
- Average run completion time: 5-10 minutes
- Playtesters understand gem effects without explanation
- 50%+ playtesters want to play "one more run"

### V2 Launch Goals
- 60%+ retention after first run
- Average session length: 10-15 minutes
- Positive feedback on path choice decisions

### V3 Success Metrics
- 30%+ D7 retention
- Average sessions per user: 5+
- Community sharing builds/strategies

---

## Conclusion

Oracle of Delve aims to deliver a tight, focused roguelike experience optimized for mobile. By starting with a minimal V0 prototype and progressively adding complexity through V1, V2, and V3, we can validate core mechanics early and build on a solid foundation.

The emphasis on **simple UI/UX**, **meaningful choices**, and **build discovery** should create a compelling loop that keeps players engaged across multiple runs.

Next steps: Implement V0 combat prototype and gather initial feedback on feel and clarity.
