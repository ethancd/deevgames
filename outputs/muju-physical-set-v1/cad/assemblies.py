#!/usr/bin/env python3
"""Generate assembly definitions from params.json + manifest.json.

    python3 outputs/muju-physical-set-v1/cad/assemblies.py

One parameterised rule produces all 6 elements x 2 owners x 3 tiers per variant
(108 states), plus loose (pending) glyphs, exploded offsets, the four resource
states, a tile-join demo, a crowded 3 x 3 patch, and the full canonical board.
Every entry references an exported GLB/STL; validate.py checks that they exist.
Transforms are 4x4 row-major matrices in millimetres (board frame: +X towards
file J, +Y towards rank 10, +Z up; Ivory sits on the rank-1 side).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from shapely import affinity
from shapely.geometry import Polygon, box

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
import sys
sys.path.insert(0, str(HERE))
from muju_physical import glyphs as G  # noqa: E402
from muju_physical import parts as PT  # noqa: E402

P = json.loads((HERE / "params.json").read_text())
ELEMENTS = G.ELEMENTS
OWNERS = ("ivory", "charcoal")
PLAYER = {"ivory": "white", "charcoal": "black"}


def T(x=0.0, y=0.0, z=0.0, rz=0.0, rx=0.0):
    c, s = math.cos(math.radians(rz)), math.sin(math.radians(rz))
    Rz = np.array([[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]])
    c2, s2 = math.cos(math.radians(rx)), math.sin(math.radians(rx))
    Rx = np.array([[1, 0, 0, 0], [0, c2, -s2, 0], [0, s2, c2, 0], [0, 0, 0, 1]])
    M = Rz @ Rx
    M[:3, 3] = [x, y, z]
    return M


def L(M):
    return [round(float(v), 5) for v in np.asarray(M).reshape(-1)]


def part_ref(man_parts, pid, color):
    p = man_parts[pid]
    return {"part": pid, "color": color, "glb": p["geometry"]["glb"][color], "stl": p["geometry"]["stl"]}


def piece_stack(variant: str, element: str, owner: str, tier: int):
    """Parts of one standing piece, bottom on z=0. Returns list of (pid, colour, matrix, layer, explode_dz)."""
    pc = P["piece"]
    t = P["glyph"]["thickness"]
    layers = []
    z = 0.0
    dots = P["variants"][variant].get("interface", "IF1").startswith("IF2")

    def layer(pid, M, label, dz, dot_layer):
        layers.append((f"{variant}.{pid}", owner, M, label, dz))
        if dots:
            layers.append((f"{variant}.dot-{dot_layer}", "dot", M, f"Tier dot ({label})", dz))
    if tier >= 3:
        layer("t3", T(z=z), "T3 addition", 0.0, "t3")
        z += pc["t3_height"]
    if tier >= 2:
        layer("t2", T(z=z), "T2 addition", 12.0 if tier == 3 else 0.0, "t2")
        z += pc["t2_height"]
    layer("base", T(z=z), "Ownership base (T1)", {1: 0.0, 2: 12.0, 3: 24.0}[tier], "base")
    z += pc["base_height"]
    # glyph frame -> standing: rotate +90 about X (front faces -Y), thickness centred
    M = T(0, t / 2, z, rx=90)
    layers.append((f"{variant}.glyph-{element}", element, M, "Element glyph (keyed tang in slot)", {1: 14.0, 2: 26.0, 3: 38.0}[tier]))
    return layers, z


def obstacles(tier_af: float, margin: float = 0.5):
    """Everything a lying glyph must not touch near the NE corner of a tile:
    the piece (as its across-corners circle, so any rotation), this tile's
    stacks and the neighbouring tiles' stacks."""
    from shapely.geometry import Point
    cb = P["crystal"]["body"]
    pitch = P["board"]["pitch"]
    occ = Point(0, 0).buffer(PT.across_corners(tier_af) / 2 + margin, 64)
    for ox, oy in ((0, 0), (pitch, 0), (0, pitch), (pitch, pitch)):
        for x, y in PT.stud_positions(P):
            occ = occ.union(box(ox + x - cb / 2 - margin, oy + y - cb / 2 - margin, ox + x + cb / 2 + margin, oy + y + cb / 2 + margin))
    return occ


def place_loose(outline, tier_af):
    """Lying glyph in the NE free corner: no contact with pieces or stacks;
    minimise the area that overhangs the tile outline (onto the seam/neighbour)."""
    half = P["board"]["tile_size"] / 2
    own = box(-half, -half, half, half)
    occ = obstacles(tier_af)
    best = (1e9, None)
    for ang in range(0, 360, 10):
        r = affinity.rotate(outline, ang, origin=(0, 0))
        c = r.centroid
        for tx in np.arange(12, 34, 0.5):
            for ty in np.arange(12, 34, 0.5):
                g = affinity.translate(r, tx - c.x, ty - c.y)
                if g.intersects(occ):
                    continue
                out = g.difference(own).area
                if out < best[0] - 1e-9:
                    best = (out, (ang, tx - c.x, ty - c.y, g.centroid.x <= half and g.centroid.y <= half))
    return best


def main():
    man = json.loads((OUT / "manifest.json").read_text())
    mp = {p["id"]: p for p in man["parts"]}
    variants = [v for v in P["variants"] if f"{v}.base" in mp]
    tile_h = P["board"]["tile_thickness"]
    pitch = P["board"]["pitch"]
    outlines, _ = G.load(G.repo_root(HERE), P["glyph"])
    rmap = man["resource_map"]["values_row_major_y_then_x"]
    cb = P["crystal"]["body"]
    stud_h = P["board"]["stud"]["height"]
    A = {"_doc": __doc__, "board_frame": "x right (file A->J), y away from Ivory (rank 1->10), z up; tile top at z=%.1f" % tile_h,
         "loose_glyph_convention": "A pending (loose) glyph lies face-up on its square with the symbol reading upright from its owner's seat "
                                   "(Ivory: symbol top towards rank 10; Charcoal: towards rank 1). No base, no extra marker.",
         "variants": {}}

    # loose-glyph placement beside an occupying piece (worst case: four 4-high stacks)
    coexist = {}
    for tier, af in ((1, P["piece"]["base_af"]), (2, P["piece"]["t2_af"]), (3, P["piece"]["t3_af"])):
        coexist[tier] = {}
        for el in ELEMENTS:
            out, (ang, tx, ty, centre_on_own) = place_loose(outlines[el]["outline"], af)
            coexist[tier][el] = {"rotation_deg": ang, "x": round(tx, 2), "y": round(ty, 2),
                                 "overhang_beyond_own_tile_mm2": round(out, 2), "centre_on_own_tile": bool(centre_on_own),
                                 "touches_piece_or_stack": False}
    A["loose_beside_piece"] = coexist

    for v in variants:
        V = {"piece_states": [], "loose": [], "resource_states": [], "tile_join": [], "crowded_patch": [], "board": {}}
        for el in ELEMENTS:
            for owner in OWNERS:
                for tier in (1, 2, 3):
                    layers, zs = piece_stack(v, el, owner, tier)
                    V["piece_states"].append({
                        "id": f"{v}.{el}.{owner}.t{tier}", "element": el, "owner": owner, "player": PLAYER[owner], "tier": tier,
                        "height_mm": round(zs + outlines[el]["visible_height_mm"], 2),
                        "footprint_af_mm": {1: P["piece"]["base_af"], 2: P["piece"]["t2_af"], 3: P["piece"]["t3_af"]}[tier],
                        "parts": [dict(part_ref(mp, pid, col), matrix=L(M), label=lab, explode_dz=dz) for pid, col, M, lab, dz in layers]})
            # loose glyph lying on an empty tile, centred
            V["loose"].append({"id": f"{v}.{el}.loose", "element": el,
                               "parts": [dict(part_ref(mp, f"{v}.glyph-{el}", el), matrix=L(T(0, -2, 0)), label="Loose glyph = pending summon")]})
        # resource states on an interior tile
        for val in (0, 4, 8, 16):
            tp = "interior-flat" if val == 0 else "interior"  # 0-crystal squares get the flat tile
            parts = [dict(part_ref(mp, f"{v}.tile-{tp}", "gray"), matrix=L(T()), label="Flat tile (no studs)" if val == 0 else "Tile")]
            per = val // 4
            for (x, y) in PT.stud_positions(P):
                for k in range(per):
                    parts.append(dict(part_ref(mp, "shared.crystal", "crystal"), matrix=L(T(x, y, tile_h + k * cb)), label="Crystal"))
            V["resource_states"].append({"id": f"{v}.resources.{val}", "crystals": val, "stack_height": per, "parts": parts})
        # tile join demo: 2 x 2 tiles (A1 corner area) slightly separated
        for (tx, ty) in ((0, 0), (1, 0), (0, 1), (1, 1)):
            tt = PT.tile_type_at(tx, ty)
            col = "ivory" if (tx, ty) == (0, 0) else "gray"
            V["tile_join"].append(dict(part_ref(mp, f"{v}.tile-{tt}", col), matrix=L(T(tx * pitch, ty * pitch)), board_xy=[tx, ty],
                                       label=f"{chr(65 + tx)}{ty + 1} {tt}"))
        # crowded patch: 3 x 3 interior tiles, T3 pieces on centre and two neighbours,
        # 16-crystal stacks everywhere, a loose glyph beside the centre piece
        patch = []
        for gx in (-1, 0, 1):
            for gy in (-1, 0, 1):
                ox, oy = gx * pitch, gy * pitch
                patch.append(dict(part_ref(mp, f"{v}.tile-interior", "gray"), matrix=L(T(ox, oy)), label="Tile"))
                for (x, y) in PT.stud_positions(P):
                    for k in range(4):
                        patch.append(dict(part_ref(mp, "shared.crystal", "crystal"), matrix=L(T(ox + x, oy + y, tile_h + k * cb)), label="Crystal"))
        for (gx, gy, el, owner, rot) in ((0, 0, "metal", "ivory", 22.5), (1, 0, "fire", "charcoal", 0.0), (0, 1, "water", "charcoal", 10.0), (-1, -1, "plant", "ivory", 0.0)):
            layers, _ = piece_stack(v, el, owner, 3)
            base = T(gx * pitch, gy * pitch, tile_h, rz=rot)
            for pid, col, M, lab, dz in layers:
                patch.append(dict(part_ref(mp, pid, col), matrix=L(base @ M), label=f"{owner} {el} T3: {lab}"))
        cz = coexist[3]["shadow"]
        patch.append(dict(part_ref(mp, f"{v}.glyph-shadow", "shadow"), matrix=L(T(cz["x"], cz["y"], tile_h, rz=cz["rotation_deg"])),
                          label="Loose shadow glyph (pending) beside the T3 piece"))
        V["crowded_patch"] = patch
        # full board
        tiles, crystals = [], []
        for y in range(10):
            for x in range(10):
                tt = PT.board_tile_part(x, y, rmap)
                col = "ivory" if (x, y) == (0, 0) else "charcoal" if (x, y) == (9, 9) else "gray"
                cx, cy = (x - 4.5) * pitch, (y - 4.5) * pitch
                tiles.append({"xy": [x, y], "coord": f"{chr(65 + x)}{y + 1}", "type": tt, "color": col,
                              "glb": mp[f"{v}.tile-{tt}"]["geometry"]["glb"][col], "matrix": L(T(cx, cy))})
                per = rmap[y * 10 + x] // 4
                for (sx, sy) in PT.stud_positions(P):
                    for k in range(per):
                        crystals.append(L(T(cx + sx, cy + sy, tile_h + k * cb)))
        start = {"white": [("fire", 1, 0), ("water", 1, 1), ("plant", 0, 1)], "black": [("fire", 8, 9), ("water", 8, 8), ("plant", 9, 8)]}
        pieces = []
        for player, lst in start.items():
            owner = "ivory" if player == "white" else "charcoal"
            for el, x, y in lst:
                layers, _ = piece_stack(v, el, owner, 1)
                base = T((x - 4.5) * pitch, (y - 4.5) * pitch, tile_h, rz=0 if owner == "ivory" else 180)
                pieces.append({"coord": f"{chr(65 + x)}{y + 1}", "owner": owner, "element": el,
                               "parts": [dict(part_ref(mp, pid, col), matrix=L(base @ M)) for pid, col, M, lab, dz in layers]})
        # gradient colour scheme on the same 100 tiles
        V["board_gradient_tiles"] = [dict(t, color=PT.square_colour(P, "gradient", t["xy"][0], t["xy"][1], rmap),
                                          glb=mp[f"{v}.tile-{t['type']}"]["geometry"]["glb"][PT.square_colour(P, "gradient", t["xy"][0], t["xy"][1], rmap)])
                                     for t in tiles]
        # nine printed sections (the IF2 variants share their parent's tiles and sections)
        sv = P["variants"][v].get("extends", v)
        V["board_sections"] = {}
        for scheme in ("gray", "gradient"):
            secs = []
            for r in man["parts"]:
                if r["variant"] == sv and r.get("section", {}).get("scheme") == scheme:
                    scx, scy = r["section"]["centre_mm"]
                    col = r["instances"][0]["color"]
                    secs.append({"part": r["id"], "section": r["section"]["name"], "color": col, "glb": r["geometry"]["glb"][col],
                                 "stl": r["geometry"]["stl"], "offset": [scx - 5 * pitch, scy - 5 * pitch],
                                 "matrix": L(T(scx - 5 * pitch, scy - 5 * pitch))})
            V["board_sections"][scheme] = secs
        V["board"] = {"tiles": tiles, "crystal_glb": mp["shared.crystal"]["geometry"]["glb"]["crystal"], "crystal_matrices": crystals,
                      "crystal_count": len(crystals), "start_pieces": pieces,
                      "outer_size_mm": [round(10 * pitch - (pitch - P["board"]["tile_size"]), 2)] * 2}
        A["variants"][v] = V
    (OUT / "assemblies").mkdir(exist_ok=True)
    (OUT / "assemblies" / "assemblies.json").write_text(json.dumps(A, separators=(",", ":")))
    n = sum(len(V["piece_states"]) for V in A["variants"].values())
    print(f"assemblies: {n} piece states across {len(variants)} variants; board crystals " +
          ", ".join(f"{v}={A['variants'][v]['board']['crystal_count']}" for v in variants))
    print("loose beside piece (mm^2 outside own free corner):", {t: {e: c["overhang_beyond_own_tile_mm2"] for e, c in d.items()} for t, d in coexist.items()})


if __name__ == "__main__":
    main()
