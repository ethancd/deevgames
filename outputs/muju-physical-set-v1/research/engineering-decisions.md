# Engineering decisions — Muju physical set v1

All numbers live in [`../cad/params.json`](../cad/params.json). This page explains them. Clearances
are **per side (radial)** unless marked **diametral**. Everything here is a digital starting point;
the coupons in `print/calibration/` decide the final fits.

## Construction system (locked by the brief, implemented as specified)

- 100 separate square tiles with integral puzzle tabs and four integral studs; 98 gray, ivory home
  at A1 and charcoal home at J10. No checkerboard, no resource colouring.
- Both armies use one octagonal base geometry. A coloured glyph stands in a keyed removable slot,
  and the same glyph lies flat as a pending summon.
- Additive tiers: T2 goes under the base, T3 under T2. All three layers stay separate parts and all
  stay visible.
- Translucent cyan stud/socket cubes: four stacks per tile, 0/4/8/16 = none / 1 / 2 / 4 high.
  One half-crystal token.
- No accessories.

## Chosen mechanisms

| Interface | Mechanism | Print orientation / insertion | Release | Expected weak point | Alternatives considered |
|---|---|---|---|---|---|
| Glyph → base | In-plane **tang** 6.0 × 4.5 × 4.5 mm in a rectangular slot. A 1.2 mm 45° key chamfer on one tang edge meets a filled corner in the slot, so the glyph enters only facing front. Two vertical half-round **crush ribs** (r 0.5, 0.25 mm protrusion) hold it. | Glyph flat, tang in plane; base upright, slot open upward. Push straight down. | Pull straight up. | Tang root / neck (bolt, leaf) under a sideways knock. It bends within layers (strong direction). | Magnet (adds parts and cost), cantilever snap (fatigue across layers in PLA), round peg (needs a separate anti-rotation key) |
| Base → T2, T2 → T3 | Octagonal **boss** (14.0 mm AF × 1.6 mm, 0.4 mm chamfer) on top of each pedestal enters an octagonal **recess** (14.3 mm AF × 1.8 mm) under the layer above. Four crush ribs (0.2 mm) on alternate flats. The octagon keeps layers aligned and stops them twisting. | All upright. Recesses face the bed and their ceilings bridge (0.4 mm mouth chamfer against elephant foot). | Pull apart with fingertips on the 1.75 mm step of the wider layer. | Rib crush wears with repeated promotions; the coupons measure this. | Magnets; bayonet twist-lock (the octagon forbids a twist); snap ring |
| Crystal → crystal / tile stud | Ø3.2 × 1.6 mm stud; Ø3.45 mm socket, 1.8 mm deep (**0.25 mm diametral = 0.125 mm radial**), 0.3 mm entry chamfer. A **locating fit, not a press fit**, so mining one cube does not lift the column. | Socket down, stud up. Socket ceiling bridges 3.45 mm. | Lift the top cube. | PETG strings in the socket; PETG-on-PLA vs PETG-on-PETG fits differ (coupon tests both). | Larger 7 mm cube (see below); square stud |
| Tile → tile | Integral **round-head tab** (neck 6.5 mm, head Ø9.0 mm, centre 4.6 mm past the pitch line) placed 13 mm from each edge midpoint, clear of the stud stacks. Socket = tab + 0.25 mm per side. East/north tabs, west/south sockets; border tiles omit them. | Flat. Tiles drop in vertically. | Lift vertically. | Neck in PLA Matte (6.5 × 4 mm section). Low load. | Separate clips/dogbones (extra objects; rejected); magnets |

Section views: the **model-render** `renders/<variant>-t3-section.png` cuts the actual exported
meshes of a T3 piece. The **concept** boards `concepts/<variant>/<variant>-2-construction.svg`
show the same sections as drawings.

## Tile subtypes (disclosed; the 100-tile total is unchanged)

Tabs appear only where a neighbour exists, so the board edge is clean. The 18 squares that start with
0 crystals in `resourceMap.ts` get **flat** tiles with no studs (user request, 2026-09-30), so the empty
regions read as bare ground. That gives twelve geometries, placed by `board_tile_part()` from the map:

| Type | Qty | Colour |
|---|---:|---|
| interior | 52 | gray |
| interior-flat (no studs) | 12 | gray |
| edge-s / edge-n | 5 each | gray |
| edge-s-flat / edge-n-flat (no studs) | 3 each | gray |
| edge-w / edge-e | 8 each | gray |
| corner-sw (A1) | 1 | **ivory** home |
| corner-ne (J10) | 1 | **charcoal** home |
| corner-se, corner-nw | 1 each | gray |
| **total** | **100** | 98 gray + 1 ivory + 1 charcoal |

## Initial dimensions (v1)

| Item | Value | Note |
|---|---|---|
| Tile pitch / tile size / thickness | 50.0 / 49.6 / 4.0 mm | 0.4 mm seam. Board outline 499.6 × 499.6 mm. |
| Stud | Ø3.2 × 1.6 mm, centre 21.5 mm from tile centre | 0.3 mm from the stack's outer face to the tile edge |
| Crystal | 6.0 mm cube; 4-high stack = 25.6 mm above the tile | 0.3 mm edge chamfers |
| Half-crystal token | A crystal cut along its vertical diagonal: right-triangle prism, 6 mm tall, about 47 % of a crystal's volume; the stud socket becomes a half-round notch on the cut face; no stud | Reads as half a crystal by shape at full height (changed 2026-09-30 from a 6 × 6 × 3 mm chamfered-roof slab). Drops over a stud or stack top; nothing stacks on it. |
| Base | **25.0 mm AF** (27.06 AC) × 7.5 mm | Brief suggested 28 mm; reduced (see resizing) |
| T2 | **28.5 mm AF** (30.85 AC) × 4.0 mm (+1.6 mm boss) | 1.75 mm step per side |
| T3 | **32.0 mm AF** (34.64 AC) × 4.0 mm (+1.6 mm boss) | Brief suggested 34 mm; reduced |
| Glyph | 4.5 mm plate, 0.66 mm per SVG unit; 12.6–21.8 mm wide, 16.5–20.5 mm visible height | Outline offset +0.35 mm |
| Tallest piece | 40.0 mm above the table (water T3 on a tile) | |
| Min wall, slot to outside of base | 8.6 mm (section at z = 5.5) | |
| Floor between base recess and slot | **0.9 mm** | Thin but not a load path; about 4 layers at 0.2 mm |

### Why the pieces are smaller than the brief's starting point

At 50 mm pitch, stacks on edge-midpoint studs have their inner faces 18.5 mm from the tile centre.
A 34 mm AF T3 rotated 22.5° reaches 18.4 mm (across corners), which leaves no clearance. Pieces are
placed by hand and will rotate. So the three widths shrank together (25 / 28.5 / 32, keeping 1.75 mm
visible steps). Worst-rotation clearance is now **1.18 mm**; flats-facing clearance is **2.50 mm**.
The pitch stayed 50 mm, as the brief investigated. See the dimensioned
[`worst-case-tile.svg`](worst-case-tile.svg).

### Retention (weakest joint)

Lifting a T3 by its glyph puts the whole stack on the tang fit. Solid-volume upper bound: base
4.1 g + T2 3.2 g + T3 4.5 g, so **≈ 0.12 N**. The base–T2 joint carries ≈ 0.075 N and T2–T3
≈ 0.044 N. Any working friction fit easily exceeds 3× these loads. The real risk runs the other way:
fits too tight to separate by hand, or loosening after wear. The coupon criteria target both.

## Coupon sweeps (IF1 = interface set 1, shared by all three variants)

| Coupon | Swept parameter | Values | Label |
|---|---|---|---|
| Glyph slot block, row A | slot clearance per side (ribs 0.25) | 0.10 / 0.15 / 0.20 / 0.25 | engraved ".10" … |
| Glyph slot block, row B | rib protrusion (clearance 0.15) | 0 / 0.15 / 0.25 / 0.35 | engraved "R.00" … |
| Tang gauge | nominal tang with key | — | "TANG" |
| Recess plate | recess clearance per side | 0.05 / 0.10 / 0.15 / 0.20 | engraved |
| Boss keys ×4 | boss rib protrusion | 0 / 0.1 / 0.2 / 0.3 | 0–3 edge notches |
| Crystal sockets ×4 | socket clearance **diametral** | 0.10 / 0.20 / 0.30 / 0.40 | 1–4 V-notches |
| Stud strip | 4 tile studs (PLA) for PETG cubes | — | "IF1 STUD" |
| Tile strips | tab clearance per side | 0.15 / 0.25 / 0.35 | "IF1 S0.25" … |

These are separate from the 891-object inventory (35 calibration objects, about 78 g).

### Is a 6 mm cube pleasant to handle?

It is typical of small wooden game cubes (8 mm is the common "Euro" size; 5–6 mm mini dice exist).
6 mm stacks are pinchable, but at 50 mm pitch **neighbouring stacks across a seam sit only 1.0 mm
apart**. Fingers approach the top cube along the seam, not across it. This needs a hand trial
(physical test 3.2).

**Larger-cube alternative:** `crystal.large_alternative_body = 7.0`. With 7 mm cubes and the same
T3 clearance, the stud centre must move out to 22.0 mm. That exceeds the 24.8 mm half-tile once the
cube's half-width is added (22 + 3.5 = 25.5 > 24.8), so it **requires about 52 mm pitch** (board ≈
520 mm). Four-high stacks would rise to 29.6 mm.

## Open physical-test questions

1. Final fit values for all five interfaces, in both owner materials (PLA Matte ivory vs charcoal
   can differ).
2. Does mining pull up the column? (PETG-on-PETG socket clearance.)
3. **Crowding:** is 1.0 mm between stacks across a seam workable for fingers? If not, the
   remedies are a) 52–54 mm pitch (board 520–540 mm), or b) studs moved inward to 20.5 mm, which
   costs T3 rotation clearance (to 0.18 mm) unless T3 shrinks to 30 mm AF.
4. **Loose glyph beside a large piece:** beside a T3 with four 4-high stacks, the largest glyphs
   (metal 48 mm², water 31 mm²) overhang the tile edge while lying in the free corner. They touch
   nothing, and the glyph centre stays on its square. Acceptable? If not: glyph scale 0.60 mm/unit
   (about −10 %) or 52 mm pitch.
5. PLA Metal Copper Brown and PETG Translucent Teal appearance at 4.5 mm and 6 mm thickness.
6. Rib wear after 50 promote/demote cycles.
7. Slicer confirmation of bridges (recess ceilings 14.3 mm, crystal sockets 3.45 mm) on the H2C
   profile.

## Constraints every variant must keep (applied)

- One interface specification (IF1). Variants change only edges, ornament and surface. Widths,
  heights, slot, boss/recess, studs, tabs and crystals are identical, so one calibration serves all.
- The glyph outline, thickness and tang are identical. Only the face edge profile differs
  (chamfer / round / stepped plateau), and a glyph from one variant fits another variant's base.
- No ornament below 1.2 mm feature size. No overhangs over 45° except bridged socket ceilings. No
  supports.
- Colour meanings are identical: ten filaments, with metal in copper.
- Optional embellishments (for example engraved tier marks) are **not** in the required
  inventory. None are modelled.

## Addendum 2026-09-30 — IF2 joints, tier dots, board colour and sections

Requested after v1: a Lego-like piece joint, a comparison of solid pedestals with rings, and
turquoise tier dots, for **Turned Court only**. Two variants were added. They reuse Turned
Court's glyphs, tiles and silhouette: `turned-keyed` has solid pedestals and `turned-ring` has
hollow ones. Both use interface **IF2** (`params.json → if2`). IF1 is unchanged for Facet,
Pebble and Turned Court.

**Why IF1 was not Lego-like.** Its 1.6 mm boss is a short engagement, so a sideways nudge tips
the layer off. Its crush ribs deform plastically, so the fit loosens over repeated promotions.
Lego's clutch comes from elastic wall deflection of a few hundredths of a millimetre held to
moulding precision. FDM varies by about ±0.1 mm, so it needs compliance with more travel that
stays elastic.

**IF2 construction.**

| Feature | Value | Why |
|---|---|---|
| Collar (tube) on top of T2 / T3 | outer R 8.75 / 10.5 mm, wall 1.45, height 2.8, 0.5 chamfer | Engagement is 1.75× IF1's. The two sizes differ per tier, so a base cannot seat on a T3 (177 mm³ collision). |
| Annular groove under base / T2 | outer R = collar + 0.15; inner core R = collar bore − 0.3; depth 3.0 | Annular, so the core under the glyph slot stays solid. The core clears the slot by more than 2 mm, where IF1 left a 0.9 mm floor. |
| Flex beams | 4 per groove at the diagonals: 0.9 thick, 7 mm long, 0.6 mm slit behind, free end cut | They bend **in the layer plane**, so the bending strain runs along the extrusions. Strain at 0.15 mm deflection is about 3tδ/2L² ≈ 0.4 %, well inside PLA's elastic range, so they spring back instead of wearing. |
| Bumps | at each beam's free end, 2.2 mm arc, 0.15 mm preload, over the deepest 1.4 mm of the groove | Friction is felt only over the last ~1.2 mm, so the joint starts easy and then seats firmly. Estimated normal force ≈ 0.8 N per beam (E ≈ 3.5 GPa), so pull-off at μ≈0.3 is ≈ 1 N for 4 beams, about 10× a full T3's weight. **Estimate only; the coupon sweep measures it.** |
| Key | lug 2.4 × 0.9 mm at the back (+Y), 0.15 clearance notch | Each joint fits one way only, so glyph, base, T2 and T3 share one front. |
| Tier dot | Ø2.6 × 0.8 mm flush inlay on the front flat; base at z 4.6, pedestals at z 2.0; the front flute is omitted on pedestals | T1 shows 1 dot, T2 2 and T3 3, in a column under the glyph. PLA Basic Turquoise, opaque so it reads the same on ivory and charcoal. PETG was avoided because it bonds poorly to PLA. |
| Ring variant | T2 / T3 open through the collar bore; the T2 groove has no core | T2 −36 %, T3 −28 % volume. No large bridged ceilings. Lighter, so it tips more easily. A T2 collar sits loosely inside another T2 ring (wrong use; it is not gripped). |

**Printing.** Each IF2 layer is one two-part object: the body plus its dot. The 3MF carries
Bambu `model_settings.config` part-to-filament slots. The dots need filament changes on about
26 layers of an army plate (z 0.7–5.9 mm: pedestal dots low, base dots higher).

**Board colour by starting crystals (mock-up).** Five neutrals sit between the two army
colours, all Bambu catalogue colours:

| Squares | Colour |
|---|---|
| A1 home | PLA Matte Ivory White (unchanged) |
| 16 crystals | PLA Matte Bone White |
| 8 crystals | PLA Matte Ash Gray (today's board gray) |
| 4 crystals | PLA Matte Nardo Gray |
| 0 crystals | PLA Basic Dark Gray (no matte dark gray exists between Nardo and Charcoal) |
| J10 home | PLA Matte Charcoal (unchanged) |

The homes stay the ends of the scale, so the armies need no change. The 0-crystal squares are
also the studless flat tiles.

**Board in nine sections.** The board prints as four 3 × 3 corners, four 3 × 4 edges and one
4 × 4 centre, in both the gray and gradient schemes. Each section is one solid:
- Tabs and sockets appear only where it meets another section.
- 0.5 mm V-grooves mark the squares inside it.
- Studs appear only on squares that start with crystals.
- Each variant's own tile edge is used, including Turned Court's court groove on every square.

For colour, a section splits into per-square colour parts, which make one multi-part object.
The largest section (the centre) is 209 mm across with its tabs, inside the H2C's 300 × 320
area. Trade-offs:
- Fewer seams (9 sections against 100 tiles) and much faster set-up.
- A misprint costs a whole section.
- The gradient scheme makes every section a multi-colour print.
- A section is not reconfigurable into other maps.
