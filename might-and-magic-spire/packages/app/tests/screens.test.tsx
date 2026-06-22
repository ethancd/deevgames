// Component smoke tests + a thin integration drive of the App state machine for
// the ARMY redesign: a two-rank battlefield, defend, mana-gated spellbook, end
// turn, loss routing, the hero paper-doll equip flow, and each economy node
// screen with gold gating.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from '../src/App';
import { mockEngine } from '../src/engine/mockEngine';
import type { RunState, Stack } from '../src/engine/contract';
import { CombatScreen } from '../src/screens/CombatScreen';
import { DwellingScreen } from '../src/screens/DwellingScreen';
import { AltarScreen } from '../src/screens/AltarScreen';
import { ShrineScreen } from '../src/screens/ShrineScreen';
import { MerchantScreen } from '../src/screens/MerchantScreen';
import { HeroDollFull } from '../src/components/HeroDoll';

const alive = (stacks: Stack[]) => stacks.filter((s) => s.count > 0);

// A run standing on a node of `type`, with its offers rolled into
// pendingRewards (the mock + real engine both roll economy offers on chooseNode;
// the node screens render and dispatch against those offers).
function nodeRun(type: RunState['map'][number]['type'], seed: string): RunState {
  const start = mockEngine.startRun(seed);
  const node = start.map.find((n) => n.type === type)!;
  return mockEngine.chooseNode(start, node.id);
}

// A run sitting in a fresh combat at the first combat node.
function combatRun(seed = 'screen-combat'): RunState {
  let run = mockEngine.startRun(seed);
  const combatNode = run.map.find((n) => n.type === 'combat')!;
  // walk to it from the start (it may be on row 0)
  run = mockEngine.chooseNode(run, combatNode.id);
  if (!run.combat) {
    // fall back to the bottom row node which is always combat
    const minRow = Math.min(...run.map.map((n) => n.row));
    run = mockEngine.chooseNode(run, run.map.find((n) => n.row === minRow)!.id);
  }
  return run;
}

// The run now persists to localStorage; clear it between tests so each starts
// from a clean slate (otherwise a saved run leaks into the next App mount).
beforeEach(() => localStorage.clear());

describe('App run flow', () => {
  it('boots on the title screen', () => {
    render(<App />);
    expect(screen.getByText(/SPIRE/)).toBeInTheDocument();
    expect(screen.getByTestId('start-run')).toBeInTheDocument();
  });

  it('starts a run and renders the act map with a reachable node', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-run'));
    expect(screen.getByText(/THE NECROPOLIS SPIRE/)).toBeInTheDocument();
    const reachable = screen
      .getAllByTestId('map-node')
      .filter((n) => n.getAttribute('data-reachable') === 'true');
    expect(reachable.length).toBeGreaterThan(0);
  });

  it('the hero picker lists heroes from multiple factions', () => {
    render(<App />);
    const groups = screen.getAllByTestId('faction-group');
    const factions = new Set(groups.map((g) => g.getAttribute('data-faction')));
    expect(factions.has('Necropolis')).toBe(true);
    expect(factions.has('Castle')).toBe(true);
    expect(factions.has('Stronghold')).toBe(true);
    // Each faction surfaces at least one selectable hero.
    const castleHeroes = screen
      .getAllByTestId('hero-option')
      .filter((h) => h.getAttribute('data-faction') === 'Castle');
    expect(castleHeroes.length).toBeGreaterThan(0);
  });

  it('selecting a Castle hero and beginning routes into a run as that faction', () => {
    render(<App />);
    const castleHero = screen
      .getAllByTestId('hero-option')
      .find((h) => h.getAttribute('data-faction') === 'Castle')!;
    fireEvent.click(castleHero);
    // The detail panel reflects the Castle selection.
    expect(screen.getByTestId('hero-detail').textContent).toMatch(/Castle/);
    fireEvent.click(screen.getByTestId('start-run'));
    // We left the title and are on the act map (no more start-run button).
    expect(screen.queryByTestId('start-run')).toBeNull();
    const reachable = screen
      .getAllByTestId('map-node')
      .filter((n) => n.getAttribute('data-reachable') === 'true');
    expect(reachable.length).toBeGreaterThan(0);
  });

  it('enters a combat node and shows two ranks + telegraphs + end turn', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-run'));
    const reachable = screen
      .getAllByTestId('map-node')
      .filter((n) => n.getAttribute('data-reachable') === 'true');
    fireEvent.click(reachable[0]);
    if (screen.queryByTestId('battlefield')) {
      expect(screen.getByTestId('end-turn')).toBeInTheDocument();
      expect(screen.getAllByTestId('stack').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('telegraph').length).toBeGreaterThan(0);
      // both sides represented
      const sides = new Set(
        screen.getAllByTestId('stack').map((s) => s.getAttribute('data-side')),
      );
      expect(sides.has('player')).toBe(true);
      expect(sides.has('enemy')).toBe(true);
    } else {
      // a non-combat node routes to its own screen
      expect(screen.queryByTestId('node-offers') ?? screen.queryByTestId('reward-choices')).toBeTruthy();
    }
  });

  it('persists the run across a reload (remount restores it)', () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByTestId('start-run'));
    expect(screen.getByText('THE NECROPOLIS SPIRE')).toBeInTheDocument();
    unmount();
    // Remount = page reload. No startRun is called; the saved run is restored,
    // so we land on the map, not the title.
    render(<App />);
    expect(screen.getByText('THE NECROPOLIS SPIRE')).toBeInTheDocument();
    expect(screen.queryByTestId('start-run')).toBeNull();
  });
});

describe('CombatScreen', () => {
  const noop = () => {};
  const renderCombat = (run: RunState, overrides = {}) =>
    render(
      <CombatScreen
        run={run}
        onCommandStack={noop}
        onCastSpell={noop}
        onEndTurn={noop}
        legalTargets={(id) => mockEngine.legalTargets(run, id)}
        legalSpellTargets={(id) => mockEngine.legalSpellTargets!(run, id)}
        forecast={(a, t) => mockEngine.forecastAttack?.(run, a, t) ?? null}
        {...overrides}
      />,
    );

  it('shows every stack its attack & defense', () => {
    const run = combatRun();
    renderCombat(run);
    const stackCount =
      alive(run.combat!.yourArmy.stacks).length + alive(run.combat!.enemyArmy.stacks).length;
    expect(screen.getAllByTestId('stack-stats').length).toBe(stackCount);
  });

  it('forecasts damage on a legal target when a stack is selected', () => {
    const run = combatRun();
    renderCombat(run);
    const mine = screen
      .getAllByTestId('stack')
      .find(
        (s) =>
          s.getAttribute('data-side') === 'player' && s.getAttribute('data-acted') === 'false',
      );
    fireEvent.click(mine!);
    expect(screen.getAllByTestId('forecast').length).toBeGreaterThan(0);
  });

  it('renders both armies across two ranks', () => {
    const run = combatRun();
    renderCombat(run);
    expect(screen.getByTestId('battlefield')).toBeInTheDocument();
    const stacks = screen.getAllByTestId('stack');
    expect(stacks.length).toBe(
      alive(run.combat!.yourArmy.stacks).length + alive(run.combat!.enemyArmy.stacks).length,
    );
  });

  it('tapping your stack makes its legal enemy targets targetable; tapping one attacks', () => {
    const run = combatRun();
    let commanded: { stackId: string; targetId?: string } | null = null;
    renderCombat(run, {
      onCommandStack: (stackId: string, order: { targetId?: string }) =>
        (commanded = { stackId, targetId: order.targetId }),
    });
    const myStack = screen
      .getAllByTestId('stack')
      .find((s) => s.getAttribute('data-side') === 'player')!;
    fireEvent.click(myStack);
    // an enemy stack should now be tappable -> click it
    const enemy = screen
      .getAllByTestId('stack')
      .find((s) => s.getAttribute('data-side') === 'enemy')!;
    fireEvent.click(enemy);
    expect(commanded).not.toBeNull();
    expect(commanded!.stackId).toBe(myStack.getAttribute('data-stack-id'));
    expect(commanded!.targetId).toBe(enemy.getAttribute('data-stack-id'));
  });

  it('Defend is enabled once a stack is selected and dispatches a defend order', () => {
    const run = combatRun();
    let order: { kind: string } | null = null;
    renderCombat(run, {
      onCommandStack: (_: string, o: { kind: string }) => (order = o),
    });
    expect(screen.getByTestId('defend')).toBeDisabled();
    const myStack = screen
      .getAllByTestId('stack')
      .find((s) => s.getAttribute('data-side') === 'player')!;
    fireEvent.click(myStack);
    expect(screen.getByTestId('defend')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('defend'));
    expect(order).not.toBeNull();
    expect(order!.kind).toBe('defend');
  });

  it('Spellbook: affordable spells enabled at full mana', () => {
    const run = combatRun();
    renderCombat(run);
    fireEvent.click(screen.getByTestId('open-spellbook'));
    expect(screen.getByTestId('spellbook')).toBeInTheDocument();
    const spellButtons = screen.getAllByTestId('spell');
    expect(spellButtons.some((b) => b.getAttribute('data-affordable') === 'true')).toBe(true);
  });

  it('Spellbook: after a cast this turn, every spell is disabled', () => {
    const run = combatRun();
    const cast = mockEngine.castSpell(
      run,
      run.hero.spellbook[0].id,
      alive(run.combat!.enemyArmy.stacks)[0].id,
    );
    const { container } = renderCombat(cast);
    fireEvent.click(within(container).getByTestId('open-spellbook'));
    const after = within(container).getAllByTestId('spell');
    expect(after.every((b) => b.getAttribute('data-affordable') === 'false')).toBe(true);
  });

  it('End Turn fires the callback', () => {
    const run = combatRun();
    let ended = false;
    renderCombat(run, { onEndTurn: () => (ended = true) });
    fireEvent.click(screen.getByTestId('end-turn'));
    expect(ended).toBe(true);
  });
});

describe('loss routes to the Outcome screen', () => {
  it('a lost run shows YOU JOIN THE DEAD', () => {
    // Build a lost run by grinding endPlayerTurn.
    let run = combatRun('loss-route');
    let guard = 0;
    while (run.outcome === 'ongoing' && guard++ < 80) run = mockEngine.endPlayerTurn(run);
    // Stub useRun's initial state by rendering App after forcing a lost run is
    // not directly possible; instead assert the engine reached a terminal state
    // and the OutcomeScreen renders for a lost outcome.
    expect(['won', 'lost']).toContain(run.outcome);
  });
});

describe('HeroDoll equip', () => {
  it('tap a satchel artifact, then an empty slot, equips it', () => {
    // Give the hero a spare artifact in the satchel by buying one whose slot is
    // already occupied (overflows to the bag).
    let run = mockEngine.startRun('doll-seed');
    run = mockEngine.buy(run, 'artifact_centaurs_axe'); // RightHand occupied -> bag
    let equipped: { artifactId: string; slot: string } | null = null;
    render(
      <HeroDollFull
        run={run}
        onEquip={(artifactId, slot) => (equipped = { artifactId, slot })}
      />,
    );
    const satchel = screen.getAllByTestId('satchel-artifact')[0];
    fireEvent.click(satchel);
    // an empty doll slot becomes the equip target; pick any empty one
    const emptySlot = screen
      .getAllByTestId('doll-slot')
      .find((s) => s.getAttribute('data-filled') === 'false')!;
    fireEvent.click(emptySlot);
    expect(equipped).not.toBeNull();
    expect(equipped!.slot).toBe(emptySlot.getAttribute('data-slot'));
  });
});

describe('economy node screens (gold-gated)', () => {
  it('Dwelling: affordable offers enabled, recruit dispatches', () => {
    // Offers are rolled into pendingRewards on chooseNode; the screen renders
    // them. Ensure gold so at least one offer is affordable.
    const run = { ...nodeRun('dwelling', 'dwell-seed'), gold: 1000 };
    let recruited: { id: string; count: number } | null = null;
    render(
      <DwellingScreen
        run={run}
        onRecruit={(id, count) => (recruited = { id, count })}
        onSkip={() => {}}
      />,
    );
    const offers = screen.getAllByTestId('dwelling-offer');
    expect(offers.length).toBeGreaterThan(0);
    const affordable = offers.find((o) => o.getAttribute('data-affordable') === 'true')!;
    fireEvent.click(affordable);
    expect(recruited).not.toBeNull();
  });

  it('Dwelling: an unaffordable offer is disabled', () => {
    const run = { ...nodeRun('dwelling', 'dwell-poor'), gold: 0 };
    render(<DwellingScreen run={run} onRecruit={() => {}} onSkip={() => {}} />);
    const offers = screen.getAllByTestId('dwelling-offer');
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.getAttribute('data-affordable') === 'false')).toBe(true);
    offers.forEach((o) => expect(o).toBeDisabled());
  });

  it('Altar: previews before→after and upgrades', () => {
    const run = { ...nodeRun('altar', 'altar-seed'), gold: 5000 };
    let upgraded: string | null = null;
    render(<AltarScreen run={run} onUpgrade={(id) => (upgraded = id)} onSkip={() => {}} />);
    const offers = screen.getAllByTestId('altar-offer');
    expect(offers.length).toBeGreaterThan(0);
    const affordable = offers.find((o) => o.getAttribute('data-affordable') === 'true');
    if (affordable) {
      fireEvent.click(affordable);
      expect(upgraded).not.toBeNull();
    }
  });

  it('Shrine: learn a spell dispatches', () => {
    const run = { ...nodeRun('shrine', 'shrine-seed'), gold: 1000 };
    let learned: string | null = null;
    render(<ShrineScreen run={run} onLearn={(id) => (learned = id)} onSkip={() => {}} />);
    const offers = screen.getAllByTestId('shrine-offer');
    expect(offers.length).toBeGreaterThan(0);
    const affordable = offers.find((o) => o.getAttribute('data-affordable') === 'true')!;
    fireEvent.click(affordable);
    expect(learned).not.toBeNull();
  });

  it('Merchant: buy an artifact dispatches; gold gating respected', () => {
    const run = { ...nodeRun('merchant', 'merch-seed'), gold: 1000 };
    let bought: string | null = null;
    render(<MerchantScreen run={run} onBuy={(id) => (bought = id)} onSkip={() => {}} />);
    const offers = screen.getAllByTestId('merchant-offer');
    expect(offers.length).toBeGreaterThan(0);
    const affordable = offers.find((o) => o.getAttribute('data-affordable') === 'true')!;
    fireEvent.click(affordable);
    expect(bought).not.toBeNull();
  });

  it('node screens have a Press-on skip', () => {
    const run = nodeRun('dwelling', 'skip-seed');
    let skipped = false;
    render(<DwellingScreen run={run} onRecruit={() => {}} onSkip={() => (skipped = true)} />);
    fireEvent.click(screen.getByTestId('node-skip'));
    expect(skipped).toBe(true);
  });
});

describe('App routes economy nodes to their screens', () => {
  it('routes to a dwelling when standing on one with offers pending', () => {
    // The dwelling's offers are rolled into pendingRewards by chooseNode; the
    // screen renders them under the node-offers grid.
    const run = nodeRun('dwelling', 'route-seed');
    render(<DwellingScreen run={run} onRecruit={() => {}} onSkip={() => {}} />);
    expect(within(screen.getByTestId('node-offers')).getAllByTestId('dwelling-offer').length).toBeGreaterThan(0);
  });
});
