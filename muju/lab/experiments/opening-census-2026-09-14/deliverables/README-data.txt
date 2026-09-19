MHT v2.8 opening census - 14 September 2026

Scope: current fixed 504-crystal map; four shared actions; zero handicap;
standard initial units. W1/B1 are completed player turns including mining.
Board states merge histories and inert/UI/clock fields, not piece destinations.
This is an exhaustive legal endpoint census with provisional heuristic grades.

Files
  all-B1-states.csv: 635,203 legal complete first-round states, one per row.
  all-W1-states.csv: 797 patterns, including rotated Black coordinates and witnesses.
  census.json: initial state/map, source hashes, exact W1 enumeration.
  analysis.json: derived features, taxonomy definitions and statistics, conditional
    best responses, sensitivity totals, and full joint-species lookup.
  joint.bin: 797 x 797 fixed 12-byte records, row-major W1 then B1. Offset 0:
    float32 opening index (NaN for the six illegal collisions); byte 4 White target
    mask; byte 5 Black hypothetical mask; offset 6 uint32 joint-species ID;
    bytes 10/11 minimum screened kill AP for White/Black, or 5 when unavailable.
  verification.json: engine validation counts and selected legal capture witnesses.
  continuations.json: 38 bounded W2/B2 lines with actions, banks and final pieces.
  source/: source snapshot and three census scripts in their original paths.
  manifest.json: archive member sizes and SHA-256 digests (excluding itself).

Coordinates and IDs
  A1 is the upper-left White home; J10 is lower-right Black home.
  Squares in code are n = 10*y+x, x/y zero-based; rotation is n -> 99-n.
  Pattern IDs 1..797 refer to distinct White endpoints; Black uses the same pattern
    rotated 180 degrees. IDs are for this snapshot, not permanent opening names.
  Joint State_ID is W{White pattern}-B{Black pattern}; 6 combinations are illegal.
  Witnesses give one legal sequence of one-action destinations, ending the turn.
  Minimum actions is exact BFS depth. Shortest sequences count all shortest
    atomic destination sequences; they do NOT count all histories or UI shortcuts.

Full board reconstruction after B1
  Put the six original T1 units on the six recorded squares, with zero damage.
  Use the initial map and replace the six occupied cell reserves with their
    recorded remaining reserves. All other deposits remain unchanged.
  Set banks as recorded; income counters equal banks; White begins W2 with 4 AP;
    quiet count is 2; upkeep due is zero; the game remains playing.
  W1 is analogous, with original Black units, zero Black bank and untouched
    Black deposits; Black begins B1, quiet count 1.
  Resignation, clocks, undo/history and UI selections are outside the census.

all-B1-states.csv columns
  State_ID, W1_ID, B1_pattern: keys described above.
  Joint_order: (White order-1)*8 + Black order.
  Joint_genus: White genus ID-Black genus ID (text key, not subtraction/date).
  Joint_species: integer ID in analysis.json speciesStats or workbook Joint species.
  W_Hi ... B_Muju: exact final coordinates.
  W_bank/B_bank: crystals after first collection.
  W_Hi_reserve ... B_Muju_reserve: crystals left under each final piece.
  Economy_delta: White E minus Black E.
  Space_delta: White S minus Black S.
  W_capture_mask: actual W2 single-unit capture targets.
  B_hypothetical_capture_mask: Black fresh-turn targets on unchanged board/bank;
    this is NOT the actual B2 response after White acts.
  Opening_index: baseline model, rounded to 2 decimals.
  Grade: estimated advantage band of baseline model, not a win probability.
  Economy_emphasis_index/Space_emphasis_index: alternative analyst weightings.
  Import Joint_genus and State_ID as text if a spreadsheet tries to convert dates.

Taxonomy
  Order numbers correspond to endpoint-displaced piece subsets:
    1 hold, 2 Hi, 3 Sjor, 4 Hi/Sjor, 5 Muju, 6 Hi/Muju,
    7 Sjor/Muju, 8 all three. Returning to a starting square is not displacement.
  Genus adds per-piece ceil(Manhattan displacement / Speed). This describes
    geometric demand; legal minimum AP is separately enumerated through blockers.
  Species adds terrain categories, first bank, and spawn-size band:
    small 0-5, medium 6-12, large 13-20, wide >=21 empty legal squares.
  Terrain: home, dry, east/south expansion, central reserve, near/outer ground.
    Black classification is relative to its 180-degree rotation.
  Joint species key = W species-B species-W capture mask-B capture mask.
  Capture bits: 1 Hi, 2 Sjor, 4 Muju. Mask 3 means either of two independent
    targets has a capture line, not that both captures fit in one turn.
  Capture masks distinguish tactics within geometric species. Exact destinations
    and score ranges preserve other meaningful within-species variance.

Model
  E = bank + .6*next idle harvest + .3*second idle harvest.
  S = .1*empty spawn squares + .03*crystals on those squares.
  Liability = captured unit catalogue cost + lost discounted idle harvest +
    loss of S after removing that target alone.
  Lw/Lb = maximum opposing liability among that side's screened targets, else 0.
  Baseline = Ew-Eb + Sw-Sb + .75*Lw - .35*Lb.
  Economic = 1.25*(Ew-Eb) + .75*(Sw-Sb) + .5*Lw - .2*Lb.
  Spatial = .75*(Ew-Eb) + 1.25*(Sw-Sb) + Lw - .5*Lb.
  B major <=-6; B clear <=-3.5; B slight <=-1.5; Close (-1.5,1.5);
    W slight <3.5; W clear <6; W major >=6, evaluated in that order.
  Near-best = no more than 1.00 above the lowest baseline score for that W1.
  All weights/bands are uncalibrated analyst choices. Counts weight distinct
    positions uniformly, not by player frequency or likelihood.
  Screen covers one existing unit, one affordable T2 promotion, or one affordable
    T1 purchase through current blockers in <=4 AP. It excludes combined attacks,
    blocker clearing, chained purchases, post-kill retreat and recapture proof.

Validation and reproduction
  All 797 W1 witnesses were replayed against production rules; 3,120 one-action
    successors cross-checked. Fresh B1 BFS for each W1 audited 2,486,625 edges.
  293 joint positions were audited for settlement, conservation, spawn and 586
    complete capture masks (6,878 engine-validated capture lines).
  38 selected pairs received bounded W2/B2 continuation searches. Seeds and
    limits are in verify.ts. The full game is not solved; evaluations disagree.
  From source/muju, install dependencies matching package-lock.json, then:
    node --import tsx lab/experiments/opening-census-2026-09-14/census.ts
    node lab/experiments/opening-census-2026-09-14/analyze.mjs
    node --import tsx lab/experiments/opening-census-2026-09-14/verify.ts
  The default results directory is lab/results/opening-census-2026-09-14.
  Unit instance IDs can vary on recreation; board pattern IDs are deterministic.
  The archive preserves the tested lines, not a promise of identical future AI
    search results across runtime/library changes. No game rules were edited.
