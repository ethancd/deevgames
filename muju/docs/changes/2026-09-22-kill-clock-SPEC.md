# Kill clock — rules revision `muju-phasing-2` -> `muju-phasing-3` (spec, 2026-09-22)

Owner: Ethan. Decisions below are final; implementers do not reopen them.

## 1. The rule (normative text for SPEC §9)

**Kill clock (replaces the inactivity draw).** A *kill* is any attack that removes a unit.
Releases, refunds, promotions, mining, chip damage and disrupted or failed summons are not kills.
The clock counts player turns (plies) in which no kill occurs. It starts at White's first turn at
zero. When a turn contains a kill, the clock is reset so that turn closes at zero (the killer's
own turn is not counted). Each completed turn without a kill adds one, at `END_PLACE_PHASE`,
after income and preparation, exactly where the old draw clock advanced. When the tenth
consecutive kill-free ply closes, the game ends immediately; the next turn never begins, so no
turn-start home-occupation check, upkeep or healing can override it. Because the killer's turn is
ply zero, the tenth ply is always the last killer's turn: the most recent killer takes the final
move before the count is judged.

**Verdict.** Each player has a *mined total*: the sum of every crystal their units have taken from
the board over the whole game, never reduced by spending, upkeep, release or refund. **Black's
starting handicap crystals count toward Black's mined total** (owner decision 2026-09-22). When the
clock ends the game the higher mined total wins; equal totals are a draw. Victory reason
`kill-clock` with `winner` set, or `winner: null` on a tie.

**Home-checkmate and the clock.** `#` is a prediction that the invader will still stand on the
enemy home at the start of its owner's next turn. It may be awarded only if that turn start is
guaranteed. Let `c` be the count the hand-off is about to produce at the end of the invading
turn: `0` if the invading turn contained a kill, otherwise `inactivityPlies + 1`. If `c ≤ 8`,
award `#` as today. If `c ≥ 9`, do not award `#`; the game plays on (at `c = 9` the defender's
reply is the tenth ply and the clock decides unless the defender kills; `c = 10` ends the game
at this very hand-off on mined totals and must never be pre-empted by a mate award). The
"c = 9 and invader ahead on mining" refinement is deliberately NOT a checkmate.

Unchanged: elimination, upkeep-elimination, resignation, timeout, abandonment, and home
occupation at a turn start that actually occurs. Cleave, chip persistence and the definition of
a kill are unchanged. The lab-only `inactivityRule: 'off'` control keeps disabling the clock.

## 2. Canonical implementation

**Seed already committed by the coordinator (read it first):** `src/game/inactivity.ts` now IS the
kill clock — `INACTIVITY_LIMIT = 10`, `INACTIVITY_WARNING = 7`, `LEGACY_INACTIVITY_LIMIT = 20`
(phasing-2, draw), `minedTotal(state, player)`, `killClockCountAfterTurn(state)`,
`killClockForbidsCheckmate(state)`, and `resolveInactivityDraw(state, limit?, verdict?)` with
`verdict: 'mined-total' | 'draw'` (alias `resolveKillClock`). `VictoryReason` gained `'kill-clock'`.
`resolveHomeCheckmate` already applies the c ≥ 9 gate. **The file and identifier names were kept on
purpose** (sixty-plus pinned importers); do not rename them. Persistence is already at schema 9, so
the kill-clock save schema is **10**.

- (done in the seed; see above.)
- New helper `minedTotal(state, player)` =
  `players[player].resourcesGained + (player === 'black' ? state.blackCrystalHandicap ?? 0 : 0)`.
  Use it everywhere (resolver, UI, observation, hard-engine pack). Do not change what
  `resourcesGained` records; do not change setup or lab telemetry.
- `resolveKillClock(state)`: when `inactivityPlies >= limit`, phase `victory`, reason
  `kill-clock`, winner = higher `minedTotal`, null on tie.
- `resolveHomeCheckmate`: compute `c` as above from `progressThisTurn` and `inactivityPlies`
  and return the state unchanged when `c >= 9`. Add the same gate to every mirror
  (`src/ai/hard/tactics/prover.ts`, hard `gen/turn.ts` terminal, server analysis home proof).
- `VictoryReason` gains `'kill-clock'`; `'inactivity'` stays in the union for archived results.
- Persistence: schema v10 (9 is the phasing-only cutover), rules revision `muju-phasing-3`. **Unfinished v8 saves and live rooms
  restart the clock at 0** (owner decision), stamp the new revision, keep the board; finished
  results are never revived. Archived phasing-2 replays pin limit 20 and the draw verdict.
- `positionReport.ts`, `compactReport.ts`, `useAI.ts` state passthroughs: rename fields only
  where the name is user-visible; internal `inactivityPlies` may keep its name.

**`lab/hard-ai/suites/phasing/canonical.ts` `currentRulesVersion`** maps a limit to a revision; a
limit of 10 now means `muju-phasing-3` (mined-total verdict) while phasing-1 was also 10 plies with a
draw. Key the mapping on limit AND verdict (10/mined-total → phasing-3, 20/draw → phasing-2,
10/draw → phasing-1) and never guess.

## 3. Hard engine (`src/ai/hard`) — rules-correct only; tuning deferred

- `MAX_CLOCK = 10`; Zobrist clock plane 0..10 (11 values); `PHASING_RULES_REVISION = 'muju-phasing-3'`.
- Pack `gained[]` from `minedTotal`, not raw `resourcesGained`.
- Terminal: the clock no longer yields `Result.DRAW`; it yields WIN/LOSS by `gained`, DRAW on tie.
  `evaluate.ts` decided-position scoring applies; root/pvs draw checks follow.
- `DrawPressure` feature: keep the feature, but sign it by the mining lead of the side to move
  (positive when ahead, negative when behind); the invariant bit 16 comment flips ("sitting on a
  mining lead while the clock runs is correct"). Weights: **leave `DEFAULT_WEIGHTS` untouched**;
  record in the change record that tuning and strength measurement are a separate campaign.
- Prover: c ≥ 9 gate (§1).
- Re-pin what the rule forces (perft, fuzz, recall, goldens, invariant tests) with the reason in
  each pin. Do NOT regenerate the opening corpus or run the ladder; mark `ai-strength` as
  **deferred: tuning + measurement campaign** with the phasing-2 evidence declared historical.

## 4. Surfaces

- UI: progress clock shows `x/10` and turns amber at 7; **a subtle marker on the player whose
  mined total is higher** (owner: "some subtle marker for which player is ahead on cumulative
  crystals" — e.g. a small dot/caret beside the crystal count, not a banner; tie shows nothing);
  victory screen text for kill-clock win and tie; instructions and mode-select blurbs.
- Server/MCP: observation adds `killClock: { plies, limit, minedTotals: {white, black} }`
  (keep `quietTurns`/`drawAtQuietTurns` for one release with a deprecation note, or rename with
  the schema version bumped — implementer records the choice); statements test; victory sentence
  in rules text; analysis core draw handling; room result events; agent schema enums; both public
  skills; `docs/MCP_TOOL_TAPS.md`; `ONLINE.md`.
- Docs: SPEC §9 + version entry; JUDGMENT_LOG entry (supersedes J-021 threshold and the draw
  verdict; records the handicap-counts decision and the c ≥ 9 rule); dossier; portfolio.
- Academy: export-rules draw assertion → kill-clock assertion; R09 (draw lesson) and R10 added
  to the course notice; no re-voice.
- Balance static model: verified unchanged (no clock).
- WASM tactics kernel: verified unchanged (no clock).

## 5. Validation gates

`npm run server:types && npm test && npm run build`; `npm run test:online:e2e`; the upkeep-draw
and analysis e2e specs adapted; hard `npm run hard:verify` gates that are rule-pins pass; DAG
`check`; new unit tests: (a) kill on ply 9 resets and game continues, (b) tenth quiet ply ends
on mined totals incl. Black handicap, (c) tie → draw, (d) invader at c = 8 gets `#`, at c = 9
does not, (e) c = 10 hand-off ends on totals before any mate award, (f) occupation at the tenth
ply does not win by occupation, (g) v8 save restarts at 0 and stamps `muju-phasing-3`.
