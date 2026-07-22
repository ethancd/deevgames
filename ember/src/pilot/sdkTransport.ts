/**
 * EMBER — real Anthropic SDK transport (src/pilot/sdkTransport.ts).
 *
 * Required export per src/pilot/llmContracts.ts:
 *   createSdkTransport(config): LLMTransport
 * (not itself part of the pinned surface — llmContracts.ts only pins
 * LLMTransport's shape and the ANTHROPIC API USAGE facts this file must
 * follow exactly; the factory name/shape here is this file's own, kept
 * small and swap-compatible with the fake transports the tests inject.)
 *
 * Follows src/pilot/llmContracts.ts's pinned facts precisely:
 *   - `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`.
 *   - non-streaming messages.create, max_tokens from the request,
 *     `thinking: { type: 'disabled' }` (this is a ~1s game-loop decision),
 *     NO temperature/top_p/top_k, system = the (stable) prompt-variant
 *     text, the serialized packet as the (volatile) user turn.
 *   - forced tool use: tools: [INTENT_TOOL], tool_choice: { type: 'tool',
 *     name: INTENT_TOOL.name }.
 *   - typed SDK errors mapped to a small, fixed-vocabulary taxonomy (see
 *     mapSdkError below) instead of ever forwarding raw SDK error text.
 *
 * HARD RULE this file exists partly to enforce: the API key must never
 * appear in a console log, a SimEvent, a ReplayFile, exported JSON, or an
 * error message. It is captured once into the Anthropic client's closure
 * and never read back out, logged, or included in any string this module
 * produces — including thrown errors, which are normalized to a small
 * fixed vocabulary (see LLMTransportError) that never echoes the SDK's own
 * `.message`/`.error` (those can, in principle, echo request context back).
 *
 * NOTE ON TESTING: per the WF3 brief, this environment has no Anthropic API
 * key and must never attempt a live call. createSdkTransport() itself is
 * therefore only smoke-tested (constructs without throwing, returns a
 * function) in sdkTransport.test.ts; mapSdkError()'s taxonomy is fully unit
 * tested there using real `@anthropic-ai/sdk` error CLASSES constructed
 * in-process (via `APIError.generate` / direct construction) — never a
 * network call.
 */

import Anthropic, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import type { LLMRequest, LLMResponseLike, LLMTransport } from './llmContracts';
import { INTENT_TOOL } from './intentSchema';

export interface SdkTransportConfig {
  apiKey: string;
}

/**
 * A normalized, safe-to-log transport failure. Carries NO upstream
 * message/body text — only a small fixed-vocabulary summary and (when
 * known) the numeric HTTP status — so it can never leak an API key or other
 * response content into onEvent()/thrown-value strings. `retryable` mirrors
 * llmContracts.ts's taxonomy: 429/5xx/connection => true; 401 and anything
 * else => false (401 is its own auth path in src/pilot/llm.ts, never
 * retried regardless of this flag).
 */
export class LLMTransportError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(safeSummary: string, status: number | undefined, retryable: boolean) {
    super(safeSummary);
    this.name = 'LLMTransportError';
    this.status = status;
    this.retryable = retryable;
  }
}

/** Maps an error thrown by `@anthropic-ai/sdk` to a normalized
 *  LLMTransportError. Exported (in addition to being used internally by
 *  createSdkTransport) so the taxonomy is unit-testable without a live API
 *  call — see sdkTransport.test.ts. */
export function mapSdkError(err: unknown): LLMTransportError {
  if (err instanceof AuthenticationError) {
    return new LLMTransportError('authentication_error', 401, false);
  }
  if (err instanceof RateLimitError) {
    return new LLMTransportError('rate_limit_error', 429, true);
  }
  if (err instanceof InternalServerError) {
    return new LLMTransportError('internal_server_error', err.status ?? 500, true);
  }
  if (err instanceof APIConnectionError) {
    return new LLMTransportError('connection_error', undefined, true);
  }
  if (err instanceof APIError) {
    return new LLMTransportError('api_error', err.status, false);
  }
  return new LLMTransportError('unknown_error', undefined, false);
}

/** Required export from src/pilot/sdkTransport.ts: createSdkTransport(config). */
export function createSdkTransport(config: SdkTransportConfig): LLMTransport {
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });

  return async function sdkTransport(req: LLMRequest): Promise<LLMResponseLike> {
    try {
      const response = await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        thinking: { type: 'disabled' },
        tool_choice: { type: 'tool', name: INTENT_TOOL.name },
        tools: [INTENT_TOOL as unknown as Anthropic.Tool],
        messages: [{ role: 'user', content: req.userMessage }],
      });
      return {
        stop_reason: response.stop_reason,
        content: response.content as unknown as LLMResponseLike['content'],
      };
    } catch (err) {
      throw mapSdkError(err);
    }
  };
}
