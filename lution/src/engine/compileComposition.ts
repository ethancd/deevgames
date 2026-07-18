// The composition interpreter: compileComposition(cardId, composition) ->
// CardEffect. Turns a shared/atoms.ts CardComposition (a small declarative
// AST) into the exact same CardEffect shape a hand-written src/effects/*.ts
// module exports -- consumed unchanged by the hooks dispatcher
// (src/engine/hooks.ts), EngineAPI, and the AI. See the M1 plan
// (~/.claude/plans/.../agent-a13dc70e5c78ff2d6.md) for the full design.
//
// Deliberately consumes only shared/atoms.ts + src/engine/types.ts (type
// -only) -- never src/engine/{api,engine,hooks}.ts directly -- mirroring
// api.ts's own "no import cycle" discipline. All state mutation happens
// exclusively through the EngineAPI handed in via HookHandlerContext.

import type { CardId, CardInstance, PlayerId } from '../../shared/types';
import type {
  AtomCall,
  AtomName,
  CardComposition,
  Condition,
  EffectDef,
  Filter,
  Owner,
  PlayerRef,
  Selector,
  Step,
  Trigger,
  ValueExpr,
  Zone,
} from '../../shared/atoms';
import { isAtomCall, TRIGGERS } from '../../shared/atoms';
import type {
  AIGameView,
  CardEffect,
  ChoiceOption,
  EngineAPI,
  HookHandler,
  HookHandlerContext,
  HookName,
  HookSpec,
  RNG,
  StrategyHints,
} from './types';

// === small shared helpers ===

function opponentOf(player: PlayerId): PlayerId {
  return player === 'human' ? 'claude' : 'human';
}

function resolvePlayerRef(ref: PlayerRef, owner: PlayerId): PlayerId {
  return ref === 'self' ? owner : opponentOf(owner);
}

function ownerPlayers(owner: Owner, ctxOwner: PlayerId): PlayerId[] {
  if (owner === 'self') return [ctxOwner];
  if (owner === 'opponent') return [opponentOf(ctxOwner)];
  // 'any' -- fixed order, matching hooks.ts's PLAYER_ORDER, for determinism.
  return ['human', 'claude'];
}

function getLiveZoneList(api: EngineAPI, player: PlayerId, zone: Zone): readonly CardInstance[] {
  const ps = api.getPlayer(player);
  switch (zone) {
    case 'hand':
      return ps.hand;
    case 'inPlay':
      return ps.inPlay;
    case 'discard':
      return ps.discard;
    case 'drawPile':
      return ps.drawPile;
  }
}

const ALL_ZONES: readonly Zone[] = ['hand', 'inPlay', 'discard', 'drawPile'];

// === Snapshot semantics: see shared/atoms.ts's own "SNAPSHOT SEMANTICS" doc
// block for the full rationale. A ZoneSnapshot is a frozen-in-time copy of
// every zone's card-instance membership (NOT per-instance attributes like
// score overrides -- those still read live), taken once per EffectDef body
// execution and shared by every selector that body resolves. ===

type ZoneSnapshot = Record<PlayerId, Record<Zone, readonly CardInstance[]>>;

function takeSnapshot(api: EngineAPI): ZoneSnapshot {
  const players: PlayerId[] = ['human', 'claude'];
  const snapshot = {} as ZoneSnapshot;
  for (const player of players) {
    snapshot[player] = {
      hand: [...getLiveZoneList(api, player, 'hand')],
      inPlay: [...getLiveZoneList(api, player, 'inPlay')],
      discard: [...getLiveZoneList(api, player, 'discard')],
      drawPile: [...getLiveZoneList(api, player, 'drawPile')],
    };
  }
  return snapshot;
}

// Threaded through every step/selector/value evaluator for one body
// execution: the frozen zone snapshot that selector resolution reads from,
// plus the mutable {target}-placeholder binding for the `log` atom (see
// shared/atoms.ts's binding-rule doc comment).
interface RunState {
  snapshot: ZoneSnapshot;
  lastTargetNames: string[];
}

function findLiveZone(api: EngineAPI, player: PlayerId, instanceId: string): Zone | undefined {
  for (const zone of ALL_ZONES) {
    if (getLiveZoneList(api, player, zone).some((i) => i.instanceId === instanceId)) return zone;
  }
  return undefined;
}

// Re-validates a snapshot-resolved candidate against LIVE state immediately
// before mutating it -- an earlier atom in the same body may have already
// moved/destroyed/discarded it. A candidate that's no longer where the
// snapshot said it'd be is skipped (with a flavor log line), never handed to
// an EngineAPI mutator that would throw "instance not found."
async function forEachLiveCandidate(
  candidates: Candidate[],
  expectedZone: Zone,
  ctx: HookHandlerContext,
  action: (c: Candidate) => Promise<void> | void
): Promise<void> {
  for (const c of candidates) {
    const liveZone = findLiveZone(ctx.api, c.player, c.instance.instanceId);
    if (liveZone !== expectedZone) {
      ctx.api.log({
        type: 'flavor',
        message: `${ctx.api.getCardName(c.instance.cardId)} is no longer there by the time ${ctx.api.getCardName(
          ctx.cardId
        )} resolves -- skipped.`,
      });
      continue;
    }
    await action(c);
  }
}

// "Worth" of an in-play (or otherwise scoreable) instance: a live score
// override wins, else the registered baseValue. Matches the notion of
// "worth" every real value-comparing card (Insolvency Clause, Hostile
// Takeover Tribunal, Marginal Utility Magnate) already established.
function worthOf(api: EngineAPI, instance: CardInstance): number {
  return api.getScoreOverride(instance.instanceId) ?? api.getCardBaseValue(instance.cardId);
}

// A frozen HAND card's contribution to a card's own dynamic worth: its real
// base point value if it's a KEEPER (even 0), or 1 flat point for an
// action/unregistered card ("there isn't a base value") -- exactly Frost
// Pact's contribution() helper.
function contribution(api: EngineAPI, cardId: CardId): number {
  return api.getCardType(cardId) === 'keeper' ? api.getCardBaseValue(cardId) : 1;
}

function counterKey(name: string, instanceId: string): string {
  return `counter:${name}:${instanceId}`;
}

function boundKey(bindAs: string, instanceId: string): string {
  return `bind:${bindAs}:${instanceId}`;
}

function compareValues(a: number, op: '>' | '>=' | '<' | '<=' | '==', b: number): boolean {
  switch (op) {
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '==':
      return a === b;
  }
}

// === resolveSelector: the single home of requestChoice + rng-based picks ===

interface Candidate {
  player: PlayerId;
  instance: CardInstance;
}

async function applyFilter(
  filter: Filter,
  candidates: Candidate[],
  ctx: HookHandlerContext,
  zone: Zone,
  run: RunState
): Promise<Candidate[]> {
  switch (filter.type) {
    case 'byType':
      return candidates.filter((c) => ctx.api.getCardType(c.instance.cardId) === filter.cardType);
    case 'byName':
      return candidates.filter((c) => c.instance.cardId === filter.cardId);
    case 'frozen':
      // Per-instance ATTRIBUTES (unlike zone membership) are never
      // snapshotted -- see shared/atoms.ts's SNAPSHOT SEMANTICS doc block --
      // so this deliberately reads live state.
      return candidates.filter((c) =>
        zone === 'inPlay'
          ? ctx.api.getScoreOverride(c.instance.instanceId) !== undefined
          : ctx.api.isHandCardFrozen(c.instance.instanceId)
      );
    case 'valueCompare': {
      // RHS is evaluated ONCE per filter application, not per-candidate.
      // worthOf() below is likewise a live attribute read, same reasoning as
      // 'frozen' above.
      const rhs = await resolveValue(filter.value, ctx, run);
      return candidates.filter((c) => compareValues(worthOf(ctx.api, c.instance), filter.op, rhs));
    }
    case 'excludeSelf':
      return candidates.filter((c) => c.instance.instanceId !== ctx.instance.instanceId);
    case 'not': {
      const matched = await applyFilter(filter.filter, candidates, ctx, zone, run);
      const matchedIds = new Set(matched.map((c) => c.instance.instanceId));
      return candidates.filter((c) => !matchedIds.has(c.instance.instanceId));
    }
    case 'and': {
      let result = candidates;
      for (const f of filter.filters) {
        result = await applyFilter(f, result, ctx, zone, run);
      }
      return result;
    }
  }
}

// Human-facing worth tag attached to every ChoiceOption offered to a
// responder (AI or human) -- drives the derived `choose` heuristics in
// §2.5, never shown as text to the human (labels carry that job).
function computeWorthTag(candidate: Candidate, selector: Selector, atomName: AtomName | undefined, api: EngineAPI): number {
  const { cardId, instanceId } = candidate.instance;
  if (selector.zone === 'inPlay') {
    return api.getScoreOverride(instanceId) ?? api.getCardBaseValue(cardId);
  }
  if (atomName === 'freezeInHand') {
    return contribution(api, cardId);
  }
  // tutorAndPlay (drawPile) and any other hand/discard/drawPile case: plain
  // base value, no action-fallback-to-1 (matches Rime Portal's own
  // convention that the found card's action-hood doesn't matter there).
  return api.getCardBaseValue(cardId);
}

async function requestChoicePick(
  pool: Candidate[],
  selector: Selector,
  ctx: HookHandlerContext,
  atomName: AtomName | undefined,
  count: number
): Promise<Candidate[]> {
  const chooser = resolvePlayerRef(selector.chooser as PlayerRef, ctx.owner);
  let remaining = pool;
  const chosen: Candidate[] = [];

  for (let i = 0; i < count && remaining.length > 0; i++) {
    if (remaining.length === 1) {
      chosen.push(remaining[0]);
      remaining = [];
      break;
    }

    const options: ChoiceOption[] = remaining.map((c) => ({
      id: c.instance.instanceId,
      cardId: c.instance.cardId,
      // Human-facing label: the card's NAME, never a raw instance id.
      label: ctx.api.getCardName(c.instance.cardId),
      owner: c.player,
      worth: computeWorthTag(c, selector, atomName, ctx.api),
      atom: atomName,
      ownSelector: selector.owner === 'self',
    }));

    const chosenOption = await ctx.api.requestChoice(chooser, {
      cardId: ctx.cardId,
      prompt: `${ctx.owner} played ${ctx.api.getCardName(ctx.cardId)} — choose 1.`,
      options,
    });

    const idx = remaining.findIndex((c) => c.instance.instanceId === chosenOption.id);
    const picked = idx === -1 ? remaining[0] : remaining[idx];
    chosen.push(picked);
    remaining = remaining.filter((c) => c.instance.instanceId !== picked.instance.instanceId);
  }

  return chosen;
}

function pickRandom(pool: Candidate[], count: number, rng: RNG): Candidate[] {
  const remaining = [...pool];
  const chosen: Candidate[] = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const idx = rng.int(remaining.length);
    chosen.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return chosen;
}

async function resolveSelector(
  selector: Selector,
  ctx: HookHandlerContext,
  run: RunState,
  atomName?: AtomName
): Promise<Candidate[]> {
  if (selector.pick === 'self') {
    return [{ player: ctx.owner, instance: ctx.instance }];
  }

  // Zone MEMBERSHIP comes from the body's frozen snapshot (SNAPSHOT
  // SEMANTICS, shared/atoms.ts) -- an earlier atom in this same body can
  // never change what a later selector "sees" as candidates, even though its
  // own mutation already happened. Per-instance attributes consulted below
  // (worthOf, and applyFilter's 'frozen'/'valueCompare' branches) still read
  // live state -- only zone membership is snapshotted.
  const players = ownerPlayers(selector.owner, ctx.owner);
  let candidates: Candidate[] = [];
  for (const player of players) {
    for (const instance of run.snapshot[player][selector.zone]) {
      candidates.push({ player, instance });
    }
  }

  if (selector.filter) {
    candidates = await applyFilter(selector.filter, candidates, ctx, selector.zone, run);
  }

  switch (selector.pick) {
    case 'all':
      return candidates;
    case 'maxValue':
    case 'minValue': {
      if (candidates.length === 0) return [];
      const worths = candidates.map((c) => worthOf(ctx.api, c.instance));
      const extreme = selector.pick === 'maxValue' ? Math.max(...worths) : Math.min(...worths);
      const tied = candidates.filter((_, i) => worths[i] === extreme);
      if (tied.length <= 1) return tied;
      return requestChoicePick(tied, selector, ctx, atomName, 1);
    }
    case 'chooser':
    case 'random': {
      const count = selector.count ? await resolveValue(selector.count, ctx, run) : 1;
      if (candidates.length <= count) return candidates;
      if (selector.pick === 'random') return pickRandom(candidates, count, ctx.api.rng);
      return requestChoicePick(candidates, selector, ctx, atomName, count);
    }
    default:
      return candidates;
  }
}

// === ValueExpr / Condition evaluators ===

async function resolveValue(expr: ValueExpr, ctx: HookHandlerContext, run: RunState): Promise<number> {
  switch (expr.type) {
    case 'literal':
      return expr.value;
    case 'count': {
      // Semantic validation restricts count()'s selector to pick:'all', so
      // this never triggers a requestChoice/rng draw. This resolveSelector
      // call is a plain VALUE QUERY, not "the atom's own target" -- it never
      // updates run.lastTargetNames (see shared/atoms.ts's {target}
      // binding-rule doc comment).
      const candidates = await resolveSelector(expr.selector, ctx, run);
      return candidates.length;
    }
    case 'cardValue':
      return ctx.api.getScoreOverride(ctx.instance.instanceId) ?? ctx.api.getCardBaseValue(ctx.cardId);
    case 'counter':
      return (ctx.api.getFlag(ctx.cardId, counterKey(expr.name, ctx.instance.instanceId)) as number | undefined) ?? expr.default ?? 0;
    case 'boundCardValue': {
      const bound = ctx.api.getFlag(ctx.cardId, boundKey(expr.bindAs, ctx.instance.instanceId));
      return typeof bound === 'string' ? contribution(ctx.api, bound) : 0;
    }
    case 'add': {
      let total = 0;
      for (const v of expr.values) total += await resolveValue(v, ctx, run);
      return total;
    }
    case 'max': {
      const values = await Promise.all(expr.values.map((v) => resolveValue(v, ctx, run)));
      return values.length ? Math.max(...values) : 0;
    }
    case 'min': {
      const values = await Promise.all(expr.values.map((v) => resolveValue(v, ctx, run)));
      return values.length ? Math.min(...values) : 0;
    }
  }
}

async function evaluateCondition(condition: Condition, ctx: HookHandlerContext, run: RunState): Promise<boolean> {
  switch (condition.type) {
    case 'compare': {
      const left = await resolveValue(condition.left, ctx, run);
      const right = await resolveValue(condition.right, ctx, run);
      switch (condition.op) {
        case '>':
          return left > right;
        case '>=':
          return left >= right;
        case '<':
          return left < right;
        case '<=':
          return left <= right;
        case '==':
          return left === right;
        case '!=':
          return left !== right;
      }
      return false;
    }
    case 'selectorNonEmpty': {
      // Semantic validation restricts this selector to pick:'all' too, so
      // merely testing emptiness never provokes a choice/rng draw. Like
      // count() above, this is a value query, not an atom's own target --
      // never updates run.lastTargetNames.
      const candidates = await resolveSelector(condition.selector, ctx, run);
      return candidates.length > 0;
    }
    case 'not':
      return !(await evaluateCondition(condition.condition, ctx, run));
    case 'and': {
      for (const c of condition.conditions) {
        if (!(await evaluateCondition(c, ctx, run))) return false;
      }
      return true;
    }
    case 'or': {
      for (const c of condition.conditions) {
        if (await evaluateCondition(c, ctx, run)) return true;
      }
      return false;
    }
  }
}

// {owner}/{card}/{target} substitution for the `log` atom -- see shared/
// atoms.ts's SNAPSHOT SEMANTICS doc block for the {target} binding rule.
function renderLogTemplate(template: string, ctx: HookHandlerContext, run: RunState): string {
  const targetText = run.lastTargetNames.length > 0 ? run.lastTargetNames.join(' and ') : '(nothing)';
  return template
    .replace(/\{owner\}/g, ctx.owner)
    .replace(/\{card\}/g, ctx.api.getCardName(ctx.cardId))
    .replace(/\{target\}/g, targetText);
}

// === Step interpreter ===

interface StepResult {
  cancel?: boolean;
}

async function runAtom(atom: AtomCall, ctx: HookHandlerContext, trigger: Trigger, run: RunState): Promise<StepResult> {
  switch (atom.atom) {
    case 'draw': {
      const player = resolvePlayerRef(atom.target, ctx.owner);
      const count = atom.count ? await resolveValue(atom.count, ctx, run) : 1;
      await ctx.api.draw(player, count);
      return {};
    }
    case 'discard': {
      const candidates = await resolveSelector(atom.selector, ctx, run, 'discard');
      run.lastTargetNames = candidates.map((c) => ctx.api.getCardName(c.instance.cardId));
      await forEachLiveCandidate(candidates, atom.selector.zone, ctx, (c) =>
        ctx.api.moveToDiscard(c.player, c.instance.instanceId, 'hand')
      );
      return {};
    }
    case 'destroy': {
      const candidates = await resolveSelector(atom.selector, ctx, run, 'destroy');
      run.lastTargetNames = candidates.map((c) => ctx.api.getCardName(c.instance.cardId));
      await forEachLiveCandidate(candidates, atom.selector.zone, ctx, (c) =>
        ctx.api.destroyKeeper(c.player, c.instance.instanceId)
      );
      return {};
    }
    case 'bounceToHand': {
      const selector: Selector = atom.selector ?? { zone: 'inPlay', owner: 'self', pick: 'self' };
      const candidates = await resolveSelector(selector, ctx, run, 'bounceToHand');
      run.lastTargetNames = candidates.map((c) => ctx.api.getCardName(c.instance.cardId));
      const moved: Candidate[] = [];
      await forEachLiveCandidate(candidates, selector.zone, ctx, async (c) => {
        await ctx.api.moveToHand(c.instance.instanceId);
        moved.push(c);
      });
      // Inside onBeforeDestroy, bouncing THIS instance implies cancelling
      // the destroy (Recursive Refund Clause's exact shape) -- the handler
      // has already relocated the card itself via moveToHand above. Checked
      // against `moved` (what actually happened), not `candidates` (what the
      // snapshot resolved), so a vanished self-target correctly does NOT
      // cancel a destroy it never actually escaped.
      if (trigger === 'onBeforeDestroy' && moved.some((c) => c.instance.instanceId === ctx.instance.instanceId)) {
        return { cancel: true };
      }
      return {};
    }
    case 'changeController': {
      const candidates = await resolveSelector(atom.selector, ctx, run, 'changeController');
      run.lastTargetNames = candidates.map((c) => ctx.api.getCardName(c.instance.cardId));
      const to = resolvePlayerRef(atom.to, ctx.owner);
      await forEachLiveCandidate(candidates, atom.selector.zone, ctx, (c) =>
        ctx.api.changeController(c.instance.instanceId, c.player, to)
      );
      return {};
    }
    case 'freezeInPlay': {
      const candidates = await resolveSelector(atom.selector, ctx, run, 'freezeInPlay');
      run.lastTargetNames = candidates.map((c) => ctx.api.getCardName(c.instance.cardId));
      const value = await resolveValue(atom.to, ctx, run);
      await forEachLiveCandidate(candidates, atom.selector.zone, ctx, (c) => {
        ctx.api.setScoreOverride(c.instance.instanceId, value);
      });
      return {};
    }
    case 'freezeInHand': {
      const candidates = await resolveSelector(atom.selector, ctx, run, 'freezeInHand');
      run.lastTargetNames = candidates.map((c) => ctx.api.getCardName(c.instance.cardId));
      const bound: Candidate[] = [];
      await forEachLiveCandidate(candidates, atom.selector.zone, ctx, (c) => {
        ctx.api.freezeHandCard(c.instance.instanceId);
        bound.push(c);
      });
      if (atom.bindAs && bound.length > 0) {
        ctx.api.setFlag(ctx.cardId, boundKey(atom.bindAs, ctx.instance.instanceId), bound[0].instance.cardId);
      }
      return {};
    }
    case 'grantImmunity': {
      const player = resolvePlayerRef(atom.target, ctx.owner);
      ctx.api.grantKeeperFreezeImmunity(player);
      return {};
    }
    case 'setCounter': {
      const value = await resolveValue(atom.value, ctx, run);
      ctx.api.setFlag(ctx.cardId, counterKey(atom.name, ctx.instance.instanceId), value);
      return {};
    }
    case 'incrementCounter': {
      const key = counterKey(atom.name, ctx.instance.instanceId);
      const current = (ctx.api.getFlag(ctx.cardId, key) as number | undefined) ?? 0;
      const by = atom.by ? await resolveValue(atom.by, ctx, run) : 1;
      ctx.api.setFlag(ctx.cardId, key, current + by);
      return {};
    }
    case 'setBaseValueOverride': {
      const candidates = await resolveSelector(atom.selector, ctx, run, 'setBaseValueOverride');
      run.lastTargetNames = candidates.map((c) => ctx.api.getCardName(c.instance.cardId));
      const value = await resolveValue(atom.value, ctx, run);
      await forEachLiveCandidate(candidates, atom.selector.zone, ctx, (c) => {
        ctx.api.setScoreOverride(c.instance.instanceId, value);
      });
      return {};
    }
    case 'cancelDestroy':
      return { cancel: true };
    case 'forceWin': {
      const player = resolvePlayerRef(atom.winner, ctx.owner);
      ctx.api.forceWin(player);
      return {};
    }
    case 'grantExtraTurn': {
      const player = resolvePlayerRef(atom.target, ctx.owner);
      ctx.api.grantExtraTurn(player);
      return {};
    }
    case 'skipNextDraw': {
      const player = resolvePlayerRef(atom.target, ctx.owner);
      ctx.api.skipNextDraw(player);
      return {};
    }
    case 'tutorAndPlay': {
      const candidates = await resolveSelector(atom.selector, ctx, run, 'tutorAndPlay');
      run.lastTargetNames = candidates.map((c) => ctx.api.getCardName(c.instance.cardId));
      await forEachLiveCandidate(candidates, atom.selector.zone, ctx, (c) =>
        ctx.api.playCardFromDeck(c.player, c.instance.instanceId)
      );
      return {};
    }
    case 'log': {
      ctx.api.log({ type: 'flavor', message: renderLogTemplate(atom.message, ctx, run) });
      return {};
    }
  }
}

async function runStep(step: Step, ctx: HookHandlerContext, trigger: Trigger, run: RunState): Promise<StepResult> {
  if (isAtomCall(step)) {
    return runAtom(step, ctx, trigger, run);
  }
  if (step.type === 'seq') {
    for (const s of step.steps) {
      const result = await runStep(s, ctx, trigger, run);
      // First cancel wins, mirroring dispatchHooks' own convention --
      // short-circuits remaining sibling steps.
      if (result.cancel) return result;
    }
    return {};
  }
  // step.type === 'if'
  const matched = await evaluateCondition(step.condition, ctx, run);
  if (matched) return runStep(step.then, ctx, trigger, run);
  if (step.else) return runStep(step.else, ctx, trigger, run);
  return {};
}

// === derived strategy.choose (per-atom heuristic table, §2.5) ===

function worthOfOption(option: ChoiceOption): number {
  return typeof option.worth === 'number' ? option.worth : 0;
}

function preferOpponentElseFirst(view: AIGameView, options: ChoiceOption[]): ChoiceOption {
  const opponentOptions = options.filter((o) => o.owner !== view.self);
  return (opponentOptions.length > 0 ? opponentOptions : options)[0];
}

function preferHighWorthElseFirst(options: ChoiceOption[]): ChoiceOption {
  let best = options[0];
  for (const option of options) {
    if (worthOfOption(option) > worthOfOption(best)) best = option;
  }
  return best;
}

function preferLowWorthElseFirst(options: ChoiceOption[]): ChoiceOption {
  let best = options[0];
  for (const option of options) {
    if (worthOfOption(option) < worthOfOption(best)) best = option;
  }
  return best;
}

function preferOpponentElseFirstOrHighWorthFallback(view: AIGameView, options: ChoiceOption[]): ChoiceOption {
  const opponentOptions = options.filter((o) => o.owner !== view.self);
  if (opponentOptions.length > 0) return opponentOptions[0];
  return options[0];
}

function buildComposedChoose(): NonNullable<StrategyHints['choose']> {
  return (view: AIGameView, options: ChoiceOption[]): ChoiceOption => {
    const atom = options[0]?.atom as AtomName | undefined;
    switch (atom) {
      case 'destroy':
      case 'freezeInPlay':
      case 'changeController':
      case 'bounceToHand':
        return preferOpponentElseFirst(view, options);
      case 'tutorAndPlay':
        return preferHighWorthElseFirst(options);
      case 'freezeInHand':
        if (options[0]?.ownSelector) return preferLowWorthElseFirst(options);
        return preferOpponentElseFirstOrHighWorthFallback(view, options);
      default:
        return preferOpponentElseFirstOrHighWorthFallback(view, options);
    }
  };
}

// Scans the whole composition for any Selector that ever sets `chooser`
// (i.e. pick 'chooser'/'maxValue'/'minValue' -- the only pick modes that
// require it) -- exactly the compositions that can ever provoke a
// requestChoice call. Used to decide whether to attach a `choose` hint at
// all (undefined otherwise, per the task's derivation rule).
function selectorHasChooser(selector: Selector): boolean {
  if (selector.pick === 'self') return false;
  if (selector.chooser !== undefined) return true;
  if (selector.filter && filterHasChooser(selector.filter)) return true;
  if (selector.count && valueExprHasChooser(selector.count)) return true;
  return false;
}

function filterHasChooser(filter: Filter): boolean {
  switch (filter.type) {
    case 'valueCompare':
      return valueExprHasChooser(filter.value);
    case 'not':
      return filterHasChooser(filter.filter);
    case 'and':
      return filter.filters.some(filterHasChooser);
    default:
      return false;
  }
}

function valueExprHasChooser(expr: ValueExpr): boolean {
  switch (expr.type) {
    case 'count':
      return selectorHasChooser(expr.selector);
    case 'add':
    case 'max':
    case 'min':
      return expr.values.some(valueExprHasChooser);
    default:
      return false;
  }
}

function conditionHasChooser(condition: Condition): boolean {
  switch (condition.type) {
    case 'compare':
      return valueExprHasChooser(condition.left) || valueExprHasChooser(condition.right);
    case 'selectorNonEmpty':
      return selectorHasChooser(condition.selector);
    case 'not':
      return conditionHasChooser(condition.condition);
    case 'and':
    case 'or':
      return condition.conditions.some(conditionHasChooser);
  }
}

function atomHasChooser(atom: AtomCall): boolean {
  switch (atom.atom) {
    case 'discard':
    case 'destroy':
    case 'changeController':
    case 'freezeInPlay':
    case 'freezeInHand':
    case 'setBaseValueOverride':
    case 'tutorAndPlay':
      return selectorHasChooser(atom.selector);
    case 'bounceToHand':
      return atom.selector ? selectorHasChooser(atom.selector) : false;
    case 'draw':
      return atom.count ? valueExprHasChooser(atom.count) : false;
    case 'setCounter':
      return valueExprHasChooser(atom.value);
    case 'incrementCounter':
      return atom.by ? valueExprHasChooser(atom.by) : false;
    default:
      return false;
  }
}

function stepHasChooser(step: Step): boolean {
  if (isAtomCall(step)) return atomHasChooser(step);
  if (step.type === 'seq') return step.steps.some(stepHasChooser);
  // step.type === 'if'
  return (
    conditionHasChooser(step.condition) ||
    stepHasChooser(step.then) ||
    (step.else ? stepHasChooser(step.else) : false)
  );
}

function compositionUsesChooser(composition: CardComposition): boolean {
  if (composition.effects.some((e) => stepHasChooser(e.body))) return true;
  if (composition.scoreDelta && valueExprHasChooser(composition.scoreDelta)) return true;
  return false;
}

// === derived numeric playValue/stealTargetValue (per-atom heuristic sum) ===
//
// The M1 plan's §2.9 punted this deliberately ("a sound per-atom-combination
// numeric estimator risks silently misvaluing a composed card... deferred to
// a follow-up once real composed cards exist to validate against"). That
// follow-up is now: every atom below contributes a signed number, summed
// across the whole composition and evaluated against the live AIGameView
// where the atom's effect is dynamic (destructive/theft atoms scale by the
// TARGET's estimated average worth, using the same view.score(player)/count
// aggregate-only approximation Hostile Takeover Tribunal's own bespoke
// playValue function already relies on -- AIGameView deliberately exposes no
// per-instance baseValue lookup, so this is the best any strategy hint can
// do without one). This is explicitly an APPROXIMATION, not a card-by-card
// simulation: `if` branches are summed as "either could happen" rather than
// evaluated (a live Condition needs the interpreter's own ctx, not a bare
// AIGameView), and selector filters are ignored when estimating candidate
// COUNTS (AIGameView has no way to test a filter predicate against a raw
// CardInstance). Composers who find the derived estimate wrong for a
// specific card should use the explicit `strategy` override instead of
// fighting the heuristic.
const FORCE_WIN_MAGNITUDE = 500;
const DERIVED_VALUE_CAP = 500;
const DERIVED_VALUE_FLOOR = 0.25;

function averagePlayerValue(player: PlayerId, view: AIGameView): number {
  const count = view.state.players[player].inPlay.length;
  return count > 0 ? view.score(player) / count : 1;
}

function zoneListFromView(player: PlayerId, zone: Zone, view: AIGameView): readonly CardInstance[] {
  const ps = view.state.players[player];
  switch (zone) {
    case 'hand':
      return ps.hand;
    case 'inPlay':
      return ps.inPlay;
    case 'discard':
      return ps.discard;
    case 'drawPile':
      return ps.drawPile;
  }
}

function ownerPlayersForView(owner: Owner, view: AIGameView): PlayerId[] {
  if (owner === 'self') return [view.self];
  if (owner === 'opponent') return [view.opponent];
  return [view.self, view.opponent];
}

// Best-effort candidate count for a selector -- filters are ignored entirely
// (see the doc block above); "the whole zone" is the best approximation
// available from AIGameView's read-only surface.
function estimateSelectorCount(selector: Selector, view: AIGameView): number {
  if (selector.pick === 'self') return 1;
  const zoneSize = ownerPlayersForView(selector.owner, view).reduce(
    (sum, p) => sum + zoneListFromView(p, selector.zone, view).length,
    0
  );
  if (zoneSize === 0) return 0;
  switch (selector.pick) {
    case 'all':
      return zoneSize;
    case 'maxValue':
    case 'minValue':
      return 1;
    case 'chooser':
    case 'random': {
      const requested = selector.count && selector.count.type === 'literal' ? selector.count.value : 1;
      return Math.max(0, Math.min(zoneSize, requested));
    }
    default:
      return 1;
  }
}

// Approximates the average per-card worth of whatever a selector targets.
// Only `inPlay` has a meaningful notion of "worth" from AIGameView's
// aggregate-only surface (score(player) folds the WHOLE board, never a
// single instance); hand/discard/drawPile candidates fall back to a flat
// placeholder of 1, the same convention Frost Pact's own `contribution()`
// helper uses for "there isn't a base value to read here."
function estimateSelectorWorth(selector: Selector, view: AIGameView): number {
  if (selector.zone !== 'inPlay') return 1;
  if (selector.owner === 'self') return averagePlayerValue(view.self, view);
  if (selector.owner === 'opponent') return averagePlayerValue(view.opponent, view);
  return (averagePlayerValue(view.self, view) + averagePlayerValue(view.opponent, view)) / 2;
}

// true when targeting the OPPONENT is what benefits the composing player
// (removal/denial atoms: destroy, discard, freezeInPlay, freezeInHand,
// setBaseValueOverride-as-nerf); false when targeting the opponent instead
// HELPS them (tutorAndPlay -- fetching from YOUR OWN draw pile is what's
// good for you). 'any' is a wash (0), matching e.g. Bone-Chilling Breeze's
// "great equalizer" not being unambiguously good OR bad for either side.
function selectorSign(selector: Selector, opponentTargetIsGood: boolean): number {
  if (selector.owner === 'any') return 0;
  const targetsOpponent = selector.owner === 'opponent';
  return targetsOpponent === opponentTargetIsGood ? 1 : -1;
}

function estimateValueExpr(expr: ValueExpr, view: AIGameView): number {
  switch (expr.type) {
    case 'literal':
      return expr.value;
    case 'count':
      return estimateSelectorCount(expr.selector, view);
    case 'cardValue':
      return 1; // unknown without a live score override read; flat placeholder
    case 'counter':
      return expr.default ?? 0;
    case 'boundCardValue':
      return 1; // unknown without runtime effectState; flat placeholder
    case 'add':
      return expr.values.reduce((sum, v) => sum + estimateValueExpr(v, view), 0);
    case 'max':
      return expr.values.length ? Math.max(...expr.values.map((v) => estimateValueExpr(v, view))) : 0;
    case 'min':
      return expr.values.length ? Math.min(...expr.values.map((v) => estimateValueExpr(v, view))) : 0;
  }
}

// The per-atom heuristic table: one signed contribution per atom, in the
// same "study every atom, document the reasoning at the point of use" spirit
// as buildComposedChoose's own per-atom table above.
function estimateAtomValue(atom: AtomCall, view: AIGameView): number {
  switch (atom.atom) {
    case 'draw': {
      const count = atom.count && atom.count.type === 'literal' ? atom.count.value : 1;
      return (atom.target === 'self' ? 1 : -1) * 0.5 * count;
    }
    case 'discard':
      return selectorSign(atom.selector, true) * 0.75 * estimateSelectorCount(atom.selector, view);
    case 'destroy':
      return (
        selectorSign(atom.selector, true) *
        estimateSelectorCount(atom.selector, view) *
        estimateSelectorWorth(atom.selector, view)
      );
    case 'bounceToHand': {
      if (!atom.selector) return 0.5; // default self-save: protective, not destructive
      return (
        selectorSign(atom.selector, true) *
        0.5 *
        estimateSelectorCount(atom.selector, view) *
        estimateSelectorWorth(atom.selector, view)
      );
    }
    case 'changeController':
      // Sign follows `to` (who ends up with the card), not selector.owner
      // (who it's taken FROM) -- those differ in exchange-style compositions
      // like the Tribunal.
      return (
        (atom.to === 'self' ? 1 : -1) *
        estimateSelectorCount(atom.selector, view) *
        estimateSelectorWorth(atom.selector, view)
      );
    case 'freezeInPlay':
      return (
        selectorSign(atom.selector, true) *
        0.5 *
        estimateSelectorCount(atom.selector, view) *
        estimateSelectorWorth(atom.selector, view)
      );
    case 'freezeInHand':
      return selectorSign(atom.selector, true) * 0.5 * estimateSelectorCount(atom.selector, view);
    case 'grantImmunity':
      return (atom.target === 'self' ? 1 : -1) * 1.5;
    case 'setCounter':
    case 'incrementCounter':
      return 0; // bookkeeping only -- its value surfaces via scoreDelta's counter() reference instead
    case 'setBaseValueOverride':
      if (atom.selector.pick === 'self') {
        // Setting THIS card's own dynamic base value (Frost-Pact-style) --
        // not a self-vs-opponent polarity at all, just "how much is this
        // worth."
        return atom.value.type === 'literal' ? atom.value.value : 2;
      }
      return (
        selectorSign(atom.selector, true) *
        0.5 *
        estimateSelectorCount(atom.selector, view) *
        estimateSelectorWorth(atom.selector, view)
      );
    case 'cancelDestroy':
      return 1; // protective -- saves the card from destruction
    case 'forceWin':
      // The one atom that needs to dominate every ordinary play decision on
      // its own -- see the napkin's "deferred numeric strategy derivation is
      // LOAD-BEARING" note. Composers who need an even harder guarantee than
      // this cap can still set an explicit `strategy.playValue` override.
      return atom.winner === 'self' ? FORCE_WIN_MAGNITUDE : -FORCE_WIN_MAGNITUDE;
    case 'grantExtraTurn':
      return (atom.target === 'self' ? 1 : -1) * 2;
    case 'skipNextDraw':
      return (atom.target === 'self' ? -1 : 1) * 0.75;
    case 'tutorAndPlay':
      return selectorSign(atom.selector, false) * 1.5;
    case 'log':
      return 0; // flavor only, never affects valuation
  }
}

function sumStepValue(step: Step, view: AIGameView): number {
  if (isAtomCall(step)) return estimateAtomValue(step, view);
  if (step.type === 'seq') return step.steps.reduce((sum, s) => sum + sumStepValue(s, view), 0);
  // step.type === 'if' -- both branches are summed as "either could happen"
  // rather than evaluated (a live Condition needs the interpreter's ctx, not
  // a bare AIGameView) -- a conservative overestimate, not a simulation.
  const thenValue = sumStepValue(step.then, view);
  const elseValue = step.else ? sumStepValue(step.else, view) : 0;
  return thenValue + elseValue;
}

function computeDerivedValue(composition: CardComposition, view: AIGameView): number {
  let total = composition.baseValue;
  if (composition.scoreDelta) total += estimateValueExpr(composition.scoreDelta, view);
  for (const effect of composition.effects) total += sumStepValue(effect.body, view);
  return Math.max(DERIVED_VALUE_FLOOR, Math.min(DERIVED_VALUE_CAP, total));
}

function deriveStrategyHints(composition: CardComposition): StrategyHints {
  const playValueOverride = composition.strategy?.playValue;
  const stealTargetValueOverride = composition.strategy?.stealTargetValue;
  return {
    choose: compositionUsesChooser(composition) ? buildComposedChoose() : undefined,
    // Explicit `strategy` overrides always win (shared/atoms.ts's own doc
    // comment on CardComposition.strategy); otherwise fall back to the
    // per-atom heuristic sum above, re-evaluated dynamically per view since
    // it depends on live board state.
    playValue: playValueOverride ?? ((view: AIGameView) => computeDerivedValue(composition, view)),
    stealTargetValue:
      stealTargetValueOverride ??
      // Actions resolve once and leave nothing behind to "hold" -- every
      // real bespoke action module already uses a flat 0 here (Insolvency
      // Clause, Recount, Audit the Auditors, Rime Portal, the Tribunal...);
      // only a keeper's ongoing board presence is worth stealing.
      (composition.cardType === 'action' ? 0 : (view: AIGameView) => computeDerivedValue(composition, view)),
  };
}

// === compileTrigger: scope/side derivation + the auto self-guard ===

const SCOPE_BY_TRIGGER: Record<Trigger, NonNullable<HookSpec['scope']>> = {
  onDraw: 'inHand',
  onPlay: 'inHand',
  onEnterPlay: 'inPlay',
  onLeavePlay: 'inPlay',
  onDiscard: 'always',
  onBeforeDestroy: 'inPlay',
  onTurnStart: 'inPlay',
  onTurnEnd: 'inPlay',
  interruptOpponentTurn: 'inPlay',
  onInnerGameStart: 'inPlay',
  onInnerGameEnd: 'inPlay',
};

const DEFAULT_SIDE_BY_TRIGGER: Partial<Record<Trigger, NonNullable<HookSpec['side']>>> = {
  interruptOpponentTurn: 'opponent',
};

const SELF_GUARDED_TRIGGERS = new Set<Trigger>(['onEnterPlay', 'onLeavePlay', 'onBeforeDestroy']);

function compileTrigger(trigger: Trigger, defs: [EffectDef, ...EffectDef[]]): HookSpec {
  const scope = SCOPE_BY_TRIGGER[trigger];
  const side = defs[0].side ?? DEFAULT_SIDE_BY_TRIGGER[trigger] ?? 'owner';
  const priority = defs[0].priority ?? 0;
  const body: Step = defs.length === 1 ? defs[0].body : { type: 'seq', steps: defs.map((d) => d.body) };
  const needsGuard = SELF_GUARDED_TRIGGERS.has(trigger);

  const handler: HookHandler = async (ctx) => {
    if (needsGuard) {
      const payload = ctx.event.payload as { instanceId?: string } | undefined;
      if (payload?.instanceId !== ctx.instance.instanceId) return;
    }
    // One fresh snapshot + {target} binding per body execution -- see
    // shared/atoms.ts's SNAPSHOT SEMANTICS doc block. Never reused across
    // two different hook firings.
    const run: RunState = { snapshot: takeSnapshot(ctx.api), lastTargetNames: [] };
    const result = await runStep(body, ctx, trigger, run);
    return result.cancel ? { cancel: true } : undefined;
  };

  return { scope, side, priority, handler };
}

function compileScoreDelta(scoreDelta: ValueExpr): HookSpec {
  return {
    scope: 'inPlay',
    side: 'owner',
    handler: async (ctx) => {
      const payload = ctx.event.payload as { score: number } | undefined;
      if (!payload) return;
      // Each score() fold re-evaluates scoreDelta fresh -- its own
      // one-expression "body," so it gets its own fresh snapshot too rather
      // than sharing one across separate folds.
      const run: RunState = { snapshot: takeSnapshot(ctx.api), lastTargetNames: [] };
      payload.score += await resolveValue(scoreDelta, ctx, run);
    },
  };
}

// === grantImmunity auto-pairing (deviation #3, see file header) ===

function collectGrantImmunityTargets(step: Step, out: PlayerRef[]): void {
  if (isAtomCall(step)) {
    if (step.atom === 'grantImmunity') out.push(step.target);
    return;
  }
  if (step.type === 'seq') {
    step.steps.forEach((s) => collectGrantImmunityTargets(s, out));
    return;
  }
  // step.type === 'if'
  collectGrantImmunityTargets(step.then, out);
  if (step.else) collectGrantImmunityTargets(step.else, out);
}

function applyGrantImmunityPairing(composition: CardComposition, hooks: Partial<Record<HookName, HookSpec>>): void {
  const targets: PlayerRef[] = [];
  for (const def of composition.effects) {
    if (def.trigger !== 'onEnterPlay') continue;
    collectGrantImmunityTargets(def.body, targets);
  }
  if (targets.length === 0) return;

  // The revoke half is self-guarded independently of whatever else might be
  // compiled onto onLeavePlay -- mirrors r7-claude-the-adiabatic-escrow
  // -vault's own guard exactly (only release the immunity share THIS
  // instance holds when THIS instance is the one actually leaving play).
  const revoke: HookHandler = (ctx) => {
    const payload = ctx.event.payload as { instanceId?: string } | undefined;
    if (payload?.instanceId !== ctx.instance.instanceId) return;
    for (const target of targets) {
      ctx.api.revokeKeeperFreezeImmunity(resolvePlayerRef(target, ctx.owner));
    }
  };

  const existing = hooks.onLeavePlay;
  if (existing) {
    const originalHandler = existing.handler;
    hooks.onLeavePlay = {
      ...existing,
      handler: async (ctx) => {
        const result = await originalHandler(ctx);
        await revoke(ctx);
        return result;
      },
    };
  } else {
    hooks.onLeavePlay = { scope: 'inPlay', side: 'owner', handler: revoke };
  }
}

// === compileComposition: the public entry point ===

export function compileComposition(cardId: CardId, composition: CardComposition): CardEffect {
  const hooks: Partial<Record<HookName, HookSpec>> = {};

  for (const trigger of TRIGGERS) {
    const defs = composition.effects.filter((e) => e.trigger === trigger);
    if (defs.length === 0) continue;
    hooks[trigger] = compileTrigger(trigger, defs as [EffectDef, ...EffectDef[]]);
  }

  applyGrantImmunityPairing(composition, hooks);

  if (composition.scoreDelta) {
    hooks.modifyScore = compileScoreDelta(composition.scoreDelta);
  }

  return {
    cardId,
    cardType: composition.cardType,
    baseValue: composition.baseValue,
    hooks,
    strategy: deriveStrategyHints(composition),
  };
}
