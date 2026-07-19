// Card composition AST: a small, JSON-serializable language for expressing
// card effects declaratively, compiled into a real CardEffect by
// src/engine/compileComposition.ts. Framework-free (no engine/Vite imports,
// mirrors shared/types.ts's own discipline) so it's usable from both the
// client and the dev server, and from Claude's structured-output calls
// (ATOM_JSON_SCHEMA below).
//
// See the M1 plan (~/.claude/plans/.../agent-a13dc70e5c78ff2d6.md) for the
// full design rationale. Three vetted deviations from the original master
// plan sketch, all adopted here:
//   1. `boundCardValue` ships in v1's ValueExpr (not deferred to a later
//      atom-proposal step) -- needed for Frost Pact's own worth calculation.
//   2. `pick: 'self'` added to PickMode -- lets a selector target "this
//      hook's own resolving instance" (e.g. setBaseValueOverride on itself),
//      which none of the other four pick modes can express.
//   3. `grantImmunity` only ever appears under trigger 'onEnterPlay';
//      compileComposition auto-synthesizes the paired onLeavePlay revoke (no
//      separate "revoke" atom exists in this catalog).
//
// ============================================================================
// SNAPSHOT SEMANTICS (added post-M6, fixes the Hostile Takeover Tribunal
// self-cancellation bug -- see the napkin's "v2 atoms architecture" entry)
// ============================================================================
// Every selector resolved while ONE EffectDef's `body` is executing (a
// single hook firing -- one `onPlay`, one `onTurnStart`, etc) sees the SAME
// snapshot of every zone's card-instance membership, taken the instant the
// body starts running, MTG-style ("state-based" resolution rather than
// re-querying the live board after each sub-effect). Mutations still apply
// to LIVE state as they happen -- only the *candidate pool a selector draws
// from* is frozen for the body's duration, not the mutations themselves.
// Concretely: if a body does `changeController(mine, minValue) -> opponent`
// then `changeController(theirs, maxValue) -> self` in a `seq`, the second
// selector's "opponent's most valuable keeper" is computed over the
// opponent's board AS IT WAS BEFORE THE FIRST MOVE -- it can never pick back
// the very card the first step just handed them. (Filters that read
// mutable PER-INSTANCE ATTRIBUTES rather than zone membership -- `frozen`,
// `valueCompare` -- are NOT snapshotted; they still consult live state, since
// the snapshot's job is only to freeze "which cards are where," matching the
// task's literal scope.)
//
// Because a snapshot can go stale mid-body (an earlier atom in the same
// `seq` might destroy/move/discard a card a LATER atom's selector already
// resolved against the snapshot), every atom that goes on to actually mutate
// a resolved candidate re-checks the candidate's LIVE zone membership
// immediately before mutating. A candidate that's no longer where the
// snapshot said it'd be is silently skipped (with a `type: 'flavor'` log
// line noting the skip) instead of being passed to a live EngineAPI mutator
// that would throw ("instance not found"). `requestChoice` option lists
// themselves are always built from the (possibly-since-mutated) snapshot
// pool too, for the same reason -- a responder should see a consistent set
// of options for the whole body, even if resolving an earlier atom already
// changed the board.
//
// {target} PLACEHOLDER BINDING RULE (the `log` atom, below): {target} binds
// to the display name(s) of whichever selector-driven atom (discard,
// destroy, bounceToHand, changeController, freezeInPlay, freezeInHand,
// setBaseValueOverride, or tutorAndPlay) most recently resolved ITS OWN
// selector earlier in this same body execution -- NOT a selector consulted
// internally by a `count()`/`selectorNonEmpty` ValueExpr/Condition, which
// never updates the binding (those are value queries, not "the atom's
// target"). Multiple resolved candidates join as "X and Y and Z". If no
// selector-driven atom has resolved yet in this body execution (or the most
// recent one resolved zero candidates), {target} renders as the literal
// text "(nothing)". The binding is fresh per body execution -- it is reset
// (to "no prior target") every time a trigger fires, and never leaks across
// two different hook firings or two different plays of the same card.

// === Selector ===

export type Zone = 'hand' | 'inPlay' | 'discard' | 'drawPile';
export type Owner = 'self' | 'opponent' | 'any';
export type PlayerRef = 'self' | 'opponent';
export type PickMode = 'all' | 'chooser' | 'random' | 'maxValue' | 'minValue' | 'self';

export interface Selector {
  zone: Zone;
  owner: Owner;
  filter?: Filter;
  pick: PickMode;
  // Required iff pick is 'chooser', 'maxValue', or 'minValue' (ties on
  // maxValue/minValue are broken by this chooser too).
  chooser?: PlayerRef;
  // How many to pick when pick is 'chooser' or 'random'. Default: literal 1.
  count?: ValueExpr;
}

// === Filter ===

export type Filter =
  | { type: 'byType'; cardType: 'keeper' | 'action' }
  | { type: 'byName'; cardId: string }
  | { type: 'frozen' } // inPlay: has an active score override. hand: isHandCardFrozen.
  | { type: 'valueCompare'; op: '>' | '>=' | '<' | '<=' | '=='; value: ValueExpr }
  | { type: 'excludeSelf' } // excludes ctx.instance.instanceId
  | { type: 'not'; filter: Filter }
  | { type: 'and'; filters: Filter[] };

// === ValueExpr ===

export type ValueExpr =
  | { type: 'literal'; value: number }
  | { type: 'count'; selector: Selector }
  | { type: 'cardValue' } // this hook's OWN instance's current worth
  | { type: 'counter'; name: string; default?: number } // default 0
  | { type: 'boundCardValue'; bindAs: string }
  | { type: 'add'; values: ValueExpr[] }
  | { type: 'max'; values: ValueExpr[] }
  | { type: 'min'; values: ValueExpr[] };

// === Condition ===

export type CompareOp = '>' | '>=' | '<' | '<=' | '==' | '!=';

export type Condition =
  | { type: 'compare'; left: ValueExpr; op: CompareOp; right: ValueExpr }
  | { type: 'selectorNonEmpty'; selector: Selector }
  | { type: 'not'; condition: Condition }
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] };

// === Step / AtomCall ===

export type Step = SeqStep | IfStep | AtomCall;

export interface SeqStep {
  type: 'seq';
  steps: Step[];
}

export interface IfStep {
  type: 'if';
  condition: Condition;
  then: Step;
  else?: Step;
}

// AtomCall variants carry no `type` discriminant (they're keyed on `atom`
// instead), so a plain `step.type === 'seq'` narrowing check on the Step
// union doesn't type-check -- TS rejects reading `.type` off a union member
// that lacks it entirely. This guard narrows via the `atom` field instead
// (present on every AtomCall, absent on both SeqStep/IfStep), letting every
// Step-walking function elsewhere check `isAtomCall(step)` first and then
// safely read `.type` off the remaining `SeqStep | IfStep`.
export function isAtomCall(step: Step): step is AtomCall {
  return 'atom' in step;
}

export type AtomName =
  | 'draw'
  | 'discard'
  | 'destroy'
  | 'bounceToHand'
  | 'changeController'
  | 'freezeInPlay'
  | 'freezeInHand'
  | 'grantImmunity'
  | 'setCounter'
  | 'incrementCounter'
  | 'setBaseValueOverride'
  | 'cancelDestroy'
  | 'forceWin'
  | 'grantExtraTurn'
  | 'skipNextDraw'
  | 'tutorAndPlay'
  | 'log';

// The full, canonical list of atom names -- single source of truth consumed
// by both the shape validator and ATOM_JSON_SCHEMA, so the two can't drift
// apart from each other (a genuine TS-union drift from this list would still
// need a matching fix here, but that's exactly the point of the drift test).
export const ATOM_NAMES: readonly AtomName[] = [
  'draw',
  'discard',
  'destroy',
  'bounceToHand',
  'changeController',
  'freezeInPlay',
  'freezeInHand',
  'grantImmunity',
  'setCounter',
  'incrementCounter',
  'setBaseValueOverride',
  'cancelDestroy',
  'forceWin',
  'grantExtraTurn',
  'skipNextDraw',
  'tutorAndPlay',
  'log',
];

export type AtomCall =
  | { atom: 'draw'; target: PlayerRef; count?: ValueExpr }
  | { atom: 'discard'; selector: Selector } // selector.zone must be 'hand'
  | { atom: 'destroy'; selector: Selector } // selector.zone must be 'inPlay'
  | { atom: 'bounceToHand'; selector?: Selector } // default: pick:'self' (onBeforeDestroy self-save)
  | { atom: 'changeController'; selector: Selector; to: PlayerRef }
  | { atom: 'freezeInPlay'; selector: Selector; to: ValueExpr; duration?: 'permanent' } // v1: 'permanent' only
  | { atom: 'freezeInHand'; selector: Selector; bindAs?: string } // selector.zone must be 'hand'
  | { atom: 'grantImmunity'; kind: 'freeze'; target: PlayerRef } // only valid under trigger 'onEnterPlay'
  | { atom: 'setCounter'; name: string; value: ValueExpr }
  | { atom: 'incrementCounter'; name: string; by?: ValueExpr } // default by: literal 1
  | { atom: 'setBaseValueOverride'; selector: Selector; value: ValueExpr }
  | { atom: 'cancelDestroy' } // only valid under trigger 'onBeforeDestroy'
  | { atom: 'forceWin'; winner: PlayerRef }
  | { atom: 'grantExtraTurn'; target: PlayerRef }
  | { atom: 'skipNextDraw'; target: PlayerRef }
  | { atom: 'tutorAndPlay'; selector: Selector } // selector.zone must be 'drawPile'
  // Flavor-only: never mutates state, purely a `type: 'flavor'` log line.
  // `message` supports EXACTLY three placeholders -- {owner} (the resolving
  // player id), {card} (this card's display name), {target} (see the
  // SNAPSHOT SEMANTICS doc block above for the precise binding rule). Any
  // other `{...}` token is a semantic-validation error (validateCompositionSemantics),
  // not silently left as literal text -- "keep templates honest." The
  // numeral/deixis meta rules that govern a card's own effectText do NOT
  // apply to this message (it's flavor, not mechanical effect text).
  | { atom: 'log'; message: string };

// === EffectDef / CardComposition ===

export type Trigger =
  | 'onDraw'
  | 'onPlay'
  | 'onEnterPlay'
  | 'onLeavePlay'
  | 'onDiscard'
  | 'onBeforeDestroy'
  | 'onTurnStart'
  | 'onTurnEnd'
  | 'interruptOpponentTurn'
  | 'onInnerGameStart'
  | 'onInnerGameEnd';
// NOTE: 'modifyScore' deliberately excluded -- only reachable via
// CardComposition.scoreDelta, never via effects[].

export const TRIGGERS: readonly Trigger[] = [
  'onDraw',
  'onPlay',
  'onEnterPlay',
  'onLeavePlay',
  'onDiscard',
  'onBeforeDestroy',
  'onTurnStart',
  'onTurnEnd',
  'interruptOpponentTurn',
  'onInnerGameStart',
  'onInnerGameEnd',
];

export interface EffectDef {
  trigger: Trigger;
  side?: 'owner' | 'opponent' | 'any'; // default 'owner' (mirrors HookSpec)
  priority?: number; // default 0, passthrough to HookSpec.priority
  body: Step;
}

export interface CardComposition {
  cardType: 'keeper' | 'action';
  baseValue: number;
  effects: EffectDef[];
  scoreDelta?: ValueExpr; // 'keeper' only -- compiles to one modifyScore hook
  // Optional explicit AI-value overrides. src/engine/compileComposition.ts
  // derives playValue/stealTargetValue automatically from the atoms used
  // (a per-atom heuristic sum, evaluated dynamically against the AIGameView
  // where possible), but a derived estimate can never reason about "this
  // card wins the game outright" the way a human-authored bespoke module's
  // hint can (e.g. The Halting Problem's Solution's playValue: 1_000_000,
  // so the built-in AI reliably slams the win button the instant it's
  // drawable). An explicit override here always wins over the derived
  // value -- it's just data, validated as a finite number by
  // validateCompositionShape, same discipline as every other numeric field
  // in this AST.
  strategy?: { playValue?: number; stealTargetValue?: number };
}

// ============================================================================
// Validators
// ============================================================================

export interface ShapeValidationResult {
  ok: boolean;
  errors: string[];
  value?: CardComposition; // present iff ok
}

const ZONES = new Set<Zone>(['hand', 'inPlay', 'discard', 'drawPile']);
const OWNERS = new Set<Owner>(['self', 'opponent', 'any']);
const PLAYER_REFS = new Set<PlayerRef>(['self', 'opponent']);
const PICK_MODES = new Set<PickMode>(['all', 'chooser', 'random', 'maxValue', 'minValue', 'self']);
const CARD_TYPES = new Set(['keeper', 'action']);
const FILTER_COMPARE_OPS = new Set(['>', '>=', '<', '<=', '==']);
const CONDITION_COMPARE_OPS = new Set(['>', '>=', '<', '<=', '==', '!=']);
const EFFECT_SIDES = new Set(['owner', 'opponent', 'any']);
const ATOM_NAME_SET = new Set<string>(ATOM_NAMES);
const TRIGGER_SET = new Set<string>(TRIGGERS);
// "keep templates honest": a log atom's message may only reference the three
// documented placeholders (see the SNAPSHOT SEMANTICS doc block's {target}
// binding-rule section above) -- anything else is a semantic error, not
// silently left as literal `{whatever}` text in the rendered log line.
const LOG_PLACEHOLDER_PATTERN = /\{([a-zA-Z]+)\}/g;
const KNOWN_LOG_PLACEHOLDERS = new Set(['owner', 'card', 'target']);

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isArray(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

function validateSelectorShape(x: unknown, path: string, errors: string[]): x is Selector {
  if (!isPlainObject(x)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  let ok = true;
  if (!isString(x.zone) || !ZONES.has(x.zone as Zone)) {
    errors.push(`${path}.zone: expected one of ${[...ZONES].join('|')}, got ${JSON.stringify(x.zone)}`);
    ok = false;
  }
  if (!isString(x.owner) || !OWNERS.has(x.owner as Owner)) {
    errors.push(`${path}.owner: expected one of ${[...OWNERS].join('|')}, got ${JSON.stringify(x.owner)}`);
    ok = false;
  }
  if (!isString(x.pick) || !PICK_MODES.has(x.pick as PickMode)) {
    errors.push(`${path}.pick: expected one of ${[...PICK_MODES].join('|')}, got ${JSON.stringify(x.pick)}`);
    ok = false;
  }
  if (x.filter !== undefined && !validateFilterShape(x.filter, `${path}.filter`, errors)) ok = false;
  if (x.chooser !== undefined && (!isString(x.chooser) || !PLAYER_REFS.has(x.chooser as PlayerRef))) {
    errors.push(`${path}.chooser: expected 'self'|'opponent', got ${JSON.stringify(x.chooser)}`);
    ok = false;
  }
  if (x.count !== undefined && !validateValueExprShape(x.count, `${path}.count`, errors)) ok = false;
  return ok;
}

function validateFilterShape(x: unknown, path: string, errors: string[]): x is Filter {
  if (!isPlainObject(x)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  switch (x.type) {
    case 'byType': {
      if (!isString(x.cardType) || !CARD_TYPES.has(x.cardType)) {
        errors.push(`${path}.cardType: expected 'keeper'|'action', got ${JSON.stringify(x.cardType)}`);
        return false;
      }
      return true;
    }
    case 'byName': {
      if (!isString(x.cardId)) {
        errors.push(`${path}.cardId: expected a string`);
        return false;
      }
      return true;
    }
    case 'frozen':
    case 'excludeSelf':
      return true;
    case 'valueCompare': {
      let ok = true;
      if (!isString(x.op) || !FILTER_COMPARE_OPS.has(x.op)) {
        errors.push(`${path}.op: expected one of ${[...FILTER_COMPARE_OPS].join('|')}, got ${JSON.stringify(x.op)}`);
        ok = false;
      }
      if (!validateValueExprShape(x.value, `${path}.value`, errors)) ok = false;
      return ok;
    }
    case 'not':
      return validateFilterShape(x.filter, `${path}.filter`, errors);
    case 'and': {
      if (!isArray(x.filters)) {
        errors.push(`${path}.filters: expected an array`);
        return false;
      }
      let ok = true;
      x.filters.forEach((f, i) => {
        if (!validateFilterShape(f, `${path}.filters[${i}]`, errors)) ok = false;
      });
      return ok;
    }
    default:
      errors.push(`${path}.type: unknown filter type ${JSON.stringify(x.type)}`);
      return false;
  }
}

function validateValueExprShape(x: unknown, path: string, errors: string[]): x is ValueExpr {
  if (!isPlainObject(x)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  switch (x.type) {
    case 'literal': {
      if (!isFiniteNumber(x.value)) {
        errors.push(`${path}.value: expected a finite number`);
        return false;
      }
      return true;
    }
    case 'count':
      return validateSelectorShape(x.selector, `${path}.selector`, errors);
    case 'cardValue':
      return true;
    case 'counter': {
      let ok = true;
      if (!isString(x.name)) {
        errors.push(`${path}.name: expected a string`);
        ok = false;
      }
      if (x.default !== undefined && !isFiniteNumber(x.default)) {
        errors.push(`${path}.default: expected a finite number`);
        ok = false;
      }
      return ok;
    }
    case 'boundCardValue': {
      if (!isString(x.bindAs)) {
        errors.push(`${path}.bindAs: expected a string`);
        return false;
      }
      return true;
    }
    case 'add':
    case 'max':
    case 'min': {
      if (!isArray(x.values)) {
        errors.push(`${path}.values: expected an array`);
        return false;
      }
      let ok = true;
      x.values.forEach((v, i) => {
        if (!validateValueExprShape(v, `${path}.values[${i}]`, errors)) ok = false;
      });
      return ok;
    }
    default:
      errors.push(`${path}.type: unknown ValueExpr type ${JSON.stringify(x.type)}`);
      return false;
  }
}

function validateConditionShape(x: unknown, path: string, errors: string[]): x is Condition {
  if (!isPlainObject(x)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  switch (x.type) {
    case 'compare': {
      let ok = true;
      if (!validateValueExprShape(x.left, `${path}.left`, errors)) ok = false;
      if (!isString(x.op) || !CONDITION_COMPARE_OPS.has(x.op)) {
        errors.push(`${path}.op: expected one of ${[...CONDITION_COMPARE_OPS].join('|')}, got ${JSON.stringify(x.op)}`);
        ok = false;
      }
      if (!validateValueExprShape(x.right, `${path}.right`, errors)) ok = false;
      return ok;
    }
    case 'selectorNonEmpty':
      return validateSelectorShape(x.selector, `${path}.selector`, errors);
    case 'not':
      return validateConditionShape(x.condition, `${path}.condition`, errors);
    case 'and':
    case 'or': {
      if (!isArray(x.conditions)) {
        errors.push(`${path}.conditions: expected an array`);
        return false;
      }
      let ok = true;
      x.conditions.forEach((c, i) => {
        if (!validateConditionShape(c, `${path}.conditions[${i}]`, errors)) ok = false;
      });
      return ok;
    }
    default:
      errors.push(`${path}.type: unknown Condition type ${JSON.stringify(x.type)}`);
      return false;
  }
}

function validateAtomCallShape(x: Record<string, unknown>, path: string, errors: string[]): x is AtomCall {
  const atom = x.atom;
  if (!isString(atom) || !ATOM_NAME_SET.has(atom)) {
    errors.push(`${path}.atom: unknown atom ${JSON.stringify(atom)}`);
    return false;
  }
  let ok = true;
  switch (atom as AtomName) {
    case 'draw': {
      if (!isString(x.target) || !PLAYER_REFS.has(x.target as PlayerRef)) {
        errors.push(`${path}.target: expected 'self'|'opponent'`);
        ok = false;
      }
      if (x.count !== undefined && !validateValueExprShape(x.count, `${path}.count`, errors)) ok = false;
      return ok;
    }
    case 'discard':
    case 'destroy':
    case 'tutorAndPlay':
      return validateSelectorShape(x.selector, `${path}.selector`, errors);
    case 'bounceToHand': {
      if (x.selector !== undefined && !validateSelectorShape(x.selector, `${path}.selector`, errors)) ok = false;
      return ok;
    }
    case 'changeController': {
      if (!validateSelectorShape(x.selector, `${path}.selector`, errors)) ok = false;
      if (!isString(x.to) || !PLAYER_REFS.has(x.to as PlayerRef)) {
        errors.push(`${path}.to: expected 'self'|'opponent'`);
        ok = false;
      }
      return ok;
    }
    case 'freezeInPlay': {
      if (!validateSelectorShape(x.selector, `${path}.selector`, errors)) ok = false;
      if (!validateValueExprShape(x.to, `${path}.to`, errors)) ok = false;
      if (x.duration !== undefined && x.duration !== 'permanent') {
        errors.push(`${path}.duration: only 'permanent' supported in v1`);
        ok = false;
      }
      return ok;
    }
    case 'freezeInHand': {
      if (!validateSelectorShape(x.selector, `${path}.selector`, errors)) ok = false;
      if (x.bindAs !== undefined && !isString(x.bindAs)) {
        errors.push(`${path}.bindAs: expected a string`);
        ok = false;
      }
      return ok;
    }
    case 'grantImmunity': {
      if (x.kind !== 'freeze') {
        errors.push(`${path}.kind: expected 'freeze'`);
        ok = false;
      }
      if (!isString(x.target) || !PLAYER_REFS.has(x.target as PlayerRef)) {
        errors.push(`${path}.target: expected 'self'|'opponent'`);
        ok = false;
      }
      return ok;
    }
    case 'setCounter': {
      if (!isString(x.name)) {
        errors.push(`${path}.name: expected a string`);
        ok = false;
      }
      if (!validateValueExprShape(x.value, `${path}.value`, errors)) ok = false;
      return ok;
    }
    case 'incrementCounter': {
      if (!isString(x.name)) {
        errors.push(`${path}.name: expected a string`);
        ok = false;
      }
      if (x.by !== undefined && !validateValueExprShape(x.by, `${path}.by`, errors)) ok = false;
      return ok;
    }
    case 'setBaseValueOverride': {
      if (!validateSelectorShape(x.selector, `${path}.selector`, errors)) ok = false;
      if (!validateValueExprShape(x.value, `${path}.value`, errors)) ok = false;
      return ok;
    }
    case 'cancelDestroy':
      return true;
    case 'forceWin': {
      if (!isString(x.winner) || !PLAYER_REFS.has(x.winner as PlayerRef)) {
        errors.push(`${path}.winner: expected 'self'|'opponent'`);
        ok = false;
      }
      return ok;
    }
    case 'grantExtraTurn':
    case 'skipNextDraw': {
      if (!isString(x.target) || !PLAYER_REFS.has(x.target as PlayerRef)) {
        errors.push(`${path}.target: expected 'self'|'opponent'`);
        ok = false;
      }
      return ok;
    }
    case 'log': {
      if (!isString(x.message)) {
        errors.push(`${path}.message: expected a string`);
        ok = false;
      }
      return ok;
    }
    default: {
      // Unreachable given the ATOM_NAME_SET check above, but keeps the
      // switch exhaustive without a TS-only assertion.
      errors.push(`${path}.atom: unhandled atom ${JSON.stringify(atom)}`);
      return false;
    }
  }
}

function validateStepShape(x: unknown, path: string, errors: string[]): x is Step {
  if (!isPlainObject(x)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  if (x.type === 'seq') {
    if (!isArray(x.steps)) {
      errors.push(`${path}.steps: expected an array`);
      return false;
    }
    let ok = true;
    x.steps.forEach((s, i) => {
      if (!validateStepShape(s, `${path}.steps[${i}]`, errors)) ok = false;
    });
    return ok;
  }
  if (x.type === 'if') {
    let ok = true;
    if (!validateConditionShape(x.condition, `${path}.condition`, errors)) ok = false;
    if (!validateStepShape(x.then, `${path}.then`, errors)) ok = false;
    if (x.else !== undefined && !validateStepShape(x.else, `${path}.else`, errors)) ok = false;
    return ok;
  }
  // Otherwise: must be an AtomCall (discriminated by `atom`, not `type`).
  if (x.type !== undefined) {
    errors.push(`${path}.type: unknown Step discriminant ${JSON.stringify(x.type)} (expected 'seq'|'if', or an atom call with no 'type' field)`);
    return false;
  }
  return validateAtomCallShape(x, path, errors);
}

function validateEffectDefShape(x: unknown, path: string, errors: string[]): x is EffectDef {
  if (!isPlainObject(x)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  let ok = true;
  if (!isString(x.trigger) || !TRIGGER_SET.has(x.trigger)) {
    errors.push(`${path}.trigger: unknown trigger ${JSON.stringify(x.trigger)}`);
    ok = false;
  }
  if (x.side !== undefined && (!isString(x.side) || !EFFECT_SIDES.has(x.side))) {
    errors.push(`${path}.side: expected 'owner'|'opponent'|'any'`);
    ok = false;
  }
  if (x.priority !== undefined && !isFiniteNumber(x.priority)) {
    errors.push(`${path}.priority: expected a finite number`);
    ok = false;
  }
  if (!validateStepShape(x.body, `${path}.body`, errors)) ok = false;
  return ok;
}

export function validateCompositionShape(input: unknown): ShapeValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['composition: expected an object'] };
  }
  let ok = true;
  if (!isString(input.cardType) || !CARD_TYPES.has(input.cardType)) {
    errors.push(`composition.cardType: expected 'keeper'|'action', got ${JSON.stringify(input.cardType)}`);
    ok = false;
  }
  if (!isFiniteNumber(input.baseValue)) {
    errors.push('composition.baseValue: expected a finite number');
    ok = false;
  }
  if (!isArray(input.effects)) {
    errors.push('composition.effects: expected an array');
    ok = false;
  } else {
    input.effects.forEach((e, i) => {
      if (!validateEffectDefShape(e, `composition.effects[${i}]`, errors)) ok = false;
    });
  }
  if (input.scoreDelta !== undefined && !validateValueExprShape(input.scoreDelta, 'composition.scoreDelta', errors)) {
    ok = false;
  }
  if (input.strategy !== undefined) {
    if (!isPlainObject(input.strategy)) {
      errors.push('composition.strategy: expected an object');
      ok = false;
    } else {
      if (input.strategy.playValue !== undefined && !isFiniteNumber(input.strategy.playValue)) {
        errors.push('composition.strategy.playValue: expected a finite number');
        ok = false;
      }
      if (input.strategy.stealTargetValue !== undefined && !isFiniteNumber(input.strategy.stealTargetValue)) {
        errors.push('composition.strategy.stealTargetValue: expected a finite number');
        ok = false;
      }
    }
  }

  if (!ok) return { ok: false, errors };
  return { ok: true, errors: [], value: input as unknown as CardComposition };
}

// ============================================================================
// Semantic validation (assumes shape already validated)
// ============================================================================

export interface SemanticValidationResult {
  ok: boolean;
  errors: string[];
}

const MAX_STEP_COUNT = 40;
const MAX_NESTING_DEPTH = 6;

interface SemanticCtx {
  knownCardIds?: ReadonlySet<string>;
  boundNames: Set<string>;
  errors: string[];
}

function validateSelectorSemantics(selector: Selector, path: string, ctx: SemanticCtx, depth: number): number {
  let maxDepth = depth;
  if (selector.chooser === undefined && (selector.pick === 'chooser' || selector.pick === 'maxValue' || selector.pick === 'minValue')) {
    ctx.errors.push(`${path}: pick '${selector.pick}' requires a 'chooser'`);
  }
  if (selector.filter) {
    maxDepth = Math.max(maxDepth, validateFilterSemantics(selector.filter, `${path}.filter`, ctx, depth + 1));
  }
  if (selector.count) {
    maxDepth = Math.max(maxDepth, validateValueExprSemantics(selector.count, `${path}.count`, ctx, depth + 1));
  }
  return maxDepth;
}

function validateFilterSemantics(filter: Filter, path: string, ctx: SemanticCtx, depth: number): number {
  let maxDepth = depth;
  switch (filter.type) {
    case 'byName':
      if (ctx.knownCardIds && !ctx.knownCardIds.has(filter.cardId)) {
        ctx.errors.push(`${path}: unknown cardId ${JSON.stringify(filter.cardId)}`);
      }
      break;
    case 'valueCompare':
      maxDepth = Math.max(maxDepth, validateValueExprSemantics(filter.value, `${path}.value`, ctx, depth + 1));
      break;
    case 'not':
      maxDepth = Math.max(maxDepth, validateFilterSemantics(filter.filter, `${path}.filter`, ctx, depth + 1));
      break;
    case 'and':
      filter.filters.forEach((f, i) => {
        maxDepth = Math.max(maxDepth, validateFilterSemantics(f, `${path}.filters[${i}]`, ctx, depth + 1));
      });
      break;
    default:
      break;
  }
  return maxDepth;
}

function validateValueExprSemantics(expr: ValueExpr, path: string, ctx: SemanticCtx, depth: number): number {
  let maxDepth = depth;
  switch (expr.type) {
    case 'count':
      if (expr.selector.pick !== 'all') {
        ctx.errors.push(`${path}.selector.pick: count() selectors must use pick:'all' (a chooser-based count is not supported)`);
      }
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(expr.selector, `${path}.selector`, ctx, depth + 1));
      break;
    case 'boundCardValue':
      if (!ctx.boundNames.has(expr.bindAs)) {
        ctx.errors.push(`${path}: boundCardValue('${expr.bindAs}') has no matching freezeInHand(bindAs:'${expr.bindAs}') anywhere in this composition`);
      }
      break;
    case 'add':
    case 'max':
    case 'min':
      expr.values.forEach((v, i) => {
        maxDepth = Math.max(maxDepth, validateValueExprSemantics(v, `${path}.values[${i}]`, ctx, depth + 1));
      });
      break;
    default:
      break;
  }
  return maxDepth;
}

function validateConditionSemantics(condition: Condition, path: string, ctx: SemanticCtx, depth: number): number {
  let maxDepth = depth;
  switch (condition.type) {
    case 'compare':
      maxDepth = Math.max(maxDepth, validateValueExprSemantics(condition.left, `${path}.left`, ctx, depth + 1));
      maxDepth = Math.max(maxDepth, validateValueExprSemantics(condition.right, `${path}.right`, ctx, depth + 1));
      break;
    case 'selectorNonEmpty':
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(condition.selector, `${path}.selector`, ctx, depth + 1));
      break;
    case 'not':
      maxDepth = Math.max(maxDepth, validateConditionSemantics(condition.condition, `${path}.condition`, ctx, depth + 1));
      break;
    case 'and':
    case 'or':
      condition.conditions.forEach((c, i) => {
        maxDepth = Math.max(maxDepth, validateConditionSemantics(c, `${path}.conditions[${i}]`, ctx, depth + 1));
      });
      break;
    default:
      break;
  }
  return maxDepth;
}

function requireZone(selector: Selector, zone: Zone, path: string, ctx: SemanticCtx): void {
  if (selector.zone !== zone) {
    ctx.errors.push(`${path}.zone: expected '${zone}', got '${selector.zone}'`);
  }
}

interface AtomWalkResult {
  steps: number;
  depth: number;
}

function validateAtomSemantics(atom: AtomCall, trigger: Trigger, path: string, ctx: SemanticCtx, depth: number): AtomWalkResult {
  let maxDepth = depth;
  switch (atom.atom) {
    case 'draw':
      if (atom.count) maxDepth = Math.max(maxDepth, validateValueExprSemantics(atom.count, `${path}.count`, ctx, depth + 1));
      break;
    case 'discard':
      requireZone(atom.selector, 'hand', `${path}.selector`, ctx);
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(atom.selector, `${path}.selector`, ctx, depth + 1));
      break;
    case 'destroy':
      requireZone(atom.selector, 'inPlay', `${path}.selector`, ctx);
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(atom.selector, `${path}.selector`, ctx, depth + 1));
      break;
    case 'bounceToHand':
      if (atom.selector) {
        maxDepth = Math.max(maxDepth, validateSelectorSemantics(atom.selector, `${path}.selector`, ctx, depth + 1));
      }
      break;
    case 'changeController':
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(atom.selector, `${path}.selector`, ctx, depth + 1));
      break;
    case 'freezeInPlay':
      requireZone(atom.selector, 'inPlay', `${path}.selector`, ctx);
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(atom.selector, `${path}.selector`, ctx, depth + 1));
      maxDepth = Math.max(maxDepth, validateValueExprSemantics(atom.to, `${path}.to`, ctx, depth + 1));
      break;
    case 'freezeInHand':
      requireZone(atom.selector, 'hand', `${path}.selector`, ctx);
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(atom.selector, `${path}.selector`, ctx, depth + 1));
      break;
    case 'grantImmunity':
      if (trigger !== 'onEnterPlay') {
        ctx.errors.push(`${path}: grantImmunity may only appear under trigger 'onEnterPlay', found under '${trigger}'`);
      }
      break;
    case 'setCounter':
      maxDepth = Math.max(maxDepth, validateValueExprSemantics(atom.value, `${path}.value`, ctx, depth + 1));
      break;
    case 'incrementCounter':
      if (atom.by) maxDepth = Math.max(maxDepth, validateValueExprSemantics(atom.by, `${path}.by`, ctx, depth + 1));
      break;
    case 'setBaseValueOverride':
      if (atom.selector.pick !== 'self') {
        requireZone(atom.selector, 'inPlay', `${path}.selector`, ctx);
      }
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(atom.selector, `${path}.selector`, ctx, depth + 1));
      maxDepth = Math.max(maxDepth, validateValueExprSemantics(atom.value, `${path}.value`, ctx, depth + 1));
      break;
    case 'cancelDestroy':
      if (trigger !== 'onBeforeDestroy') {
        ctx.errors.push(`${path}: cancelDestroy may only appear under trigger 'onBeforeDestroy', found under '${trigger}'`);
      }
      break;
    case 'forceWin':
    case 'grantExtraTurn':
    case 'skipNextDraw':
      break;
    case 'log':
      for (const match of atom.message.matchAll(LOG_PLACEHOLDER_PATTERN)) {
        if (!KNOWN_LOG_PLACEHOLDERS.has(match[1])) {
          ctx.errors.push(
            `${path}.message: unknown placeholder "{${match[1]}}" (only {owner}, {card}, {target} are supported)`
          );
        }
      }
      break;
    case 'tutorAndPlay':
      requireZone(atom.selector, 'drawPile', `${path}.selector`, ctx);
      if (atom.selector.pick !== 'chooser' && atom.selector.pick !== 'random') {
        ctx.errors.push(`${path}.selector.pick: tutorAndPlay requires pick 'chooser' or 'random', got '${atom.selector.pick}'`);
      }
      maxDepth = Math.max(maxDepth, validateSelectorSemantics(atom.selector, `${path}.selector`, ctx, depth + 1));
      break;
    default:
      break;
  }
  return { steps: 1, depth: maxDepth };
}

function validateStepSemantics(step: Step, trigger: Trigger, path: string, ctx: SemanticCtx, depth: number): AtomWalkResult {
  if (isAtomCall(step)) {
    return validateAtomSemantics(step, trigger, path, ctx, depth);
  }
  if (step.type === 'seq') {
    let steps = 1;
    let maxDepth = depth;
    step.steps.forEach((s, i) => {
      const result = validateStepSemantics(s, trigger, `${path}.steps[${i}]`, ctx, depth + 1);
      steps += result.steps;
      maxDepth = Math.max(maxDepth, result.depth);
    });
    return { steps, depth: maxDepth };
  }
  // step.type === 'if'
  let steps = 1;
  let maxDepth = Math.max(depth, validateConditionSemantics(step.condition, `${path}.condition`, ctx, depth + 1));
  const thenResult = validateStepSemantics(step.then, trigger, `${path}.then`, ctx, depth + 1);
  steps += thenResult.steps;
  maxDepth = Math.max(maxDepth, thenResult.depth);
  if (step.else) {
    const elseResult = validateStepSemantics(step.else, trigger, `${path}.else`, ctx, depth + 1);
    steps += elseResult.steps;
    maxDepth = Math.max(maxDepth, elseResult.depth);
  }
  return { steps, depth: maxDepth };
}

// First pass: collect every bindAs name set anywhere by a freezeInHand atom,
// so boundCardValue references can be checked against them.
function collectBindAsNames(step: Step, names: Set<string>): void {
  if (isAtomCall(step)) {
    if (step.atom === 'freezeInHand' && step.bindAs) {
      names.add(step.bindAs);
    }
    return;
  }
  if (step.type === 'seq') {
    step.steps.forEach((s) => collectBindAsNames(s, names));
    return;
  }
  // step.type === 'if'
  collectBindAsNames(step.then, names);
  if (step.else) collectBindAsNames(step.else, names);
}

export function validateCompositionSemantics(
  composition: CardComposition,
  ctx: { knownCardIds?: ReadonlySet<string> } = {}
): SemanticValidationResult {
  const errors: string[] = [];
  const boundNames = new Set<string>();
  for (const effect of composition.effects) {
    collectBindAsNames(effect.body, boundNames);
  }

  const semCtx: SemanticCtx = { knownCardIds: ctx.knownCardIds, boundNames, errors };

  let totalSteps = 0;
  let maxDepth = 0;

  composition.effects.forEach((effect, i) => {
    const path = `composition.effects[${i}].body`;
    const result = validateStepSemantics(effect.body, effect.trigger, path, semCtx, 1);
    totalSteps += result.steps;
    maxDepth = Math.max(maxDepth, result.depth);
  });

  if (composition.scoreDelta) {
    maxDepth = Math.max(maxDepth, validateValueExprSemantics(composition.scoreDelta, 'composition.scoreDelta', semCtx, 1));
  }

  if (composition.cardType === 'action' && composition.scoreDelta) {
    errors.push('composition.scoreDelta: not allowed when cardType is "action"');
  }

  if (totalSteps > MAX_STEP_COUNT) {
    errors.push(`composition: total step count ${totalSteps} exceeds max ${MAX_STEP_COUNT}`);
  }
  if (maxDepth > MAX_NESTING_DEPTH) {
    errors.push(`composition: nesting depth ${maxDepth} exceeds max ${MAX_NESTING_DEPTH}`);
  }

  return { ok: errors.length === 0, errors };
}

// ============================================================================
// ATOM_JSON_SCHEMA -- hand-maintained JSON Schema mirroring the AST above,
// for Claude structured-output calls (server/claude.ts, out of scope for
// M1). Kept in sync with the AST by the drift-catching test in
// tests/atoms.test.ts (roundtrips ATOM_NAMES against every
// $defs.AtomCall.oneOf branch's `properties.atom.const`).
// ============================================================================

const selectorSchema = {
  type: 'object',
  properties: {
    zone: { type: 'string', enum: [...ZONES] },
    owner: { type: 'string', enum: [...OWNERS] },
    filter: { $ref: '#/$defs/Filter' },
    pick: { type: 'string', enum: [...PICK_MODES] },
    chooser: { type: 'string', enum: [...PLAYER_REFS] },
    count: { $ref: '#/$defs/ValueExpr' },
  },
  required: ['zone', 'owner', 'pick'],
};

const filterSchema = {
  oneOf: [
    { type: 'object', properties: { type: { const: 'byType' }, cardType: { type: 'string', enum: [...CARD_TYPES] } }, required: ['type', 'cardType'] },
    { type: 'object', properties: { type: { const: 'byName' }, cardId: { type: 'string' } }, required: ['type', 'cardId'] },
    { type: 'object', properties: { type: { const: 'frozen' } }, required: ['type'] },
    {
      type: 'object',
      properties: { type: { const: 'valueCompare' }, op: { type: 'string', enum: [...FILTER_COMPARE_OPS] }, value: { $ref: '#/$defs/ValueExpr' } },
      required: ['type', 'op', 'value'],
    },
    { type: 'object', properties: { type: { const: 'excludeSelf' } }, required: ['type'] },
    { type: 'object', properties: { type: { const: 'not' }, filter: { $ref: '#/$defs/Filter' } }, required: ['type', 'filter'] },
    {
      type: 'object',
      properties: { type: { const: 'and' }, filters: { type: 'array', items: { $ref: '#/$defs/Filter' } } },
      required: ['type', 'filters'],
    },
  ],
};

const valueExprSchema = {
  oneOf: [
    { type: 'object', properties: { type: { const: 'literal' }, value: { type: 'number' } }, required: ['type', 'value'] },
    { type: 'object', properties: { type: { const: 'count' }, selector: { $ref: '#/$defs/Selector' } }, required: ['type', 'selector'] },
    { type: 'object', properties: { type: { const: 'cardValue' } }, required: ['type'] },
    {
      type: 'object',
      properties: { type: { const: 'counter' }, name: { type: 'string' }, default: { type: 'number' } },
      required: ['type', 'name'],
    },
    { type: 'object', properties: { type: { const: 'boundCardValue' }, bindAs: { type: 'string' } }, required: ['type', 'bindAs'] },
    { type: 'object', properties: { type: { const: 'add' }, values: { type: 'array', items: { $ref: '#/$defs/ValueExpr' } } }, required: ['type', 'values'] },
    { type: 'object', properties: { type: { const: 'max' }, values: { type: 'array', items: { $ref: '#/$defs/ValueExpr' } } }, required: ['type', 'values'] },
    { type: 'object', properties: { type: { const: 'min' }, values: { type: 'array', items: { $ref: '#/$defs/ValueExpr' } } }, required: ['type', 'values'] },
  ],
};

const conditionSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { const: 'compare' },
        left: { $ref: '#/$defs/ValueExpr' },
        op: { type: 'string', enum: [...CONDITION_COMPARE_OPS] },
        right: { $ref: '#/$defs/ValueExpr' },
      },
      required: ['type', 'left', 'op', 'right'],
    },
    {
      type: 'object',
      properties: { type: { const: 'selectorNonEmpty' }, selector: { $ref: '#/$defs/Selector' } },
      required: ['type', 'selector'],
    },
    { type: 'object', properties: { type: { const: 'not' }, condition: { $ref: '#/$defs/Condition' } }, required: ['type', 'condition'] },
    {
      type: 'object',
      properties: { type: { const: 'and' }, conditions: { type: 'array', items: { $ref: '#/$defs/Condition' } } },
      required: ['type', 'conditions'],
    },
    {
      type: 'object',
      properties: { type: { const: 'or' }, conditions: { type: 'array', items: { $ref: '#/$defs/Condition' } } },
      required: ['type', 'conditions'],
    },
  ],
};

const atomCallSchema = {
  oneOf: [
    {
      type: 'object',
      properties: { atom: { const: 'draw' }, target: { type: 'string', enum: [...PLAYER_REFS] }, count: { $ref: '#/$defs/ValueExpr' } },
      required: ['atom', 'target'],
    },
    { type: 'object', properties: { atom: { const: 'discard' }, selector: { $ref: '#/$defs/Selector' } }, required: ['atom', 'selector'] },
    { type: 'object', properties: { atom: { const: 'destroy' }, selector: { $ref: '#/$defs/Selector' } }, required: ['atom', 'selector'] },
    { type: 'object', properties: { atom: { const: 'bounceToHand' }, selector: { $ref: '#/$defs/Selector' } }, required: ['atom'] },
    {
      type: 'object',
      properties: { atom: { const: 'changeController' }, selector: { $ref: '#/$defs/Selector' }, to: { type: 'string', enum: [...PLAYER_REFS] } },
      required: ['atom', 'selector', 'to'],
    },
    {
      type: 'object',
      properties: {
        atom: { const: 'freezeInPlay' },
        selector: { $ref: '#/$defs/Selector' },
        to: { $ref: '#/$defs/ValueExpr' },
        duration: { const: 'permanent' },
      },
      required: ['atom', 'selector', 'to'],
    },
    {
      type: 'object',
      properties: { atom: { const: 'freezeInHand' }, selector: { $ref: '#/$defs/Selector' }, bindAs: { type: 'string' } },
      required: ['atom', 'selector'],
    },
    {
      type: 'object',
      properties: { atom: { const: 'grantImmunity' }, kind: { const: 'freeze' }, target: { type: 'string', enum: [...PLAYER_REFS] } },
      required: ['atom', 'kind', 'target'],
    },
    {
      type: 'object',
      properties: { atom: { const: 'setCounter' }, name: { type: 'string' }, value: { $ref: '#/$defs/ValueExpr' } },
      required: ['atom', 'name', 'value'],
    },
    {
      type: 'object',
      properties: { atom: { const: 'incrementCounter' }, name: { type: 'string' }, by: { $ref: '#/$defs/ValueExpr' } },
      required: ['atom', 'name'],
    },
    {
      type: 'object',
      properties: { atom: { const: 'setBaseValueOverride' }, selector: { $ref: '#/$defs/Selector' }, value: { $ref: '#/$defs/ValueExpr' } },
      required: ['atom', 'selector', 'value'],
    },
    { type: 'object', properties: { atom: { const: 'cancelDestroy' } }, required: ['atom'] },
    { type: 'object', properties: { atom: { const: 'forceWin' }, winner: { type: 'string', enum: [...PLAYER_REFS] } }, required: ['atom', 'winner'] },
    {
      type: 'object',
      properties: { atom: { const: 'grantExtraTurn' }, target: { type: 'string', enum: [...PLAYER_REFS] } },
      required: ['atom', 'target'],
    },
    {
      type: 'object',
      properties: { atom: { const: 'skipNextDraw' }, target: { type: 'string', enum: [...PLAYER_REFS] } },
      required: ['atom', 'target'],
    },
    { type: 'object', properties: { atom: { const: 'tutorAndPlay' }, selector: { $ref: '#/$defs/Selector' } }, required: ['atom', 'selector'] },
    { type: 'object', properties: { atom: { const: 'log' }, message: { type: 'string' } }, required: ['atom', 'message'] },
  ],
};

const stepSchema = {
  oneOf: [
    { type: 'object', properties: { type: { const: 'seq' }, steps: { type: 'array', items: { $ref: '#/$defs/Step' } } }, required: ['type', 'steps'] },
    {
      type: 'object',
      properties: {
        type: { const: 'if' },
        condition: { $ref: '#/$defs/Condition' },
        then: { $ref: '#/$defs/Step' },
        else: { $ref: '#/$defs/Step' },
      },
      required: ['type', 'condition', 'then'],
    },
    { $ref: '#/$defs/AtomCall' },
  ],
};

const effectDefSchema = {
  type: 'object',
  properties: {
    trigger: { type: 'string', enum: [...TRIGGERS] },
    side: { type: 'string', enum: [...EFFECT_SIDES] },
    priority: { type: 'number' },
    body: { $ref: '#/$defs/Step' },
  },
  required: ['trigger', 'body'],
};

const cardCompositionSchema = {
  type: 'object',
  properties: {
    cardType: { type: 'string', enum: [...CARD_TYPES] },
    baseValue: { type: 'number' },
    effects: { type: 'array', items: { $ref: '#/$defs/EffectDef' } },
    scoreDelta: { $ref: '#/$defs/ValueExpr' },
    strategy: {
      type: 'object',
      properties: { playValue: { type: 'number' }, stealTargetValue: { type: 'number' } },
    },
  },
  required: ['cardType', 'baseValue', 'effects'],
};

export const ATOM_JSON_SCHEMA = {
  $ref: '#/$defs/CardComposition',
  $defs: {
    Selector: selectorSchema,
    Filter: filterSchema,
    ValueExpr: valueExprSchema,
    Condition: conditionSchema,
    Step: stepSchema,
    AtomCall: atomCallSchema,
    EffectDef: effectDefSchema,
    CardComposition: cardCompositionSchema,
  },
} as const;
