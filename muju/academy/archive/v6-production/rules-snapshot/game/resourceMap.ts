/** Unequal routes, central-reserve revision (v2.7): 0 / 4 / 8 / 10.
 * New matches use this 180-degree symmetric 480-crystal layout.
 * Existing games retain their stored cells and initialResourceLayers. */
export const RESOURCE_MAP_NAME = 'Unequal routes';
export const UNEQUAL_ROUTES_MAP: readonly number[] = Object.freeze([
  10,10,10,0,0,0,4,4,4,4,
  10,10,4,0,0,0,4,10,10,4,
  10,4,4,0,0,0,4,10,10,4,
  4,4,4,4,4,8,4,4,4,4,
  4,4,4,8,8,8,4,4,4,4,
  4,4,4,4,8,8,8,4,4,4,
  4,4,4,4,8,4,4,4,4,4,
  4,10,10,4,0,0,0,4,4,10,
  4,10,10,4,0,0,0,4,10,10,
  4,4,4,4,0,0,0,10,10,10,
]);
export const INITIAL_MAP_RESOURCES = UNEQUAL_ROUTES_MAP.reduce((sum,n)=>sum+n,0);
