// All Periodic Table content. 118 elements, partitioned into 13 leaf decks
// (every element in exactly one deck — Everyday Elements was dropped). The four
// Transition Metals decks (rows 4–7) all carry family "Transition metal".
//
// block & type are derived from family, with the two contestable cells (H, He)
// pinned by constants in ../periodic/config.js.

import { HYDROGEN_BLOCK, HELIUM_BLOCK, FAMILY_COLORS } from '../periodic/config.js'

// deckId -> { title, emoji, family, els: [[name, symbol, atomicNumber], ...] }
const DECK_DEFS = [
  {
    id: 'pt-alkali',
    title: 'Alkali Metals',
    emoji: '🔥',
    family: 'Alkali metal',
    els: [
      ['Lithium', 'Li', 3],
      ['Sodium', 'Na', 11],
      ['Potassium', 'K', 19],
      ['Rubidium', 'Rb', 37],
      ['Caesium', 'Cs', 55],
      ['Francium', 'Fr', 87],
    ],
  },
  {
    id: 'pt-alkaline-earth',
    title: 'Alkaline Earth Metals',
    emoji: '🪨',
    family: 'Alkaline earth metal',
    els: [
      ['Beryllium', 'Be', 4],
      ['Magnesium', 'Mg', 12],
      ['Calcium', 'Ca', 20],
      ['Strontium', 'Sr', 38],
      ['Barium', 'Ba', 56],
      ['Radium', 'Ra', 88],
    ],
  },
  {
    id: 'pt-tm4',
    title: 'Transition Metals 4',
    emoji: '⚙️',
    family: 'Transition metal',
    els: [
      ['Scandium', 'Sc', 21],
      ['Titanium', 'Ti', 22],
      ['Vanadium', 'V', 23],
      ['Chromium', 'Cr', 24],
      ['Manganese', 'Mn', 25],
      ['Iron', 'Fe', 26],
      ['Cobalt', 'Co', 27],
      ['Nickel', 'Ni', 28],
      ['Copper', 'Cu', 29],
      ['Zinc', 'Zn', 30],
    ],
  },
  {
    id: 'pt-tm5',
    title: 'Transition Metals 5',
    emoji: '⚙️',
    family: 'Transition metal',
    els: [
      ['Yttrium', 'Y', 39],
      ['Zirconium', 'Zr', 40],
      ['Niobium', 'Nb', 41],
      ['Molybdenum', 'Mo', 42],
      ['Technetium', 'Tc', 43],
      ['Ruthenium', 'Ru', 44],
      ['Rhodium', 'Rh', 45],
      ['Palladium', 'Pd', 46],
      ['Silver', 'Ag', 47],
      ['Cadmium', 'Cd', 48],
    ],
  },
  {
    id: 'pt-tm6',
    title: 'Transition Metals 6',
    emoji: '⚙️',
    family: 'Transition metal',
    els: [
      ['Hafnium', 'Hf', 72],
      ['Tantalum', 'Ta', 73],
      ['Tungsten', 'W', 74],
      ['Rhenium', 'Re', 75],
      ['Osmium', 'Os', 76],
      ['Iridium', 'Ir', 77],
      ['Platinum', 'Pt', 78],
      ['Gold', 'Au', 79],
      ['Mercury', 'Hg', 80],
    ],
  },
  {
    id: 'pt-tm7',
    title: 'Transition Metals 7',
    emoji: '⚙️',
    family: 'Transition metal',
    els: [
      ['Rutherfordium', 'Rf', 104],
      ['Dubnium', 'Db', 105],
      ['Seaborgium', 'Sg', 106],
      ['Bohrium', 'Bh', 107],
      ['Hassium', 'Hs', 108],
      ['Meitnerium', 'Mt', 109],
      ['Darmstadtium', 'Ds', 110],
      ['Roentgenium', 'Rg', 111],
      ['Copernicium', 'Cn', 112],
    ],
  },
  {
    id: 'pt-lanthanide',
    title: 'Lanthanides',
    emoji: '🧲',
    family: 'Lanthanide',
    els: [
      ['Lanthanum', 'La', 57],
      ['Cerium', 'Ce', 58],
      ['Praseodymium', 'Pr', 59],
      ['Neodymium', 'Nd', 60],
      ['Promethium', 'Pm', 61],
      ['Samarium', 'Sm', 62],
      ['Europium', 'Eu', 63],
      ['Gadolinium', 'Gd', 64],
      ['Terbium', 'Tb', 65],
      ['Dysprosium', 'Dy', 66],
      ['Holmium', 'Ho', 67],
      ['Erbium', 'Er', 68],
      ['Thulium', 'Tm', 69],
      ['Ytterbium', 'Yb', 70],
      ['Lutetium', 'Lu', 71],
    ],
  },
  {
    id: 'pt-actinide',
    title: 'Actinides',
    emoji: '☢️',
    family: 'Actinide',
    els: [
      ['Actinium', 'Ac', 89],
      ['Thorium', 'Th', 90],
      ['Protactinium', 'Pa', 91],
      ['Uranium', 'U', 92],
      ['Neptunium', 'Np', 93],
      ['Plutonium', 'Pu', 94],
      ['Americium', 'Am', 95],
      ['Curium', 'Cm', 96],
      ['Berkelium', 'Bk', 97],
      ['Californium', 'Cf', 98],
      ['Einsteinium', 'Es', 99],
      ['Fermium', 'Fm', 100],
      ['Mendelevium', 'Md', 101],
      ['Nobelium', 'No', 102],
      ['Lawrencium', 'Lr', 103],
    ],
  },
  {
    id: 'pt-post-transition',
    title: 'Post-Transition Metals',
    emoji: '🥫',
    family: 'Post-transition metal',
    els: [
      ['Aluminium', 'Al', 13],
      ['Gallium', 'Ga', 31],
      ['Indium', 'In', 49],
      ['Tin', 'Sn', 50],
      ['Thallium', 'Tl', 81],
      ['Lead', 'Pb', 82],
      ['Bismuth', 'Bi', 83],
      ['Polonium', 'Po', 84],
      ['Nihonium', 'Nh', 113],
      ['Flerovium', 'Fl', 114],
      ['Moscovium', 'Mc', 115],
      ['Livermorium', 'Lv', 116],
    ],
  },
  {
    id: 'pt-metalloid',
    title: 'Metalloids',
    emoji: '💻',
    family: 'Metalloid',
    els: [
      ['Boron', 'B', 5],
      ['Silicon', 'Si', 14],
      ['Germanium', 'Ge', 32],
      ['Arsenic', 'As', 33],
      ['Antimony', 'Sb', 51],
      ['Tellurium', 'Te', 52],
    ],
  },
  {
    id: 'pt-reactive-nonmetal',
    title: 'Reactive Nonmetals',
    emoji: '🌬️',
    family: 'Reactive nonmetal',
    els: [
      ['Hydrogen', 'H', 1],
      ['Carbon', 'C', 6],
      ['Nitrogen', 'N', 7],
      ['Oxygen', 'O', 8],
      ['Phosphorus', 'P', 15],
      ['Sulfur', 'S', 16],
      ['Selenium', 'Se', 34],
    ],
  },
  {
    id: 'pt-halogen',
    title: 'Halogens',
    emoji: '🧪',
    family: 'Halogen',
    els: [
      ['Fluorine', 'F', 9],
      ['Chlorine', 'Cl', 17],
      ['Bromine', 'Br', 35],
      ['Iodine', 'I', 53],
      ['Astatine', 'At', 85],
      ['Tennessine', 'Ts', 117],
    ],
  },
  {
    id: 'pt-noble-gas',
    title: 'Noble Gases',
    emoji: '🎈',
    family: 'Noble gas',
    els: [
      ['Helium', 'He', 2],
      ['Neon', 'Ne', 10],
      ['Argon', 'Ar', 18],
      ['Krypton', 'Kr', 36],
      ['Xenon', 'Xe', 54],
      ['Radon', 'Rn', 86],
      ['Oganesson', 'Og', 118],
    ],
  },
]

// family -> block (overridden per element for H/He)
const FAMILY_BLOCK = {
  'Alkali metal': 's',
  'Alkaline earth metal': 's',
  'Transition metal': 'd',
  Lanthanide: 'f',
  Actinide: 'f',
  Metalloid: 'p',
  'Post-transition metal': 'p',
  'Reactive nonmetal': 'p',
  Halogen: 'p',
  'Noble gas': 'p',
}
// family -> metal / metalloid / nonmetal
const FAMILY_TYPE = {
  'Alkali metal': 'metal',
  'Alkaline earth metal': 'metal',
  'Transition metal': 'metal',
  Lanthanide: 'metal',
  Actinide: 'metal',
  'Post-transition metal': 'metal',
  Metalloid: 'metalloid',
  'Reactive nonmetal': 'nonmetal',
  Halogen: 'nonmetal',
  'Noble gas': 'nonmetal',
}

function blockFor(atomicNumber, family) {
  if (atomicNumber === 1) return HYDROGEN_BLOCK
  if (atomicNumber === 2) return HELIUM_BLOCK
  return FAMILY_BLOCK[family]
}

// Flatten to canonical element records.
export const ELEMENTS = DECK_DEFS.flatMap((d) =>
  d.els.map(([name, symbol, atomicNumber]) => ({
    name,
    symbol,
    atomicNumber,
    deckId: d.id,
    family: d.family,
    block: blockFor(atomicNumber, d.family),
    type: FAMILY_TYPE[d.family],
  }))
)

// The 13 leaf decks (menu + within-deck distractors). Menu order puts the
// nonmetals (and the metalloid bridge) on top, then the metals.
const PT_DECK_ORDER = [
  'pt-reactive-nonmetal',
  'pt-halogen',
  'pt-noble-gas',
  'pt-metalloid',
  'pt-alkali',
  'pt-alkaline-earth',
  'pt-tm4',
  'pt-tm5',
  'pt-tm6',
  'pt-tm7',
  'pt-post-transition',
  'pt-lanthanide',
  'pt-actinide',
]
export const PT_DECKS = PT_DECK_ORDER.map((id) => {
  const d = DECK_DEFS.find((x) => x.id === id)
  return { id: d.id, title: d.title, emoji: d.emoji, family: d.family, color: FAMILY_COLORS[d.family], kind: 'leaf' }
})

// The 4 block composites (knowledge tree above the leaves).
export const PT_COMPOSITES = [
  { id: 'pt-sblock', title: 's-block', emoji: '🟥', kind: 'composite', color: '#ef4444', children: ['pt-alkali', 'pt-alkaline-earth'] },
  {
    id: 'pt-pblock',
    title: 'p-block',
    emoji: '🟦',
    kind: 'composite',
    color: '#3b82f6',
    children: ['pt-metalloid', 'pt-post-transition', 'pt-reactive-nonmetal', 'pt-halogen', 'pt-noble-gas'],
  },
  { id: 'pt-dblock', title: 'd-block · Transition Metals', emoji: '🟨', kind: 'composite', color: '#eab308', children: ['pt-tm4', 'pt-tm5', 'pt-tm6', 'pt-tm7'] },
  { id: 'pt-fblock', title: 'f-block · Inner Transition', emoji: '🟪', kind: 'composite', color: '#a855f7', children: ['pt-lanthanide', 'pt-actinide'] },
]

// Closed label sets for the categorical questions.
export const FAMILIES = [
  'Alkali metal',
  'Alkaline earth metal',
  'Transition metal',
  'Post-transition metal',
  'Metalloid',
  'Reactive nonmetal',
  'Halogen',
  'Noble gas',
  'Lanthanide',
  'Actinide',
]
export const BLOCKS = ['s', 'p', 'd', 'f']
export const TYPES = ['metal', 'metalloid', 'nonmetal']

export function getNode(id) {
  return PT_DECKS.find((d) => d.id === id) || PT_COMPOSITES.find((c) => c.id === id)
}

export function elementsForDeck(deckId) {
  return ELEMENTS.filter((e) => e.deckId === deckId)
}
