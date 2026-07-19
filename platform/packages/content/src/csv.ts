// Self-describing CSV content loader, generalized from Mythgarden's
// `seed_database` management command
// (mythgarden/mythgarden/management/commands/seed_database.py).
//
// Format (verbatim from that source's own comment):
//   Model_A, field_1, field_2, field_3, ...
//   Model_A, value,   value,   value
//   Model_A, value,   value,   value
//   [blank row]
//   Model_B, field_1, field_2, ...
//   ...
//
// i.e. column 1 of a "model row" names the record type; the next row is a
// header naming the fields; subsequent rows are records of that type; a
// blank row (every cell empty) switches back to expecting a model row.
//
// Column-kind conventions, read off the header cell name:
//   - plain field name           -> value goes straight into that field
//   - fk__<type>__<field>        -> value is a natural key; resolved via
//                                   resolveFk(type, value) into `field`
//   - m2m__<type>__<field>       -> cell is a "|"-separated list; each item
//                                   resolved via resolveFk(type, item) into
//                                   an array assigned to `field`
//   - goc_m2m__<type>__<field>   -> identical handling to m2m__ (split on
//                                   "|", resolve each item via resolveFk).
//                                   The ONLY difference from m2m__ is semantic
//                                   and lives entirely in the resolver you
//                                   pass in: Mythgarden's goc_m2m resolver
//                                   calls a model's get_or_create_from_string
//                                   instead of a strict natural-key lookup.
//                                   This loader does not care — document your
//                                   resolveFk's behavior per type at the call
//                                   site.
//
// Deliberate deviation from Mythgarden: the original splits m2m/goc_m2m cells
// on ", " (comma-space) because it never needs a comma *inside* a list cell.
// We use "|" instead, because our CSV cells can already contain commas (via
// quoting) and a game content list item's natural key might too — "|" keeps
// list-splitting orthogonal to cell-splitting. This is called out explicitly
// per the plan's instruction to generalize the format, not clone it byte-for-byte.
//
// Mythgarden's SKIP_VALUES sentinel (read directly off seed_database.py):
//   ['default', 'none', 'null', 'skip']
// A cell whose raw string value is one of these is omitted from the record
// entirely (not set to null/undefined — the key is absent), mirroring
// Mythgarden's kwargs filter `{k: v for k, v in ... if v not in SKIP_VALUES}`.
// For m2m/goc_m2m list cells, an individual list item equal to a skip value
// is dropped from the list rather than blanking the whole field.
//
// Blank-cell alignment quirk inherited on purpose from Mythgarden: header and
// data rows both have ALL blank cells stripped (not just trailing ones)
// before being zipped together — `[v for v in row[1:] if v != '']` in the
// original. This supports variable-width rows (different records omitting
// different optional trailing columns) but means a blank cell is only safe
// in a position where the corresponding header cell is also never blank,
// i.e. use a skip-sentinel string for "no value here", not an empty cell, if
// the blank isn't at the very end of the row.

export interface ParseContentCsvOptions {
  /** Resolve a natural key to a value for fk__/m2m__/goc_m2m__ columns.
   * `type` is the referenced content type named in the column header (e.g.
   * "creature" for fk__creature__sourceId); `naturalKey` is the raw cell (or
   * list-item) string. May throw — a thrown error becomes a warning for that
   * cell/row rather than aborting the whole parse. */
  resolveFk(type: string, naturalKey: string): unknown;
  /** Sentinel strings that mean "omit this field/list-item". Defaults to
   * Mythgarden's SKIP_VALUES: ['default', 'none', 'null', 'skip']. */
  skipValues?: string[];
}

export interface ContentRecord {
  type: string;
  fields: Record<string, unknown>;
}

export interface ParseContentCsvResult {
  records: ContentRecord[];
  counts: Record<string, number>;
  warnings: string[];
}

const DEFAULT_SKIP_VALUES = ['default', 'none', 'null', 'skip'];

type ColumnKind =
  | { kind: 'plain'; field: string }
  | { kind: 'fk'; type: string; field: string }
  | { kind: 'm2m'; type: string; field: string }
  | { kind: 'goc_m2m'; type: string; field: string }
  | { kind: 'unknown'; raw: string };

function classifyColumn(name: string): ColumnKind {
  const parts = name.split('__');

  if (parts.length === 1) {
    return { kind: 'plain', field: name };
  }

  if (parts.length === 3) {
    const [prefix, type, field] = parts;
    if (prefix === 'fk') return { kind: 'fk', type, field };
    if (prefix === 'm2m') return { kind: 'm2m', type, field };
    if (prefix === 'goc_m2m') return { kind: 'goc_m2m', type, field };
  }

  return { kind: 'unknown', raw: name };
}

/** Tiny hand-rolled CSV tokenizer: handles quoted cells (commas/newlines
 * inside quotes) and escaped quotes (""), per the "no dependency" constraint.
 * Supports \n, \r\n, and bare \r line endings. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let sawAnyCellThisRow = false;
  let i = 0;
  const n = text.length;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
    sawAnyCellThisRow = false;
  };

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
      sawAnyCellThisRow = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      sawAnyCellThisRow = true;
      pushCell();
      i += 1;
      continue;
    }

    if (ch === '\r') {
      sawAnyCellThisRow = true;
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }

    if (ch === '\n') {
      sawAnyCellThisRow = true;
      pushRow();
      i += 1;
      continue;
    }

    sawAnyCellThisRow = true;
    cell += ch;
    i += 1;
  }

  if (sawAnyCellThisRow || cell.length > 0) {
    pushRow();
  }

  return rows;
}

export function parseContentCsv(text: string, options: ParseContentCsvOptions): ParseContentCsvResult {
  const skipValues = new Set(options.skipValues ?? DEFAULT_SKIP_VALUES);
  const rows = parseCsvRows(text);

  const warnings: string[] = [];
  const records: ContentRecord[] = [];
  const counts: Record<string, number> = {};

  let currentType: string | null = null;
  let columns: ColumnKind[] = [];
  let rawFieldNames: string[] = [];
  let expectingHeader = true;

  rows.forEach((row, rowIndex) => {
    const lineNo = rowIndex + 1;

    // Mirrors Mythgarden: strip ALL blank cells (not just trailing) before
    // treating the row as a header or a data row.
    const isBlankRow = row.every((v) => v === '');

    if (isBlankRow) {
      currentType = null;
      columns = [];
      rawFieldNames = [];
      expectingHeader = true;
      return;
    }

    if (expectingHeader) {
      const [type, ...rest] = row;
      if (!type) {
        warnings.push(`row ${lineNo}: expected a model row (record type in column 1) but it was blank — skipping`);
        return;
      }

      rawFieldNames = rest.filter((v) => v !== '');
      columns = rawFieldNames.map(classifyColumn);

      for (const [idx, col] of columns.entries()) {
        if (col.kind === 'unknown') {
          warnings.push(`row ${lineNo}: unknown column kind "${col.raw}" for model "${type}" (column ${idx + 2}) — values in this column will be ignored`);
        }
      }

      currentType = type;
      expectingHeader = false;
      return;
    }

    // Data row.
    if (currentType === null) {
      warnings.push(`row ${lineNo}: data row encountered with no active model row — skipping`);
      return;
    }

    if (row[0] !== currentType) {
      warnings.push(`row ${lineNo}: expected model "${currentType}" but first cell was "${row[0]}" — skipping row`);
      return;
    }

    const values = row.slice(1).filter((v) => v !== '');

    if (values.length !== rawFieldNames.length) {
      warnings.push(
        `row ${lineNo}: ragged row — model "${currentType}" header has ${rawFieldNames.length} field(s) but this row has ${values.length} value(s) — skipping row`,
      );
      return;
    }

    const fields: Record<string, unknown> = {};

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const rawValue = values[i];

      if (col.kind === 'unknown') continue; // already warned at header time
      if (skipValues.has(rawValue)) continue; // omitted entirely

      if (col.kind === 'plain') {
        fields[col.field] = rawValue;
        continue;
      }

      if (col.kind === 'fk') {
        try {
          fields[col.field] = options.resolveFk(col.type, rawValue);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          warnings.push(
            `row ${lineNo}: fk resolver failed for fk__${col.type}__${col.field}="${rawValue}" — ${detail}`,
          );
        }
        continue;
      }

      // m2m or goc_m2m: "|"-separated list, each item resolved individually.
      const prefix = col.kind === 'goc_m2m' ? 'goc_m2m' : 'm2m';
      const rawItems = rawValue
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !skipValues.has(s));

      const resolvedItems: unknown[] = [];
      for (const item of rawItems) {
        try {
          resolvedItems.push(options.resolveFk(col.type, item));
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          warnings.push(
            `row ${lineNo}: ${prefix} resolver failed for ${prefix}__${col.type}__${col.field} item "${item}" — ${detail}`,
          );
        }
      }
      fields[col.field] = resolvedItems;
    }

    records.push({ type: currentType, fields });
    counts[currentType] = (counts[currentType] ?? 0) + 1;
  });

  return { records, counts, warnings };
}
