/**
 * EMBER — LLMPilot (src/pilot/llm.ts).
 *
 * Required export per src/pilot/llmContracts.ts:
 *   createLLMPilot(config: LLMPilotConfig): Pilot
 *
 * decide() serializes the ContextPacket (serializePacket), calls the
 * transport (config.transport, defaulting to the real SDK transport from
 * sdkTransport.ts), and validates the tool_use input STRUCTURALLY (unknown
 * skill names, wrong param types, missing fields => failed consultation).
 * This is a fail-fast check, not the authoritative gate — the engine's
 * validateIntent()/arbiter (src/skills/arbiter.ts) is the one thing that
 * actually decides whether an intent is adopted; a structurally-valid
 * intent this module accepts can still be rejected downstream (e.g. "no
 * path to destination"), and that's fine — it just means the pilot gets
 * re-consulted per the normal interrupt/period cadence.
 *
 * Failure handling, one retry, and the auth latch all follow
 * llmContracts.ts's pinned "Failure fallback" / "Error taxonomy" notes:
 *   - malformed structural output, a refusal stop_reason, or a
 *     non-retryable transport error => one failed consultation => fallback
 *   - 429/5xx/connection (LLMTransportError.retryable, or an injected fake
 *     error shaped the same way) => ONE retry after a backoff, then
 *     fallback on a second failure
 *   - 401 (LLMTransportError.status === 401, or any err.status === 401)
 *     => emit 'auth_error' and latch: this Pilot instance NEVER calls the
 *     transport again (a broken key must not spam retries). The latch is
 *     per-instance/per-config, matching src/ui/contracts.ts's setPilot()
 *     contract note that reconfiguring installs a fresh delegate Pilot.
 *   - on any failure: return a `wait` intent, goal 'llm:unavailable',
 *     interruptConditions ['threat_above_0.3'] — the body keeps living,
 *     reflexes still protect it.
 *
 * `thought` is capped at 60 chars, `goal` at 120 (speech-bubble length).
 *
 * TESTING SEAM (additive, not part of the pinned contract): `sleep` is an
 * optional extra field beyond LLMPilotConfig's pinned shape, used only to
 * let retry-path tests run fast instead of hitting a real timer. Every
 * caller that only supplies pinned LLMPilotConfig fields (the UI, the
 * required-export signature itself) is unaffected — `sleep` is optional and
 * defaults to a real setTimeout-based delay.
 */

import type { ContextPacket, Intent, SkillName, Vec, Pilot } from '../core/types';
import type { LLMPilotConfig, LLMModelId, LLMRequest, LLMResponseLike } from './llmContracts';
import { DEFAULT_LLM_MODEL } from './llmContracts';
import { serializePacket } from './serialize';
import { PROMPT_VARIANTS, DEFAULT_PROMPT_VARIANT } from './prompts';
import { createSdkTransport } from './sdkTransport';

const MAX_TOKENS = 1024;
const RETRY_DELAY_MS = 300;
const GOAL_MAX_CHARS = 120;
const THOUGHT_MAX_CHARS = 60;

const SKILL_NAMES: readonly SkillName[] = [
  'move_to',
  'gather',
  'consume',
  'rest',
  'shelter',
  'flee',
  'focus',
  'wait',
];

const FOCUS_REGIONS = ['fuel', 'heat', 'damage', 'fatigue', 'activation'] as const;

// -------------------------------------------------------- structural checks

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isVec(v: unknown): v is Vec {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isFiniteNumber(o.x) && isFiniteNumber(o.y);
}

/** Structural (fail-fast) per-skill params check — mirrors the shapes in
 *  src/skills/skills.ts's paramsHelp/precondition, but WITHOUT touching
 *  world/body state (no adjacency/passability/stability checks — those are
 *  the arbiter's job, downstream, against live SkillCtx). */
function validateSkillParams(skill: SkillName, params: unknown): string | null {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    return 'params must be an object';
  }
  const p = params as Record<string, unknown>;
  switch (skill) {
    case 'move_to':
      if (!isVec(p.dest)) return 'move_to requires params.dest: {x, y}';
      if (p.style !== undefined && p.style !== null && p.style !== 'direct' && p.style !== 'cautious') {
        return 'move_to params.style must be "direct", "cautious", or null';
      }
      return null;
    case 'gather':
      if (typeof p.target !== 'string' || p.target.length === 0) {
        return 'gather requires params.target: non-empty string';
      }
      return null;
    case 'consume':
      if (typeof p.item !== 'string' || p.item.length === 0) {
        return 'consume requires params.item: non-empty string';
      }
      return null;
    case 'rest':
      if (!isFiniteNumber(p.duration)) return 'rest requires params.duration: number';
      return null;
    case 'shelter':
      return null;
    case 'flee':
      if (!isVec(p.from)) return 'flee requires params.from: {x, y}';
      return null;
    case 'focus':
      if (typeof p.region !== 'string' || !(FOCUS_REGIONS as readonly string[]).includes(p.region)) {
        return `focus requires params.region to be one of ${FOCUS_REGIONS.join('|')}`;
      }
      return null;
    case 'wait':
      if (p.flare !== undefined && p.flare !== null && typeof p.flare !== 'boolean') {
        return 'wait params.flare must be boolean or null';
      }
      return null;
    /* istanbul ignore next -- SkillName is exhaustive; kept as a safe fallback */
    default:
      return `unknown skill "${String(skill)}"`;
  }
}

type StructuralResult = { ok: true; intent: Intent } | { ok: false; reason: string };

function validateToolInput(input: unknown): StructuralResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'tool input must be an object' };
  }
  const obj = input as Record<string, unknown>;

  if (typeof obj.goal !== 'string') {
    return { ok: false, reason: 'missing/invalid "goal" (must be a string)' };
  }
  if (typeof obj.skill !== 'string' || !SKILL_NAMES.includes(obj.skill as SkillName)) {
    return { ok: false, reason: `unknown skill "${String(obj.skill)}"` };
  }
  const skill = obj.skill as SkillName;

  const paramsError = validateSkillParams(skill, obj.params);
  if (paramsError) return { ok: false, reason: paramsError };

  if (
    !Array.isArray(obj.interruptConditions) ||
    !obj.interruptConditions.every((c) => typeof c === 'string')
  ) {
    return { ok: false, reason: 'interruptConditions must be an array of strings' };
  }

  if (obj.thought !== undefined && obj.thought !== null && typeof obj.thought !== 'string') {
    return { ok: false, reason: 'thought must be a string or null' };
  }

  return {
    ok: true,
    intent: {
      goal: obj.goal,
      skill,
      params: obj.params as Record<string, unknown>,
      interruptConditions: [...obj.interruptConditions] as string[],
      thought: typeof obj.thought === 'string' ? obj.thought : undefined,
    },
  };
}

function capString(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function capIntent(intent: Intent): Intent {
  return {
    ...intent,
    goal: capString(intent.goal, GOAL_MAX_CHARS),
    thought: intent.thought !== undefined ? capString(intent.thought, THOUGHT_MAX_CHARS) : undefined,
  };
}

function fallbackIntent(): Intent {
  return {
    goal: 'llm:unavailable',
    skill: 'wait',
    params: {},
    interruptConditions: ['threat_above_0.3'],
  };
}

// ------------------------------------------------------------ error mapping

type ErrorClass = 'auth' | 'retryable' | 'other';

/**
 * Classifies a thrown transport error WITHOUT ever reading, forwarding, or
 * logging its message body — only two small, non-sensitive signals are
 * inspected: a numeric `.status` (matching both real
 * `sdkTransport.ts`-normalized errors and any fake/injected test error
 * shaped `{ status, retryable? }`), and — only for a statusless connection
 * failure — the error's `.name`/`.retryable` flag. This is deliberate: a
 * thrown error's `.message` could, in principle, embed anything (including
 * a leaked key); this pilot's reported strings never touch it. See
 * sdkTransport.ts's LLMTransportError for the real transport's side of this
 * contract — it normalizes SDK errors into exactly this safe shape before
 * they ever reach here.
 */
function classifyError(err: unknown): { cls: ErrorClass; safeSummary: string } {
  if (typeof err !== 'object' || err === null) {
    return { cls: 'other', safeSummary: 'unknown_error' };
  }
  const e = err as { status?: unknown; retryable?: unknown; name?: unknown };
  const status = typeof e.status === 'number' ? e.status : undefined;

  if (status === 401) return { cls: 'auth', safeSummary: 'authentication_error (401)' };
  if (status === 429) return { cls: 'retryable', safeSummary: 'rate_limit_error (429)' };
  if (status !== undefined && status >= 500) {
    return { cls: 'retryable', safeSummary: `server_error (${status})` };
  }
  if (status !== undefined) {
    return { cls: 'other', safeSummary: `api_error (${status})` };
  }
  // No numeric status: a connection-style failure. Trust an explicit
  // `retryable` flag if the error carries one (LLMTransportError does);
  // otherwise fall back to a name-based heuristic for hand-thrown test
  // errors (e.g. `new Error('connection reset')` with `name` left default
  // is NOT enough on its own — require an explicit signal either way so an
  // ordinary bug/throw doesn't get silently retried forever).
  if (e.retryable === true) return { cls: 'retryable', safeSummary: 'connection_error' };
  if (typeof e.name === 'string' && /connection/i.test(e.name)) {
    return { cls: 'retryable', safeSummary: 'connection_error' };
  }
  return { cls: 'other', safeSummary: 'unknown_error' };
}

function isToolUseBlock(
  b: LLMResponseLike['content'][number],
): b is { type: 'tool_use'; name: string; input: unknown } {
  return b.type === 'tool_use' && typeof (b as { name?: unknown }).name === 'string';
}

// ------------------------------------------------------------------- pilot

/** Required export from src/pilot/llm.ts. See file header for the extra
 *  (optional, additive) `sleep` testing seam. */
export function createLLMPilot(
  config: LLMPilotConfig & { sleep?: (ms: number) => Promise<void> },
): Pilot {
  const model: LLMModelId = config.model ?? DEFAULT_LLM_MODEL;
  const variantId = config.promptVariant ?? DEFAULT_PROMPT_VARIANT;
  const variant = PROMPT_VARIANTS[variantId];
  const transport = config.transport ?? createSdkTransport({ apiKey: config.apiKey });
  const onEvent = config.onEvent;
  const sleep =
    config.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  // Per-instance latch: once the configured key is confirmed bad, never
  // spend another transport call on it. A new key/config means a new
  // createLLMPilot() call (see src/ui/contracts.ts's setPilot() doc) — this
  // pilot instance stays broken for its own lifetime, by design.
  let authBroken = false;

  async function decide(ctx: ContextPacket): Promise<Intent> {
    if (authBroken) {
      onEvent?.({
        kind: 'auth_error',
        detail: 'API key was rejected; consultations paused until reconfigured.',
      });
      return fallbackIntent();
    }

    const req: LLMRequest = {
      model,
      system: variant.system,
      userMessage: serializePacket(ctx),
      maxTokens: MAX_TOKENS,
    };

    onEvent?.({ kind: 'consult_start' });
    const startedAt = Date.now();

    let attempt = 0;
    for (;;) {
      attempt += 1;
      let response: LLMResponseLike;
      try {
        response = await transport(req);
      } catch (err) {
        const { cls, safeSummary } = classifyError(err);
        if (cls === 'auth') {
          authBroken = true;
          onEvent?.({ kind: 'auth_error', detail: safeSummary });
          return fallbackIntent();
        }
        if (cls === 'retryable' && attempt === 1) {
          onEvent?.({ kind: 'consult_retry', detail: safeSummary });
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        onEvent?.({ kind: 'consult_failed', detail: safeSummary, latencyMs: Date.now() - startedAt });
        return fallbackIntent();
      }

      const latencyMs = Date.now() - startedAt;

      if (response.stop_reason === 'refusal') {
        onEvent?.({ kind: 'consult_failed', detail: 'refusal', latencyMs });
        return fallbackIntent();
      }

      const toolUse = response.content.find(isToolUseBlock);
      if (!toolUse || toolUse.name !== 'submit_intent') {
        onEvent?.({ kind: 'consult_failed', detail: 'no submit_intent tool_use block', latencyMs });
        return fallbackIntent();
      }

      const validated = validateToolInput(toolUse.input);
      if (!validated.ok) {
        onEvent?.({ kind: 'consult_failed', detail: validated.reason, latencyMs });
        return fallbackIntent();
      }

      onEvent?.({ kind: 'consult_ok', latencyMs });
      return capIntent(validated.intent);
    }
  }

  return { decide };
}
