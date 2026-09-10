# Specification audit — current v2.2 (2026-09-10)

The canonical rules are [SPEC](../../SPEC.md). All current human, worker and
lab actions share `game/legality.ts` and `ai/simulate.ts`; illegal inputs are
unchanged-state rejections. Historical audit findings are available at commit
`16ccfd7`, not current defects. D1/D3/D7 rows are retired: there is no queued
tech check, private/manifested split or queue caveat in elimination. D4/D6/D11/
D12 queue machinery is likewise gone. D2 spawn legality and D14 real-state
validation remain enforced; D13 uses deterministic state-derived unique IDs.
D8 owner-turn healing and D9 Cleave remain rules. D10 is still a bounded
planning choice: exact movement is legal even when a planner emits short steps.

| Spec clause | Current implementation | Verification |
|---|---|---|
| §1 10×10, original positions/rotation, 0/4/8/10 and 520 | `board.ts`, `resourceMap.ts` | board/resource-map tests; conservation properties |
| §2 Place → Act, six actions | `turn.ts`, `legality.ts`, `simulate.ts` | turn/building/worker tests; mobile browser |
| §2 income → clock/draw → home/elimination → upkeep → heal/reset → Place | `turn.ts`, `inactivity.ts`, `upkeep.ts` | turn/upkeep-clock/home-victory tests |
| §3 orthogonal path and ceil(distance/speed) cost | `movement.ts` | movement/combat properties and move previews |
| §4 ±1 ATK, chip DEF, own-start healing | `elements.ts`, `combat.ts`, `board.ts` | combat/element/audit fixtures |
| §4.2 kill-gated tier-capped Cleave, paid moves between hits | `combat.ts`, `assembly/tactics.ts` | JS/WASM differential, Cleave browser fixtures |
| §5.1 unconditional min(Mining,reserve), including Mining 0 and every flag | `mining.ts:unitEndOfTurnTake,endOfTurnIncome` | mining matrix, immutable/conservation tests |
| §5.1 final position only, public income, no Mine action | `mining.ts`, `legality.ts`, `ai/moves.ts` | mining/turn/AI generation; projection/recap browser |
| §5.2 any number of affordable T1 purchases, no actions | `building.ts`, `legality.ts`, `simulate.ts` | all-18 catalogue legality, mass purchases/IDs |
| §5.3 empty unblocked corner-to-anchor rectangle | `spawning.ts`, `legality.ts` | spawn edges/infiltration, E5 opening fixture |
| §5.3 placed units act immediately | `building.ts`, `combat.ts` | summon-and-strike and mobile purchase tests |
| §5.4 next tier, cost difference, once per turn, existed at Place start | `promotion.ts`, `board.ts` flags | promotion/building/property tests; same-turn refusal/next-turn browser |
| §5.5 T1 retained/free, T2 1/T3 2, affordable keep-set, promo rent next turn | `upkeep.ts`, `turn.ts` | upkeep/turn tests; upkeep browser |
| §6/§7 original graph, 18-unit v1.9 stats and doubled catalogue costs | `elements.ts`, `units.ts` | catalogue pinned-source comparison; static witnesses |
| §8 public bank/gained, perfect-information worker/MCTS | `types.ts`, `worker/protocol.ts`, `search/mcts.ts` | worker real-state tests; public-bank browser |
| §9 zero-board elimination regardless of bank; delayed home win; resignation | `victory.ts`, `turn.ts`, `simulate.ts` | victory/home/resign fixtures and tactical rescue |
| §9 ten quiet completed turns, income/kill resets, draw before next home | `inactivity.ts`, `turn.ts` | clock-order tests; draw browser |
| Save 5 round-trip, old unfinished save rejection, no undo across income | `persistence.ts`, `useGameState.ts` | resource-map persistence, hook undo, mobile reload |
| Telemetry and same rules in the lab | `lab/harness/runner.ts`, `invariants.ts` | harness, seeded playout invariants |

The former well mining and hidden-state test suites are replaced or removed;
old test counts do not imply coverage of deleted mechanics. Current counts and
limits are in the two simplification reports. The static task grid establishes
distinctness/witnesses only; it is not a proof of balance or of opening fairness.
