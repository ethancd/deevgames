# Advantage exhaustion explorer

The explorer is an online research mode at `/muju/explorer`. Its independent
SQLite experiment table stores complete game states, actions, private forecast
commitments, branches and shared budgets. It uses canonical Muju legality and
transitions. Ordinary room actions cannot mutate an experiment.

## Run with subscription players

Use Node 24. Install Codex CLI and Claude Code, then sign in with their normal
subscription workflows (`codex login` and `claude auth login`). Claude Code
must support Opus 5.5 (v2.1.280 or later). No model API key is used. The runner
removes API billing/gateway environment overrides and checks subscription auth.

1. Start the Muju host with `npm run build` and `npm run serve` from `muju/`,
   or use a host that has this release deployed.
2. Open its `/muju/explorer`, select both players and create the experiment.
   The default is Astra 6 as White and Opus 5.5 as Black, both high effort;
   either side may use either model, including Astra versus Astra.
3. Download the private runner connection file. In a local terminal in `muju/`,
   run `npm run explorer:runner -- --connection /path/to/muju-runner.private.json`.
4. The runner manages assessment, moves, corrections and branching. Watch in
   the browser; pause/resume there. Keep the computer and runner running.
   The public watch URL contains no control token. Keep the connection file
   private. Import it in the explorer to restore browser controls.

Alternatively, create and run from the terminal:

```sh
npm run explorer:runner -- --create --server http://localhost:3003 \
  --connection ./muju-runner.private.json
```

Use `--config path.json` with that command to override creation defaults, e.g.:

```json
{
  "handicap": 9.5,
  "maxGames": 5,
  "maxPlies": 100,
  "players": {
    "white": {"provider":"codex","model":"gpt-6-astra","effort":"high"},
    "black": {"provider":"codex","model":"gpt-6-astra","effort":"high"}
  }
}
```

The runner prints an observer link and saves a mode-0600 connection file. The
CLI refuses to overwrite an existing file. `*.private.json` is gitignored.
Resume after a crash with the same file. Server job leases and submission
receipts prevent duplicate actions. An interrupted model call may have consumed
subscription usage without a recorded response; it is never counted as a loss.

Authentication or model errors pause the run with an explanation. Fix the login
or availability problem, resume in the browser and rerun the same command.
There is no fallback to another model or to API billing. Subscription usage
limits still apply. Each model call has a five-minute hard timeout, including
CLI setup, and each decision (assessment, complete turn or branch) permits at
most twelve calls. A timed-out call consumes an attempt and retries automatically
within that same budget. It does not pause the run by itself. Exhausting all
twelve attempts still pauses without inventing a move or recording a loss.

Five minutes per decision is a **soft pacing target**. The runner reports elapsed
time and remaining calls before every inference. After five minutes it adds a
finish-soon reminder: use the best line already considered, avoid new strategic
searches, and only preview further to fix legality or complete the turn. These
reminders arrive at the next model-call boundary, not inside an active CLI call.
Elapsed decision time alone never aborts or pauses the run. Each seat's independent
assessment is a separate decision. The experiment has a
configurable 1,000-call ceiling by default. Neither plies nor calls predict
subscription token usage exactly.

For a stricter retry policy and explicit learning/search instructions, save:

```json
{"version":3,"retryThreshold":0.45,"paceAfterMs":300000,"blackTarget":0.6,"noEligibleCheckpoint":"opening"}
```

Then run `npm run explorer:runner -- --connection /path/to/connection.private.json
--policy /path/to/policy.json` (on one command line). This requires the latest own
turn-start checkpoint at or above 45%, including inherited checkpoints. If the
loser never reached 45%, `noEligibleCheckpoint: "opening"` retries its earliest
own turn-start checkpoint with a different opening plan. This is explicitly
labeled an opening fallback in the prompt and saved branch explanation; it does
not claim that the original opening forecast met the threshold. Both seats keep
their lessons, the parent remains immutable, and the same game/move/call limits
apply. Choosing `noEligibleCheckpoint: "finish"` instead ends normally with
`no-qualifying-retry-checkpoint`, without another model call or a changed game
outcome. Neither choice treats the empty qualifying set as a runner failure.
Previews and the new turn are restricted to the selected checkpoint. Each retry
must supply `Lesson:` and `Strategy:` in its public
explanation and retain private memory; the prompt asks for a materially changed
plan and an account of the opponent's strongest reply. The server also rejects
equivalent continuations, but semantic strategic novelty is not mechanically
provable. Both seats retain their own cumulative lessons and see public prior
games. This is learning from supplied context, not model training.

The 60% Black target is an exploration hypothesis, never a forecast floor.
White still tries to win and both sides must report honest estimates. The runner
appends the policy, its fingerprint and the starting game/turn/call counts to
the public review before doing work, and tags subsequent explanations. It does
not rewrite the original server config (whose suggested retry default is still
33%) or prior evidence. Export/review the amendment alongside the original
config, and keep `--policy` when restarting this worker. Changing the local
runner does not require a server or browser deployment.

Version-1 policies described the retired hard decision deadline and are rejected
with a migration explanation. Version 2 retains its original pause when no own
checkpoint meets the threshold. Preserve those files and their old review entries
as historical evidence. New runs should use version 3. To amend an existing run,
create a new version-3 file using `paceAfterMs` instead of `decisionTimeMs` and an
explicit `noEligibleCheckpoint` choice. The runner records its new fingerprint
and starting counts before continuing; old policy meanings are unchanged.

## Protocol and interpretation

New Prime games always include Black's 0.5 komi, with total grants from 0.5 to
18.5. Old saves and rooms retain zero, integers or 19.5 unchanged. The explorer
starts new games only, defaults to 9.5, and cannot produce a tied mined score.
An interrupted or budget-truncated game is unresolved, never a draw or a loss.

At the initial position and after each complete player-turn, both agents submit
an independent White-win probability and short pressure/counterplay assessment.
The second agent cannot read the first's current forecast. Both become public
together. The percentage concerns eventual rule victory against this opponent,
not material value. Equal model labels do not imply independent calibration.

An attempt stops at a rules result or two consecutive checkpoints where both
assign at least 90% to the same winner. This is a labeled consensus adjudication,
not an engine win or resignation. Both thresholds are configurable. To require
rules results, use `terminalOnly: true`. A finite certainty threshold should
not itself be interpreted as a proof.

The loser reviews its own turn-start checkpoints, newest first. Its last own
win estimate of at least 33% is the suggested retry point; it may choose an
earlier or lower-estimate checkpoint and explain why. It must supply a new
complete turn. The server rejects previously explored equivalent continuations
and illegal/incomplete turns. The parent is immutable; the child inherits the
exact checkpoint, including pending summons, mined totals and kill clock. No
handicap is re-awarded. Consensus confirmation starts afresh in the child.

Five games means the root plus at most four continuations. The global 100-ply
budget counts each newly executed player-turn once, including terminal partial
turns. Inherited history, previews and assessments cost no plies but model calls
are budgeted separately. Budgets are checked transactionally with state writes.
A cap may leave the final game unfinished. A loser may also report no credible
alternative; this means no candidate was nominated, not mathematical exhaustion.

Players retain only their own bounded strategic memory plus the public branch
record across calls. Every CLI request is a fresh isolated print session with
the same supplied game interface: canonical previews and legal options, no
external tools. The runner mediates those requests and validates structured
outputs. This is an exploration protocol, not the existing strict single-room
LLM-versus-engine strength study. It does not claim that models are perfect
players or that this is a formal adversarial sandbox.

## Evidence and compatibility

The browser shows each player's forecast of White winning, subjective pressure,
counterplay, chosen fork and actual outcome category. The operator records
whether both sides had roughly even chances or one felt dominated before any
critical mistake. The mode does not calculate a sufficient handicap for them.

JSON exports include full states and action records, branch ancestry, config,
usage when reported by the CLI, rules/setup revision and a hash of the canonical
rule/controller sources. Mutating an experiment after those sources change is
rejected unless its exact old hash is approved for the exact current implementation
digest in `server/explorer/compatibility.ts`. That audited manifest permits only
documented changes that preserve gameplay; changing any implementation byte
invalidates its entries until separately reviewed. The full source digest also
includes the manifest. Compatible continuations append `compatibleRuntimes`
with the new source identity and starting turn/call counts while retaining the
original identity and history. Unknown changes and changed rules revisions are
still rejected; old trees remain readable. A code change is never silently treated
as a continuation of the same evidence. The source commit is recorded when supplied
by `RENDER_GIT_COMMIT` or `MUJU_SOURCE_REVISION`; the content hash works in dirty
local checkouts too. Restore unchanged server code to resume an old experiment.

Branches from one root are related evidence. Inspect whether a result survives
correction of the losing side's mistakes, and separate original results from
recoveries. Do not pool all branch wins into an independent-sample win rate.
Compare independent experiments with equal assistance/effort and reset memory
between roots. Qualitative judgment belongs to the human.

Implementation: `server/explorer/`, `src/explorer/`, `tools/explorer/`. The server
HTTP API provides creation, public read/export, authenticated claim/query/call/
submit/control/review. The subscription worker is local; Render need not install
either CLI. No local port, shell service or model credentials are exposed to the
public browser. Existing ordinary MCP rooms retain their normal lifecycle.

The deterministic packed Hard engine still uses integer banks. Fractional games
use its existing canonical V2 fallback in the browser; the strict engine-seat
runner rejects them before search. This release does not claim packed-engine
strength evidence at the new handicaps. The LLM explorer always uses canonical
rules and retains the exact fractional bank throughout.

Official interface references (verified 2026-09-28):
- [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex subscription authentication](https://learn.chatgpt.com/docs/auth)
- [Claude Code programmatic mode](https://code.claude.com/docs/en/headless)
- [Claude model names and effort](https://code.claude.com/docs/en/model-config)
