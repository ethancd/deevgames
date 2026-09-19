# T2 Phasing baseline verification — 2026-09-18

Prepared on `codex/phasing-v2-baseline`, base `2922375ef8c1f828f4bc5c1a411d1e19cdc2b6fd`, with uncommitted T2 sources. Rules: `muju-phasing-1`. This is direct V2 verification; the worker Phasing guard stays closed.

Reproduce from `muju/` with a fresh output directory:

```sh
node --import tsx lab/ai/phasing-selfplay.ts lab/ai/results/<new-name> 3
```

Nine full self-play games (three per difficulty), seeds 20260918–20260920, handicaps h0/h3. The third game per difficulty dispatches only the first action and re-searches; the other two replay the legal plan. One fixed-work allowance per player turn funds Act, upkeep and Prepare: easy 1200, medium 3000, hard 6000. Each search slice is charged in full, and exhausting the allowance causes legal phase completion. These are screening work limits, not production wall-budget rungs. Initial unit IDs are normalized so the complete trace is reproducible.

All 1,604 dispatched actions were legal. All nine games terminated naturally (seven home-checkmates, one upkeep elimination, one inactivity draw); zero caps. Every game purchased units: 183 purchases total, range 15–32 per game. Mean player-turn length: easy 24, medium 29.67, hard 26.33. Inactivity draw rate: 1/9 overall, 1/3 for hard. These small self-play samples do not establish a strength ordering or a purchase/draw-rate band. Gate 1 still requires T1's scripted-bot round-robin, frozen bands, and the preregistered comparison rows.

`identity.json` pins every TypeScript AI/game/kernel/lab source and the WASM/package-lock hashes. Each game includes its complete trace and trace hash; `summary.json` collects the rows. Timing fields are observations under concurrent verification load, not a responsiveness claim. `tests/ai/phasing.test.ts` separately repeats an identical seeded fixed-work game and checks trace equality.
