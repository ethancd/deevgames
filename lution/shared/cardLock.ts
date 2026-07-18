// Non-blocking implement-job feature: the single source of truth for
// whether a card TYPE is "locked" -- drawable/holdable/discardable but not
// playable, because the implement job that will give it an effect module is
// still running in the background. No new persisted state: lock status is
// always DERIVED from the registry entry, never snapshotted or cached, so
// the moment the job flips `implemented` to true (and the client hot-loads
// the effect module), the card is playable in place -- same instance,
// wherever it happens to be sitting (hand, deck, ...).
//
// Framework-free (like shared/types.ts) so both the client and, if ever
// needed, the server can share this exact predicate.

import type { CardDef } from './types';

export function isCardLocked(card: CardDef | undefined): boolean {
  if (!card) return false;
  return card.implemented === false && card.destroyed === false;
}
