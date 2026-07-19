// The generic effect-AST catalog toolkit — FRAMEWORK ONLY, generalized from
// lution/shared/atoms.ts's catalog/validator architecture (CardComposition,
// ATOM_NAMES, validateCompositionShape/Semantics, ATOM_JSON_SCHEMA). There is
// NO EXECUTOR here: compiling a composition into actual game effects (what
// lution/src/engine/compileComposition.ts does) is irreducibly game-specific
// — every game's atoms mean different things to its own engine — so it
// stays game-side by design. This module only gives a game author:
//   - a place to declare atom names + param schemas + docs (defineCatalog)
//   - a shape validator (structure: known atoms, param schemas conform)
//   - a semantic-rule runner (cross-cutting rules the shape checker can't
//     express, e.g. "no card may repeat the same subeffect twice")
//   - a non-recursive wire schema for structured-output calls
//   - a catalog-vs-docs drift check (the ATOM_NAMES pattern, generalized)
//
// DESIGN CHOICE, stated explicitly: Lution's own ATOM_JSON_SCHEMA is
// recursive ($defs.Step/Filter/ValueExpr all self-reference) and its wire
// envelope (the opaque `{ composition: string }` property) lived directly in
// server/claude.ts, hand-written per call site. Here the two are merged:
// wireSchema() below always returns the non-recursive JSON-string envelope
// directly, because every structured LLM call in this package already goes
// through that transport (see structured.ts) — there is no reason for a
// game author to hand-roll it again per catalog.
//
// A SMALL local JSON-Schema-subset checker backs param validation (no
// dependency): type, object, array, string, number, boolean, enum, required,
// properties, items. This is deliberately not a full JSON Schema
// implementation — just enough to catch "wrong type" / "missing required
// field" mistakes in atom params, which is what actually goes wrong in
// practice.

import { wireSchemaFor } from './structured.ts';

// ============================================================================
// Composition shape
// ============================================================================

/** One step in an effect body: a single atom call, a sequence, or a branch. */
export type Step =
  | { atom: string; params?: unknown }
  | { seq: Step[] }
  | { if: { cond: unknown; then: Step[]; else?: Step[] } };

export interface Composition {
  trigger: string;
  body: Step;
}

export interface AtomSpec {
  /** JSON Schema (the local subset documented above) for this atom's
   * `params`. */
  params: object;
  /** Human-readable doc for this atom, folded into the generated
   * prompt/wireSchema description. May cross-reference another atom by
   * name in backticks (e.g. "pairs with \`freezeInHand\`") — catalogDriftCheck
   * verifies such references stay valid. */
  doc: string;
}

export interface SemanticRule {
  name: string;
  /** Return a human-readable violation message, or null if the rule passes. */
  check(composition: Composition): string | null;
}

export interface CatalogSpec {
  name: string;
  atoms: Record<string, AtomSpec>;
  semanticRules?: SemanticRule[];
}

export interface ShapeValidationResult {
  ok: boolean;
  errors: string[];
}

export interface Catalog {
  validateShape(value: unknown): ShapeValidationResult;
  validateSemantics(composition: Composition): string[];
  wireSchema(): object;
  catalogDriftCheck(): string[];
}

// ============================================================================
// Small local JSON-Schema-subset checker (no dependency)
// ============================================================================

interface JsonSchemaSubset {
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean';
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Record<string, JsonSchemaSubset>;
  items?: JsonSchemaSubset;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function matchesType(type: JsonSchemaSubset['type'], value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Validates `value` against a JSON-Schema subset (type/object/array/string/
 * number/boolean/enum/required/properties/items). Exported for callers who
 * want to validate atom params (or anything else) outside of a full
 * composition, but primarily used internally by validateShape. */
export function checkJsonSchemaSubset(schema: unknown, value: unknown, path: string, errors: string[]): boolean {
  if (schema === undefined || schema === null || typeof schema !== 'object') return true; // no constraint
  const s = schema as JsonSchemaSubset;
  let ok = true;

  if (s.enum !== undefined) {
    if (!s.enum.some((candidate) => deepEqual(candidate, value))) {
      errors.push(`${path}: expected one of ${JSON.stringify(s.enum)}, got ${JSON.stringify(value)}`);
      ok = false;
    }
  }

  if (s.type !== undefined && !matchesType(s.type, value)) {
    errors.push(`${path}: expected type "${s.type}", got ${JSON.stringify(value)}`);
    return false; // further structural checks are meaningless on a type mismatch
  }

  if (s.type === 'object' && isPlainObject(value)) {
    if (s.required) {
      for (const key of s.required) {
        if (!(key in value)) {
          errors.push(`${path}: missing required property "${key}"`);
          ok = false;
        }
      }
    }
    if (s.properties) {
      for (const [key, propSchema] of Object.entries(s.properties)) {
        if (key in value) {
          if (!checkJsonSchemaSubset(propSchema, value[key], `${path}.${key}`, errors)) ok = false;
        }
      }
    }
  }

  if (s.type === 'array' && Array.isArray(value) && s.items) {
    value.forEach((item, i) => {
      if (!checkJsonSchemaSubset(s.items, item, `${path}[${i}]`, errors)) ok = false;
    });
  }

  return ok;
}

// ============================================================================
// Shape validation (composition structure + atom names + param schemas)
// ============================================================================

function validateStep(atoms: Record<string, AtomSpec>, step: unknown, path: string, errors: string[]): boolean {
  if (!isPlainObject(step)) {
    errors.push(`${path}: expected an object`);
    return false;
  }

  if ('atom' in step) {
    const atomName = step.atom;
    if (typeof atomName !== 'string' || !(atomName in atoms)) {
      errors.push(`${path}.atom: unknown atom ${JSON.stringify(atomName)}`);
      return false;
    }
    return checkJsonSchemaSubset(atoms[atomName].params, step.params, `${path}.params`, errors);
  }

  if ('seq' in step) {
    if (!Array.isArray(step.seq)) {
      errors.push(`${path}.seq: expected an array`);
      return false;
    }
    let ok = true;
    step.seq.forEach((sub, i) => {
      if (!validateStep(atoms, sub, `${path}.seq[${i}]`, errors)) ok = false;
    });
    return ok;
  }

  if ('if' in step) {
    if (!isPlainObject(step.if)) {
      errors.push(`${path}.if: expected an object`);
      return false;
    }
    const ifBlock = step.if;
    let ok = true;
    if (!('cond' in ifBlock)) {
      errors.push(`${path}.if.cond: missing`);
      ok = false;
    }
    if (!Array.isArray(ifBlock.then)) {
      errors.push(`${path}.if.then: expected an array`);
      ok = false;
    } else {
      ifBlock.then.forEach((sub, i) => {
        if (!validateStep(atoms, sub, `${path}.if.then[${i}]`, errors)) ok = false;
      });
    }
    if (ifBlock.else !== undefined) {
      if (!Array.isArray(ifBlock.else)) {
        errors.push(`${path}.if.else: expected an array`);
        ok = false;
      } else {
        ifBlock.else.forEach((sub, i) => {
          if (!validateStep(atoms, sub, `${path}.if.else[${i}]`, errors)) ok = false;
        });
      }
    }
    return ok;
  }

  errors.push(`${path}: step must have one of "atom", "seq", "if"`);
  return false;
}

// ============================================================================
// Docs rendering + drift check
// ============================================================================

function renderDocs(atoms: Record<string, AtomSpec>): string {
  return Object.entries(atoms)
    .map(([name, spec]) => `${name}: ${spec.doc}`)
    .join('\n');
}

const BACKTICK_ATOM_REF = /`([a-zA-Z][a-zA-Z0-9_]*)`/g;

function escapeForWordBoundaryRegExp(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// defineCatalog
// ============================================================================

export function defineCatalog(spec: CatalogSpec): Catalog {
  return {
    validateShape(value: unknown): ShapeValidationResult {
      const errors: string[] = [];
      if (!isPlainObject(value)) {
        return { ok: false, errors: ['composition: expected an object'] };
      }
      if (typeof value.trigger !== 'string') {
        errors.push('composition.trigger: expected a string');
      }
      if (!('body' in value)) {
        errors.push('composition.body: missing');
      } else {
        validateStep(spec.atoms, value.body, 'composition.body', errors);
      }
      return { ok: errors.length === 0, errors };
    },

    validateSemantics(composition: Composition): string[] {
      const errors: string[] = [];
      for (const rule of spec.semanticRules ?? []) {
        const result = rule.check(composition);
        if (result) errors.push(`${rule.name}: ${result}`);
      }
      return errors;
    },

    wireSchema(): object {
      // Non-recursive envelope: composition travels as a JSON string, same
      // transport (wireSchemaFor) as every other structured call in this
      // package — see structured.ts's module doc comment for why the
      // recursive AST can never be the literal wire schema. The property is
      // named "composition" (not "payload") since a catalog's wire schema is
      // a first-class part of this API, not a generic internal envelope;
      // structuredCall's own wireSchemaFor still names its field "payload"
      // for callers that don't go through defineCatalog.
      const description =
        `${spec.name} composition: {trigger: string, body: Step} where Step is ` +
        `{atom: string, params?: object} | {seq: Step[]} | {if: {cond, then: Step[], else?: Step[]}}. ` +
        `Available atoms:\n${renderDocs(spec.atoms)}`;
      const envelope = wireSchemaFor(description) as {
        type: string;
        properties: { payload: object };
        required: string[];
        additionalProperties: boolean;
      };
      return {
        type: envelope.type,
        properties: { composition: envelope.properties.payload },
        required: ['composition'],
        additionalProperties: envelope.additionalProperties,
      };
    },

    catalogDriftCheck(): string[] {
      const errors: string[] = [];
      const names = Object.keys(spec.atoms);
      const nameSet = new Set(names);
      const docsText = renderDocs(spec.atoms);

      // Direction 1: every declared atom must actually appear in the
      // generated docs (by construction this only fails if an atom's own
      // name can't be word-matched, e.g. contains regex-special chars).
      for (const name of names) {
        const pattern = new RegExp(`\\b${escapeForWordBoundaryRegExp(name)}\\b`);
        if (!pattern.test(docsText)) {
          errors.push(`atom "${name}" is defined but does not appear in the generated docs`);
        }
      }

      // Direction 2: every backtick-quoted atom cross-reference inside a
      // doc string must name a REAL atom — catches a doc left pointing at a
      // renamed/removed atom (the ATOM_NAMES drift pattern, generalized).
      for (const [name, atomSpec] of Object.entries(spec.atoms)) {
        for (const match of atomSpec.doc.matchAll(BACKTICK_ATOM_REF)) {
          const ref = match[1];
          if (!nameSet.has(ref)) {
            errors.push(`atom "${name}"'s doc references \`${ref}\`, which is not a known atom`);
          }
        }
      }

      return errors;
    },
  };
}
