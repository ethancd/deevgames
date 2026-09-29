import { useEffect, useState } from 'react';
import type { ExplorerPlayer, ExplorerSnapshot } from './types';
import { BlackCrystalHandicap } from '../components/BlackCrystalHandicap';
import { Board } from '../components/Board';
import { getUnitDefinition } from '../game/units';
import { minedTotal } from '../game/inactivity';
import { normalizeServer } from '../online/client';
import './explorer.css';
const models: ExplorerPlayer[] = [{ provider: 'codex', model: 'gpt-6-astra', effort: 'high' }, { provider: 'claude', model: 'claude-opus-5-5', effort: 'high' }];
const names = ['Astra 6 · Codex', 'Opus 5.5 · Claude Code'];
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Explorer() {
  const [query] = useState(() => new URLSearchParams(location.search));
  const [server, setServer] = useState(() => query.get('server') || import.meta.env.VITE_MUJU_SERVER_URL || (location.hostname.endsWith('pages.dev') ? 'https://deevgames-muju.onrender.com' : location.origin));
  const [id, setId] = useState(query.get('experiment') || '');
  const key = (id: string) => `muju-explorer:${normalizeServer(server)}:${id}`;
  const [token, setToken] = useState(() => { try { return id ? localStorage.getItem(key(id)) || '' : ''; } catch { return ''; } });
  const [exp, setExp] = useState<ExplorerSnapshot | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [handicap, setHandicap] = useState(9.5), [maxGames, setMaxGames] = useState(5), [maxPlies, setMaxPlies] = useState(100);
  const [white, setWhite] = useState(0), [black, setBlack] = useState(1), [gameId, setGameId] = useState(''), [cpId, setCpId] = useState('');
  const [selected, setSelected] = useState<string | null>(null), [review, setReview] = useState('');
  const [importText, setImportText] = useState('');
  async function request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${normalizeServer(server)}/api/muju/experiments${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Request failed.'); return result;
  }
  useEffect(() => {
    if (!id) return;
    let active = true, pending = false;
    const refresh = async () => {
      if (pending) return; pending = true;
      try { const result = await request<ExplorerSnapshot>(`/${id}`); if (active) { setExp(result); setError(''); } }
      catch (error) { if (active) setError(error instanceof Error ? error.message : 'Connection failed.'); }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [id, server]);
  async function action(fn: () => Promise<void>) {
    setBusy(true); setError(''); try { await fn(); } catch (error) { setError(error instanceof Error ? error.message : 'Request failed.'); } finally { setBusy(false); }
  }
  const game = exp?.games.find(g => g.id === (gameId || exp.activeGameId));
  const cp = exp?.checkpoints.find(c => c.id === (cpId || game?.checkpoints.at(-1)));
  const state = cp?.state, unit = state?.board.units.find(u => u.id === selected);
  const timeline = game?.checkpoints.map(id => exp!.checkpoints.find(c => c.id === id)!) ?? [];
  const ordinal = exp?.games.findIndex(g => g.id === game?.id) ?? 0;
  const series = (player: 'white' | 'black') => timeline.flatMap((c, i) => c.assessments[player] ? [`${24 + i * 552 / Math.max(1, timeline.length - 1)},${122 - c.assessments[player]!.whiteWin * 100}`] : []).join(' ');
  return <main className="explorer">
    <header className="explorer-header"><a href="/muju/?online=1">← Online Muju</a><span>Research board</span></header>
    <h1>Advantage exhaustion explorer</h1>
    <p className="explorer-intro">Give the losing side another line. Follow the pressure, counterplay, and missed chances across a tree of games.</p>
    {error && <p role="alert" className="explorer-error">{error}</p>}
    {!id ? <form className="explorer-setup" onSubmit={event => { event.preventDefault(); void action(async () => {
      const created = await request<{ experiment: ExplorerSnapshot; token: string }>('', { handicap, maxGames, maxPlies, players: { white: models[white], black: models[black] } });
      setToken(created.token); localStorage.setItem(key(created.experiment.id), created.token); setExp(created.experiment); setId(created.experiment.id);
      history.replaceState(null, '', `/muju/explorer?experiment=${created.experiment.id}&server=${encodeURIComponent(normalizeServer(server))}`);
    }); }}>
      <label>Online host<input type="url" required value={server} onChange={e => setServer(e.target.value)} /></label>
      <div className="explorer-two">{(['White', 'Black'] as const).map((side, i) => <label key={side}>{side} player<select value={i ? black : white} onChange={e => (i ? setBlack : setWhite)(Number(e.target.value))}>{models.map((model, n) => <option key={model.model} value={n}>{names[n]} · high</option>)}</select></label>)}</div>
      <BlackCrystalHandicap value={handicap} onChange={setHandicap} />
      <div className="explorer-two"><label>Maximum games<input type="number" min={1} max={50} required value={maxGames} onChange={e => setMaxGames(Number(e.target.value))} /></label><label>Total player-turns<input type="number" min={1} max={500} required value={maxPlies} onChange={e => setMaxPlies(Number(e.target.value))} /></label></div>
      <p>Includes the original game. Shared history is free. Both models assess independently; two consecutive 90% agreements trigger a retry. The loser starts by looking for its last 33% chance.</p>
      <button disabled={busy} className="explorer-primary">Create experiment</button>
      <p className="explorer-muted">Your local runner uses your Codex and Claude Code subscription logins. You connect it once; it manages both players and all forks automatically.</p>
    </form> : !exp ? <p role="status">Loading experiment…</p> : <>
      <div className="explorer-stats"><strong>{exp.status === 'running' ? exp.runnerBusy ? 'Runner thinking' : 'Waiting for runner' : exp.status}</strong><span>{exp.games.length} / {exp.config.maxGames} games</span><span>{exp.plies} / {exp.config.maxPlies} player-turns</span><span>{exp.modelCalls} / {exp.config.maxModelCalls} model calls</span><span>Black +{exp.config.handicap}</span></div>
      {exp.stopReason && <p role="status">{exp.stopReason}</p>}
      {exp.conclusion && <p>{exp.conclusion}</p>}
      <div className="explorer-toolbar">
        {token && exp.status !== 'complete' && <><button disabled={busy} onClick={() => void action(async () => { setExp(await request(`/${id}/control`, { action: exp.status === 'paused' ? 'resume' : 'pause' })); })}>{exp.status === 'paused' ? 'Resume experiment' : 'Pause'}</button><button disabled={busy} onClick={() => void action(async () => { setExp(await request(`/${id}/control`, { action: 'stop' })); })}>Stop experiment</button></>}
        <button onClick={() => download(`muju-experiment-${id}.json`, { format: 'muju-advantage-explorer-1', experiment: exp })}>Export evidence</button>
        <button onClick={() => { void navigator.clipboard.writeText(`${location.origin}/muju/explorer?experiment=${id}&server=${encodeURIComponent(normalizeServer(server))}`).catch(() => setError('Copy the page URL to share this experiment.')); }}>Copy watch link</button>
      </div>
      <details className="explorer-connect" open={exp.plies === 0 && !exp.runnerBusy}><summary>Connect your subscription runner</summary>
        <p>On the computer signed into Codex and Claude Code, download the private connection file and run this from the repository’s <code>muju</code> directory. It controls this experiment; keep the file private.</p>
        {token ? <><button onClick={() => download('muju-runner.private.json', { server: normalizeServer(server), experimentId: id, token, workerId: crypto.randomUUID() })}>Download private runner connection</button><pre>npm run explorer:runner -- --connection /path/to/muju-runner.private.json</pre></> : <p>This is a public watch view. Import your private runner connection to manage it.</p>}
        <label>Restore controls from private connection JSON<textarea value={importText} onChange={e => setImportText(e.target.value)} autoComplete="off" /></label><button onClick={() => { try { const data = JSON.parse(importText); if (data.experimentId !== id || normalizeServer(data.server) !== normalizeServer(server) || !/^[a-f0-9]{64}$/.test(data.token)) throw new Error('Connection must match this experiment and host.'); localStorage.setItem(key(id), data.token); setToken(data.token); setImportText(''); } catch (e) { setError(e instanceof Error ? e.message : 'Invalid connection.'); } }}>Restore controls</button>
      </details>
      <div className="explorer-layout"><aside className="explorer-tree"><h2>Game tree</h2>{exp.games.map((g, i) => <button key={g.id} className={game?.id === g.id ? 'selected' : ''} onClick={() => { setGameId(g.id); setCpId(''); setSelected(null); }}><strong>Game {i + 1}{g.parentId ? ` ↳ ${exp.games.findIndex(parent => parent.id === g.parentId) + 1}` : ' · original'}</strong><span>{g.outcome ? `${g.outcome.winner || 'Unresolved'} · ${g.outcome.kind}` : 'In progress'}</span>{g.forkReason && <small>{g.forkReason}</small>}</button>)}<button onClick={() => { setGameId(''); setCpId(''); }}>Follow current game</button></aside>
      <section className="explorer-position"><h2>Game {ordinal + 1} · {state?.turn.turnNumber}.{state?.turn.currentPlayer}</h2>
        <label>Position<select value={cp?.id ?? ''} onChange={e => { setCpId(e.target.value); setSelected(null); }}>{timeline.map((p, i) => <option key={p.id} value={p.id}>{i}. Turn {p.state.turn.turnNumber} · {p.state.turn.currentPlayer} {p.state.phase === 'victory' ? '· terminal' : ''}</option>)}</select></label>
        {state && <><div className="explorer-board"><Board board={state.board} pendingSummons={state.pendingSummons} selectedUnit={selected} inspectOnly validMoves={[]} validAttacks={[]} validSpawns={[]} onCellClick={() => setSelected(null)} onUnitClick={setSelected} /></div>
          <p>Bank: White {state.players.white.resources} · Black {state.players.black.resources} <span className="explorer-muted">| Mined score: {minedTotal(state, 'white')} : {minedTotal(state, 'black')} | Kill clock: {state.inactivityPlies ?? 0}/10</span></p>
          {unit && <p>{unit.owner} {getUnitDefinition(unit.definitionId).name} · {String.fromCharCode(65 + unit.position.x)}{unit.position.y + 1}</p>}</>}
      </section><aside className="explorer-assessments"><h2>Chances & pressure</h2><p>Both curves estimate White’s eventual win chance.</p>
        <svg viewBox="0 0 600 150" role="img" aria-label="White win probability through this game"><line x1="24" x2="576" y1="72" y2="72" stroke="#64748b" strokeDasharray="4"/><text x="0" y="25">100</text><text x="0" y="76">50</text><text x="8" y="124">0</text><polyline points={series('white')} fill="none" stroke="#fbbf24" strokeWidth="3"/><polyline points={series('black')} fill="none" stroke="#38bdf8" strokeWidth="3"/></svg>
        <p><span className="forecast-white">● White’s estimate</span> · <span className="forecast-black">● Black’s estimate</span></p>
        {(['white', 'black'] as const).map(side => <article key={side}><h3>{side} · {exp.config.players[side].model}</h3>{cp?.assessments[side] ? <><strong>{Math.round(cp.assessments[side]!.whiteWin * 100)}% White · {cp.assessments[side]!.pressure.replaceAll('-', ' ')}</strong><p>{cp.assessments[side]!.explanation}</p><p><b>Counterplay:</b> {cp.assessments[side]!.counterplay}</p></> : <p>Estimates appear together after both players commit.</p>}</article>)}
        {game?.outcome && <p><strong>{game.outcome.kind === 'consensus' ? 'Consensus adjudication' : 'Attempt result'}:</strong> {game.outcome.reason}</p>}
      </aside></div>
      <section className="explorer-review"><h2>Your handicap judgment</h2><p>Did both sides have roughly even chances? Did either feel dominated before the decisive moves? Related branches are one experiment, not independent wins.</p>{exp.review && <blockquote>{exp.review}</blockquote>}{token && <><textarea aria-label="Handicap judgment" placeholder="Record your qualitative judgment…" value={review} onChange={e => setReview(e.target.value)} /><button disabled={busy} onClick={() => void action(async () => { setExp(await request(`/${id}/review`, { note: review })); })}>Save judgment</button></>}</section>
    </>}
  </main>;
}
