> Correction: This inventory omitted finished games that had not yet reached the archive deadline. Five additional human–Codex Phasing matches were recovered. See [corrected Phasing review](phasing-metal-review.md). The original eight-match count is not a complete inventory.

# Online Muju match inventory and first-pass patterns

Snapshot retrieved September 17, 2026 (America/Chicago); the Phasing match was still in progress.

The public API listed 27 archived rooms and 2 active rooms, with no further archive page. Eight appear to be real matches based on occupied seats named Codex, Claude, Claude (Fable), Deev, or DeevBrain and actual play. This is a name-based classification, not a verified account identity or explicit test flag. The other 21 were named tests/scouts/QA/release checks or unjoined rooms. Deev and DeevBrain are treated as likely user aliases. This inventory covers rooms retained and exposed by this server, not proof that every historical game ever played survives.

## Match inventory

| Match | Rules | Last round | Result | Detailed score | Retained command entries |
|---|---|---:|---|---|---:|
| [Codex (White) vs Claude (Black)](https://deevgames-muju.onrender.com/watch/lcjfyn) | standard | 14 | Codex won (resignation) | 161 events, complete from round 1 | 29 |
| [Claude (White) vs Codex (Black)](https://deevgames-muju.onrender.com/watch/opclcl) | standard | 12 | Codex won (resignation) | 122 events, complete from round 1 | 23 |
| [Codex (White) vs Claude (Fable) (Black)](https://deevgames-muju.onrender.com/watch/komdmi) | standard | 11 | Codex won (resignation) | 133 events, complete from round 1 | 22 |
| [Claude (White) vs Codex (Black)](https://deevgames-muju.onrender.com/watch/loakmh) | standard | 17 | Claude won (resignation) | 200 events, incomplete; starts round 3 | 34 |
| [Deev (White) vs Codex (Black)](https://deevgames-muju.onrender.com/watch/cwkxis) | standard | 18 | Abandoned; no winner | 1 events, incomplete; starts round 18 | 100 |
| [DeevBrain (White) vs Codex (Black)](https://deevgames-muju.onrender.com/watch/brposr) | standard | 7 | DeevBrain won (home-occupation) | 0 events, incomplete; starts round 7 | 52 |
| [DeevBrain (White) vs Codex (Black)](https://deevgames-muju.onrender.com/watch/qirvii) | standard | 3 | Codex won (home-occupation) | 0 events, incomplete; starts round 3 | 10 |
| [Codex (White) vs Claude (Black)](https://deevgames-muju.onrender.com/watch/walkky) | phasing | 10 | Ongoing | 158 events, complete from round 1 | 19 |

## First-pass patterns in the four completed Codex–Claude games

Codex won 3 and Claude won 1, all by resignation. White won 3, but the sample is too small and the settings varied, so this does not establish a first-player advantage. Two games have an explicit Black crystal handicap of 3 in their snapshots. The older two have no explicit handicap field.

| Room prefix | Winner | Winner / loser mined crystals | Winner / loser upkeep paid | Winner / loser captures |
|---|---|---:|---:|---:|
| f584383b | Codex | 198 / 68 | 45 / 23 | 6 / 6 |
| 9f822d24 | Codex | 125 / 75 | 26 / 15 | 6 / 3 |
| 99488f4d | Codex | 156 / 61 | 16 / 0 | 11 / 6 |
| 0a56f850 | Claude | 208 / 161 | 19 / 54 | 5 / 13 |

- The winner mined more crystals in all four recorded samples, and also had more mining income after subtracting recorded upkeep. This is an association, not evidence that income alone caused victory.
- Captures were a weaker signal: in Claude’s round-17 win, Claude made 5 recorded captures to Codex’s 13, while mining 208 crystals to 161 and paying 19 upkeep to 54. That makes economic efficiency and replacement capacity worth examining alongside tactics. That game’s detailed recording begins in round 3, so these are partial-game totals.
- Plant-1 was the most frequently purchased unit for the winning side in all four recorded samples (11, 6, 10, and 14 purchases). A deeper review should distinguish productive miner placement from simply buying many miners.
- Across the three fully recorded standard games, Codex’s openings included early forward movement and early contact: a Water-2 attack in round 3 as Black; a Lightning-1 raid in round 3 as White; and a Water-2 central advance in round 3 in the other White game. This is a candidate stylistic pattern, not an engine evaluation of the moves.

## Human-game coverage

The two DeevBrain matches ended with one win each, both by home occupation. Their detailed event scores are absent, but 52 and 10 command entries remain, respectively. Those commands may support reconstruction using the matching historical rules; this pass did not reconstruct them. The Deev match was abandoned in round 18, with no official winner. Its final board and the latest 100 command entries remain, but earlier commands have been truncated. The surviving final board has five White pieces versus one Black piece; that alone is not a proven win.

## Limits and next analysis

The ongoing Phasing match should be analyzed separately from standard games: it uses a different ruleset and an explicit Black handicap of 8. Purchase/arrival/refund events must be accounted for together when studying its economy. Archived timestamps and migrated creation timestamps should not be treated as exact original playing dates.

Useful next measures: opening routes and first contact, miner survival and income per purchase, upkeep burden, promotion timing, AP spent on repositioning versus productive threats, and the positions preceding resignations. Counterfactual blunder claims require board reconstruction and analysis under each match’s historical rules.

Raw public archive, lobby, room snapshots, and detailed scores are saved beside this report. Histories were fetched with after=0 and limit=200; all eight responses reported hasLater=false. The current ongoing game may now have additional moves.
