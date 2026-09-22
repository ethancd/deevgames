# MHT analysis tools

The MCP analysis layer removes economic arithmetic and tactical enumeration while
keeping all commits in the existing authoritative play path. No game balance,
unit definitions, time controls, or victory rules change.

Restricted experiment rooms may carry an immutable `matchPolicy`. Hosted
analysis, automatic headlines and explicit briefings are available only for the
`centaur` tier; other tiers receive an empty, labeled analysis envelope, and
explicit analysis/briefing requests return `MATCH_TOOL_RESTRICTED` even without
a seat token. This check precedes cache access on HTTP MCP and stdio. Existing
ordinary rooms retain all layers below. See the
[match protocol](ENGINE-SEAT-MATCH-2026-09-19.md).

## Interface and layers

| Layer | Entry point | Content |
| --- | --- | --- |
| 0 | `analysis` in observe/create/join/play/changed wait | Both economies and depletion trends, deployment counts/blocking, `killClock` (`plies`, `limit`, `warningAt`, `minedTotals`, `leader`; the limit is ten plies and comes from the engine constant, never a copy — the deprecated `draw` pair `[quietPlayerTurns, limit]` reads the same counter for one release), a bounded set of urgent existing-unit witnesses |
| 1 | Observe/wait with `briefing:true`, `player`, optional `sinceRevision` | Per-miner ledger, board matchups, spawn zones, threats including affordable spending, captures and mobility warnings |
| 2 | `muju_analyze` with batched topics/targets | Focused accounting, geometry, approaches, conditional defenders, exchange costs, and executable evidence |
| 3 | `deep:true`, `reply`, or `checkmate` | Bounded combined-turn search or the authoritative home-defense prover |

Read the [public player skill](../public/skills/muju-hono-irumbu/SKILL.md) for the
workflow, compact notation and concrete parameter semantics. Analysis is available
over both Streamable HTTP and the stdio bridge; all inventory is public, so no
seat token is needed. `expectedRevision` is mandatory on focused requests.

Typical client flow (variables come from the latest observation):

```js
muju_observe({ roomId, player, briefing: true });
muju_analyze({
  roomId, expectedRevision: revision, player,
  topics: ["threats", "exchange"], targets: { unitIds: [valuableUnitId] },
  hypotheticalActions: proposedFullTurn, deep: true, limit: 2
});
// Commit a chosen legal sequence with muju_play, using the returned live revision.
muju_wait_for_change({
  roomId, afterRevision: committedRevision, timeoutMs: 25000,
  player, briefing: true, sinceRevision: lastBriefingRevision
});
```

The common envelope contains revision, perspective, modeled turn/phase,
`stateKind`, hypothetical sequence/assumptions, work metadata and follow-ups.
Responses contain no duplicate board or catalogue. Explicit `stateKind` switches
and per-target reply models identify when an outgoing harvest, incoming upkeep,
healing and action reset occurred. `hypotheticalActions` use engine validation and
the same immediate-mate tail cancellation as room preview. Invalid sequences
never partially apply to a room. Room-only undo/preferences are rejected explicitly.

## Exact facts and bounded conclusions

| Area | Guarantee | Limit |
| --- | --- | --- |
| Economy | Engine harvest/upkeep/turn checkpoints; partial deposits; forecast stops at insolvency or a terminal result | Stay in place, retain army, no spending/captures/releases; no promise beyond the stop/horizon |
| Relocation | Engine paths, AP, reserve-capped independent harvest gain | No joint allocation or tactical safety check; projection explicitly excludes future termination |
| Matchups | Engine elemental power and instance remaining defense | Ignores reach and turn eligibility; those are separate queries |
| Deployment | Actual anchor rectangles, blockers and home restrictions | Minimum geometric covering set uses bounded exact set cover; no movement feasibility claim |
| Mobility | Engine action-cost reach, occupied-board free components, articulation squares | Removing a blocker is an independent geometric what-if |
| Single threats | Every returned move/attack/purchase/promotion sequence is applied by the engine | Bounded enumeration; single spending variants do not cover all combinations or upkeep choices |
| Combined turns | Real transitions enforce shared AP, cash, occupancy, promotion eligibility, attack flags and victory | Exhaustion is unknown; upkeep sets above 12 paid units inherit the engine generator's fallback; sequences over 32 actions omitted |
| Replies | Batched one-turn target/capture-value/home/deployment objective; exposure for each participating attacker | Best-found unless completed; no minimax; the attacking side ends on its final attack squares without withdrawing |
| Survival | Catalogue cases run through the same threat engine; optimistic damage bounds give sufficient defense | Structural insertion is conditional; minima are exact only when bounds coincide; arbitrary custom stats are unsupported |
| Checkmate | Same home prover as adjudication; actual rescue path and category | Full next defense starts before upkeep; source terminal/earlier-home priority is respected; gated by the kill clock — `not_applicable` when the defender's reply would be the ninth or tenth kill-free ply |

A witness establishes `proven_possible`. An exhausted search returns `unknown`,
even when no kill was found. `proven_impossible` is confined to the explicitly
searched model and spending permissions. The fast scan never turns absence into
safety. A conservative damage bound ignores blockers/shared spending but charges
minimum approach/hit costs and the two-square corner constraint; it can prune
impossible lethal searches but never supplies a kill witness or a claimed maximum
nonlethal line. Best-found action/crystal costs are not called minima.

The economy's `shortfallIn` counts completed own harvests before failure, not
round numbers. Null means the simulation stopped without reaching that player's
failure. Both ledgers stop at the first shortfall, including the other player's;
the kill clock can also end a stay-in-place projection. A stay-in-place
projection is by definition quiet, so it now reaches `terminal:kill-clock` after
ten plies rather than twenty (rules revision `muju-phasing-3`, 2026-09-22): a
forecast that used to run further now stops sooner, at the same higher mined total
verdict the live engine reaches. Historical harvest is labeled separately and
reports only the engine's recorded last harvest.

The generic next-turn model keeps automatic upkeep payments. It does not secretly
refund them to fund purchases/promotions. Pending upkeep choices are enumerated
by deep search; outgoing pending upkeep uses the engine's default selection unless
the supplied sequence chooses otherwise. The home prover separately enumerates
all keep/release and promotion sets, even voluntary releases. Its witness includes
`PAY_UPKEEP` from a pre-payment review state: undo an automatic payment **alone**
before using it, or enable review before handoff. Do not replay that payment on
an already-paid state.

## Work, caching and output

Focused defaults are 2,000 search nodes and 150 ms, capped at 20,000/750 ms. Time
limits are cooperative: an in-progress authoritative transition finishes, and
serialization/transport add overhead. Headlines use 160/15 ms; briefings use
900/65 ms with reserved work for opportunities. Target and reply quotas prevent
one search from consuming all useful work. Every cutoff remains visible.

The LRU key includes room ID, revision, full state hash (including hypothetical
state), and the complete normalized parameter set. It contains no live clock or
credentials. Cached work metadata describes the original computation. Both result
and baseline caches are bounded to about 4 MB of serialized content each; callers
receive copies. Different preview states at the same revision cannot collide.

Diffs return changed **sections**, including complete replacement arrays. They do
not claim an absent witness is now impossible. Compatible prior results must be
in this process's bounded cache. Restart/eviction/different parameters produce a
labeled full response rather than an invented historical comparison. This is
deliberately a section diff, not an exact minimal JSON patch.

Output has byte targets and explicit omitted sections. If necessary, an entire
optional section is deferred with follow-up arguments; witnesses and matrices are
never sliced into invalid fragments. Large explicit hypothetical sequences can
exceed the target just by their envelope, in which case `overBudget` says so.
Square sets, deterministic shortest paths and identical resulting states remove
route/order duplication; alternatives with different actors, final squares, AP,
crystal spend or tactical state remain separate.

## Validation and reproducibility

`tests/fixtures/codex-claude-2026-09-12.json` archives the supplied public match's
34 commands, 200 detailed events, recorded root and final position. Detailed
recording begins at revision 5, White turn 3, with `complete:false`; earlier command
history is retained for provenance but is not invented as detailed recording.
`matchPositions()` replays all subsequent commands through `applyAction` and the
replay module and checks equality with the saved authoritative final state.
Benchmarks use requested revisions 13, 19, 23, 29, 31, 32 and 33 (crowded positions
with 21–35 pieces).

```sh
npm run server:types
npm test
npm run build
npm run analysis:bench
```

The [measurements](analysis-benchmark/measurements.json) record cold service
latency, UTF-8 bytes, work/cutoffs, and bytes/4 token estimates. This estimate is
not an actual tokenizer count; it measures the analysis payload before MCP
framing and its text/structured-content compatibility representations. Example responses for the four layers are saved
alongside it. The [tests](../tests/server/analysis.test.ts) cover depletion,
upkeep timing and stopping, promotion/purchase threats, shared budgets, blocker
clearing, attack chains, recaptures, geometry, hypothetical validation, cache
identity, proofs and archive replay. Real HTTP and stdio clients also feed a
returned witness unchanged through authenticated room preview and check that
analysis/preview leave the room unchanged.

## Deliberately unresolved wishlist items

The implementation prioritizes focused, auditable answers. It does not solve
multi-turn strategy, jointly optimize miner relocations, prove withdrawal safety
without a separate reply query, or enumerate a minimum tactical blocking formation
around an occupied home. Generic searched replies do not explore voluntary undo
of automatic upkeep. Post-attack replies share the query budget, so named focused
requests can resolve participants left unknown by a large combined exchange.
Large inverse-survival searches can leave catalogue cases unknown; they do not
manufacture a universal minimum defense. These limits are exposed in the API and
skill rather than concealed behind a safety score.


## Turn timing in analysis

`muju_rules()` returns the timing prose; there is one rule set and no argument to
select. Observations, legal actions and clocks expose `ruleset`, `turn`,
`upkeepPending` and `endTurnAction`. The full-turn handoff is always
`END_PLACE_PHASE`.

Analysis uses engine handoff: outgoing Act ends, mining occurs once, outgoing upkeep
is settled, then preparation ends without further spending. Existing incoming
commitments resolve or fully refund before healing and four AP. All arrival checks
use the same board, and pending commitments are never combatants or anchors.

Tactical searches cover the modeled action phase. Incoming arrivals may attack;
new commitments and end-of-turn promotions cannot attack that turn. Prepare has no
remaining attack or movement opportunity; it does not become another Act when ended.
Reply analysis does not choose discretionary future preparation or search multiple
turns. Include your intended preparation in `hypotheticalActions` to inspect its
actual consequences. Home checkmate before outgoing upkeep is resolved reports
`unknown`; preview mining/upkeep first. Rescue witnesses begin in defender
Act after healing, with no pre-action payment or promotion.

Economy forecasts record harvest and upkeep as separate balances, include existing
summon arrivals/refunds, and stop at the first unaffordable keep-all payment or game
result. Current summon support is conditional, not a promise about the arrival board.

The built-in browser AI plays these same rules: easy and medium run `AIEngineV2`,
hard runs the newer `src/ai/hard` search engine, and `?hardAi=0` on the game URL
opts a seat back to the previous hard engine. No strength claim is made for either
engine here; see `docs/hard-ai/RELEASE-2026-09-21-phasing.md`.

## See also

- `docs/MCP_TOOL_TAPS.md`: trigger-action checklist for agent players on when to call each MCP tool, distilled from the 2026-09-12 live games.
