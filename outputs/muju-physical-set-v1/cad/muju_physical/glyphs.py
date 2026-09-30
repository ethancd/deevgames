"""Read Muju's canonical element glyphs from ElementGlyph.tsx and turn them into
printable 2D outlines (millimetres, y up).

Changes from the canonical artwork are deliberate and recorded in
`GLYPH_CHANGES` so the gallery and research notes can disclose them:
uniform outward thickening, a leaf vein expressed as a closed through-slot
plus a solid stem, and a keyed tang below each symbol.
"""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

from shapely import affinity
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from svgpathtools import parse_path

ELEMENTS = ("fire", "lightning", "water", "shadow", "plant", "metal")
ELEMENT_NAMES = {  # canonical tier-1 unit names, for labels only
    "fire": "Hi", "lightning": "Radi", "water": "Sjór",
    "shadow": "Loş", "plant": "Muju", "metal": "Poṉ",
}

GLYPH_CHANGES = [
    "Outline offset outward uniformly (params glyph.thicken_offset) so needle tips of the bolt, crescent and leaf become rounded, printable points.",
    "Plant vein: the SVG stroke is a lighter-colour line. In one filament it becomes a through-slot inside the leaf (stopped short of the outline so the leaf stays one piece) and a solid stem where the stroke leaves the leaf.",
    "Metal: the anvil's two SVG paths (face bar and body) are fused into one solid.",
    "A rectangular tang with one 45-degree key chamfer is added below each symbol. Standing, it is hidden in the base; lying down it is visible as the glyph's foot.",
    "Where a symbol's lowest point is narrower than the tang (bolt tip, droplet and flame bottoms), the part of the symbol below the tang shoulder is replaced by the tang, which sits inside the base.",
]


def repo_root(start: Path) -> Path:
    p = start.resolve()
    for parent in [p, *p.parents]:
        if (parent / "muju" / "src" / "components" / "ElementGlyph.tsx").exists():
            return parent
    raise FileNotFoundError("Run inside the deevgames repository (muju/src/components/ElementGlyph.tsx not found)")


def source_file(root: Path) -> Path:
    return root / "muju" / "src" / "components" / "ElementGlyph.tsx"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _sample(d: str, step: float = 0.25) -> list[tuple[float, float]]:
    pts: list[tuple[float, float]] = []
    for seg in parse_path(d):
        n = max(2, int(seg.length() / step) + 1)
        for i in range(n):
            z = seg.point(i / n)
            pts.append((z.real, z.imag))
    end = parse_path(d)[-1].end
    pts.append((end.real, end.imag))
    return pts


def parse_source(text: str) -> dict[str, dict[str, list]]:
    """Return {element: {"fills": [d...], "strokes": [(d, width)...]}}."""
    out: dict[str, dict[str, list]] = {}
    for el in ELEMENTS:
        m = re.search(rf"case '{el}': return (.*?);\n", text)
        if not m:
            raise ValueError(f"glyph {el} not found in ElementGlyph.tsx")
        fills, strokes = [], []
        for tag in re.findall(r"<path\b[^>]*?/>", m.group(1)):
            d = re.search(r'\bd="([^"]+)"', tag).group(1)
            if 'fill="none"' in tag:
                w = float(re.search(r'strokeWidth="([\d.]+)"', tag).group(1))
                strokes.append((d, w))
            else:
                fills.append(d)
        out[el] = {"fills": fills, "strokes": strokes}
    return out


def raw_outline(spec: dict) -> tuple[Polygon, list[LineString]]:
    """Fill region and stroke centre-lines in SVG units (y down)."""
    polys = [Polygon(_sample(d)).buffer(0) for d in spec["fills"]]
    fill = unary_union(polys)
    lines = [(LineString(_sample(d)), w) for d, w in spec["strokes"]]
    return fill, lines


def printable_outline(element: str, spec: dict, g: dict) -> dict:
    """Build the printable 2D glyph in mm with y up, origin at the tang shoulder
    centre (the base's top surface when standing). Returns shapes and metadata."""
    k = g["units_to_mm"]
    fill, strokes = raw_outline(spec)

    def to_mm(geom):
        return affinity.scale(geom, xfact=k, yfact=-k, origin=(0, 0))

    body = to_mm(fill)
    slot = None
    stem = None
    if strokes:  # plant vein
        (line, w) = strokes[0]
        line_mm = to_mm(line)
        vein = line_mm.buffer(g["vein_width_units"] * k / 2, cap_style=1)
        inner = body.buffer(-g["vein_end_margin"])
        slot = vein.intersection(inner)
        stem = vein.difference(body.buffer(-0.01))
    t = g["thicken_offset"]
    thick = body.buffer(t, quad_segs=8)
    if stem is not None and not stem.is_empty:
        stem_w = max(g["min_feature"] + 0.8, g["vein_width_units"] * k)
        stem_line = line_mm.difference(body)
        stem = stem_line.buffer(stem_w / 2, cap_style=1)
        thick = unary_union([thick, stem])
    if slot is not None:
        thick = thick.difference(slot)

    # Tang: a rectangle below the symbol, centred on the symbol's bounding-box
    # centre so every glyph stands centred in the universal base slot.
    minx, miny, maxx, maxy = thick.bounds
    bbox_cx = (minx + maxx) / 2
    tw = g["tang_width"]
    overlap = g["tang_overlap_units"] * k

    def full_chord(cx, y):
        band = box(cx - tw / 2, y, cx + tw / 2, y + 0.05)
        return abs(thick.intersection(band).area - band.area) < 1e-4

    # Preferred: the tang meets the symbol where it is at least tang-wide.
    y = miny
    shoulder = None
    while y < miny + 3.0:
        if full_chord(bbox_cx, y):
            shoulder = y
            break
        y += 0.05
    cx = bbox_cx
    neck = None
    if shoulder is None:
        # Narrow foot (bolt tip, leaf stem): stand the symbol on its lowest
        # point. The tang sits under that point (moved at most max_offset from
        # the centre) and a neck -- the convex hull of the symbol's lowest
        # glyph.neck_band mm and the tang top -- joins them. The whole symbol stays visible.
        low = thick.intersection(box(minx - 1, miny - 1, maxx + 1, miny + 0.3))
        low_cx = (low.bounds[0] + low.bounds[2]) / 2
        max_off = g.get("tang_max_offset", 2.5)
        cx = min(max(low_cx, bbox_cx - max_off), bbox_cx + max_off)
        shoulder = miny + 0.3
        band = g.get("neck_band", 2.8)
        foot = thick.intersection(box(minx - 1, miny - 1, maxx + 1, miny + band))
        neck = unary_union([foot, box(cx - tw / 2, shoulder - 0.01, cx + tw / 2, shoulder)]).convex_hull
        neck = neck.intersection(box(minx - 1, shoulder, maxx + 1, miny + band))
    tang = box(cx - tw / 2, shoulder - g["tang_depth"], cx + tw / 2, shoulder + (overlap if neck is None else 0))
    hidden = thick.intersection(box(minx - 1, miny - 1, maxx + 1, shoulder))
    visible = thick.difference(box(minx - 1, miny - 1, maxx + 1, shoulder))
    lost = hidden.difference(tang).area
    pieces = [visible, tang] + ([neck] if neck is not None else [])
    outline = unary_union(pieces).buffer(0.2, quad_segs=4).buffer(-0.2, quad_segs=4)
    if slot is not None:
        outline = outline.difference(slot.buffer(0))
    added_neck_area = 0.0 if neck is None else round(neck.difference(thick).area, 3)
    # translate so shoulder centre is origin
    outline = affinity.translate(outline, -cx, -shoulder)
    centre_offset = round(bbox_cx - cx, 3)
    if outline.geom_type != "Polygon":
        parts = sorted(outline.geoms, key=lambda p: -p.area)
        raise ValueError(f"{element}: outline is not one piece ({[round(p.area,2) for p in parts]})")
    fragile = outline.difference(outline.buffer(-g["min_feature"] / 2).buffer(g["min_feature"] / 2)).area
    b = outline.bounds
    return {
        "outline": outline,
        "canonical_mm": affinity.translate(body, -cx, -shoulder),
        "shoulder_trim_area_mm2": round(lost, 3),
        "under_min_feature_area_mm2": round(fragile, 3),
        "visible_height_mm": round(b[3], 2),
        "width_mm": round(b[2] - b[0], 2),
        "total_length_mm": round(b[3] - b[1], 2),
        "bounds": [round(v, 3) for v in b],
        "has_vein_slot": slot is not None,
        "neck_area_mm2": added_neck_area,
        "tang_offset_from_symbol_centre_mm": centre_offset,
    }


def load(root: Path, g: dict) -> dict:
    src = source_file(root)
    specs = parse_source(src.read_text())
    return {el: printable_outline(el, specs[el], g) for el in ELEMENTS}, sha256(src)
