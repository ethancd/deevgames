// Pure client-side view preferences: things that change how the UI renders
// but never touch MatchState or the server. Persisted in localStorage only,
// so a preference survives reloads but never becomes part of game state.
//
// "Compact starters" (designer request): collapses plain starter-deck
// keepers so the novel (human/claude-designed) cards stand out. Read at
// render time by board.ts/hand.ts via values app.ts passes in — see
// app.ts's renderPlayingScreen.

const COMPACT_STARTERS_KEY = 'lution:compactStarters';

export function isCompactStartersEnabled(): boolean {
  try {
    return localStorage.getItem(COMPACT_STARTERS_KEY) === '1';
  } catch {
    // Storage can throw (private browsing, quota, disabled) -- default OFF
    // rather than let a pure view preference break the page.
    return false;
  }
}

// Flips the stored preference and returns the new value.
export function toggleCompactStarters(): boolean {
  const next = !isCompactStartersEnabled();
  try {
    if (next) localStorage.setItem(COMPACT_STARTERS_KEY, '1');
    else localStorage.removeItem(COMPACT_STARTERS_KEY);
  } catch {
    // Ignore -- see isCompactStartersEnabled's comment.
  }
  return next;
}
