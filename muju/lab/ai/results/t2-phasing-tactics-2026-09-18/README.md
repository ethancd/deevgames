# T2 Phasing baseline verification — 2026-09-18

Prepared on `codex/phasing-v2-baseline`, base `2922375ef8c1f828f4bc5c1a411d1e19cdc2b6fd`, with uncommitted T2 sources. Rules: `muju-phasing-1`. This is direct V2 verification; the worker Phasing guard stays closed.

Reproduce from `muju/` with a fresh output directory:

```sh
npm run ai:tactics -- lab/ai/results/<new-name>
```

28 Phasing fixtures, 84 difficulty/fixture decisions, all 36 expected rescues cleared. `metadata.json` records source and WASM identity, and `tactics.json` contains the individual rows. Fixtures use `phasingTacticalFixtures()`; the original `tacticalFixtures()` remains unchanged for Standard/Hard consumers. Phasing rescues use actual units and Act only. Prepare and pending upkeep return unknown, with no promotion or purchase search.
