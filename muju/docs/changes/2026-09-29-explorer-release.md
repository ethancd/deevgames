# Explorer and mandatory komi: production release

Published on 2026-09-29 following the user's deployment request. This is the
deployment follow-up to [the implementation record](2026-09-28-explorer-implementation.md),
which retains the original 28-node rule-change dispositions and earlier evidence.
The release includes current upstream crystal-light board changes through
`c08cb0037ee619e7466f44f0aba76255bc8d1517`.

Game source: `216e6db4224915f04c0ddcfb4c09d58d76c83db7` (implementation,
upstream merge, and removal of the explorer's obsolete `showResources` prop).
Rules remain `muju-phasing-4`; new setup is `mandatory-half-komi-1`.
Canonical/controller SHA-256 remains
`3d14e85c953553f14ca0d81a0fddf86989b7fc8871a13310095206fe1bc7654a`.

## Releases and live verification

| Target | Published revision and evidence |
| --- | --- |
| Browser games | Cloudflare Pages `deevgames`, master, source `216e6db4`: [deployment](https://4cb962f2.deevgames.pages.dev). Wrangler reported success; the real explorer entry, JS/CSS and agent guide were fetched and checked. The Pages bundle matches `_site` byte-for-byte. |
| Online/MCP | Render `srv-dahbp4ht0dsc73fdqn10`, live deployment `dep-datti4m0tbcc738d6nug`, source `216e6db4`. Dashboard confirmed auto-deploy from master and existing 1 GB `/app/data` disk. A new experiment independently reported the exact source commit and controller hash. |
| Academy | Website source `5af9015d25d845d34e2148deb3530763d7dfef65`: [deployment](https://b78a08ef.ashkie-pages.pages.dev), [successful publishing workflow](https://github.com/ethancd/ashkie-pages/actions/runs/36589703612). The mandatory-komi notice is visible on ashkie.com; existing lessons are preserved and explicitly described as teaching earlier rules. |

Live explorer: <https://deevgames.ashkie.com/muju/explorer>.
The default form shows Astra/Opus high, Black +9.5, five games and 100 player-turns;
the selector contains exactly 0.5 through 18.5. The public experiment viewer
loads from the custom domain with no control credentials.

Production HTTP checks exercised the default configuration, sealed-then-revealed
independent forecasts, a complete canonical turn, an unresolved operator stop,
review notes and credential-free export. These were **synthetic deployment QA**,
not model games or handicap evidence. The QA tree is labeled accordingly.
Ordinary-room creation defaults to 0.5; 0, 19.5 and 20.5 are rejected. A disposable
room was joined, previewed, played and finished by resignation. MCP discovery and
rules advertise the new creation range. Pages-to-Render CORS passed.

The pre-existing room `942e8d33b1a14c7101f1738c5cf78e2c` retained revision 59 and
exact state SHA-256
`efa103e586244a3124482be1f6bb65a3a29d5f7811d6ecafebbb85ea725b0e4a`
across the server deployment. Its original state was not reinterpreted.

## Verification

Evidence: [2026-09-29-explorer-release-evidence](2026-09-29-explorer-release-evidence/).
No credentials or private connection files are included.

- Node 24 server and runner type checks passed. `build-all.sh` built all three
  games and verified the assembled site.
- Full regression run: 3,423 passed, 17 skipped, two timeouts. Both timeouts
  passed on isolated reruns with unchanged assertions and original time limits:
  negamax's three tests in 26.59 seconds and the affected veto case in 89.27
  seconds. Total distinct passing tests: **3,425** across 242 files. The initial
  run overlapped the browser suite; no timeout threshold or production code was
  changed to accommodate it.
- All **108** online/local Playwright checks passed, including explorer desktop
  and phone, saved games, upstream board visuals, and online room lifecycle.
- Final all-games smoke passed at 390px and 834px, including play, navigation,
  save/refresh, both Forge art sets, and Oracle combat/restart.
- DAG validation: 28 nodes, 52 edges; all 14 planner tests passed. Five declared
  local media groups remain unavailable for a future Academy recording release.
- Academy `./check` reported no failures; existing warnings concern the unrelated
  missing research-validator dependency and stale atlas matrix. The offline
  manifest remains exactly 7,935 URLs (delta zero); only the Academy page and
  patch notes changed their entries. Local and live offline checks passed.
- Academy live verifier passed exact hashes for all 16 videos/posters/transcripts,
  three seek ranges per video, 33 retired strategy assets and 120 old redirects.
  The local QA server passed current assets but cannot emulate `_redirects`, so
  its retired-link assertion failed; the production verifier passed that check.
- Both Pages and Render public guides match the current source. Both live JS
  bundles have SHA-256 `5c500dbc59fa83c6fdef8c1e22a593b528ae980cb46e7e714f906c61f2d91eb8`;
  build-generated filenames and CSS hashes differ between environments.

## Release DAG dispositions

Plan: `python3 tools/muju-content-dag.py plan --kind release --format json`.
Upstream content dispositions are inherited from the implementation record;
this release changes their previously unpublished status as follows.

| Node | Disposition |
| --- | --- |
| game-validation | Verified: integrated types, full regressions plus isolated timing retries, 108 browser tests. |
| static-package | Changed/rebuilt: final all-games package and direct explorer route; phone/tablet smoke passed. |
| server-package | Changed/built by Render: deployed Node 24 image successfully serves the new controller and matching provenance. |
| academy-package | Changed notice, corresponding builder and verifier, patch notes, and offline manifest in the separate website checkout. Existing release manifest and media verified unchanged. |
| static-deploy | Changed/published: successful Wrangler deployment and live byte checks. |
| server-deploy | Changed/published: live Render commit, API checks and persistence comparison. |
| academy-deploy | Changed/published: successful Cloudflare workflow and complete live course verification. |
| release-verification | Changed: this record, deployment IDs, sanitized API evidence, logs and live screenshots. |

## Operational boundaries

The subscription runner runs on the operator's computer; hosting does not start
an LLM game. Use [the runner instructions](../EXPLORER.md). Codex subscription
integration was verified during implementation. Claude Code is installed but
still needs the user's subscription sign-in; real Opus execution remains
unverified. This deployment used no model calls and started no balance study.

The packed Hard engine still delegates fractional browser games to canonical
V2; strict packed-engine fractional studies remain unsupported. Existing Academy
narration/video refresh is a separate media release requiring the archived
inputs. Neither limitation prevents the deployed canonical LLM explorer.
