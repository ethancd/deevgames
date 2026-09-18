export const shortInvitePattern = /^[a-z]{6}$/;
export const invitePattern = /^(?:[a-z]{6}|[a-f0-9]{64})$/;

export function invitationCodeFromPath(path: string): string | undefined {
  return /^\/join\/([a-z]{6})\/?$/.exec(path)?.[1];
}

export function watchCodeFromPath(path: string): string | undefined {
  return /^\/watch\/([a-z]{6})\/?$/.exec(path)?.[1];
}

export function observerUrl(serverUrl: string, roomId: string, watchCode?: string) {
  const origin = new URL(serverUrl).origin;
  return watchCode && shortInvitePattern.test(watchCode)
    ? `${origin}/watch/${watchCode}`
    : `${origin}/muju/?room=${roomId}&watch=1`;
}

export function invitationUrl(serverUrl: string, roomId: string, inviteCode: string) {
  const origin = new URL(serverUrl).origin;
  return shortInvitePattern.test(inviteCode)
    ? `${origin}/join/${inviteCode}`
    : `${origin}/muju/?room=${roomId}#invite=${inviteCode}`;
}
