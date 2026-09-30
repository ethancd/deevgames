#!/usr/bin/env python3
"""Vector concept boards (overview, construction study, tabletop) for each variant.

    python3 outputs/muju-physical-set-v1/cad/concepts.py

These are CONCEPT SKETCHES: 2D illustrations of design intent. They are not model
renders and not CAD evidence (see renders/ for images of the exported meshes).
No image-generation tool was available in the build environment, so the raster
prompts in concepts/<variant>/prompts.md are saved for a later run.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from shapely import affinity

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
sys.path.insert(0, str(HERE))
from muju_physical import glyphs as G  # noqa: E402
from muju_physical import parts as PT  # noqa: E402

P = json.loads((HERE / "params.json").read_text())
PAL = {k: v["hex"] for k, v in P["palette"].items()}
BADGE = "CONCEPT SKETCH · vector illustration of design intent · not a model render · not CAD evidence"


def shade(hexc, f):
    h = hexc.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if f >= 0:
        r, g, b = (int(c + (255 - c) * f) for c in (r, g, b))
    else:
        r, g, b = (int(c * (1 + f)) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def path_of(poly, sx, sy, ox, oy):
    def ring(coords):
        pts = [f"{ox + x * sx:.2f},{oy + y * sy:.2f}" for x, y in coords]
        return "M" + " L".join(pts) + " Z"
    d = ring(poly.exterior.coords)
    for i in poly.interiors:
        d += " " + ring(i.coords)
    return d


class SVG:
    def __init__(self, w, h, title):
        self.w, self.h = w, h
        self.el = [f'<rect width="{w}" height="{h}" fill="#f4f1ea"/>',
                   f'<text x="40" y="58" font-size="30" font-weight="700" fill="#23252a">{escape(title)}</text>',
                   f'<rect x="40" y="{h - 52}" width="{w - 80}" height="30" rx="6" fill="#23252a"/>',
                   f'<text x="{w / 2}" y="{h - 32}" font-size="15" fill="#f4f1ea" text-anchor="middle" letter-spacing="0.5">{BADGE}</text>']

    def add(self, s):
        self.el.append(s)

    def text(self, x, y, s, size=15, fill="#3a3d44", anchor="start", weight="400"):
        self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" font-weight="{weight}">{escape(s)}</text>')

    def save(self, path):
        path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}" '
                        f'font-family="DejaVu Sans, Helvetica, Arial, sans-serif">\n' + "\n".join(self.el) + "\n</svg>\n")


# ------------------------------------------------------------ elevations
def octagon_elev(svg, cx, base_y, af, h, color, edge, s, part):
    """Side elevation of an octagonal layer seen flat-on (three visible faces)."""
    ac = af / math.cos(math.pi / 8)
    side = af * math.tan(math.pi / 8)
    xs = [-ac / 2 * 0.0 - af / 2, -side / 2, side / 2, af / 2]
    kind = edge["kind"]
    top = edge.get("top", 0.6)
    if kind == "turned" and part == "base":
        pl = edge["plinth_height"]
        octagon_elev(svg, cx, base_y, af, pl, color, {"kind": "chamfer", "top": edge["plinth_chamfer"]}, s, "plinth")
        octagon_elev(svg, cx, base_y - pl * s, af - 2 * edge["body_inset"], h - pl, color, {"kind": "fillet", "top": edge["top"]}, s, "body")
        return
    faces = [(xs[0], xs[1], -0.25), (xs[1], xs[2], 0.05), (xs[2], xs[3], -0.4)]
    for x0, x1, f in faces:
        y0, y1 = base_y, base_y - h * s
        if kind in ("chamfer", "fluted", "grooved"):
            c = top * s
            svg.add(f'<polygon points="{cx + x0 * s:.1f},{y0:.1f} {cx + x1 * s:.1f},{y0:.1f} {cx + x1 * s:.1f},{y1 + c:.1f} '
                    f'{cx + x1 * s - (c if x1 == xs[3] else 0):.1f},{y1:.1f} {cx + x0 * s + (c if x0 == xs[0] else 0):.1f},{y1:.1f} {cx + x0 * s:.1f},{y1 + c:.1f}" '
                    f'fill="{shade(color, f)}" stroke="{shade(color, -0.55)}" stroke-width="1"/>')
            svg.add(f'<line x1="{cx + x0 * s:.1f}" y1="{y1 + c:.1f}" x2="{cx + x1 * s:.1f}" y2="{y1 + c:.1f}" stroke="{shade(color, 0.35)}" stroke-width="1.2"/>')
        else:  # fillet / rounded corners
            r = top * s
            svg.add(f'<path d="M{cx + x0 * s:.1f},{y0:.1f} L{cx + x1 * s:.1f},{y0:.1f} L{cx + x1 * s:.1f},{y1 + (r if x1 == xs[3] else 0):.1f} '
                    f'Q{cx + x1 * s:.1f},{y1:.1f} {cx + x1 * s - (r if x1 == xs[3] else 0):.1f},{y1:.1f} L{cx + x0 * s + (r if x0 == xs[0] else 0):.1f},{y1:.1f} '
                    f'Q{cx + x0 * s:.1f},{y1:.1f} {cx + x0 * s:.1f},{y1 + (r if x0 == xs[0] else 0):.1f} Z" fill="{shade(color, f)}" stroke="{shade(color, -0.55)}" stroke-width="1"/>')
        if kind == "fluted":
            xm = (x0 + x1) / 2
            svg.add(f'<rect x="{cx + (xm - edge["flute_radius"]) * s:.1f}" y="{y1 + 0.6 * s:.1f}" width="{2 * edge["flute_radius"] * s:.1f}" '
                    f'height="{(h - 0.6) * s - 2:.1f}" rx="{edge["flute_radius"] * s:.1f}" fill="{shade(color, f - 0.12)}"/>')


def glyph_front(svg, cx, base_y, outline, color, s, edge):
    from shapely.geometry import box
    b = outline.bounds
    sym = outline.intersection(box(b[0] - 1, 0, b[2] + 1, b[3] + 1))  # tang hidden in the base
    if sym.geom_type != "Polygon":
        sym = max(sym.geoms, key=lambda q: q.area)
    d = path_of(affinity.scale(sym, 1, 1, origin=(0, 0)), s, -s, cx, base_y)
    svg.add(f'<path d="{d}" fill="{color}" stroke="{shade(color, -0.45)}" stroke-width="1.2" fill-rule="evenodd"/>')
    if edge["kind"] == "step":
        inner = sym.buffer(-edge["top"])
        for g in getattr(inner, "geoms", [inner]):
            if g.area > 1:
                svg.add(f'<path d="{path_of(g, s, -s, cx, base_y)}" fill="{shade(color, 0.12)}" stroke="none"/>')
    else:
        inner = sym.buffer(-edge["top"])
        for g in getattr(inner, "geoms", [inner]):
            if g.area > 1:
                svg.add(f'<path d="{path_of(g, s, -s, cx, base_y)}" fill="none" stroke="{shade(color, 0.3)}" stroke-width="1"/>')


def piece_elev(svg, v, V, cx, base_y, el, owner, tier, outlines, s, explode=0.0, labels=False):
    pc = P["piece"]
    col = PAL[owner]
    y = base_y
    layers = []
    if tier >= 3:
        layers.append(("T3 addition", pc["t3_af"], pc["t3_height"], V["pedestal_edge"], "ped"))
    if tier >= 2:
        layers.append(("T2 addition", pc["t2_af"], pc["t2_height"], V["pedestal_edge"], "ped"))
    layers.append(("Ownership base", pc["base_af"], pc["base_height"], V["base_edge"], "base"))
    for i, (lab, af, h, edge, part) in enumerate(layers):
        octagon_elev(svg, cx, y, af, h, col, edge, s, part)
        if labels:
            svg.add(f'<line x1="{cx + af / 2 * s + 6:.1f}" y1="{y - h * s / 2:.1f}" x2="{cx + 22 * s:.1f}" y2="{y - h * s / 2:.1f}" stroke="#777" stroke-width="1"/>')
            svg.text(cx + 22 * s + 6, y - h * s / 2 + 5, f"{lab} · {af:g} mm AF × {h:g} mm", 14)
        y -= h * s + explode
    o = outlines[el]["outline"]
    glyph_front(svg, cx - 0, y, o, PAL[el], s, V["glyph_edge"])
    if labels:
        svg.text(cx + 22 * s + 6, y - 10 * s, f"{el} glyph · {P['glyph']['thickness']} mm plate · keyed tang {P['glyph']['tang_width']}×{P['glyph']['tang_depth']} mm", 14)
    return y


def loose_top(svg, cx, cy, el, outlines, s, rot=0):
    o = affinity.rotate(outlines[el]["outline"], rot, origin=(0, 0))
    svg.add(f'<path d="{path_of(o, s, -s * 0.42, cx, cy)}" fill="{PAL[el]}" stroke="{shade(PAL[el], -0.5)}" stroke-width="1.1" fill-rule="evenodd"/>')
    svg.add(f'<path d="{path_of(o, s, -s * 0.42, cx, cy + 4 * 0.42 * s)}" fill="{shade(PAL[el], -0.35)}" stroke="none" opacity="0.8"/>')


def crystal_elev(svg, x, y, n, s):
    b = P["crystal"]["body"]
    for k in range(n):
        yy = y - (k + 1) * b * s
        svg.add(f'<rect x="{x - b / 2 * s:.1f}" y="{yy:.1f}" width="{b * s:.1f}" height="{b * s:.1f}" fill="{PAL["crystal"]}" fill-opacity="0.72" stroke="#2f8f8a" stroke-width="1"/>')
    st = P["board"]["stud"]
    svg.add(f'<rect x="{x - st["diameter"] / 2 * s:.1f}" y="{y - n * b * s - st["height"] * s:.1f}" width="{st["diameter"] * s:.1f}" height="{st["height"] * s:.1f}" fill="{PAL["crystal"]}" stroke="#2f8f8a"/>')


# ------------------------------------------------------------ boards
def overview(v, V, outlines):
    svg = SVG(1800, 1080, f"{V['name']} — overview ({V['brief_direction'].lower()})")
    s = 5.2
    for row, owner in enumerate(("ivory", "charcoal")):
        by = 470 + row * 300
        svg.text(60, by - 190, f"{owner.title()} army — tiers {'1·2·3' if owner == 'ivory' else '3·2·1'} across the six elements", 16, weight="700")
        for i, el in enumerate(G.ELEMENTS):
            tier = (i % 3) + 1 if owner == "ivory" else 3 - (i % 3)
            cx = 150 + i * 205
            piece_elev(svg, v, V, cx, by, el, owner, tier, outlines, s)
            svg.text(cx, by + 28, f"{el} · T{tier}", 14, anchor="middle")
    # loose glyphs, stacks, tiles
    x0 = 1400
    svg.text(x0 - 40, 150, "Loose glyphs = pending summons", 16, weight="700")
    for i, el in enumerate(("lightning", "metal", "water")):
        loose_top(svg, x0 + 20 + i * 120, 230, el, outlines, 4.2, rot=0)
    svg.text(x0 - 40, 330, "Crystal stacks (1–4 high) on a tile stud", 16, weight="700")
    for i, n in enumerate((1, 2, 3, 4)):
        crystal_elev(svg, x0 + 20 + i * 70, 520, n, 6.5)
    svg.add(f'<rect x="{x0 - 40}" y="520" width="330" height="{4 * 6.5:.0f}" fill="{PAL["gray"]}" stroke="#555"/>')
    svg.text(x0 - 40, 610, "Tile cluster (plan): gray tiles, ivory A1 home", 16, weight="700")
    ts = 2.6
    for gx in range(2):
        for gy in range(2):
            col = PAL["ivory"] if (gx, gy) == (0, 0) else PAL["gray"]
            x = x0 - 20 + gx * 50 * ts
            y = 880 - (gy + 1) * 50 * ts
            svg.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{49.6 * ts:.1f}" height="{49.6 * ts:.1f}" rx="{2 if V["tile_edge"]["kind"] == "fillet" else 0}" fill="{col}" stroke="#555"/>')
            for sx, sy in PT.stud_positions(P):
                svg.add(f'<rect x="{x + (24.8 + sx - 3) * ts:.1f}" y="{y + (24.8 - sy - 3) * ts:.1f}" width="{6 * ts:.1f}" height="{6 * ts:.1f}" fill="{PAL["crystal"]}" stroke="#2f8f8a"/>')
    # palette
    svg.text(60, 990, "Palette:", 15, weight="700")
    for i, (k, hx) in enumerate(PAL.items()):
        svg.add(f'<rect x="{140 + i * 158}" y="974" width="22" height="22" rx="3" fill="{hx}" stroke="#555"/>')
        svg.text(168 + i * 158, 991, k, 13)
    return svg


def construction(v, V, outlines):
    svg = SVG(1800, 1080, f"{V['name']} — construction study")
    s = 7.5
    for i, tier in enumerate((1, 2, 3)):
        cx = 170 + i * 260
        piece_elev(svg, v, V, cx, 520, "shadow", "charcoal", tier, outlines, s)
        svg.text(cx, 555, f"T{tier}: {['glyph + base', 'glyph + base + T2', 'glyph + base + T2 + T3'][tier - 1]}", 14, anchor="middle")
    svg.text(60, 610, "Additive tiers: T2 never replaces anything; T3 keeps both the base and T2 visible as separate layers.", 15)
    # exploded T3
    cx = 1080
    piece_elev(svg, v, V, cx, 560, "metal", "ivory", 3, outlines, s, explode=48, labels=True)
    svg.text(cx, 600, "Exploded T3 (ivory metal)", 15, anchor="middle", weight="700")
    # glyph slot section
    g, pc = P["glyph"], P["piece"]
    sx, sy, ss = 120, 830, 8.0
    svg.text(sx - 60, 650, "Keyed tang in base slot (plan section)", 16, weight="700")
    w = g["tang_width"] + 2 * g["slot_clearance_per_side"]
    t = g["thickness"] + 2 * g["slot_clearance_per_side"]
    oc = PT.octagon_pts(pc["base_af"])
    svg.add('<polygon points="' + " ".join(f"{sx + 110 + x * ss:.1f},{sy + y * ss:.1f}" for x, y in oc) + f'" fill="{PAL["ivory"]}" stroke="#555"/>')
    svg.add(f'<rect x="{sx + 110 - w / 2 * ss:.1f}" y="{sy - t / 2 * ss:.1f}" width="{w * ss:.1f}" height="{t * ss:.1f}" fill="#fff" stroke="#555"/>')
    k = g["tang_key_chamfer"]
    tw, tt = g["tang_width"], g["thickness"]
    pts = [(-tw / 2, -tt / 2), (tw / 2 - k, -tt / 2), (tw / 2, -tt / 2 + k), (tw / 2, tt / 2), (-tw / 2, tt / 2)]
    svg.add('<polygon points="' + " ".join(f"{sx + 110 + x * ss:.1f},{sy + y * ss:.1f}" for x, y in pts) + f'" fill="{PAL["metal"]}" stroke="#533"/>')
    svg.text(sx - 60, sy + 135, f"slot {w:.2f}×{t:.2f} mm · key chamfer {k} mm · 2 crush ribs", 13)
    # crystal section
    cx0, cy0, cs = 620, 930, 12
    svg.text(cx0 - 90, 650, "Crystal stud/socket (section)", 16, weight="700")
    b = P["crystal"]["body"]
    st = P["board"]["stud"]
    sd = st["diameter"] + P["crystal"]["socket_diameter_clearance_diametral"]
    for k2 in range(2):
        y = cy0 - (k2 + 1) * b * cs
        svg.add(f'<rect x="{cx0 - b / 2 * cs}" y="{y}" width="{b * cs}" height="{b * cs}" fill="{PAL["crystal"]}" fill-opacity=".7" stroke="#2f8f8a"/>')
        svg.add(f'<rect x="{cx0 - sd / 2 * cs}" y="{y + b * cs - (st["height"] + 0.2) * cs}" width="{sd * cs}" height="{(st["height"] + 0.2) * cs}" fill="#fff" stroke="#2f8f8a"/>')
        svg.add(f'<rect x="{cx0 - st["diameter"] / 2 * cs}" y="{y + b * cs - st["height"] * cs}" width="{st["diameter"] * cs}" height="{st["height"] * cs}" fill="{PAL["gray"] if k2 == 0 else PAL["crystal"]}" stroke="#2f8f8a"/>')
    svg.add(f'<rect x="{cx0 - 60}" y="{cy0}" width="120" height="{P["board"]["tile_thickness"] * cs * 0.6}" fill="{PAL["gray"]}" stroke="#555"/>')
    svg.text(cx0 + 60, cy0 - 90, f"stud Ø{st['diameter']} × {st['height']} mm", 13)
    svg.text(cx0 + 60, cy0 - 70, f"socket Ø{sd:.2f} mm (0.125 mm radial)", 13)
    # tile interlock (zoomed, 16 mm either side of the seam)
    tx, ty, tsc = 1330, 850, 7.0
    svg.text(1050, 650, "Tile interlock (plan): broad tab, drop-in", 16, weight="700")
    tb = P["board"]["tab"]
    hc, hd, nw, c = tb["head_center_from_boundary"], tb["head_diameter"], tb["neck_width"], tb["clearance_per_side"]
    L = 34
    svg.add(f'<rect x="{tx - L * tsc}" y="{ty - 12 * tsc}" width="{(L - 0.2) * tsc}" height="{24 * tsc}" fill="{PAL["gray"]}" stroke="#555"/>')
    svg.add(f'<rect x="{tx + 0.2 * tsc}" y="{ty - 12 * tsc}" width="{(L - 0.2) * tsc}" height="{24 * tsc}" fill="{shade(PAL["gray"], 0.18)}" stroke="#555"/>')
    # socket (tab grown by the clearance) cut in the right tile, then the tab of the left tile
    svg.add(f'<rect x="{tx - 0.1 * tsc}" y="{ty - (nw / 2 + c) * tsc}" width="{(hc + 0.2) * tsc}" height="{(nw + 2 * c) * tsc}" fill="#f4f1ea"/>')
    svg.add(f'<circle cx="{tx + hc * tsc}" cy="{ty}" r="{(hd / 2 + c) * tsc}" fill="#f4f1ea" stroke="#555"/>')
    svg.add(f'<rect x="{tx - 2 * tsc}" y="{ty - nw / 2 * tsc}" width="{(hc + 2) * tsc}" height="{nw * tsc}" fill="{PAL["gray"]}"/>')
    svg.add(f'<circle cx="{tx + hc * tsc}" cy="{ty}" r="{hd / 2 * tsc}" fill="{PAL["gray"]}" stroke="#444"/>')
    svg.text(tx, ty + 12 * tsc + 24, f"neck {nw} mm · head Ø{hd} mm · socket = tab + {c} mm per side", 13, anchor="middle")
    return svg


def tabletop(v, V, outlines, rmap):
    svg = SVG(1800, 1080, f"{V['name']} — tabletop (canonical start, Unequal Routes map)")
    s = 1.78
    ox, oy = 90, 980
    for y in range(10):
        for x in range(10):
            col = PAL["ivory"] if (x, y) == (0, 0) else PAL["charcoal"] if (x, y) == (9, 9) else PAL["gray"]
            X, Y = ox + x * 50 * s, oy - (y + 1) * 50 * s
            svg.add(f'<rect x="{X:.1f}" y="{Y:.1f}" width="{49.6 * s:.1f}" height="{49.6 * s:.1f}" fill="{col}" stroke="#555" stroke-width=".8"/>')
            per = rmap[y * 10 + x] // 4
            for sx, sy in PT.stud_positions(P):
                if per:
                    op = 0.35 + 0.16 * per
                    svg.add(f'<rect x="{X + (24.8 + sx - 3) * s:.1f}" y="{Y + (24.8 - sy - 3) * s:.1f}" width="{6 * s:.1f}" height="{6 * s:.1f}" fill="{PAL["crystal"]}" fill-opacity="{op:.2f}" stroke="#2f8f8a" stroke-width=".6"/>')
                    svg.text(X + (24.8 + sx) * s, Y + (24.8 - sy) * s + 4, str(per), 9, anchor="middle", fill="#134")
        svg.text(ox - 18, oy - (y + 0.5) * 50 * s + 5, str(y + 1), 13, anchor="middle")
    for x in range(10):
        svg.text(ox + (x + 0.5) * 50 * s, oy + 20, chr(65 + x), 13, anchor="middle")
    svg.text(ox + 450, oy + 44, "Ivory sits on the rank-1 side · A1 ivory home · J10 charcoal home · numbers = stack height · empty squares = flat tiles, no studs", 13, anchor="middle")
    start = [("fire", 1, 0, "ivory"), ("water", 1, 1, "ivory"), ("plant", 0, 1, "ivory"), ("fire", 8, 9, "charcoal"), ("water", 8, 8, "charcoal"), ("plant", 9, 8, "charcoal")]
    for el, x, y, owner in start:
        cx, cy = ox + (x + 0.5) * 50 * s, oy - (y + 0.5) * 50 * s
        svg.add('<polygon points="' + " ".join(f"{cx + px * s:.1f},{cy - py * s:.1f}" for px, py in PT.octagon_pts(P["piece"]["base_af"])) + f'" fill="{PAL[owner]}" stroke="#333"/>')
        svg.add(f'<rect x="{cx - 3 * s:.1f}" y="{cy - 2.25 * s:.1f}" width="{6 * s:.1f}" height="{4.5 * s:.1f}" fill="{PAL[el]}"/>')
    # inset: coexistence
    ix, iy, isc = 1180, 420, 6.2
    svg.text(ix - 60, 120, "Inset: pending glyph beside an occupying T3 piece", 16, weight="700")
    svg.text(ix - 60, 142, "(SPEC §5.2: real units may stop on a pending square)", 13)
    svg.add(f'<rect x="{ix - 24.8 * isc}" y="{iy - 24.8 * isc}" width="{49.6 * isc}" height="{49.6 * isc}" fill="{PAL["gray"]}" stroke="#555"/>')
    for sx, sy in PT.stud_positions(P):
        svg.add(f'<rect x="{ix + (sx - 3) * isc}" y="{iy - (sy + 3) * isc}" width="{6 * isc}" height="{6 * isc}" fill="{PAL["crystal"]}" stroke="#2f8f8a"/>')
        svg.text(ix + sx * isc, iy - sy * isc + 5, "4", 14, anchor="middle", fill="#134")
    for af, f in ((P["piece"]["t3_af"], -0.25), (P["piece"]["t2_af"], -0.1), (P["piece"]["base_af"], 0.05)):
        svg.add('<polygon points="' + " ".join(f"{ix + px * isc:.1f},{iy - py * isc:.1f}" for px, py in PT.octagon_pts(af)) + f'" fill="{shade(PAL["charcoal"], f + 0.25)}" stroke="#111"/>')
    asm = json.loads((OUT / "assemblies" / "assemblies.json").read_text())
    pl = asm["loose_beside_piece"]["3"]["metal"]
    o = affinity.translate(affinity.rotate(outlines["metal"]["outline"], pl["rotation_deg"], origin=(0, 0)), pl["x"], pl["y"])
    svg.add(f'<path d="{path_of(o, isc, -isc, ix, iy)}" fill="{PAL["metal"]}" stroke="#533"/>')
    for i, line in enumerate((f"Worst case: metal glyph beside a T3 with four 4-high stacks.",
                              f"It overhangs the tile edge by {pl['overhang_beyond_own_tile_mm2']} mm² but touches nothing.",
                              "The symbol reads upright from its owner's seat;",
                              "that orientation marks whose summon it is.")):
        svg.text(1030, iy + 24.8 * isc + 34 + i * 20, line, 13)
    return svg


PROMPT = """Design study for a physically manufacturable FDM-printed Muju tabletop set, {lang}. Use the attached authentic Muju glyphs: red flame, yellow lightning bolt, blue droplet, purple crescent, green leaf, warm copper/orange-bronze anvil. Each colored glyph is a sturdy removable upright insert in an ivory or charcoal octagonal base. Promotions use visible additive layers: original base on a wider T2 pedestal, and both resting on a separate wider T3 pedestal. Show the complete three-layer T3 construction accurately. Square interlocking board tiles are medium gray except the ivory and charcoal home tiles. Each tile has four inset edge-midpoint studs supporting translucent cyan cubical resource stacks, except the 18 squares that start with no crystals, which are plain flat tiles with no studs. Include loose glyphs lying flat for phasing. Show plausible printable thickness, gentle lead-in chamfers, robust joints, and realistic relative scale. Maintain the exact color roles and construction from the reference sheet. Composition: {comp}."""
LANG = {
    "facet": "crisp chamfered language: planar octagonal faces, 45-degree chamfered top edges on every layer, beveled glyph faces, minimal ornament, clean ledges between tiers",
    "pebble": "soft octagonal language: an unmistakable octagonal footprint with rounded vertical corners, quarter-round top edges, gently rounded glyph faces, quiet pedestal steps, tactile pebble-like surfaces",
    "turned": "restrained turned/fluted language: a stepped plinth and softly crowned base, eight broad shallow vertical flutes on each pedestal, a raised inset plateau on each glyph, a simple court-frame groove on each tile; ornament never hides the six symbols",
}
COMPS = {"overview": "OVERVIEW — both armies, all six elements, tier progression T1/T2/T3, loose phasing glyphs, a small tile cluster, cyan crystal stacks, neutral studio background",
         "construction": "EXPLODED CONSTRUCTION — side view and exploded T1/T2/T3, a removed glyph showing its keyed tang, a crystal stud/socket section, tile puzzle interlocks",
         "tabletop": "TABLETOP — medium-gray board with exactly one ivory and one charcoal corner home tile, pieces among resource stacks, hands for scale, an inset of a loose glyph beside an occupying piece"}


def main():
    outlines, _ = G.load(G.repo_root(HERE), P["glyph"])
    man = json.loads((OUT / "manifest.json").read_text())
    rmap = man["resource_map"]["values_row_major_y_then_x"]
    for v, V in P["variants"].items():
        d = OUT / "concepts" / v
        d.mkdir(parents=True, exist_ok=True)
        overview(v, V, outlines).save(d / f"{v}-1-overview.svg")
        construction(v, V, outlines).save(d / f"{v}-2-construction.svg")
        tabletop(v, V, outlines, rmap).save(d / f"{v}-3-tabletop.svg")
        md = [f"# {V['name']} — raster concept prompts (not yet run)", "",
              "No image-generation tool was available in the build environment. These prompts follow the",
              "structure in `outputs/muju-physical-set-prompts/03-concept-art-prompt.md`. Attach",
              "`research/muju-glyph-reference-sheet.png` as the glyph reference when running them. Treat any",
              "result as concept art only.", ""]
        for k, c in COMPS.items():
            md += [f"## {k}", "", "> " + PROMPT.format(lang=LANG[v], comp=c), ""]
        (d / "prompts.md").write_text("\n".join(md))
    print("concept boards written")


if __name__ == "__main__":
    main()
