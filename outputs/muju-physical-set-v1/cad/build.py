#!/usr/bin/env python3
"""Build every printable part of the Muju physical set, for all three variants.

    python3 outputs/muju-physical-set-v1/cad/build.py            # everything
    python3 outputs/muju-physical-set-v1/cad/build.py --variant facet

Reads params.json (the only place dimensions live) and the canonical Muju
sources. Writes models/, assemblies/, print/ plates and manifest.json.
Geometry: build123d/OpenCascade B-rep -> STEP; STL/3MF from the same B-rep
tessellation; lightweight GLB for viewing.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import trimesh
from build123d import export_step, export_stl

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from muju_physical import glyphs as G  # noqa: E402
from muju_physical import parts as PT  # noqa: E402
from muju_physical.threemf import write_3mf  # noqa: E402

OUT = HERE.parent
ROOT = G.repo_root(HERE)
P = json.loads((HERE / "params.json").read_text())
VARIANTS = list(P["variants"])
STL_TOL, STL_ANG = 0.01, 0.1
GLB_TOL, GLB_ANG = 0.04, 0.3

PBR = {  # viewing materials (GLB only); colours from params.palette
    "ivory": (0.0, 0.75), "charcoal": (0.0, 0.75), "gray": (0.0, 0.8),
    "fire": (0.0, 0.45), "lightning": (0.0, 0.45), "water": (0.0, 0.45),
    "shadow": (0.0, 0.45), "plant": (0.0, 0.45), "metal": (0.65, 0.38),
    "crystal": (0.0, 0.15),
}


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def rel(p: Path) -> str:
    return str(p.relative_to(OUT))


def hex_rgba(h: str, a: float = 1.0):
    """sRGB hex -> linear RGBA, as glTF baseColorFactor requires."""
    h = h.lstrip("#")
    lin = [(c / 12.92) if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))]
    return [round(c, 5) for c in lin] + [a]


def read_resource_map():
    src = ROOT / "muju/src/game/resourceMap.ts"
    text = src.read_text()
    body = re.search(r"UNEQUAL_ROUTES_MAP[^=]*=\s*Object\.freeze\(\[(.*?)\]\)", text, re.S).group(1)
    vals = [int(v) for v in re.findall(r"\d+", body)]
    assert len(vals) == 100, len(vals)
    return vals, sha(src)


def unit_names():
    text = (ROOT / "muju/src/game/units.ts").read_text()
    names = {}
    for m in re.finditer(r"id: '(\w+)_1',\s*name: '([^']+)'", text):
        names[m.group(1)] = m.group(2)
    return names


# ------------------------------------------------------------------ export
def export_part(shape, pid: str, folder: Path, colors: list[str]):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "step").mkdir(exist_ok=True)
    (folder / "stl").mkdir(exist_ok=True)
    (folder / "glb").mkdir(exist_ok=True)
    step, stl = folder / "step" / f"{pid}.step", folder / "stl" / f"{pid}.stl"
    export_step(shape, str(step))
    export_stl(shape, str(stl), tolerance=STL_TOL, angular_tolerance=STL_ANG)
    mesh = trimesh.load_mesh(stl, process=True)
    verts, tris = shape.tessellate(GLB_TOL, GLB_ANG)
    light = trimesh.Trimesh(np.array([[v.X, v.Y, v.Z] for v in verts]), np.array(tris), process=True)
    light.fix_normals()
    glbs = {}
    for c in colors:
        pal = P["palette"][c]
        metal, rough = PBR[c]
        mat = trimesh.visual.material.PBRMaterial(
            name=f"{c}", baseColorFactor=hex_rgba(pal["hex"], pal.get("opacity", 1.0)),
            metallicFactor=metal, roughnessFactor=rough,
            alphaMode="BLEND" if pal.get("opacity", 1) < 1 else "OPAQUE", doubleSided=False)
        m = light.copy()
        m.visual = trimesh.visual.TextureVisuals(material=mat)
        g = folder / "glb" / f"{pid}@{c}.glb"
        m.export(g)
        glbs[c] = rel(g)
    bb = shape.bounding_box()
    return {
        "step": rel(step), "stl": rel(stl), "glb": glbs,
        "bbox_mm": [round(bb.size.X, 3), round(bb.size.Y, 3), round(bb.size.Z, 3)],
        "bbox_min_mm": [round(bb.min.X, 3), round(bb.min.Y, 3), round(bb.min.Z, 3)],
        "brep_volume_mm3": round(shape.volume, 3),
        "stl_volume_mm3": round(float(mesh.volume), 3),
        "stl_triangles": int(len(mesh.faces)),
        "brep_valid": bool(shape.is_valid),
        "solids": len(shape.solids()),
        "sha256": {"step": sha(step), "stl": sha(stl)},
        "_mesh": mesh,
    }


# ------------------------------------------------------------------ packing
BED = (300.0, 320.0)  # both-head common area of the H2C (research/printing-guidance.md)
MARGIN, GAP = 8.0, 4.0


def pack(footprints: list[tuple[str, float, float]]):
    """Shelf-pack (id, w, h) footprints into as many plates as needed.
    Returns plates -> [(id, x_centre, y_centre)] in bed coordinates."""
    W, H = BED[0] - 2 * MARGIN, BED[1] - 2 * MARGIN
    plates, cur, x, y, shelf = [], [], 0.0, 0.0, 0.0
    for pid, w, h in footprints:
        if x + w > W:
            x, y, shelf = 0.0, y + shelf + GAP, 0.0
        if y + h > H:
            plates.append(cur)
            cur, x, y, shelf = [], 0.0, 0.0, 0.0
        cur.append((pid, MARGIN + x + w / 2, MARGIN + y + h / 2))
        x += w + GAP
        shelf = max(shelf, h)
    if cur:
        plates.append(cur)
    return plates


def write_plates(name: str, items: list[tuple[str, str, int]], parts: dict, folder: Path, title: str):
    """items: (part_key, colour, qty). One 3MF per plate, geometry only."""
    folder.mkdir(parents=True, exist_ok=True)
    fps = []
    for key, col, qty in items:
        m = parts[key]["_mesh"]
        lo, hi = m.bounds
        for i in range(qty):
            fps.append((f"{key}|{col}|{i}", hi[0] - lo[0], hi[1] - lo[1]))
    plates = pack(fps)
    out = []
    for n, plate in enumerate(plates, 1):
        objs, obj_ids, mats, mat_idx, items3 = [], {}, [], {}, []
        for pid, cx, cy in plate:
            key, col, _ = pid.split("|")
            if col not in mat_idx:
                mat_idx[col] = len(mats)
                mats.append({"name": f"{col} — {P['palette'][col]['lead']}", "hex": P["palette"][col]["hex"]})
            ok = (key, col)
            if ok not in obj_ids:
                m = parts[key]["_mesh"]
                obj_ids[ok] = len(objs) + 2
                objs.append({"id": obj_ids[ok], "name": f"{key.replace('/', '_')} [{col}]", "vertices": m.vertices,
                             "faces": m.faces, "material_index": mat_idx[col]})
            m = parts[key]["_mesh"]
            lo, hi = m.bounds
            T = np.eye(4)
            T[:3, 3] = [cx - (lo[0] + hi[0]) / 2, cy - (lo[1] + hi[1]) / 2, -lo[2]]
            items3.append({"object_id": obj_ids[ok], "transform": T})
        path = folder / f"{name}-plate{n:02d}.3mf"
        write_3mf(path, objs, items3, f"{title} plate {n}", mats, {"Units": "millimeter", "Kind": "geometry-only print plate"})
        counts = {}
        for pid, _, _ in plate:
            k = "|".join(pid.split("|")[:2])
            counts[k] = counts.get(k, 0) + 1
        out.append({"file": rel(path), "objects": len(plate), "contents": counts, "sha256": sha(path)})
    return out


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=VARIANTS, action="append")
    args = ap.parse_args()
    variants = args.variant or VARIANTS
    t0 = time.time()
    outlines, glyph_sha = G.load(ROOT, P["glyph"])
    rmap, rmap_sha = read_resource_map()
    names = unit_names()
    counts = {v: rmap.count(v) for v in (0, 4, 8, 16)}
    assert sum(rmap) == 504 and counts == {0: 18, 4: 54, 8: 20, 16: 8}, (sum(rmap), counts)
    try:
        rev = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        rev = "unknown"
    log: dict[str, list] = {}
    parts: dict[str, dict] = {}
    manifest_parts = []

    def add(key, shape, family, role, variant, colors_qty: dict, orientation, assemblies, extra=None, production=True):
        folder = OUT / "models" / variant
        pid = key.split("/", 1)[1]
        info = export_part(shape, pid, folder, list(colors_qty))
        parts[key] = info
        row = {"id": key.replace("/", "."), "variant": variant, "family": family, "role": role,
               "geometry": {k: v for k, v in info.items() if not k.startswith("_")},
               "instances": [{"color": c, "filament_lead": P["palette"][c]["lead"], "qty_per_set": q} for c, q in colors_qty.items()],
               "print_orientation": orientation, "assemblies": assemblies, "production": production,
               "validation": {"digital": "pending", "slicer": "not performed", "physical": "not performed"}}
        if extra:
            row.update(extra)
        manifest_parts.append(row)
        print(f"  {key:34s} {info['bbox_mm']} vol {info['brep_volume_mm3']:.0f}  {time.time() - t0:.0f}s", flush=True)

    # shared (interface-critical) parts
    lg = log.setdefault("shared", [])
    add("shared/crystal", PT.crystal(P), "crystal", "Whole crystal cube; top stud, bottom socket", "shared",
        {"crystal": 550}, "Socket down on the plate; stud up. No supports (the 3.45 mm socket ceiling bridges).",
        ["resource-states", "board", "crowded-patch", "crystal-stacks"],
        {"shared_reason": "Fit-critical, identical function in every variant; one geometry calibrates once."})
    add("shared/half-crystal", PT.half_crystal(P), "crystal", "Half-crystal token (fractional handicap); socket, no stud, chamfered roof", "shared",
        {"crystal": 1}, "Socket down.", ["crystal-stacks"],
        {"shared_reason": "Accounting stock; sits on a stud or stack top, nothing stacks on it."})
    # coupons (calibration; not production inventory)
    blk, meta = PT.coupon_glyph_slots(P)
    add("shared/coupon-glyph-slots", blk, "coupon", "Glyph slot clearance and crush-rib sweep (8 slots)", "shared",
        {"ivory": 1, "charcoal": 1}, "As a base: slots up.", [], {"coupon": meta}, production=False)
    add("shared/coupon-tang-gauge", PT.coupon_tang_gauge(P), "coupon", "Keyed tang gauge for the slot block", "shared",
        {"fire": 1, "metal": 1}, "Flat, like a glyph.", [], {"coupon": {"tang": "nominal"}}, production=False)
    rp, meta = PT.coupon_recess_plate(P)
    add("shared/coupon-recess-plate", rp, "coupon", "Pedestal recess clearance sweep (4 recesses)", "shared",
        {"ivory": 1, "charcoal": 1}, "Recesses down on the plate (as bases/T2 print).", [], {"coupon": meta}, production=False)
    for rib, lab in ((0.0, "r0"), (0.1, "r10"), (0.2, "r20"), (0.3, "r30")):
        add(f"shared/coupon-boss-key-{lab}", PT.coupon_boss_key(P, rib, lab), "coupon",
            f"Pedestal boss key, crush ribs {rib:.1f} mm (notches = tenths)", "shared",
            {"ivory": 1, "charcoal": 1}, "Boss up.", [], {"coupon": {"rib_protrusion": rib}}, production=False)
    add("shared/coupon-stud-strip", PT.coupon_stud_strip(P), "coupon", "Four tile studs for crystal socket tests", "shared",
        {"gray": 1}, "Studs up.", [], production=False)
    for i, dc in enumerate((0.10, 0.20, 0.30, 0.40), 1):
        add(f"shared/coupon-crystal-socket-{int(dc * 100):02d}", PT.crystal(P, socket_clearance=dc, notches=i), "coupon",
            f"Crystal with {dc:.2f} mm diametral socket clearance ({i} notch{'es' if i > 1 else ''})", "shared",
            {"crystal": 4}, "Socket down.", [], {"coupon": {"socket_clearance_diametral": dc, "notches": i}}, production=False)
    add("shared/coupon-tile-tab", PT.coupon_tile_pair(P, None, "IF1 TAB"), "coupon", "Tile-edge strip with one tab", "shared",
        {"gray": 1}, "Flat.", [], production=False)
    for c in (0.15, 0.25, 0.35):
        add(f"shared/coupon-tile-socket-{int(c * 100):02d}", PT.coupon_tile_pair(P, c, f"IF1 S{c:.2f}"),
            "coupon", f"Tile-edge strip, socket clearance {c:.2f} mm per side", "shared", {"gray": 1}, "Flat.", [],
            {"coupon": {"tab_clearance_per_side": c}}, production=False)

    for v in variants:
        V = P["variants"][v]
        lg = log.setdefault(v, [])
        print(f"variant {v}", flush=True)
        for el in G.ELEMENTS:
            meta = {k: val for k, val in outlines[el].items() if k not in ("outline", "canonical_mm")}
            add(f"{v}/glyph-{el}", PT.glyph(outlines[el]["outline"], P, V, lg, f"{v} {el}"), "glyph",
                f"{el.title()} glyph ({names.get(el, '')}); stands keyed in any base, lies flat as a pending summon", v,
                {el: 16}, "Flat on the plate, front face up (as modelled). Tang lies in-plane; no supports.",
                ["piece-states", "loose", "crowded-patch"], {"glyph": meta})
        add(f"{v}/base", PT.ownership_base(P, V, lg), "base", "Octagonal ownership base (T1); keyed glyph slot on top, pedestal recess below", v,
            {"ivory": 48, "charcoal": 48}, "Upright: recess down (bridged ceiling), slot up.", ["piece-states", "crowded-patch"])
        add(f"{v}/t2", PT.pedestal(P, V, 2, lg), "pedestal-t2", "T2 addition: wider octagonal pedestal under the base; boss up, recess down", v,
            {"ivory": 18, "charcoal": 18}, "Upright: recess down, boss up.", ["piece-states", "crowded-patch"])
        add(f"{v}/t3", PT.pedestal(P, V, 3, lg), "pedestal-t3", "T3 addition: widest pedestal under T2; boss up, flat bottom", v,
            {"ivory": 6, "charcoal": 6}, "Upright: flat bottom down, boss up.", ["piece-states", "crowded-patch"])
        tile_qty = PT.board_tile_counts(rmap)
        for tp, qty in tile_qty.items():
            tt, flat = tp.removesuffix("-flat"), tp.endswith("-flat")
            flags = PT.TILE_TYPES[tt]
            role = {"corner-sw": "A1 corner tile — Ivory home", "corner-ne": "J10 corner tile — Charcoal home"}.get(tt, f"{tt} board tile")
            if flat:
                role += ", flat (no studs): squares that start with 0 crystals"
            add(f"{v}/tile-{tp}", PT.tile(P, V, *flags, lg, f"{v} tile {tp}", studs=not flat), "tile",
                role + " (tabs E/N where a neighbour exists, sockets W/S)", v, qty,
                "Flat, top up. Brim optional (see print guide).", ["board", "tile-join", "resource-states", "crowded-patch"],
                {"tile_type": tt, "studs": not flat,
                 "tabs_sockets": dict(zip(("east_tab", "north_tab", "west_socket", "south_socket"), flags))})

    manifest = {
        "generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "generator": "cad/build.py", "repo_revision": rev,
        "tools": {"python": sys.version.split()[0], "build123d": __import__("build123d").__version__,
                  "trimesh": trimesh.__version__, "manifold3d": __import__("manifold3d").__version__ if hasattr(__import__("manifold3d"), "__version__") else "installed"},
        "sources": {"muju/src/components/ElementGlyph.tsx": glyph_sha, "muju/src/game/resourceMap.ts": rmap_sha,
                    "muju/src/game/units.ts": sha(ROOT / "muju/src/game/units.ts"), "muju/SPEC.md": sha(ROOT / "muju/SPEC.md"),
                    "cad/params.json": sha(HERE / "params.json")},
        "resource_map": {"values_row_major_y_then_x": rmap, "total": sum(rmap), "counts": {str(k): c for k, c in counts.items()}},
        "glyph_changes": G.GLYPH_CHANGES, "unit_names_tier1": names,
        "edge_op_log": log, "palette": P["palette"], "variants": {k: P["variants"][k] for k in variants},
        "parts": manifest_parts,
    }
    # inventory per variant
    inv = {}
    for v in variants:
        rows = [p for p in manifest_parts if p["production"] and p["variant"] in (v, "shared")]
        inv[v] = {"objects": sum(i["qty_per_set"] for p in rows for i in p["instances"]),
                  "by_color": {}}
        for p in rows:
            for i in p["instances"]:
                inv[v]["by_color"][i["color"]] = inv[v]["by_color"].get(i["color"], 0) + i["qty_per_set"]
    coupons = [p for p in manifest_parts if not p["production"]]
    manifest["inventory"] = inv
    manifest["calibration_objects"] = sum(i["qty_per_set"] for p in coupons for i in p["instances"])

    # print plates (geometry-only 3MF)
    plates = {}
    for v in variants:
        pv = OUT / "print" / v / "plates"
        gl = [(f"{v}/glyph-{el}", el, 16) for el in G.ELEMENTS]
        plates[v] = {}
        for el in G.ELEMENTS:
            plates[v][f"glyph-{el}"] = write_plates(f"{v}-{el}-glyphs", [(f"{v}/glyph-{el}", el, 16)], parts, pv, f"Muju {v} {el} glyphs")
        for owner, home in (("ivory", "corner-sw"), ("charcoal", "corner-ne")):
            plates[v][f"army-{owner}"] = write_plates(f"{v}-{owner}-army", [(f"{v}/t3", owner, 6), (f"{v}/tile-{home}", owner, 1),
                                                                            (f"{v}/t2", owner, 18), (f"{v}/base", owner, 48)], parts, pv, f"Muju {v} {owner} army")
        gray = [(f"{v}/tile-{tp}", "gray", q["gray"]) for tp, q in PT.board_tile_counts(rmap).items() if "gray" in q]
        plates[v]["tiles-gray"] = write_plates(f"{v}-gray-tiles", gray, parts, pv, f"Muju {v} gray tiles")
        # 550 cubes fit one plate geometrically, but two ~275-cube plates limit the
        # loss from one adhesion failure and keep the job length reasonable.
        plates[v]["crystals"] = (write_plates(f"{v}-crystals-a", [("shared/half-crystal", "crystal", 1), ("shared/crystal", "crystal", 275)],
                                              parts, pv, f"Muju crystals A ({v} package)") +
                                 write_plates(f"{v}-crystals-b", [("shared/crystal", "crystal", 275)], parts, pv, f"Muju crystals B ({v} package)"))
    cal = OUT / "print" / "calibration"
    plates["calibration"] = {
        "pla-ivory": write_plates("cal-ivory", [("shared/coupon-glyph-slots", "ivory", 1), ("shared/coupon-recess-plate", "ivory", 1)] +
                                  [(f"shared/coupon-boss-key-{r}", "ivory", 1) for r in ("r0", "r10", "r20", "r30")], parts, cal, "IF1 ivory coupons"),
        "pla-charcoal": write_plates("cal-charcoal", [("shared/coupon-glyph-slots", "charcoal", 1), ("shared/coupon-recess-plate", "charcoal", 1)] +
                                     [(f"shared/coupon-boss-key-{r}", "charcoal", 1) for r in ("r0", "r10", "r20", "r30")], parts, cal, "IF1 charcoal coupons"),
        "pla-gray": write_plates("cal-gray", [("shared/coupon-stud-strip", "gray", 1), ("shared/coupon-tile-tab", "gray", 1)] +
                                 [(f"shared/coupon-tile-socket-{c}", "gray", 1) for c in ("15", "25", "35")], parts, cal, "IF1 gray coupons"),
        "pla-glyph-colours": write_plates("cal-tang", [("shared/coupon-tang-gauge", "fire", 1), ("shared/coupon-tang-gauge", "metal", 1)], parts, cal, "IF1 tang gauges"),
        "petg-crystal": write_plates("cal-crystal", [(f"shared/coupon-crystal-socket-{c}", "crystal", 4) for c in ("10", "20", "30", "40")] +
                                     [("shared/crystal", "crystal", 12)], parts, cal, "IF1 crystal coupons"),
    }
    manifest["plates"] = plates
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print(f"parts {len(manifest_parts)}; inventory {json.dumps({k: v['objects'] for k, v in inv.items()})}; {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
