# Hard AI under `muju-phasing-4` (Cleave without a tier cap) — 2026-09-23

**Status: rules-correct, untuned, unmeasured.**

- Every `muju-phasing-3` strength, ladder and suite record — including
  `RELEASE-2026-09-23-phasing-3-retune.md` and `phasing/p3-retune-2026-09-22/` — is valid only for
  its own revision. No strength claim exists for `muju-phasing-4`.
- The engine replicates the uncapped chain: replica legality, kill/threat/approach tables, prover
  (`MAX_ATTACKS` 4), WASM kernel (ABI 8), Zobrist (a fourth-attack word per square appended last,
  so keys for counts 0..3 are unchanged), and Tier I bodies now count in chain tables,
  `CleaveExposure` and invariant 12. `DEFAULT_WEIGHTS` and the eval schema are unchanged, so the
  weights were fitted to the capped rule.
- Correctness veto (Gate 0) passes: perft canonical and replica, differential fuzz, determinism;
  new replica-vs-canonical perft parity cases cover multi-kill chains.
- Owed to the next measurement campaign: a p4 scripted reference and re-frozen Gate 1 bands (Gate 1
  refuses at this revision until then), a re-authored suite bundle with floors, and any retune.
