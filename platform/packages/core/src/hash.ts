// Stable hashing for states, configs, and dataset stamping.
//
// engineHash is DECLARATION-BASED: hash(id + ':' + version). Never hash a
// GameDef's function bodies — JSON.stringify drops them and
// Function.prototype.toString varies by bundler/minifier, so a structural
// hash would be either vacuous or environment-dependent. Bumping
// GameDef.version on logic changes is the author's contract (enforced
// socially and by review, like a schema version).

export function stableStringify(value: unknown): string {
  const seen = new Set<unknown>();
  const walk = (v: unknown): string => {
    if (v === null) return 'null';
    switch (typeof v) {
      case 'number':
        if (!Number.isFinite(v)) return JSON.stringify(String(v));
        return JSON.stringify(v);
      case 'string':
      case 'boolean':
        return JSON.stringify(v);
      case 'undefined':
        return '"__undefined__"';
      case 'bigint':
        return JSON.stringify(`__bigint__${v.toString()}`);
      case 'function':
      case 'symbol':
        throw new Error(`stableStringify: cannot hash a ${typeof v}`);
      case 'object': {
        if (seen.has(v)) throw new Error('stableStringify: circular reference');
        seen.add(v);
        let out: string;
        if (Array.isArray(v)) {
          out = `[${v.map(walk).join(',')}]`;
        } else if (v instanceof Map) {
          const entries = [...(v as Map<unknown, unknown>).entries()]
            .map(([k, val]) => [walk(k), walk(val)] as const)
            .sort((a, b) => (a[0] < b[0] ? -1 : 1));
          out = `{"__map__":[${entries.map(([k, val]) => `[${k},${val}]`).join(',')}]}`;
        } else if (v instanceof Set) {
          const items = [...(v as Set<unknown>).values()].map(walk).sort();
          out = `{"__set__":[${items.join(',')}]}`;
        } else {
          const keys = Object.keys(v as object).sort();
          out = `{${keys
            .map((k) => `${JSON.stringify(k)}:${walk((v as Record<string, unknown>)[k])}`)
            .join(',')}}`;
        }
        seen.delete(v);
        return out;
      }
    }
    throw new Error('stableStringify: unreachable');
  };
  return walk(value);
}

/** FNV-1a 32-bit over a string; returns 8-char lowercase hex. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function stableHash(value: unknown): string {
  return fnv1a(stableStringify(value));
}

export function engineHash(def: { id: string; version: string }): string {
  return fnv1a(`${def.id}:${def.version}`);
}

export function configHash(config: unknown): string {
  return stableHash(config);
}

export function stateHash(state: unknown): string {
  return stableHash(state);
}
