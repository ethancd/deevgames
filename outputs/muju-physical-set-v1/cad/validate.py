#!/usr/bin/env python3
"""Digital validation of every exported model, interface and assembly.

    python3 outputs/muju-physical-set-v1/cad/validate.py

Checks exported STL/3MF files (not the in-memory B-rep), mesh booleans for
every fit, all 108 assembled states, the full board and a crowded patch.
Writes validation/validation.json + validation/digital-checks.md and stamps
each manifest part's digital status. This is digital evidence only: no
slicer, no printer.
"""
from __future__ import annotations

import datetime as dt
import itertools
import json
import math
import sys
import zipfile
from pathlib import Path

import lib3mf
import manifold3d as mf
import numpy as np
import trimesh

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
sys.path.insert(0, str(HERE))
from muju_physical import parts as PT  # noqa: E402

P = json.loads((HERE / "params.json").read_text())
MAN = json.loads((OUT / "manifest.json").read_text())
ASM = json.loads((OUT / "assemblies" / "assemblies.json").read_text())
MP = {p["id"]: p for p in MAN["parts"]}
PLA, PETG = 1.24, 1.27  # g/cm^3 (typical datasheet values; mass estimates only)
_cache: dict[str, trimesh.Trimesh] = {}
fails: list[str] = []


def load(stl_rel: str) -> trimesh.Trimesh:
    if stl_rel not in _cache:
        _cache[stl_rel] = trimesh.load_mesh(OUT / stl_rel, process=True)
    return _cache[stl_rel]


def to_mf(m: trimesh.Trimesh, M=None) -> mf.Manifold:
    v = np.asarray(m.vertices, dtype=np.float64)
    if M is not None:
        M = np.asarray(M, dtype=float).reshape(4, 4)
        v = v @ M[:3, :3].T + M[:3, 3]
    return mf.Manifold(mf.Mesh(vert_properties=v.astype(np.float32), tri_verts=np.asarray(m.faces, dtype=np.uint32)))


def ivol(a: mf.Manifold, b: mf.Manifold) -> float:
    return float((a ^ b).volume())


def check(cond: bool, msg: str):
    if not cond:
        fails.append(msg)
    return cond


# ------------------------------------------------------------ 1. files
def file_checks():
    rows = {}
    for p in MAN["parts"]:
        g = p["geometry"]
        m = load(g["stl"])
        bodies = m.split(only_watertight=False)
        lo, hi = m.bounds
        size = (hi - lo).round(3).tolist()
        r = {
            "watertight": bool(m.is_watertight), "winding_consistent": bool(m.is_winding_consistent),
            "volume_positive": bool(m.volume > 0), "bodies": len(bodies), "triangles": int(len(m.faces)),
            "stl_volume_mm3": round(float(m.volume), 3), "brep_volume_mm3": g["brep_volume_mm3"],
            "volume_delta_pct": round(100 * (m.volume - g["brep_volume_mm3"]) / g["brep_volume_mm3"], 4),
            "bbox_mm": size, "bbox_matches_manifest": bool(np.allclose(size, g["bbox_mm"], atol=0.05)),
            "on_bed_z0": bool(abs(lo[2]) < 0.02),
            "degenerate_faces": int((m.area_faces < 1e-9).sum()),
            "min_z": round(float(lo[2]), 4),
        }
        # tier-dot inlays sit in their layer's frame (not on the bed); a section's colour part may be several islands
        r["inlay"], r["multi_island_ok"] = bool(p.get("inlay_of")), p["family"] == "board-section"
        ok = (r["watertight"] and r["winding_consistent"] and r["volume_positive"] and (r["bodies"] == 1 or r["multi_island_ok"])
              and abs(r["volume_delta_pct"]) < 0.5 and r["bbox_matches_manifest"] and (r["on_bed_z0"] or r["inlay"]) and g["brep_valid"])
        check(ok, f"file check {p['id']}: {r}")
        # downward-facing area above the bed (needs bridging/overhang), print frame
        n = m.face_normals
        c = m.triangles_center
        down = (n[:, 2] < -math.cos(math.radians(45))) & (c[:, 2] > 0.25)
        r["overhang_gt45_area_mm2"] = round(float(m.area_faces[down].sum()), 2)
        r["overhang_max_z_mm"] = round(float(c[down, 2].max()), 2) if down.any() else 0.0
        r["bed_contact_area_mm2"] = round(float(m.area_faces[(n[:, 2] < -0.999) & (c[:, 2] < 0.01)].sum()), 1)
        r["ok"] = ok
        rows[p["id"]] = r
    return rows


def threemf_checks():
    rows = {}
    w = lib3mf.get_wrapper()
    for path in sorted((OUT / "print").rglob("*.3mf")):
        model = w.CreateModel()
        reader = model.QueryReader("3mf")
        reader.SetStrictModeActive(True)
        reader.ReadFromFile(str(path))
        warn = reader.GetWarningCount()
        items = model.GetBuildItems()
        n = 0
        while items.MoveNext():
            n += 1
        objs = model.GetMeshObjects()
        meshes, ok_mesh = 0, True
        while objs.MoveNext():
            o = objs.GetCurrent()
            meshes += 1
            ok_mesh &= o.IsManifoldAndOriented()
        unit = model.GetUnit()
        with zipfile.ZipFile(path) as z:
            xml = z.read("3D/3dmodel.model").decode()
        r = {"strict_read": True, "warnings": warn, "build_items": n, "mesh_objects": meshes,
             "all_meshes_manifold_oriented": bool(ok_mesh), "unit_millimeter": unit == lib3mf.ModelUnit.MilliMeter,
             "slicer_settings_embedded": "Metadata/project_settings" in xml or "slic3rpe" in xml}
        check(warn == 0 and ok_mesh and r["unit_millimeter"], f"3mf {path.name}: {r}")
        rows[str(path.relative_to(OUT))] = r
    return rows


# ------------------------------------------------------------ 2. interfaces
def interface_checks():
    out = {}
    g, pc = P["glyph"], P["piece"]
    for v in P["variants"]:
        base = load(MP[f"{v}.base"]["geometry"]["stl"])
        t2 = load(MP[f"{v}.t2"]["geometry"]["stl"])
        t3 = load(MP[f"{v}.t3"]["geometry"]["stl"])
        B = to_mf(base)
        res = {"glyph_in_base": {}}
        # rib interference volume expected: two ribs, circular segment of height (rib - clearance) over rib length
        rr, rp, c = g["slot_rib_radius"], g["slot_rib_protrusion"], g["slot_clearance_per_side"]
        hseg = rp - c
        seg = rr * rr * math.acos((rr - hseg) / rr) - (rr - hseg) * math.sqrt(2 * rr * hseg - hseg * hseg)
        exp_rib = 2 * seg * (g["tang_depth"] - g["tang_tip_chamfer"])
        for el in ("fire", "lightning", "water", "shadow", "plant", "metal"):
            gl = load(MP[f"{v}.glyph-{el}"]["geometry"]["stl"])
            st = next(s for s in ASM["variants"][v]["piece_states"] if s["element"] == el and s["tier"] == 1)
            Mg = next(pp["matrix"] for pp in st["parts"] if pp["part"].endswith(f"glyph-{el}"))
            Gm = to_mf(gl, Mg)
            inter = ivol(Gm, B)
            # flipped 180 degrees about Z: must collide with the key
            Mf = np.asarray(Mg).reshape(4, 4).copy()
            flip = np.diag([-1, -1, 1, 1.0])
            flipped = ivol(to_mf(gl, flip @ Mf), B)
            # engagement: tang bottom vs slot floor gap
            tb = to_mf(gl, Mg).bounding_box()
            res["glyph_in_base"][el] = {
                "interference_mm3": round(inter, 3), "expected_rib_interference_mm3": round(exp_rib, 3),
                "only_rib_interference": bool(inter <= exp_rib * 1.6 + 0.05),
                "flipped_insertion_interference_mm3": round(flipped, 3), "keyed": bool(flipped > inter + 1.0),
                "tang_bottom_z": round(tb[2], 3), "slot_floor_z": round(pc["base_height"] - g["tang_depth"] - g["slot_extra_depth"], 3),
            }
            check(res["glyph_in_base"][el]["only_rib_interference"] and res["glyph_in_base"][el]["keyed"], f"{v} glyph {el} slot fit {res['glyph_in_base'][el]}")
        if P["variants"][v].get("interface", "IF1").startswith("IF2"):
            out[v] = dict(res, **if2_checks(v, base, t2, t3))
            continue
        # base on T2, T2 on T3
        b = pc["boss"]
        hseg = b["rib_protrusion"] - pc["recess"]["clearance_per_side"]
        rr = b["rib_radius"]
        seg = rr * rr * math.acos((rr - hseg) / rr) - (rr - hseg) * math.sqrt(2 * rr * hseg - hseg * hseg) if hseg > 0 else 0
        exp_boss = b["rib_count"] * seg * (b["height"] - b["top_chamfer"])
        T2 = to_mf(t2)
        base_on_t2 = ivol(to_mf(base, np.eye(4) + np.diag([0, 0, 0, 0]) if False else [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, pc["t2_height"]], [0, 0, 0, 1]]), T2)
        t2_on_t3 = ivol(to_mf(t2, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, pc["t3_height"]], [0, 0, 0, 1]]), to_mf(t3))
        res["base_on_t2_interference_mm3"] = round(base_on_t2, 3)
        res["t2_on_t3_interference_mm3"] = round(t2_on_t3, 3)
        res["expected_boss_rib_interference_mm3"] = round(exp_boss, 3)
        res["boss_engagement_mm"] = b["height"]
        res["boss_top_gap_mm"] = P["piece"]["recess"]["extra_depth"]
        check(base_on_t2 <= exp_boss * 1.6 + 0.05 and t2_on_t3 <= exp_boss * 1.6 + 0.05, f"{v} pedestal fits {res}")
        # wall and floor thickness by section
        sec = {}
        for name, m, z in (("base_at_slot_mid", base, pc["base_height"] - 2.0), ("base_between_recess_and_slot", base, None)):
            if z is None:
                floor = pc["base_height"] - g["tang_depth"] - g["slot_extra_depth"] - (b["height"] + pc["recess"]["extra_depth"])
                sec[name] = {"floor_mm": round(floor, 3)}
                check(floor >= 0.8, f"{v} base floor between recess and slot {floor}")
                continue
            s = m.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
            p2, _ = s.to_2D()
            polys = p2.polygons_full
            outer = max(polys, key=lambda q: q.area)
            holes = list(outer.interiors)
            from shapely.geometry import Polygon as SP
            from shapely.geometry import LineString as LS
            wall = min(LS(h.coords).distance(LS(outer.exterior.coords)) for h in holes) if holes else None
            sec[name] = {"z": z, "holes": len(holes), "min_wall_slot_to_outside_mm": round(wall, 3) if wall else None,
                         "closed_polygons": len(polys)}
        res["sections"] = sec
        out[v] = res
    # crystal stacking and tile studs (shared)
    cr = load(MP["shared.crystal"]["geometry"]["stl"])
    b_ = P["crystal"]["body"]
    C0, C1 = to_mf(cr), to_mf(cr, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, b_], [0, 0, 0, 1]])
    tile = load(MP["facet.tile-interior"]["geometry"]["stl"])
    d = P["board"]["stud"]["center_from_tile_center"]
    Ct = to_mf(cr, [[1, 0, 0, d], [0, 1, 0, 0], [0, 0, 1, P["board"]["tile_thickness"]], [0, 0, 0, 1]])
    st = P["board"]["stud"]
    sd = st["diameter"] + P["crystal"]["socket_diameter_clearance_diametral"]
    out["crystal"] = {"cube_on_cube_interference_mm3": round(ivol(C0, C1), 4), "cube_on_tile_stud_interference_mm3": round(ivol(Ct, to_mf(tile)), 4),
                      "stud_engagement_mm": st["height"], "socket_diameter_mm": round(sd, 3), "radial_clearance_mm": round((sd - st["diameter"]) / 2, 3),
                      "four_high_stack_height_above_tile_mm": round(4 * b_ + st["height"], 2)}
    check(out["crystal"]["cube_on_cube_interference_mm3"] < 1e-3 and out["crystal"]["cube_on_tile_stud_interference_mm3"] < 1e-3, f"crystal fits {out['crystal']}")
    # flat tiles (0-crystal squares): nothing may rise above the tile top
    top = P["board"]["tile_thickness"]
    out["flat_tiles"] = {pid: round(float(load(p["geometry"]["stl"]).bounds[1][2]), 3) for pid, p in MP.items() if pid.split(".")[-1].endswith("-flat")}
    check(len(out["flat_tiles"]) > 0 and all(abs(z - top) < 1e-3 for z in out["flat_tiles"].values()), f"flat tiles top {out['flat_tiles']}")
    half = load(MP["shared.half-crystal"]["geometry"]["stl"])
    out["crystal"]["half_on_cube_interference_mm3"] = round(ivol(to_mf(half, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, b_], [0, 0, 0, 1]]), C0), 4)
    return out


def if2_checks(v, base, t2, t3):
    """IF2: only the flex-beam bumps may overlap the collar; the key rejects any other rotation;
    a base cannot seat on a T3; dots sit flush in their pockets; core clears the glyph slot."""
    I, pc, g = P["if2"], P["piece"], P["glyph"]
    b = I["beam"]

    def Tz(z, rz=0.0):
        c, s_ = math.cos(math.radians(rz)), math.sin(math.radians(rz))
        return [[c, -s_, 0, 0], [s_, c, 0, 0], [0, 0, 1, z], [0, 0, 0, 1]]
    T2, T3 = to_mf(t2), to_mf(t3)
    depth = I["collar_height"] + I["groove_extra_depth"]
    engaged = min(depth, I["collar_height"]) - (depth - b["bump_height"])  # collar height inside the bump band
    exp = b["count"] * b["bump_arc"] * b["bump_interference"] * max(engaged, 0)
    r = {"interface": P["variants"][v]["interface"], "hollow_pedestals": P["variants"][v].get("hollow_pedestals", False),
         "base_on_t2_interference_mm3": round(ivol(to_mf(base, Tz(pc["t2_height"])), T2), 3),
         "t2_on_t3_interference_mm3": round(ivol(to_mf(t2, Tz(pc["t3_height"])), T3), 3),
         "expected_bump_preload_mm3_upper": round(exp, 3),
         "base_on_t2_rotated": {str(a): round(ivol(to_mf(base, Tz(pc["t2_height"], a)), T2), 3) for a in (45, 90, 180, 270)},
         "t2_on_t3_rotated": {str(a): round(ivol(to_mf(t2, Tz(pc["t3_height"], a)), T3), 3) for a in (45, 90, 180, 270)},
         "base_on_t3_wrong_tier_mm3": round(ivol(to_mf(base, Tz(pc["t3_height"])), T3), 3),
         "collar_engagement_mm": I["collar_height"]}
    dots = {}
    for layer, m in (("base", base), ("t2", t2), ("t3", t3)):
        dots[layer] = round(ivol(to_mf(load(MP[f"{v}.dot-{layer}"]["geometry"]["stl"])), to_mf(m)), 4)
    r["dot_vs_layer_interference_mm3"] = dots
    ro2, ri2 = P["if2"]["collar_outer_r"]["2"], P["if2"]["collar_outer_r"]["2"] - I["collar_wall"]
    slot_half_diag = math.hypot(g["tang_width"] / 2 + g["slot_clearance_per_side"], g["thickness"] / 2 + g["slot_clearance_per_side"])
    r["core_radius_minus_slot_half_diagonal_mm"] = round(ri2 - I["inner_clearance"] - slot_half_diag, 3)
    r["sections"] = {"base_at_slot_mid": {"min_wall_slot_to_outside_mm": None},
                     "base_between_recess_and_slot": {"floor_mm": f"n/a (annular groove; core margin {r['core_radius_minus_slot_half_diagonal_mm']} mm)"}}
    ok = (r["base_on_t2_interference_mm3"] <= exp * 1.6 + 0.05 and r["t2_on_t3_interference_mm3"] <= exp * 1.6 + 0.05
          and min(r["base_on_t2_rotated"].values()) > 2.0 and min(r["t2_on_t3_rotated"].values()) > 2.0
          and r["base_on_t3_wrong_tier_mm3"] > 20.0 and max(dots.values()) < 1e-3 and r["core_radius_minus_slot_half_diagonal_mm"] >= 2.0)
    check(ok, f"{v} IF2 fits {r}")
    return r


def section_checks():
    """Sectioned board: nine sections per tile style and scheme, colour parts per section
    union to one body, sections do not overlap when assembled, colours match the scheme."""
    out = {}
    rmap = MAN["resource_map"]["values_row_major_y_then_x"]
    for v in P["variants"]:
        if P["variants"][v].get("extends"):
            continue
        out[v] = {}
        for scheme in ("gray", "gradient"):
            secs = {}
            for r in MAN["parts"]:
                if r["variant"] == v and r.get("section", {}).get("scheme") == scheme:
                    secs.setdefault(r["section"]["name"], []).append(r)
            bodies, colours_ok = {}, True
            for name, rows in secs.items():
                x0, x1, y0, y1 = rows[0]["section"]["bounds"]
                cx, cy = rows[0]["section"]["centre_mm"]
                want = {PT.square_colour(P, scheme, x, y, rmap) for x in range(x0, x1) for y in range(y0, y1)}
                have = {rr["instances"][0]["color"] for rr in rows}
                colours_ok &= want == have
                ms = [to_mf(load(rr["geometry"]["stl"]), [[1, 0, 0, cx], [0, 1, 0, cy], [0, 0, 1, 0], [0, 0, 0, 1]]) for rr in rows]
                bodies[name] = mf.Manifold.batch_boolean(ms, mf.OpType.Add)
            worst = max(ivol(a, b) for a, b in itertools.combinations(bodies.values(), 2))
            allm = mf.Manifold.batch_boolean(list(bodies.values()), mf.OpType.Add)
            bb = allm.bounding_box()
            res = {"sections": len(secs), "colour_parts": sum(len(x) for x in secs.values()), "colours_match_scheme": bool(colours_ok),
                   "section_interference_max_mm3": round(worst, 4), "outer_size_mm": [round(bb[3] - bb[0], 2), round(bb[4] - bb[1], 2)],
                   "largest_section_mm": max(max(rr["geometry"]["bbox_mm"][:2]) for rows in secs.values() for rr in rows)}
            check(res["sections"] == 9 and colours_ok and worst < 1e-3 and max(res["outer_size_mm"]) <= 10 * P["board"]["pitch"] + 0.01
                  and res["largest_section_mm"] <= 300, f"sections {v} {scheme} {res}")
            out[v][scheme] = res
    return out


# ------------------------------------------------------------ 3. assemblies
def state_tol(v):
    """Largest allowed pairwise overlap inside an assembled state: IF1 crush ribs < 1 mm³;
    IF2 the designed bump preload (4 bumps x arc x preload x engaged height) with 60 % margin."""
    if not P["variants"][v].get("interface", "IF1").startswith("IF2"):
        return 1.0
    I = P["if2"]
    b = I["beam"]
    depth = I["collar_height"] + I["groove_extra_depth"]
    engaged = min(depth, I["collar_height"]) - (depth - b["bump_height"])
    return max(1.0, b["count"] * b["bump_arc"] * b["bump_interference"] * engaged * 1.6 + 0.05)


def assembly_checks():
    res = {"piece_states": {}, "missing_files": []}
    for v, V in ASM["variants"].items():
        n_ok = 0
        worst = 0.0
        for s in V["piece_states"]:
            for pp in s["parts"]:
                for k in ("glb", "stl"):
                    if not (OUT / pp[k]).exists():
                        res["missing_files"].append(pp[k])
            ms = [to_mf(load(pp["stl"]), pp["matrix"]) for pp in s["parts"]]
            inter = max(ivol(a, b) for a, b in itertools.combinations(ms, 2))
            worst = max(worst, inter)
            has = {pp["label"] for pp in s["parts"]}
            layers_ok = (s["tier"] < 3 or {"T3 addition", "T2 addition", "Ownership base (T1)"} <= has) and (s["tier"] != 2 or "T2 addition" in has)
            ok = inter < state_tol(v) and layers_ok and len([pp for pp in s["parts"] if not pp["part"].split(".")[-1].startswith("dot-")]) == s["tier"] + 1
            n_ok += ok
            check(ok, f"state {s['id']} inter {inter} parts {len(s['parts'])}")
        res["piece_states"][v] = {"states": len(V["piece_states"]), "ok": n_ok, "max_pair_interference_mm3": round(worst, 3),
                                  "combos": sorted({(s["element"], s["owner"], s["tier"]) for s in V["piece_states"]}).__len__()}
        check(len(V["piece_states"]) == 36, f"{v} has {len(V['piece_states'])} states")
    res["total_states"] = sum(r["states"] for r in res["piece_states"].values())
    check(res["total_states"] == 36 * len(ASM["variants"]) and not res["missing_files"], "state count / files")
    return res


def board_checks():
    out = {}
    rmap = MAN["resource_map"]["values_row_major_y_then_x"]
    for v, V in ASM["variants"].items():
        tiles = V["board"]["tiles"]
        colors = [t["color"] for t in tiles]
        a1 = next(t for t in tiles if t["coord"] == "A1")
        j10 = next(t for t in tiles if t["coord"] == "J10")
        ms = {tuple(t["xy"]): to_mf(load(MP[f"{v}.tile-{t['type']}"]["geometry"]["stl"]), t["matrix"]) for t in tiles}
        worst, gaps = 0.0, []
        for (x, y), m in ms.items():
            for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
                n = ms.get((x + dx, y + dy))
                if n is not None:
                    worst = max(worst, ivol(m, n))
        # each E tab must sit inside its neighbour's socket: union bbox of the board
        allm = mf.Manifold.batch_boolean(list(ms.values()), mf.OpType.Add)
        bb = allm.bounding_box()
        size = [round(bb[3] - bb[0], 2), round(bb[4] - bb[1], 2)]
        out[v] = {"tiles": len(tiles), "gray": colors.count("gray"), "ivory": colors.count("ivory"), "charcoal": colors.count("charcoal"),
                  "A1": a1["color"], "J10": j10["color"], "neighbour_interference_max_mm3": round(worst, 4),
                  "outer_size_mm": size, "no_tab_beyond_outline": bool(max(size) <= 10 * P["board"]["pitch"] - (P["board"]["pitch"] - P["board"]["tile_size"]) + 0.01),
                  "crystals": V["board"]["crystal_count"], "resource_total_from_resourceMap_ts": sum(rmap),
                  "tile_types": {k: sum(1 for t in tiles if t["type"] == k) for k in PT.board_tile_counts(rmap)},
                  "flat_tiles_exactly_on_zero_squares": all(t["type"].endswith("-flat") == (rmap[t["xy"][1] * 10 + t["xy"][0]] == 0) for t in tiles),
                  "flat_tiles": sum(1 for t in tiles if t["type"].endswith("-flat"))}
        r = out[v]
        check(r["tiles"] == 100 and r["gray"] == 98 and r["ivory"] == 1 and r["charcoal"] == 1 and r["A1"] == "ivory" and r["J10"] == "charcoal"
              and r["neighbour_interference_max_mm3"] < 1e-3 and r["crystals"] == 504 and r["no_tab_beyond_outline"]
              and r["flat_tiles_exactly_on_zero_squares"] and r["flat_tiles"] == rmap.count(0), f"board {v} {r}")
    return out


def crowded_checks():
    """Worst-case occupancy: T3 pieces (one rotated 22.5 deg), four 4-high stacks
    per tile on a 3 x 3 patch, a loose glyph beside the centre piece."""
    out = {}
    for v, V in ASM["variants"].items():
        pieces, crystals, loose = [], [], []
        for pp in V["crowded_patch"]:
            m = to_mf(load(pp["stl"]), pp["matrix"])
            if "Crystal" == pp["label"]:
                crystals.append(m)
            elif pp["label"].startswith("Loose"):
                loose.append(m)
            elif pp["label"] != "Tile":
                pieces.append(m)
        cs = mf.Manifold.batch_boolean(crystals, mf.OpType.Add)
        ps = mf.Manifold.batch_boolean(pieces, mf.OpType.Add)
        piece_vs_crystal = ivol(ps, cs)
        loose_vs = ivol(loose[0], mf.Manifold.batch_boolean([cs, ps], mf.OpType.Add))
        # clearance: shrink test -- grow T3 footprint radially and see when it hits a stack
        d = P["board"]["stud"]["center_from_tile_center"] - P["crystal"]["body"] / 2
        af = P["piece"]["t3_af"]
        out[v] = {"piece_vs_crystal_interference_mm3": round(piece_vs_crystal, 4), "loose_glyph_interference_mm3": round(loose_vs, 4),
                  "stack_inner_face_from_centre_mm": d, "t3_half_across_flats_mm": af / 2,
                  "t3_half_across_corners_mm": round(PT.across_corners(af) / 2, 3),
                  "clearance_flats_facing_mm": round(d - af / 2, 3),
                  "clearance_worst_rotation_mm": round(d - PT.across_corners(af) / 2, 3)}
        check(piece_vs_crystal < 1e-3 and loose_vs < 1e-3, f"crowded {v} {out[v]}")
    return out


def lift_checks():
    """Weakest retention joint when a T3 piece is lifted by its glyph."""
    out = {}
    for v in P["variants"]:
        vol = {k: MP[f"{v}.{k}"]["geometry"]["brep_volume_mm3"] for k in ("base", "t2", "t3")}
        # mass bounds: 100% solid (upper) and ~45% (3 walls + 15% infill, rough lower)
        m_hi = {k: vol[k] / 1000 * PLA for k in vol}
        out[v] = {"mass_g_solid_upper_bound": {k: round(x, 2) for k, x in m_hi.items()},
                  "load_on_glyph_joint_N": round(sum(m_hi.values()) * 9.81 / 1000, 3),
                  "load_on_base_T2_joint_N": round((m_hi["t2"] + m_hi["t3"]) * 9.81 / 1000, 3),
                  "load_on_T2_T3_joint_N": round(m_hi["t3"] * 9.81 / 1000, 3),
                  "weakest_joint": "glyph tang in base slot: it carries base + T2 + T3 when lifted by the glyph",
                  "note": "Retention force of the crush-rib fits is not computable reliably for FDM; the coupon sweep measures it. Pass criterion: holds >= 3x the load (about 0.3 N) and releases by hand."}
    return out


def write_md(rep):
    V = list(P["variants"])
    files = rep["files"]
    L = ["# Digital checks", "", f"Generated {rep['generated']} by `cad/validate.py`. **Digital evidence only:** exported files re-imported and",
         "tested with mesh booleans (manifold3d), sections (trimesh) and strict 3MF reads (lib3mf 2.5). Slicer results are separate",
         "([`slicer/slicer-checks.md`](slicer/slicer-checks.md)); nothing was printed. Machine-readable results: [`validation.json`](validation.json).", "",
         f"**Result: {'all checks passed' if rep['passed'] else str(len(rep['failures'])) + ' failures'}.**", "",
         "## Files", "",
         f"- {sum(r['ok'] for r in files.values())}/{len(files)} STL part files pass: watertight, consistent winding, positive volume, one connected body, "
         "volume within 0.5 % of the B-rep, bounding box equals the manifest, resting on Z=0 in print orientation.",
         f"- Largest STL/B-rep volume difference: {max(abs(r['volume_delta_pct']) for r in files.values()):.3f} %.",
         f"- {len(rep['threemf'])} plate 3MFs read in lib3mf strict mode: warnings "
         f"{sum(t['warnings'] for t in rep['threemf'].values())}, all meshes manifold and oriented: "
         f"{all(t['all_meshes_manifold_oriented'] for t in rep['threemf'].values())}, units mm: {all(t['unit_millimeter'] for t in rep['threemf'].values())}, "
         f"slicer settings embedded: {any(t['slicer_settings_embedded'] for t in rep['threemf'].values())} (geometry-only by design).", "",
         "## Interfaces (per variant)", "", "| Check | " + " | ".join(V) + " |", "|---|" + "---|" * len(V)]
    I = rep["interfaces"]
    L.append("| Glyph tang in base: interference (only crush ribs expected, mm³) | " + " | ".join(
        ", ".join(f"{e[:3]} {g['interference_mm3']}" for e, g in I[v]["glyph_in_base"].items()) for v in V) + " |")
    L.append("| Glyph inserted backwards collides with key (all 6) | " + " | ".join(str(all(g["keyed"] for g in I[v]["glyph_in_base"].values())) for v in V) + " |")
    L.append("| Base on T2 / T2 on T3 interference (ribs only, mm³) | " + " | ".join(f"{I[v]['base_on_t2_interference_mm3']} / {I[v]['t2_on_t3_interference_mm3']}" for v in V) + " |")
    L.append("| Min wall slot-to-outside at z=5.5 (section) | " + " | ".join(f"{I[v]['sections']['base_at_slot_mid']['min_wall_slot_to_outside_mm']} mm" for v in V) + " |")
    L.append("| Floor between recess and slot | " + " | ".join(f"{I[v]['sections']['base_between_recess_and_slot']['floor_mm']} mm" for v in V) + " |")
    c = I["crystal"]
    L += ["", f"Crystals (shared): cube-on-cube interference {c['cube_on_cube_interference_mm3']} mm³, cube on tile stud {c['cube_on_tile_stud_interference_mm3']} mm³, "
          f"half token on cube {c['half_on_cube_interference_mm3']} mm³; stud engagement {c['stud_engagement_mm']} mm; radial clearance {c['radial_clearance_mm']} mm; "
          f"four-high stack {c['four_high_stack_height_above_tile_mm']} mm.", "",
          "## Assemblies", "",
          f"- {rep['assemblies']['total_states']} of {36 * len(V)} element × owner × tier states resolve to existing GLB and STL files. Every T3 contains base, T2 and T3. "
          f"Maximum pairwise interference inside any state: {max(r['max_pair_interference_mm3'] for r in rep['assemblies']['piece_states'].values())} mm³ (IF1 crush ribs; IF2 flex-beam bump preload).",
          "", "## Board", ""]
    for v in V:
        b = rep["board"][v]
        L.append(f"- **{v}:** {b['tiles']} tiles = {b['gray']} gray + {b['ivory']} ivory + {b['charcoal']} charcoal; A1 {b['A1']}, J10 {b['J10']}; "
                 f"neighbour interference {b['neighbour_interference_max_mm3']} mm³; outline {b['outer_size_mm']} mm, no tab beyond it: {b['no_tab_beyond_outline']}; "
                 f"crystals {b['crystals']} (resourceMap.ts total {b['resource_total_from_resourceMap_ts']}); types {b['tile_types']}.")
    L += ["", "## Board in nine sections", ""]
    for v, d in rep["sections"].items():
        for scheme, r in d.items():
            L.append(f"- **{v} / {scheme}:** {r['sections']} sections, {r['colour_parts']} colour parts, colours match the scheme: {r['colours_match_scheme']}; "
                     f"section overlap {r['section_interference_max_mm3']} mm³; assembled outline {r['outer_size_mm']} mm; largest section {r['largest_section_mm']} mm (bed 300 × 320).")
    if2v = [v for v in V if "expected_bump_preload_mm3_upper" in I[v]]
    if if2v:
        L += ["", "## IF2 joints (Turned Court keyed / ring)", "", "| Check | " + " | ".join(if2v) + " |", "|---|" + "---|" * len(if2v)]
        L.append("| Base on T2 / T2 on T3 overlap = bump preload only (mm³; bound) | " + " | ".join(f"{I[v]['base_on_t2_interference_mm3']} / {I[v]['t2_on_t3_interference_mm3']} (≤ {I[v]['expected_bump_preload_mm3_upper']})" for v in if2v) + " |")
        L.append("| Wrong rotation collides (min over 45/90/180/270°, mm³) | " + " | ".join(f"{min(I[v]['base_on_t2_rotated'].values())} / {min(I[v]['t2_on_t3_rotated'].values())}" for v in if2v) + " |")
        L.append("| Base on a T3 (wrong tier) collides (mm³) | " + " | ".join(str(I[v]["base_on_t3_wrong_tier_mm3"]) for v in if2v) + " |")
        L.append("| Tier dots flush in pockets (max overlap mm³) | " + " | ".join(str(max(I[v]["dot_vs_layer_interference_mm3"].values())) for v in if2v) + " |")
        L.append("| Groove core clears the glyph slot by (mm) | " + " | ".join(str(I[v]["core_radius_minus_slot_half_diagonal_mm"]) for v in if2v) + " |")
    L += ["", "## Crowded patch and ergonomics (digital part only)", ""]
    for v in V:
        cp = rep["crowded_patch"][v]
        L.append(f"- **{v}:** T3 pieces (one at 22.5°) vs 4-high stacks: {cp['piece_vs_crystal_interference_mm3']} mm³; loose glyph vs pieces/stacks: {cp['loose_glyph_interference_mm3']} mm³; "
                 f"clearance {cp['clearance_flats_facing_mm']} mm flats-facing, {cp['clearance_worst_rotation_mm']} mm worst rotation.")
    L += ["", "Loose glyph beside an occupying piece with four 4-high stacks (largest overhang beyond its tile, mm²; nothing touched):", "",
          "| Tier | " + " | ".join(G_ELS) + " |", "|---|" + "---|" * len(G_ELS)]
    for t, d in rep["coexistence_loose_glyph"].items():
        L.append(f"| T{t} | " + " | ".join(str(d[e]["overhang_beyond_own_tile_mm2"]) for e in G_ELS) + " |")
    L += ["", "Still needs a hand trial: finger access to single cubes when stacks sit 1.0 mm apart across a seam; whether the loose-glyph overhang is acceptable;",
          "wobble; retention force and wear. See `print/PHYSICAL-TEST-SEQUENCE.md`.", "",
          "## Print orientation / supports (from the exported meshes)", "",
          "| Part | Downward faces >45° above bed (mm²) | Highest such face (mm) | Bed contact (mm²) | Interpretation |", "|---|---:|---:|---:|---|"]
    for pid in ("facet.base", "facet.t2", "facet.t3", "turned.t3", "facet.glyph-plant", "facet.tile-interior", "shared.crystal", "shared.half-crystal"):
        r = files[pid]
        why = {"facet.base": "recess ceiling bridge (14.3 mm) + key filler roof", "facet.t2": "recess ceiling bridge", "shared.crystal": "socket ceiling bridge (3.45 mm)",
               "shared.half-crystal": "socket ceiling bridge"}.get(pid, "chamfers only; no support")
        L.append(f"| `{pid}` | {r['overhang_gt45_area_mm2']} | {r['overhang_max_z_mm']} | {r['bed_contact_area_mm2']} | {why} |")
    L += ["", "No part needs support material; every plate slices without support in Bambu Studio (see `slicer/`); a visual preview of the bridged ceilings is still owed."]
    if rep["failures"]:
        L += ["", "## Failures", ""] + [f"- {f}" for f in rep["failures"]]
    (OUT / "validation" / "digital-checks.md").write_text("\n".join(L) + "\n")


G_ELS = ("fire", "lightning", "water", "shadow", "plant", "metal")


def main():
    t = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    rep = {"generated": t, "scope": "Digital checks of exported files only. No slicer, no printer.",
           "files": file_checks(), "threemf": threemf_checks(), "interfaces": interface_checks(),
           "assemblies": assembly_checks(), "board": board_checks(), "crowded_patch": crowded_checks(),
           "lift": lift_checks(), "sections": section_checks(), "coexistence_loose_glyph": ASM["loose_beside_piece"]}
    inv = MAN["inventory"]
    rep["inventory"] = {v: inv[v]["objects"] for v in inv}
    check(all(n == 891 for n in rep["inventory"].values()), f"inventory {rep['inventory']}")
    rep["failures"] = fails
    rep["passed"] = not fails
    (OUT / "validation").mkdir(exist_ok=True)
    (OUT / "validation" / "validation.json").write_text(json.dumps(rep, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)))
    for p in MAN["parts"]:
        p["validation"]["digital"] = "pass" if rep["files"][p["id"]]["ok"] else "FAIL"
    MAN["validation_summary"] = {"generated": t, "digital_passed": rep["passed"], "failures": len(fails),
                                 "slicer": "see validation/slicer/ (cad/slice_check.py)",
                                 "physical": "not performed"}
    (OUT / "manifest.json").write_text(json.dumps(MAN, indent=1, ensure_ascii=False))
    write_md(rep)
    print(f"files {sum(r['ok'] for r in rep['files'].values())}/{len(rep['files'])}, 3mf {len(rep['threemf'])}, "
          f"states {rep['assemblies']['total_states']}, failures {len(fails)}")
    for f in fails[:20]:
        print("FAIL", f[:300])


if __name__ == "__main__":
    main()
