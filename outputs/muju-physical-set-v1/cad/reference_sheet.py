#!/usr/bin/env python3
"""Six-element reference sheet: canonical SVG glyphs (from ElementGlyph.tsx) beside
the printable outlines used by the CAD, with the deliberate changes visible.

    python3 outputs/muju-physical-set-v1/cad/reference_sheet.py
"""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from muju_physical import glyphs as G  # noqa: E402

P = json.loads((HERE / "params.json").read_text())
OUT = HERE.parent / "research"


def fill(ax, geom, color, alpha=1.0, edge=None, lw=0.0):
    for g in getattr(geom, "geoms", [geom]):
        ax.fill(*g.exterior.xy, color=color, alpha=alpha, lw=lw, ec=edge)
        for i in g.interiors:
            ax.fill(*i.xy, color="white", lw=0)


def main():
    root = G.repo_root(HERE)
    outlines, h = G.load(root, P["glyph"])
    specs = G.parse_source(G.source_file(root).read_text())
    fig, axs = plt.subplots(2, 6, figsize=(15, 6.2), dpi=110)
    for i, el in enumerate(G.ELEMENTS):
        col = P["palette"][el]["hex"]
        raw, strokes = G.raw_outline(specs[el])
        ax = axs[0, i]
        fill(ax, raw, col)
        for line, w in strokes:
            ax.plot(*line.xy, color="#d7f5d9", lw=w * 3.2, solid_capstyle="round")
        ax.set_xlim(4, 44); ax.set_ylim(40, 2); ax.set_aspect("equal"); ax.axis("off")
        ax.set_title(f"{el}\ncanonical SVG (48×40 units)", fontsize=9)
        ax = axs[1, i]
        o = outlines[el]
        fill(ax, o["outline"], col)
        c = o["canonical_mm"]
        for g in getattr(c, "geoms", [c]):
            ax.plot(*g.exterior.xy, color="k", lw=0.6, ls="--")
        ax.axhline(0, color="#999", lw=0.8)
        ax.text(0, -5.6, "base top", ha="center", fontsize=7, color="#666")
        ax.set_xlim(-12, 12); ax.set_ylim(-7, 22); ax.set_aspect("equal"); ax.axis("off")
        ax.set_title(f"printable: {o['width_mm']}×{o['visible_height_mm']} mm visible\n+ tang {P['glyph']['tang_width']}×{P['glyph']['tang_depth']} mm", fontsize=8)
    fig.suptitle("Muju element glyphs — canonical artwork (top) and printable outline (bottom; dashed = canonical at scale)\n"
                 f"ElementGlyph.tsx sha256 {h[:16]}…  ·  scale {P['glyph']['units_to_mm']} mm/unit  ·  outward offset {P['glyph']['thicken_offset']} mm",
                 fontsize=10)
    fig.tight_layout()
    OUT.mkdir(exist_ok=True)
    fig.savefig(OUT / "muju-glyph-reference-sheet.png")
    fig.savefig(OUT / "muju-glyph-reference-sheet.svg")
    print("wrote", OUT / "muju-glyph-reference-sheet.png")


if __name__ == "__main__":
    main()
