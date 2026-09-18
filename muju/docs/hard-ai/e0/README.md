# E0 "Trust the contest" — document index

Epic E0 of `../EPIC-PLAN-2026-09-16.md` §4. Read in this order.

1. `E0.1-BASELINE-IDENTITY.md` — what the ladder measures, frozen by content:
   tree hashes, resolved engine configurations, the adapter lifecycle against the
   shipped worker, and §7's rule for when a recorded row is fresh.
2. `E0.2-E0.4-RECORD.md` — what the turn-allowance, statistics and
   openings/artifacts slices built, the policy decision inside each, the test
   that pins it, and the gaps left open.
3. `E0.5-RESOURCE-PROBE.md` — the two-heavy-process queue, what it does and does
   not gate, test timeouts, and the cold/warm latency and memory probe.
4. `E0.6-RELEASE-CONTRACT.md` — every inherited M19/M20 requirement inventoried
   against the code: runnable, unsupported or impossible. Changes nothing.
5. `AMENDMENTS-PENDING.md` — A1-A15, the proposals: every place the inventory
   or the pilot found a MILESTONES.md bar unrunnable, ambiguous or contradicted.
   Each entry keeps the original bar, the observation and the options, for the
   record; the decision is not here.
6. `E0-PILOT-REPORT.md` — the plumbing pilot: commands, per-run results, the
   forecast, the decision record and the anomalies it found.
7. `AMENDMENTS-DECIDED.md` — the decision on each of A1-A15, recorded
   2026-09-16 under authority Ethan delegated that day, with the reason and what
   changes in code or process. This is the operative file: an implementer cites
   an entry here, never the proposal it closed, and a bar stays as MILESTONES.md
   writes it except where an entry says otherwise.

## Anomaly and amendment namespaces

Three indexes run through these files and none is the same series.

- `A1`, `A2`, … are AMENDMENTS: proposed in `AMENDMENTS-PENDING.md`, decided in
  `AMENDMENTS-DECIDED.md`. An A-number names something proposed and now settled.
- `P1`, `P2`, … are ANOMALIES observed in a run, in `E0-PILOT-REPORT.md` §7.
  A P-number names something that happened.
- `P1`-`P5` in the `Prov` column of `E0.6-RELEASE-CONTRACT.md` are PROVENANCE
  codes local to that file, defined in its header. They are not anomalies.
