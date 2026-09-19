/** Unequal routes, expansion-economy revision (v2.8): 0 / 4 / 8 / 16.
 * New matches use this 180-degree symmetric 504-crystal layout.
 * Existing games retain their stored cells and initialResourceLayers. */
export const RESOURCE_MAP_NAME = 'Unequal routes';
export const MAX_RESOURCE_RESERVE = 16;
export const UNEQUAL_ROUTES_MAP: readonly number[] = Object.freeze([
  8,8,8,0,0,0,4,4,4,4,
  8,8,4,0,0,0,4,16,16,4,
  8,4,4,0,0,0,4,16,16,4,
  4,4,4,4,4,8,4,4,4,4,
  4,4,4,8,8,8,4,4,4,4,
  4,4,4,4,8,8,8,4,4,4,
  4,4,4,4,8,4,4,4,4,4,
  4,16,16,4,0,0,0,4,4,8,
  4,16,16,4,0,0,0,4,8,8,
  4,4,4,4,0,0,0,8,8,8,
]);
export const INITIAL_MAP_RESOURCES = UNEQUAL_ROUTES_MAP.reduce((sum,n)=>sum+n,0);
