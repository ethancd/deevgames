# E8 measured results — 2026-09-07

Scripted games: **17,920**. Each candidate uses both seats and paired seeds.
Wins include material/stockpile adjudication at the cap. Natural wins exclude capped games. Read both columns.
These are scripted-policy results, not estimates of expert matchup balance.

## Fresh-seed Lightning confirmation

400 games per matchup (200 independent seed blocks, two seats). Intervals resample paired seed blocks 10,000 times; they cover sampling variation under these bots only.

| Opponent | Baseline wins | Candidate wins | Change, percentage points (95% paired bootstrap) | Baseline/candidate caps |
|---|---:|---:|---:|---:|
| Mono-lightning / Mono-fire | 120/400 | 235/400 | +28.7 (+21.5 to +35.8) | 0 / 0 |
| Mono-lightning / Mono-water | 0/400 | 0/400 | +0.0 (+0.0 to +0.0) | 0 / 0 |
| Mono-lightning / Mono-shadow | 2/400 | 44/400 | +10.5 (+7.5 to +13.5) | 0 / 1 |
| Mono-lightning / Mono-plant | 288/400 | 397/400 | +27.3 (+23.0 to +31.8) | 79 / 1 |
| Mono-lightning / Mono-metal | 9/400 | 135/400 | +31.5 (+26.5 to +36.5) | 6 / 0 |
| LightningRush / AntiRush | 2/400 | 185/400 | +45.8 (+41.0 to +50.5) | 398 / 215 |
| LightningRush / Turtle | 30/400 | 257/400 | +56.8 (+51.2 to +62.3) | 370 / 143 |
| LightningRush / Expand | 156/400 | 397/400 | +60.2 (+55.2 to +65.0) | 238 / 3 |

## All recorded cells

| Variant | A / B | Games | A wins | A natural wins | B natural wins | Caps | Illegal / invariant failures |
|---|---|---:|---:|---:|---:|---:|---:|
| baseline | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| baseline | Rush / Expand | 80 | 77 | 77 | 0 | 3 | 0 / 0 |
| baseline | AdaptivePressure / AntiRush | 80 | 41 | 38 | 0 | 42 | 0 / 0 |
| baseline | AdaptiveEconomy / Rush | 80 | 42 | 4 | 38 | 38 | 0 / 0 |
| baseline | Mono-lightning / Mono-metal | 80 | 2 | 2 | 77 | 1 | 0 / 0 |
| baseline | Mono-lightning / Mono-fire | 80 | 26 | 26 | 54 | 0 | 0 / 0 |
| baseline | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| baseline | Mono-plant / Mono-metal | 80 | 2 | 0 | 71 | 9 | 0 / 0 |
| baseline | Mono-plant / Mono-shadow | 80 | 25 | 22 | 55 | 3 | 0 / 0 |
| baseline | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| baseline | Greedy / Greedy | 80 | 39 | 37 | 37 | 6 | 0 / 0 |
| baseline | Balanced / Expand | 80 | 36 | 7 | 0 | 73 | 0 / 0 |
| combined | Rush / AntiRush | 80 | 17 | 17 | 0 | 63 | 0 / 0 |
| combined | Rush / Expand | 80 | 60 | 60 | 7 | 13 | 0 / 0 |
| combined | AdaptivePressure / AntiRush | 80 | 53 | 50 | 0 | 30 | 0 / 0 |
| combined | AdaptiveEconomy / Rush | 80 | 52 | 26 | 28 | 26 | 0 / 0 |
| combined | Mono-lightning / Mono-metal | 80 | 5 | 5 | 73 | 2 | 0 / 0 |
| combined | Mono-lightning / Mono-fire | 80 | 12 | 11 | 68 | 1 | 0 / 0 |
| combined | Mono-shadow / Mono-water | 80 | 1 | 1 | 79 | 0 | 0 / 0 |
| combined | Mono-plant / Mono-metal | 80 | 11 | 1 | 52 | 27 | 0 / 0 |
| combined | Mono-plant / Mono-shadow | 80 | 36 | 36 | 44 | 0 | 0 / 0 |
| combined | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| combined | Greedy / Greedy | 80 | 39 | 31 | 31 | 18 | 0 / 0 |
| combined | Balanced / Expand | 80 | 24 | 3 | 0 | 77 | 0 / 0 |
| confirm_base | Mono-lightning / Mono-fire | 400 | 120 | 120 | 280 | 0 | 0 / 0 |
| confirm_base | Mono-lightning / Mono-water | 400 | 0 | 0 | 400 | 0 | 0 / 0 |
| confirm_base | Mono-lightning / Mono-shadow | 400 | 2 | 2 | 398 | 0 | 0 / 0 |
| confirm_base | Mono-lightning / Mono-plant | 400 | 288 | 288 | 33 | 79 | 0 / 0 |
| confirm_base | Mono-lightning / Mono-metal | 400 | 9 | 9 | 385 | 6 | 0 / 0 |
| confirm_base | LightningRush / AntiRush | 400 | 2 | 2 | 0 | 398 | 0 / 0 |
| confirm_base | LightningRush / Turtle | 400 | 30 | 30 | 0 | 370 | 0 / 0 |
| confirm_base | LightningRush / Expand | 400 | 156 | 155 | 7 | 238 | 0 / 0 |
| confirm_lightning | Mono-lightning / Mono-fire | 400 | 235 | 235 | 165 | 0 | 0 / 0 |
| confirm_lightning | Mono-lightning / Mono-water | 400 | 0 | 0 | 400 | 0 | 0 / 0 |
| confirm_lightning | Mono-lightning / Mono-shadow | 400 | 44 | 43 | 356 | 1 | 0 / 0 |
| confirm_lightning | Mono-lightning / Mono-plant | 400 | 397 | 397 | 2 | 1 | 0 / 0 |
| confirm_lightning | Mono-lightning / Mono-metal | 400 | 135 | 135 | 265 | 0 | 0 / 0 |
| confirm_lightning | LightningRush / AntiRush | 400 | 185 | 185 | 0 | 215 | 0 / 0 |
| confirm_lightning | LightningRush / Turtle | 400 | 257 | 257 | 0 | 143 | 0 / 0 |
| confirm_lightning | LightningRush / Expand | 400 | 397 | 397 | 0 | 3 | 0 / 0 |
| engine-before-economy-fix | AIv2-hard-fast / Rush | 2 | 0 | 0 | 2 | 0 | 0 / 0 |
| engine-before-economy-fix | AIv2-hard-fast / Tier1Spam | 2 | 0 | 0 | 2 | 0 | 0 / 0 |
| engine-before-economy-fix | AIv2-medium-fast / Greedy | 2 | 0 | 0 | 2 | 0 | 0 / 0 |
| engine-before-economy-fix | AIv2-medium-fast / Random | 2 | 1 | 1 | 1 | 0 | 0 / 0 |
| engine | AIv2-hard-fast / Rush | 2 | 2 | 2 | 0 | 0 | 0 / 0 |
| fire | Rush / AntiRush | 80 | 17 | 17 | 0 | 63 | 0 / 0 |
| fire | Rush / Expand | 80 | 76 | 76 | 0 | 4 | 0 / 0 |
| fire | AdaptivePressure / AntiRush | 80 | 38 | 35 | 0 | 45 | 0 / 0 |
| fire | AdaptiveEconomy / Rush | 80 | 42 | 5 | 38 | 37 | 0 / 0 |
| fire | Mono-lightning / Mono-metal | 80 | 3 | 3 | 75 | 2 | 0 / 0 |
| fire | Mono-lightning / Mono-fire | 80 | 10 | 9 | 70 | 1 | 0 / 0 |
| fire | Mono-shadow / Mono-water | 80 | 1 | 1 | 79 | 0 | 0 / 0 |
| fire | Mono-plant / Mono-metal | 80 | 4 | 0 | 71 | 9 | 0 / 0 |
| fire | Mono-plant / Mono-shadow | 80 | 21 | 16 | 59 | 5 | 0 / 0 |
| fire | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| fire | Greedy / Greedy | 80 | 40 | 36 | 36 | 8 | 0 / 0 |
| fire | Balanced / Expand | 80 | 35 | 5 | 0 | 75 | 0 / 0 |
| lightning | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| lightning | Rush / Expand | 80 | 77 | 77 | 0 | 3 | 0 / 0 |
| lightning | AdaptivePressure / AntiRush | 80 | 41 | 38 | 0 | 42 | 0 / 0 |
| lightning | AdaptiveEconomy / Rush | 80 | 42 | 4 | 38 | 38 | 0 / 0 |
| lightning | Mono-lightning / Mono-metal | 80 | 2 | 2 | 77 | 1 | 0 / 0 |
| lightning | Mono-lightning / Mono-fire | 80 | 26 | 26 | 54 | 0 | 0 / 0 |
| lightning | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| lightning | Mono-plant / Mono-metal | 80 | 2 | 0 | 71 | 9 | 0 / 0 |
| lightning | Mono-plant / Mono-shadow | 80 | 25 | 22 | 55 | 3 | 0 / 0 |
| lightning | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| lightning | Greedy / Greedy | 80 | 39 | 37 | 37 | 6 | 0 / 0 |
| lightning | Balanced / Expand | 80 | 36 | 7 | 0 | 73 | 0 / 0 |
| lightning_early | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| lightning_early | Rush / Expand | 80 | 77 | 77 | 0 | 3 | 0 / 0 |
| lightning_early | AdaptivePressure / AntiRush | 80 | 41 | 38 | 0 | 42 | 0 / 0 |
| lightning_early | AdaptiveEconomy / Rush | 80 | 42 | 4 | 38 | 38 | 0 / 0 |
| lightning_early | Mono-lightning / Mono-metal | 80 | 31 | 31 | 49 | 0 | 0 / 0 |
| lightning_early | Mono-lightning / Mono-fire | 80 | 52 | 52 | 28 | 0 | 0 / 0 |
| lightning_early | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| lightning_early | Mono-plant / Mono-metal | 80 | 2 | 0 | 71 | 9 | 0 / 0 |
| lightning_early | Mono-plant / Mono-shadow | 80 | 25 | 22 | 55 | 3 | 0 / 0 |
| lightning_early | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| lightning_early | Greedy / Greedy | 80 | 40 | 39 | 39 | 2 | 0 / 0 |
| lightning_early | Balanced / Expand | 80 | 36 | 7 | 0 | 73 | 0 / 0 |
| metal | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| metal | Rush / Expand | 80 | 77 | 77 | 0 | 3 | 0 / 0 |
| metal | AdaptivePressure / AntiRush | 80 | 41 | 38 | 0 | 42 | 0 / 0 |
| metal | AdaptiveEconomy / Rush | 80 | 42 | 4 | 38 | 38 | 0 / 0 |
| metal | Mono-lightning / Mono-metal | 80 | 6 | 6 | 71 | 3 | 0 / 0 |
| metal | Mono-lightning / Mono-fire | 80 | 26 | 26 | 54 | 0 | 0 / 0 |
| metal | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| metal | Mono-plant / Mono-metal | 80 | 6 | 0 | 65 | 15 | 0 / 0 |
| metal | Mono-plant / Mono-shadow | 80 | 25 | 22 | 55 | 3 | 0 / 0 |
| metal | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| metal | Greedy / Greedy | 80 | 39 | 38 | 38 | 4 | 0 / 0 |
| metal | Balanced / Expand | 80 | 36 | 7 | 0 | 73 | 0 / 0 |
| plant | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| plant | Rush / Expand | 80 | 57 | 57 | 13 | 10 | 0 / 0 |
| plant | AdaptivePressure / AntiRush | 80 | 59 | 57 | 0 | 23 | 0 / 0 |
| plant | AdaptiveEconomy / Rush | 80 | 47 | 20 | 33 | 27 | 0 / 0 |
| plant | Mono-lightning / Mono-metal | 80 | 3 | 3 | 77 | 0 | 0 / 0 |
| plant | Mono-lightning / Mono-fire | 80 | 26 | 26 | 54 | 0 | 0 / 0 |
| plant | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| plant | Mono-plant / Mono-metal | 80 | 9 | 1 | 60 | 19 | 0 / 0 |
| plant | Mono-plant / Mono-shadow | 80 | 41 | 41 | 39 | 0 | 0 / 0 |
| plant | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| plant | Greedy / Greedy | 80 | 40 | 36 | 36 | 8 | 0 / 0 |
| plant | Balanced / Expand | 80 | 24 | 7 | 0 | 73 | 0 / 0 |
| plant_depth | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| plant_depth | Rush / Expand | 80 | 54 | 54 | 8 | 18 | 0 / 0 |
| plant_depth | AdaptivePressure / AntiRush | 80 | 41 | 40 | 0 | 40 | 0 / 0 |
| plant_depth | AdaptiveEconomy / Rush | 80 | 56 | 37 | 24 | 19 | 0 / 0 |
| plant_depth | Mono-lightning / Mono-metal | 80 | 2 | 2 | 77 | 1 | 0 / 0 |
| plant_depth | Mono-lightning / Mono-fire | 80 | 26 | 26 | 54 | 0 | 0 / 0 |
| plant_depth | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| plant_depth | Mono-plant / Mono-metal | 80 | 8 | 0 | 65 | 15 | 0 / 0 |
| plant_depth | Mono-plant / Mono-shadow | 80 | 35 | 34 | 45 | 1 | 0 / 0 |
| plant_depth | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| plant_depth | Greedy / Greedy | 80 | 40 | 32 | 32 | 16 | 0 / 0 |
| plant_depth | Balanced / Expand | 80 | 30 | 6 | 0 | 74 | 0 / 0 |
| role_package | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| role_package | Rush / Expand | 80 | 71 | 71 | 1 | 8 | 0 / 0 |
| role_package | AdaptivePressure / AntiRush | 80 | 41 | 40 | 0 | 40 | 0 / 0 |
| role_package | AdaptiveEconomy / Rush | 80 | 54 | 8 | 26 | 46 | 0 / 0 |
| role_package | Mono-lightning / Mono-metal | 80 | 31 | 31 | 49 | 0 | 0 / 0 |
| role_package | Mono-lightning / Mono-fire | 80 | 52 | 52 | 28 | 0 | 0 / 0 |
| role_package | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| role_package | Mono-plant / Mono-metal | 80 | 6 | 0 | 63 | 17 | 0 / 0 |
| role_package | Mono-plant / Mono-shadow | 80 | 57 | 55 | 23 | 2 | 0 / 0 |
| role_package | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| role_package | Greedy / Greedy | 80 | 40 | 38 | 38 | 4 | 0 / 0 |
| role_package | Balanced / Expand | 80 | 47 | 16 | 0 | 64 | 0 / 0 |
| shadow | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| shadow | Rush / Expand | 80 | 77 | 77 | 0 | 3 | 0 / 0 |
| shadow | AdaptivePressure / AntiRush | 80 | 41 | 38 | 0 | 42 | 0 / 0 |
| shadow | AdaptiveEconomy / Rush | 80 | 43 | 3 | 37 | 40 | 0 / 0 |
| shadow | Mono-lightning / Mono-metal | 80 | 2 | 2 | 77 | 1 | 0 / 0 |
| shadow | Mono-lightning / Mono-fire | 80 | 26 | 26 | 54 | 0 | 0 / 0 |
| shadow | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| shadow | Mono-plant / Mono-metal | 80 | 2 | 0 | 71 | 9 | 0 / 0 |
| shadow | Mono-plant / Mono-shadow | 80 | 36 | 29 | 44 | 7 | 0 / 0 |
| shadow | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| shadow | Greedy / Greedy | 80 | 39 | 36 | 36 | 8 | 0 / 0 |
| shadow | Balanced / Expand | 80 | 36 | 7 | 0 | 73 | 0 / 0 |
| specialists | Rush / AntiRush | 80 | 9 | 9 | 0 | 71 | 0 / 0 |
| specialists | Rush / Expand | 80 | 77 | 77 | 0 | 3 | 0 / 0 |
| specialists | AdaptivePressure / AntiRush | 80 | 41 | 38 | 0 | 42 | 0 / 0 |
| specialists | AdaptiveEconomy / Rush | 80 | 42 | 4 | 38 | 38 | 0 / 0 |
| specialists | Mono-lightning / Mono-metal | 80 | 1 | 1 | 76 | 3 | 0 / 0 |
| specialists | Mono-lightning / Mono-fire | 80 | 26 | 26 | 54 | 0 | 0 / 0 |
| specialists | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| specialists | Mono-plant / Mono-metal | 80 | 2 | 0 | 71 | 9 | 0 / 0 |
| specialists | Mono-plant / Mono-shadow | 80 | 25 | 22 | 55 | 3 | 0 / 0 |
| specialists | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| specialists | Greedy / Greedy | 80 | 39 | 38 | 38 | 4 | 0 / 0 |
| specialists | Balanced / Expand | 80 | 55 | 37 | 0 | 43 | 0 / 0 |
| water | Rush / AntiRush | 80 | 8 | 8 | 0 | 72 | 0 / 0 |
| water | Rush / Expand | 80 | 77 | 77 | 0 | 3 | 0 / 0 |
| water | AdaptivePressure / AntiRush | 80 | 40 | 40 | 0 | 40 | 0 / 0 |
| water | AdaptiveEconomy / Rush | 80 | 42 | 3 | 38 | 39 | 0 / 0 |
| water | Mono-lightning / Mono-metal | 80 | 2 | 2 | 77 | 1 | 0 / 0 |
| water | Mono-lightning / Mono-fire | 80 | 26 | 26 | 54 | 0 | 0 / 0 |
| water | Mono-shadow / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| water | Mono-plant / Mono-metal | 80 | 2 | 0 | 71 | 9 | 0 / 0 |
| water | Mono-plant / Mono-shadow | 80 | 25 | 22 | 55 | 3 | 0 / 0 |
| water | Mono-fire / Mono-water | 80 | 0 | 0 | 80 | 0 | 0 / 0 |
| water | Greedy / Greedy | 80 | 40 | 40 | 40 | 0 | 0 / 0 |
| water | Balanced / Expand | 80 | 46 | 21 | 0 | 59 | 0 / 0 |

## Provenance

Each JSON records its parameter patch, source-content SHA-256, seed base, timestamp and per-game outcomes. Engine runs use wall-clock search budgets, so exact engine replay may depend on machine load. The historical pre-economic-fix engine probe is deliberately retained separately; it is not part of the final engine result. The final engine.json contains only the completed two-game Rush cell; the broader run was stopped during Tier1Spam for runtime and is not an eight-game calibration result.

Source hashes differ as experiment definitions were added and AI-only scoring/resignation were repaired. The scripted catalogue comparisons do not call the AI search or resignation heuristic. An unchanged hash is not claimed across the entire campaign. Neither the old engine probe nor any comparison proves a comprehensive AI strength rating.

| Artifact | Games | Source hash |
|---|---:|---|
| baseline.json | 960 | `72fff946a70c52e803b10c8b9f5f2f205d13d56308ffabae3cc9e6d16a8c5b45` |
| combined.json | 960 | `72fff946a70c52e803b10c8b9f5f2f205d13d56308ffabae3cc9e6d16a8c5b45` |
| confirm_base.json | 3200 | `44919ebb8e4527452519af99379a095212a73c3d74a508fb6c3b93c63c471c72` |
| confirm_lightning.json | 3200 | `44919ebb8e4527452519af99379a095212a73c3d74a508fb6c3b93c63c471c72` |
| engine-before-economy-fix.json | 8 | `72fff946a70c52e803b10c8b9f5f2f205d13d56308ffabae3cc9e6d16a8c5b45` |
| engine.json | 2 | `2895f1caf2d122776f4abf933fcc0fbb9ca78325279dcb660db537d080e5c2d6` |
| fire.json | 960 | `72fff946a70c52e803b10c8b9f5f2f205d13d56308ffabae3cc9e6d16a8c5b45` |
| lightning.json | 960 | `d8c786fa38e8bac89b8d21c57300b0bca0e72f9656f0b3f1210caaa63054f5b9` |
| lightning_early.json | 960 | `6d4cdbe7c8527bf1ae703872cda3dbe1381f0f61e0d737c3689fc18d30562968` |
| metal.json | 960 | `72fff946a70c52e803b10c8b9f5f2f205d13d56308ffabae3cc9e6d16a8c5b45` |
| plant.json | 960 | `72fff946a70c52e803b10c8b9f5f2f205d13d56308ffabae3cc9e6d16a8c5b45` |
| plant_depth.json | 960 | `d8c786fa38e8bac89b8d21c57300b0bca0e72f9656f0b3f1210caaa63054f5b9` |
| role_package.json | 960 | `6d4cdbe7c8527bf1ae703872cda3dbe1381f0f61e0d737c3689fc18d30562968` |
| shadow.json | 960 | `6d4cdbe7c8527bf1ae703872cda3dbe1381f0f61e0d737c3689fc18d30562968` |
| specialists.json | 960 | `72fff946a70c52e803b10c8b9f5f2f205d13d56308ffabae3cc9e6d16a8c5b45` |
| water.json | 960 | `d8c786fa38e8bac89b8d21c57300b0bca0e72f9656f0b3f1210caaa63054f5b9` |
