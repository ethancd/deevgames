The game is over. Write your reflection now, in the same session, using the
same effort you played with. Your FINAL message must be the complete
reflection in Markdown (nothing else). If your sandbox lets you write files,
also save the same text as `reflection.md` in your workspace directory.

Follow `reflection-template.md` (in your workspace) section by section. Rules
that will be checked mechanically before this record is trusted:

- Read `facts.md` in your workspace first, if it is there: a fact sheet computed
  mechanically from the room history (result, mined totals by revision, the
  kill-clock timeline and every kill, attacks, promotions, buys, passes, turn
  times). Cite numbers from facts.md; if your memory disagrees with it, the
  fact sheet is right.
- Cite an accepted action's revision number or a replay position for every
  factual claim in "Critical evidence" and "Updates to shared knowledge".
  A claim with no reference will be dropped by the publisher, not corrected.
- Use exactly the identity fields given at the start of this game (game ID,
  seat, handicap, tier, model/effort) — do not paraphrase them. For the
  remaining identity fields use: engine build/budget `{{engineIdentity}}`;
  starting memory version `{{snapshotVersion}}`; room `{{roomId}}`.
- Distinguish, explicitly, what you observed from what you are hypothesizing
  from what you verified as a legal alternative (checked with `muju_preview`
  or `muju_analyze`, if your tier allowed it) versus merely imagined. Winning
  does not make every earlier choice correct — say so if it doesn't.
- Under your own mistakes, name any turn that went past your per-turn time
  cap (or say none did), with its revision, and what the time went on.
- One pattern/weakness hypothesis, with a concrete condition that would
  disprove it — not a restatement of "the engine is strong/weak".
- One concrete next test (seat, handicap, position/strategy, and the
  observation that would distinguish it from a competing explanation). If
  this game produced no new strategic evidence, say that plainly instead of
  inventing a hypothesis to fill the section.
- No hidden chain-of-thought, no credentials, at most ~600 words.

You may call `muju_history` or `muju_observe` (if exposed) to look up
revision numbers, but never `muju_play`. When you are done, stop — do not call
any more `muju_*` tools. The game is
finished and no further action is legal.
