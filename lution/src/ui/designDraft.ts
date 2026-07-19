// Lightweight localStorage autosave for the human's OWN blind-design draft
// (view-layer only -- never touches MatchState or the server). Exists to fix
// a real annoyance: when Claude's design call fails (POST /api/design-card
// errors after retries), src/ui/app.ts's runDesignFlow swaps the whole
// content region over to the design-failure screen (renderDesignFailure),
// which wipes out whatever the human had typed into their OWN not-yet-
// submitted design form -- there was no other place that text was living.
// renderDesignForm (this module) saves a debounced draft on every keystroke
// and restores it (for the SAME round only) the next time it renders, so a
// design-failure detour (or an accidental reload) doesn't cost the human
// their card text.
//
// Explicitly NOT restored into the design-failure screen's "ghostwrite
// Claude's card" fallback form (see renderDesignFailure below) -- that
// textarea holds CLAUDE's card, not the human's, so prefilling it from this
// draft would silently paste the human's own design into Claude's slot.
//
// clearDesignDraft() is called ONLY at the round-resolution lifecycle point
// (src/ui/app.ts's finalizeRoundResolution) -- NOT at submit-accept. This was
// a real bug (2026-07-03): clearing at submit-time meant that if the human
// locked in their design and Claude's call then failed, "Retry design call"
// re-rendered a design form with nothing left to restore -- the human's own
// locked-in text was gone. The round-scoped key already means a stale draft
// can't leak into a LATER round's form, so there was never a need to clear
// it any earlier than "this round is fully done."

const DRAFT_KEY = 'lution:designDraft';

export interface DesignDraft {
  round: number;
  name: string;
  effectText: string;
}

// Returns the saved draft only if it matches `round` -- a stale draft from
// an earlier round must never leak into a later round's form.
export function loadDesignDraft(round: number): DesignDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DesignDraft>;
    if (
      typeof parsed.round !== 'number' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.effectText !== 'string' ||
      parsed.round !== round
    ) {
      return null;
    }
    return { round: parsed.round, name: parsed.name, effectText: parsed.effectText };
  } catch {
    // Corrupt/unparseable draft, or localStorage unavailable -- treat as no
    // draft rather than throwing and blocking the design screen from
    // rendering at all.
    return null;
  }
}

export function saveDesignDraft(draft: DesignDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Best-effort only (private browsing / storage quota) -- must never
    // block typing.
  }
}

// Called once the human's design is actually locked in (submit accepted) and
// once a round's resolution fully completes -- both are lifecycle points
// after which this draft no longer refers to anything pending.
export function clearDesignDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // no-op
  }
}
