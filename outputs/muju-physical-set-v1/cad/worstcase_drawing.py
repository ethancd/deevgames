#!/usr/bin/env python3
"""Dimensioned worst-case tile: a T3 piece, four 4-high stacks, the neighbouring
tile's T3 piece and stacks, and a loose (pending) glyph. Plan + elevation.

    python3 outputs/muju-physical-set-v1/cad/worstcase_drawing.py
"""
import json
import sys
from pathlib import Path

from shapely import affinity

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
sys.path.insert(0, str(HERE))
from muju_physical import glyphs as G  # noqa: E402
from muju_physical import parts as PT  # noqa: E402
from concepts import PAL, path_of, SVG  # noqa: E402

P = json.loads((HERE / "params.json").read_text())


def dim(svg, x1, y1, x2, y2, label, off=0, vertical=False):
    if vertical:
        svg.add(f'<line x1="{x1 + off}" y1="{y1}" x2="{x2 + off}" y2="{y2}" stroke="#c0392b" stroke-width="1.2" marker-start="url(#a)" marker-end="url(#a)"/>')
        svg.text(x1 + off + 6, (y1 + y2) / 2 + 4, label, 12, fill="#c0392b")
    else:
        svg.add(f'<line x1="{x1}" y1="{y1 + off}" x2="{x2}" y2="{y2 + off}" stroke="#c0392b" stroke-width="1.2" marker-start="url(#a)" marker-end="url(#a)"/>')
        svg.text((x1 + x2) / 2, y1 + off - 5, label, 12, fill="#c0392b", anchor="middle")


def main():
    outlines, _ = G.load(G.repo_root(HERE), P["glyph"])
    asm = json.loads((OUT / "assemblies" / "assemblies.json").read_text())
    svg = SVG(1800, 1000, "Worst-case occupancy — dimensioned (engineering drawing, from params.json)")
    svg.el[3] = svg.el[3].replace("CONCEPT SKETCH · vector illustration of design intent · not a model render · not CAD evidence",
                                  "ENGINEERING DRAWING from cad/params.json · digital geometry · not a physical measurement")
    svg.add('<defs><marker id="a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,2 L10,5 L0,8 Z" fill="#c0392b"/></marker></defs>')
    s = 6.0
    ox, oy = 330, 520
    pitch, tile = P["board"]["pitch"], P["board"]["tile_size"]
    d = P["board"]["stud"]["center_from_tile_center"]
    cb = P["crystal"]["body"]
    for gx in (0, 1):
        cx = ox + gx * pitch * s
        svg.add(f'<rect x="{cx - tile / 2 * s}" y="{oy - tile / 2 * s}" width="{tile * s}" height="{tile * s}" fill="{PAL["gray"]}" stroke="#444"/>')
        for sx, sy in PT.stud_positions(P):
            svg.add(f'<rect x="{cx + (sx - cb / 2) * s}" y="{oy - (sy + cb / 2) * s}" width="{cb * s}" height="{cb * s}" fill="{PAL["crystal"]}" stroke="#2f8f8a"/>')
        rot = 22.5 if gx == 0 else 0
        for af, col in ((P["piece"]["t3_af"], "#23252a"), (P["piece"]["t2_af"], "#34373d"), (P["piece"]["base_af"], "#45484f")):
            pts = [(x, y) for x, y in PT.octagon_pts(af)]
            from shapely.geometry import Polygon
            poly = affinity.rotate(Polygon(pts), rot, origin=(0, 0))
            svg.add('<polygon points="' + " ".join(f"{cx + x * s:.1f},{oy - y * s:.1f}" for x, y in poly.exterior.coords) + f'" fill="{col}" stroke="#000"/>')
        svg.add(f'<circle cx="{cx}" cy="{oy}" r="{PT.across_corners(P["piece"]["t3_af"]) / 2 * s}" fill="none" stroke="#c0392b" stroke-dasharray="5 4"/>')
    pl = asm["loose_beside_piece"]["3"]["metal"]
    o = affinity.translate(affinity.rotate(outlines["metal"]["outline"], pl["rotation_deg"], origin=(0, 0)), pl["x"], pl["y"])
    svg.add(f'<path d="{path_of(o, s, -s, ox, oy)}" fill="{PAL["metal"]}" stroke="#533"/>')
    # dimensions
    dim(svg, ox - tile / 2 * s, oy - tile / 2 * s, ox + tile / 2 * s, oy - tile / 2 * s, f"tile {tile} mm (pitch {pitch})", -24)
    dim(svg, ox, oy + 40, ox + (d - cb / 2) * s, oy + 40, f"{d - cb / 2:.1f} to stack face", 0)
    dim(svg, ox, oy + 70, ox + PT.across_corners(P['piece']['t3_af']) / 2 * s, oy + 70, f"T3 AC/2 {PT.across_corners(P['piece']['t3_af']) / 2:.2f}", 0)
    svg.text(ox - tile / 2 * s, oy + tile / 2 * s + 30, "Left: T3 rotated 22.5° (worst case, corners toward stacks) — clearance "
             f"{d - cb / 2 - PT.across_corners(P['piece']['t3_af']) / 2:.2f} mm. Right: flats toward stacks — {d - cb / 2 - P['piece']['t3_af'] / 2:.2f} mm.", 13)
    svg.text(ox - tile / 2 * s, oy + tile / 2 * s + 50, f"Metal glyph (largest) lying in the free corner: touches nothing; {pl['overhang_beyond_own_tile_mm2']} mm² hangs over the tile edge/seam.", 13)
    svg.text(ox - tile / 2 * s, oy + tile / 2 * s + 70, f"Adjacent stacks across a seam: {2 * (tile / 2 - d - cb / 2) + (pitch - tile):.1f} mm apart (outer faces).", 13)
    # elevation
    ex, ey, es = 1260, 820, 9.0
    th = P["board"]["tile_thickness"]
    svg.text(ex - 250, 150, "Elevation (heights above table)", 16, weight="700")
    svg.add(f'<rect x="{ex - 26 * es}" y="{ey - th * es}" width="{52 * es}" height="{th * es}" fill="{PAL["gray"]}" stroke="#444"/>')
    z = th
    for lab, af, h in (("T3", P["piece"]["t3_af"], P["piece"]["t3_height"]), ("T2", P["piece"]["t2_af"], P["piece"]["t2_height"]), ("base", P["piece"]["base_af"], P["piece"]["base_height"])):
        svg.add(f'<rect x="{ex - af / 2 * es}" y="{ey - (z + h) * es}" width="{af * es}" height="{h * es}" fill="#34373d" stroke="#000"/>')
        dim(svg, ex + 26 * es, ey - z * es, ex + 26 * es, ey - (z + h) * es, f"{lab} {h} mm", 12, vertical=True)
        z += h
    gh = outlines["water"]["visible_height_mm"]
    svg.add(f'<rect x="{ex - 7.6 * es}" y="{ey - (z + gh) * es}" width="{15.2 * es}" height="{gh * es}" rx="{6 * es}" fill="{PAL["water"]}"/>')
    dim(svg, ex - 30 * es, ey, ex - 30 * es, ey - (z + gh) * es, f"{z + gh:.1f} mm (tallest: water T3)", -10, vertical=True)
    stack_h = 4 * cb + P["board"]["stud"]["height"]
    for sx in (-d, d):
        svg.add(f'<rect x="{ex + (sx - cb / 2) * es}" y="{ey - (th + 4 * cb) * es}" width="{cb * es}" height="{4 * cb * es}" fill="{PAL["crystal"]}" fill-opacity=".75" stroke="#2f8f8a"/>')
    dim(svg, ex + 26 * es + 110, ey - th * es, ex + 26 * es + 110, ey - (th + stack_h) * es, f"4-high stack {stack_h:.1f} mm", 0, vertical=True)
    svg.save(OUT / "research" / "worst-case-tile.svg")
    print("worst-case drawing written")


if __name__ == "__main__":
    main()
