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
limits still apply. One inference has a five-minute timeout; one job permits
at most twelve calls including previews/corrections; the experiment has a
configurable 1,000-call ceiling by default. Neither plies nor calls predict
subscription token usage exactly.

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
rejected; old trees remain readable. A code change is never silently treated as
a continuation of the same evidence. The source commit is recorded when supplied
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
