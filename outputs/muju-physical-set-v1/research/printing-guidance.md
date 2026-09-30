# Printing guidance — Bambu Lab H2C, PLA/PETG, FDM joint design

Sources are cited as [S##] (see `web-sources.md`). Each topic has two parts:

- **Guidance says:** what a manufacturer or engineering source states, or what it encodes as data.
- **Design inference:** our own reasoning for the Muju set. Treat it as a hypothesis to test on coupons.

Important limitation: Bambu's wiki, store and spec pages were blocked in this session (N02–N08). All
Bambu facts here come from **Bambu Studio's shipped H2C profiles** on GitHub (commit da8b44e,
2026-09-28). This is first-party data that the slicer actually uses, but it is not a written guide.
The Bambu wiki items below are marked **not verified**. Re-check them by hand before release.

---

## 1. H2C build volume and nozzles

**Guidance says**

- Whole bed (slicer printable area): **330 × 320 mm**; printable height **325 mm** [S01][S03].
- Per-extruder XY limits [S01]:
  - extruder 1: X 0–325 × Y 0–320 (**325 × 320**), height **320 mm** [S03]
  - extruder 2: X 25–330 × Y 0–320 (**305 × 320**), height **325 mm** [S03]
  - The area both extruders can reach is X 25–325, i.e. **300 × 320 mm**.
- Nozzle slots: extruder 1 holds **1** nozzle and extruder 2 holds **6** (`extruder_max_nozzle_count` ["1","6"]), i.e. the Vortek
  rack of hot-swappable nozzles [S01].
- Nozzle sizes: **0.2 / 0.4 / 0.6 / 0.8 mm**. The default profile is 0.4 mm with "0.20mm Standard" [S01][S02].
- Hotend variants: extruder 1 offers Standard, High Flow and E3D High Flow; extruder 2 offers Standard and High Flow [S01]. Bambu Studio
  2.8.1 adds E3D High Flow for "H2C (left head only)" [S07].
- Filament restrictions: extruder 1 cannot print TPU; extruder 2 cannot print PPS-CF/PPA-CF [S01]. Neither restriction affects PLA or PETG.
- Bed plates: the H2C default is **Textured PEI**. The slicer lists **Cool Plate** and **Smooth PEI / High Temp Plate** as *not
  supported* on H2C. H2D and H2S exclude only Cool Plate [S02].
- Bambu Studio 2.6.0 fixed H2C slices "always assigned to the left nozzle in filament-saving mode" [S08].

**Design inference**

- Extruder 1 is the **left** head and extruder 2 the **right, Vortek** head. Evidence: extruder 1's list includes E3D High Flow,
  which [S07] limits to the left head, and extruder 1's X range stops short of the right edge, as on the H2D. This mapping is not
  stated verbatim in a retrieved source.
- For single-color plates, **keep parts inside X 25–325 (300 × 320 mm)** so either head can print the plate. If one head is
  fixed, the left head gets 325 × 320.
- Board tiles: 6 × 6 = 36 tiles per plate fits only if each tile's footprint, including protruding interlock tabs, is ≤ about 50 mm
  with 0 mm gaps. That is too tight. Plan on **5 × 6 = 30** (with a ≤ 57 mm tab footprint and 3 mm gaps inside 300 × 320)
  or **5 × 5 = 25** per plate: **4 plates for 100 tiles**. Leave room for brims if used.
- The 0.2 mm nozzle profile exists [S02]. It could make cleaner 5–6 mm cube studs and small glyphs, but it is much slower. Default
  to 0.4 mm and test 0.2 mm on the cube coupon only.

## 2. Slicers

**Guidance says**

- Bambu Studio ships H2C machine, process and filament profiles [S01][S04][S06]. Release notes mention H2C from **2.5.0**
  (Developer-Mode tower features for "H2D/H2C/X2D"), then **2.5.2 Public Beta "H2C Printer Support"** and **2.5.3** "Minimum
  supported firmware version: 01.02.00.00(H2C)" [S08]. The current line is **2.8.x**: 2.8.2(.61) public releases in Aug 2026, and
  2.8.3 / 2.8.4 public betas plus v02.08.04.61 on 2026-09-29 [S07][S09]. The first version with H2C support was **not verified**
  (the 2.4.0 notes were not visible).
- OrcaSlicer: H2C profiles exist on `main` (2026-09-30) but **not** in the latest tagged release **v2.4.2** (2026-07-06)
  [S10][S11]. So H2C support is **nightly/dev only** as of today.

**Design inference:** use Bambu Studio 2.8.x for production. OrcaSlicer's calibration docs [S12–S17] still apply as general
technique.

## 3. AMS / color changes for many single-color parts

**Guidance says**

- The default H2C process includes a **60 mm-wide prime tower** [S06]. Vortek gives extruder 2 up to 6 swappable nozzles [S01].
- AMS model details, capacity and run-out/auto-refill behavior: **not verified** (N02, N05 blocked).

**Design inference**

- Every Muju part is a single color, so **print one color per plate** with no color swaps, no prime tower and no purge. Make sure
  the prime tower is off or not generated when a plate has only one filament.
- If mixed-color plates are wanted (for example, all 6 glyph-insert colors on one plate), Vortek nozzle swaps avoid most purge
  waste. Still, a prime tower and swap time add up for dozens of tiny parts. Batch by color instead.
- Use AMS mainly to load spare spools of the same color for long runs such as the ~550 cubes or 100 tiles. Confirm the auto-refill
  feature on the actual unit.

## 4. Filament settings on H2C (from Bambu's H2C profiles)

| Profile [S04] | Nozzle °C (1st layer) | Range °C | Textured PEI bed °C | Fan % min–max | Max vol. speed mm³/s | `impact_strength_z` | Vitrification °C |
|---|---|---|---|---|---|---|---|
| PLA Basic @H2C | 220 (220) | 190–240 | 55 | 60–80 | 25 / 40 (HF) | 13.8 | 45 |
| PLA Matte @H2C | 220 (220) | 190–240 | 55 | 60–100 | 25 / 40 | 6.6 | 45 |
| PLA Metal @H2C 0.4 | 220 (220) | 190–240 | 55 | 100 | 21 | — | 45 |
| PLA Translucent @H2C | 220 (220) | 200–240 | 55 | 100 | 12 | — | 45 |
| PETG HF @H2C | 245 (245) | 230–270 | 70 | 20–40 | 25 / 35 | — | 55 |
| **PETG Translucent @H2C 0.4** | **245 (250)** | 230–270 | **70** | **10–30** | **6** | 7.2 | 55 |

- The PETG profiles set cool-plate temperature to 0 (not usable). The Engineering Plate is 70 °C and SuperTack 60 °C [S04].
- `filament_shrink` is 100 % (no scaling) for all of the above [S04].
- Minimum layer time (slowdown): PLA 4 s; PETG Translucent 8 s [S04].
- Bambu wiki items: **not verified**. These include whether PETG on Textured PEI needs glue, PETG-on-PLA compatibility tables, and
  the wiki's plate recommendations (N02).

**Design inference**

- The **6 mm³/s** cap and 10–30 % fan for PETG Translucent on 0.4 mm (compare PETG HF at 25) is Bambu's way of encoding slow,
  hot printing for clarity. Expect slow cube plates.
- The `impact_strength_z` numbers presumably measure Z-direction (across-layer) impact. Units are not stated; Bambu's data sheets
  usually use kJ/m². Either way, **PLA Matte (6.6) is about half of PLA Basic (13.8)** across layers. Matte parts with thin
  vertical features, such as the glyph insert's key and stem, are the weakest choice. This supports printing inserts in PLA
  Basic if the matte look is not required, or orienting them so loads act in the XY plane.

## 5. Transparent / translucent PETG clarity

**Guidance says:** the Bambu wiki's transparent-PETG page was **not retrieved** (N03). The only verified Bambu data is the profile
above: slow flow, a 250 °C first layer and low fan [S04].

**Design inference (not verified; test on coupons):** 5–6 mm cubes will read as "translucent glow", not glass-clear. To maximise
it, try 100 % infill with an aligned rectilinear/monotonic pattern (or all walls), a 0.12–0.16 mm layer, the profile's slow flow,
and a smooth bottom surface. Accept that translucent parts show seams. Also compare PETG Translucent Teal with PLA Translucent
Teal (see filament-shortlist.md).

## 6. Drying

**Guidance says (profile drying fields [S04]; the wiki page N04 was not retrieved):**

| Material | AMS drying temp | AMS drying time | Chamber-drying bed temp / time | Softening temp | Heat-distortion (AMS drying) |
|---|---|---|---|---|---|
| PLA Basic / Matte | 45 °C | 12 h | 70 °C / 12 h | 50 °C | 45 °C |
| PETG Translucent | 65 / 65 / 55 / 55 °C (4 entries, per dryer variant) | 12 h | 80 °C / 12 h | 60 °C | 75 °C |

**Design inference:** the meaning of the four-entry PETG array (which AMS model uses 65 °C versus 55 °C) is not documented in the
file. Dry PETG Translucent at 55–65 °C for about 12 h before printing cubes, because moisture causes bubbles and haze that are
very visible in translucent parts. Keep PLA at ≤ 45–50 °C to stay below its softening point.

## 7. General FDM design rules

### 7.1 Clearances and fits

**Guidance says**

- Clearance of **0.1 mm (well-tuned FDM) to 0.2 mm (bigger nozzle / faster)**, at least in X/Y [S20].
- BOSL2: add one "slop" per mating surface (hole radius +slop, groove width +2·slop). The calibration coupon steps **0.00–0.25 mm
  in 0.05 mm steps**; the example value is **0.15 mm**. Small holes behave differently and vary with orientation [S18].
- OrcaSlicer tolerance test: holes at **0 / 0.05 / 0.1 / 0.2 / 0.3 / 0.4 mm**; tune X-Y hole/contour compensation from it [S14]. The
  H2C default has both compensations at **0** [S06].
- Prior-art values: Gridfinity bins are 41.5 mm on a 42 mm grid (**0.25 mm/side**) [S23]. An OpenLOCK-compatible clip is **0.1
  mm/side** narrower than its slot, plus user tolerance [S24]. Boardgame Insert Toolkit lids use **0.1 mm** [S28]. BOSL2 snap pins
  use **0.2 mm** [S19].
- Press fit: Gridfinity's 6 mm magnet uses 8 crush ribs to an inner Ø5.9 mm (≈0.05 mm/side interference, "experimentally chosen")
  [S23].

**Design inference: starting values for coupons**

| Joint | Starting clearance | Coupon sweep |
|---|---|---|
| Tile puzzle interlock (vertical faces, slide-down fit) | 0.20 mm per side | 0.10 / 0.15 / 0.20 / 0.25 / 0.30 |
| Cube socket over tile stud or cube stud (round-in-round, PETG on PLA) | 0.10–0.15 mm radial | 0.05 / 0.10 / 0.15 / 0.20 |
| Glyph insert key in base slot (removable, slide fit) | 0.15–0.20 mm per side | 0.10 → 0.30 |
| Pedestal ↔ base octagon nesting | 0.20 mm per side + detent | 0.15 / 0.20 / 0.25 |

Octagons give extra rotational keying. Put a 0.3–0.5 mm chamfer on every insertion lead-in.

### 7.2 Elephant foot and first layer

**Guidance says:** the H2C default has `elefant_foot_compensation` **0.15 mm**, a 0.2 mm first layer at 0.5 mm line width and 50
mm/s [S06]. OrcaSlicer tapers the compensation over several layers (0.25 mm → 0 over 5 layers in its example) [S13].

**Design inference:** add a **0.4–0.6 mm × 45° chamfer on the bottom edge** of tiles, bases and pedestals, and on any mating
feature that touches the plate. Do not rely on compensation alone. Tile interlock faces are vertical and start at the plate, so
elephant foot there directly tightens the fit.

### 7.3 Overhangs and bridges

**Guidance says:** the H2C default support threshold is **30°** (auto tree supports off, since `enable_support` is 0) [S06].
OrcaSlicer: 45–60° is usually printable, and 100 % overhang is printed as a bridge [S12]. The bridge page gives no length limit
[S16]. Gridfinity [S23] and the Insert Toolkit [S28] design stacking features with **45°** chamfers so they need no supports.

**Design inference:** keep all socket roofs and undercuts at ≤ 45° from vertical. Cube sockets can be flat-roofed bridges; 4–5 mm
spans bridge fine. Put a sacrificial chamfer or a "teardrop" top on horizontal holes.

### 7.4 Minimum walls and features

**Guidance says:** the H2C default has 2 walls at 0.42 mm line width (inner 0.45) [S06], i.e. ≈ 0.85 mm for a two-wall shell.
[S20] uses a 0.8 mm (2 × nozzle) shell. Gridfinity notes that 30 crush ribs "does not print with a 0.4mm nozzle" [S23]: features
smaller than about a line width vanish.

**Design inference:** minimum wall **≥ 0.85 mm** (2 lines), with **≥ 1.2 mm** preferred for socket walls on the cubes. Glyph
relief ≥ 0.6 mm wide and ≥ 0.4 mm high. Studs ≥ Ø2.5 mm.

### 7.5 Layer (Z) anisotropy

**Guidance says:** strain across layer lines is the weak direction [S21]. BOSL2 prints its snap pins lying flat so the flexing
walls lie in XY [S19]. Bambu's per-material `impact_strength_z` values [S04] (PLA Basic 13.8, PLA Matte 6.6, PETG Translucent 7.2)
exist because Z strength is the limiting case.

**Design inference:** vertical studs on tiles and cubes load their root layers in shear and bending. Give stud roots a 0.3–0.5 mm
fillet or chamfer and keep studs short (≤ 1.5–2 mm) and fat. The upright glyph insert is the most anisotropy-sensitive part. If
it prints standing up, its key/tenon is loaded across layers. Consider **printing the insert lying flat** (face-up relief then
needs no support if the glyph is on the broad face).

### 7.6 Snap fits, creep and fatigue

**Guidance says**

- Cantilever outer-fibre strain ε = **3·t·δ / (2·L²)**; one printed design sizes to a **1.2 %** strain target and recommends PETG
  when PLA would exceed it [S21].
- "PLA slowly deforms over time if it is under pressure … avoid friction fits"; "the part must not be under stress after being
  snapped together"; 45° lead-in, about 33° for more holding force [S20].
- BOSL2 snap pin: 0.2 mm clearance plus 0.2 mm preload; snap (undercut) 0.4–0.5 mm on Ø3.2–7 mm pins [S19].
- Rigorous material strain limits (from Formlabs, Hubs or Bayer guides) were **not retrieved** (N09, N10).

**Design inference**

- Pedestal retention: use a **detent that is unloaded at rest**, i.e. a bump that clicks into a groove where the flexing
  wall returns to its unstrained shape. Avoid a permanent interference fit in PLA, which creeps and loosens.
- Keep flex strain ≤ ~1 % for PLA. Example: a PLA arm with t = 1.2 mm and L = 8 mm allows δ ≈ 1.2 % × 2 × 64 / (3 × 1.2) ≈ **0.43
  mm** of undercut.
- Cube stacking is a friction-only stud fit. PETG (tougher, less brittle) on the cube's socket side is the right choice for
  repeated cycling.

### 7.7 Warping of flat parts

**Guidance says:** turning cooling off for the first layers and using brims reduce warping [S15][S17]. PLA bed 55 °C and PETG 70 °C
on Textured PEI [S04].

**Design inference:** 50 mm PLA tiles are small enough that warping should be minor on Textured PEI. Keep tiles solid-ish (≥ 3
bottom layers, the default [S06]) and avoid big solid top skins that pull corners up. Measure flatness on the first plate.

### 7.8 Small-part adhesion (cubes, inserts)

**Guidance says:** brims are for "small footprints or warping"; mouse ears are the localized alternative [S15]. The H2C default is
brim width 5 mm with a 0.1 mm object gap [S06]. The minimum-layer-time slowdown applies to small layers: PLA 4 s, PETG Translucent
8 s [S04][S17].

**Design inference:** a 5–6 mm PETG cube has a 25–36 mm² footprint. Print **dozens per plate** (e.g. a 12 × 12 grid at 3–4 mm
spacing), so each layer's total time exceeds 8 s and they don't slow to a crawl or overheat. Keep **the socket face down**: a
flat bottom face with the socket recessed gives more contact area, and the stud prints on top. Try without a brim first; add
mouse ears if cubes pop off. Cube bottoms will show elephant foot; the 0.15 mm compensation plus a bottom chamfer handles it.
