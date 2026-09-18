/** Frozen September 2026 Hard AI evidence was authored against Metal v2.8.
 * Load only in historical evidence tests; current-rule parity and Yan tests do
 * not import this mock. Vitest isolates the catalogue in each test file.
 */
import { vi } from 'vitest';
vi.mock('../../src/game/units', async importOriginal => {
  const units = await importOriginal<typeof import('../../src/game/units')>();
  Object.assign(units.getUnitDefinition('metal_1'), { name: 'Inyan', speed: 1, mining: 2 });
  Object.assign(units.getUnitDefinition('metal_2'), { attack: 2, mining: 3 });
  Object.assign(units.getUnitDefinition('metal_3'), { mining: 4 });
  return units;
});
