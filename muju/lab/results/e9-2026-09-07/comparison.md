# E9: component tests and fresh-seed confirmation

**12,800 completed games; 0 illegal actions; 0 invariant failures.**

Baseline is the frozen v1.2 catalogue; all variants use the corrected fc854fb transition. Catalogue patches, source hashes, seeds and every completed outcome are recorded in the neighboring JSON files.

## Fresh-seed confirmation

200 games per matchup (100 seed blocks, both seats). Natural wins exclude turn-limit adjudication. Intervals resample paired seed blocks 10,000 times and describe these policies only. Zero-variation intervals do not imply certainty outside the observed seeds/policies.

| A / B | Baseline natural wins | v1.3 natural wins | Natural-win change, percentage points (95% bootstrap) | Baseline/v1.3 caps | Baseline/v1.3 total wins |
|---|---:|---:|---:|---:|---:|
| Rush / AntiRush | 26/200 | 26/200 | +0.0 (+0.0 to +0.0) | 174 / 174 | 26 / 26 |
| Rush / Expand | 193/200 | 147/200 | -23.0 (-29.5 to -16.5) | 7 / 38 | 193 / 147 |
| AdaptivePressure / AntiRush | 111/200 | 126/200 | +7.5 (+4.0 to +11.5) | 89 / 74 | 113 / 126 |
| AdaptiveEconomy / Rush | 8/200 | 65/200 | +28.5 (+23.0 to +34.0) | 108 / 65 | 116 / 130 |
| Mono-lightning / Mono-metal | 7/200 | 61/200 | +27.0 (+20.0 to +34.0) | 4 / 0 | 7 / 61 |
| Mono-lightning / Mono-fire | 62/200 | 126/200 | +32.0 (+23.5 to +40.5) | 0 / 0 | 62 / 126 |
| Mono-shadow / Mono-water | 0/200 | 0/200 | +0.0 (+0.0 to +0.0) | 0 / 0 | 0 / 0 |
| Mono-plant / Mono-metal | 0/200 | 0/200 | +0.0 (+0.0 to +0.0) | 20 / 47 | 10 / 24 |
| Mono-plant / Mono-shadow | 57/200 | 87/200 | +15.0 (+9.5 to +20.5) | 9 / 3 | 66 / 90 |
| Mono-fire / Mono-water | 0/200 | 0/200 | +0.0 (+0.0 to +0.0) | 0 / 0 | 0 / 0 |
| Balanced / Expand | 16/200 | 18/200 | +1.0 (-5.0 to +7.0) | 184 / 182 | 107 / 72 |
| LightningRush / AntiRush | 4/200 | 95/200 | +45.5 (+38.0 to +53.0) | 196 / 105 | 4 / 95 |
| LightningRush / Turtle | 25/200 | 146/200 | +60.5 (+53.0 to +67.5) | 175 / 54 | 25 / 146 |
| LightningRush / Expand | 77/200 | 189/200 | +56.0 (+48.5 to +63.5) | 121 / 9 | 77 / 189 |
| AdaptiveEconomy / LightningRush | 28/200 | 44/200 | +8.0 (+0.0 to +16.0) | 167 / 46 | 195 / 90 |
| Balanced / LightningRush | 96/200 | 153/200 | +28.5 (+20.0 to +37.0) | 84 / 7 | 176 / 160 |

## Component screen (40 games per cell)

| Variant | A / B | Natural A wins | Natural B wins | Caps | Total A wins |
|---|---|---:|---:|---:|---:|
| baseline | Rush / AntiRush | 2 | 0 | 38 | 2 |
| baseline | Rush / Expand | 39 | 0 | 1 | 39 |
| baseline | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| baseline | AdaptiveEconomy / Rush | 2 | 18 | 20 | 22 |
| baseline | Mono-lightning / Mono-metal | 1 | 39 | 0 | 1 |
| baseline | Mono-lightning / Mono-fire | 12 | 28 | 0 | 12 |
| baseline | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| baseline | Mono-plant / Mono-metal | 0 | 33 | 7 | 4 |
| baseline | Mono-plant / Mono-shadow | 10 | 27 | 3 | 13 |
| baseline | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| baseline | Balanced / Expand | 5 | 0 | 35 | 20 |
| baseline | LightningRush / AntiRush | 0 | 0 | 40 | 0 |
| baseline | LightningRush / Turtle | 4 | 0 | 36 | 4 |
| baseline | LightningRush / Expand | 10 | 2 | 28 | 10 |
| baseline | AdaptiveEconomy / LightningRush | 2 | 0 | 38 | 40 |
| baseline | Balanced / LightningRush | 17 | 6 | 17 | 33 |
| conservative | Rush / AntiRush | 2 | 0 | 38 | 2 |
| conservative | Rush / Expand | 37 | 0 | 3 | 37 |
| conservative | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| conservative | AdaptiveEconomy / Rush | 7 | 12 | 21 | 28 |
| conservative | Mono-lightning / Mono-metal | 15 | 25 | 0 | 15 |
| conservative | Mono-lightning / Mono-fire | 27 | 13 | 0 | 27 |
| conservative | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| conservative | Mono-plant / Mono-metal | 0 | 33 | 7 | 5 |
| conservative | Mono-plant / Mono-shadow | 16 | 24 | 0 | 16 |
| conservative | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| conservative | Balanced / Expand | 7 | 0 | 33 | 27 |
| conservative | LightningRush / AntiRush | 10 | 0 | 30 | 10 |
| conservative | LightningRush / Turtle | 32 | 0 | 8 | 32 |
| conservative | LightningRush / Expand | 38 | 0 | 2 | 38 |
| conservative | AdaptiveEconomy / LightningRush | 3 | 16 | 21 | 24 |
| conservative | Balanced / LightningRush | 31 | 8 | 1 | 32 |
| lightning | Rush / AntiRush | 2 | 0 | 38 | 2 |
| lightning | Rush / Expand | 39 | 0 | 1 | 39 |
| lightning | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| lightning | AdaptiveEconomy / Rush | 2 | 18 | 20 | 22 |
| lightning | Mono-lightning / Mono-metal | 15 | 25 | 0 | 15 |
| lightning | Mono-lightning / Mono-fire | 27 | 13 | 0 | 27 |
| lightning | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| lightning | Mono-plant / Mono-metal | 0 | 33 | 7 | 4 |
| lightning | Mono-plant / Mono-shadow | 10 | 27 | 3 | 13 |
| lightning | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| lightning | Balanced / Expand | 5 | 0 | 35 | 20 |
| lightning | LightningRush / AntiRush | 10 | 0 | 30 | 10 |
| lightning | LightningRush / Turtle | 28 | 0 | 12 | 29 |
| lightning | LightningRush / Expand | 40 | 0 | 0 | 40 |
| lightning | AdaptiveEconomy / LightningRush | 3 | 20 | 17 | 20 |
| lightning | Balanced / LightningRush | 17 | 18 | 5 | 20 |
| plant_depth | Rush / AntiRush | 2 | 0 | 38 | 2 |
| plant_depth | Rush / Expand | 33 | 4 | 3 | 33 |
| plant_depth | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| plant_depth | AdaptiveEconomy / Rush | 18 | 14 | 8 | 26 |
| plant_depth | Mono-lightning / Mono-metal | 1 | 39 | 0 | 1 |
| plant_depth | Mono-lightning / Mono-fire | 12 | 28 | 0 | 12 |
| plant_depth | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| plant_depth | Mono-plant / Mono-metal | 0 | 31 | 9 | 6 |
| plant_depth | Mono-plant / Mono-shadow | 15 | 24 | 1 | 16 |
| plant_depth | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| plant_depth | Balanced / Expand | 4 | 0 | 36 | 16 |
| plant_depth | LightningRush / AntiRush | 0 | 0 | 40 | 0 |
| plant_depth | LightningRush / Turtle | 3 | 0 | 37 | 3 |
| plant_depth | LightningRush / Expand | 4 | 11 | 25 | 4 |
| plant_depth | AdaptiveEconomy / LightningRush | 25 | 0 | 15 | 40 |
| plant_depth | Balanced / LightningRush | 37 | 1 | 2 | 39 |
| plant_t2 | Rush / AntiRush | 2 | 0 | 38 | 2 |
| plant_t2 | Rush / Expand | 37 | 0 | 3 | 37 |
| plant_t2 | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| plant_t2 | AdaptiveEconomy / Rush | 5 | 13 | 22 | 27 |
| plant_t2 | Mono-lightning / Mono-metal | 1 | 39 | 0 | 1 |
| plant_t2 | Mono-lightning / Mono-fire | 12 | 28 | 0 | 12 |
| plant_t2 | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| plant_t2 | Mono-plant / Mono-metal | 0 | 33 | 7 | 5 |
| plant_t2 | Mono-plant / Mono-shadow | 16 | 24 | 0 | 16 |
| plant_t2 | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| plant_t2 | Balanced / Expand | 7 | 0 | 33 | 27 |
| plant_t2 | LightningRush / AntiRush | 0 | 0 | 40 | 0 |
| plant_t2 | LightningRush / Turtle | 3 | 0 | 37 | 3 |
| plant_t2 | LightningRush / Expand | 2 | 0 | 38 | 2 |
| plant_t2 | AdaptiveEconomy / LightningRush | 7 | 0 | 33 | 40 |
| plant_t2 | Balanced / LightningRush | 37 | 1 | 2 | 39 |
| plant_t23 | Rush / AntiRush | 2 | 0 | 38 | 2 |
| plant_t23 | Rush / Expand | 33 | 4 | 3 | 33 |
| plant_t23 | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| plant_t23 | AdaptiveEconomy / Rush | 18 | 14 | 8 | 26 |
| plant_t23 | Mono-lightning / Mono-metal | 1 | 39 | 0 | 1 |
| plant_t23 | Mono-lightning / Mono-fire | 12 | 28 | 0 | 12 |
| plant_t23 | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| plant_t23 | Mono-plant / Mono-metal | 0 | 31 | 9 | 6 |
| plant_t23 | Mono-plant / Mono-shadow | 15 | 24 | 1 | 16 |
| plant_t23 | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| plant_t23 | Balanced / Expand | 4 | 0 | 36 | 16 |
| plant_t23 | LightningRush / AntiRush | 0 | 0 | 40 | 0 |
| plant_t23 | LightningRush / Turtle | 3 | 0 | 37 | 3 |
| plant_t23 | LightningRush / Expand | 4 | 11 | 25 | 4 |
| plant_t23 | AdaptiveEconomy / LightningRush | 24 | 0 | 16 | 40 |
| plant_t23 | Balanced / LightningRush | 37 | 1 | 2 | 39 |
| plant_t4_speed | Rush / AntiRush | 2 | 0 | 38 | 2 |
| plant_t4_speed | Rush / Expand | 39 | 0 | 1 | 39 |
| plant_t4_speed | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| plant_t4_speed | AdaptiveEconomy / Rush | 2 | 18 | 20 | 22 |
| plant_t4_speed | Mono-lightning / Mono-metal | 1 | 39 | 0 | 1 |
| plant_t4_speed | Mono-lightning / Mono-fire | 12 | 28 | 0 | 12 |
| plant_t4_speed | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| plant_t4_speed | Mono-plant / Mono-metal | 0 | 33 | 7 | 4 |
| plant_t4_speed | Mono-plant / Mono-shadow | 10 | 27 | 3 | 13 |
| plant_t4_speed | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| plant_t4_speed | Balanced / Expand | 5 | 0 | 35 | 20 |
| plant_t4_speed | LightningRush / AntiRush | 0 | 0 | 40 | 0 |
| plant_t4_speed | LightningRush / Turtle | 4 | 0 | 36 | 4 |
| plant_t4_speed | LightningRush / Expand | 10 | 2 | 28 | 10 |
| plant_t4_speed | AdaptiveEconomy / LightningRush | 2 | 0 | 38 | 40 |
| plant_t4_speed | Balanced / LightningRush | 17 | 6 | 17 | 33 |
| proposed | Rush / AntiRush | 2 | 0 | 38 | 2 |
| proposed | Rush / Expand | 33 | 4 | 3 | 33 |
| proposed | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| proposed | AdaptiveEconomy / Rush | 20 | 14 | 6 | 26 |
| proposed | Mono-lightning / Mono-metal | 15 | 25 | 0 | 15 |
| proposed | Mono-lightning / Mono-fire | 27 | 13 | 0 | 27 |
| proposed | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| proposed | Mono-plant / Mono-metal | 0 | 31 | 9 | 6 |
| proposed | Mono-plant / Mono-shadow | 15 | 24 | 1 | 16 |
| proposed | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| proposed | Balanced / Expand | 4 | 0 | 36 | 16 |
| proposed | LightningRush / AntiRush | 10 | 0 | 30 | 10 |
| proposed | LightningRush / Turtle | 32 | 0 | 8 | 32 |
| proposed | LightningRush / Expand | 37 | 2 | 1 | 37 |
| proposed | AdaptiveEconomy / LightningRush | 15 | 15 | 10 | 25 |
| proposed | Balanced / LightningRush | 31 | 8 | 1 | 32 |
| radi_only | Rush / AntiRush | 2 | 0 | 38 | 2 |
| radi_only | Rush / Expand | 39 | 0 | 1 | 39 |
| radi_only | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| radi_only | AdaptiveEconomy / Rush | 2 | 19 | 19 | 21 |
| radi_only | Mono-lightning / Mono-metal | 9 | 31 | 0 | 9 |
| radi_only | Mono-lightning / Mono-fire | 27 | 13 | 0 | 27 |
| radi_only | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| radi_only | Mono-plant / Mono-metal | 0 | 33 | 7 | 4 |
| radi_only | Mono-plant / Mono-shadow | 10 | 27 | 3 | 13 |
| radi_only | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| radi_only | Balanced / Expand | 5 | 0 | 35 | 20 |
| radi_only | LightningRush / AntiRush | 10 | 0 | 30 | 10 |
| radi_only | LightningRush / Turtle | 28 | 0 | 12 | 29 |
| radi_only | LightningRush / Expand | 40 | 0 | 0 | 40 |
| radi_only | AdaptiveEconomy / LightningRush | 3 | 20 | 17 | 20 |
| radi_only | Balanced / LightningRush | 17 | 18 | 5 | 20 |
| umeme_only | Rush / AntiRush | 2 | 0 | 38 | 2 |
| umeme_only | Rush / Expand | 39 | 0 | 1 | 39 |
| umeme_only | AdaptivePressure / AntiRush | 23 | 0 | 17 | 23 |
| umeme_only | AdaptiveEconomy / Rush | 2 | 18 | 20 | 22 |
| umeme_only | Mono-lightning / Mono-metal | 18 | 22 | 0 | 18 |
| umeme_only | Mono-lightning / Mono-fire | 19 | 21 | 0 | 19 |
| umeme_only | Mono-shadow / Mono-water | 0 | 40 | 0 | 0 |
| umeme_only | Mono-plant / Mono-metal | 0 | 33 | 7 | 4 |
| umeme_only | Mono-plant / Mono-shadow | 10 | 27 | 3 | 13 |
| umeme_only | Mono-fire / Mono-water | 0 | 40 | 0 | 0 |
| umeme_only | Balanced / Expand | 5 | 0 | 35 | 20 |
| umeme_only | LightningRush / AntiRush | 0 | 0 | 40 | 0 |
| umeme_only | LightningRush / Turtle | 4 | 0 | 36 | 4 |
| umeme_only | LightningRush / Expand | 10 | 2 | 28 | 10 |
| umeme_only | AdaptiveEconomy / LightningRush | 2 | 0 | 38 | 40 |
| umeme_only | Balanced / LightningRush | 17 | 6 | 17 | 33 |

## Provenance and limitations

No scripted game uses the static solver to choose actions. Its local optimization checks precede these separate policy tests. Adaptive policies remain crude; caps are not natural wins, and no first-player or equilibrium claim is made. The confirmation uses new seeds, but these same bot families informed candidate selection. Human and independently optimized counterplay remain external validation.

| Variant | Games | Patch | Source SHA-256 |
|---|---:|---|---|
| baseline | 640 | `{}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| confirm_base | 3200 | `{}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| confirm_proposed | 3200 | `{"lightning_1": {"attack": 2}, "lightning_2": {"attack": 3}, "lightning_3": {"attack": 3}, "lightning_4": {"attack": 4}, "plant_2": {"mining": 4}, "plant_3": {"mining": 5}, "plant_4": {"speed": 2}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| conservative | 640 | `{"lightning_1": {"attack": 2}, "lightning_2": {"attack": 3}, "lightning_3": {"attack": 3}, "lightning_4": {"attack": 4}, "plant_2": {"mining": 4}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| lightning | 640 | `{"lightning_1": {"attack": 2}, "lightning_2": {"attack": 3}, "lightning_3": {"attack": 3}, "lightning_4": {"attack": 4}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| plant_depth | 640 | `{"plant_2": {"mining": 4}, "plant_3": {"mining": 5}, "plant_4": {"speed": 2}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| plant_t2 | 640 | `{"plant_2": {"mining": 4}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| plant_t23 | 640 | `{"plant_2": {"mining": 4}, "plant_3": {"mining": 5}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| plant_t4_speed | 640 | `{"plant_4": {"speed": 2}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| proposed | 640 | `{"lightning_1": {"attack": 2}, "lightning_2": {"attack": 3}, "lightning_3": {"attack": 3}, "lightning_4": {"attack": 4}, "plant_2": {"mining": 4}, "plant_3": {"mining": 5}, "plant_4": {"speed": 2}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| radi_only | 640 | `{"lightning_1": {"attack": 2}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
| umeme_only | 640 | `{"lightning_2": {"attack": 3}}` | `325445bc4f619099d0345a32342bed845d7d284b4a3f44bb110f660d82ef442e` |
