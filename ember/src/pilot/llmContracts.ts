/**
 * EMBER — pinned LLM pilot contracts (WF3). Authored by the supervisor.
 *
 * Builders implement AGAINST these types and MUST NOT edit this file.
 * The integrate agent may make minimal additive changes only, documented in
 * its report. src/core/types.ts and src/ui/contracts.ts remain pinned.
 *
 * Module ownership for WF3:
 *   src/pilot/llm*.ts, src/pilot/prompts.ts      (agent LLM) — LLMPilot,
 *       protocol serializer, prompt variants, transport, unit tests
 *   src/ui/** (except pinned contracts.ts)        (agent UI) — key entry,
 *       pilot/model pickers, busy/error surfacing, delegating pilot wiring
 *   src/render/**, src/ui/panels/** visual tweaks (agent POLISH)
 *   root index.html, build-all.sh, ember/README.md, ember/scripts/ (agent SHIP)
 *
 * ANTHROPIC API USAGE (pinned facts — do not guess beyond these):
 *   - Dependency: `@anthropic-ai/sdk` (the ONE new npm dependency WF3 adds).
 *   - Browser: `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`.
 *     The key comes from the UI (localStorage 'ember.anthropicKey'); it is
 *     NEVER logged, never serialized into events/replays, never sent
 *     anywhere but api.anthropic.com.
 *   - Models: 'claude-sonnet-5' (default) | 'claude-haiku-4-5' |
 *     'claude-opus-4-8'. Exact strings; never append date suffixes.
 *   - Request shape (non-streaming, small): messages.create with
 *     max_tokens ~1024, `thinking: { type: 'disabled' }` (latency: this is
 *     a ~1s game-loop decision; sonnet-5 runs adaptive by default if
 *     omitted — so disable explicitly), NO temperature/top_p/top_k (400 on
 *     current models), system = prompt variant text (stable string first,
 *     dynamic packet in the user turn — prompt-caching friendly).
 *   - Structured output via FORCED TOOL USE: one tool 'submit_intent' with
 *     `strict: true`, input_schema mirroring Intent (additionalProperties:
 *     false + required on every object; no minLength/minimum constraints —
 *     unsupported in strict mode), and tool_choice
 *     { type: 'tool', name: 'submit_intent' }.
 *   - Read the intent from the tool_use block's `input` (already parsed).
 *     Check stop_reason first; treat 'refusal' and missing tool_use as a
 *     failed consultation.
 *   - Error taxonomy: use SDK typed errors (Anthropic.APIError subclasses).
 *     401 => surface 'invalid key' to UI and pause consultations;
 *     429/5xx/connection => one retry after backoff, then fall back (below).
 *   - Failure fallback: on any failed consultation the pilot returns a
 *     `wait` intent with goal 'llm:unavailable' and interruptConditions
 *     ['threat_above_0.3'] — the body keeps living; reflexes still protect
 *     it. Emitting pilot.llm.error info via onEvent below.
 */

import type { ContextPacket, Intent, Pilot } from '../core/types';

export type LLMModelId =
  | 'claude-sonnet-5'
  | 'claude-haiku-4-5'
  | 'claude-opus-4-8';

export const DEFAULT_LLM_MODEL: LLMModelId = 'claude-sonnet-5';

/** Minimal response shape the parser consumes — mirrors the SDK's Message
 *  fields we actually read, so tests can fabricate responses without the
 *  SDK and the transport seam stays swappable. */
export interface LLMResponseLike {
  stop_reason: string | null;
  content: Array<
    | { type: 'tool_use'; name: string; input: unknown }
    | { type: 'text'; text: string }
    | { type: string; [k: string]: unknown }
  >;
}

export interface LLMRequest {
  model: LLMModelId;
  system: string;
  userMessage: string; // serialized ContextPacket (see serializePacket)
  maxTokens: number;
}

/** Transport seam. Production impl wraps the Anthropic SDK; tests inject
 *  fakes (valid intents, malformed input, refusal, throwing errors). */
export type LLMTransport = (req: LLMRequest) => Promise<LLMResponseLike>;

export interface LLMPilotEvent {
  kind: 'consult_start' | 'consult_ok' | 'consult_retry' | 'consult_failed' | 'auth_error';
  detail?: string;
  latencyMs?: number;
}

export interface LLMPilotConfig {
  apiKey: string;
  model?: LLMModelId; // default DEFAULT_LLM_MODEL
  promptVariant?: PromptVariantId; // default DEFAULT_PROMPT_VARIANT
  transport?: LLMTransport; // default: real Anthropic SDK transport
  /** UI/status callback. MUST NOT influence sim state. */
  onEvent?: (e: LLMPilotEvent) => void;
}

/** Required export from src/pilot/llm.ts:
 *    createLLMPilot(config: LLMPilotConfig): Pilot
 *  decide() serializes the packet, calls the transport, validates the
 *  tool_use input STRUCTURALLY (unknown skill names, wrong types, missing
 *  fields => failed consultation; the engine's sanitize/validate layer is
 *  the authoritative gate, this is just fail-fast), and returns the Intent.
 *  `thought` is capped at 60 chars (speech bubble), `goal` at 120. */

/** Required export from src/pilot/serialize.ts:
 *    serializePacket(packet: ContextPacket): string
 *  Compact, stable JSON (sorted keys, numbers rounded to 2dp) so identical
 *  packets serialize identically. Includes a short legend only if the
 *  prompt variant asks for it. Target < 1200 tokens typical. */

/** Prompt variants: src/pilot/prompts.ts exports
 *    PROMPT_VARIANTS: Record<PromptVariantId, { system: string; notes: string }>
 *    DEFAULT_PROMPT_VARIANT: PromptVariantId
 *  Three genuinely different strategies (not paraphrases):
 *    'survivor'  — homeostasis-first: keep drives in band, act early on
 *                  predictedTicksToLimit, treat interoception as noisy.
 *    'ranger'    — exploration-biased: map coverage when stable, explicit
 *                  risk budget keyed to activation/stability buckets.
 *    'minimal'   — shortest viable instructions; trusts the packet legend.
 *  Every variant MUST instruct: you are the deliberator, not the body;
 *  you cannot change body state by describing it; set interruptConditions
 *  on every intent; prefer regulation before limits are crossed. */
export type PromptVariantId = 'survivor' | 'ranger' | 'minimal';

/** Required export from src/pilot/intentSchema.ts:
 *    INTENT_TOOL: { name: 'submit_intent'; description: string;
 *                   input_schema: Record<string, unknown>; strict: true }
 *  Schema mirrors Intent; skill is an enum of the 8 SkillName values;
 *  params typed per-skill via anyOf (each variant additionalProperties:
 *  false); interruptConditions: array of strings. */

export type { ContextPacket, Intent, Pilot };
