// TESSER Stage C — verified campaign content (SPEC.md §3 Stage C).
//
// 12 missions shipped in the self-describing CSV format (@deev/content's
// parseContentCsv), validated by a zod schema + defineContent seams, and
// machine-verified by defineVerifier: every mission must be (a) not already
// over and (b) won BY ELIMINATION by south within the mission's plyCap when
// tesserMinimaxBot plays BOTH seats (pebble-duel's puzzles.ts is the
// template).
//
// Piece encoding, one cell per side, semicolon-joined specs:
//   [m{measure}:]WxDxH@X,Y
// measure defaults to volume (W*D*H); e.g. "m5:2x2x2@3,5" is a wounded keep.
// Piece ids are auto-assigned S1.. / N1.. in list order.

import { z } from 'zod';
import {
  defineContent,
  parseContentCsv,
  defineVerifier,
  solvable,
  notPreSolved,
} from '@deev/content';
import { mulberry32, runMatch, type Policy } from '@deev/core';
import type { SearchBudget } from '@deev/ai';
import {
  tesser,
  BOARD_W,
  BOARD_H,
  volume,
  type Piece,
  type TesserAction,
  type TesserConfig,
  type TesserSeat,
  type TesserState,
} from './game.ts';
import { tesserMinimaxBot } from './bots.ts';

// ---------------------------------------------------------------------------
// Schema.

export const missionPieceSchema = z.object({
  id: z.string().min(1),
  seat: z.enum(['south', 'north']),
  x: z.number().int().min(0).max(BOARD_W - 1),
  y: z.number().int().min(0).max(BOARD_H - 1),
  w: z.number().int().min(1).max(BOARD_W),
  d: z.number().int().min(1).max(BOARD_H),
  h: z.number().int().min(1).max(8),
  measure: z.number().int().min(1),
});

export const missionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brief: z.string().min(1),
  plyCap: z.number().int().min(2),
  south: z.array(missionPieceSchema).min(1),
  north: z.array(missionPieceSchema).min(1),
});

export type MissionPiece = z.infer<typeof missionPieceSchema>;
export type Mission = z.infer<typeof missionSchema>;

// ---------------------------------------------------------------------------
// Piece-string parser. Strict: throws on any malformed spec so the CSV
// parser can turn the throw into a warning and skip the mission (the pebble
// parser's collect-warnings discipline).

const PIECE_RE = /^(?:m(\d+):)?(\d+)x(\d+)x(\d+)@(\d+),(\d+)$/;

/** Parse one `[m{measure}:]WxDxH@X,Y` spec. Throws on malformed syntax,
 * out-of-bounds boxes, or measure outside 1..volume. */
export function parsePieceString(spec: string, seat: TesserSeat, id: string): Piece {
  const m = PIECE_RE.exec(spec.trim());
  if (!m) throw new Error(`malformed piece spec '${spec}' (expected [m{measure}:]WxDxH@X,Y)`);
  const [, measureRaw, wRaw, dRaw, hRaw, xRaw, yRaw] = m;
  const w = Number(wRaw);
  const d = Number(dRaw);
  const h = Number(hRaw);
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (w < 1 || d < 1 || h < 1 || h > 8) {
    throw new Error(`piece spec '${spec}': dims must satisfy 1 ≤ w, 1 ≤ d, 1 ≤ h ≤ 8`);
  }
  if (x + w > BOARD_W || y + d > BOARD_H) {
    throw new Error(`piece spec '${spec}': footprint off board (board ${BOARD_W}×${BOARD_H})`);
  }
  const vol = w * d * h;
  const measure = measureRaw === undefined ? vol : Number(measureRaw);
  if (measure < 1 || measure > vol) {
    throw new Error(`piece spec '${spec}': measure ${measure} outside 1..volume (${vol})`);
  }
  return { id, seat, x, y, w, d, h, measure };
}

/** Parse a semicolon-joined piece list, auto-assigning ids S1../N1.. . */
export function parsePieceList(text: string, seat: TesserSeat): Piece[] {
  const prefix = seat === 'south' ? 'S' : 'N';
  return text
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((spec, i) => parsePieceString(spec, seat, `${prefix}${i + 1}`));
}

function overlaps(a: Pick<Piece, 'x' | 'y' | 'w' | 'd'>, b: Pick<Piece, 'x' | 'y' | 'w' | 'd'>): boolean {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0;
}

/** Throws when any two footprints (across both sides) overlap. */
function assertNoOverlap(pieces: Piece[]): void {
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      if (overlaps(pieces[i], pieces[j])) {
        throw new Error(`pieces '${pieces[i].id}' and '${pieces[j].id}' overlap`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CSV parsing (pebble parsePuzzleCsv pattern: parseContentCsv + per-record
// schema validation, all failures collected as warnings, never thrown).

export function parseCampaignCsv(text: string): { missions: Mission[]; warnings: string[] } {
  const parsed = parseContentCsv(text, {
    // The 'int' pseudo-model: natural keys are just decimal strings.
    resolveFk: (type, key) => {
      if (type === 'int') return Number(key);
      throw new Error(`unknown fk type '${type}'`);
    },
  });
  const missions: Mission[] = [];
  const warnings = [...parsed.warnings];
  for (const record of parsed.records) {
    if (record.type !== 'mission') {
      warnings.push(`unexpected record type '${record.type}'`);
      continue;
    }
    const f = record.fields;
    let candidate: unknown;
    try {
      candidate = {
        id: f.id,
        name: f.name,
        brief: f.brief,
        plyCap: f.plyCap,
        south: parsePieceList(String(f.south ?? ''), 'south'),
        north: parsePieceList(String(f.north ?? ''), 'north'),
      };
      assertNoOverlap([
        ...(candidate as { south: Piece[]; north: Piece[] }).south,
        ...(candidate as { south: Piece[]; north: Piece[] }).north,
      ]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      warnings.push(`mission '${String(f.id ?? '?')}' rejected: ${detail}`);
      continue;
    }
    const result = missionSchema.safeParse(candidate);
    if (result.success) missions.push(result.data);
    else warnings.push(`mission failed schema: ${result.error.message}`);
  }
  return { missions, warnings };
}

// ---------------------------------------------------------------------------
// Content definition with seams (SPEC: unique ids, both sides non-empty, no
// overlapping footprints across both sides, 1 ≤ measure ≤ volume, plyCap ≥ 2).

export const campaignContent = (fixtures: Mission[]) =>
  defineContent({
    name: 'tesser-campaign',
    schema: missionSchema,
    fixtures,
    seams: [
      {
        name: 'unique-ids',
        check: (items: Mission[]) => {
          const ids = new Set(items.map((m) => m.id));
          if (ids.size !== items.length) throw new Error('duplicate mission ids');
        },
      },
      {
        name: 'sides-nonempty',
        check: (items: Mission[]) => {
          for (const m of items) {
            if (m.south.length === 0 || m.north.length === 0) {
              throw new Error(`mission '${m.id}': both sides must field at least one piece`);
            }
          }
        },
      },
      {
        name: 'no-overlapping-footprints',
        check: (items: Mission[]) => {
          for (const m of items) {
            try {
              assertNoOverlap([...m.south, ...m.north]);
            } catch (err) {
              throw new Error(`mission '${m.id}': ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        },
      },
      {
        name: 'measure-within-volume',
        check: (items: Mission[]) => {
          for (const m of items) {
            for (const p of [...m.south, ...m.north]) {
              if (p.measure < 1 || p.measure > volume(p)) {
                throw new Error(`mission '${m.id}' piece '${p.id}': measure ${p.measure} outside 1..${volume(p)}`);
              }
            }
          }
        },
      },
      {
        name: 'plyCap-at-least-2',
        check: (items: Mission[]) => {
          for (const m of items) {
            if (m.plyCap < 2) throw new Error(`mission '${m.id}': plyCap ${m.plyCap} < 2`);
          }
        },
      },
    ],
  });

// ---------------------------------------------------------------------------
// Verifier.

/**
 * Verification search budget: depth 3 with NO node cap, unlike
 * TESSER_MINIMAX_BUDGET (depth 3, maxNodes 1500). The node cap exists for
 * long lab series, but here it is actively harmful: when the cap trips
 * mid-root, unscored root actions are dropped, and since orderTesserMoves
 * ranks every fold before every move, a capped search can return a fold-only
 * root — the bot then shuffles in place and never advances. Uncapped depth-3
 * alpha-beta is deterministic, sees a "move, reply, slide-and-strike" kill
 * from the root, and stays fast because mission armies are tiny (missions are
 * authored so total verification time is a few seconds — see puzzles.test.ts).
 */
export const TESSER_VERIFY_BUDGET: SearchBudget = { depth: 3 };

/** All of a mission's pieces in engine order (south first, then north). */
export function missionPieces(mission: Mission): Piece[] {
  return [...mission.south, ...mission.north].map((p) => ({ ...p }));
}

/** Engine config for a mission: SOUTH always moves first (the mission player). */
export function missionConfig(mission: Mission): TesserConfig {
  return { pieces: missionPieces(mission), plyCap: mission.plyCap, firstToAct: 'south' };
}

/** Adapt an AiBot (ctx-object choose) to runMatch's positional Policy. */
function botPolicy(name: string): Policy<TesserState, TesserAction> {
  const bot = tesserMinimaxBot(TESSER_VERIFY_BUDGET, name);
  return { choose: (view, seat, legal, rng) => bot.choose({ view, seat, legal, rng }) };
}

/**
 * Play the mission out with tesserMinimaxBot on BOTH seats (fresh bots per
 * playout so transposition tables never leak between missions or seeds) and
 * report whether south wins by elimination within the mission's plyCap. The
 * game's own terminal() enforces plyCap → adjudication, so any stall or
 * timeout fails the 'elimination' reason check.
 */
export function missionSolvedByBot(mission: Mission, seed: number): boolean {
  const transcript = runMatch(tesser, missionConfig(mission), seed, {
    south: botPolicy('verify-south'),
    north: botPolicy('verify-north'),
  });
  return transcript.result.winner === 'south' && transcript.result.reason === 'elimination';
}

export const missionVerifier = defineVerifier<Mission>({
  name: 'tesser-mission-verifier',
  checks: [
    notPreSolved({
      isSolved: (m) => tesser.terminal(tesser.init(missionConfig(m), mulberry32(0))) !== null,
    }),
    solvable({
      seeds: [1, 2, 3],
      solver: (m, seed) => missionSolvedByBot(m, seed),
    }),
  ],
});
