/**
 * Learn to Play deep links. `/muju/?learn=1` opens the map, `/muju/?learn=<id>`
 * a puzzle. A query parameter needs no server route and no static-build copy,
 * and either form skips the first-visit tutorial gate. `fixture=1` loads the
 * id from the test fixtures instead of the catalog (tests only).
 */
export type LearnRoute = { kind: 'map' } | { kind: 'puzzle'; id: string; fixture?: boolean };

export function parseLearnRoute(search: string): LearnRoute | null {
  const params = new URLSearchParams(search);
  const learn = params.get('learn');
  if (learn === null || learn === '') return null;
  if (learn === '1') return { kind: 'map' };
  return { kind: 'puzzle', id: learn, ...(params.get('fixture') === '1' ? { fixture: true } : {}) };
}

/** The URL for a route, keeping unrelated parameters and the current path. */
export function learnUrl(route: LearnRoute | null, current = typeof window === 'undefined' ? '/muju/' : window.location.href): string {
  const url = new URL(current, 'http://localhost');
  url.searchParams.delete('learn');
  url.searchParams.delete('fixture');
  url.searchParams.delete('tutorial');
  if (route?.kind === 'map') url.searchParams.set('learn', '1');
  if (route?.kind === 'puzzle') {
    url.searchParams.set('learn', route.id);
    if (route.fixture) url.searchParams.set('fixture', '1');
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export const sameRoute = (a: LearnRoute | null, b: LearnRoute | null): boolean =>
  a === b || (!!a && !!b && a.kind === b.kind && (a.kind !== 'puzzle' || b.kind !== 'puzzle' || (a.id === b.id && !!a.fixture === !!b.fixture)));
