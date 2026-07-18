import { flags } from '../flags.js'

// All quiz content lives here. No backend.
//
// Each deck:
//   id        - stable key, used for localStorage
//   title     - shown on home screen
//   emoji     - little icon for the level tile
//   color     - tile accent color
//   blurb     - one-line description
//   sides     - [side0Label, side1Label]; default quiz direction is side0 -> side1
//   imageOn   - index of the side that carries the picture (or null)
//   reversible- true if you can also quiz side1 -> side0 (symmetric pairing)
//   tagLabel  - optional: name of the sub-group dimension (e.g. "Type", "Family")
//   tags      - optional: list of sub-groups you can filter a test by
//   items     - [{ sides:[a,b], img?, tag? }]

const DECKS = [
  {
    id: 'mohs',
    title: 'Mohs Hardness',
    emoji: '💎',
    color: '#2563eb',
    blurb: 'Match each hardness number to its mineral',
    sides: ['Mohs Hardness', 'Mineral'],
    imageOn: 1,
    reversible: true,
    items: [
      { sides: ['1', 'Talc'], img: 'talc' },
      { sides: ['2', 'Gypsum'], img: 'gypsum' },
      { sides: ['3', 'Calcite'], img: 'calcite' },
      { sides: ['4', 'Fluorite'], img: 'fluorite' },
      { sides: ['5', 'Apatite'], img: 'apatite' },
      { sides: ['6', 'Orthoclase'], img: 'orthoclase' },
      { sides: ['7', 'Quartz'], img: 'quartz' },
      { sides: ['8', 'Topaz'], img: 'topaz' },
      { sides: ['9', 'Corundum'], img: 'corundum' },
      { sides: ['10', 'Diamond'], img: 'diamond' },
    ],
  },

  {
    id: 'formulas',
    title: 'Mineral Formulas',
    emoji: '🧪',
    color: '#0d9488',
    blurb: 'Name the chemical formula for each mineral',
    sides: ['Mineral', 'Formula'],
    imageOn: 0,
    subOn: 1, // side index 1 (the formula) gets a chemical-name subtitle
    crystalOn: 1, // the formula side shows the mineral's idealized crystal form
    reversible: true,
    items: [
      { sides: ['Quartz', 'SiO₂'], sub: 'Silicon dioxide', img: 'quartz', crystal: 'hex-prism' },
      { sides: ['Halite', 'NaCl'], sub: 'Sodium chloride', img: 'halite', crystal: 'cube' },
      { sides: ['Calcite', 'CaCO₃'], sub: 'Calcium carbonate', img: 'calcite', crystal: 'rhombohedron' },
      { sides: ['Pyrite', 'FeS₂'], sub: 'Iron sulfide', img: 'pyrite', crystal: 'cube' },
      { sides: ['Galena', 'PbS'], sub: 'Lead sulfide', img: 'galena', crystal: 'cube' },
      { sides: ['Hematite', 'Fe₂O₃'], sub: 'Iron(III) oxide', img: 'hematite' },
      { sides: ['Magnetite', 'Fe₃O₄'], sub: 'Iron(II,III) oxide', img: 'magnetite', crystal: 'octahedron' },
      { sides: ['Fluorite', 'CaF₂'], sub: 'Calcium fluoride', img: 'fluorite', crystal: 'octahedron' },
      { sides: ['Gypsum', 'CaSO₄·2H₂O'], sub: 'Calcium sulfate dihydrate', img: 'gypsum', flag: 'showExtraFormulas' },
      { sides: ['Corundum', 'Al₂O₃'], sub: 'Aluminum oxide', img: 'corundum', crystal: 'hex-prism' },
      { sides: ['Graphite', 'C'], sub: 'Carbon (hexagonal layers)', img: 'graphite' },
      { sides: ['Diamond', 'C'], sub: 'Carbon (tetrahedral network)', img: 'diamond' },
      { sides: ['Sphalerite', 'ZnS'], sub: 'Zinc sulfide', img: 'sphalerite', crystal: 'tetrahedron' },
      { sides: ['Cinnabar', 'HgS'], sub: 'Mercury sulfide', img: 'cinnabar' },
      { sides: ['Chalcopyrite', 'CuFeS₂'], sub: 'Copper iron sulfide', img: 'chalcopyrite' },
      { sides: ['Malachite', 'Cu₂CO₃(OH)₂'], sub: 'Copper carbonate hydroxide', img: 'malachite', flag: 'showExtraFormulas' },
      { sides: ['Olivine', '(Mg,Fe)₂SiO₄'], sub: 'Magnesium iron silicate', img: 'olivine', flag: 'showExtraFormulas' },
      { sides: ['Orthoclase', 'KAlSi₃O₈'], sub: 'Potassium aluminum silicate', img: 'orthoclase', flag: 'showExtraFormulas' },
      { sides: ['Talc', 'Mg₃Si₄O₁₀(OH)₂'], sub: 'Magnesium silicate hydroxide', img: 'talc', flag: 'showExtraFormulas' },
      { sides: ['Gold', 'Au'], sub: 'Gold (native element)', img: 'gold' },
      { sides: ['Silver', 'Ag'], sub: 'Silver (native element)', img: 'silver' },
      { sides: ['Copper', 'Cu'], sub: 'Copper (native element)', img: 'copper' },
      { sides: ['Sulfur', 'S'], sub: 'Sulfur (native element)', img: 'sulfur' },
      { sides: ['Apatite', 'Ca₅(PO₄)₃(F,Cl,OH)'], sub: 'Calcium phosphate', img: 'apatite', crystal: 'hex-prism', flag: 'showExtraFormulas' },
    ],
  },

  {
    id: 'time',
    title: 'Geologic Time',
    emoji: '⏳',
    color: '#d97706',
    blurb: 'When did each span begin? (millions of years ago)',
    sides: ['Time span', 'Started'],
    imageOn: 0, // the period/eon/era name side carries the picture
    subOn: 1, // the number gets a "million years ago" subtitle
    reversible: false,
    tagLabel: 'Group',
    tags: ['eon', 'era', 'period'],
    items: [
      // Eons
      { sides: ['Hadean', '4600'], sub: 'million years ago', tag: 'eon', img: 'time-hadean' },
      { sides: ['Archean', '4000'], sub: 'million years ago', tag: 'eon', img: 'time-archean' },
      { sides: ['Proterozoic', '2500'], sub: 'million years ago', tag: 'eon', img: 'time-proterozoic' },
      { sides: ['Phanerozoic', '541'], sub: 'million years ago', tag: 'eon', img: 'time-phanerozoic' },
      // Eras
      { sides: ['Paleozoic', '541'], sub: 'million years ago', tag: 'era', img: 'time-paleozoic' },
      { sides: ['Mesozoic', '252'], sub: 'million years ago', tag: 'era', img: 'time-mesozoic' },
      { sides: ['Cenozoic', '66'], sub: 'million years ago', tag: 'era', img: 'time-cenozoic' },
      // Periods
      { sides: ['Cambrian', '541'], sub: 'million years ago', tag: 'period', img: 'time-cambrian' },
      { sides: ['Ordovician', '485'], sub: 'million years ago', tag: 'period', img: 'time-ordovician' },
      { sides: ['Silurian', '444'], sub: 'million years ago', tag: 'period', img: 'time-silurian' },
      { sides: ['Devonian', '419'], sub: 'million years ago', tag: 'period', img: 'time-devonian' },
      { sides: ['Carboniferous', '359'], sub: 'million years ago', tag: 'period', img: 'time-carboniferous' },
      { sides: ['Permian', '299'], sub: 'million years ago', tag: 'period', img: 'time-permian' },
      { sides: ['Triassic', '252'], sub: 'million years ago', tag: 'period', img: 'time-triassic' },
      { sides: ['Jurassic', '201'], sub: 'million years ago', tag: 'period', img: 'time-jurassic' },
      { sides: ['Cretaceous', '145'], sub: 'million years ago', tag: 'period', img: 'time-cretaceous' },
      { sides: ['Paleogene', '66'], sub: 'million years ago', tag: 'period', img: 'time-paleogene' },
      { sides: ['Neogene', '23'], sub: 'million years ago', tag: 'period', img: 'time-neogene' },
      { sides: ['Quaternary', '2.6'], sub: 'million years ago', tag: 'period', img: 'time-quaternary' },
    ],
  },

  {
    id: 'rocks',
    title: 'Rock Families',
    emoji: '🪨',
    color: '#7c3aed',
    blurb: 'Sort each rock into its family',
    sides: ['Rock', 'Family'],
    imageOn: 0,
    reversible: false,
    items: [
      { sides: ['Granite', 'Igneous'], tag: 'Igneous', img: 'granite' },
      { sides: ['Basalt', 'Igneous'], tag: 'Igneous', img: 'basalt' },
      { sides: ['Obsidian', 'Igneous'], tag: 'Igneous', img: 'obsidian' },
      { sides: ['Pumice', 'Igneous'], tag: 'Igneous', img: 'pumice' },
      { sides: ['Sandstone', 'Sedimentary'], tag: 'Sedimentary', img: 'sandstone' },
      { sides: ['Limestone', 'Sedimentary'], tag: 'Sedimentary', img: 'limestone' },
      { sides: ['Shale', 'Sedimentary'], tag: 'Sedimentary', img: 'shale' },
      { sides: ['Conglomerate', 'Sedimentary'], tag: 'Sedimentary', img: 'conglomerate' },
      { sides: ['Marble', 'Metamorphic'], tag: 'Metamorphic', img: 'marble' },
      { sides: ['Slate', 'Metamorphic'], tag: 'Metamorphic', img: 'slate' },
      { sides: ['Gneiss', 'Metamorphic'], tag: 'Metamorphic', img: 'gneiss' },
      { sides: ['Quartzite', 'Metamorphic'], tag: 'Metamorphic', img: 'quartzite' },
      { sides: ['Schist', 'Metamorphic'], tag: 'Metamorphic', img: 'schist' },
    ],
  },

  {
    id: 'ores',
    title: 'Ores & Metals',
    emoji: '⛏️',
    color: '#be123c',
    blurb: 'Which metal comes from each ore?',
    sides: ['Ore', 'Metal'],
    imageOn: 0, // ore side
    imageOnB: 1, // metal side (item.imgB)
    reversible: true,
    items: [
      { sides: ['Hematite', 'Iron'], img: 'hematite', imgB: 'metal-iron' },
      { sides: ['Bauxite', 'Aluminum'], img: 'bauxite', imgB: 'metal-aluminum' },
      { sides: ['Galena', 'Lead'], img: 'galena', imgB: 'metal-lead' },
      { sides: ['Sphalerite', 'Zinc'], img: 'sphalerite', imgB: 'metal-zinc' },
      { sides: ['Cinnabar', 'Mercury'], img: 'cinnabar', imgB: 'metal-mercury' },
      { sides: ['Chalcopyrite', 'Copper'], img: 'chalcopyrite', imgB: 'metal-copper' },
      { sides: ['Cassiterite', 'Tin'], img: 'cassiterite', imgB: 'metal-tin' },
      { sides: ['Native Gold', 'Gold'], img: 'gold', imgB: 'metal-gold' },
    ],
  },
]

// Feature-flagged items: hide any item whose flag is currently disabled.
for (const deck of DECKS) {
  deck.items = deck.items.filter((it) => !it.flag || flags[it.flag])
}

// Geologic-time spans display with their rank inline ("Cambrian Period",
// "Hadean Eon", "Paleozoic Era"), derived from each item's tag.
const RANK = { eon: 'Eon', era: 'Era', period: 'Period' }
for (const it of DECKS.find((d) => d.id === 'time').items) {
  const r = RANK[it.tag]
  if (r) it.sides[0] = `${it.sides[0]} ${r}`
}

// Home-screen order, chosen by the user: ores, families, formulas, mohs, times.
const ORDER = ['ores', 'rocks', 'formulas', 'mohs', 'time']
export const decks = ORDER.map((id) => DECKS.find((d) => d.id === id))

export function getDeck(id) {
  return decks.find((d) => d.id === id)
}
