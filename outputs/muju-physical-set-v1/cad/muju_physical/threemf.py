"""Minimal, spec-conformant 3MF (core + basematerials) writer.

Geometry-only: object names, base-material names and display colours, build
items with transforms. No slicer settings, filament slots, or G-code are
embedded -- Bambu Studio will ask for printer/filament profiles on import.
"""
from __future__ import annotations

import zipfile
from xml.sax.saxutils import escape

import numpy as np

CT = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>"""
RELS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>"""


def _fmt(v: float) -> str:
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def bambu_model_settings(bambu_parts: dict) -> str:
    """Bambu Studio per-part filament slots: {object_id: (name, [(component_id, part_name, slot)])}.
    Plain 3MF readers ignore this file; Bambu Studio reads it to assign each part its filament."""
    out = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>']
    for oid, (name, comps) in bambu_parts.items():
        out.append(f'  <object id="{oid}">')
        out.append(f'    <metadata key="name" value="{escape(name)}"/>')
        out.append(f'    <metadata key="extruder" value="{comps[0][2]}"/>')
        for cid, pname, slot in comps:
            out.append(f'    <part id="{cid}" subtype="normal_part">')
            out.append(f'      <metadata key="name" value="{escape(pname)}"/>')
            out.append(f'      <metadata key="extruder" value="{slot}"/>')
            out.append('    </part>')
        out.append('  </object>')
    out.append('</config>\n')
    return "\n".join(out)


def write_3mf(path, objects: list[dict], items: list[dict], title: str, materials: list[dict], metadata: dict | None = None,
              bambu_parts: dict | None = None):
    """objects: [{id, name, vertices (N,3), faces (M,3), material_index}]
    items: [{object_id, transform (4x4), name?}]
    materials: [{name, hex}] -> one basematerials group (id 1)."""
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
           f' <metadata name="Title">{escape(title)}</metadata>',
           ' <metadata name="Application">muju-physical-set-v1 build.py (geometry only; no slicer settings)</metadata>']
    if metadata:  # only standard 3MF metadata names are allowed un-namespaced
        desc = "; ".join(f"{k}: {v}" for k, v in metadata.items())
        out.append(f' <metadata name="Description">{escape(desc)}</metadata>')
    out.append(' <resources>')
    out.append('  <basematerials id="1">')
    for m in materials:
        out.append(f'   <base name="{escape(m["name"])}" displaycolor="{m["hex"].upper()}FF"/>')
    out.append('  </basematerials>')
    for o in objects:
        if "components" in o:  # multi-part object: one component per mesh object (e.g. body + tier-dot inlay)
            out.append(f'  <object id="{o["id"]}" name="{escape(o["name"])}" type="model">\n   <components>')
            out.extend(f'    <component objectid="{c}"/>' for c in o["components"])
            out.append('   </components>\n  </object>')
            continue
        out.append(f'  <object id="{o["id"]}" name="{escape(o["name"])}" type="model" pid="1" pindex="{o["material_index"]}">')
        out.append('   <mesh>\n    <vertices>')
        out.extend(f'     <vertex x="{_fmt(x)}" y="{_fmt(y)}" z="{_fmt(z)}"/>' for x, y, z in np.asarray(o["vertices"]))
        out.append('    </vertices>\n    <triangles>')
        out.extend(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in np.asarray(o["faces"]))
        out.append('    </triangles>\n   </mesh>\n  </object>')
    out.append(' </resources>\n <build>')
    for it in items:
        m = np.asarray(it["transform"], dtype=float)
        # 3MF uses row vectors: m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32
        vals = [m[0, 0], m[1, 0], m[2, 0], m[0, 1], m[1, 1], m[2, 1], m[0, 2], m[1, 2], m[2, 2], m[0, 3], m[1, 3], m[2, 3]]
        name = f' p:name="{escape(it["name"])}"' if False else ""
        out.append(f'  <item objectid="{it["object_id"]}" transform="{" ".join(_fmt(v) for v in vals)}"{name}/>')
    out.append(' </build>\n</model>\n')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CT)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", "\n".join(out))
        if bambu_parts:
            z.writestr("Metadata/model_settings.config", bambu_model_settings(bambu_parts))
