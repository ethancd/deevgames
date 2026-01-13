import { useState, useCallback } from 'react';
import { ELEMENT_INFO } from '../game/elements';
import { getElementHex } from '../utils/colors';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Demo components that mirror actual game UI for instruction purposes
function DemoUnit({
  element,
  tier,
  isPlayer = true,
  size = 'md',
  damage = 0,
}: {
  element: keyof typeof ELEMENT_INFO;
  tier: number;
  isPlayer?: boolean;
  size?: 'sm' | 'md' | 'lg';
  damage?: number;
}) {
  const color = getElementHex(element);
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : size === 'lg' ? 'w-10 h-10 text-base' : 'w-8 h-8 text-sm';
  return (
    <div className="relative inline-block">
      <div
        className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white ${
          isPlayer ? 'ring-2 ring-white' : 'ring-2 ring-black'
        }`}
        style={{ backgroundColor: color }}
      >
        {tier}
      </div>
      {damage > 0 && (
        <div className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          -{damage}
        </div>
      )}
    </div>
  );
}

function DemoCell({
  depth = 5,
  highlighted,
  highlightType,
  children,
}: {
  depth?: number;
  highlighted?: boolean;
  highlightType?: 'move' | 'attack' | 'spawn';
  children?: React.ReactNode;
}) {
  const depthColors = [
    'bg-gray-800', // 0 = depleted
    'bg-amber-900/40',
    'bg-amber-800/50',
    'bg-amber-700/60',
    'bg-amber-600/70',
    'bg-amber-500/80', // 5 = full
  ];

  let highlightClass = '';
  if (highlighted) {
    if (highlightType === 'move') highlightClass = 'ring-2 ring-blue-400 ring-inset';
    if (highlightType === 'attack') highlightClass = 'ring-2 ring-red-400 ring-inset';
    if (highlightType === 'spawn') highlightClass = 'ring-2 ring-cyan-400 ring-inset';
  }

  return (
    <div
      className={`w-10 h-10 border border-gray-700 flex items-center justify-center ${depthColors[depth]} ${highlightClass}`}
    >
      {children}
    </div>
  );
}

function DemoBoardSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-grid gap-0 border border-gray-600 rounded bg-gray-900 p-1">
      {children}
    </div>
  );
}

function DemoStatBox({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-col items-center bg-gray-700 rounded p-1 min-w-[40px]">
      <span className="text-[10px] text-gray-400">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

function DemoResourceDisplay({ resources, label }: { resources: number | string; label: string }) {
  return (
    <div className="p-2 bg-gray-800 rounded border border-gray-700 text-center">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="text-lg font-bold text-amber-400">{resources}</div>
    </div>
  );
}

function DemoBuildQueueItem({
  element,
  tier,
  name,
  turnsRemaining,
  ready = false,
}: {
  element: keyof typeof ELEMENT_INFO;
  tier: number;
  name: string;
  turnsRemaining?: number;
  ready?: boolean;
}) {
  const color = getElementHex(element);
  return (
    <div className={`flex items-center gap-2 text-sm p-1 rounded ${ready ? 'bg-gray-700' : ''}`}>
      <div
        className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white font-bold"
        style={{ backgroundColor: color }}
      >
        {tier}
      </div>
      <span className="text-gray-300 flex-1">{name}</span>
      {ready ? (
        <span className="text-xs text-green-400">✓</span>
      ) : (
        <span className="text-gray-500">{turnsRemaining}t</span>
      )}
    </div>
  );
}

function DemoActionDots({ remaining, max = 6 }: { remaining: number; max?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full ${i < remaining ? 'bg-green-500' : 'bg-gray-600'}`}
        />
      ))}
    </div>
  );
}

// Instruction page content
interface InstructionPage {
  title: string;
  content: React.ReactNode;
}

const instructionPages: InstructionPage[] = [
  {
    title: 'Welcome to Muju Hono Tanka',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          <strong className="text-white">Muju Hono Tanka</strong> is a tactical strategy game where you command
          elemental units on a 10×10 grid. Mine resources, build your army, and eliminate your opponent!
        </p>
        <div className="flex justify-center gap-4 flex-wrap">
          <DemoUnit element="fire" tier={1} />
          <DemoUnit element="lightning" tier={2} />
          <DemoUnit element="water" tier={3} />
          <DemoUnit element="shadow" tier={1} />
          <DemoUnit element="plant" tier={2} />
          <DemoUnit element="metal" tier={4} />
        </div>
        <p className="text-gray-400 text-sm text-center">
          Six elements, four tiers each — 24 unique units to master
        </p>
        <div className="bg-gray-800 p-3 rounded border border-gray-700">
          <h4 className="text-green-400 font-medium mb-2">Victory Condition</h4>
          <p className="text-gray-300 text-sm">
            Eliminate all enemy units. If your opponent has nothing on the board, they can't spawn
            anything — you win!
          </p>
        </div>
      </div>
    ),
  },
  {
    title: 'Board & Setup',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          The game is played on a <strong className="text-white">10×10 grid</strong>. Each cell contains up to
          5 layers of resources (shown by amber coloring).
        </p>
        <div className="flex justify-center items-end gap-2">
          <div className="text-center">
            <DemoCell depth={5} />
            <div className="text-xs text-gray-400 mt-1">Full (5)</div>
          </div>
          <div className="text-center">
            <DemoCell depth={3} />
            <div className="text-xs text-gray-400 mt-1">Partial (3)</div>
          </div>
          <div className="text-center">
            <DemoCell depth={0} />
            <div className="text-xs text-gray-400 mt-1">Depleted (0)</div>
          </div>
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700">
          <h4 className="text-cyan-400 font-medium mb-2">Starting Position</h4>
          <div className="flex items-center gap-4 justify-center">
            <div className="text-center">
              <div className="flex gap-1 justify-center mb-1">
                <DemoUnit element="fire" tier={1} size="sm" />
                <DemoUnit element="water" tier={1} size="sm" />
                <DemoUnit element="plant" tier={1} size="sm" />
              </div>
              <span className="text-xs text-gray-400">You (corner)</span>
            </div>
            <span className="text-gray-500">vs</span>
            <div className="text-center">
              <div className="flex gap-1 justify-center mb-1">
                <DemoUnit element="fire" tier={1} size="sm" isPlayer={false} />
                <DemoUnit element="water" tier={1} size="sm" isPlayer={false} />
                <DemoUnit element="plant" tier={1} size="sm" isPlayer={false} />
              </div>
              <span className="text-xs text-gray-400">Enemy (opposite)</span>
            </div>
          </div>
          <p className="text-gray-400 text-sm mt-2 text-center">
            Both players start with Hi (Fire), Kapp (Water), and Muju (Plant) — tier 1 units
          </p>
        </div>
      </div>
    ),
  },
  {
    title: 'Turn Structure',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          Each turn has <strong className="text-white">three phases</strong>. Complete each phase before moving to the next.
        </p>
        <div className="space-y-3">
          <div className="bg-purple-900/30 p-3 rounded border border-purple-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded">1</span>
              <h4 className="text-purple-400 font-medium">Place Phase</h4>
            </div>
            <p className="text-gray-300 text-sm">
              Place newly built units onto the board and promote existing units to higher tiers.
            </p>
          </div>
          <div className="bg-blue-900/30 p-3 rounded border border-blue-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded">2</span>
              <h4 className="text-blue-400 font-medium">Action Phase</h4>
            </div>
            <p className="text-gray-300 text-sm">
              Execute up to 6 actions — move, attack, or mine with your units.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400">Actions:</span>
              <DemoActionDots remaining={4} />
              <span className="text-xs text-gray-500">(4 of 6 remaining)</span>
            </div>
          </div>
          <div className="bg-green-900/30 p-3 rounded border border-green-700">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-green-600 text-white text-xs px-2 py-0.5 rounded">3</span>
              <h4 className="text-green-400 font-medium">Queue Phase</h4>
            </div>
            <p className="text-gray-300 text-sm">
              Spend resources to queue new units for construction.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Movement',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          Units move <strong className="text-white">orthogonally</strong> (no diagonals).
          Each unit has a <strong className="text-blue-400">Speed</strong> stat determining how far it can move.
        </p>
        <div className="flex justify-center">
          <DemoBoardSection>
            <div className="grid grid-cols-5 gap-0">
              <DemoCell />
              <DemoCell />
              <DemoCell highlighted highlightType="move" />
              <DemoCell />
              <DemoCell />

              <DemoCell />
              <DemoCell highlighted highlightType="move" />
              <DemoCell highlighted highlightType="move" />
              <DemoCell highlighted highlightType="move" />
              <DemoCell />

              <DemoCell highlighted highlightType="move" />
              <DemoCell highlighted highlightType="move" />
              <DemoCell><DemoUnit element="lightning" tier={2} /></DemoCell>
              <DemoCell highlighted highlightType="move" />
              <DemoCell highlighted highlightType="move" />

              <DemoCell />
              <DemoCell highlighted highlightType="move" />
              <DemoCell highlighted highlightType="move" />
              <DemoCell highlighted highlightType="move" />
              <DemoCell />

              <DemoCell />
              <DemoCell />
              <DemoCell highlighted highlightType="move" />
              <DemoCell />
              <DemoCell />
            </div>
          </DemoBoardSection>
        </div>
        <div className="flex justify-center gap-4">
          <DemoStatBox label="SPD" value={2} color="text-blue-400" />
        </div>
        <p className="text-gray-400 text-sm text-center">
          A unit with Speed 2 can move up to 2 squares in any orthogonal direction
        </p>
        <div className="bg-gray-800 p-3 rounded border border-gray-700 text-sm">
          <p className="text-gray-300">
            <strong className="text-yellow-400">Tip:</strong> Lightning units have the highest speed (up to 6),
            making them excellent scouts and flankers!
          </p>
        </div>
      </div>
    ),
  },
  {
    title: 'Combat',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          Attack adjacent enemies (orthogonally). Compare <strong className="text-red-400">Attack</strong> vs
          <strong className="text-green-400"> Defense</strong> to overcome and destroy.
        </p>
        <div className="flex justify-center items-center gap-4">
          <div className="text-center">
            <div className="relative inline-block">
              <DemoUnit element="fire" tier={2} size="lg" />
              <span className="absolute -top-1 -right-3 text-green-400 text-sm font-bold">+1⚔</span>
            </div>
            <div className="flex gap-1 mt-2 justify-center">
              <DemoStatBox label="ATK" value={4} color="text-red-400" />
            </div>
          </div>
          <span className="text-2xl text-gray-500">→</span>
          <div className="text-center">
            <DemoUnit element="plant" tier={2} size="lg" isPlayer={false} />
            <div className="flex gap-1 mt-2 justify-center">
              <DemoStatBox label="DEF" value={4} color="text-green-400" />
            </div>
          </div>
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700">
          <h4 className="text-red-400 font-medium mb-2">How Combat Works</h4>
          <p className="text-gray-300 text-sm">
            <code className="bg-gray-700 px-1 rounded">Effective Attack = Attack + Element Modifier</code>
          </p>
          <ul className="text-sm text-gray-400 mt-2 space-y-1">
            <li>• If effective attack ≥ defense, the enemy is <strong className="text-red-400">destroyed</strong></li>
            <li>• If effective attack &lt; defense, enemy takes damage equal to the difference</li>
            <li>• Damage reduces effective defense until the defender's next turn</li>
          </ul>
        </div>
        <p className="text-gray-400 text-sm text-center">
          Fire (ATK 4) + type advantage (+1) = 5 vs Plant (DEF 4) → <span className="text-red-400">destroyed!</span>
        </p>
      </div>
    ),
  },
  {
    title: 'Elements & Advantages',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          Elements are paired and form a <strong className="text-white">rock-paper-scissors triangle</strong>.
          Advantage grants <strong className="text-green-400">+1 attack</strong>, disadvantage grants <strong className="text-red-400">-1 attack</strong>.
        </p>
        <div className="bg-gray-800 p-3 rounded border border-gray-700">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color: ELEMENT_INFO.fire.color }}>Fire</span>
              <span className="text-gray-600">&</span>
              <span style={{ color: ELEMENT_INFO.lightning.color }}>Lightning</span>
              <span className="text-gray-500 mx-1">→</span>
              <span style={{ color: ELEMENT_INFO.plant.color }}>Plant</span>
              <span className="text-gray-600">&</span>
              <span style={{ color: ELEMENT_INFO.metal.color }}>Metal</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color: ELEMENT_INFO.plant.color }}>Plant</span>
              <span className="text-gray-600">&</span>
              <span style={{ color: ELEMENT_INFO.metal.color }}>Metal</span>
              <span className="text-gray-500 mx-1">→</span>
              <span style={{ color: ELEMENT_INFO.water.color }}>Water</span>
              <span className="text-gray-600">&</span>
              <span style={{ color: ELEMENT_INFO.shadow.color }}>Shadow</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color: ELEMENT_INFO.water.color }}>Water</span>
              <span className="text-gray-600">&</span>
              <span style={{ color: ELEMENT_INFO.shadow.color }}>Shadow</span>
              <span className="text-gray-500 mx-1">→</span>
              <span style={{ color: ELEMENT_INFO.fire.color }}>Fire</span>
              <span className="text-gray-600">&</span>
              <span style={{ color: ELEMENT_INFO.lightning.color }}>Lightning</span>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <div className="flex items-center gap-2">
              <DemoUnit element="fire" tier={1} />
              <span className="text-gray-500">→</span>
              <DemoUnit element="plant" tier={1} isPlayer={false} />
            </div>
            <span className="text-xs text-green-400">+1 ATK</span>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-2">
              <DemoUnit element="fire" tier={1} />
              <span className="text-gray-500">→</span>
              <DemoUnit element="water" tier={1} isPlayer={false} />
            </div>
            <span className="text-xs text-red-400">-1 ATK</span>
          </div>
        </div>
        <p className="text-gray-400 text-sm text-center">
          Paired elements (like Fire & Lightning) are neutral to each other
        </p>
      </div>
    ),
  },
  {
    title: 'Mining Resources',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          Units with a <strong className="text-amber-400">Mining</strong> stat can extract resources from the cell they occupy.
        </p>
        <div className="flex justify-center items-center gap-6">
          <div className="text-center">
            <DemoCell depth={5}>
              <DemoUnit element="plant" tier={2} />
            </DemoCell>
            <span className="text-xs text-gray-400 mt-1 block">Before</span>
          </div>
          <span className="text-2xl text-amber-400">⛏</span>
          <div className="text-center">
            <DemoCell depth={3}>
              <DemoUnit element="plant" tier={2} />
            </DemoCell>
            <span className="text-xs text-gray-400 mt-1 block">After</span>
          </div>
        </div>
        <div className="flex justify-center gap-4">
          <DemoStatBox label="MINE" value={2} color="text-amber-400" />
          <span className="text-gray-500 self-center">→</span>
          <DemoResourceDisplay resources={"+2"} label="Gain" />
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700 text-sm">
          <p className="text-gray-300">
            <strong className="text-yellow-400">Tip:</strong> Plant units have the best mining stats.
            Muju (tier 1) has 2 mining depth, while higher tiers extract even more!
          </p>
        </div>
        <p className="text-gray-400 text-sm text-center">
          Resources are used to queue new units during the Queue Phase
        </p>
      </div>
    ),
  },
  {
    title: 'Building Units',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          During the <strong className="text-green-400">Queue Phase</strong>, spend resources to queue new units.
          They'll be ready after a build time.
        </p>
        <div className="flex justify-center gap-8 flex-wrap">
          <div className="bg-gray-800 p-3 rounded border border-gray-700 min-w-[160px]">
            <div className="text-xs text-gray-400 mb-2">Build Queue</div>
            <div className="text-xs text-green-400 mb-1">Ready to Place</div>
            <DemoBuildQueueItem element="fire" tier={1} name="Hi" ready />
            <div className="border-t border-gray-700 mt-2 pt-2">
              <div className="text-xs text-gray-500 mb-1">Building</div>
              <DemoBuildQueueItem element="water" tier={2} name="Straumr" turnsRemaining={2} />
              <DemoBuildQueueItem element="shadow" tier={1} name="Göl" turnsRemaining={1} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-sm text-gray-400">Unit Costs (examples)</div>
            <div className="flex items-center gap-2 text-sm">
              <DemoUnit element="fire" tier={1} size="sm" />
              <span className="text-gray-300">Hi</span>
              <span className="text-amber-400">1 res</span>
              <span className="text-gray-500">• 1 turn</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DemoUnit element="water" tier={2} size="sm" />
              <span className="text-gray-300">Straumr</span>
              <span className="text-amber-400">4 res</span>
              <span className="text-gray-500">• 2 turns</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DemoUnit element="metal" tier={4} size="sm" />
              <span className="text-gray-300">Wakanwicasa</span>
              <span className="text-amber-400">20 res</span>
              <span className="text-gray-500">• 3 turns</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700 text-sm">
          <h4 className="text-cyan-400 font-medium mb-1">Tech Requirement</h4>
          <p className="text-gray-300">
            To build a tier II+ unit, you must have a unit of that element at tier (N-1) or higher on the board.
          </p>
        </div>
      </div>
    ),
  },
  {
    title: 'Placing & Promoting',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          During the <strong className="text-purple-400">Place Phase</strong>, you can place ready units and
          promote existing ones.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800 p-3 rounded border border-cyan-700">
            <h4 className="text-cyan-400 font-medium mb-2">Placing Units</h4>
            <div className="flex justify-center mb-2">
              <DemoBoardSection>
                <div className="grid grid-cols-3 gap-0">
                  <DemoCell highlighted highlightType="spawn" />
                  <DemoCell highlighted highlightType="spawn" />
                  <DemoCell />
                  <DemoCell highlighted highlightType="spawn"><DemoUnit element="fire" tier={1} /></DemoCell>
                  <DemoCell highlighted highlightType="spawn" />
                  <DemoCell />
                  <DemoCell />
                  <DemoCell />
                  <DemoCell />
                </div>
              </DemoBoardSection>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Place within your controlled area (rectangle from corner to any owned unit)
            </p>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-purple-700">
            <h4 className="text-purple-400 font-medium mb-2">Promoting Units</h4>
            <div className="flex justify-center items-center gap-2 mb-2">
              <DemoUnit element="fire" tier={1} size="lg" />
              <span className="text-gray-500">→</span>
              <DemoUnit element="fire" tier={2} size="lg" />
            </div>
            <p className="text-xs text-gray-400 text-center">
              Pay the cost difference to upgrade a unit to the next tier
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Unit Stats Guide',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          Each unit has four stats that determine their capabilities:
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 p-3 rounded border border-red-700">
            <div className="flex items-center gap-2 mb-2">
              <DemoStatBox label="ATK" value={4} color="text-red-400" />
              <span className="text-red-400 font-medium">Attack</span>
            </div>
            <p className="text-xs text-gray-400">
              Damage dealt in combat. Fire & Lightning units have high attack.
            </p>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-green-700">
            <div className="flex items-center gap-2 mb-2">
              <DemoStatBox label="DEF" value={5} color="text-green-400" />
              <span className="text-green-400 font-medium">Defense</span>
            </div>
            <p className="text-xs text-gray-400">
              Health & damage resistance. Plant & Metal units are tanks.
            </p>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-blue-700">
            <div className="flex items-center gap-2 mb-2">
              <DemoStatBox label="SPD" value={3} color="text-blue-400" />
              <span className="text-blue-400 font-medium">Speed</span>
            </div>
            <p className="text-xs text-gray-400">
              Movement range per action. Lightning units are fastest.
            </p>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-amber-700">
            <div className="flex items-center gap-2 mb-2">
              <DemoStatBox label="MINE" value={2} color="text-amber-400" />
              <span className="text-amber-400 font-medium">Mining</span>
            </div>
            <p className="text-xs text-gray-400">
              Resources extracted per mine action. Plant & Water excel here.
            </p>
          </div>
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700 text-sm">
          <h4 className="text-purple-400 font-medium mb-1">Archetypes</h4>
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
            <div><span className="text-red-400">Rush:</span> Fire, Lightning — High ATK</div>
            <div><span className="text-blue-400">Balanced:</span> Water, Shadow — Versatile</div>
            <div><span className="text-green-400">Expand:</span> Plant, Metal — High DEF</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'UI Quick Reference',
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 p-2 rounded border border-gray-700">
            <h4 className="text-xs text-gray-400 mb-2">Your Units</h4>
            <div className="flex items-center gap-2">
              <DemoUnit element="fire" tier={2} />
              <span className="text-xs text-gray-300">White ring = yours</span>
            </div>
          </div>
          <div className="bg-gray-800 p-2 rounded border border-gray-700">
            <h4 className="text-xs text-gray-400 mb-2">Enemy Units</h4>
            <div className="flex items-center gap-2">
              <DemoUnit element="fire" tier={2} isPlayer={false} />
              <span className="text-xs text-gray-300">Black ring = enemy</span>
            </div>
          </div>
          <div className="bg-gray-800 p-2 rounded border border-gray-700">
            <h4 className="text-xs text-gray-400 mb-2">Movement</h4>
            <DemoCell highlighted highlightType="move">
              <span className="text-xs text-blue-400">●</span>
            </DemoCell>
            <span className="text-xs text-gray-300 mt-1 block">Blue highlight</span>
          </div>
          <div className="bg-gray-800 p-2 rounded border border-gray-700">
            <h4 className="text-xs text-gray-400 mb-2">Attack Target</h4>
            <DemoCell highlighted highlightType="attack">
              <span className="text-xs text-red-400">●</span>
            </DemoCell>
            <span className="text-xs text-gray-300 mt-1 block">Red highlight</span>
          </div>
          <div className="bg-gray-800 p-2 rounded border border-gray-700">
            <h4 className="text-xs text-gray-400 mb-2">Spawn Zone</h4>
            <DemoCell highlighted highlightType="spawn">
              <span className="text-xs text-cyan-400">●</span>
            </DemoCell>
            <span className="text-xs text-gray-300 mt-1 block">Cyan highlight</span>
          </div>
          <div className="bg-gray-800 p-2 rounded border border-gray-700">
            <h4 className="text-xs text-gray-400 mb-2">Damaged Unit</h4>
            <div className="flex items-center gap-2">
              <DemoUnit element="plant" tier={1} damage={2} />
              <span className="text-xs text-gray-300">Red badge shows damage</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700 text-sm">
          <p className="text-gray-300">
            <strong className="text-yellow-400">Tip:</strong> Click any unit (friend or foe) to see its stats
            in the info panel!
          </p>
        </div>
      </div>
    ),
  },
  {
    title: 'Strategy Tips',
    content: (
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="bg-gray-800 p-3 rounded border border-gray-700">
            <h4 className="text-amber-400 font-medium mb-1">💰 Economy First</h4>
            <p className="text-sm text-gray-300">
              Early game, prioritize mining. More resources = more units = more options.
            </p>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-gray-700">
            <h4 className="text-red-400 font-medium mb-1">⚔️ Focus Fire</h4>
            <p className="text-sm text-gray-300">
              Damage resets each turn, so focus attacks on one unit to eliminate it before switching targets.
            </p>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-gray-700">
            <h4 className="text-cyan-400 font-medium mb-1">🗺️ Control Territory</h4>
            <p className="text-sm text-gray-300">
              Expand your spawn zone by pushing units forward. A larger zone gives more placement options.
            </p>
          </div>
          <div className="bg-gray-800 p-3 rounded border border-gray-700">
            <h4 className="text-purple-400 font-medium mb-1">🔄 Counter-Pick</h4>
            <p className="text-sm text-gray-300">
              Watch what your opponent builds and queue units with elemental advantage.
            </p>
          </div>
        </div>
        <p className="text-center text-gray-500 text-sm">
          Good luck and have fun! 🎮
        </p>
      </div>
    ),
  },
];

export function InstructionsModal({ isOpen, onClose }: InstructionsModalProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<'carousel' | 'scroll'>('carousel');

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(0, Math.min(page, instructionPages.length - 1)));
  }, []);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  if (!isOpen) return null;

  const currentInstruction = instructionPages[currentPage];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">How to Play</h2>
          <div className="flex items-center gap-3">
            {/* View mode toggle */}
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('carousel')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'carousel'
                    ? 'bg-gray-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Pages
              </button>
              <button
                onClick={() => setViewMode('scroll')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  viewMode === 'scroll'
                    ? 'bg-gray-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Scroll
              </button>
            </div>
            {/* Close button */}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        {viewMode === 'carousel' ? (
          <>
            {/* Carousel content */}
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-lg font-semibold text-cyan-400 mb-4">
                {currentInstruction.title}
              </h3>
              {currentInstruction.content}
            </div>

            {/* Carousel navigation */}
            <div className="p-4 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <button
                  onClick={prevPage}
                  disabled={currentPage === 0}
                  className={`px-4 py-2 rounded text-sm transition-colors ${
                    currentPage === 0
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  ← Previous
                </button>

                {/* Page indicators */}
                <div className="flex gap-1.5">
                  {instructionPages.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToPage(index)}
                      className={`w-2.5 h-2.5 rounded-full transition-colors ${
                        index === currentPage
                          ? 'bg-cyan-400'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={nextPage}
                  disabled={currentPage === instructionPages.length - 1}
                  className={`px-4 py-2 rounded text-sm transition-colors ${
                    currentPage === instructionPages.length - 1
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  Next →
                </button>
              </div>
              <div className="text-center text-gray-500 text-xs mt-2">
                Page {currentPage + 1} of {instructionPages.length}
              </div>
            </div>
          </>
        ) : (
          /* Scroll mode - all pages in sequence */
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {instructionPages.map((page, index) => (
              <div key={index} className="pb-6 border-b border-gray-700 last:border-0">
                <h3 className="text-lg font-semibold text-cyan-400 mb-4">
                  {index + 1}. {page.title}
                </h3>
                {page.content}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
