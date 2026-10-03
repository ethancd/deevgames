/**
 * Learn to Play progress, in localStorage like every other client setting
 * (`muju:` prefix, `:v1`). Unreadable or malformed storage reads as a fresh
 * start and never throws; a failed write is silently ignored.
 */
export const LEARN_PROGRESS_KEY = 'muju:learn:v1';

export interface SolvedRecord { at: string; clean: boolean }
export interface LearnProgress { version: 1; solved: Record<string, SolvedRecord>; last?: string }

export const emptyProgress = (): LearnProgress => ({ version: 1, solved: {} });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keep only well-formed entries, so one odd value cannot take the whole record down. */
function sanitize(raw: unknown): LearnProgress {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.solved)) return emptyProgress();
  const solved: Record<string, SolvedRecord> = {};
  for (const [id, entry] of Object.entries(raw.solved)) {
    if (!isRecord(entry) || typeof entry.at !== 'string') continue;
    solved[id] = { at: entry.at, clean: entry.clean !== false };
  }
  return { version: 1, solved, ...(typeof raw.last === 'string' ? { last: raw.last } : {}) };
}

export function loadProgress(storage: Pick<Storage, 'getItem'> | null = safeStorage()): LearnProgress {
  try {
    const text = storage?.getItem(LEARN_PROGRESS_KEY);
    return text ? sanitize(JSON.parse(text)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: LearnProgress, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try { storage?.setItem(LEARN_PROGRESS_KEY, JSON.stringify(progress)); } catch { /* Private mode: progress lasts for this visit only. */ }
}

/**
 * Record a solve. A clean solve stays clean forever; a hinted solve of a
 * puzzle already solved clean does not demote it. `last` is the puzzle to
 * resume from.
 */
export function markSolved(progress: LearnProgress, id: string, clean: boolean, at = new Date().toISOString()): LearnProgress {
  const previous = progress.solved[id];
  return { ...progress, last: id, solved: { ...progress.solved, [id]: { at: previous?.at ?? at, clean: (previous?.clean ?? false) || clean } } };
}

export const markLast = (progress: LearnProgress, id: string): LearnProgress => ({ ...progress, last: id });

export const solvedCount = (progress: LearnProgress, ids?: readonly string[]): number =>
  ids ? ids.filter(id => !!progress.solved[id]).length : Object.keys(progress.solved).length;

/** The puzzle to open from "Continue": the first unsolved one in course order, or the first if all are solved. */
export const nextUnsolved = (progress: LearnProgress, ids: readonly string[]): string | undefined =>
  ids.find(id => !progress.solved[id]) ?? ids[0];

export function resetProgress(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try { storage?.removeItem(LEARN_PROGRESS_KEY); } catch { /* Nothing to remove. */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
