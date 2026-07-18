# DeevGames — Game Design Dossier

*A synthesis of every game designed or built in this repo, compiled to inform the design of the next game. Sources: the legacy Rails site (Ninja Tanks), FORGE, Muju Hono Tanka, Oracle of Delve, the project skills in `.claude/skills/`, and the repo's specs, balance analyses, and git history.*

---

## 1. Portfolio at a Glance

| Project | Genre | Status | Signature idea |
|---|---|---|---|
| **Ninja Tanks** (2013, Rails/jQuery) | 2p simultaneous-action bluffing duel | Shipped at deevgames.com | Decoy/feint fog-of-war: your move and your bluff look identical to the opponent |
| **Blind Loyalty** / **Hex Strike** | Designed board games | Never implemented | Unknown — designs predate the repo's docs |
| **FORGE** (React/TS) | 2p card drafting/auction on an expanding grid | Playable hot-seat; no AI, no online | Counter-bid auction where the outbid player keeps their turn |
| **Muju Hono Tanka** (React/TS) | 2p Go × Chess × StarCraft on a 10×10 grid | Most complete: full rules + imperfect-info AI | Three-phase turns (place → act → queue) + spawn-denial territory |
| **Oracle of Delve** (React/TS) | Mobile-first roguelike dungeon crawler | V0 combat prototype only | Layout-invariance testing methodology (its most finished artifact) |

The arc: a 2013 server-authoritative Rails game with untested jQuery UI → a modern client-side React/Vite/Tailwind collection with pure-function game engines, serious AI work, and rigorous UI-geometry testing. Each project contributed one durable discipline the previous one lacked.

---

## 2. Project Profiles

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

**Gaps**: no AI opponent, no animations, no multiplayer, no series integration.

### 2.3 Muju Hono Tanka: Elemental Tactics

The most complete project. Two players (white/black) from opposite corners of a 10×10 grid; genre fusion of **Go (territory), Chess (tactics), StarCraft (economy/production)**. Modes: vs AI, pass-and-play, AI-vs-AI.

**The three-phase turn loop** — the cleanest structural idea in the repo:
1. **Place** — deploy finished units into your spawn zone; promote existing units (pay tier-cost difference; no tier-skipping, once per phase, not on placement turn).
2. **Action** — 6 action steps; each step is one move/attack/mine; no per-type caps, no summoning sickness.
3. **Queue** — secretly spend mined resources on units with 1–3 turn build times. The queue is hidden; **mining yields are public**.

**Signature mechanics**
- **Anchor-rectangle spawning with binary enemy-blocking**: your spawn zone spans from your corner to any unit you pick as anchor; *any* enemy unit inside blocks the whole rectangle. Board presence is an economic weapon (spawn denial) — the Go-like territory layer emerges from one rule.
- **The "well/rope" mining model**: every cell has 5 stacked resource layers; a unit's Mining stat is its rope length; cells go "dry" *per unit* once remaining layers are deeper than that unit's reach. Natural tech-gating: only high-mining units can exploit deep resources, giving Expand elements a late-game niche.
- **Damage as defense erosion**: attack ≥ effective defense kills; non-lethal hits reduce effective defense until the defender's next turn starts. Enables combined attacks (chip then kill) with a "convert damage to a kill this turn or it's wasted" tension — simpler than HP pools, tactically rich.
- **Six culturally-themed elements** (Fire/Japanese, Lightning/Swahili, Water/Norse, Shadow/Turkish, Plant/Quechua-Nahuatl, Metal/Lakota) in three archetypes (Rush/Balanced/Expand), 4 tiers each, 24 units total. Current combat chart is the **"double-thick triangle"**: Fire & Lightning → Plant & Metal → Water & Shadow → back. Modifier is ±1 attack only; defense never modified.

**The AI engine** — the repo's deepest technical asset:
- Honest imperfect-information play: a **public/private observation split**, a **particle-filter belief model** over the opponent's hidden resources/queue (tractable because mining yields are public, so income is deterministic), **beam-search turn planning** with tactical templates (kill, combined-attack, spawn-denial…) to tame the 6-action combinatorial space, **re-determinized ISMCTS** search, and a quiescence-style **tactical sharpener** on hot leaf positions.
- Static eval is a ~15-factor weighted sum where **optionality/mobility is a first-class term**, queued units are discounted by `0.9^turnsRemaining`, and spawn-related pressure carries the biggest weights (spawnDenialPressure −1.5, killThreatsReceived −2.0).
- Difficulty scales **search budget, not rules** (100→1200 MCTS iterations). An AI Console exposes candidate plans/scores for debugging; an AI Recap explains the AI's turn to the human.

**Open problems**: the element relationship chart was reworked **three times** (dual triangles → archetype triangle → double-thick paired triangle) and the v1.1 spec still flags the Rush>Expand-vs-archetype-triangle contradiction as unresolved; victory condition in code (zero units on board) is looser than spec (zero units *and* empty queue); the AI is reportedly weak to a mass-Fire_1 rush; AI_ENGINE_QUESTIONS Q4–Q12 remain deferred.

### 2.4 Oracle of Delve

Mobile-first portrait roguelike: descend ~10 rooms, turn-based elemental combat, draft 1-of-3 gems between rooms, hard/easy path choice gates gem rarity, boss at room 10, 5–10 minute runs. Inspirations: Slay the Spire (draft + paths), Into the Breach (visible turn timeline), Pokémon (elemental weakness/resist), Hades/Downwell (pace/format).

**Designed but unbuilt**: speed-based visible turn timeline with **hidden enemy intent** (you see *when* they act, not *what* they'll do — learn behaviors by observation); three attack archetypes (basic / charged / status: Freeze, Burn, Slow); Fire/Ice/Lightning ±50% weakness system; **stat-mod-first → synergy-later gem progression** (V1 flat bonuses like Ruby +2 Fire; V2+ combo pieces like Prism "gems count double" and Frostfire cross-element procs); path-gated rarity tables (Easy 70/25/5, Hard 40/40/20, Boss 20/40/40); clean scaling formulas (`HP = Base × (1 + (Room−1)×0.25)`).

**Built**: V0 only — one fixed encounter (player 50HP vs Goblin+Orc), fixed turn queue, tap-to-attack, win/loss/restart — but as a clean immutable pure-function combat engine.

**Its real deliverable is the testing methodology** (LAYOUT_STABILITY_REPORT.md, VISUAL_REGRESSION_TESTING.md, now generalized in `.claude/skills/layout-invariance.md`):
- Geometry-first CSS: containers declare `min-h` and reserve space for conditional content ("☠ DEFEATED ☠" occupies its slot even when absent); content adapts to containers, never the reverse.
- Tests assert on `getBoundingClientRect()`/`getComputedStyle()` pixels, not class names; written to fail first, exposing five real drift bugs (HP digit width, emoji line-height, name length…).
- Vitest Browser Mode + Playwright screenshots with committed baselines; documented caveat that jsdom (0×0 rects) passes falsely.
- Every dynamic text region gets an explicit overflow policy (truncate / clamp / scroll / overlay); design for hostile inputs (UUIDs, 2× localized text).

---

## 3. Reusable Mechanics Library

The distilled ideas worth pulling off the shelf for the next game:

**Hidden information & bluffing**
1. Decoy/feint duality — real action and bluff rendered identically to the opponent, down to fake damage tokens (Ninja Tanks).
2. Hidden production queue + public income — the opponent knows your budget but not your spend (Muju); this exact asymmetry is what makes honest AI belief-tracking tractable.
3. Visible turn timeline, hidden intent (Oracle) — you know when, not what.

**Auction & market dynamics**
4. Counter-bid with retained turn (FORGE) — desirable items tax themselves; losing an auction refunds tempo. Generalizes to any draft.
5. Cost composition as contestability signal (FORGE) — specific costs protect, generic costs invite contest.
6. Purchase-driven market expansion (FORGE) — the option space grows spatially from where players act.

**Territory & economy**
7. Anchor-rectangle spawning + binary enemy-blocking (Muju) — one rule creates a whole territory game.
8. The well/rope layered-resource model (Muju) — depth-gated extraction as organic tech-gating.
9. Denial with permanence — free BURN leaving adjacency-blocking RUINS (FORGE), plus burn-payoff cards to make it an archetype.

**Combat**
10. Damage as temporary defense erosion (Muju) — combined attacks without HP bookkeeping.
11. Position-gated action legality (Ninja Tanks' LEGAL_SHOTS) — compact way to make positioning drive offense.
12. Deterministic simultaneous resolution ordering — moves before shots (Ninja Tanks).

**Scoring & progression**
13. End-game-only conditional VP with baseVP-0 engine cards (FORGE) — guaranteed-vs-speculative value tension across multiple legible axes.
14. Stat-mods-first, synergies-later content roadmap (Oracle) — prove the loop with flat bonuses before shipping combo pieces.
15. Path-gated rarity as the single risk/reward lever (Oracle).
16. Cross-game continuity hooks — inert fields (`game3Effect`) that a sequel activates (FORGE/AZAD MINOR).

**Meta/UX**
17. Action log = chat thread with narrative flavor (Ninja Tanks) — free replay record.
18. One-click guest accounts to eliminate play friction (Ninja Tanks).
19. Full skin architecture — one codebase, multiple audiences (FORGE's horror ↔ cartoon swap).
20. AI transparency surfaces — debug console of candidate plans + player-facing "AI Recap" (Muju).

---

## 4. Engineering Playbook (what's already standardized)

- **Stack** (codified in `.claude/skills/frontend/`): React 19 + TypeScript strict + Vite 7 + Tailwind v4 + Vitest (browser mode) + Playwright. Each game is a sibling directory in the monorepo; `build-all.sh` + a static portal `index.html`; GitHub Pages deploy.
- **Architecture pattern proven three times**: pure immutable game logic in `src/game/` (state in → state out), a thin hook layer (`useGameState` via useReducer/useState), presentational components on top. Trivially unit-testable, replay-friendly, AI-simulation-ready. Persistence via localStorage with a schema version number (Muju bumped it for the white/black migration).
- **AI toolkit** (`.claude/skills/minimax-ai/` + Muju's engine-v2): minimax/alpha-beta with **optionality-based evaluation** for perfect-information games; the observation-split → belief-particles → beam-planner → ISMCTS pipeline for hidden-information games. Scale difficulty by search budget, never by rule changes.
- **Balance method** (`.claude/skills/strategy-mindset/` + FORGE's analysis): think like a slime mold seeking the exploit; avoid the vacuum fallacy (account for accessibility constraints and contest costs, not just raw ratios); design for triangularity; aim archetypes at a 45–55% band; log tuning candidates but *test before changing*.
- **UI discipline** (`.claude/skills/layout-invariance.md`, `ux-affordances/`, Oracle's reports): geometry-first CSS, explicit overflow policies, pixel-level layout tests in a real browser; and for every rule in the spec, an **affordance checklist** — where does the player find the action, see costs/locks, and get feedback? (Muju's queue-phase gap is the cautionary example.)
- **Test discipline** (`.claude/skills/test-matching/`): read the implementation before writing tests; tests must fail for the right reasons.

---

## 5. Design-Process Lessons (the expensive ones)

1. **Settle the core interaction chart early, on paper.** Muju's element system shipped three different relationship charts, with spec/code/tests drifting apart each time. The repo's CLAUDE.md rule exists because of this: *a design change isn't done until spec, in-game instructions, code comments, tests, and README all agree.*
2. **One self-balancing rule beats a page of tuning.** FORGE's "outbid loser keeps their turn" and Muju's "any enemy in the rectangle blocks spawning" each do more balancing work than any stat table. Look for the single rule that makes the economy police itself.
3. **Docs lag reality in both directions.** FORGE's README checkboxes say features are missing that exist; the portal calls V0 Oracle "Fully Playable." Keep a single status source of truth.
4. **Scope the spec into shippable versions and honor them.** Oracle's V0→V3 ladder was correct — V0 got built and is clean. The failure mode is FORGE's, where Phases 2–4 (AI, multiplayer, animation) were spec'd in detail and never started.
5. **Keep a decision log with explicit open questions.** Muju's AI_ENGINE_QUESTIONS.md made deferred decisions visible instead of implicit — the unanswered ones (Q4–Q12) are still findable.
6. **Test the layer you're actually shipping.** 2013: tested server logic, untested UI. Oracle: bulletproof UI tests, almost no game. The next project should do both from day one — the tooling now exists for each.
7. **Playtest against the degenerate strategy first.** Muju's AI gets "roflstomped by mass Fire_1 rush"; the strategy-mindset skill exists precisely to hunt these before players do.
8. **Multiplayer/online has never been finished in three attempts** (Ninja Tanks' Pusher/replays TODO, FORGE's WebSocket phases, Muju's "future considerations"). Either design the next game as deliberately local/hot-seat/vs-AI, or commit to networking as a V1 pillar — not a perpetual Phase 4.

---

## 6. Open Threads a New Game Could Pick Up

- **Blind Loyalty** and **Hex Strike** — two designed-but-never-built board games from the original site (the Rules model reserved slots for them). Hex Strike's name suggests the hex-grid tactics itch that none of the current games scratch.
- **AZAD MINOR series** — Games 1 (*Snatch*) and 4 are unbuilt, and Game 3 (*Skirmish*) would activate FORGE's dormant `game3Effect` combat abilities and army-import hooks. A tactical-combat Game 3 could also reuse Muju's engine and AI wholesale.
- **Oracle V1–V3** — the roguelike loop (drafting, paths, elements, boss) is fully specified and unbuilt, sitting on a clean V0 engine.
- **Muju's unresolved element chart + counter-rush AI** — the two known design debts of the flagship.
- **The never-shipped online layer** — ELO, replays, matchmaking — if the next game wants to be the one that finally ships it.

## 7. Recommendations for the Next Game

Grounded in what this portfolio proves you're good at and what's left on the table:

1. **Lead with one self-balancing hidden-information mechanic.** The house specialties are bluffing (Ninja Tanks), self-taxing auctions (FORGE), and hidden queues over public income (Muju). A new game that combines, say, timeline-visible/hidden-intent turns with a decoy mechanic would sit squarely in the studio's proven strengths — and the ISMCTS belief-model AI stack is already written for exactly this shape of game.
2. **Keep the AI-friendly information asymmetry rule.** Muju's "hidden spend, public income" is what made honest AI tractable. When designing hidden information, decide up front which channel stays public so the belief space stays small.
3. **Reuse the proven skeleton on day one**: sibling directory, frontend-skill scaffold, pure `src/game/` engine, layout-invariant components with real-browser tests, minimax-or-ISMCTS AI depending on information model, strategy-mindset balance pass before content lock.
4. **Ship ladder**: V0 = core interaction feel (Oracle-style), V1 = full loop vs AI hot-seat, V2 = content/skins — and decide explicitly at kickoff whether online play is in or out (lesson 8).
5. **Write the element-chart/interaction-triangle document first and freeze it**, with the CLAUDE.md sync rule enforced from commit one.
