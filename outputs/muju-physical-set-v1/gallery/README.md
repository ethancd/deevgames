# Local model gallery

```sh
cd outputs/muju-physical-set-v1
python3 -m http.server 8000
# open http://localhost:8000/gallery/   (local only; nothing is published)
```

The gallery reads `../manifest.json`, `../assemblies/assemblies.json`,
`../validation/validation.json` and `content.json` (written by `cad/gallery_content.py`). Parts,
states, quantities and validation status therefore come from the same files the models were
built from. The 3D views load the exported GLBs with three.js r170 (vendored, MIT; see
`vendor/THREE-LICENSE.txt`) and instance repeated meshes for the full board.

Sections: compare variants · inspect any of the 108 states (standing / exploded with layer labels /
section cut / loose / loose beside a piece) · every part with dimensions, colour × quantity,
orientation and downloads · board, crowded patch, resource tiles, crystal stacks and tile join ·
contact sheet of all 108 states · concept sketches beside model renders · downloads · validation.

`render.html` is the headless render stage used by `cad/render.mjs`. Browser QA is
`cad/gallery_qa.mjs`; its record and screenshots are in `../validation/gallery-qa/`.
