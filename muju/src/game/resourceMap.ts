/** Map D, Unequal routes. Empty approaches revision: former two-crystal cells start empty. Fixed 10×10, 180° rotation; unit catalogue remains v1.3.
 * Rows are top to bottom. Each value is initial capacity, never pre-mined depth. */
export const RESOURCE_MAP_NAME = 'Unequal routes';
export const UNEQUAL_ROUTES_MAP: readonly number[] = Object.freeze([
  5, 5, 3, 0, 0, 0, 3, 3, 3, 3,
  5, 5, 3, 0, 0, 0, 5, 5, 5, 3,
  3, 3, 3, 0, 0, 3, 5, 5, 5, 3,
  4, 4, 4, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 3, 3, 3, 3, 3, 4, 4,
  4, 4, 3, 3, 3, 3, 3, 4, 4, 4,
  3, 3, 3, 3, 3, 3, 3, 4, 4, 4,
  3, 5, 5, 5, 3, 0, 0, 3, 3, 3,
  3, 5, 5, 5, 0, 0, 0, 3, 5, 5,
  3, 3, 3, 3, 0, 0, 0, 3, 5, 5,
]);
export const INITIAL_MAP_RESOURCES = UNEQUAL_ROUTES_MAP.reduce((sum,n)=>sum+n,0);
