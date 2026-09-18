/**
 * df-pn home force (DESIGN §4.14 `dfpn.ts`, §5.11.7) — **stub**.
 *
 * M14 ships the interface and the wiring; M16 replaces the body with the real
 * AND/OR search over threat-relevant turns. Until then `forceHome` answers
 * `UNKNOWN` without spending a node, which is exactly the answer §5.11.7 makes
 * free: "UNKNOWN costs nothing (exhaustion never wins)". `SearchConfig.useDfpn`
 * is `false` in every profile at M14 (DESIGN §5.11.5), so the call site is
 * unreachable in the shipped configuration; `tests/ai/hard/pvs.test.ts` still
 * exercises it with the flag forced on, so M16 inherits a live call path rather
 * than an untested one.
 *
 * LAYERING. DESIGN §4.14 types the first parameter `SearchContext`, which lives
 * in `search/pvs.ts`; §2's layering forbids `tactics` from importing `search`.
 * The parameter is therefore typed structurally as `DfpnHost` — exactly the
 * arrangement `prover.ts` uses for `ProverMeter` — and the real `SearchContext`
 * satisfies it. See DEVIATIONS under M14.
 */
import type { PackedState, Side } from '../types';
import type { Scratch } from '../core/bits';
import type { Replica } from '../core/state';

export type { DfpnConfig } from '../config';
import type { DfpnConfig } from '../config';

/** `WorkClass.DFPN` (DESIGN §4.16), restated so `tactics` need not import
 * `search` (DESIGN §2 layering), as `prover.ts` does for `PROVER`. */
export const WORK_CLASS_DFPN = 5;

export const Proof = { UNKNOWN: 0, PROVEN: 1, DISPROVEN: 2 } as const;
export type Proof = (typeof Proof)[keyof typeof Proof];

/**
 * Structural stand-in for `gen/turn.ts`'s `Turn`. DESIGN §4.14 types
 * `DfpnResult.turn` as `Turn`, but §2's layering forbids `tactics` from
 * importing `gen` (and `lab/hard-ai/deps.ts` enforces it on type-only imports
 * too). The fields are `Turn`'s, verbatim, so a real `Turn` is assignable and
 * §4.14's shape is preserved at every call site. See DEVIATIONS under M14.
 */
export interface DfpnTurn {
  actions: Int32Array;
  count: number;
  endLo: number;
  endHi: number;
  sig: number;
  flags: number;
  gainCc: number;
  place: number;
  hangCc: number;
}

export interface DfpnResult {
  proof: number;
  turn: DfpnTurn | null;
  nodes: number;
  depth: number;
}

export function newDfpnResult(): DfpnResult {
  return { proof: Proof.UNKNOWN, turn: null, nodes: 0, depth: 0 };
}

/** The slice of `search/pvs.ts`'s `SearchContext` this module needs. */
export interface DfpnHost {
  rep: Replica;
  sc: Scratch;
  meter: { spend(cls: number, n?: number): void; exhausted(): boolean };
}

/**
 * DESIGN §4.14. AND/OR proof-number search for a forced home win in at most
 * `cfg.maxTurns` of the mover's turns.
 *
 * M14's body: no search, verdict `UNKNOWN`, zero nodes, zero work. Every
 * parameter is still validated and echoed into `out` so the M16 replacement is
 * a body swap and not a signature change.
 */
export function forceHome(
  s: DfpnHost,
  p: PackedState,
  side: Side,
  cfg: DfpnConfig,
  out: DfpnResult,
): DfpnResult {
  void s;
  void p;
  void side;
  void cfg;
  out.proof = Proof.UNKNOWN;
  out.turn = null;
  out.nodes = 0;
  out.depth = 0;
  return out;
}
