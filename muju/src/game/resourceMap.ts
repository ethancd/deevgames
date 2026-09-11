/** Unequal routes, passive reserves revision (v2.0): 0 / 4 / 8 / 10.
 * v2.3: C4/C5/H6/H7 reduced to 4; 180° symmetry, 504 crystals. */
export const RESOURCE_MAP_NAME = 'Unequal routes';
export const UNEQUAL_ROUTES_MAP: readonly number[] = Object.freeze([
  10, 10, 4, 0, 0, 0, 4, 4, 4, 4,
  10, 10, 4, 0, 0, 0, 10, 10, 10, 4,
  4, 4, 4, 0, 0, 4, 10, 10, 10, 4,
  8, 8, 4, 4, 4, 4, 4, 4, 4, 4,
  8, 8, 4, 4, 4, 4, 4, 4, 8, 8,
  8, 8, 4, 4, 4, 4, 4, 4, 8, 8,
  4, 4, 4, 4, 4, 4, 4, 4, 8, 8,
  4, 10, 10, 10, 4, 0, 0, 4, 4, 4,
  4, 10, 10, 10, 0, 0, 0, 4, 10, 10,
  4, 4, 4, 4, 0, 0, 0, 4, 10, 10,
]);
export const INITIAL_MAP_RESOURCES = UNEQUAL_ROUTES_MAP.reduce((sum,n)=>sum+n,0);
