# EMBER — Ultraplan

**A bite-sized LLM-piloted energy body in a pixel-art 2D wilderness.**

You watch a small ember-spirit — a glowing wisp in a dusk forest — kept alive by an
authoritative "energy body" kernel and piloted, at low frequency, by an LLM. The LLM
never sees ground truth and never mutates state: it reads a noisy interoceptive
rendering, publishes typed intents, and the body can surprise, constrain, and
overrule it. The demo hook: the ember's **glow radius is its fuel level**, and the
wolf only stalks a **dim** ember — internal state visibly drives world dynamics.

This is the vertical slice of the north-star architecture. Everything here is chosen
so the causal claims survive scrutiny (perturb the kernel → behavior changes; perturb
the prose → it doesn't) while fitting in 2–4 dynamic workflows.

---

## 1. What survives from the north star, what's cut

**Kept (load-bearing):**
- Authoritative body kernel, separate from the LLM. LLM is a bus subscriber, not the bus.
- Partial, noisy, attention-dependent interoception (`H(state, mode, attention) + noise`).
- Intents → skill runtime → arbiter; reflexes can interrupt deliberative plans.
- Global control modes as parameter bundles (perception, costs, interrupt thresholds).
- Append-only event log, seeded determinism, exact replay.
- Benchmark scenarios written before implementation (they are the exit criteria).
- Anti-role-play test (strip narration; behavior persists).

**Cut (deliberately):**
- Body graph topology → flattened to per-variable state + modes. (Regions appear only
  as interoception labels.)
- Plasticity/learning → one tiny teaser only (optional WF4): a `dangerScent` map that
  raises activation near past attack sites.
- Social co-regulation, ally agents → cut. One adversary (wolf) only.
- Learned predictive world model → replaced by hand-authored linear forecasts
  (`predicted_time_to_limit`) that still enable anticipatory behavior.
- Memory stores → a rolling, salience-filtered recent-events window only.

---

## 2. Game design

**World.** 48×32 tile grid, 16px tiles, procedurally generated from a seed:
grass, forest, rock, water, one **den** (shelter), scattered **deadwood** (large slow
fuel) and **sunpatches** (small fuel, daytime only). A day/night cycle (~400 ticks)
and occasional rain events. One **wolf** with a small FSM: `patrol → stalk → attack`,
keyed to the ember's glow — it only stalks when glow is below a threshold, and flees
bright flare-ups.

**Body variables (6):**

| var | drains | restores | consequences when deviant |
|---|---|---|---|
| `fuel` | every action, faster when cold | consume deadwood/sunpatch | dim glow (wolf!), collapse reflex at ~0 |
| `heat` | night, rain, water-adjacency | den, daytime, high fuel burn | movement slows, action costs rise |
| `damage` | wolf attacks, hazards | slow, only while resting | max speed cap, interoception noise up |
| `fatigue` | activity, time awake | `rest` | interoception noise up, skill precision down |
| `activation` | decays slowly (hysteresis) | threat events spike it | faster reflexes, narrowed perception FOV, forage precision down |
| `stability` | *derived*: falls as others deviate | — | gates skills (e.g. no `gather` when very low) |

**Modes** (kernel-computed from deviations, with hysteresis — never set by the LLM):
`EXPLORE`, `CONSERVE`, `DEFEND`, `RECOVER`. Each is a parameter bundle: perception
radius, action cost multipliers, interrupt thresholds, interoception salience weights.

**Reflexes** (arbiter-owned, can preempt any intent): flinch-step away from an
adjacent wolf attack; forced collapse-rest at `fuel ≈ 0`; flare (brief bright glow,
big fuel cost) when attacked at high activation.

**Skills:** `move_to(dest, style: direct|cautious)`, `gather(target)`,
`consume(item)`, `rest(duration)`, `shelter()`, `flee(from)`, `focus(region)`,
`wait()`. Each declares preconditions, per-tick costs, expected body effects,
interrupt conditions, failure modes.

**Pilot cadence.** 1 tick = 1 sim step; the pilot is consulted every 8 ticks *or* on
interrupt events (threat spotted, skill failed, reflex fired, limit-prediction
crossed). Between consultations the current intent runs under the skill runtime.

---

## 3. Architecture

```
ember/src/
  sim/        # authoritative world: grid, entities, wolf FSM, weather, tick loop
  events/     # typed event schemas, append-only log, snapshot + replay
  body/       # kernel: resources, setpoints, modes, forecasts, interoception
  skills/     # skill controllers, cost models, arbiter, reflexes
  pilot/      # PilotInterface, ScriptedPilot, LLMPilot (Anthropic), intent recorder
  scenarios/  # seeded demo scenarios + headless assertions
  render/     # canvas renderer, procedural sprite sheets, day/night/rain fx
  ui/         # React shell: panels, controls, scenario picker
```

**The tick loop (deterministic, no `Date.now`, seeded mulberry32 PRNG):**

```
1. world step        (weather, wolf FSM, resource renewal)      → world.* events
2. skill runtime     (advance active skill 1 tick)              → skill.* events
3. body kernel       F(x, world, action, mode)                  → body.* events
4. arbiter           (reflex check, interrupt-condition check)
5. if pilot due:     build ContextPacket → pilot → Intent → arbiter validates
6. append all events to log
```

**Replay rule:** a run is `(seed, scenarioId, recordedIntents[])`. LLM outputs are
recorded at the boundary, so replays are exact even though the LLM isn't
deterministic. CI runs scenarios against recorded intent fixtures + ScriptedPilot.

**Pilots.** `ScriptedPilot` (rule-based, default; makes the demo work with no API
key and anchors tests). `LLMPilot`: Anthropic API from the browser
(`dangerouslyAllowBrowser` + user-pasted key, default model `claude-sonnet-5`),
structured context in, **typed tool-call intent out** — free text is accepted only
into a non-causal `thought` field rendered as a speech bubble labeled "narration".

---

## 4. Type contracts (pinned — parallel agents implement against these)

```ts
type Vec = { x: number; y: number };
type Mode = 'EXPLORE' | 'CONSERVE' | 'DEFEND' | 'RECOVER';

interface BodyState {           // authoritative; owned by body/, never by pilot or UI
  fuel: number; heat: number; damage: number;      // 0..1
  fatigue: number; activation: number;             // 0..1
  stability: number;                               // derived, 0..1
  mode: Mode;
  debts: { fatigue: number };                      // overexertion debt: rest can't clear in one go
}

interface Interoception {       // what the pilot sees; lossy + noisy
  global: { activation: Bucket; capacity: Bucket; stability: Bucket; trend: string };
  salient: { region: string; qualities: string[]; confidence: number }[];
  drives: { drive: string; urgency: number; predictedTicksToLimit?: number }[];
  availableRegulation: string[];                   // skill names
}
type Bucket = 'very_low' | 'low' | 'mid' | 'high' | 'very_high';

interface Intent {              // the ONLY channel pilot → world
  goal: string;                                    // narration, non-causal
  skill: SkillName;
  params: Record<string, unknown>;
  interruptConditions: string[];                   // e.g. "activation_above_0.8"
  thought?: string;                                // speech bubble, non-causal
}

interface ContextPacket {       // the ONLY channel world → pilot
  observations: Observation[];                     // FOV- and mode-filtered
  interoception: Interoception;
  activeIntent: { intent: Intent; status: string } | null;
  recentEvents: SimEvent[];                        // salience-filtered, last K
  skills: { name: SkillName; feasible: boolean; estCost: Partial<BodyState>; whyNot?: string }[];
}

interface SimEvent { tick: number; topic: string; payload: unknown }  // append-only

interface Pilot { decide(ctx: ContextPacket): Promise<Intent> }

interface Scenario {
  id: string; seed: number;
  setup(world: World, body: BodyState): void;
  assert(log: SimEvent[]): ScenarioResult;         // headless, CI-runnable
}
```

**Engineering rules (non-negotiable):**
1. The LLM does not own state and cannot declare its body changed.
2. Internal state changes costs, perception, feasibility — not merely narration.
3. Interoception is partial; `focus()` improves confidence, never removes damage.
4. Kernel truth and pilot belief are separate objects; the UI's "ground truth" panel
   is a dev view, never fed to the pilot.
5. Every consequential transition is an event; every run replays exactly.
6. No wall-clock or unseeded randomness anywhere in `sim/`, `body/`, `skills/`.

---

## 5. Demo scenarios (written first; they are the acceptance tests)

| # | scenario | assertion (headless, over the event log) |
|---|---|---|
| 1 | **Rested vs. depleted** — identical map + goal, two initial bodies | trajectories diverge: depleted run contains a refuel/detour before goal; rested run doesn't |
| 2 | **Anticipatory shelter** — dusk approaching, agent afield | agent moves toward den *before* `heat` leaves its viable band (regulation precedes crisis) |
| 3 | **Dim ember, stalking wolf** — low fuel at night | wolf enters `stalk`; kernel enters `DEFEND`; perception narrows; post-threat, activation decays with hysteresis and cautious behavior persists ≥ N ticks |
| 4 | **Miscalibrated interoception** — high fatigue, noisy fuel signal | pilot's believed fuel diverges from truth; a run with `focus()` avoids the collapse the no-focus run hits |

**Cross-cutting evals:** causal grounding (perturb `fuel` mid-run without touching
any prose → plan changes; rewrite interoception prose without touching state →
authoritative behavior unchanged) and the **anti-role-play test** (ScriptedPilot +
narration stripped → scenarios 1–3 still pass, because the dynamics live in the kernel).

---

## 6. UI (the demo surface)

- **Canvas game view**: 16px procedural pixel art (sprites drawn programmatically to
  offscreen canvases — no asset pipeline), integer scaling, camera on the ember,
  glow radius ∝ fuel, day/night tint, rain fx, wolf, speech-bubble for `thought`.
- **Pilot panel** (what the LLM sees): interoception readout, current intent card,
  feasibility list — rendered exactly from the `ContextPacket`.
- **Ground-truth panel** (dev toggle): true meters + sparklines, current mode,
  wolf FSM state. Side-by-side with the pilot panel this *is* the pitch:
  belief vs. body.
- **Event ticker** + controls: pause / step / 1× / 4×, seed input, scenario picker,
  pilot selector (Scripted | Claude + key field), download/load replay.

---

## 7. Workflow decomposition (fable-supervised, sonnet-executed)

Each workflow: I author the script + contracts, `agent()` calls run with
`model: 'sonnet'`; verify/judge stages get higher effort. Every workflow ends with
tests green and a commit pushed to `claude/llm-energy-body-sim-1ol2sd`.

### WF1 — Headless core (sim + kernel + skills + scripted pilot)
- **Scaffold** (1 agent): Vite/React/TS/Tailwind/Vitest subproject per repo
  conventions; `types.ts` transcribed from §4; PRNG + event log utilities.
- **Build** (4 parallel agents, contracts-first so they don't collide):
  (a) `sim/` world gen + tick loop + wolf FSM + weather;
  (b) `body/` kernel: dynamics, modes w/ hysteresis, debt, forecasts, interoception;
  (c) `skills/` + arbiter + reflexes;
  (d) `scenarios/` harness + ScriptedPilot + the 4 scenario assertions (red first).
- **Integrate** (1 agent): wire modules, drive scenarios green.
- **Verify** (parallel adversarial agents): determinism/replay attack; causal-grounding
  perturbations; "can the pilot cheat?" audit (try to mutate state via intents).
- **Exit:** `npm test` green; 4 scenarios pass headless; replay byte-exact.

### WF2 — Pixel-art rendering + UI
- **Build** (3 parallel agents): (a) canvas renderer + procedural sprite sheets +
  animation + weather/night fx; (b) panels (pilot view, ground-truth toggle, ticker,
  meters); (c) controls, scenario picker, replay load/save.
- **Integrate + look** (pipeline): wire to sim; Playwright smoke tests; a screenshot
  agent runs each scenario, captures frames, and judges readability/pixel-art
  coherence; one fix round.
- **Exit:** demoable in browser with ScriptedPilot at 1×/4×; screenshots pass judge.

### WF3 — LLM pilot + demo polish
- **Build** (parallel): (a) `ContextPacket` serializer + Anthropic browser client +
  key UI + intent recorder/replayer; (b) system-prompt authoring against scenario
  transcripts (judge panel: 3 prompt variants scored on scenario pass-rate +
  intent-validity rate, winner synthesized).
- **Scenario tuning** (pipeline over the 4 scenarios): run with LLMPilot, record
  intent fixtures for CI, tune costs/thresholds where the LLM pilot degenerates.
- **Ship** (1 agent): root `index.html` tile + `build-all.sh` entry, README with the
  demo script (which scenario to show, what to point at), final push.
- **Exit:** full demo with either pilot; recorded-fixture CI green; anti-role-play
  toggle demonstrably passes.

### WF4 (optional, budget-permitting) — adversarial review + one plasticity teaser
- `/code-review`-style fan-out (correctness, simplification, perf) + fix round.
- `dangerScent`: attacks stamp a decaying field; entering it raises activation before
  any wolf is visible — the smallest honest taste of conditioning.
- Balance pass by a strategy-minded agent (is CONSERVE ever dominant? does the wolf
  matter?).

**Sizing:** ~4–6k LOC TS. WF1 is the heavy one (~half the total); WF2/WF3 are
moderate; WF4 is cheap. Demoable after WF2 (scripted pilot), fully on-concept after WF3.
