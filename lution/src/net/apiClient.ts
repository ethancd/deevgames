// Thin fetch wrapper around the /api endpoints defined in shared/types.ts.
// The only client module allowed to talk to the network; UI modules call
// through here so they stay framework-agnostic and testable.

import type {
  CompileCardRequest,
  CompileCardResponse,
  CreateRegistryCardRequest,
  CreateRegistryCardResponse,
  DesignCardRequest,
  DesignCardResponse,
  GetCardSourceResponse,
  GetJobResponse,
  GetRegistryResponse,
  GetStateResponse,
  ImplementCardsRequest,
  ImplementCardsResponse,
  JudgeDuplicateRequest,
  JudgeDuplicateResponse,
  NewMatchResponse,
  NextCardsRequest,
  NextCardsResponse,
  PutStateRequest,
  PutStateResponse,
  ResolveRoundRequest,
  ResolveRoundResponse,
  RetryJobResponse,
  ValidateCardRequest,
  ValidateCardResponse,
  VoidRoundDesignsRequest,
  VoidRoundDesignsResponse,
} from '../../shared/types';

// Thrown by request() for any non-2xx response, so callers can inspect the
// HTTP status (e.g. the resolve-round 409 idempotency case) rather than
// string-matching a generic Error message. `body` is the best-effort parsed
// JSON of the response, falling back to raw text if it isn't valid JSON.
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// A fetch() rejection (network down, DNS failure, CORS, the dev server not
// listening, ...) always surfaces as a TypeError with no HTTP response at
// all -- as opposed to ApiError, which means a response WAS received but its
// status was non-2xx. renderFatalError (src/ui/app.ts) uses this to decide
// whether to show the softer "lost connection" copy instead of the generic
// boot-pipeline error.
export function isNetworkShapedError(err: unknown): boolean {
  return err instanceof TypeError;
}

// Digs the innermost human-meaningful message out of a (possibly triply-
// nested) API failure: ApiError bodies look like {error: 'Anthropic Messages
// API request failed (400): {"type":"error","error":{"message":"Your credit
// balance is too low..."}}'} — technically present, humanly invisible. Also
// gives billing errors first-class, actionable copy (added 2026-07-03 after
// the designer hit an out-of-credits design failure rendered as JSON soup).
export function humanizeApiError(err: unknown): string {
  const raw =
    err instanceof ApiError && typeof (err.body as { error?: unknown } | null)?.error === 'string'
      ? (err.body as { error: string }).error
      : err instanceof Error
        ? err.message
        : String(err);

  // Innermost Anthropic-API message, if one is embedded as escaped JSON.
  const inner = raw.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  let message = raw;
  if (inner) {
    try {
      message = JSON.parse(`"${inner[1]}"`) as string;
    } catch {
      message = inner[1];
    }
  }

  if (/credit balance is too low/i.test(message)) {
    return (
      'The Anthropic API account is out of credits, so Claude can’t design or forge cards right now. ' +
      'Top up at console.anthropic.com → Plans & Billing, then retry — your own locked-in design is saved.'
    );
  }
  return message;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resilience policy for transient failures (dev server restarting, a blip on
// the loopback connection, ...):
//   - Up to 3 attempts total, with ~500ms then ~1500ms backoff between them.
//   - GET is always retried on a transient failure (network-level, or an
//     HTTP 502/503/504 response).
//   - Non-GET (POST/PUT) is retried ONLY on a network-level failure (fetch
//     itself threw -- no response was ever received), because most mutating
//     endpoints aren't safe to blindly replay after a response that DID
//     arrive (e.g. a 503 that actually reflects a completed side effect).
//   - The one exception is /api/resolve-round: server/router.ts's 409
//     idempotency guard makes it safe to retry on ANY transient failure,
//     including a received 502/503/504 -- a duplicate resolve attempt either
//     no-ops (round already resolved -> 409, treated as success by callers)
//     or genuinely retries the same not-yet-applied mutation.
//   - Anything else (4xx, or a transient failure with retries exhausted)
//     throws ApiError immediately, same shape as before this policy existed.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1500];
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const RESOLVE_ROUND_PATH = '/api/resolve-round';

async function request<TResponse>(
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<TResponse> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const isGet = method === 'GET';
  const isResolveRound = path === RESOLVE_ROUND_PATH;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(path, {
        method,
        headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch (err) {
      // Network-level failure -- no response was received at all. Always
      // retryable (GET and POST alike) until attempts are exhausted.
      if (attempt < MAX_ATTEMPTS) {
        await delay(BACKOFF_MS[attempt - 1]);
        continue;
      }
      throw err;
    }

    if (res.ok) {
      return (await res.json()) as TResponse;
    }

    const transient = TRANSIENT_STATUSES.has(res.status);
    const retryableStatus = transient && (isGet || isResolveRound);
    if (retryableStatus && attempt < MAX_ATTEMPTS) {
      await delay(BACKOFF_MS[attempt - 1]);
      continue;
    }

    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // ignore — fall through to the generic message below
    }
    // Best-effort JSON parse for structured inspection; keep the raw text for
    // the human-readable message (unchanged format, so any existing
    // .message-based assertions keep working).
    let parsedBody: unknown = detail;
    if (detail) {
      try {
        parsedBody = JSON.parse(detail);
      } catch {
        parsedBody = detail;
      }
    }
    throw new ApiError(
      `${method} ${path} failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
      res.status,
      parsedBody
    );
  }

  // Unreachable: every branch above either returns or throws before the loop
  // can run out of attempts silently. Kept only to satisfy the compiler.
  throw new Error(`request: exhausted retries for ${method} ${path}`);
}

export async function getState(): Promise<GetStateResponse> {
  return request<GetStateResponse>('/api/state');
}

export async function putState(req: PutStateRequest): Promise<PutStateResponse> {
  return request<PutStateResponse>('/api/state', { method: 'PUT', body: req });
}

export async function getRegistry(): Promise<GetRegistryResponse> {
  return request<GetRegistryResponse>('/api/registry');
}

export async function getCardSource(cardId: string): Promise<GetCardSourceResponse> {
  return request<GetCardSourceResponse>(`/api/card-source/${encodeURIComponent(cardId)}`);
}

export async function validateCard(req: ValidateCardRequest): Promise<ValidateCardResponse> {
  return request<ValidateCardResponse>('/api/validate-card', { method: 'POST', body: req });
}

export async function createRegistryCard(
  req: CreateRegistryCardRequest
): Promise<CreateRegistryCardResponse> {
  return request<CreateRegistryCardResponse>('/api/registry/cards', { method: 'POST', body: req });
}

export async function designCard(req: DesignCardRequest): Promise<DesignCardResponse> {
  return request<DesignCardResponse>('/api/design-card', { method: 'POST', body: req });
}

export async function compileCard(req: CompileCardRequest): Promise<CompileCardResponse> {
  return request<CompileCardResponse>('/api/compile-card', { method: 'POST', body: req });
}

export async function voidRoundDesigns(req: VoidRoundDesignsRequest): Promise<VoidRoundDesignsResponse> {
  return request<VoidRoundDesignsResponse>('/api/void-round-designs', { method: 'POST', body: req });
}

export async function implementCards(
  req: ImplementCardsRequest
): Promise<ImplementCardsResponse> {
  return request<ImplementCardsResponse>('/api/implement-cards', { method: 'POST', body: req });
}

export async function getJob(jobId: string): Promise<GetJobResponse> {
  return request<GetJobResponse>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export async function retryJob(jobId: string): Promise<RetryJobResponse> {
  return request<RetryJobResponse>(`/api/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
}

export async function resolveRound(req: ResolveRoundRequest): Promise<ResolveRoundResponse> {
  return request<ResolveRoundResponse>('/api/resolve-round', { method: 'POST', body: req });
}

export async function nextCards(req: NextCardsRequest): Promise<NextCardsResponse> {
  return request<NextCardsResponse>('/api/next-cards', { method: 'POST', body: req });
}

export async function judgeDuplicate(req: JudgeDuplicateRequest): Promise<JudgeDuplicateResponse> {
  return request<JudgeDuplicateResponse>('/api/judge-duplicate', { method: 'POST', body: req });
}

export async function newMatch(): Promise<NewMatchResponse> {
  return request<NewMatchResponse>('/api/new-match', { method: 'POST' });
}
