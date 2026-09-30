#!/usr/bin/env python3
"""Write gallery/content.json: variant rationale, geometry constants and the
lists of concept sketches and model renders that exist on disk.

    python3 outputs/muju-physical-set-v1/cad/gallery_content.py
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
sys.path.insert(0, str(HERE))
from muju_physical import parts as PT  # noqa: E402

P = json.loads((HERE / "params.json").read_text())

RATIONALE = {
    "facet": {
        "tagline": "Crisp chamfered octagons",
        "text": "Plain planar faces with 45° chamfers: a 1.6 mm crown on the base, 0.9 mm on each pedestal, 0.8 mm bevels on the glyph faces. "
                "The strongest silhouettes and the least ambiguity at arm's length; the tier steps read as clean ledges.",
        "tactile": "Hard, precise edges. Chamfers take fingernails for separating layers.",
        "print": "Simplest to print: straight walls, 45° chamfers, no ornament.",
        "risk": "Chamfered glyph tips are the sharpest points in the project. They are rounded by the 0.35 mm outline offset, but should still be checked.",
    },
    "pebble": {
        "tagline": "Soft octagonal, rounded edges",
        "text": "The octagon keeps its flats but its eight corners are rounded (3.0–3.4 mm) and every top edge is a quarter-round. "
                "Glyphs have a 1.2 mm rounded face edge. Quiet, tactile, friendly; still unmistakably octagonal.",
        "tactile": "Warm and pebble-like in the hand; no corners to catch.",
        "print": "Rounded top edges print as fine terraces at 0.2 mm layers (0.12–0.16 mm layers look smoother). Larger files.",
        "risk": "Softer step edges make the T2/T3 ledges slightly less crisp from far away. The rounded tile top is 0.8 mm; a 1.0 mm round failed in the kernel at the puzzle-tab necks.",
    },
    "turned": {
        "tagline": "Turned Court: plinth, crown and broad flutes",
        "text": "Informed by the earlier Turned Court / Baroque studies, without their tall monolithic figurines: a stepped plinth and filleted crown on the base, "
                "eight broad flutes (1.5 mm radius) on each pedestal and a raised, inset plateau on every glyph. Tiles carry a court frame groove around the piece area.",
        "tactile": "Architectural; the flutes give the pedestals grip and make the tier layers countable by touch.",
        "print": "All ornament is vertical or stepped, so no supports. Flutes are 3 mm wide and 0.7 mm deep, well above minimum feature size.",
        "risk": "Most visual detail, so dust and stringing show more. Keep the flute count and depth; do not add finer ornament.",
    },
}


def main():
    studs = [list(p) for p in PT.stud_positions(P)]
    content = {
        "title": "Muju physical set — three variants",
        "geometry": {"tile_h": P["board"]["tile_thickness"], "studs": studs, "cube": P["crystal"]["body"], "pitch": P["board"]["pitch"],
                     "tile": P["board"]["tile_size"], "base_af": P["piece"]["base_af"], "t2_af": P["piece"]["t2_af"], "t3_af": P["piece"]["t3_af"],
                     "base_h": P["piece"]["base_height"], "t2_h": P["piece"]["t2_height"], "t3_h": P["piece"]["t3_height"],
                     "glyph_t": P["glyph"]["thickness"], "stud_d": P["board"]["stud"]["diameter"], "stud_h": P["board"]["stud"]["height"]},
        "variants": {k: {"name": v["name"], "direction": v["brief_direction"], **RATIONALE[k]} for k, v in P["variants"].items()},
        "palette": P["palette"],
        "concepts": {},
        "renders": {},
    }
    for v in P["variants"]:
        content["concepts"][v] = sorted(str(p.relative_to(OUT)) for p in (OUT / "concepts" / v).glob("*.svg")) if (OUT / "concepts" / v).exists() else []
        content["renders"][v] = sorted(str(p.relative_to(OUT)) for p in (OUT / "renders").glob(f"{v}-*.png"))
    content["renders"]["shared"] = sorted(str(p.relative_to(OUT)) for p in (OUT / "renders").glob("shared-*.png"))
    content["contact_sheets"] = sorted(str(p.relative_to(OUT)) for p in (OUT / "renders").glob("contact-*.png"))
    thumbs = OUT / "renders" / "parts"
    content["part_thumbs"] = {p.stem: str(p.relative_to(OUT)) for p in sorted(thumbs.glob("*.png"))} if thumbs.exists() else {}
    (OUT / "gallery" / "content.json").write_text(json.dumps(content, indent=1, ensure_ascii=False))
    print("content.json:", {k: len(v) for k, v in content["renders"].items()}, len(content["part_thumbs"]), "thumbs")


if __name__ == "__main__":
    main()
