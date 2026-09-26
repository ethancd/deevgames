# STRATEGOS — a strategic engine for Hard AI, built by model rather than by tournament

## Context: the full circle

Two brute-force habits have run out of road, and the way out of both is the same.

**The engine** searches concrete whole turns to about 3.7 macro-plies, roughly two of its own turns. That is
width-limited, not time-limited: from 1.1M to 9M work units, mean depth only moves from 3.5 to 4.3. It loses to
anything whose payoff lands after ply 4.

**Development** has been searching concrete engine *variants* with thousands of automated games.
- The p3 retune swept 30 weight vectors.
- Stage A/B rankings reversed on held-out openings.
- It shipped `control`.

A week of empiricism bought noise.

**The same fix applies to both:** reason at the level of strategy, with an explicit *model* of the game, and use
concrete search only to check and refute.

- **Inside the engine:** a strategic layer plans in goals 8–12 plies deep. The existing PVS checks each plan's next
  turn tactically, and any refutation becomes a constraint for the next round of planning.
- **In how we build it:** every component is derived from a written theory of Muju. Exact oracles check each
  derivation, and failed cases become constraints on the model. **No weight sweeps and no variant tournaments.**

### Evidence
Wave 1 was 34 games of LLMs against Hard (engine `7aa778cad7ce…`, rules `muju-phasing-4`): Hard won 27, the LLMs 7.
There were 0 engine failures in 840 searches. Details are in
`outputs/muju-llm-opponent-campaign-2026-09-23/wave-1/{DIGEST,engine-evidence}.md`, the reflections, the engine logs
and the production room histories.

**Where Hard fails:**

| # | Failure | Evidence | Root |
|---|---|---|---|
| F1 | Builds no contact before the kill clock | 0 damaging attacks in the last 10 plies of all 6 clock losses. When behind at clock ≥5: 0.27 attacks/turn, against 0.48 when ahead. | `KILL_CLOCK_SOFT_CC` ±200 beyond 2 hand-offs. `DrawPressure` is sign-only. |
| F2 | Reads the current lead, not the projected lead | SO02-B: led 250–246 at clock 2 with income 0–1 against 2–3. Lost 251–254. | Nothing projects mined totals. |
| F3 | Stalls with zero spawn area | OP01-W: 4 passes, bank 17→34. Zero-area turns: 11 in 6 games. | The square-freeing move never enters the candidate set (to be traced). |
| F4 | Rarely promotes, and promotes the wrong units | 76 promotions in 840 turns, mostly speed-0 Poṉ unfreezes. OP02-W: bank 26–47 for 9 turns, 0 promotions. | Mission gating, material valued at cost, `RENT_PV` 422. |
| F5 | Denial intruders without a payoff check | 64% of the 502 Hard units lost stood in an LLM spawn rectangle. Next-ply recapture 13%, against the LLMs' 49%. | Static `Infiltration` +90 / +300. `DisruptPressure` weight 0. |
| F6 | Buys the wrong classes against the enemy army | 0-mining buys: FB01-B 52%, AS01-W 86%. | Mining-only purchase scorer. `ElementCoverage` weight 0. |
| F7 | No-op attacks | 40 of 392 attacks did 0 damage. | Dominated attacks aren't pruned. |
| F8 | Misses slow home-mate threats | SO01-B r21: a 4-ply mate threat against a depth-3 search. | `HomeThreat` doesn't test whether the intruder can be removed. |
| F9 | Income collapses; never relocates | OP02-W: income +21 → ≤4. | Relocation pays beyond the horizon; its weights are 0. |

**Keep:**
- economy against weaker play;
- summon denial (728 LLM summons disrupted);
- taking the clock-saving kill when it is in range;
- correct clock play when ahead;
- finishing mates;
- combined attacks.

---

## Part I — A theory of Muju (the model everything is derived from)

Every constant in STRATEGOS must cite a line of this section. If a value can't be derived from it, it isn't used.

### I.1 Currencies
1. **Mined total.** Every crystal ever mined; never reduced by spending. It decides the kill clock, and it is the
   only currency that counts on the scoreboard. Crystals in the bank are potential, not score.
2. **Actions.** 4 per turn, shared by the whole army. This is the true tempo resource. Every goal is costed in
   actions per turn.
3. **Units.** They turn crystals into mining, space, threat and defence. A unit's worth is what it will mine plus
   what it makes possible or prevents. Its purchase price is not its worth.
4. **Space.** The spawn rectangle, from your corner to your deepest unblocked anchor. It decides where your crystals
   can become units.
5. **Time.** Five clocks run at once:
   - the **kill clock**: 10 kill-free plies;
   - the **build ladder**: buy → arrive → T2 → T3 takes 3 of your own turns;
   - the **heal window**: chip damage lasts one turn;
   - **depletion**: a cell's reserve divided by its miner's mining rate;
   - the **summon exposure**: one full enemy turn before arrival.

### I.2 Public information
Every summon, promotion, bank, upkeep bill and the clock are public.
- Builds and timing pushes are **telegraphed one turn ahead**.
- Recognising the opponent's goal is reliable, and bluffing is impossible.
- Reactive counter-play is strong, which is why summon denial works.

### I.3 Geography (the `Unequal routes` map, 504 crystals)
- **Homes:** each is 6 cells × 8 = 48 crystals (A1–C3 wedge / H8–J10 wedge).
- **Central band:** F4, D5–F5, E6–G6 and E7 at 8 each (64 total).
- **Flank patches:** H2–I3 and B8–C9, 4 cells × 16 each (64 each). **Each patch is equidistant from both homes on
  average**, so taking a flank is a pure tempo race.
- **Barren corridors:** D1–F3 and E8–G10 hold 0 crystals. Units can walk through them and summons can land on them,
  but they mine nothing.
- **Strategic regions:** Home(W), Home(B), Centre, North flank, South flank, and the two corridors. Region control is
  the unit of territorial reasoning.

### I.4 Combat algebra (derived from the catalogue and the element chart)
**One-shot thresholds** (a single hit kills when effective ATK ≥ DEF):

| Best single hit | Effective ATK | Kills in one hit |
|---|---|---|
| Any tier-1 | 3 | DEF ≤ 3 only, so **DEF ≥4 is immune to any single tier-1 hit** (Veḷḷi, Ægirinn, Sach'akuna, Irumbu) |
| Tier-2 (Honō / Gölge with advantage) | 4 | up to DEF 4 |
| Tier-3 (Kagari / Karanlık with advantage) | 5 | up to DEF 5 |

Irumbu (DEF 5) can be one-shot only by Kagari. Killing any higher-defence unit needs coordinated hits inside a
single turn.

**Strike radius** = speed × 3 moves + 1 attack:

| Unit | Radius |
|---|---|
| Kimbunga | 16 |
| Umeme | 13 |
| Kagari, Radi, Karanlık | 10 |
| Hi, Honō, Loş, Gölge | 7 |
| Ægirinn, Irumbu | 7 |
| Sjór, Straumr, Muju, Mallki, Sach'akuna, Veḷḷi | 4 |
| Poṉ (speed 0) | 1 |

Speed gaps create **safe-strike bands**.

**Cleave** is unlimited, so four actions can kill a clump. A clump is a liability, and spreading out is a defence.

**No retaliation:** attacking risks nothing but position.

### I.5 Economy algebra
- **Mining:** `min(mine, reserve)` per turn, passive, at the end of the Act phase. Per unit this is a closed form:
  `min(mine·n, reserve)` over n turns on one cell.
- **Upkeep:** 1 crystal per turn for tier 2, 2 for tier 3, starting after mining on the owner's next turn.
- **Ladder cost:** a tier-3 unit costs 15/16/17 by pair, paid over 3 of your own turns, and adds 2 upkeep per turn
  from the turn after it tiers up.
- **Where the crystals are:**
  - Home cells run dry quickly under a Muju: 8 ÷ 3 ≈ 3 turns.
  - A flank cell under a Sach'akuna yields 16 in 2 turns.
  - So relocation is not optional once home cells run dry.

### I.6 Win conditions and their order
Three things can end a game:
- **Home occupation**, including immediate checkmate when a rescue is impossible. It is pre-empted by the clock at
  c ≥ 9.
- **Elimination.**
- **The kill clock** (10 kill-free plies; the higher mined total wins).

The opening is asymmetric: **White moves first, and Black's handicap counts toward its mined total.** In the first
10 plies, White must either out-mine the handicap or make contact.

### I.7 The resolution principle
**A game is decided by whichever win condition resolves first.** Each position therefore has three *verdict
channels*: Home, Clock and Attrition. Each channel has an estimated time to resolve (ETA), a sign, and a certainty:
proven, bounded, or projected.

Strategy means steering which channel resolves first, and its sign. This principle replaces weighted evaluation at
the strategic level (Part III.5).

---

## Part II — Architecture: eight layers

```
L8 CHRONICLE    plan logs, refutations, reasons         (telemetry, explanation)
L7 AFTER-ACTION refutation→constraint, plan memory      (CEGAR loop, commitment, hysteresis)
L6 FIELD        tactical realisation                     (existing PVS + candidate families + veto rule)
L5 WAR ROOM     adversarial plan search                  (scripted rollouts, 8–12 plies, maximin)
L4 CAMPAIGNS    goals, HTN methods, unit/resource assignment
L3 POSTURE      one strategic stance per side            (Boom/Tech/Pressure/Timing/Hold/Contain/Race)
L2 READING      situation, channels, opponent goal recognition
L1 ALMANAC      exact/bounded feasibility calculus       (oracle-tested; reuses src/ai/hard/tables)
L0 REPLICA      packed rules (existing, perft/fuzz-verified)
```

Module home: `src/ai/hard/strategy/{almanac,reading,posture,goals,compose,warroom,field,afteraction,chronicle}/`.
The engine profile is `hard@strategos`; `hard@desktop` stays unchanged until release. Work goes in a fresh worktree
off **`origin/master`**. Local `master` is stale and lacks PR #35.

### L1 — ALMANAC: the feasibility calculus
Each entry is exact, or a sound bound, and has an oracle.

| Table | Meaning | Built on | Oracle |
|---|---|---|---|
| `reachTime[side][sq]` | Earliest own turn at which *some* unit of `side` can strike `sq`. Covers live units, pending arrivals, affordable summons (rectangle-aware) and ladder promotions. | `tables/threat.ts`, `tables/approach.ts`, `core/spawn.ts`, `core/movement.ts` | Brute-force replay on small boards; a bound, so never late |
| `occupyTime[side][sq]` | Earliest turn `side` can *stand* on `sq` | same | same |
| `ledger[side]` | Crystals-by-turn schedule and mined-total bounds L/U over n turns. L = stay-put closed form; U = best reachable cells by BFS; includes arrivals and rent | `tables/economy.ts`, `core/income.ts` | `tables/phasing-economy.ts` lifecycle simulation (exact where both are defined); L ≤ realised ≤ U over playouts |
| `killETA[a→b]` | Lower bound on plies until side a can kill any unit of b (multi-turn kill DP) | `tables/kill.ts` (already optimistic-sound, `suboptimal === 0`) | `lab/hard-ai/oracles/kill.ts` extended to multiple turns |
| `harvest[side]` | Most material the enemy can kill next turn (4 shared actions, Cleave): a knapsack over kill plans | `tables/kill.ts` `cleaveChain` | `bruteForceKill` extended to multiple targets |
| `ladder(class, pocket, t0)` | Buy, arrive, T2, T3 turns; crystals by turn; rent by turn; exposure windows | catalogue + ledger | direct simulation |
| `safeBand[u→target]` | Squares from which u strikes target and no enemy strikes u first | reachTime + strike radius | brute force |
| `pocketSafe(P, T)` | enemy `occupyTime` and `reachTime` over P exceed T, and the supporting anchors survive to T | above | brute force |
| `removable(intruder, T)` | Can we gather the damage to kill it within T turns (multi-turn kill DP with all own units)? | `tables/kill.ts`, `tactics/prover.ts` | brute force on authored cases |
| `homeRace[side]` | Plies to an unanswerable occupation, against rescue capacity | `tables/home.ts`, `tactics/prover.ts`, `tactics/dfpn.ts` | existing prover oracles |
| `clockVerdict` | If both killETAs exceed the remaining plies: exact verdict from L/U, else bounded | ledger + killETA | brute force on small endgames |
| `unitValue[u]` | Mining PV over the reachable reserve + the thresholds it crosses against the current enemy roster (I.4). Horizon = ETA of the first channel to resolve (I.7) | ledger, I.4 | consistency: value is monotone in the reserve it can reach and in the thresholds it crosses |

### L2 — READING: situation assessment
- **Channels.** For each channel (I.7) compute ETA, sign and certainty from L1. This yields the **phase**:
  - Opening: ply < 10.
  - Economic: every channel's ETA > 6 plies.
  - Contact: a killETA ≤ 2 plies.
  - Clock endgame: clock ≥ 5 with a projected clock verdict.
  - Home crisis: `homeRace` ≤ 4 plies for either side.
- **Opponent goal recognition by inverse planning.**
  - For every goal instance in the opponent's vocabulary, measure how much its progress (L4) advanced over their
    last 1–3 turns.
  - Weight that by how closely their actions match what the goal's script would have produced.
  - Public commitments (summons, promotions, bank) are strong evidence: a summon plus a promotion announces a `Build`.
  - Output a small set of recognised goals, each with a *support count*. This is not a probability, so there is no
    tuning.
- **Opponent posture** is inferred from the recognised goals.

### L3 — POSTURE: the strategic stance
| Posture | Stance | SC2 analogue | Beats | Loses to |
|---|---|---|---|---|
| **Boom** | mining lead, expand, drones | greedy macro | Turtle, slow Tech | Pressure, Timing |
| **Tech** | ladder units to thresholds (I.4) | tech rush | Pressure made of tier-1 swarms | Boom that out-mines it; `PunishTech` |
| **Pressure** | continuous contact, trades, denial | constant harassment | Boom, Tech | Turtle/WallOff, Blockade |
| **Timing** | bank → power spike on turn T → strike or race | timing attack / all-in | Boom caught mid-greed | a Hold posture ready for it (it is telegraphed, I.2) |
| **Hold** | protect a clock lead, avoid contact | turtle / defend and win on points | Pressure after a lead | ForceContact planned early |
| **Contain** | keep enemy anchors shallow, punish anything that leaves | contain / siege | Boom | Timing breakouts, Race |
| **Race** | home-corner race | base trade | Contain, Turtle without a rescue | WallOff + RemoveIntruder |

Posture is chosen in L5 as the outer loop. It sets which goal families get search budget and which campaign
templates (L4) apply.

### L4 — CAMPAIGNS: goals, hierarchy and assignment

**The hierarchy:**

**Posture → Campaign (HTN method) → Goal (option) → Task (per-turn intent) → Action**

**Goal contract** (`strategy/goals/goal.ts`):
```ts
interface Goal {
  kind: GoalKind; params: GoalParams; family: Family;
  feasible(a: Almanac): Feasibility;        // ok, earliestTurn, schedule (crystals/actions/units by turn), windows
  script(a: Almanac, s: PlanState): Task[]; // deterministic per-turn intent: move u→q, attack, buy c@q, promote u
  progress(a: Almanac): number;             // lower bound, in own turns, to completion; 0 = done
  status(a: Almanac): 'active'|'done'|'broken';
  windows: Interference[];                  // when/how the enemy can break it (from reachTime/occupyTime/killETA)
  counters: GoalKind[];                     // goals that answer it (for L2 recognition & L5 opponent set)
  effect: ChannelEffect;                    // which verdict channel it moves, and in which direction
}
```

**Campaign** = one or more goals together with an **assignment**:
- which units serve which goal (a unit serves at most one goal per turn);
- how many of the turn's 4 actions each goal gets;
- the crystals-by-turn schedule, which must fit `ledger`.

This is solved by exact branch-and-bound: at most about 15 units and 4 goals. Goals are ordered by **urgency**, the
time until their window closes. If the assignment has no solution, the campaign is infeasible.

**Reflexes** run under every script: take a free kill (exchange value > 0), take mate, evade `harvest` unless the
goal needs the exposure, and never make a dominated attack (F7).

### L5 — WAR ROOM: adversarial plan search
1. **My candidate campaigns.** Instantiate each posture's templates (Part III.3) and the counters to the opponent's
   recognised goals. Prune them by `feasible`. Keep ≤ 8.
2. **Opponent responses.** For each of my campaigns, the opponent's set is: their recognised goals continued, plus
   the counters to my campaign (from `Goal.counters`), plus `Hold`/`ForceContact` according to the clock. Keep ≤ 6.
3. **Rollout.** Both sides execute their scripts and reflexes on the packed replica for 8–12 plies. The rollout stops
   at the first channel resolution, the end of the clock, or goal completion + 2. It is deterministic, has no
   branching, and costs roughly linear in plies.
4. **Value.** Compare end states with the **channel order** (III.5), which needs no weights.
5. **Choice.** Maximin over the opponent's responses, with ties going to the better average. The result is the
   chosen campaign with its *expected refutations*: the responses that came closest to breaking it.
6. **Reuse.** Rollouts are cached across iterations and turns by (campaign, response, root key).

Budget: about 10–15% of the turn. It is fixed-work in lab mode, so it is deterministic.

### L6 — FIELD: tactical realisation (Codex's move groups, generalised)
- **Candidate families.** The existing turn generator (`gen/generate.ts`) receives families, each with a small
  initial allowance:
  - Tactical/forced: the existing injections (kill, home entry, rescue, race).
  - Plan: the chosen campaign's scripted turn, plus local variations from a within-turn action search restricted to
    the assigned units and target squares.
  - Counter: the refutations L5 expects.
  - Safety: retreats out of `harvest`.
  - Economy: the best Prepare completions.
- **Progressive widening per family** as the work budget allows. Record which families lose candidates to width
  (`GenStats`) so crowding is visible.
- **Rule: strategy proposes, tactics vetoes.** The strategic layer owns positional judgement, because its horizon is
  12 plies and the eval's is 4.
  - At the root, play the best **plan-consistent** candidate unless it is *tactically refuted*.
  - It is tactically refuted when its PV loses material, allows a proven terminal, or flips a bounded channel,
    compared with the tactical best.
  - This is a factual test on counts and proofs, not an eval margin, so it needs no weight.
- **Ordering.** Plan progress orders moves (`search/order.ts`). Existing truncation safeguards hold: selectively
  incomplete nodes never store exact TT bounds (`search/pvs.ts`).

### L7 — AFTER-ACTION: refutation and memory (the CEGAR loop)
- **When a veto fires**, take the refuting opponent turn from the PV and classify it:
  - *wrong Almanac number*: for example, the pocket was reachable earlier;
  - *uncovered counter-goal*;
  - *tactical-only*.
- **Turn it into a constraint** in plan memory and re-plan, at most twice per turn:
  `forbid(pocket P until t+k)`, `unit u threatened`, or `add opponent goal G`.
- **Plan memory** persists across turns:
  - the current campaign and its commitments (pending builds, ladder stage);
  - recognised opponent goals with their support;
  - constraints with an expiry.
- **Commitment and hysteresis.** Keep the campaign until it is `broken`, becomes infeasible, or a channel verdict
  changes. Never switch on a small value change, so the engine doesn't change its mind every turn.

### L8 — CHRONICLE: explanation
Every search logs:
- the posture, campaign and goals, with feasibility numbers;
- the rollout table (campaign × response → channel outcome);
- vetoes and their refutations;
- `scoreCc`, the PV and the families' candidate counts.

Add these to `tools/engine-seat/runner.ts`, together with the kill clock and mined totals. From this, any loss can
be traced to one wrong number, one missing goal or one wrong counter.

---

## Part III — The goal catalogue (complete)

Columns:
- **Feasible when**: an L1 test.
- **Script**: the per-turn intent.
- **Progress**: turns to completion.
- **Broken by**: its counters.
- Evidence where it exists.

### III.1 Economy
| Goal | Intent (SC2) | Feasible when | Script / progress | Broken by | Evidence |
|---|---|---|---|---|---|
| `Expand(patch)` | take a base | `occupyTime[me][anchor sq]` < enemy's, and the pocket is safe on arrival | walk or summon an anchor onto the patch edge, then summon miners into the widened rectangle / turns to anchor + first miner | `Contain`, `Deny`, `AnchorSnipe` | LLM "outpost" play |
| `Relocate(miner, cell)` | transfer workers | the source runs dry within 2 turns (I.5) and the target is safe for n turns with a PV gain > 0 | path, then mine / turns to arrive | `Raid`, `ZoneControl` | F9, OP02-W |
| `Drone(n)` | build workers | enemy killETA against the spawn squares > arrival + payback turns | buy Muju/Poṉ on the best reserve squares / crystals left to spend | `Pressure`, `Raid` | Hard vs Luna/Sonnet |
| `TechEconomy(u)` | upgrade mining | the plant's reachable reserve ≥ Δmine × payback turns + rent PV at the channel horizon | promote the plant or metal / 0–2 turns | `PunishTech`, `Raid` | LLMs: 37 plant promotions, Hard: 1 |
| `StripMine(cells)` | mine out the contested base | the cells are contested (both reachTimes close) | put the highest-mining unit on them first / reserve left | `ZoneControl` | new |
| `SquatCell(cell)` | deny their mining | an enemy rich cell with our occupyTime ≤ theirs, and the squatter safe | occupy it / turns to arrive | `Strike` on the squatter | new |
| `SpendDown` | keep money low | bank > the next scheduled commitment + rent reserve | convert the surplus with the best-value buy or promote (unitValue) | — | median 8 idle crystals |
| `Bank(T)` | save for a timing | a `PowerSpike(T)` is scheduled | withhold exactly the schedule's amount | `Pressure` before T | the legitimate hoard |

### III.2 Production and tech
| Goal | Intent | Feasible when | Script / progress | Broken by | Evidence |
|---|---|---|---|---|---|
| `Build(class, tier, pocket, T)` | tech path | `ladder` fits the ledger, `pocketSafe(P, T)` holds, and the rectangle survives | buy → arrive → promote → promote / ladder stage | `PunishTech`, `Deny`, `AnchorSnipe` | the Kimbunga example; Fable's 13 promotions |
| `PowerSpike(T, objective)` | timing attack | Σ scheduled arrivals and promotions give `killETA` ≤ 0 on T for the objective | sync the arrival and promotion schedule / turns to T | `Hold`, `Spread`, pre-emptive `Strike` | Opus's economic games |
| `CounterComposition(profile)` | counter the opponent's units | a class exists whose one-shot or survive thresholds (I.4) beat the enemy roster's DEF/ATK distribution | bias buys to that class / fraction of roster fitted | their `CounterComposition` | F6: lightning against water |
| `Cannon(q)` | photon cannon | q guards an anchor or reserve inside the enemy's strike radius, and a Poṉ there mines | buy Poṉ at q / 1 turn | a tier-2+ `Strike` | Hard's Poṉ habit, made deliberate |
| `SafeSummon` | build out of reach | a summon square's enemy occupyTime > 1 | choose buy squares outside the enemy's 1-turn occupy set / — | `Deny` via rectangle break | 172 Hard summons disrupted |
| `Reinforce(front)` | rally production | a forward anchor gives spawn squares near the front | summon there / 1 turn | `AnchorSnipe` | |

### III.3 Territory
| Goal | Intent | Feasible when | Script / progress | Broken by | Evidence |
|---|---|---|---|---|---|
| `DeepAnchor(region)` | push creep or pylons forward | the anchor can reach the region and survive `harvest` | advance the anchor unit / rectangle area gained | `AnchorSnipe`, `Blockade` | |
| `ProtectAnchor(u)` | guard the pylon | u is the sole supporter of pending summons or of ≥k spawn squares | screen or pair defenders near u, or add a second anchor / exposure count | `AnchorSnipe` | OP02-W: one anchor kill cancelled 8 summons |
| `AnchorRedundancy` | two power sources | two independent anchors cover the spawn plan | place or move the second anchor / coverage overlap | `Contain` | new |
| `Unblock` | keep a production slot free | spawn area = 0 and bank ≥ 3 | move the cheapest mobile unit to free an in-rectangle square / area > 0 | — | **F3**, OP01-W |
| `ProxyRectangle` | proxy barracks | an anchor deep in enemy territory survives one turn | advance the anchor, then summon next to the enemy home / area near their home | `RemoveIntruder` | new |
| `ContestCentre` | fight for map control | our centre reachTime ≤ theirs | occupy or cover F4–E7 / region control | `Contain` | |
| `ZoneControl(region)` | map presence | our strike coverage of the region ≥ theirs | position strikers so every enemy miner there is in reach / covered cells | `Strike`, `CleaveSetup` | |
| `Contain(enemy)` | contain or siege | we can cover their rectangle's exits | hold the line, punish every exit / enemy anchor depth | `Timing`, `Race` | new |
| `KeepLane` | don't wall yourself in | our own units don't seal a movement lane out of home | avoid self-sealing formations / lane count | — | F3's cause |

### III.4 Disruption and harassment
| Goal | Intent | Feasible when | Script / progress | Broken by | Evidence |
|---|---|---|---|---|---|
| `Deny(summon or rectangle)` | block the opponent's buildings | value of the arrivals cancelled > the intruder's value × P(harvest), both **exact**: the arrival test, and `harvest` | step into the square or rectangle before arrival / summons cancelled | `ProtectAnchor`, `Strike` | Hard's strength; F5's missing payoff check |
| `AnchorSnipe(anchor)` | snipe the pylon | killETA ≤ 1 against the sole supporter | kill it / 1 turn | `ProtectAnchor`, `AnchorRedundancy` | OP02-W r17/r20 |
| `Blockade(sq)` | a unit they can't dislodge | our intruder's DEF exceeds their best one-turn combined damage (I.4, `removable`) | park a DEF-4+ unit in their rectangle / turns held | `RemoveIntruder` with tier-2+ | FB01-B water_3 |
| `Raid(miner)` | worker harass | a fast unit (Radi/Umeme) has a safe band on the miner | runby, kill, exit / killETA | `DefensivePairs`, `Spread` | FB01-B r39/50/53 |
| `UpkeepSqueeze` | hit their supply | the enemy's rent > their mining after a raid (exact from ledger) | raid their income sources in sequence / turns to forced release | `Relocate`, `SpendDown` | new; upkeep is public |
| `PunishTech(u)` | snipe tech mid-build | u is mid-ladder with a weak threshold (Umeme DEF 1) and killETA ≤ ladder completion | strike before the next promotion / killETA | `ProtectAnchor`, `SafeSummon` | new |

### III.5 Engagement
| Goal | Intent | Feasible when | Script / progress | Broken by | Evidence |
|---|---|---|---|---|---|
| `Strike(target, T)` | engage | killETA against target ≤ T with an exchange value > 0 | assemble the kill set, then kill / killETA | `Spread`, `Retreat` | |
| `FocusFire(target)` | focus fire | Σ hits ≥ DEF inside one turn (heal window) | order the hits within one turn / damage left | a second attacker is blocked | Hard's lethal pairs |
| `CleaveSetup(clump)` | splash | one attacker's chain one-shots ≥2 adjacent targets | move the attacker adjacent to the chain start / chain length | `Spread` | |
| `Spread` | split against banelings | an enemy `cleaveChain` ≥ 2 exists on our units | break adjacency / max chain against us | — | new |
| `SafeStrikeBand(u, target)` | kite / outrange | `safeBand` is non-empty | hold in the band; threaten each turn / 0 while held | their faster unit, `Screen` | Kimbunga v Kagari |
| `FavourableTrade` | good engagement | the exact exchange sequence has value > 0 | execute / 1 turn | — | LU04-W r11 |
| `DefensivePairs` | worker defence | element-bonus miners can finish raiders | keep miners paired by element / uncovered raiders | `Strike` with tier-2+ | OP02-W r101/r119 |
| `Screen(asset)` | body-block | a blocker can take every lane an enemy path needs (movement can't pass units) | place blockers / open lanes | `CleaveSetup` on the screen | new |
| `DefendedBait` | a trap | the bait's recapture is proven by exchange value | offer the bait / 1 turn | a declined bait | LU04 matched test |
| `Retreat/Regroup` | pull back | the unit is in `harvest` without goal need | move to the safe band or behind a screen / exposure | — | F5 |

### III.6 Defence
| Goal | Intent | Feasible when | Script / progress | Broken by | Evidence |
|---|---|---|---|---|---|
| `WallOff` / `CornerSeal` | wall-off | the corner's 2 neighbours can be held by units whose DEF beats the enemy's one-turn damage | fill or keep the plugs / open lanes | `CleaveSetup`, a tier-3 `Strike` | Hard's A1–C4 block |
| `RemoveIntruder(u)` | clear the proxy | `removable(u, T)`, with T before their mate ETA | gather the kill set across turns / Σ damage available | `Screen`, their promotion | **F8**, SO01-B |
| `Garrison(home)` | base defence | home rescue capacity ≥ the enemy's `homeRace` | keep rescuers within rescue reach / rescue margin | `Timing` | |
| `Rescue` | save the base | an enemy occupies the corner | existing prover `homeWitness` / 1 turn | — | existing |
| `Evacuate(asset)` | save the army | a valuable unit is inside `harvest` | move it out / exposure | — | |

### III.7 Win conditions and the kill clock
| Goal | Intent | Feasible when | Script / progress | Broken by | Evidence |
|---|---|---|---|---|---|
| `Hold(lead)` / `DontReset` | turtle on points | projected clock verdict favours us and their killETA > the remaining plies (or is kept so by `Retreat`/`Spread`/`Screen`) | stay out of reach; decline kills unless they decide a channel / plies remaining | `ForceContact` | AS01-W r9; Hard's final-ply passes |
| `ForceContact(before clock-out)` | make contact | we are projected to lose the clock and our killETA ≤ the remaining plies | shrink killETA every turn; accept equal trades / killETA − plies left | `Hold`, `Spread`, `Screen` | **F1**, 6 of the 7 losses |
| `OpeningArithmetic` | opening accounting | ply < 10: can White's projected mined total beat Black's total plus handicap by ply 10? | if not, schedule contact by ply 9 (as White); as Black, `Hold` from ply 0 | the opponent's contact | 5 of 17 LLM-White early clock losses |
| `Juggernaut(u)` | unkillable push | u's DEF exceeds the enemy's best combined damage on its path and on the corner (I.4) | walk to the home corner / moves to go | `RemoveIntruder`, `WallOff` | SO01-B |
| `Race/BaseTrade` | base race | our homeRace < theirs, with rescue accounted for | race / race margin | `WallOff`, `Garrison` | |
| `FortifyMate` | seal the win | we occupy their corner and a promotion makes the rescue impossible | existing FORTIFY missions / 1 turn | — | existing `gen/promote.ts` |
| `Eliminate` | finish them | the enemy army is small and all of it is killable across turns | hunt / units left | `Evacuate`, `Spread` | Hard's finishing |
| `Strangle` | economic kill | ledger shows their income can't pay any meaningful army before the clock | `Contain` + `Raid` + `UpkeepSqueeze`, then `Hold` | `Timing` breakout | FB01-B, OP02-B |

### III.8 Campaign templates (HTN methods)
| Campaign | Posture | Composition |
|---|---|---|
| **Clock Heist** | Boom → Hold | Drone + Expand(flank) + Relocate → once projected ahead, Hold/DontReset. *This is what beat Hard; Hard should play it too.* |
| **Tech Hunt** | Tech | Build(lightning, 3, pocket) → SafeStrikeBand(target) → Strike |
| **Juggernaut Push** | Tech → Race | Build(water/metal, 3) → Blockade → Juggernaut, with Screen |
| **Strangle** | Contain | Contain + Raid + UpkeepSqueeze → Hold |
| **Denial Wall** | Pressure | Deny (with payoff) + ProtectAnchor + SpendDown. *Hard's current style, made accountable.* |
| **Timing Push** | Timing | Bank(T) → PowerSpike(T) → Strike or Race |
| **Double Expand** | Boom | Expand(north) + Expand(south) + TechEconomy + AnchorRedundancy |
| **Proxy** | Pressure/Race | ProxyRectangle → Reinforce(front) → Race |
| **Fortress** | Hold | WallOff + Cannon + DefensivePairs + SpendDown |

### III.9 Counter map (drives L2 recognition and L5 opponent sets)
| Their goal | Our counters |
|---|---|
| Build | PunishTech, Deny, AnchorSnipe |
| Juggernaut | RemoveIntruder, WallOff, Screen |
| Hold | ForceContact (planned by clock ≤ 4) |
| Raid | DefensivePairs, Spread, Screen |
| Deny | ProtectAnchor, AnchorRedundancy, SafeSummon |
| Expand | Contain, StripMine, AnchorSnipe |
| Contain | Timing, Race, ProxyRectangle |
| PowerSpike | Spread, Hold, pre-emptive Strike |
| Blockade | RemoveIntruder with tier-2+ |
| ForceContact | Hold, Spread, Screen, Retreat |
| Race | WallOff, Garrison, RemoveIntruder |

### III.10 The channel order: comparing end states without weights
Each state yields the three channels (I.7), each with ETA, sign, certainty and margin. The margin's unit is the
channel's own: plies for Home, crystals of mined total for Clock, units for Attrition.

Compare two states in this order:
1. **Proven** channel results, earliest ETA first.
2. **Bounded** results, earliest ETA first.
3. The **projected** channel that resolves first; compare margins within that channel.
4. **Potential:** the mined-total projection to that ETA, plus Σ `unitValue`, in crystals.

The only horizon is the ETA itself, which the game supplies.

---

## Part IV — Cheap exact fixes first
These don't depend on STRATEGOS and are worth shipping first.
1. **Telemetry.** Log `scoreCc`, PV, candidates, and clock and mined totals per turn (`tools/engine-seat/runner.ts`).
2. **Trace F3.** Run `gen/trace.ts` on OP01-W r5 to find where the square-freeing move is lost.
3. **Dominated attacks.** Prune 0-damage attacks in `gen/actionsearch.ts`. Proof: the end-position set is unchanged
   except for dominated lines (`lab/hard-ai/oracles/canonical-check.ts`).
4. **Exact kill-clock terminals.** When `clockVerdict` is proven (both killETAs exceed the remaining plies), return the
   exact terminal score. Replace `KILL_CLOCK_SOFT_CC` and `DrawPressure` with channel-derived values
   (`eval/evaluate.ts`, `eval/features.ts`).
5. **Exhaustive Prepare.** Replace mission gating in `gen/promote.ts` / `gen/generate.ts expand` with every legal
   promotion and pair. Score each Act line by its best Prepare completion. Proof: recall is 100%
   (`lab/hard-ai/recall/run.ts`).

## Part V — Efficiency (buying the WAR ROOM's budget)
- **Profile** by `WorkClass`.
- **Closed-form economy.** Replace the stage-2 lifecycle forecast (`tables/phasing-economy.ts`, make/unmake over 6
  turns plus prover calls per leaf) with the ALMANAC's closed-form `ledger`. Prove it equal to the lifecycle
  simulation wherever both are defined.
- **Share the ALMANAC.** Its tables are built once per root and reused by L2–L6.
- **Re-enable lazy eval** with proven margins.
- **Measure** with fixed-work, same-position benchmarks: nodes/s, time-to-depth, rollouts/s.

## Part VI — Methodology: proof by model, not by tournament
1. **Oracle-checked calculus.** Every ALMANAC table has an exact oracle or a soundness oracle, with 0 violations on
   the corpus (`lab/hard-ai/positions/*`) and on authored boards.
2. **Goal contracts.** Each goal has authored positions that check:
   - (a) `feasible` is true and the script completes in exactly the predicted turns against a passive opponent;
   - (b) against its listed counter's script, the goal breaks when L1 says the window is open and survives when it
     is closed.

   Together these test that the model agrees with the simulation. None of it is statistical.
3. **Recognition tests.** From scripted opponent histories, L2 recovers the goal being played.
4. **Worked examples as specs.** Each is written in `docs/hard-ai/strategos/` with the expected posture, campaign
   and move-level predicate:
   - Kimbunga vs Kagari;
   - AS01-W r5 (`ForceContact`);
   - OP01-W r5 (`Unblock`);
   - SO01-B r21 (`RemoveIntruder`/`WallOff`);
   - OP02-W r18 (`SpendDown`/`TechEconomy`);
   - SO02-B r92 (`ForceContact` from a projected loss);
   - FB01-B (`CounterComposition` against water_3);
   - the opening `OpeningArithmetic` for both seats.
5. **Wave-1 exam set.** Rebuild positions from room histories (`lab/hard-ai/analyze/replay.ts`) as
   `muju-exam-case-v1` cases (`lab/hard-ai/exam/`). Include plan-level and move-level predicates. Keep a dev split,
   and a held-out split scored **once**.
6. **Refutation-driven development**, which mirrors L7. Every failing case is classified as one of: wrong Almanac
   number, missing goal, wrong counter, wrong channel logic, or a tactical miss. The fix goes into the *model*, and
   the case becomes a permanent test.
7. **Rules for constants.** No parameter sweeps and no variant tournaments. Every constant carries a comment citing
   its derivation in Part I.
8. **Veto gates.** Gate 0 correctness (perft, differential fuzz, determinism, replica parity), and the existing
   suites at fixed work with no regression.
9. **One confirmation, not calibration.** Play LLM wave 2, starting with Opus's economic-win openings, plus one
   preregistered row under the existing Gate 2 protocol. The A6 constraint stands: no claim that Hard beats
   AIEngineV2 until the sealed row exists.
10. **Release.** Walk `python3 tools/muju-content-dag.py plan --kind ai` and add a change record in
    `muju/docs/changes/`.

## Part VII — Delivery (each step is one PR with its oracles and contracts)
| Step | Content |
|---|---|
| S0 | Part IV fixes 1–5, and the wave-1 exam set (the dev split) |
| S1 | ALMANAC (every L1 table) with oracles; closed-form economy swapped into the eval (Part V) |
| S2 | Goal framework, READING channels and phase, and the first wave of goals: ForceContact, Hold/DontReset, OpeningArithmetic, Unblock, Relocate, SpendDown, Build, CounterComposition, Deny (with payoff), ProtectAnchor, RemoveIntruder, Juggernaut, WallOff |
| S3 | WAR ROOM: rollouts, channel order, maximin, rollout cache |
| S4 | FIELD families, progressive widening, and the strategy-proposes/tactics-vetoes rule; AFTER-ACTION CEGAR loop and plan memory; CHRONICLE |
| S5 | The remaining goals (all of Part III), opponent recognition, campaign templates, postures |
| S6 | Efficiency pass; `hard@strategos` measured once (Part VI.9); release DAG; switch the default profile |

## Risks
- **Coverage.** The planner can't see anything outside the goal vocabulary. The tactical search still sees it and
  the veto rule keeps play legal and sound, so a missing goal costs strength, not correctness. The CHRONICLE shows
  which goal was missing.
- **Rollout scripts are simple.** They are deliberately greedy. Maximin over counters, plus the CEGAR loop,
  compensates for scripts that are optimistic.
- **Budget.** At short allowances (≤10 s), the WAR ROOM shrinks to posture + 2 campaigns, and the ALMANAC is shared
  with the eval.
