# Lane 2 (measurement) proposed amendments

Proposals only. Lane 2 never applies a rule change; the coordinator decides.

## L2-A1. Opening pools have one driver bot, not five

- Original bar: `lab/hard-ai/ladder/openings/generate.ts` declares
  `DRIVER_BOTS = ['Random', 'Rush', 'Greedy', 'Expand', 'Balanced']` and
  `ALLOCATION.md` treats driver bot as a diversity axis ("the pool is emitted
  in attempt order, which correlates ply length and driver bot with position").
- Observed: every accepted row of every pool has an attempt index divisible by
  5, so every row was driven by `Random`. Counts of attempt index mod 5:
  `e1-dev` 48/48 at 0, `e1-val` 32/32, `e1-sealed` 32/32, `e1-val2` 32/32,
  `e2-val` 64/64. Only `e0-openings.jsonl`, generated with no exclusions, holds
  non-`Random` rows (9 at 0, 4 at 1, 3 at 2). The cause is the interaction of
  `s % PLY_TARGETS.length` and `s % DRIVER_BOTS.length`: the four non-`Random`
  drivers draw ply targets that pass early ("shorter than 2 plies", 368 of 802
  rejections in the `e2-val` run) or repeat a position already accepted.
- Proposed bar: either (a) document that opening diversity comes from the seed
  and the ply target, not from the driver bot, and drop the driver claim from
  `ALLOCATION.md`'s split rule; or (b) decouple the two cycles (draw the driver
  from the derived RNG rather than from `s`) and regenerate future pools only.
- Reason: the shuffle rationale in `ALLOCATION.md` names driver bot as a
  correlate the shuffle breaks up, and a reader will infer a driver mix that
  the files do not contain. A pool drawn from one scripted bot is a narrower
  independence source than A15's text implies.
- Effect if adopted: (a) is documentation only and changes no committed byte.
  (b) changes the generator, so every future pool differs from what the current
  seed would produce; `e0-openings.jsonl` and the E1 files must stay
  reproducible under the old path or their allocation test fails, so (b) needs
  a flag, not an edit in place. `e2-val.jsonl` is already generated and is used
  as it stands either way.
