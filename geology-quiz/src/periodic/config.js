// Periodic Table tunables — one place to flip the knobs the spec asked to expose.

// A node (leaf deck or composite block) is crowned only at this accuracy...
export const CROWN_PCT = 100
// ...and (when true) in EVERY one of the six directions, not just one.
export const CROWN_REQUIRE_ALL_DIRECTIONS = true

// A composite block unlocks once this many of its children are crowned.
export const COMPOSITE_UNLOCK = 2

// The Gradual Gauntlet unlocks once this many nodes (any) are crowned.
export const GRADUAL_GAUNTLET_UNLOCK = 2

// Block assignment for the two contestable cells. Hydrogen is uncontroversially
// s-block. Helium is 1s² → s-block by the valence-subshell rule, but every
// colored wall chart draws it in the noble-gas (p) column — the user chose p.
export const HYDROGEN_BLOCK = 's'
export const HELIUM_BLOCK = 'p'

// Classic periodic-chart palette, one bright color per canonical family.
export const FAMILY_COLORS = {
  'Alkali metal': '#ef4444',
  'Alkaline earth metal': '#f97316',
  'Transition metal': '#eab308',
  'Post-transition metal': '#22c55e',
  Metalloid: '#14b8a6',
  'Reactive nonmetal': '#3b82f6',
  Halogen: '#8b5cf6',
  'Noble gas': '#ec4899',
  Lanthanide: '#06b6d4',
  Actinide: '#a855f7',
}
