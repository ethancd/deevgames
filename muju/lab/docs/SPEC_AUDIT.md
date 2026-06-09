# Muju Hono Tanka — Spec/Engine Audit (Phase 1, IN PROGRESS)

Status: divergence hunt complete for `src/game` + `src/ai` core paths; property
tests + adversarial fixtures committed (`tests/game/properties.test.ts`,
`tests/game/audit-fixtures.test.ts`, 42 tests, green). Remaining P1 work:
SPEC.md rewrite to current rules, clause→code traceability table,
v1.0→v1.1→code delta table.

## Divergence list (found by code reading, 2026-06-09)

Severity: **C** = correctness/cheating bug, **I** = information-leak bug,
**P** = planning-quality bug, **D** = documented ruling (keep, fixture it).

| ID | Sev | Where | Finding | Disposition |
|----|-----|-------|---------|-------------|
| D1 | **C** | `src/ai/moves.ts:generateQueueActions`, `src/ai/simulate.ts:applyQueueUnit` | Neither checks `meetsTechRequirement`. The human path enforces tech via `canBuildUnit` (`useGameState.ts:348`) and re-checks at placement (`:230`). But the AI's **real** moves are applied via `APPLY_AI_ACTION → ai/simulate.applyAction` (`useGameState.ts:406-409`), which skips both checks — **the AI can actually queue and place tech-illegal units in real games** (e.g. metal_3 with no metal_2 on board). | Fix in P4a: filter generator through `canBuildUnit`; add tech check to `applyQueueUnit`. Regression test. |
| D2 | **C** | `src/ai/simulate.ts:applyPlaceUnit` | No `isValidSpawnPosition` check (human path checks at `useGameState.ts:235`). Generated placements are valid *at generation time* (`generatePlaceActions` uses `getAllSpawnPositions`), but multi-action plans can invalidate earlier assumptions; and APPLY_AI_ACTION makes this the real path. | Fix in P4a: validate in `applyPlaceUnit`, return state unchanged if invalid. |
| D3 | **I** | `useGameState.ts:365` vs `ai/simulate.ts:applyPlaceUnit` | `resourcesSpent` updates at **queue time** for humans but at **place time** for the AI path. `types.ts:117` documents the intent: "spent updates on place not queued" (hidden-queue ruling, AI_ENGINE_QUESTIONS Q1/Q2). The human path therefore **leaks hidden queue spending immediately** into `resourcesSpent`, which the AI belief model consumes (`engine-v2.ts:124-125`) — the AI gets information the design says is hidden. | Fix in P4a: move human-path `resourcesSpent` update to PLACE_UNIT; keep promotion at promote time (promotions are public). Note PROMOTE in simulate updates spent at promote — consistent, public action. |
| D4 | **P** | `src/ai/simulate.ts:applyEndActionPhase` | Does not mirror `turn.ts:startQueuePhase` auto-end (`canActInQueuePhase` → `endTurn`). AI planning sees a queue phase that the real engine may skip. Low impact (AI re-plans per action) but causes planner/engine drift at zero resources. | Fix in P4a: route through `startQueuePhase`. |
| D5 | **P** | `src/hooks/useAI.ts:75` | `maxIterations = 20` caps actions per AI turn. A full turn can legitimately exceed 20 dispatches (placements + promotions + 6 actions + queue entries). | Raise/loop-fix in P4a. |
| D6 | **P** | `src/game/building.ts:getAvailableBuildOptions` | Ignores tech requirements (affordability only). Currently only used by AI-adjacent code/UI helpers; UI itself uses `meetsTechRequirement` directly. | Fix alongside D1 (use `canBuildUnit`). |
| D7 | **D** | `src/game/victory.ts` | Loss = zero units on board, even with a non-empty build queue (no anchor → can never spawn). Deviates from SPEC.md v1.0 ("with nothing in build queue") deliberately; ruling documented in file header. | Keep. Fixtured in `audit-fixtures.test.ts`. |
| D8 | **D** | `src/game/board.ts:resetUnitActions` | Damage fully heals at the start of the **owner's** turn — kills must complete within one enemy turn; no cross-turn chip damage. This is the board-game-ability ruling (state = position + at most a transient within-turn damage marker). | Keep (per Ethan ruling #3). Balance implications measured in P3 (one-turn-kill walls hypothesis). |
| D9 | **D** | `src/game/combat.ts:getValidAttacks` | A unit may attack the same enemy only once per turn (`attackedThisTurn`), but may attack different enemies multiple times, and may move/attack/mine repeatedly within the 6-action budget. SPEC.md v1.0's "one action type per piece per turn" is gone (v1.1 §1.1). | Keep. Fixtured. |
| D10 | **D** | `src/game/movement.ts:getMoveCost` + `useGameState.ts` MOVE | Human path allows multi-action moves (cost = ceil(squares/speed)); AI generator only emits single-action moves (`getValidMoves`, speed-bounded). Not a rules divergence (same budget), but an AI capability gap: the AI never plans multi-action repositioning in one dispatch (it can chain MOVEs across re-plans). | Note for P4a eval; no engine change. |

## Stale-spec inventory (drives the SPEC.md rewrite)

SPEC.md (v1.0) clauses contradicted by the implemented game (v1.1+):

1. 4 action steps → **6** (`MAX_ACTIONS_PER_TURN`, `board.ts:15`); "one of each action type per piece" → unlimited repeats, except same-target attack once/turn (D9).
2. Elemental bonus "+1 Attack and +1 Defense" → **±1 Attack only**, defense never modified (`elements.ts:getAttackModifier`).
3. Two independent triangles → **Double-Thick Triangle**: Fire&Lightning → Plant&Metal → Water&Shadow → Fire&Lightning; same-pair neutral.
4. "Wind" element → **Shadow** (Turkish names; Göl/Gölge/Karanlık/Karabasan).
5. Summoning sickness ("promoted/placed pieces cannot act") → **removed**; placed units act immediately; promoted units act immediately; but a unit **cannot be promoted on the turn it was placed**, and only once per placement phase.
6. `PlayerId 'player'/'ai'` → **'white'/'black'**; either seat may be human or AI.
7. Unit stats table → v1.1 stats (`units.ts` is canonical; e.g. Hi SPD 2, Radi MINE 0/SPD 3, plant_1 ATK 0/MINE 3, fire_3 SPD 3, fire_4 SPD 4, metal_2 MINE 3).
8. Combat: damage model exists (non-lethal attacks accumulate `damageTaken` within the defender's exposure window; full heal at owner's turn start, D8). v1.0 had binary kill-or-nothing.
9. Victory: elimination requires only zero units on board (D7); draw nominally possible; resignation exists.
10. Hidden information: opponent stockpile and queue hidden (Q1–Q3 rulings in AI_ENGINE_QUESTIONS.md); `resourcesGained` public, `resourcesSpent` public-at-place (see D3 bug).
11. Tech gating (absent from v1.0 spec, implemented): T2+ requires same-element unit of tier ≥ N−1 on board (`building.ts:meetsTechRequirement`); checked at queue AND at place (human path).
12. Promotion cost = cost difference (v1.1 §1.3), once per placement phase, not on placement turn, T4 terminal.
13. Phase auto-transitions (v1.1 §1.5): place phase skipped when nothing to do; queue phase auto-ends when no affordable action.
14. Build queue persistence (v1.1 §1.4): ready units stay queued indefinitely if unplaceable.

## Property-test coverage (committed)

`tests/game/properties.test.ts` — seeded random playouts through the real AI
action path asserting: occupancy/bounds, layers+depth ≡ 5, mining monotonicity
via conservation (mined + remaining ≡ 500), resources ≥ 0 and ≤ gained,
action budget ∈ [0,6], queue sanity, determinism per seed, victory consistency.

`tests/game/audit-fixtures.test.ts` — mixed-element combined attacks, ATK
floor at 0, same-target-once rule, within-turn damage accumulation (v1.1 §6.1
regression), spawn-rectangle edges (corner anchor, blocking, multi-anchor,
black corner), well-metaphor dry cells, lightning can't-mine, promotion
timing/cost, victory ruling, catalog monotonicity.

## Next (remaining P1)

1. Rewrite `muju/SPEC.md` to current rules (inventory above is the worklist).
2. Clause→code/test traceability table appended here.
3. Checkpoint-1 commit.
