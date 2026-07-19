// Formats and appends the NEXT_CARDS.md audit-trail entry for one resolved
// design round (both designs, the winner, and the keep/steal/destroy
// outcome), via server/persistence.ts#appendNextCardsEntry.

import type { CardDef, CardId, PlayerId, RoundPick, RoundRecord } from '../shared/types';

function cardLabel(id: CardId | null, registry: readonly CardDef[]): string {
  if (!id) return '(none -- voided by the identical-simultaneous-designs rule)';
  const card = registry.find((c) => c.id === id);
  return card ? `"${card.name}" (${card.id})` : id;
}

function playerLabel(id: PlayerId): string {
  return id === 'human' ? 'the human' : 'Claude';
}

// Narrates one pick (loserPick or winnerPick) in plain English. `picker` is
// whoever made this pick; `offeredBy` is whose design was on the table.
function narratePick(
  picker: PlayerId,
  offeredBy: PlayerId,
  pick: RoundPick,
  registry: readonly CardDef[]
): string {
  const pickerName = playerLabel(picker);
  const offererName = playerLabel(offeredBy);
  const cardText = cardLabel(pick.cardId, registry);

  if (pick.source === 'design') {
    return `${pickerName} took ${offererName}'s new design ${cardText}.`;
  }

  // 'existing': the offered design was spurned (destroyed) either way.
  const spurnedNote = `spurning (and destroying) ${offererName}'s new design in the process`;
  if (pick.outcome === 'destroyed') {
    return (
      `${pickerName} reached into ${offererName}'s deck and destroyed ${cardText} instead of ` +
      `taking it (${pickerName} originally created it -- denial, not profit), ${spurnedNote}.`
    );
  }
  return `${pickerName} took ${cardText} from ${offererName}'s deck, ${spurnedNote}.`;
}

export function formatNextCardsEntry(
  record: RoundRecord,
  registry: readonly CardDef[]
): string {
  const lines: string[] = [];

  lines.push(`## Round ${record.round}`);
  lines.push('');
  lines.push(`- Resolved: ${record.timestamp}`);
  lines.push(`- Human design: ${cardLabel(record.designs.human, registry)}`);
  lines.push(`- Claude design: ${cardLabel(record.designs.claude, registry)}`);
  lines.push(`- Round winner: **${record.winner}** (loser: ${record.loser})`);
  lines.push(`- Loser's decision: **${record.decision}**`);

  if (record.decision === 'keep') {
    lines.push('- Resolution: each player added their own new design to their own deck (no cards moved).');
  } else {
    if (record.loserPick) {
      lines.push(`- Step 1 (loser picks first): ${narratePick(record.loser, record.winner, record.loserPick, registry)}`);
    }
    if (record.winnerPick) {
      lines.push(`- Step 2 (winner counter-raids): ${narratePick(record.winner, record.loser, record.winnerPick, registry)}`);
    }
    if (record.destroyed.length > 0) {
      const destroyedText = record.destroyed.map((id) => cardLabel(id, registry)).join(', ');
      lines.push(`- Destroyed this round (extinct forever): ${destroyedText}.`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
