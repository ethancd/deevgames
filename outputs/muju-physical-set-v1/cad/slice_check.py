#!/usr/bin/env python3
"""Slicer check: slice every plate 3MF headlessly in Bambu Studio for the H2C.

    python3 outputs/muju-physical-set-v1/cad/slice_check.py [--bambu PATH] [--only SUBSTR]

Uses Bambu Studio's own system presets (Bambu Lab H2C 0.4 nozzle, 0.20mm Standard
@BBL H2C), flattened from their `inherits` chains, with the print guide's
settings: 3 walls, 4 top and 4 bottom layers, 15 % infill; glyph and crystal
plates at 100 % infill. The filament preset follows the plate's colour role.
Writes validation/slicer/slicer-checks.{json,md}. G-code is written to a temp
directory and discarded; only the slicer's result figures are kept.

This is SLICER evidence (the plate slices, time and mass estimates), not a
physical print result.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
MAN = json.loads((OUT / "manifest.json").read_text())
APP = Path("/Applications/BambuStudio.app")
MACHINE = "Bambu Lab H2C 0.4 nozzle"
PROCESS = "0.20mm Standard @BBL H2C"
ELEMENTS = ("fire", "lightning", "water", "shadow", "plant", "metal")
FILAMENT = {"gray": "Bambu PLA Matte @BBL H2C", "ivory": "Bambu PLA Matte @BBL H2C", "charcoal": "Bambu PLA Matte @BBL H2C",
            "fire": "Bambu PLA Basic @BBL H2C", "lightning": "Bambu PLA Basic @BBL H2C", "water": "Bambu PLA Basic @BBL H2C",
            "shadow": "Bambu PLA Basic @BBL H2C", "plant": "Bambu PLA Basic @BBL H2C",
            "metal": "Bambu PLA Metal @BBL H2C 0.4 nozzle", "crystal": "Bambu PETG Translucent @BBL H2C 0.4 nozzle",
            "tile16": "Bambu PLA Matte @BBL H2C", "tile4": "Bambu PLA Matte @BBL H2C", "tile0": "Bambu PLA Basic @BBL H2C", "dot": "Bambu PLA Basic @BBL H2C"}
BASE = {"curr_bed_type": "Textured PEI Plate", "wall_loops": "3", "top_shell_layers": "4", "bottom_shell_layers": "4", "sparse_infill_density": "15%"}
# reach of both toolheads on the H2C (print/README.md)
BOTH_HEADS_X, BOTH_HEADS_Y = 300.0, 320.0


def resolve(profiles: Path, kind: str, name: str) -> dict:
    d = json.loads((profiles / kind / f"{name}.json").read_text())
    if d.get("inherits"):
        base = resolve(profiles, kind, d["inherits"])
        base.update(d)
        d = base
    d.pop("inherits", None)
    return d


def plates():
    for group in MAN["plates"].values():
        for entries in group.values():
            if isinstance(entries, list):
                for e in entries:
                    yield e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bambu", default=str(APP))
    ap.add_argument("--only")
    a = ap.parse_args()
    app = Path(a.bambu)
    exe, profiles = app / "Contents/MacOS/BambuStudio", app / "Contents/Resources/profiles/BBL"
    version = subprocess.run([exe, "--help"], capture_output=True, text=True).stdout.split("BambuStudio-")[-1].split(":")[0].strip()
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "machine.json").write_text(json.dumps(resolve(profiles, "machine", MACHINE)))
        for e in sorted(plates(), key=lambda e: e["file"]):
            if a.only and a.only not in e["file"]:
                continue
            colours = e.get("filament_slots") or sorted({k.split("|")[1] for k in e["contents"]})
            fil = FILAMENT[colours[0]]
            proc = resolve(profiles, "process", PROCESS)
            proc.update(BASE)
            if any(c in ELEMENTS or c == "crystal" for c in colours):
                proc["sparse_infill_density"] = "100%"
                proc["sparse_infill_pattern"] = "zig-zag"  # Bambu rejects 100 % with the default grid
            name = Path(e["file"]).stem
            (tmp / "process.json").write_text(json.dumps(proc))
            (tmp / "filament.json").write_text(json.dumps(resolve(profiles, "filament", fil)))
            od = tmp / name
            od.mkdir()
            src = OUT / e["file"]
            if e.get("multi_part"):
                # The Bambu CLI cannot slice multi-filament H2C plates without a GUI-made project, so
                # slice the geometry with one filament: strip the per-part slot map, keep every part.
                src = tmp / f"{name}-geometry.3mf"
                with zipfile.ZipFile(OUT / e["file"]) as zi, zipfile.ZipFile(src, "w", zipfile.ZIP_DEFLATED) as zo:
                    for it in zi.infolist():
                        if it.filename != "Metadata/model_settings.config":
                            zo.writestr(it, zi.read(it.filename))
            p = subprocess.run([exe, "--debug", "1", "--load-settings", f"{tmp}/machine.json;{tmp}/process.json",
                                "--load-filaments", f"{tmp}/filament.json", "--slice", "0", "--outputdir", str(od), src],
                               capture_output=True, text=True)
            res = json.loads((od / "result.json").read_text()) if (od / "result.json").exists() else {}
            sp = (res.get("sliced_plates") or [{}])[0]
            objs = sp.get("objects", [])
            xs = [o["bbox"]["x"] for o in objs] + [o["bbox"]["x"] + o["bbox"]["width"] for o in objs]
            ys = [o["bbox"]["y"] for o in objs] + [o["bbox"]["y"] + o["bbox"]["depth"] for o in objs]
            span = [round(max(xs) - min(xs), 1), round(max(ys) - min(ys), 1)] if objs else None
            g = sum(f["total_used_g"] for f in sp.get("filaments", []))
            row = {"plate": e["file"], "colours": colours, "filament_preset": fil, "infill": proc["sparse_infill_density"],
                   "return_code": res.get("return_code", p.returncode), "error": res.get("error_string", p.stderr[-300:]),
                   "warning": sp.get("warning_message", ""), "objects_expected": e["objects"], "objects_sliced": len(objs),
                   "max_height_mm": round(max((o["bbox"]["height"] for o in objs), default=0), 2), "layout_span_mm": span,
                   "within_both_head_area": bool(span and span[0] <= BOTH_HEADS_X and span[1] <= BOTH_HEADS_Y),
                   "time_h": round(sp.get("total_predication", 0) / 3600, 2), "filament_g": round(g, 1),
                   "multi_part": bool(e.get("multi_part")),
                   "note": (f"multi-colour ({', '.join(colours)}): geometry sliced with one filament; colour swaps not included" if e.get("multi_part")
                            else "multi-colour plate sliced with the first colour's filament for time/mass only" if len(colours) > 1 else "")}
            row["ok"] = bool(row["return_code"] == 0 and row["objects_sliced"] == row["objects_expected"] and row["within_both_head_area"])
            rows.append(row)
            print(f"{'OK ' if row['ok'] else 'BAD'} {name:38s} {row['objects_sliced']:3d}/{row['objects_expected']:<3d} "
                  f"{row['time_h']:6.2f} h {row['filament_g']:7.1f} g  {row['warning']}")
    vd = OUT / "validation" / "slicer"
    vd.mkdir(parents=True, exist_ok=True)
    meta = {"generated": dt.date.today().isoformat(), "bambu_studio": version, "machine": MACHINE, "process": PROCESS,
            "overrides": BASE, "glyph_and_crystal_infill": "100%", "evidence": "slicer (not a physical print)",
            "failures": sum(not r["ok"] for r in rows)}
    (vd / "slicer-checks.json").write_text(json.dumps({"meta": meta, "plates": rows}, indent=1))
    L = [f"# Slicer checks — Bambu Studio {version}", "",
         f"Generated {meta['generated']} by `cad/slice_check.py`. Machine `{MACHINE}`, process `{PROCESS}` on Textured PEI with 3 walls, "
         "4 top / 4 bottom layers, 15 % infill (glyph and crystal plates 100 %). Evidence kind: **slicer**, not a physical print. "
         f"Plates sliced: {len(rows)}, failures: {meta['failures']}.", "",
         "| Plate | Filament preset | Objects | Max Z mm | Span mm | Time h | Filament g | Warning / note |", "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {'' if r['ok'] else '**FAIL** '}`{Path(r['plate']).name}` | {r['filament_preset']} | {r['objects_sliced']}/{r['objects_expected']} | "
                 f"{r['max_height_mm']} | {r['layout_span_mm'][0]} × {r['layout_span_mm'][1]} | {r['time_h']} | {r['filament_g']} | {' '.join(x for x in (r['warning'], r['note']) if x)} |"
                 if r["layout_span_mm"] else f"| **FAIL** `{Path(r['plate']).name}` | {r['filament_preset']} | 0/{r['objects_expected']} | | | | | {r['error']} |")
    for v in MAN["variants"]:
        vr = [r for r in rows if f"/{v}/plates/" in r["plate"]]
        if MAN["variants"][v].get("extends"):
            if vr:
                L.append(f"\n**{v}** army plates (with tier dots): {len(vr)} plates, {sum(r['time_h'] for r in vr):.1f} h, "
                         f"{sum(r['filament_g'] for r in vr) / 1000:.2f} kg; glyphs, tiles and crystals as {MAN['variants'][v]['extends']}.")
            continue
        if vr:
            L.append(f"\n**{v}** set (single tiles): {len(vr)} plates, {sum(r['time_h'] for r in vr):.1f} h printing, "
                     f"{sum(r['filament_g'] for r in vr) / 1000:.2f} kg filament (slicer estimate).")
        for scheme in ("gray", "gradient"):
            sr = [r for r in rows if f"/{v}/sections/{v}-sections-{scheme}-" in r["plate"]]
            if sr:
                L.append(f"\n**{v}** board in 9 sections ({scheme}): {sum(r['time_h'] for r in sr):.1f} h, {sum(r['filament_g'] for r in sr) / 1000:.2f} kg "
                         "(geometry; colour swaps not included).")
    (vd / "slicer-checks.md").write_text("\n".join(L) + "\n")
    print(f"{len(rows)} plates, {meta['failures']} failures -> {vd}")


if __name__ == "__main__":
    main()
