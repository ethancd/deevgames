/**
 * Position loading for `eval-audit.ts` (E3.1, lane 4).
 *
 * Two on-disk shapes reach the evaluation audit and neither is a `GameState`
 * on its own:
 *
 *   - `muju-position-v1` JSONL (`lab/hard-ai/positions/*.jsonl`,
 *     `lab/hard-ai/suites/*.positions.jsonl`), read by
 *     `positions/corpus.ts readPositions`. Each row pairs a canonical
 *     `GameState` with a `rules` block, because the element graph, the upkeep
 *     schedule and the combat handicap are process-global knobs in `src/game`
 *     that a bare `GameState` does not carry.
 *   - `muju-exam-case-v1` JSONL (`lab/hard-ai/exam/cases/*.jsonl`), read by
 *     `exam/format.ts readCases`. A case stores its position either as an
 *     embedded `state` or as a `recipe` (an opening plus the plies played after
 *     it); `loadCaseState` materialises both through the shipped rules and
 *     REFUSES a recipe that has stopped being legal. `loadCaseState` installs
 *     and restores the rules globals itself, so it is called OUTSIDE any
 *     `withOpeningRules` scope — the same ordering `exam/format.ts`'s header
 *     demands.
 *
 * Both are flattened to one `AuditItem` shape so the audit's measurement loop
 * has a single case to write. The rules block travels with the item; the audit
 * installs it around every pack and evaluation.
 */
import type { GameState } from '../../../src/game/types';
import { readPositions, type RulesBlock } from '../positions/corpus';
import { readCases, loadCaseState } from '../exam/format';

export interface AuditItem {
  /** Unique within one audit run; exam ids and position ids never collide in practice. */
  id: string;
  /** The file this item came from, as the CLI spelled it. */
  source: string;
  /** `position` for `muju-position-v1`, `exam` for `muju-exam-case-v1`. */
  kind: 'position' | 'exam';
  /**
   * A reporting bucket inside one file. Position files use `'corpus'`. Exam
   * cases use `'loss-root'` when `source.kind === 'loss'` (a root carried over
   * from a real E1.1 loss) and `'authored'` otherwise, so the audit can report
   * the loss roots separately as E3-PLAN.md's lane 4 row asks.
   */
  bucket: 'corpus' | 'loss-root' | 'authored';
  rules: RulesBlock;
  state: GameState;
  /** Free tags carried from the source row, for the artifact only. */
  tags: string[];
}

/** Every row of a `muju-position-v1` file, in file order. */
export function loadPositionFile(file: string): AuditItem[] {
  return readPositions(file).map(sp => ({
    id: sp.id,
    source: file,
    kind: 'position' as const,
    bucket: 'corpus' as const,
    rules: sp.rules,
    state: sp.state,
    tags: sp.tags ?? [],
  }));
}

/**
 * Every case of a `muju-exam-case-v1` file, materialised. A case whose recipe
 * no longer replays throws out of `loadCaseState`; the audit catches it and
 * records the case as skipped rather than repairing anything (E3-PLAN.md's
 * "no fixture is repaired because the engine disagrees with it").
 */
export function loadExamFile(file: string): AuditItem[] {
  const out: AuditItem[] = [];
  for (const c of readCases(file)) {
    out.push({
      id: c.id,
      source: file,
      kind: 'exam',
      bucket: c.source.kind === 'loss' ? 'loss-root' : 'authored',
      rules: c.rules,
      // `loadCaseState` installs and restores the rules globals on its own.
      state: loadCaseState(c),
      tags: [...c.tags, `exam:${c.kind}`],
    });
  }
  return out;
}
