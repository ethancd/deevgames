# Elemental Tactics AI Engine - Technical Implementation Plan

## Current State Assessment

### What Exists
- **Working minimax AI** with alpha-beta pruning (depth 2-4)
- **8-factor evaluation** (unit value, resources, territory, mining, threats, mobility, center, health)
- **Full move generation** (all legal moves enumerated per phase)
- **Difficulty levels** (easy/medium/hard with depth/time limits)

### What's Missing for "Competitive Engine"
1. **Public/Private state separation** - AI currently sees opponent's queue and resources (cheating)
2. **Belief modeling** - No representation of uncertainty about opponent state
3. **Turn-plan generation** - Full enumeration of 4-action sequences is combinatorially explosive
4. **Information-set search** - No mechanism to prevent "clairvoyant" AI decisions

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         AI ENGINE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Public     │    │    Belief    │    │   Turn-Plan      │  │
│  │ Observation  │───▶│    Model     │───▶│   Generator      │  │
│  │   Layer      │    │  (particles) │    │   (beam search)  │  │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘  │
│                                                    │            │
│                                                    ▼            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    RIS-ISMCTS Search                      │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │  Re-determinization: Sample opponent hidden state   │ │  │
│  │  │  from current player's belief at each simulation    │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────┬─────────────────────────────┘  │
│                               │                                 │
│                               ▼                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Value Model                            │  │
│  │  ┌────────────────┐    ┌─────────────────────────────┐   │  │
│  │  │ Static Eval    │    │ Tactical Sharpener          │   │  │
│  │  │ (8+ factors)   │◀──▶│ (shallow alpha-beta on hot) │   │  │
│  │  └────────────────┘    └─────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Public/Private State Separation

**Goal:** Prevent the AI from accidentally cheating by separating observable vs hidden information.

### 1.1 Define State Types

```typescript
// src/ai/state/types.ts

interface PublicState {
  board: BoardState;           // All unit positions, cells, mined depths
  turn: TurnState;             // Current player, phase, actions remaining
  observedEvents: GameEvent[]; // Mining events, placements, promotions seen
}

interface PrivateState {
  resources: number;           // Hidden stockpile
  buildQueue: QueuedUnit[];    // Hidden queue contents
}

interface FullKnowledge {
  public: PublicState;
  own: PrivateState;           // What I know about myself (certain)
  opponentBelief: BeliefState; // What I believe about opponent (uncertain)
}

interface BeliefState {
  particles: OpponentParticle[];
  // Each particle is one hypothesis about opponent's hidden state
}

interface OpponentParticle {
  resources: number;
  buildQueue: QueuedUnit[];
  weight: number;              // Likelihood weight
}
```

### 1.2 Observable Events Contract

Define exactly what a player can observe:

| Event | Observable By Opponent? |
|-------|------------------------|
| Unit placement | Yes (unit appears on board) |
| Unit position/movement | Yes |
| Mining action | Yes (see unit mine, can track mined squares) |
| Attack action | Yes |
| Promotion | Yes (unit tier changes) |
| Resources gained from mine | No (but inferable from mining stat + cell depth) |
| Resources spent on queue | No |
| Queue contents | No |
| Resource stockpile | **TBD - KEY QUESTION** |

### 1.3 Implementation Tasks

- [ ] Create `PublicState` type and extractor from `GameState`
- [ ] Create `PrivateState` type and extractor
- [ ] Create `getObservation(state, asPlayer)` function
- [ ] Add event logging system for observable events
- [ ] Modify AI evaluation to only use `FullKnowledge` (not raw `GameState`)

---

## Phase 2: Belief Modeling (Particle Filter)

**Goal:** Represent uncertainty about opponent's hidden state.

### 2.1 Particle Representation

```typescript
// src/ai/belief/types.ts

interface OpponentParticle {
  id: string;
  resources: number;
  buildQueue: QueuedUnit[];
  weight: number;
}

interface BeliefState {
  particles: OpponentParticle[];
  minResources: number;        // Conservative bound
  maxResources: number;        // Liberal bound
}
```

### 2.2 Belief Update Rules

**On Observed Mining:**
```
For each particle:
  particle.resources += inferred_gain
  // inferred_gain = min(unit.mining, cell.resourceLayers - cell.minedDepth)
```

**On Observed Placement:**
```
For each particle:
  cost = unit_definition.cost
  if particle.resources < cost:
    kill particle (impossible state)
  else:
    particle.resources -= cost
    remove matching item from particle.buildQueue
```

**On Observed Promotion:**
```
For each particle:
  cost = promotion_cost_difference
  if particle.resources < cost:
    kill particle
  else:
    particle.resources -= cost
```

**On Turn Boundary (Queue Phase End):**
```
For each particle:
  advance buildQueue timers
  // Particles may spawn new queue items probabilistically
  // based on resource availability and "opponent style" prior
```

### 2.3 Implementation Tasks

- [ ] Create `BeliefState` type and initial belief factory
- [ ] Implement `updateBeliefOnMine(belief, event)`
- [ ] Implement `updateBeliefOnPlacement(belief, event)`
- [ ] Implement `updateBeliefOnPromotion(belief, event)`
- [ ] Implement `updateBeliefOnTurnEnd(belief)`
- [ ] Implement particle resampling when weights become degenerate
- [ ] Add belief pruning (kill impossible particles)

---

## Phase 3: Turn-Plan Generator (Beam Search)

**Goal:** Convert "up to 4 actions" into tractable candidate plans.

### 3.1 Plan Representation

```typescript
// src/ai/planner/types.ts

interface TurnPlan {
  id: string;
  actions: AIAction[];         // 0-4 actions in sequence
  score: number;               // Heuristic score from beam search
  tags: PlanTag[];             // Classification for analysis
}

type PlanTag =
  | 'kill'           // Achieves at least one elimination
  | 'setup_kill'     // Creates kill threat for next turn
  | 'combined_attack' // Multiple units attacking same target
  | 'spawn_denial'   // Infiltrates enemy spawn zone
  | 'mining'         // Resource extraction focus
  | 'defensive'      // Protects threatened units
  | 'promotion_play' // Involves promotion
  | 'passive';       // No meaningful impact
```

### 3.2 Beam Search Algorithm

```
BeamSearch(state, beamWidth=50, outputPlans=30):

  beam = [EmptyPlan]

  for step in 1..4:
    candidates = []
    for plan in beam:
      sim_state = simulate(state, plan.actions)
      if sim_state.actionsRemaining == 0:
        candidates.append(plan)  // Can't extend further
        continue

      extensions = generateOneStepExtensions(sim_state, plan)
      candidates.extend(extensions)

    // Score and prune
    for candidate in candidates:
      candidate.score = scorePartialPlan(candidate, state)

    beam = topK(candidates, beamWidth)

  return topK(beam, outputPlans)
```

### 3.3 Partial Plan Scoring Features

Score a partial plan based on:

1. **Kills achieved** (highest priority)
2. **Damage dealt** (partial progress toward kills)
3. **Threats created** (units now adjacent to killable enemies)
4. **Resources mined** (economy)
5. **Spawn zone infiltration** (strategic)
6. **Units exposed** (penalty for putting units in danger)
7. **Step efficiency** (reward doing meaningful things with remaining actions)

### 3.4 Tactical Templates (Forced Expansion)

Ensure beam never misses critical patterns:

```typescript
interface TacticalTemplate {
  name: string;
  detect: (state: GameState) => boolean;
  generate: (state: GameState) => TurnPlan[];
}

const TEMPLATES: TacticalTemplate[] = [
  {
    name: 'immediate_kill',
    detect: (s) => existsKillableEnemy(s),
    generate: (s) => generateAllKillPlans(s),
  },
  {
    name: 'combined_attack_kill',
    detect: (s) => existsCombinedAttackOpportunity(s),
    generate: (s) => generateCombinedAttackPlans(s),
  },
  {
    name: 'move_then_kill',
    detect: (s) => existsMoveKillOpportunity(s),
    generate: (s) => generateMoveKillPlans(s),
  },
  {
    name: 'spawn_denial',
    detect: (s) => canInfiltrateSpawnZone(s),
    generate: (s) => generateSpawnDenialPlans(s),
  },
];
```

### 3.5 Implementation Tasks

- [ ] Create `TurnPlan` type
- [ ] Implement `generateOneStepExtensions(state, plan)`
- [ ] Implement `scorePartialPlan(plan, state)`
- [ ] Implement beam search main loop
- [ ] Implement tactical templates: immediate kill
- [ ] Implement tactical templates: combined attack
- [ ] Implement tactical templates: move-then-kill
- [ ] Implement tactical templates: spawn denial
- [ ] Implement tactical templates: high-value mining
- [ ] Add plan tagging for analysis/debugging

---

## Phase 4: RIS-ISMCTS Search

**Goal:** Handle imperfect information correctly using re-determinization.

### 4.1 Core Algorithm

```
RIS_ISMCTS(rootKnowledge, iterations, planGenerator):

  root = createNode(rootKnowledge.public)

  for i in 1..iterations:
    // SELECTION: Traverse tree using UCT
    node = root
    knowledge = rootKnowledge

    while not isLeaf(node):
      action = selectAction(node, knowledge)  // UCT
      node = node.children[action]
      knowledge = applyAction(knowledge, action)

    // EXPANSION: Add new actions via progressive widening
    if shouldExpand(node):
      plans = planGenerator(knowledge)
      for plan in plans:
        if not node.hasChild(plan):
          addChild(node, plan)
          break  // Progressive widening: add one at a time

    // RE-DETERMINIZATION: Sample opponent hidden state
    determinized = redeterminize(knowledge)

    // SIMULATION: Play out with determinized state
    simState = determinized
    for turn in 1..simulationDepth:
      if isTerminal(simState):
        break
      simState = simulateTurn(simState, planGenerator)

    // EVALUATION: Score leaf position
    value = evaluate(simState, rootKnowledge.own.playerId)

    // BACKPROPAGATION
    backpropagate(path, value)

  return bestAction(root)
```

### 4.2 Re-determinization

The key insight: when simulating, sample opponent's hidden state from our belief.

```typescript
function redeterminize(knowledge: FullKnowledge): GameState {
  const particle = sampleParticle(knowledge.opponentBelief);

  return {
    ...knowledge.public,
    players: {
      [knowledge.own.playerId]: {
        resources: knowledge.own.resources,
        buildQueue: knowledge.own.buildQueue,
      },
      [opponentId]: {
        resources: particle.resources,
        buildQueue: particle.buildQueue,
      },
    },
  };
}
```

### 4.3 UCT with Progressive Widening

```typescript
function selectAction(node: MCTSNode, knowledge: FullKnowledge): TurnPlan {
  const c = 1.4;  // Exploration constant
  const alpha = 0.5;  // Progressive widening parameter

  // Progressive widening: limit number of expanded children
  const maxChildren = Math.floor(Math.pow(node.visits, alpha));
  const expandedChildren = node.children.slice(0, maxChildren);

  // UCT selection among expanded children
  let bestScore = -Infinity;
  let bestAction = null;

  for (const [action, child] of expandedChildren) {
    const exploit = child.totalValue / child.visits;
    const explore = c * Math.sqrt(Math.log(node.visits) / child.visits);
    const prior = child.priorValue * (1 / (1 + child.visits));  // Decay prior

    const score = exploit + explore + prior;
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return bestAction;
}
```

### 4.4 Implementation Tasks

- [ ] Create `MCTSNode` type with visit counts, value sums
- [ ] Implement `selectAction` with UCT
- [ ] Implement `redeterminize(knowledge)` particle sampling
- [ ] Implement `shouldExpand` progressive widening check
- [ ] Implement `backpropagate(path, value)`
- [ ] Implement `bestAction(root)` selection (most visits vs highest value)
- [ ] Add time/iteration limits
- [ ] Add async iteration with event loop yields

---

## Phase 5: Enhanced Evaluation

**Goal:** Improve position scoring with tactical awareness.

### 5.1 Additional Evaluation Factors

Add to existing 8 factors:

| Factor | Description | Weight (initial) |
|--------|-------------|------------------|
| **kill_threats_received** | Enemy units that can kill us next turn | -2.0 |
| **combined_attack_potential** | Targets killable via combined attack | +0.8 |
| **spawn_denial_pressure** | Enemies inside our spawn zones | -1.5 |
| **spawn_infiltration** | Our units inside enemy spawn zones | +1.0 |
| **queue_value** | Discounted value of units in build queue | +0.3 |
| **step_efficiency** | Can we use all 4 steps meaningfully? | +0.2 |
| **tech_tree_progress** | Have T2/T3 prerequisites for upgrades | +0.4 |

### 5.2 Tactical Sharpener (Quiescence)

When position is "hot" (units in contact), do shallow alpha-beta:

```typescript
function tacticalSharpen(state: GameState, forPlayer: PlayerId, depth: number = 2): number {
  if (depth === 0 || !isHotPosition(state)) {
    return staticEvaluate(state, forPlayer);
  }

  // Only consider tactical moves (attacks, forced responses)
  const tacticalPlans = generateTacticalPlans(state);

  if (tacticalPlans.length === 0) {
    return staticEvaluate(state, forPlayer);
  }

  let bestValue = -Infinity;
  for (const plan of tacticalPlans) {
    const newState = applyPlan(state, plan);
    const value = -tacticalSharpen(newState, opponent(forPlayer), depth - 1);
    bestValue = Math.max(bestValue, value);
  }

  return bestValue;
}

function isHotPosition(state: GameState): boolean {
  // Hot = units are adjacent or kills are available
  return existsAdjacentEnemies(state) || existsKillableUnit(state);
}
```

### 5.3 Implementation Tasks

- [ ] Add `kill_threats_received` factor
- [ ] Add `combined_attack_potential` factor
- [ ] Add `spawn_denial_pressure` factor
- [ ] Add `queue_value` factor with discounting
- [ ] Add `step_efficiency` factor
- [ ] Implement `isHotPosition` detector
- [ ] Implement `generateTacticalPlans` (attacks only)
- [ ] Implement `tacticalSharpen` recursive evaluator
- [ ] Integrate sharpener into MCTS leaf evaluation

---

## Phase 6: Integration & Tuning

### 6.1 Engine Configuration

```typescript
interface AIEngineConfig {
  // Search parameters
  mctsIterations: number;         // 1000-10000
  mctsTimeLimit: number;          // ms
  beamWidth: number;              // 30-100
  outputPlans: number;            // 20-50
  progressiveWideningAlpha: number; // 0.3-0.7

  // Belief parameters
  particleCount: number;          // 50-200
  resampleThreshold: number;      // 0.1-0.3 (effective sample size ratio)

  // Evaluation parameters
  weights: EvaluationWeights;
  tacticalDepth: number;          // 1-3

  // Difficulty
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
}

const DIFFICULTY_PRESETS: Record<string, Partial<AIEngineConfig>> = {
  easy: {
    mctsIterations: 100,
    beamWidth: 10,
    particleCount: 10,
    tacticalDepth: 0,
  },
  medium: {
    mctsIterations: 500,
    beamWidth: 30,
    particleCount: 30,
    tacticalDepth: 1,
  },
  hard: {
    mctsIterations: 2000,
    beamWidth: 50,
    particleCount: 50,
    tacticalDepth: 2,
  },
  expert: {
    mctsIterations: 5000,
    beamWidth: 100,
    particleCount: 100,
    tacticalDepth: 3,
  },
};
```

### 6.2 Implementation Tasks

- [ ] Create unified `AIEngine` class with configuration
- [ ] Implement difficulty presets
- [ ] Add logging/debugging output for plan analysis
- [ ] Create benchmark suite for measuring strength
- [ ] Implement self-play evaluation loop
- [ ] Add weight tuning via simple optimization (hill climbing)

---

## Testing Strategy

### Unit Tests
- [ ] Public/private state extraction correctness
- [ ] Belief update on each event type
- [ ] Beam search produces valid plans
- [ ] Tactical templates detect patterns correctly
- [ ] Re-determinization produces valid game states
- [ ] MCTS statistics are updated correctly

### Integration Tests
- [ ] Full turn execution through new engine
- [ ] AI doesn't use information it shouldn't have
- [ ] Performance benchmarks (time per decision)
- [ ] Memory usage under particle counts

### Regression Tests
- [ ] New engine beats old engine at same difficulty
- [ ] Known tactical puzzles are solved correctly
- [ ] No "clairvoyant" behavior in recorded games

---

## File Structure (Proposed)

```
src/ai/
├── types.ts                    # Existing AI types
├── evaluation.ts               # Existing (to be enhanced)
├── moves.ts                    # Existing (used by planner)
├── engine.ts                   # Existing (to be replaced)
│
├── state/
│   ├── types.ts                # Public/Private state types
│   ├── observation.ts          # Extract observable state
│   └── events.ts               # Event logging
│
├── belief/
│   ├── types.ts                # BeliefState, Particle types
│   ├── particle.ts             # Particle operations
│   └── update.ts               # Belief update rules
│
├── planner/
│   ├── types.ts                # TurnPlan, PlanTag types
│   ├── beam.ts                 # Beam search implementation
│   ├── scoring.ts              # Partial plan scoring
│   └── templates.ts            # Tactical templates
│
├── search/
│   ├── types.ts                # MCTSNode types
│   ├── mcts.ts                 # RIS-ISMCTS implementation
│   ├── uct.ts                  # UCT selection
│   └── redeterminize.ts        # Particle sampling
│
├── eval/
│   ├── factors.ts              # Individual evaluation factors
│   ├── weights.ts              # Weight configuration
│   └── sharpener.ts            # Tactical quiescence
│
└── engine-v2.ts                # New unified engine
```

---

## Open Questions (Requiring Design Decisions)

See companion document or discussion thread for questions requiring your input.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Beam search misses critical plans | AI blunders tactically | Tactical templates force expansion of key patterns |
| Particle count too low | AI has wrong beliefs | Adaptive resampling, conservative bound tracking |
| MCTS too slow per iteration | Can't search enough | Profile and optimize hot paths, reduce plan count |
| Hidden info makes AI feel "dumb" | Player frustration | Tune difficulty to show smart play even with uncertainty |
| Combinatorial explosion in late game | Slow decisions | Progressive widening, time limits, early termination |

---

## Success Criteria

1. **Correct play**: AI never uses hidden information it shouldn't have
2. **Tactical sharpness**: AI finds forced kills within 2 moves
3. **Strategic depth**: AI considers economy, spawn denial, tech tree
4. **Performance**: Decision in <5 seconds at hard difficulty
5. **Tunable**: Difficulty levels feel meaningfully different
6. **Testable**: Clear metrics for strength comparison
