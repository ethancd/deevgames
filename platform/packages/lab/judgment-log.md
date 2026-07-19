# Judgment Log — <Game Name> Balance Lab

Every autonomous ruling made during a balance lab run is recorded here:
question, options considered, ruling, rationale, blast radius, reversal cost.

Structure mirrors `muju/JUDGMENT_LOG.md`. Start a new numbered entry (`J-001`,
`J-002`, ...) for every ruling a lab session makes without stopping to ask —
legality-mode choices, adjudication thresholds, invariant additions, bot
tuning decisions, anything a reviewer would otherwise have to reverse-engineer
from a diff.

Design priors fixed by the game's owner (date, via plan review or direct
instruction — these are inputs, not autonomous rulings, recorded here for
traceability):

- **P-1 <prior name>:** <what was decided and why it's a design input, not a
  lab finding>.

---

## J-001: <short title>

- **Options:** (a) ...; (b) ...; (c) ...
- **Ruling:** <which option, and any qualifier>.
- **Rationale:** <why — cite the evidence: a series result, a CI, a sensitivity
  gate, a prior in this file>.
- **Blast radius:** <what this affects — one game, one bot family, the whole
  matchup matrix>. **Reversal cost:** <low/medium/high, and what it'd take to
  undo>.

<!-- Copy the J-001 block above for each new ruling. Keep entries in order;
     never renumber or delete a past entry — supersede it with a new one that
     references the old J-number instead. -->
