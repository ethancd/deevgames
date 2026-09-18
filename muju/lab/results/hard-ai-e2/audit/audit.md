# E2.1 representation audit — measured tables

Positions: 373 (losses 28, exam 145, corpus 200).
Generator: hard@desktop, K=24, maxPlacePlans=16, maxPromotions=8.
Wall: 271.5 s.

## Place-phase legality

| Quantity | Positions | Share |
| --- | --- | --- |
| bank > 0 | 162 | 43.4 % |
| at least one affordable promotion | 74 | 19.8 % |
| two promotions jointly affordable | 27 | 7.2 % |
| a legal place prefix with >= 2 promotions | 31 | 8.3 % |
| enumeration capped | 4 | 1.1 % |
| spawn area tight (square abstraction may bite) | 163 | 43.7 % |

Legal place prefixes enumerated: 54226.
Of those, with >= 2 promotions: 36346 (67.0 %).
Of those, in a shape `buildCombos` cannot hold: 36346 (67.0 %).
Multi-promotion turns the production generator actually emitted: 0.

## Distribution of place-family counts per position

| distinct place families | positions |
| --- | --- |
| 1 | 262 |
| 2-4 | 40 |
| 5-16 | 41 |
| 17-64 | 18 |
| 65+ | 12 |

## Chosen turns from the analysed losses

Adviser turns classified: 28; in a shape the generator cannot express: 0.
Played turns classified: 28; in a shape the generator cannot express: 0.

## Bounded static preference signal

Positions with a legal >= 2-promotion prefix: 31.
Comparable (both sides scored): 31.

| signal | comparable | >=2 wins | wins by > 300 cc | median delta cc | max delta cc |
| --- | --- | --- | --- | --- | --- |
| place-only (uncapped, every prefix) | 31 | 1 (3.2 %) | 1 (3.2 %) | -968 | 316 |
| with action phase (top-N, capped) | 31 | 0 (0.0 %) | 0 (0.0 %) | -1156 | 0 |

Action-phase completions that hit their visit cap: 30. Prefix lists truncated to the top N: 23.

This is a STATIC signal: the engine's own stage0+stage1 evaluation at depth 0, with no reply search. It is not strength.

## Positions where >= 2 promotions win the static comparison

| id | bank | affordable promos | <=1 best cc | >=2 best cc | delta cc | place-only delta cc |
| --- | --- | --- | --- | --- | --- | --- |

