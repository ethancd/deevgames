import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExplorerJob, ExplorerSnapshot } from '../../src/explorer/types';
import type { ModelReply } from './providers';

/** A recorded local amendment: never rewrite an experiment's original config. */
const policyV2Schema = z.object({
  version: z.literal(2),
  retryThreshold: z.number().min(0).max(1),
  paceAfterMs: z.number().int().min(1000).max(300000),
  blackTarget: z.number().min(0).max(1),
}).strict();
export const runnerPolicySchema = z.discriminatedUnion('version', [
  policyV2Schema,
  policyV2Schema.extend({ version: z.literal(3), noEligibleCheckpoint: z.enum(['opening', 'finish']) }).strict(),
]);
export type RunnerPolicy = z.infer<typeof runnerPolicySchema>;
export const DEFAULT_PACE_AFTER_MS = 300000;
export const MAX_DECISION_CALLS = 12;

/** A reminder at call boundaries, never an elapsed-decision cancellation. */
export function pacingReminder(job: ExplorerJob, elapsedMs: number, round: number, paceAfterMs = DEFAULT_PACE_AFTER_MS) {
  const elapsed = Math.max(0, Math.floor(elapsedMs / 1000));
  const result = job.kind === 'assess' ? 'your honest assessment' : 'your best complete legal turn';
  return `\nPacing: ${elapsed}s elapsed on this decision; model call ${round + 1}/${MAX_DECISION_CALLS}. Aim to finish within ${paceAfterMs / 1000}s total. This is a soft pacing target, not a decision deadline. Each model call still has a 300s hard cap.` +
    (elapsedMs >= paceAfterMs ? `\nPACING REMINDER: the target has passed. Submit ${result} now using what you have learned. Avoid starting new strategic searches; use further previews only to fix legality or complete the turn. Do not sacrifice legality or inflate a forecast to finish faster.` : '') +
    (round >= MAX_DECISION_CALLS - 2 ? `\nOnly ${MAX_DECISION_CALLS - round} model call(s) remain, including this one. Return ${result} as soon as possible. A preview is not a submitted decision.` : '');
}
export function policyId(policy: RunnerPolicy) {
  return `runner-policy-${createHash('sha256').update(JSON.stringify(runnerPolicySchema.parse(policy))).digest('hex').slice(0, 16)}`;
}
export function policyReview(policy: RunnerPolicy, state: ExplorerSnapshot) {
  const marker = `[${policyId(policy)}]`;
  if (state.review.includes(marker)) return state.review;
  const amendment = `${marker} Applied after ${state.games.length} games, ${state.plies} new turns and ${state.modelCalls} model calls. ` +
    `Original config and earlier games are unchanged. Effective local runner settings: ${JSON.stringify(policy)}. ` +
    `Retry at the latest losing-side turn-start checkpoint with its own forecast >= ${policy.retryThreshold * 100}%; ` +
    (policy.version === 2 ? 'pause if none. ' : policy.noEligibleCheckpoint === 'opening'
      ? 'if none qualifies, retry the earliest own turn-start checkpoint with a different opening strategy and label this fallback explicitly. '
      : 'if none qualifies, finish normally with reason no-qualifying-retry-checkpoint, preserving the last game result. ') +
    `Each decision has a ${policy.paceAfterMs / 1000}s soft pacing target; subsequent calls receive a finish-soon reminder without cancelling the decision. Each model call has a 300s hard cap; timeouts retry within the same 12-call decision budget. ` +
    `Each retry must explain a lesson and a changed strategy; retain these in each seat's private memory. ` +
    `Seek a Black line worth >= ${policy.blackTarget * 100}% against best resistance as a hypothesis, never a forecast floor. White still tries to win. ` +
    `Amended branches remain related exploratory evidence, not an independent win-rate sample.`;
  return [state.review, amendment].filter(Boolean).join('\n\n');
}

export interface PreparedDecision {
  prompt: string; checkpointId?: string; retryNote?: string; finishReason?: string;
}
export function prepareDecision(job: ExplorerJob, policy?: RunnerPolicy): PreparedDecision {
  if (!policy) return { prompt: job.prompt, checkpointId: undefined as string | undefined };
  let prompt = job.prompt, checkpointId: string | undefined, retryNote: string | undefined;
  if (job.kind === 'branch') {
    // The server ends its job prompt with a single JSON context containing only
    // this seat's memory and its own candidates, newest first.
    const split = prompt.lastIndexOf('\n');
    const context = JSON.parse(prompt.slice(split + 1));
    let candidate = context.candidates?.find((c: { ownWin: number | null }) =>
      typeof c.ownWin === 'number' && c.ownWin + 1e-9 >= policy.retryThreshold);
    if (!candidate) {
      if (policy.version === 2) throw new Error(`No own decision checkpoint meets the ${policy.retryThreshold * 100}% retry threshold. Review before resuming.`);
      if (policy.noEligibleCheckpoint === 'finish' || !context.candidates?.length) {
        return { prompt, finishReason: 'no-qualifying-retry-checkpoint' };
      }
      candidate = context.candidates.at(-1);
      retryNote = `Opening fallback: no own turn-start forecast met ${policy.retryThreshold * 100}%; retrying the earliest own decision checkpoint ${candidate.id}.`;
    }
    checkpointId = candidate.id;
    context.candidates = [candidate];
    context.runnerPolicy = policy;
    // Avoid conflicting with the original, deliberately immutable server policy.
    prompt = prompt.slice(0, split).replace(/^For turn:.*$/m,
      `For turn: choose a complete legal turn. For branch: retry checkpoint ${checkpointId}. ${retryNote ?? `This is the latest own turn start with ownWin >= ${policy.retryThreshold}.`} Supply a different complete turn; all previews must use that checkpoint.`) + '\n' + JSON.stringify(context);
  }
  prompt += `\nRunner policy ${policyId(policy)}: aim to finish each decision within ${policy.paceAfterMs / 1000} seconds across previews and corrections. This is a soft pacing target. Each model call has a 300-second hard cap and each decision allows at most 12 calls, including timed-out calls. Submit a complete legal turn promptly.` +
    `\nSearch objective: test the hypothesis that Black can achieve at least ${policy.blackTarget * 100}% winning chances at +${job.config.handicap}. Black: actively seek such a line. White: try your hardest to win and refute Black's plan. Both: report honest forecasts even when they contradict this hypothesis; never use the target as an estimate floor.` +
    `\nBefore choosing moves, review your own memory and all prior playedTurns, fork reasons and outcomes. Carry forward useful lessons, failed approaches and untested ideas. Keep memory cumulative and concise (under 3000 characters); do not replace it with only the current position.` +
    `\nFor each branch, explanation MUST contain "Lesson:" describing a concrete failure from earlier attempts and "Strategy:" describing a materially different plan, why it addresses that failure, and the opponent's strongest reply. A cosmetic move permutation is not a strategic change. Keep a ledger of tried strategies and outcomes in memory. If uncertain, say so. For other turns explain how the move advances or revises the current plan.`;
  return { prompt, checkpointId, retryNote };
}

export function enforcePolicy(reply: ModelReply, job: ExplorerJob, checkpointId: string | undefined, policy?: RunnerPolicy, retryNote?: string): ModelReply {
  if (!policy) return reply;
  if (job.kind === 'branch') {
    if (reply.kind === 'preview') {
      if (reply.checkpointId && reply.checkpointId !== checkpointId) throw new Error(`Preview the selected retry checkpoint ${checkpointId}.`);
      return { ...reply, checkpointId: checkpointId! };
    }
    if (reply.kind === 'branch') {
      if (reply.checkpointId !== checkpointId) throw new Error(`Branch from the selected retry checkpoint ${checkpointId}; follow the checkpoint selection in the prompt.`);
      if (!/Lesson:\s*\S+/i.test(reply.explanation) || !/Strategy:\s*\S+/i.test(reply.explanation)) throw new Error('Explain the prior failure after Lesson: and your changed plan after Strategy:.');
      if (!reply.memory.trim()) throw new Error('Retain the lesson and strategy in your private memory.');
    }
  }
  return reply.kind === 'preview' ? reply : { ...reply, explanation: `[${policyId(policy)}] ${reply.kind === 'branch' && retryNote ? retryNote + ' ' : ''}${reply.explanation}` };
}
