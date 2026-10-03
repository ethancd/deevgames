/** First-visit flag, localStorage like every other client setting (`muju:` prefix, `:v1`). */
export const ONBOARDING_KEY = 'muju:onboarding:v1';
export interface OnboardingRecord { completed: true; at: string; version: 1 }

export function hasCompletedOnboarding(): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? 'null') as Partial<OnboardingRecord> | null;
    return saved?.completed === true;
  } catch {
    // Unreadable storage: never trap a returning player in the tutorial.
    return true;
  }
}

/** Completion and Skip both write the same record. */
export function markOnboardingComplete(): void {
  const record: OnboardingRecord = { completed: true, at: new Date().toISOString(), version: 1 };
  try { localStorage.setItem(ONBOARDING_KEY, JSON.stringify(record)); } catch { /* Private mode: it simply shows again next time. */ }
}

/** `?tutorial=1` always replays it. */
export const tutorialRequested = (search = window.location.search) => new URLSearchParams(search).get('tutorial') === '1';
