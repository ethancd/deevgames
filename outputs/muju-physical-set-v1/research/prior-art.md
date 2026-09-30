# Prior art — joints, bases, stacking, studs

Accessed 2026-09-30. Citations [S##] refer to `web-sources.md`. Only GitHub was reachable, so the
official pages for OpenLOCK (Printable Scenery), Dragonlock, Hirst Arts, Printables/Thingiverse and
the Gridfinity spec site were **not retrieved**. Where this file describes those systems, it relies on
open-source reimplementations and says so.

**Policy:** Muju designs its own geometry. The references below teach dimensions and clearances.
Numbers and ideas are not copyrightable, but we do **not** copy third-party CAD or meshes. That
matters especially for CC BY-SA or BY-NC-SA files, whose share-alike or non-commercial terms would
bind our files.

---

## 1. OpenLOCK-style tile clips (terrain tiles)

- **Source:** `hadencain/openlock-terrain-gen`, a browser-based OpenLOCK-compatible generator, **MIT** (© 2026 Haden Cain) [S24].
  A GitHub search lists 7 OpenLOCK-related repos, none showing an official OpenLOCK license [S25].
- **Geometry (from the reimplementation) [S24]:**
  - grid 25.4 mm; base 6 mm thick
  - T-slot port 14 mm deep, wide channel 8.78 mm, stem 4.44 mm, channel step 1.78 mm
  - separate clip = slot − **0.2 mm** in width (**0.1 mm/side**) and − 0.1 mm in thickness
  - user "port tolerance" defaults to 0.00 mm, with the note "Increase if clips are too tight"
- **What it teaches:** a clip-and-slot system can work at 0.1 mm/side on good printers, but its designers still expose a tolerance
  knob. Separate clips cost assembly effort and get lost. **Muju's integral broad puzzle interlock** avoids loose clips; the price
  is that the interlock must be printable on the plate with vertical walls (elephant-foot sensitive).
- **License of the original OpenLOCK system: not verified.** The repo's MIT license covers only its own code.

## 2. Gridfinity (modular grid with stacking lip and magnet press fits)

- **Source:** `kennetek/gridfinity-rebuilt-openscad`, **MIT**, "the same license as Gridfinity" [S23].
- **Numbers [S23]:**
  - 42 mm grid; bin base top 41.5 mm, a deliberate **0.5 mm gap (0.25 mm/side)** kept constant even at half or quarter grids
  - base height 7 mm; base profile 0.8 mm @45° + 1.8 mm vertical + 2.15 mm @45°
  - magnet hole Ø6.5 mm for 6 × 2 mm magnets, depth 2 mm + 2 layers
  - press-fit option: **8 crush ribs to inner Ø5.9 mm** (≈0.05 mm/side interference, "experimentally chosen"); 30 ribs will not
    print with a 0.4 mm nozzle
- **What it teaches:**
  - For a square grid of parts that must sit side by side, a **0.25 mm/side gap** is the proven number. It is a good default gap
    between Muju's 50 mm tiles outside the interlock faces.
  - 45° chamfered locating profiles self-center and print without supports. That suits the base-to-pedestal nesting.
  - Crush ribs are the robust way to do a press fit in FDM, better than a plain round interference hole. Consider ribs in the
    base's glyph-insert slot or the pedestal socket if a tighter hold is wanted.

## 3. Stud-and-socket brick geometry (LEGO-style)

- **Source:** `cfinke/LEGO.scad`, **MIT** (© 2015 Christopher Finke) [S22].
- **Numbers [S22]:**
  - stud pitch **8 mm**; stud **Ø4.8 mm**; stud height **1.8 mm**; brick height 9.6 mm (plate 1/3)
  - wall 1.2 mm; `wall_play` 0.1 mm; `stud_play` 0.03 mm; `bar_play` 0.01 mm
  - The README says printed bricks may not fit real bricks and provides a `stud_rescale` knob (e.g. 1.05) "if your printer prints …
    correctly except for the stud diameter".
- **Note:** many references quote stud height as 1.7 mm. This source uses **1.8 mm**. Neither the LEGO patent (US 3,005,282) nor a
  primary dimension sheet could be retrieved (N13, N14), so **patent expiry and trademark status are not verified here**. It does
  not matter for Muju: we need no compatibility, we won't use the LEGO name or marks, and the stud-and-tube principle is generic.
- **What it teaches:**
  - The 0.03 mm stud play is an injection-moulding number and useless for FDM. The library's own escape hatch is to rescale studs
    per printer. Muju should **parameterise stud diameter and socket diameter separately** and pick them from a coupon.
  - Round studs on vertical axes print as polygons, and their seam adds a bump. Put seams at a consistent position or use
    "scarf"/aligned seams, and chamfer the stud top about 0.3 mm to aid entry.

## 4. Snap pins and rabbit clips (BOSL2)

- **Source:** BOSL2 `joiners.scad` and `constants.scad`. The library is **BSD-2-Clause** [S18][S19], **but** the docs state the
  snap-pin geometry "is based on thingiverse:213310 by Emmett Lalishe and … thing:3218332 by acwest and distributed under the
  **Creative Commons – Attribution – Share Alike** License" [S19]. So do **not** copy the snap-pin profile into Muju CAD.
- **Numbers [S19]:**
  - clearance **0.2 mm**, preload 0.2 mm (defaults)
  - standard pin Ø7 × 10.8 mm, snap 0.5 mm, wall 1.8 mm; medium Ø4.6 × 8, snap 0.45, wall 1.4; small Ø3.2 × 6, snap 0.4, wall 1.0
  - pins print flat-side-down
  - rabbit clip: socket about **0.4 mm deeper** than the clip
- **Numbers [S18]:** `$slop` is added once per mating surface. Calibrate 0.00–0.25 mm in 0.05 steps; the example is 0.15 mm.
- **What it teaches:**
  - Snap undercuts of **0.4–0.5 mm** on 1.0–1.8 mm walls are workable in PLA/PETG.
  - Printing the flexing element **in the XY plane** is how you avoid layer-line fracture. Apply this to the pedestal retention
    detent and the glyph-insert key.

## 5. Removable miniature bases with slots/magnets (slotta bases)

- **Sources:**
  - `DanielJoyce/ultimate_base_generator`, **CC BY-SA 4.0** [S26]: slotta slot **2.3 mm** wide through the base.
  - `eljeko/Parametric-OpenScad-movement-tray-generator`, **Apache-2.0** [S27]: slotta hole defaults **2 mm × 18 mm**, plus
    parametric magnet holes.
- **What it teaches:**
  - The wargaming convention for a removable upright element is a thin (about 2 mm) through-slot sized to a flat tab. The tab is
    usually glued, so the slot has little clearance.
  - Muju's **keyed removable glyph insert** is the same idea, but it must stay **removable without glue**. Design a thicker tab
    (≥ 2.4–3 mm so it's strong across layers), give it 0.15–0.20 mm/side slide clearance, and add a small unstressed detent or
    friction rib instead of glue.
  - Asymmetric keying (off-center or trapezoid tab) prevents putting the insert in backwards.
  - Do not reuse the CC BY-SA SCAD.

## 6. Board-game insert tolerances and stacking (Boardgame Insert Toolkit)

- **Source:** `dppdppd/The-Boardgame-Insert-Toolkit`, **CC BY-NC-SA 4.0** (© 2020 Ido Magal) [S28]. It is non-commercial and
  share-alike, so it is **reference only** and none of its code goes into Muju files.
- **Numbers [S28]:**
  - `$g_tolerance = 0.1` mm: "gap between fitting pieces such as lids and boxes"
  - stacking box bases need "a printer that can print a 45 degree overhang without supports"
  - the sliding-lid detent is a right-triangle bump with a 45° default lock angle; lower angles reduce resistance and 90° locks
  - "print a fit sample before making a full insert"
- **What it teaches:**
  - **0.1 mm** is the tight end for large, flat, well-supported fits.
  - A triangle detent with a tunable lock angle is a simple printable retention for pedestals: 45° gives removable click, steeper
    gives a firm hold.
  - Also useful for the storage tray: the ~550 cubes and 100 tiles will need an insert.

## 7. Printed snap fits (community practice)

- **Sources:**
  - probonopd's Onshape snap-fit gist [S20] (no license shown; ideas only).
  - `MEHDLLC/Flower-Pot-Stl-Generator` [S21] (license not shown; ideas only).
- **Numbers:**
  - clearance 0.1 (tuned) to 0.2 mm; 0.8 mm shell; 45° snap face, about 33° for more hold [S20]
  - cantilever strain ε = 3·t·δ / (2·L²), designed to 1.2 %; switch to PETG if PLA can't meet the target; across-layer strain is
    the weak direction [S21]
- **What it teaches:** "PLA slowly deforms … avoid friction fits" and "must not be under stress after being snapped together"
  [S20]. This argues against a permanent interference fit for pedestal stacking in PLA. Use a detent that relaxes when seated.

## 8. Stackable tokens (poker-chip / resource-cube style)

- No suitable repo with a clear license and published stud/socket dimensions for stacking tokens was found and read in this
  session. The GitHub search surfaced only insert/storage toolkits. **Not verified**; no claims made.
- Design inference: Muju's cube stud/socket is a scaled-down cousin of §3 (LEGO) and §2 (Gridfinity stacking lip). Its
  clearance should come from a cube-specific coupon, because very small round features deviate most (BOSL2 notes that small holes
  make `$slop` inaccurate and orientation-dependent [S18]).

## 9. Other sources checked

- **OpenForge** (`devonjones/openforge`): Dwarven-Forge-compatible tiles, archived. The README shows **no license** [S29], so it is
  not reusable. Not used.
- **Chess-piece peg/screw joints and signage letter pegs:** searches found OpenSCAD chess sets (e.g. `iamwilhelm/kings_gambit`),
  but the one cloned has no joint geometry. **Nothing usable was verified.** BOSL2's joiners [S19] cover the peg case.

## Summary of clearances from prior art

| Source | Fit type | Clearance |
|---|---|---|
| LEGO.scad [S22] | stud in post (moulded reference) | 0.03 mm, plus a per-printer `stud_rescale` |
| Gridfinity [S23] | press fit (crush ribs, magnet) | −0.05 mm/side |
| Gridfinity [S23] | side-by-side grid gap | 0.25 mm/side |
| OpenLOCK reimplementation [S24] | clip in slot | 0.1 mm/side + user tolerance |
| BIT [S28] | lid ↔ box | 0.1 mm |
| gist [S20] | general | 0.1–0.2 mm |
| BOSL2 [S18][S19] | slop calibration range / snap pin | 0–0.25 (example 0.15) / 0.2 mm |
| OrcaSlicer test [S14] | calibration coupon | 0 / 0.05 / 0.1 / 0.2 / 0.3 / 0.4 mm |
