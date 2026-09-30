"""Parametric B-rep solids for every printable Muju part (build123d/OpenCascade).

Every dimension comes from ../params.json. Coordinates: millimetres, +Z up,
each part in its *assembly frame* (bottom on Z=0, centred on the origin) unless
noted. `print_frame()` in build.py rotates parts into print orientation.

Glyph frame: the glyph lies flat in XY, symbol up = +Y, tang pointing -Y, the
front (printed top) face at Z=thickness, the tang shoulder at Y=0.
"""
from __future__ import annotations

import math

from build123d import (Align, Axis, Box, Cylinder, Face, Kind, Location, Plane,
                       Polygon, Pos, Rot, Solid, Text, Wire, chamfer, extrude,
                       fillet, offset, Circle, Rectangle, Vector, FontStyle)
from shapely.geometry import Polygon as SPoly

MIN = (Align.CENTER, Align.CENTER, Align.MIN)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


# ---------------------------------------------------------------- helpers
def octagon_pts(af: float):
    """Regular octagon with flats facing +-X and +-Y (across flats = af)."""
    r = af / 2 / math.cos(math.pi / 8)
    return [(r * math.cos(math.pi / 8 + i * math.pi / 4), r * math.sin(math.pi / 8 + i * math.pi / 4)) for i in range(8)]


def octagon_face(af: float, corner_radius: float = 0.0) -> Face:
    f = Polygon(*octagon_pts(af), align=None)
    if corner_radius > 0:
        f = fillet(f.vertices(), corner_radius)
    return f


def across_corners(af: float, corner_radius: float = 0.0) -> float:
    r = af / 2 / math.cos(math.pi / 8)
    # a filleted corner pulls the extreme point inward
    return 2 * (r - corner_radius * (1 / math.cos(math.pi / 8) - 1))


def prism(face: Face, h: float, z0: float = 0.0):
    return Pos(0, 0, z0) * extrude(face, h)


def top_edges(solid, z: float, tol=1e-3):
    return solid.edges().filter_by(lambda e: abs(e.center().Z - z) < tol and abs(e.start_point().Z - e.end_point().Z) < tol)


def bottom_edges(solid, z: float = 0.0, tol=1e-3):
    return top_edges(solid, z, tol)


def shapely_to_face(poly: SPoly, simplify: float = 0.015) -> Face:
    poly = poly.simplify(simplify, preserve_topology=True)

    def wire(coords):
        pts = [Vector(x, y, 0) for x, y in list(coords)[:-1]]
        return Wire.make_polygon(pts, close=True)

    return Face(wire(poly.exterior.coords), [wire(i.coords) for i in poly.interiors])


def safe_edge_op(solid, edges, kind: str, size: float, label: str, log: list):
    """Fillet/chamfer with graceful shrink so one fragile edge never stops a build."""
    if size <= 0 or not edges:
        return solid
    for s in (size, size * 0.75, size * 0.5):
        try:
            out = fillet(edges, s) if kind == "fillet" else chamfer(edges, s)
            if out.is_valid:
                if s != size:
                    log.append(f"{label}: {kind} reduced {size}->{round(s, 3)} mm")
                return out
        except Exception:  # OCCT refuses; try smaller
            pass
    log.append(f"{label}: {kind} {size} mm failed; edge left sharp")
    return solid


def engrave(solid, text: str, size: float, x: float, y: float, z_top: float, depth: float = 0.6, rot: float = 0):
    t = Text(text, font_size=size, font_path=FONT, align=(Align.CENTER, Align.CENTER))
    cutter = Pos(x, y, z_top - depth) * Rot(0, 0, rot) * extrude(t, depth + 0.5)
    return solid - cutter


# ---------------------------------------------------------------- pieces
def octagon_body(af: float, h: float, edge: dict, P: dict, log: list, label: str):
    cr = edge.get("corner_radius", 0.0)
    kind = edge["kind"]
    if kind == "turned":
        plinth = prism(octagon_face(af), edge["plinth_height"])
        plinth = safe_edge_op(plinth, top_edges(plinth, edge["plinth_height"]), "chamfer", edge["plinth_chamfer"], label + " plinth", log)
        body = prism(octagon_face(af - 2 * edge["body_inset"]), h - edge["plinth_height"], edge["plinth_height"])
        body = safe_edge_op(body, top_edges(body, h), "fillet", edge["top"], label + " crown", log)
        solid = plinth + body
    else:
        solid = prism(octagon_face(af, cr), h)
        op = "fillet" if kind == "fillet" else "chamfer"
        solid = safe_edge_op(solid, top_edges(solid, h), op, edge["top"], label + " top", log)
        if kind == "fluted":
            fr, fd = edge["flute_radius"], edge["flute_depth"]
            for i in range(8):
                a = i * math.pi / 4
                d = af / 2 + fr - fd
                solid = solid - Pos(d * math.cos(a), d * math.sin(a), 0.6) * Cylinder(fr, h, align=MIN)
    solid = safe_edge_op(solid, bottom_edges(solid), "chamfer", P["piece"]["bottom_chamfer"], label + " foot", log)
    return solid


def boss(P: dict, z0: float, ribs: bool = True, rib_protrusion: float | None = None):
    b = P["piece"]["boss"]
    s = prism(octagon_face(b["af"]), b["height"], z0)
    s = chamfer(top_edges(s, z0 + b["height"]), b["top_chamfer"])
    if ribs and b["rib_count"]:
        rp = b["rib_protrusion"] if rib_protrusion is None else rib_protrusion
        if rp > 0:
            rr = b["rib_radius"]
            for i in range(b["rib_count"]):
                a = i * 2 * math.pi / b["rib_count"]
                d = b["af"] / 2 + rp - rr
                rib = Pos(d * math.cos(a), d * math.sin(a), z0) * Cylinder(rr, b["height"] - b["top_chamfer"], align=MIN)
                s = s + rib
    return s


def recess_cutter(P: dict, clearance: float | None = None):
    b, r = P["piece"]["boss"], P["piece"]["recess"]
    c = r["clearance_per_side"] if clearance is None else clearance
    af = b["af"] + 2 * c
    depth = b["height"] + r["extra_depth"]
    cut = prism(octagon_face(af), depth, -0.01)
    m = r["mouth_chamfer"]
    mouth = extrude(octagon_face(af + 2 * m), amount=m + 0.01, taper=45)
    return cut + Pos(0, 0, -0.01) * mouth


def slot_cutter(P: dict, z_top: float, clearance: float | None = None, rib_protrusion: float | None = None):
    g = P["glyph"]
    c = g["slot_clearance_per_side"] if clearance is None else clearance
    w, t = g["tang_width"] + 2 * c, g["thickness"] + 2 * c
    depth = g["tang_depth"] + g["slot_extra_depth"]
    cut = Pos(0, 0, z_top - depth) * Box(w, t, depth + 0.01, align=MIN)
    m = g["slot_mouth_chamfer"]
    mouth = Pos(0, 0, z_top + 0.01) * Rot(180, 0, 0) * extrude(Rectangle(w + 2 * m, t + 2 * m), amount=m + 0.01, taper=45)
    cut = cut + mouth
    # key: fill the front-right corner (x+, y-) so the glyph only enters one way
    k = g["tang_key_chamfer"] - c
    tri = Polygon((w / 2, -t / 2), (w / 2 - k, -t / 2), (w / 2, -t / 2 + k), align=None)
    key = Pos(0, 0, z_top - depth) * extrude(tri, depth + m, dir=(0, 0, 1))
    cut = cut - key
    # crush ribs: vertical half-cylinders on the two broad walls (normal to glyph thickness)
    rp = g["slot_rib_protrusion"] if rib_protrusion is None else rib_protrusion
    if rp > 0:
        rr = g["slot_rib_radius"]
        for sgn in (1, -1):
            yc = sgn * (t / 2 + rr - rp)
            cut = cut - Pos(-0.8, yc, z_top - depth) * Cylinder(rr, depth - m, align=MIN)
    return cut


def ownership_base(P: dict, variant: dict, log: list):
    p = P["piece"]
    s = octagon_body(p["base_af"], p["base_height"], variant["base_edge"], P, log, "base")
    s = s - recess_cutter(P)
    s = s - slot_cutter(P, p["base_height"])
    return s


def pedestal(P: dict, variant: dict, tier: int, log: list):
    p = P["piece"]
    af, h = (p["t2_af"], p["t2_height"]) if tier == 2 else (p["t3_af"], p["t3_height"])
    s = octagon_body(af, h, variant["pedestal_edge"], P, log, f"t{tier}")
    s = s + boss(P, h)
    if tier == 2:
        s = s - recess_cutter(P)
    return s


# ---------------------------------------------------------------- glyphs
def tang_solid(P: dict):
    g = P["glyph"]
    w, t, d = g["tang_width"], g["thickness"], g["tang_depth"]
    s = Pos(0, -d / 2, 0) * Box(w, d, t, align=(Align.CENTER, Align.CENTER, Align.MIN))
    # key chamfer: edge parallel to Y at x=+w/2, z=t (front-right when standing)
    key = s.edges().filter_by(Axis.Y).filter_by(lambda e: e.center().X > w / 2 - 1e-3 and e.center().Z > t - 1e-3)
    s = chamfer(key, g["tang_key_chamfer"])
    tip = s.edges().filter_by(lambda e: abs(e.center().Y + d) < 1e-3)
    s = chamfer(tip, g["tang_tip_chamfer"])
    return s


def glyph_profile(edge: dict, t: float, step: float = 0.1):
    """Edge profile of the glyph plate as (z0, z1, inset) slabs. OpenCascade
    cannot chamfer/fillet the traced outlines (tips narrower than the edge
    size), so the profile is built from offset slabs `step` mm thick -- the
    resolution a 0.1 mm layer printer reproduces anyway. Exact planar B-rep."""
    kind, b = edge["kind"], edge["bottom"]
    nb = max(1, round(b / step))
    lv = [(i * step, (i + 1) * step, b - (i + 0.5) * step) for i in range(nb)]
    z = nb * step

    def band(z0, z1, inset=0.0):
        return [(z0, z1, inset)] if z1 - z0 > 1e-6 else []

    if kind == "chamfer":
        c = edge["top"]
        n = round(c / step)
        lv += band(z, t - n * step)
        lv += [(t - (n - i) * step, t - (n - i - 1) * step, (i + 0.5) * step) for i in range(n)]
    elif kind == "fillet":
        r = edge["top"]
        n = round(r / step)
        lv += band(z, t - n * step)
        for i in range(n):
            z0 = t - (n - i) * step
            zm = z0 + step / 2 - (t - r)
            lv.append((z0, z0 + step, r - math.sqrt(max(r * r - zm * zm, 0.0))))
    elif kind == "step":
        sh, ins, c = edge["step_height"], edge["top"], 0.3
        n = round(c / step)
        low_top = t - sh
        lv += band(z, low_top - n * step)
        lv += [(low_top - (n - i) * step, low_top - (n - i - 1) * step, (i + 0.5) * step) for i in range(n)]
        # plateau: sits on the lower body, inset `ins`, own top chamfer
        lv += band(low_top, t - n * step, ins)
        lv += [(t - (n - i) * step, t - (n - i - 1) * step, ins + (i + 0.5) * step) for i in range(n)]
    else:
        raise ValueError(kind)
    return lv


def glyph(outline: SPoly, P: dict, variant: dict, log: list, label: str):
    from shapely.geometry import box as sbox
    g = P["glyph"]
    t = g["thickness"]
    b = outline.bounds
    sym2d = outline.intersection(sbox(b[0] - 1, 0.0, b[2] + 1, b[3] + 1))
    if sym2d.geom_type != "Polygon":
        sym2d = max(sym2d.geoms, key=lambda p: p.area)
    slabs = []
    for z0, z1, inset in glyph_profile(variant["glyph_edge"], t):
        p = sym2d.buffer(-inset, quad_segs=8) if inset > 1e-9 else sym2d
        for pp in ([p] if p.geom_type == "Polygon" else list(p.geoms)):
            if pp.is_empty or pp.area < 0.05:
                continue
            slabs.append(Pos(0, 0, z0) * extrude(shapely_to_face(pp, 0.01), z1 - z0, dir=(0, 0, 1)))
    # 0.3 mm of tang reaches up into the symbol (clipped to its outline) so the
    # two share volume, not just a face, and fuse into one solid.
    lap = sym2d.intersection(sbox(-g["tang_width"] / 2, -0.01, g["tang_width"] / 2, 0.3))
    extra = [extrude(shapely_to_face(q, 0.01), t, dir=(0, 0, 1)) for q in ([lap] if lap.geom_type == "Polygon" else list(lap.geoms)) if q.area > 0.01]
    solid = slabs[0].fuse(*slabs[1:], tang_solid(P), *extra).clean()
    if len(solid.solids()) != 1:
        log.append(f"{label}: glyph fused into {len(solid.solids())} solids")
    return solid


def glyph_standing_location(P: dict, z_shoulder: float) -> Location:
    """Glyph frame -> assembly frame: symbol up (+Y) becomes +Z, front (+Z)
    faces -Y, thickness centred on Y=0, shoulder on the base top."""
    t = P["glyph"]["thickness"]
    return Location((0, t / 2, z_shoulder), (90, 0, 0))


# ---------------------------------------------------------------- board
def _tab_face(P: dict, grow: float = 0.0):
    tb = P["board"]["tab"]
    hc = tb["head_center_from_boundary"]
    # neck runs from 2 mm behind the pitch boundary out to the head centre
    neck = Pos((hc - 2.0) / 2, 0) * Rectangle(hc + 2.0 + 2 * grow, tb["neck_width"] + 2 * grow)
    head = Pos(tb["head_center_from_boundary"], 0) * Circle(tb["head_diameter"] / 2 + grow)
    return neck + head  # tab centred on the pitch boundary line x=0, pointing +X


def tile_outline(P: dict, east: bool, north: bool, west: bool, south: bool, clearance: float | None = None):
    bd = P["board"]
    tb = bd["tab"]
    half = bd["pitch"] / 2
    c = tb["clearance_per_side"] if clearance is None else clearance
    f = Rectangle(bd["tile_size"], bd["tile_size"])
    tab = _tab_face(P)
    sock = _tab_face(P, c)
    o = tb["offset_along_edge"]
    if east:
        f = f + Pos(half, o) * tab
    if north:
        f = f + Pos(o, half) * Rot(0, 0, 90) * tab
    if west:
        f = f - Pos(-half, o) * sock
    if south:
        f = f - Pos(o, -half) * Rot(0, 0, 90) * sock
    return f


def stud(P: dict, x: float, y: float, z0: float):
    st = P["board"]["stud"]
    s = Pos(x, y, z0) * Cylinder(st["diameter"] / 2, st["height"], align=MIN)
    return chamfer(top_edges(s, z0 + st["height"]), st["top_chamfer"])


def stud_positions(P: dict):
    d = P["board"]["stud"]["center_from_tile_center"]
    return [(d, 0), (0, d), (-d, 0), (0, -d)]


def tile(P: dict, variant: dict, east: bool, north: bool, west: bool, south: bool, log: list, label: str):
    bd = P["board"]
    h = bd["tile_thickness"]
    edge = variant["tile_edge"]
    face = tile_outline(P, east, north, west, south)
    if edge.get("corner_radius", 0) > 0:
        # soften only the four outer square corners (vertices farthest from centre)
        lim = bd["tile_size"] / 2 - 1e-3
        corners = [v for v in face.vertices() if abs(abs(v.X) - bd["tile_size"] / 2) < 1e-3 and abs(abs(v.Y) - bd["tile_size"] / 2) < 1e-3]
        if corners:
            face = fillet(corners, edge["corner_radius"])
    s = extrude(face, h)
    kind = edge["kind"]
    op = "fillet" if kind == "fillet" else "chamfer"
    s = safe_edge_op(s, top_edges(s, h), op, edge["top"], label + " top", log)
    s = safe_edge_op(s, bottom_edges(s), "chamfer", bd["bottom_chamfer"], label + " bottom", log)
    if kind == "grooved":
        a = bd["tile_size"] / 2 - edge["groove_inset"]
        wdt = edge["groove_width"]
        ring = Rectangle(2 * a, 2 * a) - Rectangle(2 * (a - wdt), 2 * (a - wdt))
        s = s - Pos(0, 0, h - edge["groove_depth"]) * extrude(ring, edge["groove_depth"] + 0.01)
    for (x, y) in stud_positions(P):
        s = s + stud(P, x, y, h)
    return s


TILE_TYPES = {
    # id: (east tab, north tab, west socket, south socket)
    "interior": (True, True, True, True),
    "edge-s": (True, True, True, False),
    "edge-n": (True, False, True, True),
    "edge-w": (True, True, False, True),
    "edge-e": (False, True, True, True),
    "corner-sw": (True, True, False, False),
    "corner-se": (False, True, True, False),
    "corner-nw": (True, False, False, True),
    "corner-ne": (False, False, True, True),
}


def tile_type_at(x: int, y: int, n: int = 10) -> str:
    e, nn, w, s = x < n - 1, y < n - 1, x > 0, y > 0
    for k, v in TILE_TYPES.items():
        if v == (e, nn, w, s):
            return k
    raise ValueError


# ---------------------------------------------------------------- crystals
def crystal(P: dict, socket_clearance: float | None = None, notches: int = 0):
    c = P["crystal"]
    b = c["body"]
    s = Box(b, b, b, align=MIN)
    s = chamfer(s.edges(), c["edge_chamfer"])
    st = P["board"]["stud"]
    s = s + stud(P, 0, 0, b)
    dc = c["socket_diameter_clearance_diametral"] if socket_clearance is None else socket_clearance
    sd = st["diameter"] + dc
    depth = st["height"] + c["socket_extra_depth"]
    hole = Pos(0, 0, -0.01) * Cylinder(sd / 2, depth + 0.01, align=MIN)
    m = c["socket_mouth_chamfer"]
    hole = hole + Pos(0, 0, -0.01) * extrude(Circle(sd / 2 + m), amount=m + 0.01, taper=45)
    s = s - hole
    for i in range(notches):  # identification grooves for fit coupons
        x = -b / 2 + 1.2 + i * 1.2
        s = s - Pos(x, -b / 2, b) * Rot(45, 0, 0) * Box(0.6, 0.8, 0.8)
    return s


def half_crystal(P: dict):
    c = P["crystal"]
    b, h = c["body"], c["half_token_height"]
    s = Box(b, b, h, align=MIN)
    s = chamfer(top_edges(s, h), c["half_token_top_chamfer"])
    s = chamfer(bottom_edges(s), c["edge_chamfer"])
    st = P["board"]["stud"]
    sd = st["diameter"] + c["socket_diameter_clearance_diametral"]
    depth = st["height"] + c["socket_extra_depth"]
    hole = Pos(0, 0, -0.01) * Cylinder(sd / 2, depth + 0.01, align=MIN)
    m = c["socket_mouth_chamfer"]
    hole = hole + Pos(0, 0, -0.01) * extrude(Circle(sd / 2 + m), amount=m + 0.01, taper=45)
    return s - hole


# ---------------------------------------------------------------- fit coupons
def coupon_glyph_slots(P: dict):
    """Block with 2 x 4 base slots: row A sweeps clearance (nominal ribs), row B
    sweeps crush-rib protrusion (nominal clearance). Printed like a base."""
    g = P["glyph"]
    h = P["piece"]["base_height"]
    clear = [0.10, 0.15, 0.20, 0.25]
    ribs = [0.0, 0.15, 0.25, 0.35]
    pitch_x, row_y = 14.0, (8.0, -8.0)
    s = Box(4 * pitch_x + 4, 36, h, align=MIN)
    s = chamfer(bottom_edges(s), 0.4)
    for i, c in enumerate(clear):
        x = (i - 1.5) * pitch_x
        s = s - Pos(x, row_y[0], 0) * slot_cutter(P, h, clearance=c)
        s = engrave(s, f"{c:.2f}"[1:], 3.0, x, row_y[0] + 5.6, h, 0.5)
    for i, r in enumerate(ribs):
        x = (i - 1.5) * pitch_x
        s = s - Pos(x, row_y[1], 0) * slot_cutter(P, h, rib_protrusion=r)
        s = engrave(s, f"R{r:.2f}"[0] + f"{r:.2f}"[1:], 3.0, x, row_y[1] - 5.6, h, 0.5)
    s = engrave(s, "IF1 GLYPH", 2.6, 0, 0, h, 0.5)
    return s, {"row_A_slot_clearance_per_side": clear, "row_A_rib_protrusion": g["slot_rib_protrusion"],
               "row_B_rib_protrusion": ribs, "row_B_slot_clearance_per_side": g["slot_clearance_per_side"]}


def coupon_tang_gauge(P: dict):
    g = P["glyph"]
    t = g["thickness"]
    grip = Pos(0, 7, 0) * Box(22, 14, t, align=MIN)
    grip = chamfer(bottom_edges(grip), 0.4)
    s = grip + tang_solid(P)
    s = engrave(s, "TANG", 3.2, 0, 7.5, t, 0.5)
    return s


def coupon_recess_plate(P: dict):
    clear = [0.05, 0.10, 0.15, 0.20]
    th = P["piece"]["boss"]["height"] + P["piece"]["recess"]["extra_depth"] + 1.6
    pitch_x = 19.0
    s = Box(4 * pitch_x + 2, 28, th, align=MIN)
    s = chamfer(bottom_edges(s), 0.4)
    for i, c in enumerate(clear):
        x = (i - 1.5) * pitch_x
        s = s - Pos(x, 2.5, 0) * recess_cutter(P, clearance=c)
        s = engrave(s, f"{c:.2f}"[1:], 3.0, x, -9.8, th, 0.5)
    return s, {"recess_clearance_per_side": clear}


def coupon_boss_key(P: dict, rib: float, label: str):
    s = prism(octagon_face(22), 3.0)
    s = chamfer(bottom_edges(s), 0.4)
    s = s + boss(P, 3.0, ribs=rib > 0, rib_protrusion=rib)
    # identification: one flat notch per 0.1 mm of rib protrusion (0 notches = no ribs)
    for i in range(int(round(rib / 0.1))):
        a = math.pi + (i - 0.5) * 0.45
        s = s - Pos(11 * math.cos(a), 11 * math.sin(a), 0) * Cylinder(1.0, 3.0, align=MIN)
    return s


def coupon_stud_strip(P: dict):
    h = P["board"]["tile_thickness"]
    s = Box(40, 14, h, align=MIN)
    s = chamfer(bottom_edges(s), 0.4)
    for i in range(4):
        s = s + stud(P, -15 + i * 10, 2.5, h)
    s = engrave(s, "IF1 STUD", 3.0, 0, -3.8, h, 0.5)
    return s


def coupon_tile_pair(P: dict, clearance: float | None, label: str):
    """A 50 x 22 strip cut from a tile edge. clearance=None -> tab strip."""
    bd = P["board"]
    h = bd["tile_thickness"]
    tb = bd["tab"]
    half = bd["pitch"] / 2
    base = Rectangle(bd["tile_size"], 22)
    if clearance is None:
        f = base + Pos(0, 11 + 0.2) * Rot(0, 0, 90) * _tab_face(P)
    else:  # socket opens from this strip's lower edge, like a tile's south socket
        f = base - Pos(0, -11 - 0.2) * Rot(0, 0, 90) * _tab_face(P, clearance)
    s = extrude(f, h)
    s = chamfer(bottom_edges(s), bd["bottom_chamfer"])
    s = engrave(s, label, 3.4, 0, -5.5, h, 0.5)
    return s
