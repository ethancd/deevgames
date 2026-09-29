# Mandatory half-crystal komi and advantage exhaustion explorer

Prepared locally on 2026-09-28; **not deployed**. Base commit:
`6e4e18e3a34e9cc0acd6a63d93a469fb3228fafc`, plus the working-tree changes recorded
here. Runtime rules remain `muju-phasing-4`: canonical scoring and old game
transitions are unchanged. New creation uses setup revision
`mandatory-half-komi-1`. The final canonical/controller source hash is
`3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a`.

## Delivered behavior

New Prime games grant Black 0.5 plus an integer from 0 through 18, default 0.5.
Off and 19.5 are removed. The explorer defaults to 9.5, five attempts including
the root, and 100 newly played player-turns across the tree. Old saved games,
rooms, historical lab fixtures and Micro keep their recorded rules and grants.

`/muju/explorer` stores durable checkpoints, independent forecasts, complete
legal turns, fork ancestry and human review notes. Two consecutive bilateral
90% agreements adjudicate a result; rule outcomes remain separately labeled.
The loser can select an earlier own decision and must play a new continuation.
Its latest 33% chance is a suggestion, not a constraint. Forks retain exact
position state and do not re-award the handicap. Pausing cancels local thinking;
resuming wakes a connected runner. Game, ply and model-call caps are enforced
with state writes. An operator stop or budget truncation remains unresolved.

The local runner uses subscription-authenticated `gpt-6-astra` and
`claude-opus-5-5`, high effort, in fresh isolated CLI invocations with a common
canonical preview interface. It never sends subscription credentials to the
Muju host. Authentication and model failures pause the run. There is no model
or API-billing fallback. The runbook is [EXPLORER.md](../EXPLORER.md).

## Verification and evidence

Evidence is in [2026-09-28-explorer-evidence](2026-09-28-explorer-evidence/).
Use Node 24; the machine's default Node 26 breaks the repository's jsdom
localStorage environment. Local network/browser tests ran with the required
localhost sandbox allowance. No production database was used.

- `npm run server:types`, `npm run explorer:types`, `npm run build`: passed.
- Focused controller/runner checks: **14 passed**, including real HTTP orchestration,
  independent forecast secrecy, persistence, lease recovery, illegal/duplicate
  forks, shared budgets, terminal-only play and unresolved operator stops.
- Full regression suite: **241 files passed; 3,420 tests passed, 17 skipped**
  in 660.74 seconds; `full-tests.log` records the result.
  Initial run had 11 failures from retired setup assumptions and a fractional
  compact-report parsing bug; those were corrected and focused regressions passed.
- Full online browser run: 85/88 passed initially. The three failures were an
  obsolete draw expectation, an ambiguous review-note locator, and an obsolete
  packed-Hard expectation. Affected checks passed after correction. The mobile
  explorer's subsequent board overflow was fixed; both final desktop/mobile
  explorer tests passed. Screenshots use deterministic test assessments, not
  measured model estimates.
- `./build-all.sh`: all three games built and the assembled site passed its link,
  file-size and required-page checks. The explorer has its own static entry point.
  `tools/smoke-site.cjs` passed at 390px and 834px using installed Chrome.
- `npm run balance:check`: passed. Regeneration produced unchanged report data;
  the nondeterministic elapsed-time-only diff was discarded.
- Academy export: 324 ordered matchups and current demonstrations passed, plus
  all 19 new grants checked against integral mined-income differences. Catalogue,
  map and matchup matrices were byte-identical. The current verification report
  changed; historical snapshots did not.
- DAG: 28 nodes, 52 edges; all 14 planner tests passed. Five declared local-only
  Academy media groups are unavailable in this checkout.

### Real subscription check

Codex CLI `0.158.0-alpha.2.1`, already signed in through ChatGPT, completed a real
Astra-high adapter call and an autonomous Astra-versus-Astra integration run.
The latter obtained two hidden-then-revealed assessments, used two legal preview
calls, committed one full turn including a pending summon, then stopped exactly
at its configured one-turn limit: five model calls total. Its credential-free
public export is `astra-subscription-smoke.json`; it is **integration evidence,
not a completed balance experiment**. The export embeds the pre-final-cleanup
source hash that actually ran, separately from the final hash above.

Claude Code `2.1.283` is installed but reports no subscription login. Its adapter
arguments, response parsing, missing-login handling and model-fallback rejection
are tested. A real Opus call remains unverified until `claude auth login` is
completed locally. No credentials are stored in these evidence files.

## Affected DAG dispositions

Plan: `python3 tools/muju-content-dag.py plan --kind rules --format json`.
The saved closure is a review plan; the evidence and dispositions below record
the actual work.

| Node | Disposition and evidence |
| --- | --- |
| rule-contract | Changed: SPEC and appended JUDGMENT_LOG decision define mandatory komi and human qualitative judgment. |
| catalogue | Verified unchanged: no piece-stat changes; full rule tests and 324 Academy matchups. |
| board-rules | Changed: current allowed grants/default and separate historical-grant validation; all 19 grants covered. Low-level constructors retain historical reconstruction defaults. |
| transitions | Verified unchanged: canonical legality, mining and kill-clock scoring already retain halves; explorer rejects trailing actions after terminal state. |
| rules-docs | Changed: SPEC, ONLINE, dossier and explorer runbook; historical design is explicitly superseded. |
| browser-ui | Changed: mandatory selector, defaults, analysis resets, lobby link and explorer. Desktop/mobile checks and screenshots. |
| persistence | Changed at creation/reset boundaries only: saved zero/integer/19.5 games load unchanged; exact branch checkpoints survive SQLite reopen. |
| wasm-tactics | Verified unchanged: regenerated build and existing canonical witness/parity regression coverage. |
| ai-search | Verified unchanged: canonical V2 retains fractional banks; Easy/Hard browser turns complete legally. |
| hard-ai | Compatibility boundary documented: packed integer engine still rejects fractional banks. Browser uses its existing canonical fallback; strict engine-seat runner now rejects such a study before search. Packed-half support is not claimed. |
| ai-strength | Verified unchanged historical fixtures, journals and release manifests. No new deterministic-engine or handicap-strength claim; subscription smoke is integration-only. |
| server-runtime | Changed: creation defaults/range, experiment persistence/routes/lifecycle. Server types, HTTP and restart tests. |
| mcp-tools | Changed: schema and rule descriptions; MCP tests use the new grants, including fractional compact reports. |
| agent-guides | Changed: current public skills document mandatory 0.5–18.5 and omit-for-0.5 creation. |
| balance-analysis | Verified unchanged static data; fresh explorer exports are a separate qualitative evidence format. |
| academy-data | Changed current exporter/verification; map, catalogue, matrices verified unchanged. Recorded source snapshots preserved. |
| academy-lessons | Changed current README/STATUS and prepared page notice. R09/R10 recordings remain stale and explicitly identified. |
| academy-audio | Blocked for a new media release: required local media unavailable; recordings preserved. |
| academy-video | Blocked for a new media release: required media unavailable; no new render or visual claim. |
| advantage-explorer | Added controller, local CLI runner, UI, protocol/runbook, tests and DAG routing. |
| game-validation | Changed tests and browser suite inclusion; actual results above and in evidence logs. |
| static-package | Changed: all-games build and direct explorer entry; assembled-site verification and phone/tablet smoke passed. |
| server-package | Changed sources fit the existing Node 24 image; type/build gates passed. Private runner files excluded from Git and Docker contexts. Container image was not separately built. |
| academy-package | Changed notice builder/verifier; Python syntax verified. Full packaging blocked by missing media. |
| static-deploy | Not published: release preparation only; no push or deployment requested. |
| server-deploy | Not published: existing Render database untouched. |
| academy-deploy | Not published: separate website/media release remains outstanding. |
| release-verification | Changed: this record, source identity, sanitized smoke export and validation evidence; no live-release claim. |

## Remaining release work

Sign in to Claude Code and verify an Opus-high run. Publish the prepared static
and Node releases when deployment is requested. Updating Academy narration/video
requires the archived media and a separate recording release; the prepared
notice is not a replacement for that work. Packed-Hard fractional-bank support
is separate from the functioning canonical LLM explorer.
