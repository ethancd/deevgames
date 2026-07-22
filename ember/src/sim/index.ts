/**
 * EMBER — sim module public API (src/sim/index.ts).
 *
 * Required exports per src/core/types.ts:
 *   generateWorld, stepWorld, isPassable, isDay, observe, findPath
 */

export { generateWorld } from './worldgen';
export { stepWorld } from './stepWorld';
export { isPassable, isDay } from './grid';
export { observe } from './observe';
export { findPath } from './pathfinding';
