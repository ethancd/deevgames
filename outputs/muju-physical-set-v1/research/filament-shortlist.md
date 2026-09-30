# Filament shortlist — Bambu Lab (US store)

Date: 2026-09-30.

**Store status: none of the Bambu store pages could be retrieved.** `us.store.bambulab.com` and
`store.bambulab.com` were blocked by the session's egress proxy (N06, N07). So **list price, sale
price, stock/availability and spool weight are all "not verified"** below. None of these were
guessed. The product families, color names, 5-digit color codes and slicer temperatures come from
Bambu Lab's own Bambu Studio data on GitHub [S04][S05] (commit 2026-09-28). That data proves the
color exists in Bambu's catalogue, **not** that it is in stock in the US store today.

Bambu Studio's filament profiles also carry a `filament_cost` field: PLA Basic, PLA Matte, PETG
Translucent and PETG HF = **15.99**; PLA Metal = **21.99** [S04]. This is the slicer's default
cost-per-kg for cost estimates. It is **not** a verified store price and should not be quoted as one.

## Palette roles

| Role | Product (family) | Color name | Color code [S05] | Hex (catalogue swatch) [S05] | Nozzle / bed °C on H2C [S04] | List / sale price (USD) | Stock | Spool weight |
|---|---|---|---|---|---|---|---|---|
| Light player / base | PLA Matte | **Ivory White** | 11100 (W2) | #FFFFFF | 220 / 55 (range 190–240) | not verified | not verified | not verified |
| Dark player / base | PLA Matte | **Charcoal** | 11101 (K1) | #000000 | 220 / 55 | not verified | not verified | not verified |
| Board gray (option A, mid-light) | PLA Matte | **Ash Gray** | 11102 (D3) | #9B9EA0 | 220 / 55 | not verified | not verified | not verified |
| Board gray (option B, medium-dark) | PLA Matte | **Nardo Gray** | 11104 (D0) | #757575 | 220 / 55 | not verified | not verified | not verified |
| Board gray (option C, glossy) | PLA Basic | **Gray** | 10103 (D0) | #8E9089 | 220 / 55 | not verified | not verified | not verified |
| Glyph — red | PLA Basic | **Red** | 10200 (R0) | #C12E1F | 220 / 55 | not verified | not verified | not verified |
| Glyph — yellow | PLA Basic | **Yellow** | 10400 (Y0) | #F4EE2A | 220 / 55 | not verified | not verified | not verified |
| Glyph — blue | PLA Basic | **Cobalt Blue** | 10604 (B3) | #0056B8 | 220 / 55 | not verified | not verified | not verified |
| Glyph — purple | PLA Basic | **Purple** | 10700 (P5) | #5E43B7 | 220 / 55 | not verified | not verified | not verified |
| Glyph — green | PLA Basic | **Bambu Green** | 10501 (G6) | #00AE42 | 220 / 55 | not verified | not verified | not verified |
| Metallic accent (6th glyph / pedestal trim) | PLA Metal | **Copper Brown Metallic** | 13800 (N3) | #AA6443 | 220 / 55, fan 100 %, max 21 mm³/s; separate H2C 0.4-nozzle profile exists | not verified | not verified | not verified |
| Cubes (primary) | PETG Translucent | **Translucent Teal** | 32501 (G1) | #77EDD7 (α 50 %) | 245 (1st layer 250) / 70; fan 10–30 %; max **6 mm³/s** on 0.4 | not verified | not verified | not verified |

"Hex" is the catalogue swatch used by the slicer UI. Do not use it for color matching. Charcoal and Ivory White are stored as pure
#000000 / #FFFFFF.

## Translucent cyan alternatives for the cubes

| Candidate | Code [S05] | Swatch [S05] | Notes |
|---|---|---|---|
| **PETG Translucent — Translucent Teal** | 32501 | #77EDD7 | Greenish aqua. Best "cyan crystal" match in PETG. Tougher for repeated stacking (see below). |
| PETG Translucent — Translucent Light Blue | 32600 | #61B0FF | Bluer, less green. May read too close to Cobalt Blue glyphs. |
| PETG Translucent — Clear | 32101 | transparent | Colorless; would need a tinted look from elsewhere. Not recommended. |
| **PLA Translucent — Teal** | 13612 | #009FA1 | Deeper teal. The product family exists in Bambu's catalogue (`fila_id` GFA17) with an H2C profile: 220 °C, 55 °C bed, fan 100 %, max 12 mm³/s [S04][S05]. Store availability not verified. |
| PLA Translucent — Ice Blue | 13610 | #B8CDE9 | Very pale; may lose contrast on an Ivory/Ash board. |
| PLA Translucent — Blue | 13611 | #0047BB | Too dark, and clashes with Cobalt Blue. |

## PETG cubes on PLA studs: does material choice change the fit? (design inference)

- **Shrinkage:** Bambu's profiles apply **no** shrink compensation to either PLA or PETG (`filament_shrink` 100 %) [S04]. Nothing in
  the retrieved first-party data says PETG shrinks more or less than PLA. The commonly repeated claim that "PETG shrinks less" is
  **not verified** here. Treat both as 1:1 and let the fit coupon (0.05–0.20 mm radial sweep, see printing-guidance.md §7.1) decide.
- **Stringing/ooze:** PETG runs hotter (245–250 °C) with low fan (10–30 %) [S04], so it strings more than PLA. Inside the cube
  socket, strings and blobs tighten the fit unpredictably. Keep sockets simple, with an entry chamfer, and consider "only retract
  when crossing perimeters" off for cubes. Remove any socket-lip string with a quick deburr pass.
- **Flexibility:** PETG is less brittle than PLA, so a PETG socket can take a slightly tighter fit (closer to 0.05–0.10 mm) without
  cracking and survives many stack/unstack cycles. A PLA-on-PLA stud fit would need more clearance and still risks splitting the
  socket wall across layers (see the `impact_strength_z` notes in printing-guidance.md §4).
- **Wear:** the harder PLA stud wears the softer PETG socket. Over hundreds of cycles, expect the fit to loosen slightly. Start on
  the tight side.
- **Cube on cube:** PETG studs in PETG sockets wear evenly with each other. Their fit may need a different clearance from PETG on
  PLA, so test both pairs.
- **PLA Translucent Teal instead:** the whole set would then be PLA and one clearance would serve everything, but cube sockets
  become brittle-split risks. It is the fallback only if PETG's clarity or stringing disappoints.

## Estimated quantities (design inference, not sourced)

- Cubes: 550 × ~0.17–0.2 cm³ (5.5 mm cube plus stud, about 100 % infill minus the socket) ≈ 90–110 cm³ × 1.25 g/cm³ [S04 density] ≈ **~115–140 g PETG** plus waste. One 1 kg spool
  is plenty (spool size not verified).
- Tiles: 100 × (50 × 50 × ~4 mm at about 40 % effective fill) ≈ 400 cm³ ≈ **~0.5 kg** of board gray. Budget 1 kg plus a spare.

## Action

Before ordering, fetch the four store URLs by hand
(`/products/pla-matte`, `/products/pla-basic-filament`, `/products/pla-metal`, `/products/petg-translucent`). Record price, sale
price, stock and spool weight (with or without spool/refill), and replace every "not verified" above.
