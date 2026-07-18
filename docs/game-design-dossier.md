# DeevGames — Game Design Dossier

*A synthesis of every game designed or built across two bodies of work — this repo (Ninja Tanks, FORGE, Muju Hono Tanka, Oracle of Delve) and prior Ethan × Claude conversations (LUMENGRID, Halflight, the Mage Ladder, Garden Guardians, and others) — compiled to inform the design of the next game. Repo sources: specs, balance analyses, git history, and the project skills in `.claude/skills/`. Conversation sources are noted by date so they can be retrieved.*

---

## 1. Portfolio at a Glance

### Repo projects

| Project | Genre | Status | Signature idea |
|---|---|---|---|
| **Ninja Tanks** (2013, Rails/jQuery) | 2p simultaneous-action bluffing duel | Shipped at deevgames.com | Decoy/feint fog-of-war: your move and your bluff look identical to the opponent |
| **Blind Loyalty** / **Hex Strike** | Designed board games | Never implemented | Unknown — designs predate the repo's docs |
| **FORGE** (React/TS) | 2p card drafting/auction on an expanding grid | Playable hot-seat; no AI, no online | Counter-bid auction where the outbid player keeps their turn |
| **Muju Hono Tanka** (React/TS) | 2p Go × Chess × StarCraft on a 10×10 grid | Most complete: full rules + imperfect-info AI | Three-phase turns (place → act → queue) + spawn-denial territory |
| **Oracle of Delve** (React/TS) | Mobile-first roguelike dungeon crawler | V0 combat prototype only | Layout-invariance testing methodology (its most finished artifact) |

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

Two arcs converge here. The repo arc: a 2013 server-authoritative Rails game with untested jQuery UI → a modern client-side React/Vite/Tailwind collection with pure-function engines, serious AI work, and rigorous UI-geometry testing. The conversation arc: single-file React artifacts that turned constraints into disciplines (solvability verification, bitmask engines) → increasingly ambitious designed-not-built briefs (Halflight, Mage Ladder) that need exactly what a Claude Code repo provides — test harnesses, API integration, persistence.

---

## 2. Repo Project Profiles

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

## 3. Conversation Project Profiles

### 3.1 Built & playable

**LUMENGRID** (July 2026) — Laser-routing puzzle game, React single-file, mobile-friendly blocky aesthetic. Players route colored beams through mirrors, splitters, and filters to illuminate sockets requiring exact RGB combinations.
- **Engine:** additive light mixing as bitwise OR on color masks (R=1, G=2, B=4). Beams rendered in SVG with screen blend mode so overlapping red + green visually reads yellow.
- **Content:** two worlds × ten levels. W1 teaches mirror rotation, drag repositioning, mixing, filters, splitters, linked toggle-mirrors. W2 introduces composite glass (amber/cyan/magenta two-channel filters → subtractive logic), poison-beam deflection (overfed sockets; the solve is diverting excess color), and swap-drag in tight spaces.
- **Tooling worth stealing:** all 20 levels machine-verified with a standalone Node.js engine script proving each level solvable from its solution sequence and *not* pre-solved from its start state. This verifier pattern generalizes to any deterministic puzzle game.
- **Status:** shipped as artifact; later patched to unlock W2 from the start.

**Lumen Works** (June 2026) — LUMENGRID's predecessor: a "miniature Factorio about combining primary colors of light." Grid-based, live beam simulation, mirrors/prisms/combiners, exact-color targets (over-mixing is not a valid solve). Five levels plus sandbox. Dark synthwave lab aesthetic, CSS keyframe glow, Chakra Petch + Spline Sans Mono. Superseded mechanically by LUMENGRID, but the **sandbox mode** and the **combiner** (multi-input, rotatable output) didn't carry forward — both are still worth mining.

**Hexagon Maze** (Sept 2024) — Small React component: honeycomb grid, click cells in numbered sequence. Origin point of the "code me up a puzzle in React" pattern; mechanically thin but the axial-coordinate hex rendering code exists.

### 3.2 Designed, not yet built

**Halflight** (July 2026) — *closest to a ready brief.* Fictional 2020s indie game invented from a riff on dollar purchasing power as radioactive decay. Studio: Glowworm Games. Fully art-directed (pixel-art fold-out poster: decay-map taxonomy on the front, biome/gem-concentration world map on the back, Tunic-manual energy).
- **Core loop:** Moonlighter-style — delve for gems by day-equivalent, run a shop with them, except every gem has a condition-dependent half-life. Inventory literally decays.
- **Named mechanics:** decaying inventory, heat/critical mass (stacking hot gems is dangerous), decay-as-mana (spend a gem's remaining decay as a casting resource).
- **Explicit standing request:** a playable React prototype of the core loop. This is the one project where the ask is already on file.

**The Mage Ladder** (April 2026) — An LLM-as-game-engine research program disguised as a prototype sequence. Target: a text-only Mage: the Ascension engine where the LLM parses free-text intent, validates against Sphere mechanics and local Consensus Reality, scores Paradox risk, and narrates through each character's paradigm filter — two players in the same scene see different realities.
- Ten prototypes from **0.0.1** (coin flip + narrator: one bit of player agency, one bit of entropy, does the narrator make it *matter?*) up through D&D-rules text game (0.0.9) to full MtA (0.1).
- A markdown ladder document exists listing, per rung, the software systems to build and the validation tests each must pass.
- Core validation question: can a player try something the designer never anticipated, have it adjudicated consistently, see persistent world-state change, and feel they *discovered* an interaction? Failure modes named: yes-to-everything narrator, tyrannical reviewer.
- Needs: structured world-state, an intent parser/validator split, lightweight NPC agent loops (goals persisting across scenes). Explicitly does *not* need graphics, physics, real-time, or content volume — ten NPCs and a city block suffice.

**Palimpsest** (March 2026) — A values-alignment game wearing Homestuck mechanics, with a GDD written to read like its own subject matter (revisions bleeding through the text). Four prototype-ready mechanics were scoped:
- **Layerlink** — chat with two revisions of the same character simultaneously; one degrading, one who doesn't know you.
- **Peeling** — scrape layers off objects/scenes to expose earlier revisions, paying a Fidelity cost.
- **Personality parser** — constrained natural-language exploration where the parser itself has character.
- **Annotation** — write messages to "the Author" and watch an actual LLM misinterpret them; the alignment gap is the gameplay.

**Garden Guardians** (Jan 2026) — Two-player co-op deckbuilder for phones, designed to play with your spouse in 10–20 minute turn-based sessions around the kids. Aeon's End / Battle of Hogwarts lineage, but deliberately combat-free: fairies tending a garden with illusion and misdirection rather than attack/damage.
- Three fairy actions: **nurture** (grow/heal plants), **guide** (redirect animals), **weed** (remove growth-slowing weeds).
- Sacrifice economics: plants that won't fully mature can be fed to animals to protect higher-value crops.
- First-prototype card list already sketched: placeholder plants ("red vegetable," "green herb," "yellow flower"), jackalope (eats vegetables), caterpillars (eat herbs), weather (sunny/rainy/windy), ailments, weeds. Design note from the session: weeds beat pests into prototype 1 because they're the most intuitive garden threat.

**Resonance Roguelike** (Jan 2026) — Randall Collins' Interaction Ritual Chains theory rendered as a rhythm roguelike: geometric shapes grow through social encounters staged as musical synchronization challenges. A ~2,500-word spec exists covering mechanics, visuals, audio, and browser-prototype phases. The theoretical spine — emotional energy as the accumulating resource of successful ritual sync — is the distinctive part.

**Elemental Magic Chess** (April 2025) — Chess with elemental visual effects and interactions; a full phased plan exists for a 2D Canvas/Pixi.js browser prototype (chess logic, sprite animation system, particle effects, then multiplayer/skins). Standard chess underneath.

**Dynamic Piece Strength** (Jan 2025) — Tactical board game mechanic set: pieces strengthen or weaken based on move recency. Status taxonomy — **exhausted** (just moved, −25%), **prepared** (waited, +15%), **rusted** (idle too long), **energized** (power-up). TypeScript interfaces and a balance-constant skeleton were drafted. A mechanic in search of a game; pairs naturally with Halflight's decay theme — and with Muju, where move-recency statuses would slot directly into the existing action-step economy.

### 3.3 Adjacent material

- **D&D campaign (ongoing, July 2026):** solo theatre-of-the-mind 5e with Claude as DM, tone "weird and wondrous." Methan the forest-gnome Wild Magic sorcerer, the Register, Saltstair. A live worldbuilding vein if the new game wants a setting rather than an abstraction.
- **Values-game and superintelligence-play threads:** recurring interest in games as vehicles for alignment intuitions (Palimpsest's Annotation, the Mage ladder's reviewer problem, the question of whether an ASI could solve hidden-information games without trial and error).

---

## 4. Player Profile (constraints the new game should respect)

- Plays in **10–30 minute interruptible sessions** — family context; games must survive being put down mid-thought. (The repo already has form here: localStorage persistence with schema versioning is standard in Muju/FORGE.)
- Sustained engagement comes from **system synergies and discovery-phase depth**: Balatro (100–200 hrs, then exhausted), Slay the Spire, Bloons TD6, Stardew, Hades 2. Loses motivation near completion; the discovery phase is the product.
- Comfortable with abstraction and framework-heavy themes (PCT, Kegan, IRC as live design tools) but also genuinely wants **cozy and non-combat** options for two-player family play. (FORGE's cartoon skin architecture is the existing bridge between mechanical density and family-friendly presentation.)
- Competitive gaming background; won't be scared off by mechanical density.

---

## 5. Reusable Mechanics Library

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

**Time & decay as resources**
10. Decaying inventory with condition-dependent half-lives (Halflight) — holding value is itself a decision.
11. Decay-as-mana (Halflight) — spend a resource's *remaining lifetime* as casting fuel; converts a liability curve into an ability economy.
12. Heat/critical mass (Halflight) — stacking valuable-but-hot items is dangerous; storage layout becomes gameplay.
13. Move-recency statuses (Dynamic Piece Strength) — exhausted −25% / prepared +15% / rusted / energized; tempo becomes a per-piece stat.

**Combat & tactics**
14. Damage as temporary defense erosion (Muju) — combined attacks without HP bookkeeping.
15. Position-gated action legality (Ninja Tanks' LEGAL_SHOTS) — compact way to make positioning drive offense.
16. Deterministic simultaneous resolution ordering — moves before shots (Ninja Tanks).
17. Combat-free threat verbs (Garden Guardians) — nurture / guide / weed replace attack/damage; sacrifice economics (feed doomed plants to animals) replace kill decisions.

**Puzzle & systems logic**
18. Bitmask channel mixing (LUMENGRID) — resources as bit flags, combination as OR, filtering as AND; exact-match targets where over-delivery fails.
19. Excess-as-hazard (LUMENGRID's poison beams / overfed sockets) — the puzzle inverts from "gather enough" to "divert the surplus."
20. Exact-color targets where over-mixing is invalid (Lumen Works) — precision beats accumulation.

**LLM-native mechanics**
21. Intent parser / rules validator split (Mage Ladder) — free-text player intent, mechanically adjudicated; the named failure modes (yes-to-everything narrator, tyrannical reviewer) are the design axis.
22. Paradigm-filtered narration (Mage Ladder) — two players in the same scene see different realities.
23. Annotation (Palimpsest) — an actual LLM misinterpreting the player's messages *as* the gameplay; the alignment gap made playable.
24. Layerlink/Peeling (Palimpsest) — simultaneous conversation with two revisions of one character; scraping scenes back to earlier revisions at a Fidelity cost.

**Scoring & progression**
25. End-game-only conditional VP with baseVP-0 engine cards (FORGE) — guaranteed-vs-speculative value tension across multiple legible axes.
26. Stat-mods-first, synergies-later content roadmap (Oracle) — prove the loop with flat bonuses before shipping combo pieces.
27. Path-gated rarity as the single risk/reward lever (Oracle).
28. Cross-game continuity hooks — inert fields (`game3Effect`) that a sequel activates (FORGE/AZAD MINOR).
29. Emotional energy as an accumulating ritual-sync resource (Resonance Roguelike) — a theory-derived progression spine.

**Meta/UX**
30. Action log = chat thread with narrative flavor (Ninja Tanks) — free replay record.
31. One-click guest accounts to eliminate play friction (Ninja Tanks).
32. Full skin architecture — one codebase, multiple audiences (FORGE's horror ↔ cartoon swap).
33. AI transparency surfaces — debug console of candidate plans + player-facing "AI Recap" (Muju).
34. Sandbox mode alongside authored levels (Lumen Works) — cheap discovery-phase extension for systems games.

---

## 6. Reusable Technical Assets & Engineering Playbook

**Standardized in the repo** (codified in `.claude/skills/`):
- **Stack**: React 19 + TypeScript strict + Vite 7 + Tailwind v4 + Vitest (browser mode) + Playwright. Each game is a sibling directory in the monorepo; `build-all.sh` + a static portal `index.html`; GitHub Pages deploy.
- **Architecture pattern proven three times**: pure immutable game logic in `src/game/` (state in → state out), a thin hook layer (`useGameState` via useReducer/useState), presentational components on top. Trivially unit-testable, replay-friendly, AI-simulation-ready. Persistence via localStorage with a schema version number.
- **AI toolkit** (`.claude/skills/minimax-ai/` + Muju's engine-v2): minimax/alpha-beta with **optionality-based evaluation** for perfect-information games; the observation-split → belief-particles → beam-planner → ISMCTS pipeline for hidden-information games. Scale difficulty by search budget, never by rule changes.
- **Balance method** (`.claude/skills/strategy-mindset/` + FORGE's analysis): think like a slime mold seeking the exploit; avoid the vacuum fallacy (account for accessibility constraints and contest costs, not just raw ratios); design for triangularity; aim archetypes at a 45–55% band; log tuning candidates but *test before changing*.
- **UI discipline** (`.claude/skills/layout-invariance.md`, `ux-affordances/`, Oracle's reports): geometry-first CSS, explicit overflow policies, pixel-level layout tests in a real browser; and for every rule in the spec, an **affordance checklist** — where does the player find the action, see costs/locks, and get feedback?
- **Test discipline** (`.claude/skills/test-matching/`): read the implementation before writing tests; tests must fail for the right reasons.

**Proven in conversation artifacts, ready to import:**
- **Node.js solvability verifier** (LUMENGRID): prove every shipped level solvable from its solution sequence *and* not pre-solved from its start state. Adaptable to any deterministic state-machine game; a natural CI step in this repo — and the same discipline extends to procedural content ("every generated day's stock must be survivable").
- **Bitmask color/resource engine** + SVG screen-blend rendering (LUMENGRID, Lumen Works).
- **Single-file React game shell**: hooks-only state, inline styles, no build deps, mobile-first — the artifact constraint turned into a discipline; useful for fast V0s before graduating into the repo scaffold.
- **Hex-grid axial-coordinate rendering** (Hexagon Maze) — relevant if Hex Strike or any hex tactics game gets built.
- **LLM-engine architecture sketch** (Mage Ladder): intent parser → rules validator → world-state mutation → paradigm-filtered narration, with NPC agent loops. In a Claude Code project this maps to real API calls rather than artifact constraints — the ladder's 0.0.1–0.0.3 rungs become buildable in an afternoon, with each rung's validation tests as actual test files.
- **Structured game-state JSON round-tripping** through completions (the stateful-app pattern from prior artifact work).

---

## 7. Design-Process Lessons (the expensive ones)

1. **Settle the core interaction chart early, on paper.** Muju's element system shipped three different relationship charts, with spec/code/tests drifting apart each time. The repo's CLAUDE.md rule exists because of this: *a design change isn't done until spec, in-game instructions, code comments, tests, and README all agree.*
2. **One self-balancing rule beats a page of tuning.** FORGE's "outbid loser keeps their turn" and Muju's "any enemy in the rectangle blocks spawning" each do more balancing work than any stat table. Look for the single rule that makes the economy police itself.
3. **Machine-verify your content.** LUMENGRID shipped 20 levels each proven solvable-but-not-pre-solved by a standalone script. No repo game has an equivalent (FORGE's balance analysis is analytical, not simulated). The verifier belongs in CI for the next game from day one.
4. **Docs lag reality in both directions.** FORGE's README checkboxes say features are missing that exist; the portal calls V0 Oracle "Fully Playable." Keep a single status source of truth.
5. **Scope the spec into shippable versions and honor them.** Oracle's V0→V3 ladder and the Mage Ladder's 0.0.1→0.1 rungs are the same correct instinct — the smallest version that answers a real question ("does the narrator make one bit *matter*?"). The failure mode is FORGE's, where Phases 2–4 were spec'd in detail and never started.
6. **Keep a decision log with explicit open questions.** Muju's AI_ENGINE_QUESTIONS.md made deferred decisions visible instead of implicit — the unanswered ones (Q4–Q12) are still findable.
7. **Test the layer you're actually shipping.** 2013: tested server logic, untested UI. Oracle: bulletproof UI tests, almost no game. The next project should do both from day one — the tooling now exists for each.
8. **Playtest against the degenerate strategy first.** Muju's AI gets "roflstomped by mass Fire_1 rush"; the strategy-mindset skill exists precisely to hunt these before players do.
9. **Multiplayer/online has never been finished in three attempts** (Ninja Tanks' Pusher/replays TODO, FORGE's WebSocket phases, Muju's "future considerations"). Either design the next game as deliberately local/hot-seat/vs-AI, or commit to networking as a V1 pillar — not a perpetual Phase 4. Garden Guardians forces this question immediately: two phones means real persistence, the most Claude-Code-shaped requirement in the candidate list.
10. **Successor games shed good ideas — audit the predecessor.** LUMENGRID superseded Lumen Works but dropped the sandbox mode and combiner; FORGE's series hooks sit dormant. When iterating, explicitly decide what *not* to carry forward rather than losing it by default.

---

## 8. Open Threads a New Game Could Pick Up

- **Halflight prototype** — the one project with an explicit standing request on file (playable React core loop).
- **Blind Loyalty** and **Hex Strike** — two designed-but-never-built board games from the original site (the Rules model reserved slots for them). Hex Strike's name suggests the hex-grid tactics itch that none of the current games scratch — and the axial-coordinate hex rendering code already exists.
- **AZAD MINOR series** — Games 1 (*Snatch*) and 4 are unbuilt, and Game 3 (*Skirmish*) would activate FORGE's dormant `game3Effect` combat abilities and army-import hooks. A tactical-combat Game 3 could also reuse Muju's engine and AI wholesale.
- **Oracle V1–V3** — the roguelike loop (drafting, paths, elements, boss) is fully specified and unbuilt, sitting on a clean V0 engine.
- **Muju's unresolved element chart + counter-rush AI** — the two known design debts of the flagship.
- **Mage Ladder rungs 0.0.1–0.0.4** — buildable now that real API calls and test harnesses are available.
- **Lumen Works' orphaned sandbox mode and combiner** — cheap additions if LUMENGRID ever graduates into the repo.
- **The never-shipped online layer** — ELO, replays, matchmaking — if the next game wants to be the one that finally ships it.

---

## 9. Candidate Briefs

Three directions from the conversation history, each anchored in existing material, plus one repo-native option; pick one or hybridize.

**A. Halflight: the prototype.** The standing request. Decaying-gem inventory, shop loop, heat/critical mass, decay-as-mana. Real-time decay ticks give it the Balatro-ish "every run is a resource-curve puzzle" texture; the dynamic-piece-strength status taxonomy (exhausted/prepared/rusted) slots directly into gem states. Session-friendly by construction — a shop day is a natural 10-minute unit. Deliverable: playable core loop, then the solvability-verifier discipline applied to procedural gem-batch generation (every day's stock must be survivable). *Repo assets that plug in:* the frontend scaffold, pure-`src/game/` engine pattern, layout-invariance testing (a decaying-number-heavy UI is exactly the hostile-content case it was built for), and a strategy-mindset balance pass on the gem taxonomy before content lock.

**B. Climb the Mage Ladder.** Build 0.0.1 through ~0.0.4 as a real repo: coin-flip narrator, then stats, then persistent world-state, then a rules validator — each rung with its validation tests as actual test files. This is the project where Claude Code's strengths (test harnesses, API integration, iterative scaffolding) matter most, and it doubles as alignment-flavored research. Palimpsest's Annotation mechanic is a natural side-quest on the same infrastructure. *Repo assets that plug in:* the test-matching discipline and the AI_ENGINE_QUESTIONS-style decision log — the parser/validator split is exactly the kind of system that churns without one; Ninja Tanks' dry-run validation pass is the same shape as the intent-validator (simulate before committing world-state).

**C. Garden Guardians, digital.** The two-player cozy deckbuilder, built for pass-and-play or two phones. The card list and action verbs already exist; what's missing is the turn engine and a first balance pass. Highest household-utility-per-line-of-code; lowest mechanical novelty. Storage/multiplayer needs make it the most Claude-Code-shaped of the three (a real backend or at least persistent state, not an artifact). *Repo assets that plug in:* Muju's pass-and-play mode and schema-versioned persistence are working reference implementations; FORGE's skin architecture fits the cozy presentation; lesson 9 above says the online decision must be made at kickoff, not deferred — this is the brief that finally forces it.

**D. (Repo-native alternative) Skirmish / Hex Strike.** A tactical-combat game that activates FORGE's dormant `game3Effect` army-import hooks, reuses Muju's rules engine and imperfect-information AI stack wholesale, and optionally lands on the hex grid that Hex Strike promised and the axial-coordinate code supports. Highest reuse of the repo's deepest assets (the AI engine); lowest fit with the cozy/interruptible constraints in the player profile unless deliberately scoped to short scenarios.

Open question, deliberately left to the project kickoff: whether the new game is *for you* (A or B), *for the household* (C), or *for the studio's existing universe* (D).
