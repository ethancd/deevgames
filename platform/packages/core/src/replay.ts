// Replay from transcripts, and the mid-turn choice-replay cursor.
//
// Platform rule: CHOICES ARE ACTIONS. Every intra-turn decision point is
// reified as an action in the transcript, so `replayTranscript` is total.
// The ChoiceRecorder below exists ONLY for mid-turn UI resume (Lution M5's
// pattern, re-specced here as a standalone contract): a turn interrupted by
// a reload replays its recorded (choicePointId, optionId) pairs, truncating
// and falling through to live input on the first mismatch — a corrupted
// recording is discarded wholesale, never partially trusted.

import type { GameDef } from './game.ts';
import { mulberry32 } from './rng.ts';
import { engineHash, stateHash } from './hash.ts';
import type { Transcript } from './match.ts';

export function replayTranscript<S, A, C, O>(
  def: GameDef<S, A, C, O>,
  transcript: Transcript<A, C>,
): S {
  if (transcript.gameId !== def.id || transcript.gameVersion !== def.version) {
    throw new Error(
      `replayTranscript: transcript is for ${transcript.gameId}@${transcript.gameVersion}, ` +
        `def is ${def.id}@${def.version} — refusing to replay across versions`,
    );
  }
  if (transcript.engineHash !== engineHash(def)) {
    throw new Error('replayTranscript: engineHash mismatch');
  }
  const rng = mulberry32(transcript.seed);
  let state = def.init(transcript.config, rng);
  for (const { action } of transcript.actions) {
    state = def.apply(state, action, rng);
  }
  return state;
}

export function assertReplayConverges<S, A, C, O>(
  def: GameDef<S, A, C, O>,
  transcript: Transcript<A, C>,
): void {
  const final = replayTranscript(def, transcript);
  const hash = stateHash(final);
  if (hash !== transcript.finalStateHash) {
    throw new Error(
      `assertReplayConverges: replayed ${hash} !== recorded ${transcript.finalStateHash} — ` +
        `apply() is impure or rng was shared outside apply()`,
    );
  }
}

// ---------------------------------------------------------------------------
// Mid-turn choice replay (UI resume only — never part of transcripts).

export interface RecordedChoice {
  choicePointId: string;
  optionId: string;
}

export interface PendingTurn {
  /** Identifies the turn being resumed; stale pending turns must be cleared
   * at lifecycle boundaries (see idempotency.ts) or they poison the next
   * cycle's resume logic. */
  turnKey: string;
  choices: RecordedChoice[];
}

export interface ChoiceCursor {
  /**
   * Resolve a choice point during resume. Returns the recorded optionId if
   * the recording's next entry matches this choicePointId AND the option is
   * still offered; otherwise truncates the rest of the recording and returns
   * null (fall through to live input).
   */
  resolve(choicePointId: string, offeredOptionIds: string[]): string | null;
  /** Record a live decision (appends past the replay point). */
  record(choicePointId: string, optionId: string): void;
  readonly pending: PendingTurn;
}

export function createChoiceCursor(pending: PendingTurn): ChoiceCursor {
  let index = 0;
  let live = false;
  return {
    pending,
    resolve(choicePointId, offeredOptionIds) {
      if (live || index >= pending.choices.length) {
        live = true;
        return null;
      }
      const next = pending.choices[index];
      if (next.choicePointId !== choicePointId || !offeredOptionIds.includes(next.optionId)) {
        // Mismatch: discard the remainder wholesale.
        pending.choices.length = index;
        live = true;
        return null;
      }
      index++;
      return next.optionId;
    },
    record(choicePointId, optionId) {
      pending.choices.push({ choicePointId, optionId });
      index = pending.choices.length;
      live = true;
    },
  };
}
