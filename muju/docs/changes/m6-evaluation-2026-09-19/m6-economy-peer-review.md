# M6 economy read-only peer review — 2026-09-19

No execution, source edits, engine/corpus/data access or outcome-based choices. Reviewed packed forecast, independent canonical oracle, event result shape, context counter integration and authored tests. Source owners were still finalizing work; hashes below identify this read snapshot, not a test freeze.

No material packed/reference mismatch identified in the scoped read. The paid Prepare path does not repeat income/rent; current unpaid Prepare uses ordinal0 and no new mining; root Act closes income before rent and later closures use1..6. The forecast uses actual replica lifecycle batches, so releasing an anchor or blocker affects the later batch and neither sibling arrival anchors another. Pending service is tied to root commitment squares and root-live ownership to original birth-order identities, avoiding reused-slot attribution. Refunds finance only cash after their resolved boundary and never enter service value. Actual paid rent and released root-live principal are charged once. The funded keep policy exactly follows cost descending then square ascending. The terminal stop and cap veto occur before later receipts can earn value. Counters survive the explicit cap exception and finally unmake each completed transition on the private copy; caller state remains untouched.

The Q16 ledger uses safe JS-number integer products, not signed32 shifts. The represented board/catalogue/horizon limits keep total finite mining, rent and released principal far below2^53; the large-release test crosses2^31 deliberately. Tests cover funded/released rows, phase ordinals, delayed/refunded batches, legal promotion timing, simultaneous sibling non-anchoring, first terminal stops and injected post-make proof cutoff with subsequent clean reuse. These are authored tests awaiting coordinator execution, not passes claimed by this review.

## Contract caveat sent to root and owner

Canonical `defaultUpkeepAction(false)` is not equivariant under rot180 plus seat swap: equal-cost rented units tie by absolute board square. Example: unpaid Prepare, cash1, own WaterII atC3 overreserve16 and ShadowII atD4 overreserve0, plus an opponent survivor. The original retains WaterII; the mirrored state retains ShadowII. The next cash-flow/PV can differ substantially. Current mirrored tests compare each orientation against canonical, which correctly checks parity but does not establish equality between mirrors. This is inherent in the approved named policy, not a packed implementation error. Root must either record the rotation limitation for this conditional policy or explicitly amend the policy and independent reference before claiming rotational symmetry. No silent oracle adjustment recommended.

Potential generic failures before entering the forecast try/finally or exceptions inside Replica.make before it returns were not injected here; the actual proof-cap path raises after a completed make and is covered by its explicit unwind test. No assertion of recovery from arbitrary corrupted typed-array inputs is made.

| Source | SHA-256 |
|---|---|
| muju/src/ai/hard/tables/phasing-economy.ts | bbb80b5604073bbc92ae320553e78c772542e9bc2dd143b5a1fa35a200700c49 |
| muju/src/ai/hard/tables/economy.ts | 0e1ee10f0349357e97d353bbd42be2142c94b9d72a97c77f4f6c3e88943e2ae6 |
| muju/src/ai/hard/tables/context.ts | 7dcf993157d0136e9c8821f7079ef19044abb9be3748a206f3671b2387dac6c3 |
| muju/lab/hard-ai/oracles/phasing-economy.ts | 5dde2359072edddbac037664d97189afbeeb5ce6c99d5421e6d2c7834540c2de |
| muju/tests/ai/hard/phasing-economy.test.ts | 4e36b2717d4007ee8549c4314344bd75fdc38c968db3580726896e077c167617 |
