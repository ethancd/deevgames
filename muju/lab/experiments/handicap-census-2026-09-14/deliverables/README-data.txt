MHT 3- and 4-crystal opening census. Rules v2.8, 14 September 2026.

The same 797 W1 endpoints are reused. H3 has 3,678 Black patterns and 2,931,337
legal W1/B1 states. H4 has 8,012 patterns and 6,385,505 states. All 9,316,842
requested joint states are in CSV files under states/. Each part has fewer than
1,048,576 rows and can be opened in Excel. Files are split by contiguous W1 IDs.

Read the accompanying PDF for interpretation and limits. These are exact legal
endpoint counts, with analyst-set provisional advantage scores, not win rates.
No B1 attack is possible in any enumerated state with action points left.

Reconstruction and keys
  states/*.csv: one row per legal (Handicap,W1_ID,Black_pattern_ID).
  white-patterns.csv: exact unchanged White coordinates, collections and reserves.
  black-patterns.csv: Black setup decision, exact types/coordinates/reserves and
    witnesses for every pattern. Join on the pattern IDs to recover a full board.
  initial-map.csv: initial reserve at each of the 100 squares.
  Black's first bank = handicap - spent + first income.
  The grant is not mined income. Black cumulative income = first income.
  After B1, White begins W2 with 4 AP, quiet count 2, all units have zero damage.
    Promotions leave Black with 3 pieces and future upkeep 1; purchases leave
    Black with 4 tier-1 pieces and upkeep 0. There are no missing/captured pieces.
  Replace the occupied squares of the initial map with the remaining reserves in
    the two pattern tables. Unoccupied deposits are unchanged. White bank equals
    its first mined income. Black has not yet paid the next turn's upkeep.
  Resignation, clocks, undo, move histories and inert flags are outside state
    identity. Identical same-type Black units are interchangeable; their ordering
    is canonical by definition ID then White-relative position. This avoids
    counting exchanges of two identical Hi or Sjor as different board states.
  A1 is White's upper-left home. J10 is Black's lower-right home.

Taxonomy
  White retains the original study's 8 orders, 35 genera and 205 species.
  Black order = spending family: 1 Save, 2 Buy Hi, 3 Buy Radi, 4 Buy Sjor,
    5 Buy Gol, 6 Promote Hono, 7 Promote Straumr, 8 Promote Sachita.
  Black genus = order, exact minimum AP, farthest Manhattan distance of a piece
    from Black's corner, and number of pieces outside the six home reserve cells.
  Black species adds per-unit terrain classes, income and spawn-size band.
    Bands are 0-5, 6-12, 13-20, 21+ empty squares. Classifications are descriptive;
    exact positions remain distinct records. Definitions are in census.json.
  Joint order = (White order-1)*8 + Black order.
  Joint genus key = White genus_Black genus.
  Joint species key = White species_Black species_White mask_Black mask.
    Keys are scoped to the handicap column. Mask differences separate tactics.
  This spending-first Black taxonomy differs from the no-handicap report's
    movement-first taxonomy. Species totals should not be compared as if the
    taxonomic definitions were unchanged.

Capture bits
  White mask targets Black unit slots 1/2/3/4 in black-patterns.csv, bits 1/2/4/8.
    A promoted or purchased unit changes those slot meanings. Use the table.
  Black mask targets White Hi/Sjor/Muju, bits 1/2/4.
  White is the actual W2 attacker. Black is a hypothetical fresh B2 on the
    unchanged board, after normal upkeep and healing, with no extra income.
  The screen includes one existing attacker, one affordable single promotion,
    or one affordable T1 purchase. It considers legal approach paths and one
    lethal attack within four AP. It excludes combined attacks, blocker clearing,
    chained purchases, post-kill retreat/recapture and favorable-exchange proof.
  A mask lists alternatives, not simultaneous promised captures.

Separate Straumr survival bound
  The starting Sjor promoted on B1 cannot be captured during W2 at H4. A relaxed
    action-and-crystal calculation covers all 19,128 White-position / Straumr-
    square pairs, permits unblocked approaches and independently ideal purchase
    squares, and includes combined attackers. Maximum optimistic damage is 2,
    below defense 3. See analysis/straumr-proof.json and straumr-bound.mjs.
  This proves that specific first-window survival only, not a win or W3 immunity.

Score components in the CSV
  Material_delta = White minus Black catalogue army value.
  Economy_delta = White minus Black E, where E = bank + .6*(next idle harvest-rent)
    + .3*(second idle harvest-rent). Rent is the upkeep on the current army.
  Space_delta = White minus Black S, where S = .1*empty spawn squares +
    .03*crystals on those squares. Access is not ownership or immediate income.
  White_opportunity/Black_opportunity = greatest opposing target liability among
    that side's capture mask, else zero. Liability = material + lost discounted
    net harvest + lost deployment score after removing the target alone.
  Opening_index = Mdelta + Edelta + Sdelta + .75*White_opportunity
    - .35*Black_opportunity. Positive favors White.
  Economic_index = Mdelta + 1.25*Edelta + .75*Sdelta + .5*Lw - .2*Lb.
  Spatial_index = Mdelta + .75*Edelta + 1.25*Sdelta + Lw - .5*Lb.
  Grades: B major <=-6; B clear <=-3.5; B slight <=-1.5; Close (-1.5,1.5);
    W slight <3.5; W clear <6; W major >=6, applied in this order.
  All weights/bands are uncalibrated choices. The material term is necessary now
    that armies differ; rent is necessary now that T2 units can already exist.
  Zero-handicap baseline recheck gives identical capture masks and grade counts;
    1,539 individual scores differ from the earlier JS implementation by at most
    0.01 because of floating-point rounding. There is no material strategic change.

Binary format and workbook encoding
  states-h{0,3,4}.bin uses row-major White IDs, then Black pattern IDs 1..width.
    Widths: 797 / 3,678 / 8,012. Each little-endian record is 24 bytes:
    offsets 0/4/8 float32 baseline score, White opportunity, Black opportunity;
    bytes 12/13 White/Black masks; bytes 14/15 minimum kill AP or 5 if absent;
    offsets 16/20 float32 economic and spatial score. NaN baseline = collision.
  Workbook State records packs values to avoid millions of separate Excel cells.
    Workbook strings start with S: (scores) or M: (masks), to enforce text type.
    After the prefix, four digits encode (score*100)+2000; XX/XXXX marks an
    illegal pair. Two hex digits encode White and Black masks. Each string runs
    W1 IDs 1..797. The longest cell is 3,190 characters, below Excel's limit.
    Position lookup decodes the stored exact index and masks. Flat CSV remains
    the primary machine-readable state table. Do not edit the encoded source.

Reproduction
  Source snapshot is under source/muju. Install package-lock.json dependencies.
  From source/muju, run the scripts in lab/experiments/handicap-census-2026-09-14:
    node --import tsx census.ts  (use its full relative path)
    node prepare.mjs            (use its full relative path)
    clang++ -O3 -std=c++17 [path]/score.cpp -o lab/results/handicap-census-2026-09-14/score
    lab/results/handicap-census-2026-09-14/score
    node [path]/summarize.mjs
    node [path]/straumr-bound.mjs
    node --import tsx [path]/verify.ts
    node --import tsx [path]/verify.ts --continuations
  The original census.json and analysis.json inputs are included at their original
    relative location. Fixed seeds and bounded-search settings are in verify.ts.
  The archive retains tested continuations; a later runtime/AI change can change
    search choices. No game rules were edited. Manifest hashes verify contents.
