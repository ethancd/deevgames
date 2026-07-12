# EMBER

A bite-sized LLM-piloted energy body in a pixel-art 2D wilderness.

You watch a small ember-spirit — a glowing wisp in a dusk forest — kept alive by an
**authoritative energy-body kernel** and, optionally, piloted at low frequency by an
LLM (Claude). The kernel is the source of truth for everything: fuel, heat, damage,
fatigue, activation, stability, the world, the wolf. The LLM is a **subscriber to
that state**, never an owner of it — every tick it might see a noisy, partial
reading of the body and publish a typed *intent* (a skill + params), but it cannot
declare the body's state to be anything, and a skill runtime + arbiter stand between
its intent and anything actually happening. Reflexes (collapse, flinch, flare) can
preempt the LLM's plan outright.

The demo hook: the ember's **glow radius is its fuel level**, and the wolf only
stalks a **dim** ember — internal state visibly drives world dynamics, not narration.

Default pilot is a deterministic, rule-based `ScriptedPilot` (no API key needed —
the app is fully playable and demoable out of the box). Swap in Claude from the
control bar to watch a real LLM read the same noisy interoception and make its own
calls — and watch it be wrong sometimes, because it only ever sees belief, not
ground truth.

---

## Quickstart

```bash
cd ember
npm install
npm run dev
```

Opens on **http://localhost:3003**. Loads straight into the `night-defend` preset —
a dim ember with a wolf already closing in — so there's something to watch
immediately, no setup required.

Other scripts:

```bash
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # preview the production build
npm test           # vitest run (headless core + component tests)
npm run test:watch
npm run test:e2e   # Playwright, against a real dev server
npm run eval       # live LLM-pilot eval harness (see below) — needs ANTHROPIC_API_KEY
```

---

## Presets

Selectable from the **preset** dropdown in the control bar; each restarts the sim
from a specific staged situation (seed + body overrides + world patch — see
`src/ui/presets.ts`):

| preset | what it stages |
|---|---|
| **Free Run** | Freshly generated wilderness, healthy ember, no staging — just explore. |
| **Day · Explore** | Well-fed ember ranging in daylight; calm `EXPLORE` contrast frame, no threats. |
| **Night · Defend** (default) | Dim ember at night, wolf already within scent range — reaches `DEFEND` within moments of play. |

---

## Pilot setup (Claude)

1. In the control bar, switch the **pilot** dropdown from `Scripted` to `Claude`.
2. Paste an Anthropic API key into the field that appears (input is
   `type="password"`; the key is stored **only** in
   `localStorage['ember.anthropicKey']` on your machine — it is never sent
   anywhere but `api.anthropic.com`, never logged, never written into any
   event, replay, or exported JSON — see "Engineering rules" below).
3. Pick a model (`claude-sonnet-5` default, or `claude-haiku-4-5` /
   `claude-opus-4-8`) and click **connect**.
4. The sim keeps running the whole time — `setPilot` swaps the live decision-maker
   without restarting anything. **"forget key"** clears storage and falls back to
   Scripted instantly.

**Costs are yours.** Every consultation while `Claude` is selected is a real, billed
Anthropic API call (non-streaming, `max_tokens` ~1024, thinking disabled — this is a
sub-second game-loop decision, not a reasoning task). The pilot is consulted every 8
ticks or sooner on an interrupt (threat spotted, skill finished/failed, a
threshold crossed), so at 1× speed that's roughly one call every second of
wall-clock play while Claude is active. If a call fails (bad key, rate limit,
network), the pilot falls back to a safe `wait` intent — the ember keeps living,
reflexes still protect it — and the control bar surfaces the error.

---

## Demo script (~2 minutes)

A suggested walkthrough for showing this live:

1. **Start on `Night · Defend`** (it's the default — just load the page). Point out
   the glow radius is visibly small, and the wolf is already prowling nearby in the
   ground-truth panel's `wolf: PATROL` line.
2. **Switch the pilot to Claude**, paste a key, connect. Now put the **Pilot view**
   panel (what Claude sees — literally rendered from the same `ContextPacket` it
   receives) side-by-side with the **Ground Truth panel** (dev toggle, on by
   default) — *this pairing is the whole pitch*: belief vs. body. Point out the
   pilot's interoception is bucketed (`very_low`..`very_high`) and confidence-scored,
   never exact numbers; watch it occasionally diverge from what the ground-truth
   meters actually say.
3. **Wolf STALK at dim glow.** Within moments the wolf's FSM state flips
   `PATROL → STALK` (ground-truth panel) purely because glow dropped under the
   threshold — no scripted trigger, it's a live kernel/FSM interaction. Watch the
   mode chip flip to `DEFEND` right after.
4. **Point at the DEFEND intent banner** (full-width amber banner in the pilot
   panel) and the **narrowed perception**: the pilot view's observation list visibly
   shrinks in `DEFEND` (`perceptionRadius` is genuinely smaller — check it against
   the ground-truth panel's radius if you want to go one level deeper).
5. **Flee route dots.** If the active intent is a `flee`/`move_to`, the canvas draws
   a dotted amber path from the ember toward its destination — point out this is the
   *actual* movement target the skill runtime is executing, not decoration.
6. **Contrast with `Day · Explore`.** Switch presets — bright ember, wide-open
   perception, calm `EXPLORE` mode, no wolf pressure. Same pilot, completely
   different behavior, driven entirely by internal state + time of day.
7. **Toggle narration off** (the `narration` checkbox). The speech bubble and the
   pilot intent banner's goal text disappear — but behavior does **not** change.
   This is the anti-role-play test made visible: the dynamics live in the kernel,
   not in the prose the model writes about itself.
8. **Download a replay** (`↓ replay`). Every intent the pilot ever issued is
   recorded; the downloaded JSON is a byte-for-byte replayable run — reload it with
   `↑ replay` (even on a different machine, without a key) and watch the exact same
   run happen again, deterministically, because replay consumes the recorded
   intents instead of consulting a pilot at all.

---

## Architecture

```
ember/src/
  core/       # pinned types.ts (never edited by module builders) + rng.ts, eventLog.ts
  sim/        # authoritative world: grid, worldgen, wolf FSM, weather, tick step
  body/       # kernel: resource dynamics, modes (w/ hysteresis), interoception, glow
  skills/     # skill defs (move_to/gather/consume/rest/shelter/flee/focus/wait),
              # arbiter (validateIntent), reflexes (collapse/flinch/flare)
  pilot/      # ScriptedPilot, LLMPilot (Anthropic), prompt variants, packet
              # serializer, intent tool schema, sdk transport, intent recorder
  scenarios/  # 4 seeded demo scenarios + headless CI assertions (PLAN.md §5)
  engine/     # createSim: wires sim -> skills -> body -> arbiter -> pilot each tick
  render/     # canvas renderer, procedural sprite sheets, camera, fx (day/night/rain)
  ui/         # React shell: session driver (SessionApi), presets, controls,
              # panels/ (PilotPanel, GroundTruthPanel, EventTicker)
scripts/
  llm-eval.ts # live LLM-pilot evaluation harness (npm run eval) — see below
e2e/          # Playwright specs against the real running app
```

**Tick order** (deterministic, seeded `mulberry32`-style PRNG, no `Date.now()` /
`Math.random()` anywhere in `sim/body/skills/engine/scenarios`):

```
1. stepWorld        — weather, wolf FSM, resource renewal
2. skill runtime     — advance the active skill exec one tick
3. stepBody          — the ONLY place BodyState mutates (kernel dynamics + modes)
4. reflex check      — collapse / flinch / flare; can preempt the active intent
5. interrupt check   — active intent's interruptConditions vs. current threat/vars
6. pilot consult (if due) — build a fresh ContextPacket from copies -> Pilot.decide()
                             -> validateIntent() (authoritative gate) -> adopt or reject
7. append every consequential transition as a SimEvent
```

---

## Engineering rules (non-negotiable)

1. **The LLM does not own state and cannot declare its body changed.** Its only
   output channel is `Intent { goal, skill, params, interruptConditions, thought }`
   — `goal`/`thought` are narration, never read by anything that changes state.
2. **Internal state changes costs, perception, and feasibility — not merely
   narration.** `DEFEND` narrows the pilot's own perception radius; noise in
   interoception scales with fatigue + damage; `focus()` raises confidence for one
   region and changes nothing else.
3. **Kernel truth and pilot belief are separate objects.** The ground-truth panel is
   a dev view — it is never fed to the pilot; the pilot only ever receives a
   `ContextPacket` built from deep copies.
4. **Every consequential transition is an event; every run replays exactly.** A run
   is `(seed, bodyOverrides/worldPatch, recordedIntents[])`. Because pilot outputs
   are recorded at the boundary, replay is byte-exact even though the LLM itself is
   not deterministic.
5. **`validateIntent()`/the arbiter is the one authoritative gate**, downstream of
   any pilot. `LLMPilot` does its own fail-fast structural validation of the model's
   tool call first (unknown skill, wrong param shape, missing field ⇒ treated as a
   failed consultation, safe `wait` fallback) — but a structurally valid intent can
   still be legitimately rejected by the arbiter (e.g. "no path to destination"),
   and that's fine; the pilot is just re-consulted on the normal cadence.
6. **No wall-clock or unseeded randomness in `sim/`, `body/`, `skills/`, `engine/`,
   `scenarios/`, `pilot/`.** The LLM pilot's *choices* are inherently
   nondeterministic — that's fine, because determinism is preserved via recorded
   intents, not via the pilot itself being pure.
7. **The API key never appears in a console log, a `SimEvent`, a `ReplayFile`, an
   exported JSON blob, or an error message.** It's captured once into the Anthropic
   client's closure (`src/pilot/sdkTransport.ts`) and never read back out or
   forwarded; thrown transport errors are normalized to a small fixed vocabulary
   (`authentication_error`, `rate_limit_error`, ...) that never echoes the SDK's own
   `.message`/`.error` text.

---

## Tests

As of this build: **379 tests passing across 41 Vitest files** (`npm test`) covering
`sim/`, `body/`, `skills/`, `pilot/` (including `LLMPilot` against hand-fabricated
fake transports), `scenarios/` (the 4 PLAN.md §5 scenarios + the anti-role-play +
replay-exactness suites), `engine/`, and the UI/render layer's component tests
(`// @vitest-environment jsdom`). Plus **11 Playwright e2e specs** across
`e2e/smoke.spec.ts` (app boot, canvas paints, tick advances, replay
download/upload round-trip) and `e2e/capture.spec.ts` (deterministic screenshot
capture of the two canonical demo compositions).

Run `npm test` yourself for current numbers — this section is a snapshot, not a
promise; treat any drift as a signal something changed underneath it.

---

## What is mocked vs. live

Being precise about this matters here more than in most projects, since the whole
point of EMBER is a real belief/ground-truth split — it would be easy to
accidentally fake the wrong half.

**Always live, never mocked:**
- The kernel (`sim/`, `body/`, `skills/`) — no simulated numbers anywhere; every run
  you watch is the real deterministic dynamics.
- `ScriptedPilot` — genuinely rule-based, reads only the `ContextPacket`.
- The actual Claude API call from the browser, when you paste a real key
  (`src/pilot/sdkTransport.ts` wraps `@anthropic-ai/sdk` with
  `dangerouslyAllowBrowser: true`) — nothing about that path is mocked or stubbed in
  the shipped app.

**Mocked / simulated, and why:**
- **This development environment has no Anthropic API key**, and per this
  project's hard rules, no agent building EMBER attempted a live API call at any
  point. `LLMPilot`'s own test suite (`src/pilot/llm.test.ts`) exercises every path
  — valid response, malformed tool input, refusal, 401/429/5xx, retry-then-fallback
  — entirely against hand-built fake `LLMTransport` functions, never a network call.
  `createSdkTransport()` itself is only smoke-tested (constructs without throwing)
  plus a fully unit-tested error-mapping table built from real SDK error *classes*
  constructed in-process — still no network.
- **`scripts/llm-eval.ts`** (`npm run eval`) is a live-eval harness intended to run
  each prompt variant × each of the 4 scenario situations × 3 seeds against the real
  API and print a pass-rate/intent-validity/latency table — but it too has never
  been run against a real key in this environment. It has been verified end-to-end
  via its `--dry-run` flag, which swaps in a small local fake transport (defined
  inline in that file, not imported from any test file) so the harness's plumbing —
  Sim wiring, event bookkeeping, table math, fixture writing — is proven to work.
  What it does *not* prove: anything about real model behavior, real prompt-variant
  quality, or real latency. Whoever has a key should be the one to actually run it.
- **Playwright e2e specs** drive the real app end-to-end but never select `Claude`
  as the pilot (no key available in CI/this environment either) — they exercise the
  full `ScriptedPilot` path plus every other UI affordance (presets, replay,
  narration toggle, dev panel).

---

## `npm run eval` — live LLM-pilot evaluation harness

`scripts/llm-eval.ts`, run via `npx tsx scripts/llm-eval.ts` (or `npm run eval`).

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run eval          # live run against the real API
npm run eval -- --dry-run                          # no key, no network, no cost
npm run eval -- --dry-run --ticks=24               # shorter trials
```

For each of the 3 prompt variants (`survivor` / `ranger` / `minimal`,
`src/pilot/prompts.ts`) × each of the 4 demo-scenario situations
(`rested-vs-depleted`, `anticipatory-shelter`, `dim-ember-wolf`,
`miscalibrated-interoception` — ids match `src/scenarios/index.ts`'s `SCENARIOS`) ×
3 seeds, it spins up a fresh `Sim` piloted by `createLLMPilot()` over the real
`createSdkTransport()`, runs it for a bounded number of ticks, and prints a
pass-rate / intent-validity-rate / mean-latency table. Every trial's recorded
intents are also written to `scripts/fixtures/` for later CI replay (each fixture
notes exactly how to reconstruct and replay it — see the file's header comment).

Without `ANTHROPIC_API_KEY` set (and without `--dry-run`), it prints a clear
"set ANTHROPIC_API_KEY" message and exits `0` — it never attempts a call it can't
make. **Costs are the user's**; the script prints an estimate of how many API calls
a live run will make before it starts.

Worth knowing: `Scenario.run()` (`src/core/types.ts`) is pinned to take zero
arguments and every scenario module hardcodes `ScriptedPilot` internally, so there's
no contract seam to inject `LLMPilot` through the scenario objects themselves. This
harness instead stages its own `worldPatch`/`bodyOverrides` pair per scenario id
(same technique `src/ui/presets.ts` already uses for the identical reason), and its
pass/fail heuristic is consequently a simpler, uniform survival check — not a
reimplementation of each scenario's own multi-part CI assertion. See the file's
header comment for the full reasoning.
