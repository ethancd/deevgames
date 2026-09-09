import type { PlayerState } from '../game/types';
export function ResourceDisplay({playerState, label}: {playerState: PlayerState; viewerIsOwner?: boolean; label?: string}) {
  return <div><strong>{label ?? playerState.id} · ◆ {playerState.resources}</strong><p>Gained {playerState.resourcesGained}</p></div>;
}
