# Writing Learn to Play puzzles

Read [CURRICULUM.md](CURRICULUM.md) first. It has the course, the arc briefs
and the reasons behind them. This page is the craft: the format, the proof
tool, the rules facts you will need, and the quality bar.

## The loop

1. Edit your arc's file, `src/learn/catalog/<arc>.ts`. Each arc owns exactly one file.
2. Prove it: `node --import tsx tools/learn-check.ts <arc> --board`. Add
   `--puzzle <id>` to check one puzzle. This loads only your file.
3. Fix every `✗`. Read every `·` note. Look at `wins W/T`: of the T distinct
   ways a one-turn puzzle's turn can end, W solve it. Intro puzzles may be
   generous. From the twist on, the naive idea must fail.
   Add `--live` to count the positions after your first one or two actions
   where the app's live "can I still win?" check (30k nodes) runs out of budget.
   There the app cannot flag a dead line at once, and waits for the hand-over
   or the enemy's reply instead.
4. Repeat until the arc reads well in order. Then run
   `npx vitest run tests/learn` for the whole catalog.
5. Play it: `npx vite`, then open `/muju/?learn=<id>` (or `/muju/?learn=1` for
   the map). The screen is the real game with the puzzle chrome; the enemy's
   reply, the early "can no longer win" check and the hints all run the solver
   live, so a heavy position (see the `·` note) feels slow here too.

## The format

```ts
import type { Arc } from '../types';

export const ARC: Arc = {
  id: 'mine', title: 'Mining', part: 'basics', icon: 'mine',   // keep the stub's metadata
  puzzles: [
    {
      id: 'mine-3',                       // `<arc>-<n>`, stable forever (progress is stored under it)
      idea: 'A smaller bucket: the near square holds too few crystals.',   // for maintainers only
      board: [                            // row 1 at the top; White's home is a1, top-left
        'P1 2  .  .',
        '.  .  .  .',
        '.  .  4  .',
        '.  .  .  .',
      ],
      goal: { kind: 'mine', atLeast: 3 },
      solution: ['a1-c3', 'mine'],        // one intended first turn, in move notation
      tries: [['a1-b1', 'mine']],         // tempting wrong first turns; each must fail
    },
  ],
};
```

**Board tokens** (`src/learn/notation.ts`):

| Token | Meaning |
|---|---|
| `.` | empty square, no crystals |
| `8` | empty square with 8 crystals (0–16) |
| `F1` | a White piece, by element letter and tier: **F**ire, **L**ightning, **W**ater, **S**hadow, **P**lant, **M**etal |
| `f1` | lowercase is Black |
| `P1+4` | a piece standing on 4 crystals |
| `w2!1` | a Black piece that has already taken 1 damage this turn (enemy pieces only) |
| `F1~` | a piece that has already acted this turn (it cannot act again) |

Squares are named like `c3`: column letter from the left, row number from the
top. White's home is `a1`. Black's home is the bottom-right corner (`e5` on a
5×5).

**Move notation**, used by `solution` and `tries`. It is resolved against the
board as it stands at that moment:

| Move | Meaning |
|---|---|
| `c1-c3` | move the piece on c1 to c3 (one declared trip; costs ceil(distance / Speed) actions) |
| `c3xc4` | the piece on c3 attacks c4 |
| `c1-c3xc4` | move, then attack from the landing square |
| `mine` | Mine & prepare: mining, then upkeep, then Prepare |
| `keep b2 c3` | at an upkeep choice, keep these tier-2 and tier-3 pieces (tier 1 is always kept, so `keep` alone keeps only tier 1) |
| `+F1@b2` | in Prepare, summon a tier-1 piece on b2 (it lands at your next turn start) |
| `^b2` | in Prepare, promote the piece on b2 |
| `end` | End turn |

A line is played for whoever is to move. A multi-turn `try` may therefore
spell out the enemy's turn too (for example `['mine', 'end', 'mine', 'end',
'mine']`, where the middle `mine end` is the enemy passing), but a try that
stops at your hand-over is usually clearer. The proof already checks every
reply.

**Puzzle fields** (`src/learn/types.ts`):

| Field | Default | Use |
|---|---|---|
| `goal` | required | see below |
| `turns` | 1 | your turns to reach the goal; the enemy replies in between |
| `side` | `'white'` | play Black only when that is the point |
| `banks` | 0 / 0 | starting crystals, e.g. `{ white: 4 }` |
| `actions` | 4 | actions left in your first turn (a mid-turn puzzle) |
| `prepare` | false | start in Prepare (mining is already done) |
| `homes` | false | show both homes and play home occupation and checkmate. Required for `home` and `summon` goals. Without it the homes are hidden and only elimination wins. |
| `reviewUpkeep` | false | always open the keep panel at upkeep |
| `pending` | none | summons already committed: `[{ at: 'b2', type: 'F1', owner: 'black' }]` |
| `freebie` | false | the forced first exposure may be solved by just ending the turn |
| `text` | generated | overrides the goal line. Avoid it: generated lines keep the grammar uniform. |

**Goals** (`src/learn/goals.ts`). Pieces are named by their **starting** square.

| Goal | Line | Judged |
|---|---|---|
| `{ kind: 'reach', flags: ['c3'] }` | Reach the flag this turn | the moment your pieces stand on every flag |
| `{ kind: 'reach', flags: ['c3'], piece: 'a1' }` | Get the Hi to the flag this turn | same, but that piece |
| `{ kind: 'mine', atLeast: 6 }` | Mine 6 crystals this turn | crystals mined across your turns, so it can be met at Mine & prepare |
| `{ kind: 'capture', targets: ['d4', 'e5'] }` | Capture the Sjór and the Hi this turn | the moment all are gone |
| `{ kind: 'eliminate' }` | Capture every enemy piece this turn | the enemy has no pieces, or you win the game any other way |
| `{ kind: 'home' }` | Occupy the enemy home until your next turn (or "Within 2 turns, occupy…") | you win by home checkmate (`#`) or occupation at your turn start, or win the game any other way |
| `{ kind: 'summon', type: 'F1', at: ['b3'], count: 1 }` | Start summoning a Hi on the flag this turn | the commitment in Prepare |
| `{ kind: 'summon', type: 'F1', arrive: true }` | Successfully summon a Hi | after the enemy's reply: it actually arrived |
| `{ kind: 'promote', to: 'F2' }` | Promote to Honō this turn | one more Honō of yours than at the start |
| `{ kind: 'bank', atLeast: 4 }` | Keep 4 crystals in the bank this turn | when your last turn ends |
| `{ kind: 'keep', pieces: ['b2'] }` | Keep the Irumbu this turn | when your last turn ends (survives upkeep) |
| `{ kind: 'survive' }` / `{ kind: 'survive', pieces: ['b2'] }` | Keep all your pieces safe / Keep the Muju safe | after the enemy's reply |
| `{ kind: 'deny' }` / `{ kind: 'deny', at: ['d4'] }` | Stop the enemy Hi from landing / Stop all 3 enemy summons from landing | right after your hand-over, when their summons land or are refunded (needs `homes: true` and enemy `pending` summons) |
| `{ kind: 'hold' }` | Don't let them win | after the enemy's reply (needs `homes: true`) |
| `{ kind: 'all', goals: [...] }` | joined with "and" | all at once |

The wording keeps two pairs of ideas apart. **Start summoning** commits a
summon in Prepare; **successfully summon** means it actually landed at your next
turn start. **Start occupying the enemy home** is a `reach` goal whose flag is
the enemy home (`homes: true`): standing there is enough. **Occupy the enemy home
until your next turn** is the `home` goal, the actual win: the defender's turn
cannot remove you (`#`).

A loss always fails. Going past the deadline fails. A one-turn line that can
no longer win is shown as failed at once in the app. A goal judged after the
reply already fails at the hand-over if a part the enemy cannot change (a
capture, a mine total, a summon) was missed. Winning the game outright always
solves a home or eliminate goal, so nobody is told they failed after winning.
`survive` counts pieces only: winning does not excuse a lost piece.

**What the proof checks** (`src/learn/verify.ts`):

- the board parses and the goal is undecided at the start;
- ending the turn at once does not solve it (unless `freebie: true`);
- the solver finds a solution, and your `solution` line is legal and wins
  (for a multi-turn puzzle, it wins against every reply);
- every `try` is legal and can no longer win, and the live enemy reply finds
  the refutation;
- an N-turn puzzle cannot be solved in N − 1 turns;
- pieces and enemies exist where the goal needs them (with no enemy piece, the
  game ends at Mine & prepare, so Prepare, replies and later turns never happen);
- your own pieces are not pre-damaged; the id starts with the arc id; the
  goal line is at most 64 characters;
- a home or eliminate goal can be won by its own kind of win, and no first
  turn wins only by the other kind (a cook that skips the lesson);
- no first turn of a one-turn puzzle wins the game while failing the puzzle
  (for example, capturing Black's last piece in a summon puzzle).

## The quality bar

- **One idea per puzzle,** stated in `idea`. If you cannot name what it
  teaches, cut it ("only add a level if we have something new to say").
- **The old way must fail.** From the second puzzle of an arc on, record the
  tempting wrong line in `tries`. If the naive idea also works, the puzzle
  does not teach the new one. Change the position until it fails.
- **Small and clean.** Use the smallest board that holds the idea (3×3–5×5
  early, 6×6–8×8 later, 10×10 only for the exam). Every piece and every
  crystal should matter. Enemy scenery must be there for a reason: to keep the
  game going, to block, or to be a try.
- **Forced first, then freer.** An arc's first puzzle should have essentially
  one thing to do. Twists may have several tempting lines that all fail but one.
- **Exact budgets teach.** Four actions, a bank of exactly the price, a reserve
  of exactly the Mining: tight numbers make the rule visible.
- **Keep two-turn puzzles tiny:** 1–3 enemy pieces, small boards, small banks.
  The enemy's reply is searched exhaustively, both in CI and live in the browser.
- **Do not reuse the tutorial's three positions:** a Muju walking a1→c3 on a
  3×3 to mine 3 of 8; a Black Honō approaching from f6 to remove a Muju on c3
  on a 6×6; an Irumbu running j2→j10 on the 10×10.
- **Vary the geometry** so the course does not feel like the same corner
  every time. Do not mirror positions mechanically, though: White's home is
  always top-left.

## Rules facts you will need

The canonical rules are in `SPEC.md`, and the stats are in `src/game/units.ts`.

**Turn:** Act (four shared actions) → Mine & prepare (every one of your pieces
takes min(Mining, reserve) from its square, then upkeep is paid) → Prepare
(summon, promote; no actions) → End turn. At the next turn start, the
mover's home occupation is checked, then elimination, then its summons land,
then its pieces heal.

**Movement:** orthogonal; one declared trip costs ceil(path / Speed) actions;
no passing through any piece, friend or foe; no zone of control. Speed 0 (Poṉ)
cannot move.

**Attack:** adjacent only, costs 1 action. Effective ATK = ATK ± 1 for
elements (floor 0) against DEF − damage. ≥ removes the piece; otherwise the
damage stays until the defender's own turn starts. No retaliation.

**Elements:** Fire & Lightning → Plant & Metal → Water & Shadow → Fire &
Lightning. The left side gets +1 against the right; the reverse gets −1. The
same pair is neutral. Defense never changes.

**Cleave:** a piece starts its turn with one attack. Each of its kills unlocks
one more. A survivor (even after a 0-damage hit) ends that piece's attacks for
the turn, and a teammate's kill does not reopen them. Each piece hits a given
target at most once per turn. Each attack costs an action.

**Mining:** at Mine & prepare only, from the square the piece ends on.
Reserves never refill. Mining 0: Radi, Umeme, Kimbunga, Loş. Fire always 1.

**Summoning:** tier 1 only. Fire / Lightning cost 3, Water / Shadow 4, Plant /
Metal 5. The square must be empty and inside a rectangle from your home corner
to any of your pieces with no enemy piece anywhere inside it. The summon lands
at your next turn start if its square is still empty and still inside a clear
rectangle; otherwise it vanishes and refunds its price. An arrival acts at
once. A pending summon blocks nothing.

**Promotion:** in Prepare: 4 crystals for tier 1 → 2, 8 for tier 2 → 3. Once
per piece per turn. It keeps its square and damage, and it cannot act again
this turn. This turn's income can pay for it. A piece that landed this turn
may promote.

**Upkeep:** right after mining, tier 2 pays 1 and tier 3 pays 2; tier 1 is
free. If the bank cannot cover it, you choose which tier-2 and tier-3 pieces
to keep (the rest are lost; tier 1 is always kept).

**Winning:** capture every enemy piece (at once, mid-turn), or occupy the
enemy home corner. An invader wins at its next turn start if still there. It
wins at once by home checkmate (`#`), judged when Prepare opens and after
every Prepare action, when the defender's whole army and four actions cannot
remove it. The invader must first survive its own upkeep. No `#` is awarded
while the defender already occupies your home. The defender may remove the
invader from a neighboring square; a corner has only two.

## Gotchas

1. **Capturing the last enemy piece wins at once,** so mining, Prepare and
   home goals never happen. Keep a spare enemy piece when the goal is not a
   capture.
2. **With no enemy piece at all,** the game ends at Mine & prepare
   (upkeep-elimination). That is fine for one-turn reach, mine and capture
   goals, but nothing else.
3. **An enemy piece on your home** wins at its next turn start and blocks all
   of your rectangles. Never put scenery there by accident.
4. **A harmless enemy piece:** a Poṉ cannot move, so it is ideal scenery far
   from your pieces. It still attacks any enemy that ends next to it, and it
   still blocks rectangles that contain it.
5. **Home goals need the invader to survive its own upkeep.** A tier-2 or
   tier-3 invader needs its rent in the bank, or mined that turn. The home
   square may have crystals.
6. **Two-turn home goals:** if your home is empty and an enemy can reach it,
   their counter-invasion comes first and wins.
7. **Mining is once per turn,** at Mine & prepare, for every one of your
   pieces, including ones that moved or attacked.
8. **Your own pieces heal** at your turn start, so never pre-damage them.
9. **Ids:** never renumber or reuse an id once it has shipped. Progress is stored under it.
10. **Enemy rent:** an enemy tier-2 or tier-3 piece with no bank and nothing to
    mine is released at its own upkeep, which counts as captured and can end
    the game by elimination. Bank exactly its rent (for example
    `banks: { black: 1 }` for a Straumr).
11. **A boxed target is not safe from a summoned second attacker.** The first
    attacker hits, steps aside, and the arrival steps in and hits too.
12. **With homes on, a mobile enemy near your home can refute a two-turn
    puzzle** by its own home checkmate, a rule beginners meet only in the
    Invasion arc. Keep enemies far from `a1` before then, or stand a piece of
    yours on it.
13. **`keep` goals work with no enemy piece** (judged when the turn ends, like
    mine and capture).
14. **Purchases on a non-final turn are always searched.** A big bank in a
    two-turn puzzle can exhaust the search even when the goal never needs a
    summon. Keep banks tight, or put an enemy piece inside every rectangle.

## The app's live budgets

The app runs the solver live, in a worker (`src/learn/worker/client.ts`):
30k nodes for "can I still win?" after each of your actions, 120k for the
enemy's reply, and 100k for a hint's line. The proof tool's budget is far
larger, so a puzzle can prove fine and still be too big to judge live.
`--live` measures this. Above budget the app degrades gracefully: no instant
dead-line flag, the refutation shown at the hand-over, and the authored line
used as the hint.

## Effective attack, every attacker against every defender at full health

Bold means the hit removes the defender outright.

| attacker \ defender (DEF) | Hi (1) | Honō (1) | Kagari (2) | Radi (1) | Umeme (1) | Kimbunga (1) | Sjór (2) | Straumr (3) | Ægirinn (4) | Loş (2) | Gölge (2) | Karanlık (2) | Muju (3) | Mallki (3) | Sach'akuna (4) | Poṉ (3) | Veḷḷi (4) | Irumbu (5) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hi (2) | **2** | **2** | **2** | **2** | **2** | **2** | 1 | 1 | 1 | 1 | 1 | 1 | **3** | **3** | 3 | **3** | 3 | 3 |
| Honō (3) | **3** | **3** | **3** | **3** | **3** | **3** | **2** | 2 | 2 | **2** | **2** | **2** | **4** | **4** | **4** | **4** | **4** | 4 |
| Kagari (4) | **4** | **4** | **4** | **4** | **4** | **4** | **3** | **3** | 3 | **3** | **3** | **3** | **5** | **5** | **5** | **5** | **5** | **5** |
| Radi (1) | **1** | **1** | 1 | **1** | **1** | **1** | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 2 | 2 | 2 | 2 | 2 |
| Umeme (2) | **2** | **2** | **2** | **2** | **2** | **2** | 1 | 1 | 1 | 1 | 1 | 1 | **3** | **3** | 3 | **3** | 3 | 3 |
| Kimbunga (3) | **3** | **3** | **3** | **3** | **3** | **3** | **2** | 2 | 2 | **2** | **2** | **2** | **4** | **4** | **4** | **4** | **4** | 4 |
| Sjór (2) | **3** | **3** | **3** | **3** | **3** | **3** | **2** | 2 | 2 | **2** | **2** | **2** | 1 | 1 | 1 | 1 | 1 | 1 |
| Straumr (2) | **3** | **3** | **3** | **3** | **3** | **3** | **2** | 2 | 2 | **2** | **2** | **2** | 1 | 1 | 1 | 1 | 1 | 1 |
| Ægirinn (3) | **4** | **4** | **4** | **4** | **4** | **4** | **3** | **3** | 3 | **3** | **3** | **3** | 2 | 2 | 2 | 2 | 2 | 2 |
| Loş (2) | **3** | **3** | **3** | **3** | **3** | **3** | **2** | 2 | 2 | **2** | **2** | **2** | 1 | 1 | 1 | 1 | 1 | 1 |
| Gölge (3) | **4** | **4** | **4** | **4** | **4** | **4** | **3** | **3** | 3 | **3** | **3** | **3** | 2 | 2 | 2 | 2 | 2 | 2 |
| Karanlık (4) | **5** | **5** | **5** | **5** | **5** | **5** | **4** | **4** | **4** | **4** | **4** | **4** | **3** | **3** | 3 | **3** | 3 | 3 |
| Muju (0) | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Mallki (1) | 0 | 0 | 0 | 0 | 0 | 0 | **2** | 2 | 2 | **2** | **2** | **2** | 1 | 1 | 1 | 1 | 1 | 1 |
| Sach'akuna (2) | **1** | **1** | 1 | **1** | **1** | **1** | **3** | **3** | 3 | **3** | **3** | **3** | 2 | 2 | 2 | 2 | 2 | 2 |
| Poṉ (1) | 0 | 0 | 0 | 0 | 0 | 0 | **2** | 2 | 2 | **2** | **2** | **2** | 1 | 1 | 1 | 1 | 1 | 1 |
| Veḷḷi (1) | 0 | 0 | 0 | 0 | 0 | 0 | **2** | 2 | 2 | **2** | **2** | **2** | 1 | 1 | 1 | 1 | 1 | 1 |
| Irumbu (2) | **1** | **1** | 1 | **1** | **1** | **1** | **3** | **3** | 3 | **3** | **3** | **3** | 2 | 2 | 2 | 2 | 2 | 2 |

