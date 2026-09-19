/**
 * The ladder's RULES IDENTITY, and the one place an opening is turned into a
 * start position (PHASING-2026-09-16, PHASING-PREREGISTRATION-2026-09-18).
 *
 * WHY THIS MODULE EXISTS. Two opening corpora now live side by side and they
 * are NOT interchangeable:
 *
 *   - the historical E0/E1/E2/E3/E4 books (`e0-openings.jsonl`, `e1-dev.jsonl`,
 *     `e2-val.jsonl`, …) were generated, replayed and measured under STANDARD.
 *     `ladder/openings.ts` replays them exactly as it always did, and every
 *     hash, digest and legality test over those corpora still holds.
 *   - the P1 book (`ladder/openings/p1-*.jsonl`) is PHASING. Its rows are
 *     replayed by `ladder/openings/phasing.ts`, which builds a
 *     `ruleset: 'phasing'` initial state, refuses any id that is not a `p1-`
 *     id, and folds the rules revision and the public pending summons into its
 *     own `gameplayDigest`.
 *
 * A Standard opening replayed as Phasing (or the reverse) does not fail loudly
 * on its own: the two rule sets share every action type, so the first few plies
 * of a short opening often replay under either. What comes out is a position
 * that no game of either rule set ever reached, measured as though it were
 * evidence. So the mapping from an opening to its rule set is made EXPLICIT
 * here, is checked before a run starts, and refuses rather than guesses.
 *
 * `lab/harness/runner.ts` is now Phasing-only (it throws on a non-Phasing
 * `initialState`), so `applyLadderOpening` is the only opening path a current
 * ladder run may take. `applyOpeningForRules` is the wider door the ANALYST
 * needs: `analyze/replay.ts` reconstructs historical Standard replays as well
 * as current Phasing ones, and it reads the rule set off the replay's own
 * `GameRecord.rulesVersion` rather than assuming today's.
 */
import type { GameState, Ruleset } from '../../../src/game/types';
import {
  INITIAL_OPENING_ID,
  applyOpening as applyStandardOpening,
  initialStateFor as standardInitialStateFor,
  type OpeningSpec,
  type OpeningStateOptions,
} from './openings';
import {
  RULES_VERSION,
  applyOpening as applyPhasingOpening,
  initialStateFor as phasingInitialStateFor,
  validateOpenings as validatePhasingOpenings,
} from './openings/phasing';

/**
 * The rules revision every CURRENT ladder row is measured under, and the value
 * `lab/harness/runner.ts` stamps on every `GameRecord.rulesVersion`. It is the
 * P1 module's own constant, re-exported so nothing can drift from it.
 */
export const LADDER_RULES_VERSION = RULES_VERSION;

/**
 * What a record's `rulesVersion` field means. A record written before Phasing
 * existed carries NO `rulesVersion` (the field is optional and every historical
 * `muju-lab-game-v3` record in `lab/results/**` omits it), and every one of
 * those games was Standard. Anything else is refused rather than guessed: a
 * future revision must be taught here before its rows can be read.
 */
export function rulesetForRevision(rulesVersion: string | undefined | null, where: string): Ruleset {
  if (rulesVersion === undefined || rulesVersion === null) return 'standard';
  if (rulesVersion === LADDER_RULES_VERSION) return 'phasing';
  throw new Error(
    `${where}: unknown rulesVersion ${JSON.stringify(rulesVersion)}; known: absent (Standard, every pre-Phasing record) ` +
      `and "${LADDER_RULES_VERSION}" (Phasing). Teach ladder/ruleset.ts before reading its rows.`,
  );
}

/**
 * P1 opening ids, the only ids `openings/phasing.ts#applyOpening` will replay.
 * The prefix is what keeps an E0/E1 Standard id from being relabelled as
 * Phasing: `e1-g2-s40` can never match it, and no P1 file may hold a row that
 * does not.
 */
export const P1_OPENING_ID_RE = /^p1-[A-Za-z0-9_-]{1,61}$/;

/**
 * The rule set an opening BELONGS to, from its id alone.
 *
 * `initial` (and any other zero-action row) is rules-NEUTRAL: it names no
 * action, so it is the canonical initial state of whichever rule set the run is
 * played under and carries no corpus with it.
 */
export function openingRuleset(opening: OpeningSpec): Ruleset | 'either' {
  if (opening.actions.length === 0) return 'either';
  return P1_OPENING_ID_RE.test(opening.id) ? 'phasing' : 'standard';
}

/**
 * Refuses an openings pool that is not playable under `expected`, naming every
 * offending id. This is the check that makes "an E0/E1 Standard opening id must
 * never be relabelled as Phasing" structural instead of a convention: a run
 * pointed at `e1-dev.jsonl` stops here, before a single game is played, rather
 * than producing 32 rows of positions no Phasing game can reach.
 */
export function assertOpeningsRuleset(
  openings: readonly OpeningSpec[],
  expected: Ruleset,
  where = 'openings',
): void {
  const wrong = openings.filter(o => {
    const own = openingRuleset(o);
    return own !== 'either' && own !== expected;
  });
  if (wrong.length === 0) return;
  const ids = wrong.map(o => o.id);
  const shown = ids.slice(0, 8).join(', ') + (ids.length > 8 ? `, … (${ids.length} in all)` : '');
  throw new Error(
    `${where}: ${wrong.length} opening(s) are not ${expected} openings: ${shown}. ` +
      (expected === 'phasing'
        ? `A Phasing run replays the P1 book only — ids matching ${String(P1_OPENING_ID_RE)} ` +
          `(rules revision ${LADDER_RULES_VERSION}), or a zero-action row such as "${INITIAL_OPENING_ID}". ` +
          'The historical Standard books (e0-openings.jsonl, e1-*.jsonl, e2-*.jsonl, …) were generated and ' +
          'measured under Standard and may not be relabelled as Phasing.'
        : 'A Standard run may not replay the P1 (Phasing) book.'),
  );
}

/** The canonical initial state of `ruleset`, built from this run's options. */
export function initialStateForRules(ruleset: Ruleset, options: OpeningStateOptions = {}): GameState {
  return ruleset === 'phasing' ? phasingInitialStateFor(options) : standardInitialStateFor(options);
}

/**
 * The start position `opening` names under `ruleset`: the canonical initial
 * state for a zero-action row, and otherwise the opening replayed through the
 * helpers that OWN that rule set — `openings/phasing.ts` for P1 (which also
 * re-checks the `p1-` id and the harness invariants), `openings.ts` for the
 * historical Standard books.
 */
export function applyOpeningForRules(
  ruleset: Ruleset,
  opening: OpeningSpec,
  options: OpeningStateOptions = {},
): GameState {
  assertOpeningsRuleset([opening], ruleset, `opening "${opening.id}"`);
  if (opening.actions.length === 0) return initialStateForRules(ruleset, options);
  return ruleset === 'phasing' ? applyPhasingOpening(opening, options) : applyStandardOpening(opening, options);
}

/** `applyOpeningForRules` at the ladder's current rule set (Phasing). */
export function applyLadderOpening(opening: OpeningSpec, options: OpeningStateOptions = {}): GameState {
  return applyOpeningForRules('phasing', opening, options);
}

/**
 * Validates every opening a run will use, at every handicap it will use, under
 * the ladder's current rule set. Called by `run.ts#parseArgs`, so an unplayable
 * or mislabelled book fails the command line rather than the twentieth game.
 */
export function validateLadderOpenings(openings: readonly OpeningSpec[], handicaps: readonly number[]): void {
  assertOpeningsRuleset(openings, 'phasing');
  const replayable = openings.filter(o => o.actions.length > 0);
  if (replayable.length > 0) validatePhasingOpenings(replayable, handicaps);
  // A zero-action row still has to build a legal initial state at every
  // handicap the run uses, which is all there is to validate about it.
  for (const opening of openings) {
    if (opening.actions.length > 0) continue;
    for (const blackCrystalHandicap of handicaps) initialStateForRules('phasing', { blackCrystalHandicap });
  }
}
