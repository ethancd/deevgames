import { useState, useCallback } from 'react';
import { PlayDialog } from './PlayDialog';
import { ELEMENT_INFO, getAttackModifier } from '../game/elements';
import { getUnitDefinition } from '../game/units';
import { getElementHex } from '../utils/colors';
import { UnitArtwork } from './UnitArtwork';
import { CrystalWell } from './CrystalWell';
import type { Tier } from '../game/types';

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
  const sizeClass = size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8';
  return (
    <div className={`relative inline-block ${sizeClass}`}>
      <UnitArtwork owner={isPlayer ? 'white' : 'black'} element={element} tier={tier as Tier} />
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
  let highlightClass = '';
  if (highlighted) {
    if (highlightType === 'move') highlightClass = 'ring-2 ring-blue-400 ring-inset';
    if (highlightType === 'attack') highlightClass = 'ring-2 ring-red-400 ring-inset';
    if (highlightType === 'spawn') highlightClass = 'ring-2 ring-cyan-400 ring-inset';
  }

  return (
    <div
      className={`relative w-10 h-10 border border-gray-700 flex items-center justify-center board-cell depth-${depth} ${highlightClass}`}
    >
      <CrystalWell cell={{position: {x: 0, y: 0}, resourceLayers: depth, minedDepth: 0}} />
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

const demoMover = getUnitDefinition('fire_1');
const demoMiner = getUnitDefinition('plant_2');
const demoAttacker = getUnitDefinition('fire_2');
const demoDefender = getUnitDefinition('plant_2');
const demoAttackModifier = getAttackModifier(demoAttacker.element, demoDefender.element);
const demoAttackPower = Math.max(0, demoAttacker.attack + demoAttackModifier);

// Instruction page content
interface InstructionPage {
  title: string;
  content: React.ReactNode;
}

const instructionPages: InstructionPage[] = [
  {
    title: 'Playing on a phone',
    content: <div className="space-y-4 text-sm text-gray-300">
      <p><strong>Select → preview → confirm.</strong> Tap one of your pieces, then a destination. Check the action cost and mining yield before confirming. Tap a different destination to compare, or Cancel to keep your unit where it is.</p>
      <p>Solid dots cost one action. Hollow dots are farther away. A red ring marks an attack: tap it to see the attack power, remaining defense, and whether the target will be eliminated.</p>
      <p><strong>Mine</strong> shows the crystals you can collect here. <strong>Undo</strong> takes back your last action during your turn. Six actions are shared by your whole army.</p>
      <p><strong>Build:</strong> choose an element and tier, then check the stats, crystal cost, and build time. Locked tiers explain which unit you need on the board. Use the queue to place ready units in the Place phase.</p>
      <p>Open <strong>Key</strong> for the crystal-depth gauge, army shapes, and unit ranks. Turn on <strong>Depths</strong> for crystal counts and the next mining depth. Tap enemy pieces to inspect them; <strong>Show reach</strong> previews current-speed movement with six actions, not possible upgrades or attacks.</p>
      <p>Keyboard: Tab visits controls, N cycles your units, M mines, U upgrades, ⌘/Ctrl+Z undoes. Enter confirms a preview; Escape cancels it. Arrow keys move or browse the shop; 1–6 choose elements there.</p>
    </div>,
  },
  {
    title: 'Welcome to Muju Hono Tanka',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          Command six elements on a 10×10 grid. Mine resources, build your army, and threaten the enemy home!
        </p>
        <div className="bg-gray-800 p-3 rounded border border-gray-700">
          <h4 className="text-green-400 font-medium mb-2">Two ways to win</h4>
          <p className="text-gray-300 text-sm">At the start of your turn, have a unit on the enemy home corner — or eliminate every enemy unit.</p>
          <p className="text-gray-400 text-sm mt-2">The opponent gets one full turn to clear an invasion. Victory is checked before placement or promotion.</p>
        </div>
        <div className="flex justify-center gap-4 flex-wrap">
          <DemoUnit element="fire" tier={1} />
          <DemoUnit element="lightning" tier={2} />
          <DemoUnit element="water" tier={3} />
          <DemoUnit element="shadow" tier={1} />
          <DemoUnit element="plant" tier={2} />
          <DemoUnit element="metal" tier={4} />
        </div>
        <p className="text-gray-400 text-sm text-center">
          An enemy on your home blocks all reinforcements. Your existing units can still move, attack and promote.
        </p>

      </div>
    ),
  },
  {
    title: 'Board & Setup',
    content: (
      <div className="space-y-4">
        <p className="text-gray-300">
          The game is played on a <strong className="text-white">10×10 grid</strong>. Each cell contains up to
          5 layers of resources (brighter blue-green squares hold more). New games use <strong className="text-white">Unequal routes</strong>:
          deep starting corners, four-layer shelves, three-layer seams, and 16 blank squares on the paths to five-layer expansion wells. Blank squares have no crystals, but units can move and be placed there normally. The same layout rotates 180° for the other player, with 308 crystals in total.
        </p>
        <div className="flex justify-center items-end gap-2">
          <div className="text-center">
            <DemoCell depth={5} />
            <div className="text-xs text-gray-400 mt-1">Full (5)</div>
          </div>
          <div className="text-center">
            <DemoCell depth={3} />
            <div className="text-xs text-gray-400 mt-1">Three layers</div>
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
            Both players start with {getUnitDefinition('fire_1').name} (Fire), {getUnitDefinition('water_1').name} (Water), and {getUnitDefinition('plant_1').name} (Plant) — tier 1 units
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
              <DemoCell><DemoUnit element={demoMover.element} tier={demoMover.tier} /></DemoCell>
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
          <DemoStatBox label="SPD" value={demoMover.speed} color="text-blue-400" />
        </div>
        <p className="text-gray-400 text-sm text-center">
          {demoMover.name} has Speed {demoMover.speed} and can move up to {demoMover.speed} orthogonal squares per action
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
              <span className="absolute -top-1 -right-3 text-green-400 text-sm font-bold">+{demoAttackModifier}⚔</span>
            </div>
            <div className="flex gap-1 mt-2 justify-center">
              <DemoStatBox label="ATK" value={demoAttacker.attack} color="text-red-400" />
            </div>
          </div>
          <span className="text-2xl text-gray-500">→</span>
          <div className="text-center">
            <DemoUnit element="plant" tier={2} size="lg" isPlayer={false} />
            <div className="flex gap-1 mt-2 justify-center">
              <DemoStatBox label="DEF" value={demoDefender.defense} color="text-green-400" />
            </div>
          </div>
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700">
          <h4 className="text-red-400 font-medium mb-2">How Combat Works</h4>
          <p className="text-gray-300 text-sm">
            <code className="bg-gray-700 px-1 rounded">Effective Attack = max(0, Attack + Element Modifier)</code>
          </p>
          <ul className="text-sm text-gray-400 mt-2 space-y-1">
            <li>• If effective attack ≥ defense, the enemy is <strong className="text-red-400">destroyed</strong></li>
            <li>• If effective attack &lt; defense, enemy takes damage equal to effective attack</li>
            <li>• Damage reduces effective defense until the defender's next turn</li>
            <li>• <strong>Cleave:</strong> each unit starts with one attack. Kill the target to attack again, up to your tier in total attacks per turn (Tier I: 1, II: 2, III: 3, IV: 4).</li>
            <li>• Every attack costs 1 action. You may move between attacks at the usual action cost.</li>
            <li>• If the target survives, that unit is finished attacking this turn. Combine different attackers to finish tough targets.</li>
          </ul>
        </div>
        <p className="text-gray-400 text-sm text-center">
          {demoAttacker.name} (ATK {demoAttacker.attack}) + type advantage (+{demoAttackModifier}) = {demoAttackPower} vs {demoDefender.name} (DEF {demoDefender.defense}) → <span className="text-red-400">{demoAttackPower >= demoDefender.defense ? 'destroyed!' : `${demoAttackPower} damage`}</span>
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
            <DemoCell depth={5 - demoMiner.mining}>
              <DemoUnit element="plant" tier={2} />
            </DemoCell>
            <span className="text-xs text-gray-400 mt-1 block">After</span>
          </div>
        </div>
        <div className="flex justify-center gap-4">
          <DemoStatBox label="MINE" value={demoMiner.mining} color="text-amber-400" />
          <span className="text-gray-500 self-center">→</span>
          <DemoResourceDisplay resources={`+${demoMiner.mining}`} label="Gain" />
        </div>
        <div className="bg-gray-800 p-3 rounded border border-gray-700 text-sm">
          <p className="text-gray-300">
            <strong className="text-yellow-400">Tip:</strong> Plant units have the best mining stats.{' '}
            {getUnitDefinition('plant_1').name} reaches depth {getUnitDefinition('plant_1').mining}. Tiers 2 and 3 reach depths {demoMiner.mining} and {getUnitDefinition('plant_3').mining}; tier 4 relocates at Speed {getUnitDefinition('plant_4').speed}.
          </p>
        </div>
        <p className="text-gray-400 text-sm text-center">
          A fresh shallow square starts at depth 1, just like a deep square. Mining takes all remaining layers within your unit’s mining depth. Depleted layers do not return. Spend resources on queued units or promotions.
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
              Pay the cost difference to upgrade once per Place phase. Placed and promoted units can act immediately, but a unit cannot promote on the turn it was placed.
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
              <DemoUnit element="plant" tier={1} damage={1} />
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

  return <PlayDialog title="How to play" onClose={onClose}>
    <div className="help-navigation">
      <button onClick={prevPage} disabled={currentPage === 0}>← Previous</button>
      <span>{currentPage + 1} / {instructionPages.length}</span>
      <button onClick={nextPage} disabled={currentPage === instructionPages.length - 1}>Next →</button>
    </div>
    <div className="help-body"><h3>{currentInstruction.title}</h3>{currentInstruction.content}</div>
  </PlayDialog>;
}
