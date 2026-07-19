// LlmClient: the one interface every other module in this package (and every
// consumer game) programs against. Real network I/O lives ONLY behind
// anthropicClient() below; structured.ts/judge.ts/jobs.ts never touch fetch
// or env vars directly, which is what makes the zero-key CI guarantee
// possible (see README.md).

export interface CompleteRequest {
  system?: string;
  prompt: string;
  maxTokens: number;
  /**
   * Optional JSON Schema for structured output. When present, this is passed
   * straight through as `output_config.format.schema` (see
   * shared/live-sources.md's Structured Outputs entry, and the claude-api
   * skill). Callers that need the recursive-schema JSON-string transport
   * build the (non-recursive) wire envelope themselves — see structured.ts.
   */
  jsonSchema?: object;
}

export interface CompleteResponse {
  text: string;
}

export interface LlmClient {
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}

// Minimal structural types for the two runtime seams this module needs
// (fetch + process.env) — there is no @types/node and no DOM lib in this
// package's tsconfig (see tsconfig.base.json: lib is bare ES2022), so
// `fetch`/`Response`/`process` do not exist as ambient globals here. Rather
// than pull in a dependency for typings, we declare exactly the shape we use
// and reach the real globals through `globalThis` casts below — the same
// trick @deev/core's ambient.d.ts uses for `structuredClone`.
export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<FetchLikeResponse>;

export interface AnthropicClientOptions {
  model: string;
  /**
   * Env var names tried in order to find the API key. Default mirrors
   * Lution's server/claude.ts convention (personal key as a documented
   * fallback story, but ANTHROPIC_API_KEY tried first here since that's the
   * name the wider Anthropic tooling — and the Agent SDK subprocess used by
   * jobs.ts — actually reads).
   */
  apiKeyEnvs?: string[];
  /**
   * Default max_tokens when a caller's request doesn't set one explicitly.
   * 16000, not something smaller: on current models (claude-sonnet-5 and
   * later) adaptive thinking is on by default and SHARES the max_tokens
   * budget with the visible answer — too low a budget can produce a
   * response with no text block at all, just consumed thinking (napkin
   * lesson, also called out in lution/server/claude.ts's designCard
   * comment). 16000 is the smallest budget that has proven safe in
   * practice for a moderately complex JSON answer plus adaptive thinking.
   */
  defaultMaxTokens?: number;
  /**
   * Injectable environment lookup. MUST default to reading process.env
   * (via a globalThis lookup, since this package has no @types/node) but
   * must be overridable so tests never need a real ANTHROPIC_API_KEY —
   * `anthropicClient({ env: {} })` is exactly the zero-key CI shape.
   */
  env?: Record<string, string | undefined>;
  /** Injectable fetch, defaulting to the runtime global. */
  fetchImpl?: FetchLike;
}

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

function defaultEnv(): Record<string, string | undefined> {
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env ?? {};
}

function defaultFetch(): FetchLike | undefined {
  const g = globalThis as unknown as { fetch?: FetchLike };
  return g.fetch;
}

function resolveApiKey(envs: readonly string[], env: Record<string, string | undefined>): string | undefined {
  for (const name of envs) {
    const value = env[name];
    if (value) return value;
  }
  return undefined;
}

interface AnthropicMessagesResponseBody {
  content?: Array<{ type: string; text?: string }>;
}

/**
 * Builds an LlmClient over RAW fetch to the Anthropic Messages API — the
 * house pattern (see the claude-api skill: the Claude Agent SDK is reserved
 * for jobs.ts's implement-job runner; every other call site talks to
 * /v1/messages directly, exactly as lution/server/claude.ts does).
 *
 * CRITICAL: env keys are resolved LAZILY, inside the first complete() call —
 * never at construction or module load. This is what lets a keyless CI
 * environment import and construct this client (and every module built on
 * top of it) without ever touching a real credential; only actually
 * *calling* complete() without a key produces an error, and that error names
 * every env var that was tried.
 */
export function anthropicClient(options: AnthropicClientOptions): LlmClient {
  const apiKeyEnvs = options.apiKeyEnvs ?? ['ANTHROPIC_API_KEY', 'ANTHROPIC_PERSONAL_API_KEY'];
  const defaultMaxTokens = options.defaultMaxTokens ?? 16000;

  return {
    async complete(req: CompleteRequest): Promise<CompleteResponse> {
      const env = options.env ?? defaultEnv();
      const apiKey = resolveApiKey(apiKeyEnvs, env);
      if (!apiKey) {
        throw new Error(
          `anthropicClient: no API key found. Tried env vars: ${apiKeyEnvs.join(', ')}. ` +
            'Set one of them, or pass { env } explicitly to anthropicClient().'
        );
      }

      const fetchFn = options.fetchImpl ?? defaultFetch();
      if (!fetchFn) {
        throw new Error(
          'anthropicClient: no fetch implementation available. Pass { fetchImpl } explicitly ' +
            '(e.g. in a runtime with no global fetch).'
        );
      }

      const body: Record<string, unknown> = {
        model: options.model,
        max_tokens: req.maxTokens ?? defaultMaxTokens,
        messages: [{ role: 'user', content: req.prompt }],
      };
      if (req.system) body.system = req.system;
      if (req.jsonSchema) {
        body.output_config = { format: { type: 'json_schema', schema: req.jsonSchema } };
      }

      const response = await fetchFn(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`anthropicClient: Anthropic Messages API request failed (${response.status}): ${errBody}`);
      }

      const data = (await response.json()) as AnthropicMessagesResponseBody;
      const text = data.content?.find((block) => block.type === 'text')?.text ?? '';
      return { text };
    },
  };
}
