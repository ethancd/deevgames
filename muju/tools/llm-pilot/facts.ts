/**
 * Per-game fact sheets, computed mechanically from the public room history (never from prose).
 *
 * Why: in wave 1 the digest was assembled by hand and reflections misquoted revisions and mined
 * totals often enough that the playbook grew a "record inconsistencies" list. A fact sheet gives the
 * reflecting player true numbers to cite, lets the publisher/curator trust facts over prose, and
 * generates the digest's outcome table.
 *
 * - `computeFacts(history, manifest)` is pure: history entries (`GET /api/muju/rooms/<id>/history`,
 *   entry types in src/game/moveHistory.ts) + the game's manifest.json → `GameFacts`.
 * - Mined total (the kill-clock definition, src/game/inactivity.ts#minedTotal): every crystal a side's
 *   units ever mined, plus Black's handicap; spending, upkeep, releases and refunds never reduce it.
 * - Kill clock: after every hand-off the count is 0 if that turn contained a kill, else one more than
 *   before; ten ends the game on mined totals (src/game/turn.ts#handOffTurn).
 * - A "turn" is one side's (player, turnNumber); its revision is the last revision holding its own
 *   entries (the hand-off). `summoning` entries belong to the incoming turn but are recorded at the
 *   previous hand-off, so they count toward their owner's disruptions, not toward turn membership.
 * - A pass turn has no move, attack, purchase or promotion.
 *
 * CLI (from muju/; GET only, sequential, ≤ 2 req/s):
 *   node --import tsx tools/llm-pilot/facts.ts --game <gameDir> [--out-dir <dir>]
 *       writes facts.json + facts.md to --out-dir (default: the game dir)
 *   node --import tsx tools/llm-pilot/facts.ts --campaign <waveDir> [--out <file>] [--cache-dir <dir>] [--refresh]
 *       prints the digest outcome table for every finished game. Reuses `<gameDir>/facts.json` or
 *       `<cacheDir>/<gameId>.facts.json` when present; writes only to --out / --cache-dir, never into
 *       the campaign's game dirs.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MoveHistoryEntry } from '../../src/game/moveHistory';
import type { PlayerId } from '../../src/game/types';

export const FACTS_VERSION = 1;
export const KILL_CLOCK_LIMIT = 10;
export const GAP_THRESHOLD = 20;
const DEFAULT_SERVER_URL = 'https://deevgames-muju.onrender.com';

/** The manifest.json fields facts need (dispatch.ts#prepareGame / finishGame write them). */
export interface FactsManifest {
  gameId: string;
  roomId: string;
  llmSeat: PlayerId;
  engineSeat?: PlayerId;
  blackCrystalHandicap?: number;
  model?: string; cliModel?: string; effort?: string; toolTier?: string; displayName?: string;
  timeControl?: { delaySeconds: number; bankSeconds: number };
  watchUrl?: string; startedAt?: string; label?: string;
}
export interface HistoryPage { roomId?: string; revision: number; total?: number; entries: MoveHistoryEntry[] }

export interface SideFacts {
  role: 'llm' | 'hard';
  turns: number;
  mined: number;
  attacks: number;
  kills: number;
  zeroDamageAttacks: number;
  zeroDamageRevisions: number[];
  promotions: number;
  promotionRevisions: number[];
  buys: number;
  buysByClass: Record<string, number>;
  crystalsSpentOnBuys: number;
  crystalsSpentOnPromotions: number;
  disruptedSummons: number;
  refunded: number;
  passTurns: number;
  passRevisions: number[];
  upkeepReleases: number;
  upkeepPaid: number;
}
export interface TurnFacts {
  player: PlayerId; turnNumber: number; revision: number;
  /** Cumulative mined totals (handicap included) after this turn's mining. */
  white: number; black: number;
  kill: boolean; pass: boolean;
  /** Kill-clock count after this turn's hand-off (null for a final turn that never handed off). */
  killClock: number | null;
  /** Wall time from the previous hand-off (or admission, for ply 1) to this turn's last entry. */
  elapsedMs: number | null;
}
export interface KillFacts {
  revision: number; turnNumber: number; killer: PlayerId; attacker: string; victim: string;
  /** Mined totals at the moment of the kill (before the killer's own end-of-turn mining). */
  white: number; black: number; leader: PlayerId | null;
  /** Kill-clock count this kill reset (plies since the previous kill's turn). */
  clockBefore: number;
}
export interface GameFacts {
  factsVersion: number;
  computedAt: string;
  identity: {
    gameId: string; roomId: string; label?: string;
    model: string | null; cliModel: string | null; displayName: string | null; effort: string | null; tier: string | null;
    llmSeat: PlayerId; engineSeat: PlayerId; handicap: number;
    clock: { delaySeconds: number; bankSeconds: number } | null;
    finalRevision: number; historyEntries: number;
    result: 'win' | 'loss' | 'draw' | 'unfinished'; winner: PlayerId | null; victoryReason: string | null;
    llmTurns: number; hardTurns: number;
    startedAt: string | null; endedAt: string | null;
  };
  mined: {
    white: number; black: number; handicap: number; llm: number; hard: number;
    /** First turn end where |white − black| > GAP_THRESHOLD. */
    firstGap: { threshold: number; revision: number; turnNumber: number; leader: PlayerId; white: number; black: number } | null;
    maxGap: { revision: number; leader: PlayerId; gap: number } | null;
    leadChanges: number;
  };
  killClock: {
    limit: number; final: number | null; longestQuiet: { plies: number; fromRevision: number; toRevision: number } | null;
    kills: KillFacts[];
  };
  sides: Record<PlayerId, SideFacts>;
  turns: TurnFacts[];
  timing: {
    note: string;
    llm: { medianS: number | null; maxS: number | null; totalS: number; estBankUsedS: number | null; slowest: Array<{ revision: number; turnNumber: number; seconds: number }> };
    hard: { medianS: number | null; maxS: number | null; totalS: number };
  };
  /** Mechanical self-checks; a false one means the history or this code disagrees with the rules. */
  checks: Record<string, boolean>;
}

const ACTION_KINDS = new Set(['move', 'attack', 'purchase', 'promotion']);
const other = (p: PlayerId): PlayerId => (p === 'white' ? 'black' : 'white');
const leaderOf = (white: number, black: number): PlayerId | null => (white > black ? 'white' : black > white ? 'black' : null);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const secs = (ms: number) => Math.round(ms / 100) / 10;
function emptySide(role: SideFacts['role']): SideFacts {
  return { role, turns: 0, mined: 0, attacks: 0, kills: 0, zeroDamageAttacks: 0, zeroDamageRevisions: [], promotions: 0, promotionRevisions: [],
    buys: 0, buysByClass: {}, crystalsSpentOnBuys: 0, crystalsSpentOnPromotions: 0, disruptedSummons: 0, refunded: 0,
    passTurns: 0, passRevisions: [], upkeepReleases: 0, upkeepPaid: 0 };
}

/** Pure: room history (all live entries, any order) + manifest → facts. */
export function computeFacts(history: HistoryPage, manifest: FactsManifest, now = new Date()): GameFacts {
  const entries = [...history.entries].filter(e => e.undoneAtRevision == null).sort((a, b) => a.sequence - b.sequence);
  const llmSeat = manifest.llmSeat, engineSeat = manifest.engineSeat ?? other(llmSeat);
  const handicap = manifest.blackCrystalHandicap ?? 0;
  const sides: Record<PlayerId, SideFacts> = { white: emptySide(llmSeat === 'white' ? 'llm' : 'hard'), black: emptySide(llmSeat === 'black' ? 'llm' : 'hard') };
  const mined: Record<PlayerId, number> = { white: 0, black: handicap };

  // Turns in order of first appearance (summoning/result entries excluded from membership).
  interface Acc { player: PlayerId; turnNumber: number; revision: number; lastTs: number; kill: boolean; acted: boolean; handedOffMining: boolean; white: number; black: number }
  const turns: Acc[] = [];
  const byKey = new Map<string, Acc>();
  const kills: KillFacts[] = [];
  let result: Extract<MoveHistoryEntry, { kind: 'result' }> | undefined;
  let clock = 0; // running kill-clock count at the last hand-off
  const handOff = (turn: Acc) => { clock = turn.kill ? 0 : clock + 1; return clock; };
  const clockAfter = new Map<Acc, number>();

  for (const e of entries) {
    if (e.kind === 'result') { result = e; continue; }
    if (e.kind === 'summoning') {
      const s = sides[e.player];
      s.disruptedSummons += e.disrupted.length; s.refunded += e.refunded;
      continue;
    }
    const key = `${e.player}:${e.turnNumber}`;
    let turn = byKey.get(key);
    if (!turn) {
      // A new turn starts: the previous turn handed off (its kill-clock count is now settled).
      const prev = turns.at(-1);
      if (prev) clockAfter.set(prev, handOff(prev));
      turn = { player: e.player, turnNumber: e.turnNumber, revision: e.revision, lastTs: 0, kill: false, acted: false, handedOffMining: false, white: mined.white, black: mined.black };
      byKey.set(key, turn); turns.push(turn);
    }
    turn.revision = Math.max(turn.revision, e.revision);
    turn.lastTs = Math.max(turn.lastTs, Date.parse(e.timestamp));
    if (ACTION_KINDS.has(e.kind)) turn.acted = true;
    const side = sides[e.player];
    switch (e.kind) {
      case 'attack': {
        side.attacks += 1;
        if (e.killed) {
          side.kills += 1; turn.kill = true;
          kills.push({ revision: e.revision, turnNumber: e.turnNumber, killer: e.player, attacker: `${e.unit.symbol}@${e.unit.square}`,
            victim: `${e.target.symbol}@${e.target.square}`, white: mined.white, black: mined.black, leader: leaderOf(mined.white, mined.black),
            clockBefore: clock });
        } else if (e.defenseAfter >= e.defenseBefore) { side.zeroDamageAttacks += 1; side.zeroDamageRevisions.push(e.revision); }
        break;
      }
      case 'purchase':
        side.buys += 1; side.crystalsSpentOnBuys += e.cost;
        side.buysByClass[e.unit.definitionId] = (side.buysByClass[e.unit.definitionId] ?? 0) + 1;
        break;
      case 'promotion':
        side.promotions += 1; side.promotionRevisions.push(e.revision); side.crystalsSpentOnPromotions += e.cost;
        break;
      case 'upkeep':
        side.upkeepReleases += e.released.length; side.upkeepPaid += e.paid;
        break;
      case 'mining':
        mined[e.player] += e.total; turn.handedOffMining = true;
        break;
      default: break;
    }
    turn.white = mined.white; turn.black = mined.black;
  }
  // The last turn handed off only if the game ended on the clock at that hand-off (or never ended).
  const last = turns.at(-1);
  if (last && (!result || result.reason === 'kill-clock')) clockAfter.set(last, handOff(last));

  // Per-turn records, pass turns, timing.
  const startedMs = manifest.startedAt ? Date.parse(manifest.startedAt) : NaN;
  const turnFacts: TurnFacts[] = turns.map((t, i) => {
    const prevTs = i === 0 ? startedMs : turns[i - 1].lastTs;
    const elapsedMs = Number.isFinite(prevTs) && t.lastTs >= prevTs ? t.lastTs - prevTs : null;
    const pass = !t.acted;
    const side = sides[t.player];
    side.turns += 1;
    if (pass) { side.passTurns += 1; side.passRevisions.push(t.revision); }
    return { player: t.player, turnNumber: t.turnNumber, revision: t.revision, white: t.white, black: t.black, kill: t.kill, pass,
      killClock: clockAfter.get(t) ?? null, elapsedMs };
  });
  sides.white.mined = mined.white; sides.black.mined = mined.black;

  // Gap / lead facts at every turn end.
  let firstGap: GameFacts['mined']['firstGap'] = null, maxGap: GameFacts['mined']['maxGap'] = null, leadChanges = 0;
  let lastLeader: PlayerId | null = null;
  for (const t of turnFacts) {
    const leader = leaderOf(t.white, t.black), gap = Math.abs(t.white - t.black);
    if (leader && lastLeader && leader !== lastLeader) leadChanges += 1;
    if (leader) lastLeader = leader;
    if (!firstGap && leader && gap > GAP_THRESHOLD) firstGap = { threshold: GAP_THRESHOLD, revision: t.revision, turnNumber: t.turnNumber, leader, white: t.white, black: t.black };
    if (leader && (!maxGap || gap > maxGap.gap)) maxGap = { revision: t.revision, leader, gap };
  }
  // Longest kill-free stretch (in plies), from the kill-clock counts.
  let longestQuiet: GameFacts['killClock']['longestQuiet'] = null;
  let runStart: number | null = null;
  for (const t of turnFacts) {
    if (t.killClock === null) continue;
    if (t.killClock === 0) { runStart = null; continue; }
    if (t.killClock === 1) runStart = t.revision;
    if (!longestQuiet || t.killClock > longestQuiet.plies) longestQuiet = { plies: t.killClock, fromRevision: runStart ?? t.revision, toRevision: t.revision };
  }

  const llmElapsed = turnFacts.filter(t => t.player === llmSeat && t.elapsedMs !== null).map(t => ({ t, ms: t.elapsedMs! }));
  const hardElapsed = turnFacts.filter(t => t.player === engineSeat && t.elapsedMs !== null).map(t => t.elapsedMs!);
  const delayMs = manifest.timeControl ? manifest.timeControl.delaySeconds * 1000 : null;
  const finalRevision = Math.max(history.revision ?? 0, ...entries.map(e => e.revision));
  const winner = result ? result.winner : null;
  const llmResult: GameFacts['identity']['result'] = !result ? 'unfinished' : winner === null ? 'draw' : winner === llmSeat ? 'win' : 'loss';
  const lastClock = [...turnFacts].reverse().find(t => t.killClock !== null)?.killClock ?? null;

  const checks: Record<string, boolean> = {
    killClockEndingReachesLimit: result?.reason !== 'kill-clock' || lastClock === KILL_CLOCK_LIMIT,
    killClockWinnerHasHigherMinedTotal: result?.reason !== 'kill-clock' || winner === leaderOf(mined.white, mined.black),
    noClockAboveLimit: turnFacts.every(t => (t.killClock ?? 0) <= KILL_CLOCK_LIMIT),
    turnsAlternate: turnFacts.every((t, i) => i === 0 || t.player !== turnFacts[i - 1].player),
    everyHandedOffTurnMined: turns.every(t => t === last || t.handedOffMining),
  };

  return {
    factsVersion: FACTS_VERSION,
    computedAt: now.toISOString(),
    identity: {
      gameId: manifest.gameId, roomId: manifest.roomId, ...(manifest.label ? { label: manifest.label } : {}),
      model: manifest.model ?? null, cliModel: manifest.cliModel ?? null, displayName: manifest.displayName ?? null,
      effort: manifest.effort ?? null, tier: manifest.toolTier ?? null, llmSeat, engineSeat, handicap,
      clock: manifest.timeControl ?? null, finalRevision, historyEntries: history.total ?? entries.length,
      result: llmResult, winner, victoryReason: result?.reason ?? null,
      llmTurns: sides[llmSeat].turns, hardTurns: sides[engineSeat].turns,
      startedAt: manifest.startedAt ?? null, endedAt: entries.length ? entries.at(-1)!.timestamp : null,
    },
    mined: { white: mined.white, black: mined.black, handicap, llm: mined[llmSeat], hard: mined[engineSeat], firstGap, maxGap, leadChanges },
    killClock: { limit: KILL_CLOCK_LIMIT, final: lastClock, longestQuiet, kills },
    sides,
    turns: turnFacts,
    timing: {
      note: 'From history timestamps: a turn runs from the previous hand-off (ply 1: room admission) to its own last entry; server-side, so it includes network latency. Bank use is estimated as time beyond the free delay per turn.',
      llm: {
        medianS: median(llmElapsed.map(x => x.ms)) === null ? null : secs(median(llmElapsed.map(x => x.ms))!),
        maxS: llmElapsed.length ? secs(Math.max(...llmElapsed.map(x => x.ms))) : null,
        totalS: secs(llmElapsed.reduce((n, x) => n + x.ms, 0)),
        estBankUsedS: delayMs === null ? null : secs(llmElapsed.reduce((n, x) => n + Math.max(0, x.ms - delayMs), 0)),
        slowest: [...llmElapsed].sort((a, b) => b.ms - a.ms).slice(0, 3).map(x => ({ revision: x.t.revision, turnNumber: x.t.turnNumber, seconds: secs(x.ms) })),
      },
      hard: {
        medianS: median(hardElapsed) === null ? null : secs(median(hardElapsed)!),
        maxS: hardElapsed.length ? secs(Math.max(...hardElapsed)) : null,
        totalS: secs(hardElapsed.reduce((n, x) => n + x, 0)),
      },
    },
    checks,
  };
}

// ---------------------------------------------------------------------------
// Compact summary (publisher's experience record) and Markdown sheet
// ---------------------------------------------------------------------------
export interface FactsSummary {
  factsVersion: number; finalRevision: number; result: string; victoryReason: string | null; llmTurns: number;
  minedLlm: number; minedHard: number; handicap: number;
  attacks: { llm: number; hard: number }; kills: { llm: number; hard: number }; promotions: { llm: number; hard: number };
  buys: { llm: number; hard: number }; passTurns: { llm: number; hard: number }; disruptedSummons: { llm: number; hard: number };
  firstGapRevision: number | null; firstGapLeader: 'llm' | 'hard' | null; lastKillRevision: number | null;
  slowestLlmTurn: { revision: number; seconds: number } | null;
}
export function summarizeFacts(f: GameFacts): FactsSummary {
  const llm = f.sides[f.identity.llmSeat], hard = f.sides[f.identity.engineSeat];
  const pair = (k: 'attacks' | 'kills' | 'promotions' | 'buys' | 'passTurns' | 'disruptedSummons') => ({ llm: llm[k], hard: hard[k] });
  const role = (p: PlayerId | undefined) => (p === undefined ? null : p === f.identity.llmSeat ? 'llm' as const : 'hard' as const);
  const slow = f.timing.llm.slowest[0];
  return {
    factsVersion: f.factsVersion, finalRevision: f.identity.finalRevision, result: f.identity.result, victoryReason: f.identity.victoryReason,
    llmTurns: f.identity.llmTurns, minedLlm: f.mined.llm, minedHard: f.mined.hard, handicap: f.mined.handicap,
    attacks: pair('attacks'), kills: pair('kills'), promotions: pair('promotions'), buys: pair('buys'), passTurns: pair('passTurns'),
    disruptedSummons: pair('disruptedSummons'),
    firstGapRevision: f.mined.firstGap?.revision ?? null, firstGapLeader: role(f.mined.firstGap?.leader),
    lastKillRevision: f.killClock.kills.at(-1)?.revision ?? null,
    slowestLlmTurn: slow ? { revision: slow.revision, seconds: slow.seconds } : null,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function revList(revs: number[], max = 8): string {
  if (!revs.length) return '—';
  return revs.slice(0, max).map(r => `r${r}`).join(', ') + (revs.length > max ? `, … (+${revs.length - max})` : '');
}
function classList(byClass: Record<string, number>): string {
  const parts = Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
  return parts.length ? parts.join(', ') : '—';
}
/** Compact Markdown (≤ ~60 lines) for the reflecting player and the operator. */
export function renderFactsMarkdown(f: GameFacts): string {
  const id = f.identity, L = id.llmSeat;
  const who = (p: PlayerId) => `${cap(p)} (${p === L ? 'you/LLM' : 'Hard'})`;
  const lines: string[] = [];
  lines.push(`# Fact sheet — ${id.gameId}`);
  lines.push('Computed mechanically from the room history. Where your memory disagrees with this sheet, the sheet is right.');
  lines.push('');
  lines.push(`- Room ${id.roomId}, final revision r${id.finalRevision}; ${id.displayName ?? id.model ?? '?'} (${id.tier ?? '?'}), LLM ${cap(L)}, Black +${id.handicap}${id.clock ? `, clock ${id.clock.delaySeconds}/${id.clock.bankSeconds}` : ''}`);
  lines.push(`- Result: LLM **${id.result.toUpperCase()}** — ${id.victoryReason ?? 'no result yet'}${id.winner ? ` (${cap(id.winner)} wins)` : ''}; turns LLM ${id.llmTurns}, Hard ${id.hardTurns}`);
  lines.push(`- Mined totals (every crystal mined + Black's handicap; spending never reduces them): White ${f.mined.white} v Black ${f.mined.black}${id.handicap ? ` (${f.mined.black - id.handicap} + ${id.handicap})` : ''}`);
  lines.push(`- First mined gap > ${GAP_THRESHOLD}: ${f.mined.firstGap ? `r${f.mined.firstGap.revision} (turn ${f.mined.firstGap.turnNumber}), ${who(f.mined.firstGap.leader)} leads ${f.mined.firstGap.white} v ${f.mined.firstGap.black}` : 'never'}; lead changes ${f.mined.leadChanges}`);
  lines.push('');
  lines.push(`| | ${who('white')} | ${who('black')} |`);
  lines.push('|---|---|---|');
  const row = (label: string, fn: (s: SideFacts) => string | number) => lines.push(`| ${label} | ${fn(f.sides.white)} | ${fn(f.sides.black)} |`);
  row('Turns', s => s.turns);
  row('Mined', s => s.mined);
  row('Attacks / kills', s => `${s.attacks} / ${s.kills}`);
  row('Zero-damage attacks', s => s.zeroDamageAttacks ? `${s.zeroDamageAttacks} (${revList(s.zeroDamageRevisions, 5)})` : '0');
  row('Promotions', s => s.promotions ? `${s.promotions} (${revList(s.promotionRevisions, 5)})` : '0');
  row('Buys', s => `${s.buys} (${s.crystalsSpentOnBuys} ◆)`);
  row('Buys by class', s => classList(s.buysByClass));
  row('Summons disrupted (refund)', s => `${s.disruptedSummons} (${s.refunded} ◆)`);
  row('Pass turns', s => s.passTurns ? `${s.passTurns} (${revList(s.passRevisions, 5)})` : '0');
  row('Upkeep releases', s => s.upkeepReleases);
  lines.push('');
  const kc = f.killClock;
  lines.push(`## Kill clock (limit ${kc.limit} plies; only a kill resets it)`);
  lines.push(`Final count ${kc.final ?? '?'}; ${kc.kills.length} kill(s)${kc.longestQuiet ? `; longest quiet stretch ${kc.longestQuiet.plies} plies (r${kc.longestQuiet.fromRevision}–r${kc.longestQuiet.toRevision})` : ''}.`);
  if (kc.kills.length) {
    const shown = kc.kills.length > 10 ? [...kc.kills.slice(0, 5), ...kc.kills.slice(-5)] : kc.kills;
    lines.push('');
    lines.push('| r | Turn | Killer | Attacker × victim | Clock reset from | Mined W v B (leader) |');
    lines.push('|---:|---:|---|---|---:|---|');
    shown.forEach((k, i) => {
      if (kc.kills.length > 10 && i === 5) lines.push(`| … | | ${kc.kills.length - 10} more kills in facts.json | | | |`);
      lines.push(`| ${k.revision} | ${k.turnNumber} | ${cap(k.killer)} | ${k.attacker} × ${k.victim} | ${k.clockBefore} | ${k.white} v ${k.black} (${k.leader ? cap(k.leader) : 'tied'}) |`);
    });
  }
  lines.push('');
  lines.push('## Mined totals and kill clock at turn ends');
  // At most 12 evenly spaced turn ends (always the last); every turn end is in facts.json.
  const all = f.turns, rows = Math.min(12, all.length);
  const sample = [...new Set(Array.from({ length: rows }, (_, i) => Math.round(((i + 1) * all.length) / rows) - 1))].map(i => all[i]);
  lines.push(`| r | Turn | Side | White | Black | Clock |${rows < all.length ? ` (${rows} of ${all.length} turn ends)` : ''}`);
  lines.push('|---:|---:|---|---:|---:|---:|');
  for (const t of sample) lines.push(`| ${t.revision} | ${t.turnNumber} | ${cap(t.player)}${t.pass ? ' (pass)' : ''}${t.kill ? ' (kill)' : ''} | ${t.white} | ${t.black} | ${t.killClock ?? '—'} |`);
  lines.push('');
  const tl = f.timing.llm;
  lines.push(`## Time (history timestamps; approximate)`);
  lines.push(`LLM per turn: median ${tl.medianS ?? '?'}s, max ${tl.maxS ?? '?'}s, est. bank used ${tl.estBankUsedS ?? '?'}s. Slowest: ${tl.slowest.map(s => `r${s.revision} ${s.seconds}s`).join(', ') || '—'}. Hard median ${f.timing.hard.medianS ?? '?'}s.`);
  const failed = Object.entries(f.checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) lines.push(`\nSelf-check FAILED: ${failed.join(', ')} (report to the operator; trust facts.json cautiously).`);
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// Fetching (GET only, sequential, paced) and file output
// ---------------------------------------------------------------------------
export type HistoryRequest = <T>(path: string) => Promise<T>;
/** A paced (≤ 2 req/s), retrying GET client built on the gateway's HTTP client; share ONE per process. */
export async function historyClient(serverUrl = process.env.MUJU_SERVER_URL ?? DEFAULT_SERVER_URL, minIntervalMs = 500): Promise<HistoryRequest> {
  const { createHttpClient } = await import('./gateway');
  const request = createHttpClient(serverUrl, () => {}, minIntervalMs);
  return <T>(p: string) => request<T>(p, undefined, undefined, undefined, 20_000);
}
/** Every live history entry of a room, paginated by sequence (limit ≤ 200, server/schema.ts). */
export async function fetchRoomHistory(request: HistoryRequest, roomId: string): Promise<HistoryPage> {
  const entries: MoveHistoryEntry[] = [];
  let after = 0, revision = 0, total = 0;
  for (let page = 0; page < 1000; page++) {
    const data = await request<{ roomId: string; revision: number; total: number; hasLater: boolean; entries: MoveHistoryEntry[] }>(`/${roomId}/history?after=${after}&limit=200`);
    revision = data.revision; total = data.total;
    entries.push(...data.entries);
    if (!data.hasLater || data.entries.length === 0) break;
    after = data.entries.at(-1)!.sequence;
  }
  return { roomId, revision, total, entries };
}
function serverUrlFor(manifest: FactsManifest & { watchUrl?: string }): string {
  if (process.env.MUJU_SERVER_URL) return process.env.MUJU_SERVER_URL;
  try { if (manifest.watchUrl) return new URL(manifest.watchUrl).origin; } catch { /* fall through */ }
  return DEFAULT_SERVER_URL;
}
export function readManifest(gameDir: string): FactsManifest {
  return JSON.parse(readFileSync(path.join(gameDir, 'manifest.json'), 'utf8')) as FactsManifest;
}
export function writeFactsFiles(outDir: string, facts: GameFacts): { json: string; md: string } {
  mkdirSync(outDir, { recursive: true });
  const json = path.join(outDir, 'facts.json'), md = path.join(outDir, 'facts.md');
  writeFileSync(json, `${JSON.stringify(facts, null, 2)}\n`);
  writeFileSync(md, renderFactsMarkdown(facts));
  return { json, md };
}
/** Fetches the history, computes facts and writes facts.json/facts.md into `outDir` (default the game dir). */
export async function writeGameFacts(gameDir: string, opts: { outDir?: string; request?: HistoryRequest } = {}): Promise<GameFacts> {
  const manifest = readManifest(gameDir);
  if (!manifest.roomId || !manifest.llmSeat) throw new Error(`${gameDir}/manifest.json has no roomId/llmSeat; cannot compute facts.`);
  const request = opts.request ?? await historyClient(serverUrlFor(manifest));
  const facts = computeFacts(await fetchRoomHistory(request, manifest.roomId), manifest);
  writeFactsFiles(opts.outDir ?? gameDir, facts);
  return facts;
}
/** Harness hook at the play→reflect transition: writes the fact sheet to the game dir and copies
 * facts.md into the player's workspace. Never throws — a failure is logged to
 * `<gameDir>/player/facts.log` and the reflection proceeds without a sheet. */
export async function prepareReflectionFacts(gameDir: string, workspace: string, opts: { request?: HistoryRequest } = {}): Promise<boolean> {
  try {
    let facts: GameFacts | undefined;
    const existing = path.join(gameDir, 'facts.json');
    if (existsSync(existing)) {
      const cached = JSON.parse(readFileSync(existing, 'utf8')) as GameFacts;
      if (cached.factsVersion === FACTS_VERSION && cached.identity.result !== 'unfinished') facts = cached;
    }
    facts ??= await writeGameFacts(gameDir, opts);
    if (!existsSync(path.join(gameDir, 'facts.md'))) writeFactsFiles(gameDir, facts);
    copyFileSync(path.join(gameDir, 'facts.md'), path.join(workspace, 'facts.md'));
    return true;
  } catch (error) {
    try {
      mkdirSync(path.join(gameDir, 'player'), { recursive: true });
      writeFileSync(path.join(gameDir, 'player', 'facts.log'), `${new Date().toISOString()} fact sheet failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`, { flag: 'a' });
    } catch { /* logging must not break the reflection either */ }
    return false;
  }
}
/** The publisher's compact `facts` field: reuses `<gameDir>/facts.json`, else computes it (network).
 * Returns undefined (never throws) when neither works. */
export async function factsSummaryFor(gameDir: string, opts: { request?: HistoryRequest } = {}): Promise<FactsSummary | undefined> {
  try {
    const file = path.join(gameDir, 'facts.json');
    let facts = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as GameFacts : undefined;
    if (!facts || facts.factsVersion !== FACTS_VERSION || facts.identity.result === 'unfinished') facts = await writeGameFacts(gameDir, opts);
    return summarizeFacts(facts);
  } catch { return undefined; }
}

// ---------------------------------------------------------------------------
// Campaign digest table
// ---------------------------------------------------------------------------
export const OUTCOME_HEADER = '| Game | Player | Tier | Black + | LLM seat | Clock | Result | How | LLM turns | Hard atk / promo / pass | Mined LLM v Hard | Final r | Kills LLM / Hard |';
export function outcomeRow(f: GameFacts): string {
  const id = f.identity, hard = f.sides[id.engineSeat], llm = f.sides[id.llmSeat];
  const result = id.result === 'win' ? '**WIN**' : id.result;
  const clock = id.clock ? `${id.clock.delaySeconds}/${id.clock.bankSeconds}` : '?';
  const bad = Object.values(f.checks).some(ok => !ok) ? ' ⚠' : '';
  return `| ${id.gameId} | ${id.displayName ?? id.model ?? '?'} | ${id.tier ?? '?'} | ${id.handicap} | ${id.llmSeat} | ${clock} | ${result} | ${id.victoryReason ?? '?'} | ${id.llmTurns} | ${hard.attacks} / ${hard.promotions} / ${hard.passTurns} | ${f.mined.llm} v ${f.mined.hard} | ${id.finalRevision} | ${llm.kills} / ${hard.kills}${bad} |`;
}
export function outcomeTable(all: GameFacts[]): string {
  const rows = [...all].sort((a, b) => a.identity.gameId.localeCompare(b.identity.gameId));
  const wins = rows.filter(f => f.identity.result === 'win').length;
  return [OUTCOME_HEADER, '|---|---|---|---:|---|---|---|---|---:|---|---|---:|---|', ...rows.map(outcomeRow), '',
    `${rows.length} games: LLM ${wins} wins, ${rows.filter(f => f.identity.result === 'loss').length} losses, ${rows.filter(f => f.identity.result === 'draw').length} draws.`].join('\n');
}
async function campaignFacts(waveDir: string, opts: { cacheDir?: string; refresh?: boolean }): Promise<GameFacts[]> {
  const gamesDir = path.join(waveDir, 'games');
  const out: GameFacts[] = [];
  let request: HistoryRequest | undefined;
  for (const gameId of readdirSync(gamesDir).sort()) {
    const dir = path.join(gamesDir, gameId);
    const manifestFile = path.join(dir, 'manifest.json');
    if (!existsSync(manifestFile)) continue;
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as FactsManifest & { result?: string; finishedAt?: string };
    if (!manifest.finishedAt && !manifest.result) continue; // not finished
    const cachePaths = [path.join(dir, 'facts.json'), ...(opts.cacheDir ? [path.join(opts.cacheDir, `${gameId}.facts.json`)] : [])];
    let facts: GameFacts | undefined;
    if (!opts.refresh) {
      for (const p of cachePaths) {
        if (!existsSync(p)) continue;
        const cached = JSON.parse(readFileSync(p, 'utf8')) as GameFacts;
        if (cached.factsVersion === FACTS_VERSION && cached.identity.result !== 'unfinished') { facts = cached; break; }
      }
    }
    if (!facts) {
      request ??= await historyClient(serverUrlFor(manifest));
      facts = computeFacts(await fetchRoomHistory(request, manifest.roomId), manifest);
      if (opts.cacheDir) { mkdirSync(opts.cacheDir, { recursive: true }); writeFileSync(path.join(opts.cacheDir, `${gameId}.facts.json`), `${JSON.stringify(facts, null, 2)}\n`); }
      process.stderr.write(`computed ${gameId} (r${facts.identity.finalRevision})\n`);
    }
    out.push(facts);
  }
  return out;
}

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
async function cli(argv: string[]): Promise<void> {
  const game = argValue(argv, '--game'), campaign = argValue(argv, '--campaign');
  if (game) {
    const facts = await writeGameFacts(path.resolve(game), { outDir: argValue(argv, '--out-dir') });
    process.stdout.write(renderFactsMarkdown(facts));
    return;
  }
  if (campaign) {
    const table = outcomeTable(await campaignFacts(path.resolve(campaign), { cacheDir: argValue(argv, '--cache-dir'), refresh: argv.includes('--refresh') }));
    const out = argValue(argv, '--out');
    if (out) { writeFileSync(out, `${table}\n`); process.stderr.write(`wrote ${out}\n`); } else process.stdout.write(`${table}\n`);
    return;
  }
  process.stderr.write('usage: facts.ts --game <gameDir> [--out-dir <dir>] | --campaign <waveDir> [--out <file>] [--cache-dir <dir>] [--refresh]\n');
  process.exitCode = 2;
}
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) cli(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
