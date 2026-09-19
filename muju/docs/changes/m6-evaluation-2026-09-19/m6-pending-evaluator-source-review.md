# M6 pending/evaluator independent source review — 2026-09-19

Read-only evaluation review in `work/deevgames-phasing-m6`, base5d317407. No engine, canonical probe, test, corpus or outcome command ran during review. Parent subsequently granted a narrow economy snapshot producer correction; that is separately listed below and is unverified until next queued run. Copernicus owns consumer/kill edits, so this report pins the reviewed pre-correction consumer bytes and does not claim those edits accepted.

## Actionable finding: future disruption retains a released alternative anchor

At pinned `eval/pending.ts:40–46,51–75`, exposure uses root `p` for the victim's anchor set and future occupancy. `nextActProjection` adds paid batches but does not execute outgoing upkeep releases. The no-move service value correctly comes from the chronological economy forecast, so the two halves can describe different boards. This can leave nonzero service with risk0 even when the named bounded movement probe has a legal disruption on the actual intervening Act board.

Concrete authored source-level scenario (not executed here): White Act, bank0, White fire_2 G2(6,1) and free plant_1 B7(1,6); Black plant_1 D8(3,7). All live occupied squares have reserve0. White has paid plant_1 commitment B2(1,1) with reserve16. Use elimination victory and inactivity off to isolate the rule. White's outgoing bill releases fire_2 G2. B2 remains valid via B7 and therefore has positive pass-only service. At Black's incoming Act, D8→B6(1,5) costs4AP along D8→D7→C7→C6→B6 and intrudes the remaining B7 rectangle. B2 and every y<=1 square are more than4 steps away. The old helper still treats released G2 as a safe alternative anchor for every reachable endpoint, so it reports no disruption. This is a nonzero bootstrap PendingValue error, not merely a zero-weight diagnostic issue.

Root accepted the finding as an M6 blocker and authorized exact chronological windows, rather than a silent blanket-risk policy change. The same static-root limitation affects ArrivalThreat59's claimed actual next-own-Act horizon: a released target/attacker/anchor or pre-arrival terminal can change the board before the compared attack constructions. Its zero coefficient avoids immediate score impact but does not make the explicit provenance claim correct.

## Producer correction now saved, consumer acceptance pending

`EconResult.pendingEnemyAct` and `pendingOwnAct` are reusable copied PackedState|null snapshots captured from the EXISTING chronological forecast. Enemy window: current enemy Act has current AP/flags; future enemy Act includes actual releases/preceding batch/reset; enemy Prepare→victim arrival has no intervening Act. Own window: first actual incoming Act after the root paid batch and healing, including all-refund batches; terminal first means null. No extra Replica make/proof calls.

The independent canonical oracle retains corresponding immutable GameState snapshots and every authored parity case now compares their digests. A new control checks currentAP1, no Prepare window, full own AP4, cleared batch, storage reuse and clearing stale snapshots. Copernicus has the exact API and owns mirrored canonical released-anchor controls plus current-horizon same-occupancy attack comparisons with only new-arrival slots disabled. These producer/consumer changes still require the next frozen runtime/types row.

## Other reviewed contracts

- Principal partition is coherent at pinned pending.ts95 and features.ts485–489: full paidCost*100 exactly once in PendingValue, root-live catalogue principal only in stage0, bankLiquid/excess both100, root-live future net only in EconDelta23. Pending service is excluded from livePV and independently risk-selected. A refund/arrival is not future income/principal gain. Disabled overlapping weights are exactly zero in weights.ts20–26.
- Aside from the lifecycle finding, phase selection distinguishes current enemy Act remaining AP/current canAct flags, future full AP and reset, and current enemy Prepare's zero movement window. `voided` checks all supporting rectangles, and target occupation suffices. Movement-only, root-live-only, no-capture/no-multiunit limitations are explicit. A zero marker is not a general safety proof.
- The original two kill queries use the same root state, horizon, target healing, budgets and projected occupancy; includePendingAttackers toggles actor groups only at kill.ts315. Value counts each target once and requires all-table success/live-only failure, rather than inferring necessity from one selected plan. This is correctly labeled a bounded table diagnostic, but root accepted chronological snapshots as necessary to its M6 actual-horizon claim.
- Features form signed differences before truncation. Pending totals are Float64 cc derived from exact safe integer Q16; with at most100 commitments/side and finite1600 board resources, escrow+service fits Int32 feature storage. Root-live release/rent/income Q16 sums fit JS safe integers. This review covers supported shipped bootstrap values, not arbitrary pathological loaded coefficient magnitudes.
- `boundStage2` returns Infinity and Evaluator.evaluate unconditionally executes stage2 (features566; evaluate159–180). Thus no pending contribution can be silently dropped by the old finite bound. This is conservative correctness, not a performance-ready claim.
- Schema/version guards require62/18 typed vectors and current `muju-phasing-eval-1`, weights2, current file schema; JSON integer range is checked before Int32 conversion. Raw historical vectors are not padded. Labels remain separate from numeric identity as designed. Loader accepts current-version alternative coefficients; tuning/public-release authority is a separate coordinator gate.
- Evaluator prices only the delta of monotone economyProverCalls in finally. Full()/stage2 direct APIs have no meter parameter and expose counters via lastTables; external analysis callers must not call that search-meter evidence. Root/Copernicus own direct search/generation accounting already.
- Existing defaultUpkeep(false) uses absolute-square tie-breaking, so cross-rot180 forecast equality is not a universal property. Side-negation antisymmetry remains exact on one state; each mirrored state matching its own canonical oracle is a different test. Root/Copernicus already have the policy limitation; no policy change was made here.

## Reviewed consumer source pins

- `src/ai/hard/eval/pending.ts`: `8cb8b880cb10801fd707235fa91a38e69285007a672f3c4475d88bc7d8035a72`
- `src/ai/hard/eval/features.ts`: `c8f717c826e2dc8660d1cd175eeb68326a22e70b35378ce1cb9770f4ffb19afc`
- `src/ai/hard/eval/evaluate.ts`: `1adc5ff0bd41de19a4c69be1af62487b7952736a0198af5d3007cedc10a0fb3a`
- `src/ai/hard/eval/weights.ts`: `97d81ada72c320203c65c4012550ce2114816adf04d5fce1c4e665316e1a6d0a`
- `src/ai/hard/tables/kill.ts`: `776853e6f35baffd17d093669b9f376d1f70d23f4330a38a8a8d34a004fb4705`

## Snapshot producer pins (new, unexecuted)

- `src/ai/hard/tables/economy.ts`: `c987afed9385d8959643ecfcf421d3efd23d760160b8e7742c91e7dc4daae0b7`
- `src/ai/hard/tables/phasing-economy.ts`: `87668ffdc322f680ea6bbae3336f7f2c14a14527ddbb1ac81682b4df045d361f`
- `lab/hard-ai/oracles/phasing-economy.ts`: `8878eadd91b4c960ac6b5a9630b9e321f1892ed331a677cb85a46cc36d9f045d`
- `tests/ai/hard/phasing-economy.test.ts`: `89f842533b5a9cde96e292ffe09785579d101ddb85f88ab42abb90809f1354cf`

## In-progress consumer drift and follow-up source read

Copernicus then changed pending.ts to SHA256 `c95112540789afac42612c1f45a29081d8816fe03c2a5943688284a4d5968d49`, kill.ts to `7ead8995606575554969e0c6f02b8f9fc28658a65310e0e89ead5a023fcfad98`. A second source-only read confirms it consumes pendingEnemyAct for actual occupancy/anchors/current flags, restricts movement to surviving root-live slot+ord identities, and consumes pendingOwnAct for two current-horizon queries. excludedAttackerSlots skips actor candidates only; blocking occupancy remains identical. This closes the specific released-alternative-anchor construction in source, subject to canonical regression/runtime acceptance. The original reviewed source pins above intentionally remain the pre-correction versions.

A remaining contract nuance was sent to root for disposition: a legal endpoint during enemy Act is not necessarily a surviving intrusion at victim arrival, because enemy rent lies between them. Concrete unexecuted authored diagram: current Black Act bank0, Black fire_2 J10 and immobile metal_1 J9, White plant_1 H8, White paid plant_1 B2 with16 reserve; all other reserves0, elimination/off. Fire2 can enter H8's rectangle within4AP but B2 is beyond its8 movement-step reach, so no reachable destination supplies income and it must be released at outgoing rent; Metal1 cannot move. The endpoint-only helper marks risk1 and positive denied service even though that mover cannot survive to disrupt the batch. Conservative exposure may legitimately include such a false positive if explicitly adopted/documented; it must not be reported as a demonstrated actual-arrival disruption. No producer/runtime change made for this question; root decides the frozen-contract interpretation before acceptance.

Root subsequently authorized a bounded necessary-survival cash filter. Copernicus owns it: hypothetical endpoint income from all live enemy miners, finite reserves and current bank must cover at least the mover's own upkeep; other paid units can be legally released. Free movers pass this necessary filter. Copernicus reports mirrored unfunded/funded renter controls authored. This closes the specific unavoidable-release false positive in design; it does not assert complete opponent-turn or terminal-aware disruption search, and no execution evidence is claimed here.

Root also found the snapshot cache's new identity dependency. The producer owner added a private exact context guard for live ord/originIds, pending pendOrd/pendIds, and both next-sequence counters, retaining slotSquares and existing public hashes. Source-only correction details and seven new controls are recorded in the economy implementation note. New pins: context.ts `e95ea7b0404b02ca0239a28d97ff3e28c55fd685059acf2999d6ad461189b4ec`; phasing-economy.test.ts `1b0caa29cc015c4fb9a3082b13e13aceee881ff5e64fd441b3d7f69f3b41719f`. Source paused pending root's coordinated runtime/types checks.
