#!/usr/bin/env python3
"""Coordinator (2026-09-23 08:15Z, 01:15 local): unattended Stage B -> select -> Stage C chain.

Owner authorised an overnight run at 8 heavy slots ("rock on ... see you in the morning").
Rules honoured (SPEC section 3, lane T report sections 8-9):
  * aiv2-hard-turn rows: ONE row at a time, --shards 4 (<= 4 concurrent games), MUJU_HEAVY_SLOTS=4.
  * fixed-work rows: two rows at a time, --shards 4, MUJU_HEAVY_SLOTS=8 (the coordinator's
    overnight directive; both sweeps share the slot dir, so total concurrency never exceeds 8).
  * A VOID aiv2 row (overrunRate > 5%) is set aside as <outDir>-VOIDn and re-run ALONE at shards 2.
  * Stage B ranking: sum(aiv2 score, Rush score) per arm, drop any arm whose Balanced OR Expand
    score is strictly below control's, keep top 3 (ties: aiv2 score, then Stage A order).
  * Stage C winner: max summed score (aiv2 + Rush) on p1-val; must be STRICTLY above control or
    the result is "ship control".
Everything this script decides is appended to PROGRESS.md and results/stageBC-decision.json.
Run from muju/:  nohup python3 docs/.../scripts/chain-BC.py > docs/.../results/chain-BC.log 2>&1 &
"""
import json, os, re, shutil, subprocess, sys, time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

MUJU = Path(__file__).resolve().parents[5]
BASE = Path('docs/hard-ai/phasing/p3-retune-2026-09-22')
SCRIPTS = BASE / 'scripts'
RESULTS = BASE / 'results'
PROGRESS = MUJU / BASE / 'PROGRESS.md'
DONE = MUJU / RESULTS / 'chain-BC.done'
os.chdir(MUJU)

def now(): return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def log(msg):
    print(f'[{now()}] {msg}', flush=True)
def progress(text):
    with open(PROGRESS, 'a') as f: f.write(text if text.endswith('\n') else text + '\n')
def head(): return subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()

def run_sweep(plan, slots, concurrency):
    env = dict(os.environ, MUJU_HEAVY_SLOTS=str(slots))
    env.pop('MUJU_HEAVY_BYPASS', None)
    return subprocess.Popen(['node', '--import', 'tsx', str(SCRIPTS / 'sweep.ts'), str(plan),
                             '--concurrency', str(concurrency)], env=env,
                            stdout=open(MUJU / RESULTS / f'{plan.stem}.sweep.log', 'a'), stderr=subprocess.STDOUT)

def wait_all(procs):
    for p in procs: p.wait()
    return [p.returncode for p in procs]

def metrics(out_dir):
    p = MUJU / out_dir / 'metrics.json'
    return json.loads(p.read_text()) if p.exists() else None
def complete(out_dir):
    p = MUJU / out_dir / 'summary.md'
    return p.exists() and re.search(r'^- status: \*\*complete\*\*', p.read_text(), re.M) is not None
def score(m): return sum(s['score'] for s in m['strata']) / len(m['strata'])
def wintypes(out_dir):
    p = MUJU / out_dir / 'games.jsonl'
    if not p.exists(): return Counter()
    return Counter(json.loads(l)['winType'] for l in p.read_text().splitlines() if l.strip())
def mined(out_dir):
    p = MUJU / out_dir / 'games.jsonl'
    a = b = n = 0
    for l in p.read_text().splitlines():
        if not l.strip(): continue
        g = json.loads(l); n += 1
        sa = 'white' if g['players']['white']['bot'].startswith('hard@') else 'black'
        sb = 'black' if sa == 'white' else 'white'
        a += g['players'][sa]['resourcesGained']; b += g['players'][sb]['resourcesGained']
    return (a / n if n else float('nan'), b / n if n else float('nan'))

def run_stage(stage, aiv2_plan, fixed_plan):
    log(f'Stage {stage}: launching aiv2 sweep (4 slots, conc 1) and fixed sweep (8 slots, conc 2) in parallel')
    codes = wait_all([run_sweep(aiv2_plan, 4, 1), run_sweep(fixed_plan, 8, 2)])
    log(f'Stage {stage}: sweeps exited {codes}')
    # second pass for aiv2 rows that FAILED (e.g. heavy-queue give-up while fixed rows held slots)
    log(f'Stage {stage}: aiv2 catch-up pass (alone, 4 slots)')
    wait_all([run_sweep(aiv2_plan, 4, 1)])
    wait_all([run_sweep(fixed_plan, 8, 2)])
    # VOID handling for aiv2 rows: set aside and re-run alone at shards 2, up to 2 attempts
    rows = json.loads((MUJU / aiv2_plan).read_text())
    for attempt in (1, 2):
        voided = [r for r in rows if (m := metrics(r['outDir'])) and m.get('voided')]
        if not voided: break
        for r in voided:
            aside = f"{r['outDir']}-VOID{attempt}"
            log(f"Stage {stage}: {r['id']} VOID ({metrics(r['outDir']).get('voidReason')}); moving to {aside}, re-running alone at shards 2")
            progress(f"- {r['arm']} | {r['engineB']} | {stage} | VOID attempt {attempt} set aside at [{aside}]; re-run alone at shards 2")
            shutil.move(MUJU / r['outDir'], MUJU / aside)
            single = dict(r, shards=2)
            sp = MUJU / SCRIPTS / f"{stage}-rerun-{r['arm']}-{attempt}.json"
            sp.write_text(json.dumps([single], indent=2) + '\n')
            wait_all([run_sweep(sp.relative_to(MUJU), 2, 1)])
    bad = []
    for plan in (aiv2_plan, fixed_plan):
        for r in json.loads((MUJU / plan).read_text()):
            m = metrics(r['outDir'])
            if not complete(r['outDir']) or m is None or m.get('voided'):
                bad.append(r['id'])
    if bad:
        raise SystemExit(f'Stage {stage}: rows not complete/valid after retries: {bad}')
    log(f'Stage {stage}: all rows complete and valid')

def table(stage, arms, opponents):
    lines = [f"| arm | " + " | ".join(f"{o} W-D-L / score" for o in opponents) + " | sum(aiv2+Rush) | mined hard/opp (aiv2) | aiv2 winTypes |",
             "|" + "---|" * (len(opponents) + 4)]
    rowsum = {}
    for arm in arms:
        cells = []
        for o in opponents:
            m = metrics(f"{RESULTS}/stage{stage}/{arm}-{o}")
            cells.append(f"{m['wins']}-{m['draws']}-{m['losses']} / {score(m):.3f}")
        s = score(metrics(f"{RESULTS}/stage{stage}/{arm}-aiv2-hard-turn")) + score(metrics(f"{RESULTS}/stage{stage}/{arm}-Rush"))
        rowsum[arm] = s
        ma, mb = mined(f"{RESULTS}/stage{stage}/{arm}-aiv2-hard-turn")
        wt = ', '.join(f'{k} {v}' for k, v in sorted(wintypes(f"{RESULTS}/stage{stage}/{arm}-aiv2-hard-turn").items()))
        lines.append(f"| {arm} | " + " | ".join(cells) + f" | {s:.3f} | {ma:.0f}/{mb:.0f} | {wt} |")
    return '\n'.join(lines), rowsum

def main():
    started = now(); sha = head()
    log(f'chain-BC start at {sha}')
    progress(f"\n## Overnight chain (coordinator, {started}, HEAD {sha[:8]})\n\n"
             "Owner authorised an unattended Stage B -> Stage C run at 8 heavy slots (08:15Z, 01:15 local, "
             "2026-09-23). Concurrency: aiv2 rows one at a time at shards 4 (MUJU_HEAVY_SLOTS=4); fixed rows "
             "two at a time at shards 4 (MUJU_HEAVY_SLOTS=8); the two sweeps run side by side and share the "
             "slot directory, so at most 8 games are live and at most 4 of them are aiv2 games. VOID aiv2 rows "
             "are set aside and re-run alone at shards 2. Selection rules as in lane T report sections 8-9; "
             "this script (`scripts/chain-BC.py`) applies them mechanically and records the result below.\n")

    # ---- Stage B ----
    run_stage('B', SCRIPTS / 'stageB-plan-aiv2.json', SCRIPTS / 'stageB-plan-fixed.json')
    plan_rows = json.loads((MUJU / SCRIPTS / 'stageB-plan-aiv2.json').read_text())
    arms = [r['arm'] for r in plan_rows]                       # Stage A order, control first
    candidates = [a for a in arms if a != 'control']
    tbl, rowsum = table('B', arms, ['aiv2-hard-turn', 'Rush', 'Balanced', 'Expand'])
    def sc(arm, o): return score(metrics(f"{RESULTS}/stageB/{arm}-{o}"))
    ctrl_bal, ctrl_exp = sc('control', 'Balanced'), sc('control', 'Expand')
    guard_dropped = [a for a in candidates if sc(a, 'Balanced') < ctrl_bal or sc(a, 'Expand') < ctrl_exp]
    survivors = [a for a in candidates if a not in guard_dropped]
    survivors.sort(key=lambda a: (-rowsum[a], -sc(a, 'aiv2-hard-turn'), candidates.index(a)))
    top3 = survivors[:3]
    progress(f"\n### Stage B table (p1-dev, seed 20260971; aiv2 16 pairs wall:6000, others 8 pairs fixed:60000)\n\n{tbl}\n\n"
             f"Regression guard (Balanced >= control {ctrl_bal:.3f} AND Expand >= control {ctrl_exp:.3f}): "
             f"dropped {guard_dropped or 'none'}. Ranking of survivors by sum(aiv2+Rush), ties by aiv2 score then "
             f"Stage A order: {survivors}. **Stage C set: {top3}** (+ control).\n")
    log(f'Stage B done. dropped={guard_dropped} survivors={survivors} top3={top3}')
    decision = {'head': sha, 'startedAt': started, 'stageB': {'sums': rowsum, 'guardDropped': guard_dropped, 'survivors': survivors, 'top3': top3}}
    (MUJU / RESULTS / 'stageBC-decision.json').write_text(json.dumps(decision, indent=2) + '\n')
    if not top3:
        progress("\nNo arm survived the Stage B regression guard: **ship control, no weight change.** Stage C not run.\n")
        decision['winner'] = 'control'; decision['reason'] = 'no Stage B survivors'
        (MUJU / RESULTS / 'stageBC-decision.json').write_text(json.dumps(decision, indent=2) + '\n')
        finish(decision); return

    # ---- Stage C plan ----
    gen = MUJU / SCRIPTS / 'gen-plan-stageC.ts'
    src = gen.read_text()
    new = re.sub(r"const TOP3 = \[.*?\];", "const TOP3 = [" + ", ".join(f"'{a}'" for a in top3) + "]; // filled by chain-BC.py from the Stage B ranking", src, count=1)
    assert new != src, 'TOP3 line not found'
    gen.write_text(new)
    subprocess.run(['node', '--import', 'tsx', str(SCRIPTS / 'gen-plan-stageC.ts')], check=True)
    log('Stage C plans generated')

    # ---- Stage C ----
    run_stage('C', SCRIPTS / 'stageC-plan-aiv2.json', SCRIPTS / 'stageC-plan-fixed.json')
    c_arms = ['control'] + top3
    tblc, csum = table('C', c_arms, ['aiv2-hard-turn', 'Rush'])
    best = max(top3, key=lambda a: (csum[a], -top3.index(a)))
    winner = best if csum[best] > csum['control'] else 'control'
    progress(f"\n### Stage C table (p1-val, seed 20260972; 32 pairs vs aiv2-hard-turn wall:6000, 32 pairs vs Rush fixed:60000)\n\n{tblc}\n\n"
             f"Summed scores: " + ", ".join(f"{a} {csum[a]:.3f}" for a in c_arms) + ". "
             + (f"**Winner: {winner}** (sum {csum[winner]:.3f} vs control {csum['control']:.3f}). These are the only numbers to report as the tuning result."
                if winner != 'control' else
                f"**No candidate beats control on the sum (best {best} {csum[best]:.3f} vs control {csum['control']:.3f}): ship control, no weight change.**") + '\n')
    decision['stageC'] = {'sums': csum, 'best': best}; decision['winner'] = winner
    (MUJU / RESULTS / 'stageBC-decision.json').write_text(json.dumps(decision, indent=2) + '\n')
    log(f'Stage C done. sums={csum} winner={winner}')
    finish(decision)

def finish(decision):
    decision['finishedAt'] = now()
    (MUJU / RESULTS / 'stageBC-decision.json').write_text(json.dumps(decision, indent=2) + '\n')
    r = subprocess.run(['git', 'add', str(BASE)], capture_output=True, text=True)
    c = subprocess.run(['git', 'commit', '-q', '-m', 'p3 retune: Stage B and Stage C rows, selection and decision (overnight chain)\n\nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_011K4Nq7cVzTtaEuFv6rNwXb'], capture_output=True, text=True)
    log(f'commit rc={c.returncode} {c.stdout.strip()} {c.stderr.strip()[:400]}')
    DONE.write_text(json.dumps({'status': 'ok', 'winner': decision.get('winner'), 'commit_rc': c.returncode, 'at': now()}) + '\n')
    log('chain-BC finished')

if __name__ == '__main__':
    try:
        main()
    except BaseException as e:
        log(f'chain-BC ABORTED: {e!r}')
        progress(f"- chain-BC ABORTED at {now()}: {e!r}")
        DONE.write_text(json.dumps({'status': 'aborted', 'error': repr(e), 'at': now()}) + '\n')
        raise
