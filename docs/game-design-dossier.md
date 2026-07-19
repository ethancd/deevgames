# DeevGames — Game Design Dossier

*A synthesis of every game designed or built across two bodies of work — this repo and prior Ethan × Claude conversations — compiled to inform the design of the next game. Repo sources: specs, balance analyses, git history, the napkins (`.claude/napkin.md` and per-project napkins), and the project skills in `.claude/skills/`. Conversation sources are noted by date so they can be retrieved.*

*Updated 2026-07-19 after the repo consolidation: master now contains every game — the wave-2 projects (Might & Magic: Spire, Lution, Mythgarden, Leyline Garden, Rock Stars) are profiled alongside the originals, and the muju balance lab's findings are folded in.*

---

## 1. Portfolio at a Glance

### Repo projects — wave 1

| Project | Genre | Status | Signature idea |
|---|---|---|---|
| **Ninja Tanks** (2013, Rails/jQuery) | 2p simultaneous-action bluffing duel | Shipped at deevgames.com | Decoy/feint fog-of-war: your move and your bluff look identical to the opponent |
| **Blind Loyalty** / **Hex Strike** | Designed board games | Never implemented | Unknown — designs predate the repo's docs |
| **FORGE** (React/TS) | 2p card drafting/auction on an expanding grid | Playable hot-seat; no AI, no online | Counter-bid auction where the outbid player keeps their turn |
| **Muju Hono Tanka** (React/TS) | 2p Go × Chess × StarCraft on a 10×10 grid | Full rules + imperfect-info AI + **balance lab** | Three-phase turns (place → act → queue) + spawn-denial territory |
| **Oracle of Delve** (React/TS) | Mobile-first roguelike dungeon crawler | V0 combat prototype + Playwright e2e harness | Layout-invariance testing methodology |

### Repo projects — wave 2 (consolidated onto master 2026-07-18)

| Project | Genre | Status | Signature idea |
|---|---|---|---|
| **Might & Magic: Spire** | HoMM3-style roguelite ("one hero, no town") | Playable PWA: 3 factions, 3 acts, full combat + economy | Your army of creature stacks **is** your life bar |
| **Lution** | Self-expanding card game vs a live Claude opponent | Playable (local dev server); real matches on record | The deck grows itself: both players design a new card each round, and Claude **codes** them into the game |
| **Mythgarden** (Django + React) | Time-loop farming-sim RPG ("Stardew × Groundhog Day") | **Deployed** at mythgarden.ashkie.com (Fly.io) | Multiplicative score (koin × hearts) + loss-compensating luck |
| **Leyline Garden** (Phaser 3) | Cozy idle/automation — magical plants + delivery networks | Core loop complete, ~225 tests; polish items open | Carry-one-thing fairy + leyline mote-routing over a two-layer iso world |
| **Rock Stars** (geology-quiz) | Kids' flash-card/quiz app (geology + periodic table) | Working, shippable | Closed sets you can fully master; data-driven decks |

### Conversation projects

| Project | Genre | Status | Signature idea |
|---|---|---|---|
| **LUMENGRID** (Jul 2026) | Laser-routing puzzle, 2 worlds × 10 levels | Shipped as artifact | Bitwise-OR light mixing + machine-verified level solvability |
| **Lumen Works** (Jun 2026) | "Miniature Factorio" of light mixing | Superseded by LUMENGRID | Sandbox mode + multi-input combiner (didn't carry forward) |
| **Hexagon Maze** (Sep 2024) | Honeycomb sequence puzzle | Small component | Axial-coordinate hex rendering; origin of the "code me a puzzle" pattern |
| **Halflight** (Jul 2026) | Moonlighter-style delve-and-shop with decaying inventory | Fully art-directed; **standing request for a prototype** | Every gem has a condition-dependent half-life |
| **The Mage Ladder** (Apr 2026) | LLM-as-game-engine research ladder → text-only Mage: the Ascension | Ladder doc with per-rung validation tests | Intent parser → rules validator → paradigm-filtered narration |
| **Palimpsest** (Mar 2026) | Values-alignment game in Homestuck clothing | 4 prototype-ready mechanics scoped | Annotation: an actual LLM misinterpreting you *is* the gameplay |
| **Garden Guardians** (Jan 2026) | 2p co-op cozy deckbuilder for phones | Card list + verbs sketched | Combat-free threat management: nurture / guide / weed |
| **Resonance Roguelike** (Jan 2026) | Rhythm roguelike from Interaction Ritual Chains theory | ~2,500-word spec | Emotional energy as the resource of successful ritual sync |
| **Elemental Magic Chess** (Apr 2025) | Chess + elemental effects | Phased Canvas/Pixi plan | Standard chess underneath; presentation-layer novelty |
| **Dynamic Piece Strength** (Jan 2025) | Mechanic set, no game yet | TS interfaces drafted | Move-recency statuses: exhausted −25% / prepared +15% / rusted / energized |

Three arcs converge. The wave-1 repo arc: a 2013 server-authoritative Rails game with untested jQuery UI → modern client-side React games with pure-function engines, serious AI, and rigorous UI-geometry testing. The conversation arc: single-file artifacts that turned constraints into disciplines (solvability verification, bitmask engines) → ambitious designed-not-built briefs. Wave 2 fuses them: Lution *is* the LLM-native direction shipped; MMS *is* a full roguelite with the balance discipline industrialized; Mythgarden finally shipped a deployed, server-authoritative game; and the whole wave was built with multi-agent orchestration whose lessons are themselves now a reusable asset.

---

## 2. Repo Project Profiles — Wave 1

### 2.1 Ninja Tanks (legacy Rails site)

A two-player, simultaneous-action, hidden-information artillery duel wrapped in a full community site (Devise auth, one-click guest accounts, admin blog, nested comments, PvP matchmaking queue, PvAI).

**Core rules**
- Tanks on a 3-zone track (start at zone 2), 3-card hands; cards have value 1–3 and direction (forward/back).
- Turn phases: Draw → Play → Discard. Drawing more cards than your zone number causes overheating damage; drawing more than a *decoy's* zone shows **fake overheating** to the opponent.
- Each card can be played as **Move**, **Feint**, or **Fire**; two actions in one turn overheats you. Moves resolve before shots (deterministic ordering for simultaneous play).
- **Decoys**: after an arrow play, the opponent sees translucent ghost tanks for both possible positions — real move vs. feint are indistinguishable. Deception threads through every subsystem, including damage tokens that can be fake.
- Position-gated legality: `LEGAL_SHOTS = {1→[3], 2→[2,3], 3→[1,2,3]}` — where you stand determines what you can hit.
- Win at 6+ damage on the opponent's real tank (2 damage per hit; hits on decoys just remove them).

**Architecture lessons**
- Server-authoritative rules engine in Rails models, with a **dry-run validation pass** (`trial_move` on copied "paper tanks") that rejects illegal simultaneous-action combos before mutating state.
- The game's comment thread doubles as **action log + player chat** — cheap, replay-friendly, and narratively flavored ("X moves forward... or do they?").
- Heuristic AI (60% prefer-shot, otherwise random legal action) — pre-search-era; every later project raised this bar.
- Self-admitted gap: the jQuery client had no test coverage. The server logic was tested; the UI was not. (Oracle later inverted and fixed this.)

### 2.2 FORGE (Game 2 of the planned "AZAD MINOR" 4-game series)

Two players build tableaus by bidding astrological symbols (♂♀☿☽, 4 of each to start, **no income — a closed 16-symbol budget**) on cards in an **unbounded, purchase-driven expanding grid**. 82 cards across 6 factions + a neutral General pool; most VP is conditional and evaluated only at game end.

**Signature mechanics**
- **Counter-bid auction**: BUY at cost → opponent may counter at cost+1 → you may final-bid at cost+2. If the original bidder loses the auction, **they keep their turn** — the loser is compensated with tempo. This single rule self-balances the card pool: universally efficient cards get contested into mediocrity (Supply Cache falls from a 2.0 to 0.67 VP/symbol ratio when contested).
- **BURN as the alternative action**: free removal that leaves permanent RUINS blocking adjacency — denial becomes a *spatial* tool, and burn-payoff cards ("+1 per card burned", "+1 per ruins") make it an archetype.
- **Grid expansion**: buying a card flips its face-down neighbors and deals new cards adjacent to them — the market grows organically from where players act. Availability = board geometry, not a static row.
- **Cost composition as protection**: "any"-cost cards are easy for anyone to contest; faction-specific symbol costs are hard to counter-bid, so cost *shape* (not just size) signals contestability.
- **Conditional-VP-as-strings** (19 regex-parsed patterns) + an emojification layer (`★ x 🩸`) — flexible but fragile; a proper enum/DSL is the reuse recommendation.
- **Series hooks**: cards carry inert `game3Effect` combat abilities; the tableau is designed to carry forward as an army into Game 3 *Skirmish*. Games 1 (*Snatch*) and 4 are unbuilt.

**Balance analysis verdict** (docs/BALANCE_ANALYSIS.md, using the strategy-mindset framework): well-balanced, with explicit **triangularity** — High-Efficiency loses to Counter-Bidder loses to Synergy Player loses to High-Efficiency. All archetypes land in a 45–55% win band. Naive "vacuum" ratio analysis was shown to be misleading; contested and synergy-adjusted ratios told the real story.

**Also notable**: a complete **skin architecture** (React context + CSS variables + localStorage + parallel art folders + full card-name remapping) that flips the entire game between "dark cosmic horror" and a kid-friendly cartoon identity without touching mechanics. 66 AI-generated artworks per skin; cost tier drives composition grandeur.

**Gaps**: no AI opponent, no animations, no multiplayer, no series integration. Recent master work was minor UI polish only (card titles wrap at a readable size instead of expanding tiles; modal backdrop-click closes; RUINS cells render diagonal X-lines instead of a text label).

### 2.3 Muju Hono Tanka: Elemental Tactics

The most complete wave-1 project. Two players (white/black) from opposite corners of a 10×10 grid; genre fusion of **Go (territory), Chess (tactics), StarCraft (economy/production)**. Modes: vs AI, pass-and-play, AI-vs-AI.

**The three-phase turn loop** — the cleanest structural idea in the repo:
1. **Place** — deploy finished units into your spawn zone; promote existing units (pay tier-cost difference; no tier-skipping, once per phase, not on placement turn).
2. **Action** — 6 action steps; each step is one move/attack/mine; no per-type caps, no summoning sickness.
3. **Queue** — secretly spend mined resources on units with 1–3 turn build times. The queue is hidden; **mining yields are public**.

**Signature mechanics**
- **Anchor-rectangle spawning with binary enemy-blocking**: your spawn zone spans from your corner to any unit you pick as anchor; *any* enemy unit inside blocks the whole rectangle. Board presence is an economic weapon (spawn denial) — the Go-like territory layer emerges from one rule.
- **The "well/rope" mining model**: every cell has 5 stacked resource layers; a unit's Mining stat is its rope length; cells go "dry" *per unit* once remaining layers are deeper than that unit's reach. Natural tech-gating: only high-mining units can exploit deep resources, giving Expand elements a late-game niche.
- **Damage as defense erosion**: attack ≥ effective defense kills; non-lethal hits reduce effective defense until the defender's next turn starts. Enables combined attacks (chip then kill) with a "convert damage to a kill this turn or it's wasted" tension — simpler than HP pools, tactically rich.
- **Six culturally-themed elements** (Fire/Japanese, Lightning/Swahili, Water/Norse, Shadow/Turkish, Plant/Quechua-Nahuatl, Metal/Lakota) in three archetypes (Rush/Balanced/Expand), 4 tiers each, 24 units total. Current combat chart is the **"double-thick triangle"**: Fire & Lightning → Plant & Metal → Water & Shadow → back. Modifier is ±1 attack only; defense never modified.

**The AI engine** — one of the repo's deepest technical assets:
- Honest imperfect-information play: a **public/private observation split**, a **particle-filter belief model** over the opponent's hidden resources/queue (tractable because mining yields are public, so income is deterministic), **beam-search turn planning** with tactical templates, **re-determinized ISMCTS** search, and a quiescence-style **tactical sharpener** on hot leaf positions.
- Static eval is a ~15-factor weighted sum where **optionality/mobility is a first-class term**, queued units are discounted by `0.9^turnsRemaining`, and spawn-related pressure carries the biggest weights.
- Difficulty scales **search budget, not rules** (100→1200 MCTS iterations). An AI Console exposes candidate plans/scores for debugging; an AI Recap explains the AI's turn to the human.

**The balance lab** (new on master — the largest recent change): a dedicated `muju/lab/` toolchain that industrializes balance work. A headless seeded match runner with invariant checks, Wilson confidence intervals, engine-hash stamping, and replay sampling; a bot ladder (Random → Greedy → archetype bots → AIv2) plus adversarial probe bots (Turtle, Tier1Spam, MiningDenial, AntiRush); experiment configs E1–E7; a rewritten canonical SPEC (rules v1.2); and `JUDGMENT_LOG.md` recording every autonomous ruling with rationale, blast radius, and reversal cost. Headline findings (Phase 3 of 5, 479/479 tests green):
- **Rush is over-nerfed against prepared defense but dominant against greed**: mass-Fire_1 wins only 14.2% vs the AntiRush bot (target band 35–55%) yet 97.2% vs pure-economy Expand — the game is currently "answer-or-die."
- **The element graph is load-bearing**: removing one back-edge (Water/Shadow → Fire/Lightning) collapses AntiRush from 88% to 2–4%. Ruling: keep the double-thick triangle; fix rush via **cost/build-time levers, not stats or the graph** (a global ±1 ATK swings mirrors ~45 points — too coarse an instrument).
- No first-player advantage (48–53%); Lightning is a trap line in mono matchups.
- **The measurement tool found real product bugs**: D13 (same-millisecond ID collisions teleporting units — fixed with regression tests) and D14 (AI belief-determinized plans emit illegal "ghost attacks" that `ai/simulate` applies unvalidated — still open).

Also new: honest hidden-information UI — the opponent's true resources display as "???" while their *visible* spending (placed/promoted units, not the hidden queue) is shown via a `resourcesManifested` counter.

**Open problems**: rush rebalance (via cost/build-time), the D14 ghost-attack bug, victory-condition drift between code and spec, AI_ENGINE_QUESTIONS Q4–Q12.

### 2.4 Oracle of Delve

Mobile-first portrait roguelike: descend ~10 rooms, turn-based elemental combat, draft 1-of-3 gems between rooms, hard/easy path choice gates gem rarity, boss at room 10, 5–10 minute runs. Inspirations: Slay the Spire (draft + paths), Into the Breach (visible turn timeline), Pokémon (elemental weakness/resist), Hades/Downwell (pace/format).

**Designed but unbuilt**: speed-based visible turn timeline with **hidden enemy intent** (you see *when* they act, not *what* they'll do); three attack archetypes (basic / charged / status: Freeze, Burn, Slow); Fire/Ice/Lightning ±50% weakness system; **stat-mod-first → synergy-later gem progression**; path-gated rarity tables (Easy 70/25/5, Hard 40/40/20, Boss 20/40/40); clean scaling formulas.

**Built**: V0 only — one fixed encounter, fixed turn queue, tap-to-attack, win/loss/restart — as a clean immutable pure-function combat engine. Recent master work converted inline styles to Tailwind and added the first **Playwright e2e harness** (a 200-line `combat.spec.ts` pinning the combat screen's full contract: HP displays, attack flow, damage floats, defeat states).

**Its real deliverable is the testing methodology** (LAYOUT_STABILITY_REPORT.md, VISUAL_REGRESSION_TESTING.md, generalized in `.claude/skills/layout-invariance.md`): geometry-first CSS with reserved slots for conditional content; tests asserting on `getBoundingClientRect()` pixels rather than class names, written to fail first; Vitest Browser Mode + Playwright screenshots with committed baselines (jsdom's 0×0 rects pass falsely); explicit overflow policy for every dynamic text region; design for hostile inputs.

---

## 3. Repo Project Profiles — Wave 2

### 3.1 Might & Magic: Spire

A roguelite deckbuilder that "files the serial numbers off HoMM3": *one hero, no town; your army of creature stacks is your life bar; you grow on a node map.* A Slay-the-Spire-style cards/energy prototype was built first and **deliberately retired** mid-project in favor of HoMM3-style army battles — a documented, bold pivot. Target platform: installable offline-first mobile PWA ("Add to Home Screen is the whole distribution story").

**Core loop**: pick a faction hero → climb an upward DAG "Spire" map where **1 node = 1 day** and acts are whole weeks (`ACT_WEEKS=[3,2,1]`) → fight guarded tiles (~45% guarded, portraits match the actual fight) or claim free bonuses → grow via Necromancy, Dwellings, Altars, Shrines, Merchants, and the weekly **Muster** (a multi-buy reinforcement shop on each week's first node — the boss always lands on a Monday, so Muster falls right before every boss) → beat the Act-3 boss. Runs are fully deterministic from a seed.

**Combat spine**: two ranks (front melee / back ranged); shooters hit any rank with no retaliation (strongest profile); flyers reach the back rank but eat retaliation; retaliation is budgeted per round (Griffin 2, Royal Griffin unlimited). Damage uses the HoMM3 A/D curve (+5%/pt attack advantage capped +300%, −2.5%/pt defense capped −70%) against a stack HP pool with kill-chipping. The hero's Attack/Defense add flat to the whole army, so +Attack compounds with stack size. **The enemy intent function drives both the telegraph and the executed action — the telegraph can never lie.**

**The stat trinity** (late redesign): speed → **dodge** (5%/pt, cap 25%, half damage), luck → **crit** (×1.5, same curve), morale → **bonus/frozen actions** — with an elegant **undead neutral-lock** (any "no morale penalty" stack pins the army's morale to 0, so all-undead Necropolis leans on luck instead).

**Growth engine**: Necromancy is the only no-gold compounding growth — `raised = floor(slainHp · pct / 6)`; tuning history is instructive (at the initial 0.10 guess the army *deflated* and win rate was 0%; 0.30 makes a rank-1 hero net-recover). Content scale: 42 creatures, 68 spells, 67 artifacts, 46 heroes, 163 real scraped images, 3 playable factions (Necropolis / Castle / Stronghold) whose dumb-bot win rates land in-band without per-faction tuning. Single constants can be load-bearing: capping boss Bone Dragons at 2 moved greedy-bot win rate **4% → 59%**.

**The balance apparatus** (the project's most distinctive contribution — four documents in evolutionary order):
1. **BALANCE_PROPOSALS.md** — an audit of the original engine tracing every "INERT" verdict through real code (8 of 17 artifacts dead, 9 of 14 abilities pure flavor, Blind "the single most broken spell"), then framing the redesign as a **constraint-satisfaction problem with three nested budget tiers**: LIGHT (additive only, no new subsystem), MEDIUM (one bounded status layer), HEAVY ("effectively a second engine"). It closes with six explicit open questions for the designer.
2. The LIGHT set shipped, plus a BATCH answering the open questions — including the **no-restack rule** (recasting the same stat-mod spell is a no-op; different spells still stack), which closes the buff-stacking exploit with zero new UI.
3. **BREADTH_ANALYSIS.md** — an **S–F ranking of imported content by naive power in the *current* engine** (not how it "should" work), which caught that Castle's imports arrive mostly broken (5 of 7 tier signatures inert) before they shipped, and identified the two cheapest high-leverage activations.
4. **MECHANISMS_AUDIT.md** — an "essentialize" pass giving every mechanism a **dual rating** (gameplay cruciality × thematic cruciality → KEEP / FIX / SIMPLIFY / MERGE / CUT), naming ~12 spine mechanisms and a dead-weight list, and proposing **one high-leverage investment (minimal initiative) that would retroactively justify ~6 already-shipped inert speed mechanics**. (The shipped speed→dodge change is a competing cheaper answer to the same tension — an open design question.)

**Architecture**: pnpm monorepo with a deliberate contract split — `schema` (Zod schemas + canonical fixtures as the keystone contract, built first), `data` (validated scraped content + a REPORT.md that turns silent data loss into flagged gaps), `engine` (headless, pure, seeded, no React — 700-line battle, 1900-line run; tests double as a win-rate-sweep tuning harness), `app` (mobile-first PWA). The app imports its engine only through a contract file, so mock and real engines swap on a flag. Balance philosophy: **every constant is a named lever** — "Ethan vetoes balance by editing the constant, the code reads the constant, tests re-validate."

**Built by multi-agent orchestration**: Phase 0 built the schema + fixtures, then four agents worked in parallel git worktrees (`researcher`, `infra`, `mechanics`, `frontend`) against the shared fixtures, merged through an orchestrator branch. Schema changes routed through the orchestrator; no agent could quietly add a field.

**Unfinished**: no initiative/positions/real AoE geometry (the four AoE nukes still resolve single-target — flagged traps), no spell-school immunity (every Dragon's signature inert), no creature spellcasting, no adventure-map layer; MECHANISMS_AUDIT's dead-weight cuts not yet taken; no live deployment.

### 3.2 Lution

A two-player Fluxx-style card game where **the deck literally grows itself between rounds using a live LLM**. The framing (from STRATEGY.md): *"The card game is the scoreboard. The design round is the game."*

**The loop**: play an inner tableau game to 10 points against Claude → after each inner game, both players **blind-simultaneously design one brand-new card** (the human in the UI; Claude via the Anthropic API) → the new cards are compiled/coded into the running game and become playable next inner game → a keep/steal resolution decides where cards land. Match is first-to-N inner wins. 47 cards currently in the registry across ~8 real played rounds (recorded in NEXT_CARDS.md).

**The "extinction engine"** (keep/steal v3 — the deepest strategic idea in the portfolio):
- The **loser** of the inner game decides: KEEP (each side adds their own design to their own deck — the only guaranteed-survival outcome) or STEAL (a two-pick raid: loser picks first from the winner's design or deck; winner counter-raids the loser's design or deck, minus the just-taken card).
- **Any design not kept or stolen is destroyed.** Picking an existing card *spurns* (destroys) the offered design. Taking a card type *you* created executes it — pure denial. Up to four cards can go extinct in one STEAL round.
- **Registry land-grab**: every effect ever registered — kept, stolen, executed, or spurned — is claimed forever and can never be designed again. Simple effects ("draw 1 card") are premium real estate claimed first; late rounds get baroque because the simple space is settled. If both players design the identical effect, both are voided and destroyed — idiosyncrasy is "collision insurance."
- **No-deixis rule**: card text may not reference creators, rounds, matches, or the real world — enforced mechanically *and* by an LLM semantic judge.
- The strategy guide's own summary: *"Design like a legislator: every law you write will someday be enforced against you."*

**The self-expansion pipeline** (five LLM entry points in `server/claude.ts`):
1. `designCard()` — Messages API (claude-sonnet-5, max_tokens 16000 because adaptive thinking shares the budget) with a prompt containing the full strategy guide, both decks, the complete registry including extinct types, round history, the 11 design rules, and a computed loser/winner **seat briefing** so the model designs situationally.
2. `compileCard()` — one shot at expressing a human card atomically after mint.
3. `judgeSemanticDuplicate()` — a cheap LLM judge layered over mechanical text checks.
4. `generateStarterNames()` — renames the 20 starters every match (silly Fluxx-style names: "Banach-Tarski Piñata," "The Fed Chair of Chairs," "Quantum Duckling").
5. `implementCards()` — the standout: the **Claude Agent SDK** runs an agent with Read/Write/Edit/Bash tools inside the project, writing `src/effects/<id>.ts` + a test file, running the card test suite, iterating up to 3 attempts on failures — with guardrails (`disallowedTools: ['Bash(git *)']`, maxTurns 50) added after a stray `git stash` swept the working tree.

**The three-tier implementation strategy** (the most reusable pattern): try (1) **compose from existing atoms** — a declarative AST of triggers/atoms/selectors/values/conditions that compiles to a standard CardEffect, no code written, seconds; else (2) **propose exactly one new atom** (additive, full suite must stay green or revert); else (3) **bespoke TypeScript module**. Engineering detail worth remembering: the structured-outputs API rejects recursive `$defs`, so compositions travel as JSON-encoded strings validated server-side; the real gate is validation + retry, not the schema.

**Engineering war stories** (from the napkins — see §8): idempotency guards on round resolution (mobile Safari reloads re-resolved round 1 four times), WAL-style crash recovery around the card registry, choice-point persistence via deterministic single-turn replay, seeded AI RNG, and a documented prompt-injection attempt during an agent task that was correctly refused ("don't tell the user" is itself a hard stop signal).

**Stack**: vanilla TypeScript + Vite (deliberately no React), the backend as a Vite dev-server plugin, JSON-file persistence with a hand-rolled registry lock, ~440+ tests. Status: substantially finished as a local-dev experience; not hosted.

### 3.3 Mythgarden

A **deployed** (Fly.io, mythgarden.ashkie.com) time-loop farming-sim RPG: "Stardew Valley + Groundhog Day, with a quirky vibe and an arcade feel." You live the same Monday→Sunday week repeatedly — farm, fish, mine, forage, befriend 15–18 villagers, hunt magical **mytheggs** — and when the week wraps, the run resets while high score, achievements, Knowledge, boost level, and luck level persist on the Hero.

**The arcade heart**: `score = koin_earned × hearts_earned × 10 × (1 + mytheggs/10)` — money *times* friendship, so a balanced run massively outscores a lopsided one. Time is the central resource (every action costs minutes; miss midnight and you oversleep).

**Signature systems**:
- **Loss-compensating luck**: beating your high score grants `boost_level += 1` (faster actions, luck resets); failing grants `luck_level += 7` (better mythegg odds). A losing run literally makes the next run luckier — a compassionate catch-up loop tuned to the time-loop framing.
- **Mytheggs**: six rule-bending rarities (SPARKLY on hearts gained, GOLDEN on shop restock, RAINBOW guaranteed once you've found 5…) drawn probabilistically, gated on persistent Knowledge.
- **Data-driven achievements** (114 spec'd) via a `check_{type}` dispatch pattern; some unlock Knowledge that persists across loops.
- **Opt-in difficulty-for-score**: four toggles (villagers move, building hours, advanced crops, dynamic shop) raise the score multiplier from 100% to 225%, with a draft/active settings split applied at loop boundaries.
- **CSV-as-content-database**: 55 self-describing CSV snapshots (column 1 names the Django model, headers name fields, `fk__` columns resolve natural keys) define the entire world — 182 items, 205 dialogue lines, 203 villager-movement events per snapshot. Timestamped filenames double as content version history.

**Stack**: Django (server-authoritative game logic: action generator/validator/executor, time-queue event operator that correctly handles lingering "yesterday" events) + React 18/TS/webpack frontend as a state renderer; SQLite; Docker + GitHub Actions with automatic staging deploys posting preview URLs on PRs. Three specs (toast message center, settings menu, unclaimed-achievement progress bars) mark the current polish frontier — settings partially wired, the other two unbuilt.

### 3.4 Leyline Garden

A cozy mobile-web idle/automation game: a fairy grows magical plants and builds **leyline** delivery networks across a two-layer isometric world (24×16 diamond grid; Surface + Underground connected by holes the player digs). Phaser 3 + Vite + strict TS, ~225 Vitest tests, 100% procedurally generated pixel art.

**Signature mechanics**: a strict **carry-one-thing constraint** (one resource or seed at a time) makes automation the whole game — you graduate from hand-carrying to drawing 8-directional leylines along which resource **motes** travel (2 tiles/sec, delivery priority chain, stall-if-unaccepted, global 200-mote cap). **Source plants** emit free motes; **transmute plants** consume two accumulated inputs to emit an output — production chains à la mini-Factorio. Weather (sun/rain feeding), a day/night lighting cycle, escalating seed-cost ladders, an endgame Portal sink, and **idle/away simulation** (24h cap, welcome-back summary) round out the loop. Architecture is a clean `src/sim/` (pure engine) vs `src/phaser/` (rendering) split with a pub/sub bridge to a vanilla DOM UI.

**Process contribution**: `.claude/game-dev-context.md` — a shared context file every specialist agent reads before changes and updates after, containing a z-depth hierarchy table, a file-ownership map, and an **"Established Patterns — DO NOT violate"** list encoding hard-won conventions ("if the user says 'make X glow', move the sprite above the lighting overlay — don't add a decorative circle"; iso glows are 2:1 ellipses; feed timing uses the emit-tick counter, not a separate ms timer).

### 3.5 Rock Stars (geology-quiz)

A tablet-friendly, offline, no-backend quiz app for kids — "closed sets you can fully master," states-and-capitals style. React 18 + Vite, fully data-driven decks (Mohs hardness, mineral formulas, geologic time, rock families, ores & metals) with a flexible schema (reversible decks, images, crystal-form rendering, sub-group tag filtering). Training mode (flip cards) and Test mode (multiple choice with same-deck distractors, review list, per-deck/direction best scores in localStorage, crown at 100%). Has quietly grown a whole **periodic-table subsystem** (element tiles, gauntlet modes, celebrations) beyond the documented decks. Images fetched from Wikimedia Commons by script with a manifest + credits file. Household-utility genre: the "games for the kids" lane the player profile asks for, shipped cheaply.

---

## 4. Conversation Project Profiles

### 4.1 Built & playable

**LUMENGRID** (July 2026) — Laser-routing puzzle game, React single-file, mobile-friendly blocky aesthetic. Players route colored beams through mirrors, splitters, and filters to illuminate sockets requiring exact RGB combinations.
- **Engine:** additive light mixing as bitwise OR on color masks (R=1, G=2, B=4). Beams rendered in SVG with screen blend mode so overlapping red + green visually reads yellow.
- **Content:** two worlds × ten levels. W1 teaches mirror rotation, drag repositioning, mixing, filters, splitters, linked toggle-mirrors. W2 introduces composite glass (amber/cyan/magenta two-channel filters → subtractive logic), poison-beam deflection (overfed sockets; the solve is diverting excess color), and swap-drag in tight spaces.
- **Tooling worth stealing:** all 20 levels machine-verified with a standalone Node.js engine script proving each level solvable from its solution sequence and *not* pre-solved from its start state. This verifier pattern generalizes to any deterministic puzzle game.
- **Status:** shipped as artifact; later patched to unlock W2 from the start.

**Lumen Works** (June 2026) — LUMENGRID's predecessor: a "miniature Factorio about combining primary colors of light." Grid-based, live beam simulation, mirrors/prisms/combiners, exact-color targets (over-mixing is not a valid solve). Five levels plus sandbox. Dark synthwave lab aesthetic. Superseded mechanically by LUMENGRID, but the **sandbox mode** and the **combiner** (multi-input, rotatable output) didn't carry forward — both are still worth mining. (Leyline Garden has since independently built the mini-Factorio idea into a full game.)

**Hexagon Maze** (Sept 2024) — Small React component: honeycomb grid, click cells in numbered sequence. Origin point of the "code me up a puzzle in React" pattern; mechanically thin but the axial-coordinate hex rendering code exists.

### 4.2 Designed, not yet built

**Halflight** (July 2026) — *closest to a ready brief.* Fictional 2020s indie game invented from a riff on dollar purchasing power as radioactive decay. Studio: Glowworm Games. Fully art-directed (pixel-art fold-out poster: decay-map taxonomy on the front, biome/gem-concentration world map on the back, Tunic-manual energy).
- **Core loop:** Moonlighter-style — delve for gems by day-equivalent, run a shop with them, except every gem has a condition-dependent half-life. Inventory literally decays.
- **Named mechanics:** decaying inventory, heat/critical mass (stacking hot gems is dangerous), decay-as-mana (spend a gem's remaining decay as a casting resource).
- **Explicit standing request:** a playable React prototype of the core loop. This is the one project where the ask is already on file.

**The Mage Ladder** (April 2026) — An LLM-as-game-engine research program disguised as a prototype sequence. Target: a text-only Mage: the Ascension engine where the LLM parses free-text intent, validates against Sphere mechanics and local Consensus Reality, scores Paradox risk, and narrates through each character's paradigm filter — two players in the same scene see different realities.
- Ten prototypes from **0.0.1** (coin flip + narrator: one bit of player agency, one bit of entropy, does the narrator make it *matter?*) up through D&D-rules text game (0.0.9) to full MtA (0.1).
- A markdown ladder document exists listing, per rung, the software systems to build and the validation tests each must pass.
- Core validation question: can a player try something the designer never anticipated, have it adjudicated consistently, see persistent world-state change, and feel they *discovered* an interaction? Failure modes named: yes-to-everything narrator, tyrannical reviewer.
- Needs: structured world-state, an intent parser/validator split, lightweight NPC agent loops. Explicitly does *not* need graphics, physics, real-time, or content volume.
- **Wave 2 changes this brief's economics**: Lution has already shipped the hard infrastructure — live Claude API calls in a game loop, LLM-as-judge for rule enforcement, structured-output wire constraints, agent-written code with guardrails, and validated declarative ASTs as the LLM's target language.

**Palimpsest** (March 2026) — A values-alignment game wearing Homestuck mechanics, with a GDD written to read like its own subject matter (revisions bleeding through the text). Four prototype-ready mechanics were scoped:
- **Layerlink** — chat with two revisions of the same character simultaneously; one degrading, one who doesn't know you.
- **Peeling** — scrape layers off objects/scenes to expose earlier revisions, paying a Fidelity cost.
- **Personality parser** — constrained natural-language exploration where the parser itself has character.
- **Annotation** — write messages to "the Author" and watch an actual LLM misinterpret them; the alignment gap is the gameplay.

**Garden Guardians** (Jan 2026) — Two-player co-op deckbuilder for phones, designed to play with your spouse in 10–20 minute turn-based sessions around the kids. Aeon's End / Battle of Hogwarts lineage, but deliberately combat-free: fairies tending a garden with illusion and misdirection rather than attack/damage.
- Three fairy actions: **nurture** (grow/heal plants), **guide** (redirect animals), **weed** (remove growth-slowing weeds).
- Sacrifice economics: plants that won't fully mature can be fed to animals to protect higher-value crops.
- First-prototype card list already sketched. Design note from the session: weeds beat pests into prototype 1 because they're the most intuitive garden threat.
- (Leyline Garden now occupies adjacent cozy-garden territory single-player; Garden Guardians remains the *two-player co-op* slot.)

**Resonance Roguelike** (Jan 2026) — Randall Collins' Interaction Ritual Chains theory rendered as a rhythm roguelike: geometric shapes grow through social encounters staged as musical synchronization challenges. A ~2,500-word spec exists. The theoretical spine — emotional energy as the accumulating resource of successful ritual sync — is the distinctive part.

**Elemental Magic Chess** (April 2025) — Chess with elemental visual effects and interactions; a full phased plan exists for a 2D Canvas/Pixi.js browser prototype. Standard chess underneath.

**Dynamic Piece Strength** (Jan 2025) — Tactical board game mechanic set: pieces strengthen or weaken based on move recency. Status taxonomy — **exhausted** (just moved, −25%), **prepared** (waited, +15%), **rusted** (idle too long), **energized** (power-up). TypeScript interfaces drafted. A mechanic in search of a game; pairs naturally with Halflight's decay theme — and with Muju, where move-recency statuses would slot into the existing action-step economy.

### 4.3 Adjacent material

- **D&D campaign (ongoing, July 2026):** solo theatre-of-the-mind 5e with Claude as DM, tone "weird and wondrous." Methan the forest-gnome Wild Magic sorcerer, the Register, Saltstair. A live worldbuilding vein if the new game wants a setting rather than an abstraction.
- **Values-game and superintelligence-play threads:** recurring interest in games as vehicles for alignment intuitions (Palimpsest's Annotation, the Mage ladder's reviewer problem). Lution is the first shipped artifact of this thread — a game whose central opponent-relationship *is* an LLM designing under constraints.

---

## 5. Player Profile (constraints the new game should respect)

- Plays in **10–30 minute interruptible sessions** — family context; games must survive being put down mid-thought. (The repo has form here: schema-versioned localStorage in Muju/FORGE, full run persistence + stale-save tolerance in MMS, idle/away simulation in Leyline, loop-boundary resets in Mythgarden.)
- Sustained engagement comes from **system synergies and discovery-phase depth**: Balatro (100–200 hrs, then exhausted), Slay the Spire, Bloons TD6, Stardew, Hades 2. Loses motivation near completion; the discovery phase is the product. (Lution is a direct answer: a game whose content space *never* closes; MMS's tiered content unlocks and Mythgarden's knowledge/mythegg gating both stretch discovery.)
- Comfortable with abstraction and framework-heavy themes but also genuinely wants **cozy and non-combat** options for family play. (Wave 2 delivered two: Leyline Garden and Rock Stars — the latter for the kids outright.)
- Competitive gaming background; won't be scared off by mechanical density.
- **Fable-5-token-constrained** (napkin): delegate implementation milestones to Sonnet subagents against fully worked-out specs; the main loop is specs + review. Answers to rules questions often arrive as rule *changes* — treat them as spec deltas to implement, not option picks.

---

## 6. Reusable Mechanics Library

**Hidden information & bluffing**
1. Decoy/feint duality — real action and bluff rendered identically to the opponent, down to fake damage tokens (Ninja Tanks).
2. Hidden production queue + public income (Muju) — the asymmetry that makes honest AI belief-tracking tractable; now with matching honest UI ("???" resources + visible-spend-only counter).
3. Visible turn timeline, hidden intent (Oracle) — you know when, not what.
4. Honest telegraph (MMS) — one function drives both the displayed intent and the executed action, so the telegraph structurally cannot lie.

**Auction, market & meta-game dynamics**
5. Counter-bid with retained turn (FORGE) — desirable items tax themselves; losing an auction refunds tempo.
6. Cost composition as contestability signal (FORGE) — specific costs protect, generic costs invite contest.
7. Purchase-driven market expansion (FORGE) — the option space grows spatially from where players act.
8. **The extinction engine** (Lution) — loser-decides keep/steal, two-pick raid, spurn-destroys, creator-execution, permanent registry land-grab. The design layer becomes the real game; the card game is just the scoreboard.
9. Registry land-grab / design-space scarcity (Lution) — every effect ever created is claimed forever; simple effects are premium real estate, so late-game content gets baroque by economic necessity.
10. Collision-voiding (Lution) — identical simultaneous designs destroy each other; idiosyncrasy as insurance.

**Territory & economy**
11. Anchor-rectangle spawning + binary enemy-blocking (Muju) — one rule creates a whole territory game.
12. The well/rope layered-resource model (Muju) — depth-gated extraction as organic tech-gating.
13. Denial with permanence — free BURN leaving adjacency-blocking RUINS (FORGE).
14. Army-as-life-bar (MMS) — no per-fight HP resets; attrition on a persistent army makes combat a war of sustained value.
15. Compounding no-gold growth as a faction identity (MMS Necromancy) — with gold-fed Muster/Dwellings as the alternative sustain path for everyone else.
16. Calendar-structured maps (MMS) — 1 node = 1 day, acts = weeks, the reinforcement shop always lands right before the boss; time structure does pacing work for free.
17. Carry-one-thing constraint → automation as the game (Leyline) — the player's physical limitation is what makes building networks the core verb.
18. Source → transmute production chains with delivery-priority routing (Leyline) — mini-Factorio in a cozy skin.

**Time & decay as resources**
19. Decaying inventory with condition-dependent half-lives (Halflight) — holding value is itself a decision.
20. Decay-as-mana (Halflight) — spend a resource's remaining lifetime as casting fuel.
21. Heat/critical mass (Halflight) — storage layout becomes gameplay.
22. Move-recency statuses (Dynamic Piece Strength) — exhausted −25% / prepared +15% / rusted / energized.
23. Time-loop meta-progression (Mythgarden) — within-run state resets; score/knowledge/boost/luck persist; the loop boundary is also where settings changes apply.
24. Loss-compensating luck (Mythgarden) — a failed run raises next run's rare-drop odds; a compassionate catch-up loop.

**Combat & tactics**
25. Damage as temporary defense erosion (Muju) — combined attacks without HP bookkeeping.
26. Position-gated action legality (Ninja Tanks' LEGAL_SHOTS).
27. Deterministic simultaneous resolution ordering — moves before shots (Ninja Tanks).
28. Combat-free threat verbs (Garden Guardians) — nurture / guide / weed; sacrifice economics replace kill decisions.
29. Two-rank battlefield with role triangle (MMS) — shooters (any rank, no retaliation) vs flyers (reach-back, eat retaliation) vs front wall; retaliation as a per-round budget.
30. The 5%-per-point stat trinity (MMS) — speed→dodge, luck→crit, morale→action economy, all capped at 25%; plus the undead morale neutral-lock as a faction-defining exception.
31. No-restack rule (MMS) — recasting the same buff is a no-op, different buffs still stack; kills the stacking exploit with zero new subsystems.

**Puzzle & systems logic**
32. Bitmask channel mixing (LUMENGRID) — resources as bit flags; exact-match targets where over-delivery fails.
33. Excess-as-hazard (LUMENGRID's poison beams) — the puzzle inverts from "gather enough" to "divert the surplus."
34. Exact-color targets where over-mixing is invalid (Lumen Works).

**LLM-native mechanics**
35. LLM as opponent-designer with full strategic context (Lution) — strategy guide + seat briefing + registry history in the design prompt, so the model plays the metagame, not just the game.
36. LLM as live content compiler (Lution) — agent-written card code, gated by tests, with the three-tier atoms → new-atom → bespoke ladder.
37. LLM-as-judge layered over mechanical checks (Lution) — semantic duplicate detection, no-deixis paraphrase detection.
38. Intent parser / rules validator split (Mage Ladder) — free-text intent, mechanically adjudicated; failure modes: yes-to-everything narrator, tyrannical reviewer.
39. Paradigm-filtered narration (Mage Ladder) — two players in the same scene see different realities.
40. Annotation (Palimpsest) — an actual LLM misinterpreting the player *as* the gameplay.

**Scoring & progression**
41. End-game-only conditional VP with baseVP-0 engine cards (FORGE).
42. Stat-mods-first, synergies-later content roadmap (Oracle).
43. Path-gated rarity as the single risk/reward lever (Oracle).
44. Cross-game continuity hooks — inert fields a sequel activates (FORGE/AZAD MINOR).
45. Multiplicative score across two axes (Mythgarden's koin × hearts) — forces balanced play better than any rule could.
46. Opt-in difficulty-for-score-multiplier with draft/active settings applied at loop boundaries (Mythgarden).
47. Data-driven achievements that unlock persistent Knowledge (Mythgarden) — content scaling without code.
48. Emotional energy as an accumulating ritual-sync resource (Resonance Roguelike).

**Meta/UX**
49. Action log = chat thread with narrative flavor (Ninja Tanks).
50. One-click guest accounts (Ninja Tanks).
51. Full skin architecture — one codebase, multiple audiences (FORGE).
52. AI transparency surfaces — debug console + player-facing "AI Recap" (Muju); Lution's "see what your card became" code reveal and live forge-progress viewer are the same idea for generated content.
53. Sandbox mode alongside authored levels (Lumen Works).
54. Idle/away simulation with a welcome-back summary (Leyline) — respect for interrupted sessions as a feature.
55. Blow-by-blow battle playback including losses, with damage forecasts (MMS) — legibility as a retention feature.

---

## 7. Reusable Technical Assets & Engineering Playbook

**Standardized in the repo** (codified in `.claude/skills/` + napkin "Patterns That Work"):
- **Stack**: React 19 + TypeScript strict + Vite + Tailwind v4 + Vitest (browser mode) + Playwright is the house default — but wave 2 proved deliberate deviations work: vanilla TS (Lution), Phaser 3 (Leyline), Django + React (Mythgarden), pnpm monorepo PWA (MMS). Per-game dev ports: muju 3002, leyline 3003, lution 3004, geology-quiz 5191.
- **Architecture pattern proven repeatedly**: pure immutable game logic in `src/game/` or `src/sim/` or `packages/engine` (state in → state out, seeded RNG, headless), a thin hook/bridge layer, presentation on top. Trivially unit-testable, replay-friendly, AI-simulation-ready. Persistence via localStorage/JSON with schema versions and stale-save tolerance.
- **AI toolkit**: minimax/alpha-beta with optionality-based evaluation (perfect info); observation-split → belief-particles → beam-planner → ISMCTS (hidden info, Muju). Scale difficulty by search budget, never rules.
- **Balance toolkit — three tiers of rigor now exist**:
  1. *Analytical*: the strategy-mindset exploit-hunting pass (FORGE) — vacuum-fallacy-aware ratios, triangularity, 45–55% target bands.
  2. *Audit*: MMS's document ladder — INERT-verdict code tracing, the LIGHT/MEDIUM/HEAVY constraint-satisfaction budget, S–F naive-power ranking of imports *in the current engine*, dual-rated mechanism inventory (KEEP/FIX/SIMPLIFY/MERGE/CUT).
  3. *Empirical*: Muju's balance lab — headless seeded match runner, bot ladder + adversarial probe bots, Wilson CIs, engine-hash stamping, experiment configs, judgment log. The lab found real engine bugs (D13, D14) beyond balance numbers.
- **UI discipline**: layout-invariance (geometry-first CSS, pixel assertions, real-browser tests), ux-affordances checklist, and Lution's mobile patterns (100dvh flex shell with a docked hand strip outside the scroll region; tap-selects-then-confirm instead of tap-plays, to prevent fat-finger misplays).
- **Test discipline**: test-matching (read the implementation first); MMS's canonical-fixture pattern (one instance of every content record, schema-validated, shared by all agents so mocks can't drift); Oracle's Playwright contract specs.

**Proven in wave 2, ready to import:**
- **The three-tier LLM content pipeline** (Lution): declarative atom AST → one additive atom → bespoke module, with server-side validation as the true gate, JSON-string transport for recursive schemas, golden-gate migration rules (test assertions preserved verbatim; import mechanism may adapt), and MTG-style pre-execution snapshot semantics for multi-selector effects.
- **Claude Agent SDK as an in-game code generator** with explicit guardrails: `disallowedTools: ['Bash(git *)']`, maxTurns caps, test-suite gating, retry-with-failure-feedback. Any job agent with Bash needs negative constraints, not just positive instructions.
- **LLM API operational knowledge** (napkin Domain Notes): adaptive thinking shares max_tokens (budget 16000 for design-heavy calls); structured outputs reject recursive $defs and additionalProperties:true; always live-smoke-test schema changes — mocked tests can't catch wire constraints.
- **Contract-first multi-agent orchestration** (MMS): keystone schema + fixtures first → parallel agents in git worktrees, one branch each → orchestrator merges → play one full run end-to-end → dedicated design-doc-then-implement balance passes. Schema changes route through the orchestrator only.
- **Named-lever balance-as-data** (MMS): every formula constant documented as a tunable in one place; tests as the tuning harness; win-rate sweeps as acceptance criteria; load-bearing single constants (bossMaxDragons: 4%→59%) documented as "ugly but essential — don't touch."
- **CSV-as-content-database with a self-describing loader** (Mythgarden): git-diffable world content, timestamped snapshots as version history.
- **Seeded determinism end-to-end** (MMS runs; Lution's replay-based choice-point persistence; Muju's lab) — determinism is what makes idempotent resume, replay, and empirical balance all cheap.
- **Node.js solvability verifier** (LUMENGRID): prove every shipped level solvable-but-not-pre-solved; extends to procedural content ("every generated day's stock must be survivable"). Still not adopted by any repo game — a standing gap.
- **Bitmask color/resource engine** + SVG screen-blend rendering (LUMENGRID); **hex axial-coordinate rendering** (Hexagon Maze); **single-file React game shell** for fast V0s.

---

## 8. Design-Process Lessons (the expensive ones)

1. **Settle the core interaction chart early — then measure before touching it.** Muju's element system shipped three different charts; the balance lab has since proven the current graph is *load-bearing* (removing one edge collapses a whole strategy from 88% to 2–4%) and that fixes belong in cost/build-time levers, not stats or the graph. The CLAUDE.md sync rule (spec, instructions, comments, tests, README all agree) exists because of this churn.
2. **One self-balancing rule beats a page of tuning.** FORGE's retained-turn auction, Muju's spawn-blocking rectangle, MMS's no-restack rule, Lution's loser-decides steal — each does more balancing work than any stat table.
3. **Build the measurement instrument; it pays twice.** Muju's lab produced balance findings *and* found real engine bugs (ID-collision teleports, ghost attacks). Measure-as-shipped before fixing, stamp datasets with engine hashes, report with confidence intervals, and flag coarse instruments as coarse.
4. **Machine-verify your content.** LUMENGRID's solvability verifier; MMS's schema-validated fixtures and win-rate sweeps; Lution's per-card golden tests gating LLM-written code. The un-verified path (FORGE's analytical-only balance) is the outlier now.
5. **Scope redesigns as nested budgets.** MMS's LIGHT/MEDIUM/HEAVY constraint-satisfaction ladder — contradiction-free tiers where each tier only adds primitives the lower ones deliberately avoided — is the reusable answer to "how much do we build?" Pair it with the **retroactive-justification lens**: find the one small subsystem whose addition makes many already-built inert mechanics suddenly matter.
6. **Audit imports by naive power in the *current* engine.** MMS's S–F ranking caught Castle arriving 5/7 inert before shipping. Content breadth outrunning engine breadth is a real failure mode; the substring-matching ability detector is its cheapest bug class.
7. **Essentialize on a schedule.** MMS's dual-rated mechanism inventory (gameplay × thematic cruciality → KEEP/FIX/SIMPLIFY/MERGE/CUT) is the anti-creep discipline; run it before adding, not after drowning.
8. **Docs lag reality in both directions; napkins drift too.** FORGE's README, the portal's "Fully Playable" Oracle label, a root-napkin claim of "enforced" rules that weren't in code ("trust code over napkin"), and geology-quiz's napkin belonging to a *different project entirely* (scaffold-copy orphan). Verify a context file belongs to and matches its project before trusting it; keep superseded rules visible under `[SUPERSEDED]` markers rather than deleting them.
9. **Scope specs into shippable versions and honor them.** Oracle's V0→V3, the Mage Ladder's rungs, Lution's M-milestones, MMS's phased orchestration — the smallest version that answers a real question. The failure mode remains FORGE's fully-spec'd, never-started Phases 2–4.
10. **Keep decision logs with explicit open questions.** Muju's AI_ENGINE_QUESTIONS and new JUDGMENT_LOG (options, ruling, rationale, blast radius, reversal cost; human priors separated from agent rulings); MMS's BALANCE_PROPOSALS closing with six questions for the designer. Deferred decisions stay findable.
11. **Test the layer you're shipping — and the boot path.** 2013 tested server logic only; Oracle tested UI geometry only (now also e2e via Playwright). Lution's addendum: subagent-built UIs must be tested on the *fresh-install* path (null state) — every verifier smoke-tested against existing state and missed the null-boot crash. Also: test reload-at-every-phase on mobile (Safari reloads on every unlock; non-idempotent round resolution ran 4×).
12. **State machines need idempotency + lifecycle hygiene.** Guards keyed on ordinals (round numbers) are latent gaps; fine-grained resumable sub-state must be cleared at lifecycle boundaries or it poisons the next cycle's resume; snapshot what you persist (a debounced save of a live mutable object persisted mid-turn state); errors must never silently become game moves.
13. **Playtest against the degenerate strategy first.** Muju's mass-Fire_1 rush (now quantified: 97.2% vs greed), MMS's Blind-lock and unkillable dragon walls, FORGE's uncontested-efficiency archetypes. The strategy-mindset lens exists to find these before players do.
14. **Autonomous agents need negative constraints and independent verification.** A Lution implement-agent ran `git stash` repo-wide mid-diagnosis; guardrails (disallowed tools, turn caps) are now standard. Verify subagent self-reports by reading the diffs and re-running the suites; re-check "known findings" against current code before patching (a whole 11-finding fix pass turned out already-fixed). A documented prompt-injection attempt mid-task ("urgent" scope expansion + "don't tell the user") was refused — that phrase is itself a hard stop signal.
15. **The online layer finally shipped — via a different stack.** After three unfinished attempts (Ninja Tanks' Pusher TODO, FORGE's WebSocket phases, Muju's deferral), Mythgarden shipped deployed and server-authoritative (Django + Fly.io + staging previews). Lution runs live-LLM but stays local. The lesson refines: decide at kickoff whether the game is local-first or hosted, and if hosted, borrow Mythgarden's deploy scaffolding rather than re-deriving it.
16. **Successor games shed good ideas — audit the predecessor.** LUMENGRID dropped Lumen Works' sandbox and combiner; FORGE's series hooks sit dormant; MMS retired its STS prototype (deliberately, with a written record — the right way).

---

## 9. Open Threads a New Game Could Pick Up

- **Halflight prototype** — still the one project with an explicit standing request on file; MMS now provides the roguelite scaffolding (seeded runs, calendar map, named levers, run persistence) it would need.
- **Muju phase 4–5**: rush rebalance via cost/build-time levers, the D14 ghost-attack fix, and the remaining experiment configs.
- **MMS's fork in the road**: minimal initiative (retroactively justifying ~6 inert speed mechanics) vs the shipped speed→dodge; plus the MECHANISMS_AUDIT dead-weight cuts and real AoE. No live deployment yet.
- **Lution hosting** — currently a local dev-server experience; hosting it (or its engine) would make the portfolio's most novel game shareable. Its atoms/agent pipeline is also the ready-made substrate for the **Mage Ladder** and **Palimpsest's Annotation**.
- **Mythgarden's spec'd polish frontier**: toast message center, settings menu UI, unclaimed-achievement progress bars.
- **Leyline Garden's open visual issues** + whatever its tier-3 content ladder implies.
- **Blind Loyalty** and **Hex Strike** — still never built; the axial-coordinate hex code still exists.
- **AZAD MINOR** — Games 1 (*Snatch*) and 4 unbuilt; Game 3 (*Skirmish*) would activate FORGE's dormant `game3Effect` hooks and could reuse Muju's engine/AI — or MMS's army-battle engine, which is arguably a closer fit now.
- **Oracle V1–V3** — the roguelike loop is fully specified and unbuilt, now with an e2e harness under it. MMS overlaps its territory substantially; decide whether Oracle remains a distinct (mobile-portrait, 5-minute, elemental) product or donates its spec to MMS.
- **Lumen Works' orphaned sandbox mode and combiner**.

---

## 10. Candidate Briefs

Three directions from the conversation history plus one repo-native option — all re-costed after wave 2. Pick one or hybridize.

**A. Halflight: the prototype.** The standing request. Decaying-gem inventory, shop loop, heat/critical mass, decay-as-mana; dynamic-piece-strength statuses slot into gem states; a shop day is a natural 10-minute unit. *Wave-2 re-costing: substantially cheaper than before.* MMS supplies the run structure, seeded determinism, named-lever balance harness, and PWA shell; Mythgarden supplies the shop/day-loop and multiplicative-score thinking; the LUMENGRID verifier discipline applies to procedural gem-batch generation ("every day's stock must be survivable"). The main new build is the decay simulation itself.

**B. Climb the Mage Ladder.** Build rungs 0.0.1–0.0.4 as a real repo: coin-flip narrator → stats → persistent world-state → rules validator, each rung's validation tests as actual test files. *Wave-2 re-costing: Lution already shipped the hard parts* — live Claude calls in a game loop, LLM-as-judge, structured-output wire constraints (recursive-schema workaround, token budgets), agent-written content gated by tests, and a validated declarative AST as the LLM's output language (the atoms architecture is a working model for "Sphere mechanics as a validator"). Ninja Tanks' dry-run validation and Lution's idempotency/lifecycle lessons are the same shape as the intent-validator problem. Palimpsest's Annotation is a natural side-quest on the same infrastructure.
**C. Garden Guardians, digital.** The two-player cozy co-op deckbuilder for phones. Card list and verbs exist; missing the turn engine and a first balance pass. Highest household-utility-per-line-of-code. *Wave-2 re-costing:* Mythgarden proves the hosted server-authoritative path end-to-end (Django, Fly.io, staging previews) — the "online decision" no longer blocks on unknowns; Leyline covers adjacent cozy-garden aesthetics single-player, so this brief's differentiator is squarely the *two-player co-op* experience; Muju's pass-and-play remains the fallback mode. Rock Stars shows the family-audience lane ships fast when scope is disciplined.

**D. (Repo-native) Skirmish / Hex Strike.** A tactical-combat game activating FORGE's dormant `game3Effect` army-import hooks. *Wave-2 re-costing: two engines now compete for the job* — Muju's (grid tactics + imperfect-info AI + balance lab) and MMS's (army stacks, A/D curve, retaliation economy, faction chrome). An army-carrying tactical layer where FORGE tableaus become MMS-style creature stacks is now a mostly-assembly project. Optionally lands on the hex grid Hex Strike promised.

Cross-cutting recommendation, sharpened by wave 2: whichever brief wins, adopt the **three-tier balance toolkit** (strategy-mindset pass at design time → MMS-style mechanism inventory at content lock → a Muju-style headless lab once the engine is pure and seeded), and keep the **napkin + judgment-log discipline** from day one — wave 2's velocity came from orchestrated agents, and every one of its expensive lessons was a coordination or verification lesson, not a design one.

Open question, deliberately left to the project kickoff: whether the new game is *for you* (A or B), *for the household* (C), or *for the studio's existing universe* (D).
