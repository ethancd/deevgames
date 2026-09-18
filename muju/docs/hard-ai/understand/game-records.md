# Game records and analysis primitives

Scope: what real Muju Hono Tanka game data exists in this worktree, how a stored
game turns back into a `GameState` sequence, everything that happened in the one
complete agent-vs-agent game that is archived, and an inventory of the existing
analysis code.

Every claim below is tagged:

- **[V]** verified by reading code or by running a script in this worktree.
- **[D]** claimed in a project doc (I quote it and say where it agrees or
  disagrees with the replay).
- **[I]** my inference.

Scripts I added (new files, nothing existing was modified):

- `/Users/ashkie/src/deevgames-muju-hardai/muju/docs/hard-ai/understand/replay-codex-claude.ts`
  — full replay + per-command ledger. Run: `node --import tsx docs/hard-ai/understand/replay-codex-claude.ts`
- `/Users/ashkie/src/deevgames-muju-hardai/muju/docs/hard-ai/understand/replay-boards.ts`
  — reserve/unit maps at chosen revisions. Run: `node --import tsx docs/hard-ai/understand/replay-boards.ts 5 13 20 26 34`

---

## 0. Headline: where the records actually are

**[V] `muju/data/rooms.sqlite` contains zero games.** Opened read-only and also
copied to a scratch dir and WAL-checkpointed:

```
sqlite> .schema
CREATE TABLE rooms (id TEXT PRIMARY KEY, data TEXT NOT NULL);
sqlite> select count(*) from rooms;   -- 0
sqlite> PRAGMA table_info(rooms);     -- only id, data
sqlite> select name,type from sqlite_master;  -- rooms, sqlite_autoindex_rooms_1
```

The file is 4096 bytes with a 12 KB WAL that contains only the schema page. It
has **none** of the tables `RoomStore` creates today (`room_moves`,
`room_history_roots`, `room_stage_receipts`, `room_stage_requests`) and none of
the `deadline_at` / `stage_at` columns added at
`/Users/ashkie/src/deevgames-muju-hardai/muju/server/rooms.ts:54-77`. **[I]** It
is a stub created by an older local `npm run serve` that was never played in.

**[V] The real games were played on the public deploy**, not locally:
`server/index.ts:11` defaults the DB to `data/rooms.sqlite` but the archived
match's `source` field is
`https://deevgames-muju.onrender.com/muju/?room=0a56f850c8050113da84aefac5007810`
(`tests/fixtures/codex-claude-2026-09-12.json`). That server's SQLite is not in
this repo.

**[V] Exactly one complete real game exists as move data in this worktree:**
`/Users/ashkie/src/deevgames-muju-hardai/muju/tests/fixtures/codex-claude-2026-09-12.json`
(429,478 bytes, 34 commands, 200 detailed events, recorded root and final
position). It is Claude (White) beating Codex (Black) by resignation on turn 17.

**[V] Three more real agent-vs-agent games are *described* but have no move
data anywhere in the tree** — only prose in
`docs/hard-ai/understand/napkin-snapshot.md:9,11,13` and `docs/MCP_TOOL_TAPS.md`.
See §3.

**[V] Everything under `muju/lab/` is bot/enumeration work, not agent games.**
`lab/results/*` are policy-vs-policy sims and exhaustive censuses;
`lab/experiments/opening-census-2026-09-14/census.ts` is a breadth-first
enumeration of all turn-1..4 move triples (no opponent), and
`lab/experiments/handicap-census-2026-09-14/` is a scored state census
(`states-h4.bin` is 153 MB). None of these are games between agents.

**[V] Provenance/dating.** `git show --stat 44c41c4` (HEAD, "Snapshot
uncommitted muju working tree (v2.8) as base for Hard AI work", 2026-09-14)
adds *all* of: `server/analysis/*`, `server/notation.ts`,
`server/clockPressure.ts`, `tools/benchmark-analysis.ts`,
`tests/fixtures/codex-claude-2026-09-12.json`, `docs/ANALYSIS_TOOLS.md`,
`docs/MCP_TOOL_TAPS.md`, `docs/STRATEGY_GUIDE-2026-09-12.md`,
`docs/strategy-guide-codex-vs-claude.md`, `docs/analysis-benchmark/*`. The prior
commit `1ac8026` (2026-09-12) has no `muju/server/analysis` at all. So the whole
analysis layer plus the archive is ~48 hours old and uncommitted before this
snapshot.

---

## 1. Schema of stored games, and how to replay one

### 1.1 The four tables a live `RoomStore` uses

All in `/Users/ashkie/src/deevgames-muju-hardai/muju/server/rooms.ts:53-67`:

| Table | Columns | Purpose |
| --- | --- | --- |
| `rooms` | `id TEXT PK, data TEXT, deadline_at REAL, stage_at REAL` | One JSON blob per room: the whole `StoredRoom` (`rooms.ts:31-44`) including the live `GameState`, seats, `undoHistory: GameState[]`, `replayRecording`, `clockBase`, `clockHistory`, `moveHistoryStart`, `rulesVersion`, `inviteHash`, `tokenHashes`, `receipts`. Indexed on `deadline_at`/`stage_at` for the 250 ms sweep (`rooms.ts:79`). |
| `room_moves` | `room_id, sequence INTEGER, revision, player, turn_number, data TEXT, undone_revision, before_state BLOB, after_state BLOB`, PK `(room_id, sequence)` | The persistent score. `data` is a JSON `MoveHistoryEntry`. `after_state` is the deflated full `GameState` after that event; `before_state` is stored **only for `kind:'move'`** (`rooms.ts:608`), because intermediate AP frames need it. |
| `room_history_roots` | `room_id TEXT PK, state BLOB` | `INSERT OR IGNORE` of the deflated position *before* the first recorded command (`rooms.ts:604`). This is the "sequence 0" position. |
| `room_stage_receipts`, `room_stage_requests` | `(room_id, player, stage_id/request_id, …)` | Seat-private staged-play bookkeeping; never public history. |

**[V] State packing:** `packState = deflateSync(JSON.stringify(state))`,
`unpackState = JSON.parse(inflateSync(...))` (`rooms.ts:25-26`). So every
`room_moves` row already carries a complete replayable `GameState` — you do not
have to re-simulate to read a position, and `RoomStore.position(id, sequence,
step)` (`rooms.ts:252-269`) returns exactly that, with `movementStep(...)`
interpolating a multi-AP move.

**[V] Rules gate:** `RULES_VERSION = 'muju-online-4'` (`rooms.ts:22`). `read()`
throws `409 RULES_CHANGED` for anything that is neither v4 nor a migratable
`muju-online-2|3` (`rooms.ts:160-174`). A room whose `actionsPerTurn` is not 4
is also rejected (`rules.ts:11-13` only accepts `4`).

**[V] Undo semantics:** `UNDO` marks rows with `undone_revision` rather than
deleting them (`rooms.ts:601-603`), and `moveHistory()` filters
`undone_revision IS NULL` unless `includeUndone` (`rooms.ts:234`). `history`
in the room blob is a rolling last-100 list of *commands* (`rooms.ts:609`), not
the score.

### 1.2 Event ("notation") schema

`/Users/ashkie/src/deevgames-muju-hardai/muju/src/game/moveHistory.ts:28-38`
defines `MoveEvent` as a tagged union over seven kinds. Concrete payloads:

- `move` — `{unit, from, to, path: string[], ap, speed}`; notation `🌱1 A2→A1`.
- `purchase` — `{unit, cost, bankBefore, bankAfter}`; notation `+🌱1@G2`.
- `promotion` — `{unit, previousDefinitionId, cost, bankBefore, bankAfter}`; `↑💧2@H6`.
- `attack` — `{unit, target, ap, attackPower, defenseBefore, defenseAfter, killed}`; `💧1 I3×I4`.
- `upkeep` — `{automatic, paid, bankBefore, bankAfter, kept:[{…,cost}], released:[]}`; `Upkeep −2 ◆`.
- `mining` — `{total, bankBefore, bankAfter, takes:[{unit, amount, reservesBefore, reservesAfter}]}`; `Mining +13 ◆`.
- `result` — `{winner, reason}`; `White wins`, with `#` appended to the previous
  notation on a home checkmate (`moveHistory.ts:109`).

**[V] Timing rule, stated in a comment at `moveHistory.ts:85`:** "Income belongs
to the outgoing turn; automatic upkeep belongs to the incoming one." So an
upkeep event with `turnNumber: N, player: black` is emitted inside White's
command for turn N. This matters when you reconstruct per-turn series.

**[V] Squares:** `historySquare` (`moveHistory.ts:16`) and `square`
(`server/notation.ts:4`) are identical: `A..J` from `x=0..9`, `1..10` from
`y=0..9`. White home `A1` = `(0,0)`, Black home `J10` = `(9,9)`.

`/Users/ashkie/src/deevgames-muju-hardai/muju/server/notation.ts` is 11 lines
total: `square`, `squares`, `describeAction` (rewrites the position field of
`MOVE`/`ATTACK`/`BUY_UNIT` into a square string). **[I]** This is the entire
"notation module"; it is presentation-only and trivially reusable.

### 1.3 Replay module

`/Users/ashkie/src/deevgames-muju-hardai/muju/src/game/replay.ts` is a *UI*
recorder, not a state machine: `ReplayRecording = {current, last}` of
`TurnReplay {player, turnNumber, initialBoard, frames}` where each `ReplayFrame`
is `{board, action, label, position?, unitId?}` (`replay.ts:9-22`). It records
actual engine results (`recordAction`, `replay.ts:59`), splits a multi-AP move
into speed-sized hops (`splitMoveFrame`, `replay.ts:27`), and rewinds on undo
(`rewindRecording`, `replay.ts:99`). Only `last` (the opponent's finished turn)
is ever put in a snapshot (`rooms.ts:186`).

`/Users/ashkie/src/deevgames-muju-hardai/muju/src/game/analysis.ts` is 29 lines
and is the *local* analysis-board timeline: `AnalysisFrame {state, label, turn}`,
`turnKey(state) = "<turnNumber>.<currentPlayer>"`, and `analysisFrames(before,
action, after)` which expands one action into one frame per AP step by calling
`describeTransition` + `movementStep` (`analysis.ts:17-28`). **[I]** Presentation
only — it produces labels and per-step snapshots for the UI scrubber; it computes
nothing an engine would want.

### 1.4 The archived-fixture format

`tests/fixtures/codex-claude-2026-09-12.json` top-level keys **[V]**:

```
source          "https://deevgames-muju.onrender.com/muju/?room=0a56f850c8050113da84aefac5007810"
roomId          "0a56f850c8050113da84aefac5007810"
recordingStart  {"revision":5,"turnNumber":3,"player":"white","complete":false}
initialState    full GameState at revision 5 (White to move, turn 3, place phase)
commands        34 entries  {revision, player, actions: RoomAction[]}   revisions 2..35
entries         200 MoveHistoryEntry                                     sequences 1..200, revisions 6..35
finalState      full GameState after RESIGN
```

**[V] Revision ↔ turn mapping:** revision `2k` is White's turn `k`, revision
`2k+1` is Black's turn `k`. Revision 2 = White turn 1 … revision 34 = White turn
17, revision 35 = Black turn 17 (`RESIGN`).

**[V] The pre-recording gap is real.** `commands` holds revisions 2–5, but
`initialState` is the position *after* revision 5, and
`matchPositions()` (`tests/fixtures/analysis.ts:24-37`) filters
`c.revision > recordingStart.revision`. So turns 1–2 are reconstructible as
*action lists* but not as positions, and `complete:false` is honest. The
missing two turns are, verbatim:

```
rev2 white  MOVE white_fire_1…gm7ao → H3 ; END_ACTION_PHASE
rev3 black  MOVE black_water_1…dv6x2 → I6 ; MOVE black_fire_1…s8kii → H9 ; END_ACTION_PHASE
rev4 white  BUY plant_1 @H2 ; MOVE fire → H8 ; ATTACK H9 ; END_ACTION_PHASE      (kills Black's Hi)
rev5 black  BUY plant_1 @I9 ; MOVE water → H7 ; ATTACK H8 ; MOVE water → H6 ; END  (kills White's Hi)
```

**[V] Entry-kind census across the 200 recorded events:** `move 68`,
`purchase 43`, `mining 29`, `upkeep 29`, `attack 18`, `promotion 12`,
`result 1`. **[V] Every one of the 18 attacks was lethal** (zero non-killing
attacks in the whole recorded game).

### 1.5 Reconstructing a full `GameState` sequence

Two equivalent routes. **[V] Both verified by running them.**

**(a) From stored positions** — no simulation. `room_moves.after_state` is the
complete deflated `GameState` for every sequence; `room_history_roots.state` is
sequence 0; `RoomStore.position()` handles intra-move AP steps. This is what the
HTTP endpoint `GET /api/muju/rooms/:id/positions/:sequence` serves
(`server/http.ts:44-48`).

**(b) From commands** — re-simulate. This is what `matchPositions()` does:

```ts
let state = structuredClone(match.initialState) as GameState;
for (const command of match.commands.filter(c => c.revision > match.recordingStart.revision))
  for (const action of command.actions as AIAction[]) {
    if (!isLegalAction(state, action, command.player as PlayerId)) throw …;
    state = applyAction(state, action);                       // src/ai/simulate.ts:25
  }
```

**[V] Result of running my `replay-codex-claude.ts`:**

```
{ "replayMatchesArchivedFinalState": true,
  "finalPhase": "victory", "winner": "white", "reason": "resignation" }
```

i.e. `JSON.stringify(replayed) === JSON.stringify(match.finalState)` **exactly**,
under today's v2.8 catalogue. **[I]** That is only true because neither side ever
fielded a Sachita or Sachakuna — the 2026-09-13 change
(`docs/EXPANSION_ECONOMY-2026-09-13.md`) altered Plant-2/3 mining to 5/8, which
would have broken byte-equality if a Sachita had harvested. Treat exact replay of
*future* archives as catalogue-version-dependent.

**[V] The board this game was played on is not the current board.** The stored
cells at revision 5 plus the 15 + 14 crystals both players had already banked sum
to **496**, and the layout matches `tests/fixtures/pre-central-map.ts`
(`PRE_CENTRAL_MAP`, 496) exactly — home 4-square blocks of 10, two 6-square
10-pockets at G2–I3 and B8–D9, empty approaches at D1–F3 / E8–G10. The current
map is `src/game/resourceMap.ts` `UNEQUAL_ROUTES_MAP` = **504** (home 8s,
expansions 16s, centre 8s), and `PRE_EXPANSION_MAP` (480) sits between them.
**[I] Opening theory from this game does not transfer square-for-square.**

---

## 2. The one complete real game

### 2.1 Header

**[V]** unless noted.

| | |
| --- | --- |
| Room | `0a56f850c8050113da84aefac5007810` on `deevgames-muju.onrender.com` |
| White | Claude — **won** |
| Black | Codex — **resigned** |
| Date | 2026-09-12, first recorded event 20:37:08.045Z, result 21:48:38.180Z (**71 min 30 s** of recorded play) |
| Length | 17 turns (White played 17, Black 16 + resignation), 34 commands, 200 events |
| Map | `PRE_CENTRAL_MAP`, 496 crystals |
| Actions/turn | 4 shared |
| Final | White 57 crystals / projected income 8 / upkeep due 5 / 15 units / 98 catalogue value; Black 4 / 2 / 5 / 16 units / 103 |
| Lifetime mined | White `resourcesGained` 223, Black 175 |
| Lifetime upkeep paid | White `resourcesUpkeep` **19**, Black **54** |
| Kills | Black 13, White 5 |
| Draw clock | never above `inactivityPlies = 3` of 10 |

**[D]** `docs/strategy-guide-codex-vs-claude.md:1` (written by Codex): "Claude
finished with 57 crystals and eight projected income to my four crystals and two
projected income. I resigned on turn 17." **[V]** Replay agrees to the digit.

**[D]** `docs/STRATEGY_GUIDE-2026-09-12.md:3` (written by Claude): "a 17-turn win
by resignation against Codex (Black), 2026-09-12". **[V]** Agrees.

**[V] Clock behaviour** (deltas between consecutive recorded revisions; each
delta is one player's whole turn): White's turns averaged **~224 s**
(min 48 s, max 521 s at turn 13); Black's averaged **~76 s** (min 40 s, max
122 s). **[I]** Claude thought ~3× longer per turn than Codex and still had the
better position — consistent with `docs/MCP_TOOL_TAPS.md:92` telling agents to
pre-compute during the opponent's turn.

### 2.2 Per-turn ledger

Generated from `entries`. `upk-N` is the payment made at the **start** of that
player's own turn. `bank` is the treasury immediately after that player's harvest.

| Turn | White (Claude) | Black (Codex) |
| --- | --- | --- |
| 3 | +Muju@G2 +Sjor@H1 · AP1 · mine+13 · bank 14 · upk-0 | +Muju@I10 +Hi@I6 · kill Muju@H2 · AP4 · mine+12 · bank 13 · upk-0 |
| 4 | +Muju@B1 +Sjor@G1 · kill Hi@I4 · AP4 · mine+15 · bank 20 · upk-0 | ↑Sjor→Straumr@H6 · +Muju@J10 +Sjor@I6 · kill Sjor@I3 · AP4 · mine+14 · bank 14 · upk-0 |
| 5 | +Göl@F2 +Göl@E2 +Muju@A2 +Muju@C1 · AP2 · mine+19 · bank 21 · upk-0 | ↑Straumr→Aegirinn@I4 · +Muju@J6 · kill Sjor@G1 · AP4 · mine+15 · bank 15 · upk-1 |
| 6 | +Muju@A4 +Inyan@F1 +Muju@B3 · AP4 · mine+19 · bank 25 · upk-0 | +Muju@J5 +Muju@J7 +Hi@J2 · AP4 · mine+22 · bank 22 · upk-2 |
| 7 | +Muju@A5 +Muju@B4 +Muju@C2 · kill Hi@J2 · AP4 · mine+20 · bank 30 · upk-0 | +Muju@I5 +Muju@I7 +Inyan@H6 +Inyan@H7 · kill Göl@J1 · AP4 · mine+21 · bank 21 · upk-2 |
| 8 | +Inyan@F3 +Göl@D3 (→D9) · AP4 · mine+14 · bank 35 · upk-0 | ↑Inyan→Mazask@H6, Inyan→Mazask@H7 · +Hi@I8 · AP4 · mine+**23** · bank 31 · upk-2 |
| 9 | **+Muju@B8 +Muju@C8 +Muju@B9 +Muju@C9** · AP4 · mine+**25** · bank 40 · upk-0 | ↑Mazask→**Tanka**@G7, Hi→Hono@I8 · +Muju@H8 · kill Göl@D9 · AP4 · mine+13 · bank 23 · upk-4 |
| 10 | +Muju@C7 · AP4 · mine+22 · **bank 57** · upk-0 | +Hi@E10 +Hi@F9 · kill Muju@D9, Muju@D8 · AP4 · mine+5 · bank 16 · upk-**6** |
| 11 | +Hi@C6 +Hi@E1 +Hi@D1 · kill Hi@E8 · AP4 · mine+15 · bank 63 · upk-0 | kill Hi@D8 · AP4 · mine+9 · bank 19 · upk-6 |
| 12 | ↑Hi→Hono@E1, Hi→Hono@D1 · AP4 · mine+9 · bank 64 · upk-0 | kill Inyan@F6 · AP4 · mine+5 · bank 18 · upk-6 |
| 13 | ↑Hono→**Kagari**@E1 · +Inyan@G2 · kill Hono@F7 · AP4 · mine+**1** · bank 50 · upk-2 | — · AP4 · mine+8 · bank 21 · upk-5 |
| 14 | ↑Inyan→Mazask@G2 · AP4 · mine+9 · bank 52 · upk-3 | ↑Hi→Hono@D10 · kill Muju@B9, Muju@C8 · AP4 · mine+6 · bank 18 · upk-5 |
| 15 | ↑Mazask→**Tanka**@G2 · kill Hono@C9 · AP4 · mine+2 · bank 42 · upk-4 | +Sjor@D10 · kill Göl@D9 · AP4 · mine+6 · bank 15 · upk-5 |
| 16 | — · AP4 · mine+13 · bank 50 · upk-5 | +Hi@B9 · kill Muju@A8 · AP4 · mine+2 · bank 9 · upk-5 |
| 17 | Tanka H2→I2 · AP4 · mine+12 · **bank 57** · upk-5 | **RESIGN** · upk-5 → bank 4 |

**[V] Harvest series** (turns 3→17):

```
White  13 15 19 19 20 14 25 22 15  9  1  9  2 13 12     (total 208 recorded; 223 lifetime incl. turns 1–2)
Black  12 14 15 22 21 23 13  5  9  5  8  6  6  2  –     (total 161 recorded; 175 lifetime)
```

**[V] Upkeep series** (payment at own turn start, turns 3/4→17):

```
White   0  0  0  0  0  0  0  0  0  0  2  3  4  5  5     (total 19)
Black   0  0  1  2  2  2  4  6  6  6  5  5  5  5  5     (total 54)
```

**[V] AP usage:** Black spent all 4 AP on every single turn 3–16. White spent 4
on every turn except turn 3 (1 AP) and turn 5 (2 AP); mean 3.67. Purchases and
promotions cost **no** AP — turn 9 White made 4 buys *and* spent 4 AP.

**[V] Region depletion** (my `regions.ts` run):

| rev | White home A1:C3 | Black home H8:J10 | NE pocket G1:J3 | SW pocket A8:D10 | Centre D4:G7 | Total |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 50 | 49 | 80 | 84 | 64 | 467 |
| 9 (t4) | 37 | 30 | 65 | 84 | 64 | 413 |
| 13 (t6) | 14 | 16 | 53 | 84 | 64 | 338 |
| 17 (t8) | 7 | 7 | 44 | 84 | 58 | 260 |
| 21 (t10) | 1 | 1 | 37 | 59 | 57 | 195 |
| 25 (t12) | 1 | 0 | 33 | 42 | 54 | 157 |
| 34 (t17) | 0 | 0 | 16 | 20 | **51** | 98 |

**[I] The single most striking economic fact of the game: 51 of the 64 crystals
in the centre (D4:G7) were still on the board at resignation.** Both agents
mined their homes flat by turn 10 and then fought over the two diagonal pockets
while a sixth of the map's wealth sat untouched in the middle. Neither agent ever
put a miner on a central 8-stack.

### 2.3 Turn-by-turn narrative of the decisive moments

Turn references are game turns; square names from `entries`.

**Turns 1–2 (reconstructed from `commands`, positions not recorded).** White ran
its starting Hi eight squares to H3 then H8 and killed Black's Hi on H9. Black's
Sjor answered by killing White's Hi on H8 and settling on H6. Both starting fires
were dead by turn 2. **[D] `docs/STRATEGY_GUIDE-2026-09-12.md:90` calls this the
"opening sketch that worked": "run the starting Hi 8 squares toward the far
pocket so it anchors purchases there next turn."** **[V]** White did run the Hi
to the far pocket; it did *not* survive to anchor anything.

**Turn 3 — the losing move of the game, made by the winner.** White bought
Muju@G2 and Sjor@H1 and spent 1 AP. Black's fresh Hi@I6 ran to I2 and killed the
Muju on H2, then retreated to I4. The Muju on H2 and 10 crystals of bank were
sitting on the board with a legal, engine-verified kill available:

**[V] Verified what-if (I ran it through `applyAction`/`isLegalAction`):**

```
PROMOTE_UNIT unit-white-2-0 (Muju@H2 → Sachita)   legal, bank 10 → 6, costs 0 AP
END_PLACE_PHASE                                    legal
MOVE Sachita H2 → H5                               legal, 3 AP (speed 1, path H3,H4,H5 clear)
ATTACK H6 (black Sjor)                             legal, 1 AP
⇒ Sjor removed from the board. AP left 0, bank 6.
```

Plant attack 1, +1 elemental advantage vs water = 2 ≥ Sjor defense 2. **[D]**
This is exactly mistake #1 in `docs/STRATEGY_GUIDE-2026-09-12.md:82`
("Not promoting a plant to Sachita to kill an adjacent Sjor on turn 3 … That
Sjor became the Aegirinn that dominated the middle game") and Codex's own
`docs/strategy-guide-codex-vs-claude.md:60` discusses the same square. **[V] The
claim is correct and the line is legal.** The surviving unit
`black_water_1_…dv6x2` went on to make **4 kills** (White's Hi on turn 2 as a
Sjor; Sjor@I3 on turn 4 as a Straumr; Sjor@G1 on turn 5 as an Aegirinn; Göl@J1
on turn 7), which matches Codex's "That unit ultimately captured four enemies"
(`strategy-guide-codex-vs-claude.md:46`) exactly.

**Turns 4–5 — Codex's promotion ladder.** Black promoted Sjor→Straumr (4 crystals,
turn 4) and Straumr→Aegirinn (8 crystals, turn 5), each promotion immediately
paying for itself with a kill. By turn 5 Black had a defense-4/attack-3/speed-2
piece that no White tier-1 could touch, for a total outlay of 4 + 12 = 16
crystals and 2 upkeep/turn. Black bought Muju@J10 on turn 4 —
**[D]** `STRATEGY_GUIDE-2026-09-12.md:78`: "Codex bought one on J10 on turn 4 and
it invalidated every one-turn assault I could compute." **[V]** The Muju@J10 is
present in every subsequent position including the final one.

**Turns 5–8 — the plant race.** White bought 3–4 Mujus per turn on home 10-stacks
(A2, C1, A4, B3, A5, B4, C2) and drove harvests to 19/19/20. Black bought Mujus
on its own J-column and I-column 10s and *out-mined* White: Black's turn-6/7/8
harvests were 22/21/**23** vs White's 19/20/14. **[D]** Codex calls this "My
23-crystal harvest looked encouraging, but it concealed a rapidly approaching
shortage" (`strategy-guide-codex-vs-claude.md:36`). **[V]** Black's home region
went 49 → 7 crystals between revisions 5 and 17, and its harvest collapsed
23 → 13 → 5 over the next two turns.

**Turn 8–9 — the pivot: White opens the SW pocket.** White bought a Göl@D3 on
turn 8 and *walked it six squares to D9 for 3 AP* (speed 2, path D4,D5,D6,D7,D8,D9;
`entries` #73 records `ap 3`). D9 is the far corner of the B8–D9 10-pocket. On turn 9 White used
that anchor to buy **four Mujus in one turn** on B8, C8, B9, C9 — all 10-stacks —
and harvested **25**. **[D]** `STRATEGY_GUIDE-2026-09-12.md:41`: "I used a Göl at
D9 to buy four plants on 10-stacks in one turn." **[V]** Confirmed; White's
spawn-position count jumped from 12 (rev 15) to **30** (rev 16) when the Göl
landed — the single largest deployment swing of the game.

Black's answer on turn 9 was to promote Mazask→**Tanka** on G7 (8 crystals) and
walk it G7→E9, killing the Göl@D9. That trade — a 16-crystal Tanka's turn for a
4-crystal Göl — **[I]** was materially good for Black and strategically bad: the
four Mujus were already bought, they mined 25 + 22 = 47 crystals over the next
two turns, and White's bank hit **57 on turn 10** while Black's fell to 16.
**[D]** Codex reached the same conclusion himself
(`strategy-guide-codex-vs-claude.md:21`): "Although I eventually captured the
scout, the miners it helped establish continued contributing."

**Turn 10–12 — Black wins every exchange and loses the game.** Black used its
Tanka as a forward spawn anchor and bought cheap Hi's beside White's pocket
plants: Hi@E10 and Hi@F9 on turn 10 killed Muju@D9 and Muju@D8. White answered
with three fresh 3-crystal Hi's on turn 11 (C6, E1, D1) and killed Hi@E8; Black's
Tanka killed that Hi back on turn 11 and its Hono killed Inyan@F6 on turn 12.
Over turns 10–12 Black made 5 kills to White's 1 — and Black's *bank* went
16 → 19 → 18 while paying **6 upkeep every single turn**, and White's went
57 → 63 → 64 while paying **0**.

**[V] This is the whole game in two numbers.** From turn 10 to turn 17 Black paid
6,6,6,5,5,5,5,5 = **43 crystals** of upkeep on harvests of 5,9,5,8,6,6,2,0 = **41
crystals**. Black's army literally cost more to keep than the board could feed it.
White paid 0,0,0,2,3,4,5,5 = 19 on harvests 22,15,9,1,9,2,13,12 = 83.

**Turn 13 — White's income actually hits 1.** White's turn-13 harvest was **+1**
and `projectedIncome(white)` was **0** at revisions 25 and 26. **[D]** Codex
noticed: "Later, Claude's projected income reached zero despite its enormous
collection of miners" (`strategy-guide-codex-vs-claude.md:36`). **[V]** True —
but White had 62 crystals banked and Black had 18, so the zero was survivable.
White spent it on Hono→Kagari (8) and Inyan (5), and its Göl killed Hono@F7.

**Turns 14–16 — the Hono chain kill and the Tanka parked on I2.** Black promoted
Hi→Hono@D10 on turn 14, moved it to C9 and **chain-killed two Mujus in one square**
(B9 then C8) — the killing blow unlocks another attack up to the unit's tier
(`combat.ts:13-17`). **[D]** Codex describes exactly this at
`strategy-guide-codex-vs-claude.md:92`: "my Hono reached C9. It killed the Muju on
B9, then used the unlocked attack to kill the Muju on C8." **[V]** Confirmed
(`entries` #164–166). White's Göl killed that Hono on turn 15; Black's fresh
Sjor@D10 killed the Göl back on turn 15.

Meanwhile White built Inyan→Mazask→**Tanka** on G2 (turns 13–15, 5+4+8 = 17
crystals) and walked it G2→H2→I2 (turns 16–17) onto the last 10-stack in the NE
pocket. **[D]** `STRATEGY_GUIDE-2026-09-12.md:65`: "My Tanka sat on the I2
10-stack in the endgame, mining 4 a turn where nothing Black owned could hurt it."
**[V]** Confirmed: at revision 34 the Tanka is on I2 with 6 crystals under it, and
White's harvests recovered to 13 and 12 on turns 16–17.

**Turn 17 — resignation.** Black paid 5 upkeep from a bank of 9, leaving **4**, on
a projected income of **2**. White had 57 banked, 8 projected, 5 upkeep. Black
resigned without moving. **[D]** `strategy-guide-codex-vs-claude.md:1`: "I
resigned on turn 17 because sustaining my army and generating threats had become
increasingly difficult." **[V]** The forecast supports it: Black's stay-in-place
ledger is 2 income against 5 upkeep, i.e. insolvent in ~2 turns.

### 2.4 What Black did wrong, in concrete board terms

**[V]** from the replay, except where marked.

1. **Bought 13 units of tier ≥ 2 worth of upkeep with no economic base.** Black's
   promotions cost 36 crystals (Straumr 4, Aegirinn 8, Mazask 4, Mazask 4, Tanka
   8, Hono 4, Hono 4) and produced a standing bill of 5–6/turn from turn 9. White
   promoted 28 crystals' worth but all after turn 12, when its bank was 50+.
2. **Won 13 kills and converted none into territory.** Every kill except the
   Göl@D9 was on a unit White could and did replace from a bank of 50+. Black
   never occupied a mined square it took; the Tanka wandered E9→E8→D8→B10→C10→A9
   and mined nothing.
3. **Never contested the SW pocket before turn 9.** The B8–D9 60-crystal pocket
   sat at full 84 (region A8:D10) until revision 17. White reached it on turn 8
   with a 4-crystal Göl; Black only arrived on turn 9 to kill the Göl, after the
   four Mujus were already down.
4. **Stopped buying miners at turn 9.** Black's last Muju purchase is
   `+Muju@H8` on turn 9 (`entries` #98). After that it bought only Hi's (E10, F9,
   B9) and one Sjor (D10) — raiders. Its harvest went 13 → 5 → 9 → 5 → 8 → 6 →
   6 → 2.
5. **[I] Traded a 16-crystal Tanka's tempo for 4-crystal Göls twice** (turn 9 and,
   via a fresh Sjor, turn 15), spending the piece that could have anchored its own
   pocket purchases.
6. **[D, partially contradicted]** `STRATEGY_GUIDE-2026-09-12.md:39` says "Codex
   lost four fire units this way." **[V]** White actually killed **five** fire
   units: Hi@I4 (t4), Hi@J2 (t7), Hi@E8 (t11), Hono@F7 (t13), Hono@C9 (t15).
7. **[D, off by context]** `STRATEGY_GUIDE-2026-09-12.md:58` says "Its bank went
   22 → 21 → 18 → 15 → 9 → 4". **[V]** Black's post-harvest banks were
   22, 21, 31, 23, 16, 19, 18, 21, 18, 15, 9, 4 (turns 6–17). The quoted series is
   the tail with turn 13's 21 dropped. The trend claim is right; the series is not
   a literal transcript.

White's mistakes, **[D]** self-reported at `STRATEGY_GUIDE-2026-09-12.md:80-88`
and **[V]** confirmed in the record: three Göls bought, **all three died** (J1
turn 7, D9 turn 9, D9 turn 15) — two of them on the same square D9.

### 2.5 Why the loser's and winner's write-ups both matter

`docs/strategy-guide-codex-vs-claude.md` (118 lines, Codex/Black) and
`docs/STRATEGY_GUIDE-2026-09-12.md` (92 lines, Claude/White) are the same game
from both sides. **[I]** For hard-AI work they are a free labelled dataset of
*what each agent believed it was doing*, and the replay lets you check every
belief. I checked eight specific claims above; six are exactly right, one
(fire-unit count) is low by one, one (bank series) is a paraphrase.

---

## 3. The other real games — described, not recorded

**[V]** No move data exists for any of these. Sources are
`docs/hard-ai/understand/napkin-snapshot.md` and `docs/MCP_TOOL_TAPS.md`.

| Date | Sides | Result | What is recorded |
| --- | --- | --- | --- |
| 2026-09-12 | Claude vs Codex (Claude as Black) | **Claude lost** | napkin:9 — "compact corner formation (units on J10/I10/J9) that left ZERO empty spawn squares; couldn't buy for 4 of 10 turns"; napkin:25 — "Codex's winning recipe = Hi to a central 8 turn 1, Muju+Radi hit-and-run early, then promote metal to Mazask/Tanka once ahead" |
| 2026-09-12 | "game 2", Claude as **White** | **Claude lost** | napkin:11 — "Straumr spd1 = 4 squares/turn killed my Hi at D3; bought Mujus on home 10-cells that were already half-mined, so income collapsed to ~1 by turn 6; sent my only Aegirinn 8 squares away to anchor the rich patch and Codex blocked the rectangle with a 3-crystal Hi"; napkin:24 — Codex's plan "Sjor→Straumr→Aegirinn fast … then Inyan→Mazask→Tanka walked INTO my cluster (B2) to block all spawn rectangles" |
| 2026-09-12 | Claude, freshly bought Radi | **Claude lost a Hi turn 2** | napkin:9 (2nd row) — "a freshly BOUGHT Radi (speed 3) from a forward-anchored rectangle killed my Hi turn 2" |
| 2026-09-13 | Claude as **Black +3 handicap**, classical time | **Claude lost** | napkin:13 — "Turtled in the corner with Mujus as walls; Codex parked its Aegirinn at G6→G8 as a forward spawn anchor and bought a fresh 3-crystal Hi 1–2 AP from my perimeter every turn … income 11→0 by turn 12, released units to upkeep on turn 13"; napkin:23 gives Codex's full build order |

**[D]** `docs/MCP_TOOL_TAPS.md:5-14`: "written after two rapid games lost by an
agent that had every tool available and used almost none of them for judgment …
the two decisive blunders in the 2026-09-12 games (a Hi left in reach of a
speed-1 Straumr; a Straumr promoted to 'safe' defence 3 the turn before the enemy
promoted to a 3-attack Aegirinn) were both `proven_possible` kills that
`muju_analyze` would have reported in one call."

**[I] Standing record between the two agents, as best I can reconstruct: Codex
3–1 (or 4–1) up.** The only archived game is the one Claude won. That is a
selection bias worth holding onto — the analysis tooling, the benchmark fixture
and the two strategy guides are all built on Claude's single win.

---

## 4. Cross-game patterns

Everything here is from **n = 1** with move data, plus **[D]** narrative for 3–4
more games. I am labelling the sample size on every claim because it matters.

### 4.1 Openings

**[V, n=1]** In the archived game both sides opened identically in kind: run the
starting Hi (fire_1, speed 2, 8 squares in 4 AP) toward the opponent's half on
turn 1, trade it on turn 2, then buy Mujus on home 10-stacks from turn 3.

**[D, n≈4]** Codex's opening is stable across games and is the one that keeps
winning:
`Hi to a central 8 on turn 1` → `2–3 Mujus per turn on home 10s and both rich
patches` → `Sjor→Straumr (turn 3–4)→Aegirinn (turn 4–5)` → `park the Aegirinn as a
forward spawn anchor` → `Inyan→Mazask→Tanka (turns 6–8)` → `fresh 3-crystal Hi
raid on a perimeter miner every turn`. Sources: napkin:23, napkin:24, napkin:25,
`MCP_TOOL_TAPS.md:39` ("In both 2026-09-12 games Codex went Sjor → Straumr →
Aegirinn by turn 4").

**[V]** In the archived game Codex hit that ladder on schedule: Straumr turn 4,
Aegirinn turn 5.

**[D]** `STRATEGY_GUIDE-2026-09-12.md:90` prescribes White's counter-opening
("Turn 1: run the starting Hi 8 squares … By turn 6 you should have 20+ crystals,
15+ income and no enemy fire on the board"). **[V]** White in the archived game
had 25 crystals and 11 projected income after turn 6 — 20+ crystals yes, 15+
income no.

### 4.2 Units bought

**[V, n=1]**, from `entries`:

| | White (Claude) | Black (Codex) |
| --- | --- | --- |
| Muju (plant_1, 5◆) | **14** | **8** |
| Hi (fire_1, 3◆) | 3 | **6** |
| Göl (shadow_1, 4◆) | 3 | 0 |
| Inyan (metal_1, 5◆) | 3 | 2 |
| Sjor (water_1, 4◆) | 2 | 2 |
| Radi / lightning | 0 | 0 |
| **Purchase spend** | **114◆** (25 units) | **76◆** (18 units) |
| **Promotion spend** | 28◆ (2 Hono, 1 Kagari, 1 Mazask, 1 Tanka) | 36◆ (Straumr, Aegirinn, 2 Mazask, Tanka, 2 Hono) |

**[V]** Muju is 22 of the 43 purchases (51%); Muju + Hi is 31 of 43 (72%).
**[V] Lightning was never bought by either side in the whole game** — and
`briefing.json` shows the engine's threat scanner repeatedly proposing
`+lightning_1@…` lines that do 2 damage vs defense 3 and never kill.
**[I]** Radi (attack 1, mining 0, 3◆) looks like a dead unit in this meta.

### 4.3 Game length and endings

**[V, n=1]** 17 turns, 34 commands, 200 events, 71.5 min wall clock.
**[D, n=4]** napkin:13 describes a game where "income 11→0 by turn 12, released
units to upkeep on turn 13" — **[I]** so ~13–17 turns looks typical.

**[V] Endings observed with data: 1/1 resignation.** **[D]** The other three
games are described as losses without a stated mechanism; napkin:13's "released
units to upkeep on turn 13" is upkeep starvation, which the engine implements as
forced release (`upkeep.ts:23-31`), not as a loss condition — **[I]** so those
almost certainly also ended in resignation.

**[V] Zero observed: elimination, home-occupation, home-checkmate, timeout,
inactivity draw.** In the archived game the draw clock never exceeded 3 of 10
(`INACTIVITY_LIMIT = 10`, `src/game/inactivity.ts:3`) because kills were
frequent. **[I]** For hard-AI purposes, `victory.ts`'s elimination and
home-occupation paths and the whole `homeCheckmate.ts` prover are, empirically,
untested by real play.

### 4.4 The income curve

**[V, n=1]** Combined harvest per turn (White + Black):

```
t3  25   t4  29   t5  34   t6  41   t7  41   t8  37
t9  38   t10 27   t11 24   t12 14   t13  9   t14 15
t15  8   t16 15   t17 12
```

**[I] The shape is: ramp to a peak at turns 6–9 (~40/turn combined), then a
cliff.** Between turns 9 and 13 combined income fell 38 → 9, a 76% collapse in
four turns. That is the phase transition the game is actually about, and it is
what `docs/ANALYSIS_TOOLS_PROMPT-2026-09-12.md:9` lists as motivating problem #1:
"Large harvests obscured imminent deposit exhaustion; income fell from 16 to 0 in
three turns with no warning."

**[V]** After the cliff, both sides' income is determined entirely by how many
miners they can *walk* onto fresh 4-stacks per turn within the 4-AP budget.
White's turns 14–17 (harvests 9, 2, 13, 12) each consist of 3–4 one-square Muju
relocations. **[D]** `STRATEGY_GUIDE-2026-09-12.md:66`: "I ran 5 upkeep on 45+
banked crystals and shuffled plants onto 4-stacks each turn to stay near
break-even." **[V]** Confirmed exactly.

**[V] Bank divergence is the actual win condition here.** Post-harvest banks:

```
turn:    6   7   8   9  10  11  12  13  14  15  16  17
White:  25  30  35  40  57  63  64  50  52  42  50  57
Black:  22  21  31  23  16  19  18  21  18  15   9   4
```

White's bank never fell below 40 after turn 9; Black's never rose above 23.

### 4.5 Transferability caveat

**[V]** The archived game was played on the 496-crystal `PRE_CENTRAL_MAP`. The
current map is 504 with **home squares at 8** (not 10) and **expansion squares at
16** (not 10), and Sachita/Sachakuna now mine 5/8 (`docs/EXPANSION_ECONOMY-2026-09-13.md`).
**[I] Under the new map the "buy plants on home 10s" opening is materially
weaker (8-stacks return 8 for a 5-crystal plant over three harvests instead of
10), the expansion pockets are worth 2.6× more per square, and promoting a plant
to Sachita is now defensible for income alone — which is precisely what the
archived game's guides say never to do.** Do not train or tune on this game's
economic conclusions without re-deriving them on the 504 map.

---

## 5. Analysis primitives inventory

All of `server/analysis/` (8 files, ~2,100 lines) plus `src/game/analysis.ts`.
**[V]** signatures read directly from source.

### 5.1 `server/analysis/core.ts` (103 lines) — plumbing

| Export | Signature | What it does |
| --- | --- | --- |
| `Proof` | `'proven_possible' \| 'proven_impossible' \| 'unknown'` | The only three verdicts anything returns. `core.ts:11` |
| `WorkBudget` | `new WorkBudget(maxNodes, maxMs, signal?)` | Shared node+time budget. `spend()` increments and returns false when exhausted; `fork(n,ms)` sub-budgets; `absorb(child)` folds child cutoffs back; `report()` emits `{completeness, nodes, maxNodes, maxMs, elapsedMs, cutoffReason, subsearchCutoffs, omittedCaseClasses, collapsed}`. `core.ts:12-41` |
| `simulateSequence` | `(source: GameState, actions: RoomAction[], onTransition?) => {state, applied}` | The hypothetical evaluator. Rejects `UNDO`/`SET_UPKEEP_REVIEW` with `422 UNSUPPORTED_HYPOTHETICAL`; throws `422 ILLEGAL_ACTION` on the first illegal action; breaks on home-checkmate. `core.ts:45-58` |
| `turnFor` | `(source, player) => {state, setupActions, assumptions}` | **The key modelling primitive.** Hands the turn to `player` by playing the *real* engine transitions: default upkeep → `END_PLACE_PHASE` → `END_ACTION_PHASE`. Credits the outgoing harvest, applies incoming upkeep/healing/AP reset, and explicitly does **not** credit the incoming player's harvest. `core.ts:66-79` |
| `modelDescription` | `(model) => {stateKind, actor, turn, phase, status, treasury, setupActions, assumptions}` | Presentation wrapper. `core.ts:80-85` |
| `actionReady` | `(source) => {state, actions}` | Pay pending upkeep + end place phase, nothing else. `core.ts:86-96` |
| `tacticalKey` | `(s: GameState) => string` (sha256) | Transposition key over **only** the fields that affect legal continuations: phase, winner, turn, `upkeepPending`, both treasuries, `progressThisTurn`, `inactivityPlies`, and per-unit `[id, definitionId, owner, x, y, damageTaken, canActThisTurn, hasAttacked, placedThisTurn, promotedThisPlacement, lastAttackKilled, attackedThisTurn]`. `core.ts:99-103` |

**[I] Reusable as engine primitives:** all of `WorkBudget`, `simulateSequence`,
`turnFor`, `actionReady`, `tacticalKey`. `tacticalKey` in particular is exactly
the transposition key a search engine needs and it is already written.

### 5.2 `server/analysis/economy.ts` (113 lines)

| Export | Signature | Computes | Limits |
| --- | --- | --- | --- |
| `economyForecast` | `(source: GameState, horizon = 12) => {assumptions, horizon, stop, failure, completed, checkpoints}` | Plays `horizon × 2` plies of pure "everyone stands still and pays": upkeep → `END_PLACE_PHASE` → `END_ACTION_PHASE`, recording a `Checkpoint {player, turn, kind:'harvest'\|'upkeep', amount, treasury}` at each. Stops at the first `upkeep_shortfall`, a terminal result, or the horizon. `economy.ts:16-56` | No spending, no captures, no releases, no relocation. Both ledgers stop at the *first* shortfall by either player. |
| `economyHeadlines` | `(s, forecast?) => Record<PlayerId, {treasury, harvest, upkeep, harvestTrend[3], next, nextUpkeepShortfall, shortfallIn}>` | Layer-0 economy block. `shortfallIn` counts *completed own harvests before failure*, not rounds. `economy.ts:58-69` | `null` shortfallIn means the sim stopped before that player failed — not safety. |
| `minerDetail` | `(s, u: Unit, horizon, relocation: boolean, actions, limit)` | Per-miner: `{mining, reserve, next, harvestsLeft, upkeep, economicallyIdle, emptyAfterHarvest, adjacent[], relocations[]}`. `relocations` uses `getMovementRange` and scores by `incrementalHarvest = min(deposit, horizon×mining) − min(reserve, horizon×mining)`. `economy.ts:71-89` | "Independent routes on the fixed board … excludes tactics and game termination." No joint AP allocation. |
| `economy` | `(s, input: AnalysisInput)` | Whole section: headline + forecast + `historicalLastHarvest` + `upkeepDecisionUnits` + `totalRemaining` + per-region remaining (default regions are the four 5×5 quadrants) + `reachableReserves` per player (union of independent miner routes) + `units[]`. `economy.ts:91-113` | `reachableReserves` explicitly "excludes a joint shared-AP plan". |

**[I] Reusable as engine primitives:** `economyForecast` and `minerDetail` are
real evaluation signal. `economyHeadlines` is presentation over the forecast.
The `regions` quadrant split is presentation-only and, given §2.2's finding that
the centre goes unmined, **[I]** a poor partition — a hard AI wants per-cluster
(home / NE pocket / SW pocket / centre) accounting.

### 5.3 `server/analysis/geometry.ts` (106 lines)

| Export | Signature | Computes | Limits |
| --- | --- | --- | --- |
| `spawnGeometry` | `(s, player) => {player, squares, count, homeBlocked, anchors[]}` | Per-unit anchor rectangles via `getSpawnRectangle(startCorner, unit.position)` (`src/game/spawning.ts:8`), which enemy ids block each, and the union of legal spawn squares. `geometry.ts:11-21` | Occupancy only. |
| `blockingSet` | `(s, player, budget) => {status, minimum, bestFoundSize?, squares, singleSquares?, optimality, assumption}` | **Exact minimum set cover** over the currently-unblocked rectangles using a bitmask branch-and-bound with a `seen: Map<bigint, number>` dominance table, spending `budget.spend()` per node. Returns `proven` when complete, `best_found` when the budget runs out, `proven_impossible` when an anchor has no empty square. `geometry.ts:25-50` | "Fixed board; empty squares only; **routes not checked**" — it never claims a unit can get there. |
| `inRegions`, `selectedUnits` | filters | Target selection: `unitIds` → `squares` → all of `input.player`'s units, intersected with `regions`. `geometry.ts:52-59` | — |
| `reach` | `(s, input) => [{id, actions, byCost:{1,2,3,4}, homeReachable, paths?}]` | Per-unit movement range bucketed by AP cost, with `homeReachable` against the *enemy* corner. AP budget is 0 unless the unit is the current player's and `canActThisTurn`. `geometry.ts:60-70` | Movement only; no attack, no promotion. |
| `mobility` | `(s, input) => {assumptions, units[], regions[], singleEntrances}` | Per-unit `{trapped, exits, reachableCount, friendlyBlockers:[{id, adjacent, extraReachIfVacated}], enemyBlockers}` plus flood-fill free components and **articulation squares** (`components(s, removed)` re-run per empty cell, `geometry.ts:102`). | O(cells × flood-fill) — 100 flood fills per call. "vacating a blocker is an independent what-if, not a verified sequence." |

**[I] Reusable as engine primitives:** `spawnGeometry`, `blockingSet` and
`reach`. `mobility`'s articulation-square computation is expensive and
**[I]** presentation-oriented, but the `friendlyBlockers.extraReachIfVacated`
number is a genuine positional feature.

### 5.4 `server/analysis/tactics.ts` (292 lines) — the real engine

| Export | Signature | Computes | Limits |
| --- | --- | --- | --- |
| `damageUpperBound` | `(s, target: Unit, categories) => number` | A **knapsack** over `(hits, AP)`: for each of the mover's units (plus its promoted variant if affordable), cost = `ceil(max(0, manhattan−1)/speed) + 1` and damage = `calculateAttackPower`. Affordable purchases start adjacent at cost 1. Corner targets are capped at 2 hits when AP ≤ 4. `tactics.ts:41-69` | Ignores blockers and shared spending — a **safe over-estimate**, used only to prune. "may overestimate, never certify a kill." |
| `evidence` | `(source, actions, targetId?) => Evidence` | Runs the sequence through `simulateSequence` and accumulates `{actions, after, category, ap, crystals, damage, lethal, attackerId, steps[], upkeepPaid, purchases[]}`. `tactics.ts:70-99` | Stops before handoff, so no harvest or opponent upkeep leaks into the AP/cash accounting. |
| `singleThreats` | `(source, targetId, categories, budget, quota = ∞, lethalOnly = false) => {lines: Evidence[], complete, omitted[]}` | Enumerates **single-attacker** lines: optional prefix (pay upkeep) × {existing \| each legal promotion \| each affordable purchase on each spawn square, sorted by manhattan distance to target} × each attacker × each adjacent attack square. Every line is executed by the engine. Dedupes by `tacticalKey(after)`, counting `budget.collapsed`. Sorted lethal-first, then crystals, AP, damage. `tactics.ts:103-170` | `omitted` always contains `['combined attacks', 'blocker clearing', 'purchase chains expanding control']`. No summing of independent attacks. |
| `searchTurn` | `(source, budget, {targetId?, categories, objective?, quota?})` | **Exhaustive DFS over the legal one-turn action graph.** Objectives: `killTarget` (score 1000 on removal, else defense delta), `capturedValue` (sum of catalogue costs removed), `occupyHome`, `blockPurchases`. Prunes with `damageUpperBound`, transposes on `tacticalKey`, orders moves (attack-on-target −100, other attack −50, `PAY_UPKEEP` −20, `END_PLACE_PHASE` −10, promotion 0, else manhattan distance). Caps sequences at 32 actions. `tactics.ts:175-232` | Never hands over to an opponent — one ply, one side. `proven_impossible` only when complete *and* nothing omitted. |
| `describeEvidence` | `(source, line, targetId, full = true)` | Renders one line to the compact string `"<attacker> → <square>, <m>+<a> AP/<c> crystals, dmg X vs def Y, kill\|damage, retreat N"` plus optional `steps`, `witness` (executable action array), and a retreat witness. `tactics.ts:234-254` | **Presentation only** — but note it also *computes* the retreat set and appends a legal retreat move. |
| `replyTo` | `(line, budget, deep, quota = 200)` | Hands the turn to the defender via `turnFor(line.after, …)` and asks whether the attacker can be killed: `singleThreats(lethalOnly)` first, then `searchTurn` if `deep`. `tactics.ts:256-270` | "Attacker ends now on the attack square, **without withdrawing**." One ply, `best_found`, no minimax. |
| `approachTable` | `(source, target: Unit) => [{attacker, attackSquare, moveActions, attackPossible, actionsRemaining, classification, retreatSquares}]` | Classifies every enemy approach square as `unreachable` / `strike-and-retreat` / `stranded`, by actually executing the move+attack and measuring the post-attack movement range. `tactics.ts:272-291` | Single attacker per row. |

**[I] This is the reusable core.** `damageUpperBound`, `singleThreats`,
`searchTurn`, `evidence` and `approachTable` are all real engine primitives with
proper budgets and transposition. `describeEvidence` is the only
presentation-only item, and even it computes the retreat set.

**[D]** `approachTable`'s three-way classification is exactly what
`STRATEGY_GUIDE-2026-09-12.md:45-51` calls "the decisive habit of this game", and
`ANALYSIS_TOOLS_PROMPT-2026-09-12.md:12` says it "was recomputed dozens of times
per game by both players and drove nearly every decision."

### 5.5 `server/analysis/units.ts` (33 lines) and `exchange.ts` (42 lines)

- `unitDetails(s, input)` — per-unit `{element, attack, baseDefense, remainingDefense,
  speed, attacksUsed, canAttack, chainEligible, upkeep, canAct, placedThisTurn,
  promotion:{legalNow, cost}}`. `units.ts:11-20`. **[I] Presentation.**
- `matchups(s)` — an N×N attack matrix over the **definitions actually on the
  board**, plus per-instance `[id, definitionId, remainingDefense]`, plus a
  `blackAttackOverride` matrix when the combat handicap makes the two sides
  differ. `units.ts:24-33`. Explicitly "Geometry/attack eligibility excluded."
  **[I] Cheap and reusable, but it is just `calculateAttackPower` cross-producted.**
- `exchange(before, actions)` — pure accounting over an executed sequence:
  `{witness, actionsSpent, crystalsSpent, chosenUpkeepPaid, captured[], released[],
  players:{treasury, upkeep, forecastHarvest, spawnCount} as [before, after],
  boardReserves:[before, after], finalPositions[], result}`. `exchange.ts:12-42`.
  Self-labelled "Accounting only. Catalogue capture value is not a trade verdict."
  **[I] The `[before, after]` pairs for treasury / upkeep / forecastHarvest /
  spawnCount are a ready-made positional delta vector.**

### 5.6 `server/analysis/index.ts` (375 lines) — the service

`AnalysisService` exposes three entry points; `analysisService` is a module
singleton (`index.ts:375`).

| Entry | Budget | Output target | Sections |
| --- | --- | --- | --- |
| `headline(room, player?)` | `new WorkBudget(160, 15)` — **160 nodes / 15 ms** (`index.ts:236`) | none (already tiny) | `economy` (both sides), `forecastStop`, `deployment` (spawn count + blocked flag per side), `draw: [plies, 10]`, `urgent[]` |
| `briefing(room, player, sinceRevision?)` | `new WorkBudget(900, 65)` — **900 / 65 ms**, of which threats get a `fork(500, 38)` (`index.ts:312-317`) | **6,000 bytes** (`index.ts:335`) | `economy`, `forecastStop`, `miners` (one string per own unit), `matchups`, `spawn` (both sides), `threats` (one line per threatened unit), `opportunities` (2), `mobility` (≤4 units), `urgent` |
| `analyze(room, raw, signal?)` | from `input.searchBudget`: default **2,000 nodes / 150 ms**, max **20,000 / 750 ms** (`schema.ts:24-25`) | `headline` 1,800 / `standard` **24,000** / `full` **120,000** bytes (`index.ts:302`) | any of 12 topics |

**[V] The 12 topics** (`schema.ts:5`): `economy, units, matchups, spawn, reach,
mobility, threats, opportunities, exchange, checkmate, survival, reply`.

Topic-specific functions defined in `index.ts`:

| Function | What it adds |
| --- | --- |
| `urgent(s, player, budget)` `index.ts:32-50` | Flag strings only: `home:<side>:<id>`, `trapped:<id>` (≤2), `threatNow/NextTurn:<id>`, `captureNow/NextTurn:<id>`. Uses `singleThreats(…, ['existing'], budget, 40, true)` per unit and **breaks at the first hit per category**. |
| `defenderCases(s, input)` `index.ts:59-79` | Structural what-ifs: insert or retype/relocate a hypothetical defender at a square, with no spending and no placement action. Rejects occupied squares and `damageTaken >= defense`. |
| `threats(s, input, budget, quota)` `index.ts:87-126` | Per target: `turnFor(enemy)`, then `singleThreats` with quota `0.65×` (or `0.35×` when deep) plus, when `deep`, `searchTurn` with `0.4×`. Emits `kill`, `scope`, `singleScanComplete`, `maxSingleHitFound`, `bestKillFound{cheapest, fewestActions}`, up to `limit` lines each optionally carrying `exposure` (a `replyTo` per distinct attacker, `0.25×/display.length`). |
| `opportunities(s, input, budget)` `index.ts:128-147` | The mirror: `turnFor(me)`, lethal `singleThreats` against every enemy unit, plus a `capturedValue` `searchTurn` when deep, plus `homeReach`. |
| `checkmate(s, budget)` `index.ts:149-173` | Delegates to `analyzeHomeDefenseEvidence(s, invader, transitionWithoutCheckmate, maxNodes, interrupted)` — **the same prover the server uses to adjudicate** (`src/game/homeCheckmate.ts:63`, `PROOF_NODES = 20000`). Returns `proven_possible` on `mate`, `proven_impossible` on `rescue`, `unknown` on exhaustion, plus the rescue witness (chunked into ≤32-action commands) and `cornerEntrances`. |
| `survival(s, input, budget)` `index.ts:175-205` | For an **empty** square, inserts each of the 18 catalogue definitions in turn and asks whether it survives the opponent's next turn. Returns `minimumDefense {status:'proven'\|'bounded', lowerBound, sufficientUpperBound}` where `upper = damageUpperBound` and `lower = max observed damage`; `proven` only when the two coincide. Budget per profile is `maxNodes/36`. |
| `fit(result, maximum, input?)` `index.ts:341-358` | Byte budgeting. Drops **whole sections**, in the fixed order `mobility, matchups, miners, spawn, economy, emptySquareProfiles, survival, reach, units, opportunities, threats, reply`, never truncating a witness array; records `output.omittedSections` and appends a follow-up call. Sets `overBudget` if it still does not fit. |
| `diff(result, key, revision, sinceRevision?)` `index.ts:359-373` | Section-level diff against a process-local baseline (128 entries / 4 MB). Falls back to `mode:'full'` with `reason:'baseline_not_cached'`. |

**[V] Caching:** result LRU keyed on `room.id + revision + sha256([state, ready,
parameters])`, 64 entries / 4 MB, single results over 250 KB not cached
(`index.ts:219-232`). Callers get `structuredClone` copies.

**[V] Measured cost** (`docs/analysis-benchmark/measurements.json`, Node
v24.11.1, 7 revisions of this very game at 21–35 units):

| Layer | Latency | Bytes | Est. tokens (bytes/4) |
| --- | --- | --- | --- |
| headline | 0.76–2.36 ms | 1,246–1,271 | 312–318 |
| briefing | 45.26–66.99 ms | 4,247–5,489 | 1,062–1,373 |
| focused (`threats`, 1 target, standard) | 2.69–46.95 ms | 4,857–11,521 | 1,215–2,881 |
| deep (`threats`, 1 target, `deep:true`, full) | 4.51–**150.68** ms | 10,350–18,981 | 2,588–4,746 |

**[V] Every single measurement reports `completeness: "bounded"`** — not one of
the 28 runs proved anything exhaustively. Node counts actually used: headline
1–4, briefing 207–421 (three of seven hit `time_limit` at 65 ms), focused 12–382,
deep 24–403. **[I] The budgets are not the binding constraint on the briefing;
the 65 ms wall is.** And deep search never used more than 403 of its 2,000 nodes
before hitting 150 ms.

### 5.7 `server/observation.ts` (146 lines) and `server/clockPressure.ts` (39 lines)

- `observe(room, perspective)` `observation.ts:20-57` — the layer-0 payload:
  room/clock/staging metadata, `analysis: analysisService.headline(...)`, a
  10-row string board (`"W:fire_1"` / `"."`), a 10×10 `reserves` matrix, a flat
  `units[]` with `effectiveDefense`/`upkeep`/`attacksUsed`, `lastIncome`,
  `lastUpkeep`, and the last 8 commands. **[I] Presentation, but it is the only
  place the board and reserves are serialised compactly.**
- `legalActions(room, {unitId, type, offset, limit})` `observation.ts:59-92` —
  enumerates legal actions with `actionCost` per destination and, for attacks,
  `{targetUnitId, attack, defense, eliminates}`. Default page 60, total reported.
  **[I] `eliminates` is a free one-hit-kill oracle; reusable.**
- `rules` `observation.ts:94-146` — a large static object (map layout, handicap
  rules, time controls, staging protocol, turn/combat/element/victory prose, and
  `catalogue: UNIT_DEFINITIONS`). **[I] Pure documentation payload.**
- `clockPressure.ts` — `ClockHistory {sampling, players: Record<PlayerId,
  ClockPaceTotals>, activeTurn}`; `newClockHistory`, `completeClockTurn(history,
  player, turnNumber, now, delayMs)` which adds `elapsed` and `max(0, elapsed −
  delayMs)`, and `projectClockPressure(history, clock)` which emits
  `meanElapsedMs`, `meanBankSpentMs`, `remainingBankMs` and
  `projection {status: 'no_samples'\|'no_observed_drain'\|'estimated',
  turnsCovered}`. Terminal turns are excluded; the comment at `clockPressure.ts:4`
  is explicit that "Aggregates are independent of move/undo history, which cannot
  reconstruct thinking time." **[I] Presentation/telemetry, not an engine
  primitive — but `turnsCovered` is the one number that should gate search depth
  in a timed hard AI.**

### 5.8 `tools/benchmark-analysis.ts` (49 lines)

**[V]** `npm run analysis:bench` → `node --import tsx tools/benchmark-analysis.ts
docs/analysis-benchmark`. It replays the fixture via `matchPositions()`, picks
revisions **13, 19, 23, 29, 31, 32, 33**, chooses the mover's most-expensive
unit tie-broken by proximity to the nearest enemy (`benchmark-analysis.ts:17-20`),
runs all four layers cold (a fresh `AnalysisService` per call,
`benchmark-analysis.ts:22`), and writes `measurements.json`, `README.md` and
four example payloads for revision 19. **[D]**
`ANALYSIS_TOOLS_PROMPT-2026-09-12.md:188` explains the revision choices:
"13 (bait geometry …), 19 (Tanka as forward spawn anchor beside enemy miners),
23 (Hono killing an anchor that had just been placed), 29 (Hono chain kill),
31–33 (upkeep starvation and idle army)."

### 5.9 Summary: engine primitive vs presentation

| Reusable as engine primitive | Presentation-only |
| --- | --- |
| `WorkBudget`, `simulateSequence`, `turnFor`, `actionReady`, `tacticalKey` | `modelDescription`, `describeEvidence` (string rendering half), `envelope`, `followUp` |
| `economyForecast`, `minerDetail`, `projectedIncome`, `upkeepDue`, `getTotalBoardResources` | `economyHeadlines`, the quadrant `regions` split, `briefing.miners` strings |
| `spawnGeometry`, `blockingSet`, `reach`, `getAllSpawnPositions`, `getSpawnRectangle` | `spawn` section formatting |
| `damageUpperBound`, `evidence`, `singleThreats`, `searchTurn`, `approachTable`, `replyTo` | `threats`/`opportunities` section assembly, `fit`, `diff` |
| `analyzeHomeDefenseEvidence` (20,000-node prover, also the adjudicator) | `checkmate` wrapper's `cornerEntrances`/`cornerRule` prose |
| `exchange`'s before/after vectors; `legalActions`' `eliminates` | `observe`, `rules`, `unitDetails`, `matchups` matrix rendering |
| `mobility`'s `extraReachIfVacated` and free-component sizes | `mobility`'s `singleEntrances` prose, `src/game/analysis.ts` entirely |
| `clockPressure`'s `turnsCovered` projection | the rest of `clockPressure` |

---

## 6. Gaps that matter for hard-AI work

**[I]** unless marked.

1. **n = 1.** One archived game, won by the side whose author then wrote both the
   analysis spec and the strategy guide. The three games Codex won have no move
   data at all. Any "what strong play looks like" prior derived from this tree is
   derived from a single game.
2. **The archived game is on a retired map.** 496-crystal `PRE_CENTRAL_MAP` vs
   the current 504 `UNEQUAL_ROUTES_MAP`, with home 10→8 and pocket 10→16 and
   Sachita mining 4→5. **[V]**
3. **No losing-side telemetry.** The fixture stores committed commands only. It
   does not store what either agent *considered*, what analysis calls it made, how
   long each call took, or the clock. Turn durations are only inferable from
   `entries[].timestamp` deltas. **[V]**
4. **Nothing exercises elimination, home-occupation, home-checkmate, timeout or
   the draw clock.** The 20,000-node home prover in `homeCheckmate.ts` has never
   fired in a recorded real game; the draw clock peaked at 3 of 10. **[V]**
5. **Every benchmark measurement is `bounded`.** No layer ever returns a complete
   search on a crowded position within its default budget. **[V]** A hard AI that
   treats `unknown` as `safe` will lose exactly the way `MCP_TOOL_TAPS.md:49`
   warns.
6. **`searchTurn` is one ply.** There is no minimax, no opponent modelling beyond
   `turnFor` + a single reply objective, and `replyTo` explicitly assumes the
   attacker does not withdraw. Multi-turn planning is the stated wishlist gap
   (`docs/ANALYSIS_TOOLS.md:140-150`). **[D]**
7. **The economy forecast is stay-in-place.** It cannot model the relocation
   treadmill that actually decided turns 13–17 of the archived game (walking
   Mujus onto fresh 4-stacks), and `minerDetail.relocations` scores each miner
   independently with no shared-AP budget. **[V]**
8. **`rooms.sqlite` is empty**, so any "mine the local DB" plan needs either the
   render deploy's DB or a fresh corpus of games played through the MCP. **[V]**
