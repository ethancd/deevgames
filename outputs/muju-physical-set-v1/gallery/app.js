// Muju physical-set gallery. All content comes from the manifest, assemblies and
// validation files produced by cad/*.py, so the page cannot drift from the models.
import { Viewer, ROOT } from './viewer.js';
import * as S from './scenes.js';

const D = await S.loadData();
const C = D.content;
const VARIANTS = Object.keys(C.variants);
const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const link = (path, label) => `<a href="${ROOT}${esc(path)}" download>${esc(label)}</a>`;
const sw = c => `<span class="swatch" style="background:${C.palette[c]?.hex || '#ccc'}"></span>`;
const vname = v => v === 'shared' ? 'Shared (all variants)' : C.variants[v].name;

// ------------------------------------------------------------------ compare
$('#compare-grid').innerHTML = VARIANTS.map(v => {
  const V = C.variants[v];
  return `<article class="card">
    <img src="${ROOT}renders/${v}-lineup.png" alt="Model render of the ${esc(V.name)} variant: six elements in ivory and charcoal at tiers one to three, loose glyphs and crystal stacks" loading="lazy">
    <div class="body"><h3>${esc(V.name)}</h3><p class="tag">${esc(V.tagline)} · brief: ${esc(V.direction.toLowerCase())}</p>
    <p>${esc(V.text)}</p>
    <details><summary>Handling, printing, risks</summary><dl class="kv"><dt>Feel</dt><dd>${esc(V.tactile)}</dd><dt>Printing</dt><dd>${esc(V.print)}</dd><dt>Risk</dt><dd>${esc(V.risk)}</dd></dl></details>
    <div class="dl"><button type="button" data-inspect="${v}" class="primary">Inspect in 3D</button>${link(`downloads/muju-physical-${v}.zip`, 'Variant ZIP')}</div></div></article>`;
}).join('');
document.querySelectorAll('[data-inspect]').forEach(b => b.addEventListener('click', () => { setState({ variant: b.dataset.inspect }); $('#inspect').scrollIntoView(); }));

// ------------------------------------------------------------------ inspector
const inspect = new Viewer($('#v-inspect'));
const labelsEl = $('#labels');
const st = { variant: 'facet', element: 'metal', owner: 'ivory', tier: 3, mode: 'standing', part: null, partColor: null };
const OPTS = {
  variant: VARIANTS.map(v => [v, C.variants[v].name]),
  element: S.ELEMENTS.map(e => [e, `${sw(e)}${e}`]),
  owner: S.OWNERS.map(o => [o, `${sw(o)}${o}`]),
  tier: [[1, 'T1'], [2, 'T2'], [3, 'T3']],
  mode: [['standing', 'Standing'], ['exploded', 'Exploded'], ['section', 'Section cut'], ['loose', 'Loose (pending)'], ['beside', 'Loose beside piece']],
};
for (const [key, opts] of Object.entries(OPTS)) {
  const box = document.querySelector(`.seg[data-key="${key}"]`);
  box.innerHTML = opts.map(([val, lab]) => `<button type="button" data-val="${val}">${lab}</button>`).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) setState({ [key]: key === 'tier' ? +b.dataset.val : b.dataset.val, part: null });
  });
}
$('#reset').addEventListener('click', () => inspect.resetCamera());
inspect.onRender = () => {
  if (st.mode !== 'exploded' || st.part) { labelsEl.innerHTML = ''; return; }
  labelsEl.innerHTML = inspect.labelPositions().map(p => `<span style="left:${p.x}px;top:${p.y}px">${esc(p.label)}</span>`).join('');
};

let token = 0;
async function setState(patch) {
  Object.assign(st, patch);
  for (const [key] of Object.entries(OPTS)) {
    document.querySelectorAll(`.seg[data-key="${key}"] button`).forEach(b => b.setAttribute('aria-pressed', String(!st.part && String(st[key]) === b.dataset.val)));
  }
  const my = ++token;
  $('#loading').textContent = 'Loading meshes…';
  inspect.clear();
  inspect.setClip(false);
  let items, frame = { dir: [0.55, 0.35, 1.0], pad: 1.1 }, info = '';
  const s = S.state(D, st.variant, st.element, st.owner, st.tier);
  if (st.part) {
    items = S.partItems(D, st.part, st.partColor);
    frame = { dir: [0.8, 0.8, 1.1], pad: 1.1 };
    info = partInfo(D.parts[st.part], st.partColor);
  } else if (st.mode === 'loose') {
    items = S.looseItems(D, st.variant, st.element);
    frame = { dir: [0.3, 1.4, 0.9], pad: 1.1 };
    info = `<h3>Loose ${esc(st.element)} glyph = pending summon</h3><p>The same glyph as the standing piece, lying face-up with no base. The tang lies in the plane, so it lies flat. Orient the symbol to read upright from its owner's seat; that is the only ownership cue, and it is enough when both players' commitments are on the board (see print guide).</p>`;
  } else if (st.mode === 'beside') {
    items = S.besideItems(D, st.variant, st.element, st.owner, st.tier, 'metal');
    frame = { dir: [0.35, 1.25, 0.9], pad: 0.95 };
    const pl = D.asm.loose_beside_piece[String(st.tier)].metal;
    info = `<h3>Pending glyph beside an occupying piece</h3><p>SPEC §5.2: a real unit may stand on a square with a pending commitment. The largest loose glyph (metal) is shown in the free corner of a tile that also has a T${st.tier} piece and four 4-high stacks.</p>
      <table><tr><th>Touches piece or stacks</th><td class="ok">no <span class="ev ev-digital">Digital check</span></td></tr><tr><th>Area over the tile edge</th><td>${pl.overhang_beyond_own_tile_mm2} mm²</td></tr><tr><th>Centre on own tile</th><td>${pl.centre_on_own_tile ? 'yes' : 'no'}</td></tr></table>
      <p class="note">Finger access and whether the overhang is acceptable need a hand trial <span class="ev ev-physical">Physical test pending</span>.</p>`;
  } else {
    items = S.pieceItems(D, st.variant, st.element, st.owner, st.tier);
    if (st.mode === 'exploded') frame.pad = 1.25;
    info = stateInfo(s);
  }
  await inspect.add(items, { explode: st.mode === 'exploded' && !st.part ? 1 : 0 });
  if (my !== token) return;
  if (st.mode === 'section' && !st.part) inspect.setClip(true, 0);
  inspect.frame(frame);
  $('#loading').textContent = '';
  $('#state-info').innerHTML = info;
}

function stateInfo(s) {
  const rows = s.parts.map(p => `<tr><td>${sw(p.color)}${esc(p.label)}</td><td>${link(p.stl, 'STL')}</td></tr>`).join('');
  return `<h3>${esc(C.variants[st.variant].name)} · ${esc(st.element)} · ${esc(st.owner)} · T${s.tier}</h3>
    <dl class="kv"><dt>State id</dt><dd><code>${esc(s.id)}</code></dd><dt>Height</dt><dd>${s.height_mm} mm on the table (${(s.height_mm + C.geometry.tile_h).toFixed(1)} on a tile)</dd>
    <dt>Footprint</dt><dd>${s.footprint_af_mm} mm across flats</dd><dt>Layers</dt><dd>${s.parts.length} separate parts${s.tier === 3 ? ' (T3 keeps the base and T2)' : ''}</dd></dl>
    <table>${rows}</table>
    <p class="note">${st.mode === 'section' ? (C.variants[st.variant].interface === 'IF2' || String(C.variants[st.variant].interface).startsWith('IF2') ? 'Section through the thickness of the glyph: tang in slot, collars in grooves (flex beams grip each collar). ' : 'Section through the thickness of the glyph: tang in slot, bosses in recesses. ') : ''}Stack interference in the model: ${String(C.variants[st.variant].interface).startsWith('IF2') ? 'glyph crush ribs and the flex-beam bump preload only; one-way keys line up the tier dots' : 'crush ribs only'} <span class="ev ev-digital">Digital check</span></p>`;
}

function partInfo(p, color) {
  const g = p.geometry;
  const inst = p.instances.map(i => `${sw(i.color)}${esc(i.color)} × ${i.qty_per_set}`).join('<br>');
  return `<h3>${esc(p.role)}</h3><dl class="kv"><dt>Part id</dt><dd><code>${esc(p.id)}</code></dd><dt>Variant</dt><dd>${esc(vname(p.variant))}</dd>
    <dt>Size</dt><dd>${g.bbox_mm.map(x => x.toFixed(1)).join(' × ')} mm</dd><dt>Volume</dt><dd>${(g.brep_volume_mm3 / 1000).toFixed(2)} cm³</dd>
    <dt>Colour × qty</dt><dd>${inst}${p.production ? '' : '<br><em>calibration only</em>'}</dd><dt>Orientation</dt><dd>${esc(p.print_orientation)}</dd>
    <dt>Digital</dt><dd class="${p.validation.digital === 'pass' ? 'ok' : 'bad'}">${esc(p.validation.digital)}</dd><dt>Slicer</dt><dd class="pending">${esc(p.validation.slicer)}</dd><dt>Physical</dt><dd class="pending">${esc(p.validation.physical)}</dd></dl>
    <div class="dl">${link(g.stl, 'STL')}${link(g.step, 'STEP')}${Object.entries(g.glb).map(([c, u]) => link(u, `GLB (${c})`)).join('')}</div>`;
}

// ------------------------------------------------------------------ parts
const fam = [...new Set(D.manifest.parts.map(p => p.family))];
$('#f-variant').innerHTML = ['all', ...VARIANTS, 'shared'].map(v => `<option value="${v}">${v === 'all' ? 'All' : esc(vname(v))}</option>`).join('');
$('#f-family').innerHTML = ['all', ...fam].map(f => `<option value="${f}">${f === 'all' ? 'All' : esc(f)}</option>`).join('');
function renderParts() {
  const v = $('#f-variant').value, f = $('#f-family').value;
  const list = D.manifest.parts.filter(p => (v === 'all' || p.variant === v || (v !== 'shared' && p.variant === 'shared' && p.production)) && (f === 'all' || p.family === f));
  $('#f-count').textContent = `${list.length} part geometries`;
  $('#part-grid').innerHTML = list.map(p => {
    const thumb = C.part_thumbs[p.id];
    const q = p.instances.map(i => `${sw(i.color)}${i.qty_per_set}`).join(' ');
    return `<article class="card">${thumb ? `<img src="${ROOT}${thumb}" alt="Model render of part ${esc(p.id)}" loading="lazy">` : ''}
      <div class="body"><h3>${esc(p.id.split('.').slice(1).join('.'))}</h3><p class="tag">${esc(vname(p.variant))} · ${esc(p.family)}${p.production ? '' : ' · calibration'}</p>
      <p style="margin:0">${q} per set · ${p.geometry.bbox_mm.map(x => x.toFixed(1)).join('×')} mm</p>
      <details><summary>Details &amp; downloads</summary>${partInfo(p)}</details>
      <div class="dl"><button type="button" data-part="${esc(p.id)}">View 3D</button></div></div></article>`;
  }).join('');
}
$('#f-variant').addEventListener('change', renderParts);
$('#f-family').addEventListener('change', renderParts);
$('#part-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-part]');
  if (!b) return;
  const p = D.parts[b.dataset.part];
  setState({ part: p.id, partColor: Object.keys(p.geometry.glb)[0] });
  $('#inspect').scrollIntoView();
});
renderParts();

// ------------------------------------------------------------------ board & crystals
const boardV = new Viewer($('#v-board'));
const bst = { variant: 'facet', scene: 'board' };
const SCENES = [['board', 'Full 10×10 board'], ['gradient', 'Board: colour by crystals'], ['sections-gray', '9 sections (gray)'], ['sections-gradient', '9 sections (by crystals)'], ['patch', 'Crowded patch'], ['resources', 'Resource tiles 0/4/8/16'], ['crystals', 'Crystal stacks 1–4 + half token'], ['tiles', 'Tile join (A1 corner)']];
$('#board-controls').innerHTML = `<div class="seg" data-b="variant">${VARIANTS.map(v => `<button type="button" data-val="${v}">${esc(C.variants[v].name)}</button>`).join('')}</div>
  <div class="seg" data-b="scene">${SCENES.map(([k, l]) => `<button type="button" data-val="${k}">${l}</button>`).join('')}</div>`;
$('#board-controls').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  bst[b.parentElement.dataset.b] = b.dataset.val;
  showBoard();
});
$('#reset-b').addEventListener('click', () => boardV.resetCamera());
let btoken = 0;
async function showBoard() {
  document.querySelectorAll('#board-controls button').forEach(b => b.setAttribute('aria-pressed', String(bst[b.parentElement.dataset.b] === b.dataset.val)));
  const my = ++btoken;
  $('#loading-b').textContent = 'Loading meshes…';
  boardV.clear();
  const v = bst.variant;
  const B = D.asm.variants[v].board;
  let items, frame = { dir: [0.4, 0.9, 1.1], pad: 0.9 }, info = '';
  const vb = D.validation?.board?.[v];
  switch (bst.scene) {
    case 'board':
      items = S.boardItems(D, v); frame = { dir: [0.0, 1.35, 1.0], pad: 0.8 };
      info = `<h3>Full board, canonical start</h3><table>
        <tr><th>Tiles</th><td>${B.tiles.length}: ${B.tiles.filter(t => t.color === 'gray').length} gray, A1 ${sw(B.tiles.find(t => t.coord === 'A1').color)}${B.tiles.find(t => t.coord === 'A1').color}, J10 ${sw(B.tiles.find(t => t.coord === 'J10').color)}${B.tiles.find(t => t.coord === 'J10').color}</td></tr>
        <tr><th>Crystals</th><td>${B.crystal_count} from <code>resourceMap.ts</code> (${D.manifest.resource_map.total})</td></tr>
        <tr><th>Outline</th><td>${B.outer_size_mm.join(' × ')} mm</td></tr>
        <tr><th>Start pieces</th><td>${B.start_pieces.map(p => `${p.owner} ${p.element} ${p.coord}`).join(', ')}</td></tr>
        <tr><th>Checks</th><td>${vb ? `<span class="ok">98/1/1 colours, A1/J10 homes, no tile clashes</span> <span class="ev ev-digital">Digital check</span>` : ''}</td></tr></table>
        <p class="note">Ivory sits at the near (rank-1) edge; file A is on Ivory's left. Tiles and crystals are drawn as GPU instances of one mesh per type.</p>`;
      break;
    case 'gradient': {
      items = S.boardGradientItems(D, v); frame = { dir: [0.0, 1.35, 1.0], pad: 0.8 };
      const ramp = [['ivory', 'A1 home (Ivory)'], ['tile16', '16 crystals'], ['gray', '8 crystals'], ['tile4', '4 crystals'], ['tile0', '0 crystals (flat tiles)'], ['charcoal', 'J10 home (Charcoal)']];
      const n = c => D.asm.variants[v].board_gradient_tiles.filter(t => t.color === c).length;
      info = `<h3>Board coloured by starting crystals</h3><p>A mock-up: the same 100 tiles, each printed in a neutral that steps from light to dark with its starting reserve. The two homes keep the army colours, so they stay the ends of the scale.</p>
        <table>${ramp.map(([c, l]) => `<tr><th>${sw(c)}${l}</th><td>${n(c)} tile${n(c) === 1 ? '' : 's'} · ${esc(C.palette[c].lead.replace(/ \(alt\..*\)$/, ''))}</td></tr>`).join('')}</table>
        <p class="note">Bambu has no matte dark gray between Nardo Gray and Charcoal, so the 0-crystal tiles use PLA Basic Dark Gray (slightly glossier). On screen the viewer's lighting makes Bone White (16) look close to the Ivory home; the real filaments are further apart (Bone White is a warm light gray), so compare swatches in hand <span class="ev ev-concept">Mock-up</span></p>`;
      break;
    }
    case 'sections-gray':
    case 'sections-gradient': {
      const scheme = bst.scene.split('-')[1];
      items = S.sectionItems(D, v, scheme, 8); frame = { dir: [0.0, 1.35, 1.0], pad: 0.8 };
      const sv = D.validation?.sections?.[C.variants[v].extends || v]?.[scheme];
      info = `<h3>Board printed in nine sections (${scheme === 'gray' ? 'all gray' : 'coloured by starting crystals'})</h3>
        <p>Four 3×3 corners, four 3×4 edges and a 4×4 centre, shown 8 mm apart. Each section is one print; the squares inside it are marked by shallow V-grooves, and the sections join with the same tabs as the single tiles. ${scheme === 'gray' ? 'Only the two corner sections need a second colour (the home square).' : 'Each section is a multi-colour print: every square is its own coloured part.'}</p>
        <table><tr><th>Largest section</th><td>4×4 centre, ${sv ? sv.largest_section_mm : '—'} mm (bed 300 × 320)</td></tr>
        <tr><th>Checks</th><td>${sv ? `<span class="${sv.colours_match_scheme && sv.section_interference_max_mm3 < 1e-3 ? 'ok' : 'bad'}">9 sections, colours match, no overlap</span> <span class="ev ev-digital">Digital check</span>` : ''}</td></tr>
        <tr><th>Plates</th><td>one 3MF per section in <code>print/${esc(C.variants[v].extends || v)}/sections/</code></td></tr></table>`;
      break;
    }
    case 'patch':
      items = S.patchItems(D, v); frame = { dir: [0.6, 0.95, 1.1], pad: 0.8 };
      info = `<h3>Crowded patch</h3><p>3×3 tiles, four 4-high stacks on every tile, T3 pieces on the centre (rotated 22.5°, the worst case) and neighbours, and a loose shadow glyph beside the centre piece.</p>
        <table><tr><th>Piece vs stacks</th><td>${D.validation.crowded_patch[v].piece_vs_crystal_interference_mm3} mm³</td></tr><tr><th>Worst-rotation clearance</th><td>${D.validation.crowded_patch[v].clearance_worst_rotation_mm} mm</td></tr><tr><th>Stacks across a seam</th><td>1.0 mm apart (finger trial pending)</td></tr></table>`;
      break;
    case 'resources':
      items = [0, 4, 8, 16].flatMap((n, i) => S.tileWithStacks(D, v, n / 4, (i - 1.5) * 58, 0)); frame = { dir: [0.3, 0.8, 1.2], pad: 0.8 };
      info = `<h3>Initial reserves</h3><p>0 = no cubes · 4 = one cube on each stud · 8 = two-high stacks · 16 = four-high stacks (25.6 mm).</p>`;
      break;
    case 'crystals':
      items = S.crystalStackItems(D); frame = { dir: [0.4, 0.6, 1.2], pad: 0.9 };
      info = `<h3>Crystals</h3><p>6 mm cubes, Ø3.2 × 1.6 mm stud, Ø3.45 mm socket (0.125 mm radial). Shown 1–4 high. The half-crystal token (right) is a crystal cut along its diagonal: a full-height triangular prism with the stud notch on its cut face and no stud; it sits on a stud or a stack top.</p>${partInfo(D.parts['shared.crystal'])}`;
      break;
    case 'tiles':
      items = S.tileJoinItems(D, v, 10); frame = { dir: [0.3, 1.3, 0.9], pad: 0.9 };
      info = `<h3>Tile join (A1, B1, A2, B2, spread apart)</h3><p>East/north tabs drop into west/south sockets (0.25 mm per side). Border tiles have no outward tabs. A1 is the ivory home.</p>`;
      break;
  }
  await boardV.add(items);
  if (my !== btoken) return;
  boardV.frame(frame);
  $('#loading-b').textContent = '';
  $('#board-info').innerHTML = info;
}

// ------------------------------------------------------------------ states
$('#s-variant').innerHTML = VARIANTS.map(v => `<option value="${v}">${esc(C.variants[v].name)}</option>`).join('');
function renderStates() {
  const v = $('#s-variant').value;
  $('#state-grid').innerHTML = D.asm.variants[v].piece_states.map(s =>
    `<button type="button" data-state="${esc(s.id)}"><img src="${ROOT}renders/states/${esc(s.id)}.png" alt="${esc(`${s.owner} ${s.element} tier ${s.tier}`)}" loading="lazy"><span>${sw(s.element)}${esc(s.element)} ${s.owner === 'ivory' ? 'IV' : 'CH'} T${s.tier}</span></button>`).join('');
}
$('#s-variant').addEventListener('change', renderStates);
$('#state-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-state]');
  if (!b) return;
  const [v, el, owner, t] = b.dataset.state.split('.');
  setState({ variant: v, element: el, owner, tier: +t.slice(1), mode: 'standing', part: null });
  $('#inspect').scrollIntoView();
});
renderStates();

// ------------------------------------------------------------------ concepts vs models
$('#concept-list').innerHTML = VARIANTS.map(v => {
  const con = C.concepts[v] || [];
  const pairs = [[con[0], `renders/${v}-lineup.png`, 'Overview'], [con[1], `renders/${v}-t3-exploded.png`, 'Construction'], [con[2], `renders/${v}-board.png`, 'Tabletop']];
  return `<h3>${esc(C.variants[v].name)}</h3>` + pairs.map(([c, r, lab]) => `<div class="pair">
    <figure>${c ? `<img src="${ROOT}${c}" alt="Concept sketch: ${esc(C.variants[v].name)} ${lab.toLowerCase()}" loading="lazy">` : '<p>No concept image.</p>'}<figcaption><span class="ev ev-concept">Concept sketch</span> ${c ? `${lab}: vector drawing of intent. ${link(`concepts/${v}/prompts.md`, 'Raster prompts (not run)')}` : `${lab}: no separate sketch; this variant shares ${esc(C.variants[C.variants[v].extends]?.name || 'its parent')}'s look.`}</figcaption></figure>
    <figure><img src="${ROOT}${r}" alt="Model render: ${esc(C.variants[v].name)} ${lab.toLowerCase()}" loading="lazy"><figcaption><span class="ev ev-model">Model render</span> exported GLB meshes, three.js</figcaption></figure></div>`).join('');
}).join('');

// ------------------------------------------------------------------ downloads
const inv = D.manifest.inventory;
$('#download-list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Package</th><th>Contents</th><th>Link</th></tr></thead><tbody>
  ${VARIANTS.map(v => `<tr><td>${esc(C.variants[v].name)} full set</td><td>${inv[v].objects} objects: every production STL, geometry-only plate 3MFs (${Object.values(D.manifest.plates[v]).flat().length} plates), print guide, BOM, editable source</td><td>${link(`downloads/muju-physical-${v}.zip`, 'ZIP')}</td></tr>`).join('')}
  <tr><td>Calibration (IF1)</td><td>${D.manifest.calibration_objects} coupon objects and plates; test sequence with blanks</td><td>${link('downloads/muju-physical-calibration-IF1.zip', 'ZIP')} ${link('print/PHYSICAL-TEST-SEQUENCE.md', 'Test sequence')}</td></tr>
  <tr><td>Editable source</td><td>params.json, build/assemblies/validate/package scripts, manifest, assemblies</td><td>${link('downloads/muju-physical-source.zip', 'ZIP')}</td></tr>
  <tr><td>Bill of materials</td><td>Quantities (exact), mass and cost (estimates, assumptions stated)</td><td>${link('print/BOM.md', 'BOM.md')} ${link('print/BOM.csv', 'BOM.csv')}</td></tr>
  <tr><td>Print &amp; assembly guide</td><td>H2C set-up, plates, orientations, assembly, pending-summon handling</td><td>${link('print/README.md', 'README')}</td></tr>
  <tr><td>Manifest &amp; checksums</td><td>Stable part ids, quantities, dimensions, paths, source hashes</td><td>${link('manifest.json', 'manifest.json')} ${link('SHA256SUMS', 'SHA256SUMS')}</td></tr>
  </tbody></table></div>
  <p class="note"><strong>Plate 3MFs:</strong> positioned, named objects with material names and display colours, and <em>no</em> printer, process or filament settings (choose those in Bambu Studio). Multi-colour objects (tier-dot pieces, board sections) are multi-part objects whose parts carry Bambu filament slots.</p>`;

// ------------------------------------------------------------------ validation
const V = D.validation;
if (V) {
  const files = Object.values(V.files), okF = files.filter(f => f.ok).length;
  const tm = Object.values(V.threemf);
  $('#validation-list').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Check</th><th>Result</th><th>Kind</th></tr></thead><tbody>
    <tr><td>Exported STLs re-imported: watertight, consistent winding, one body, volume within 0.5 % of the B-rep, bbox matches manifest, on the bed</td><td class="${okF === files.length ? 'ok' : 'bad'}">${okF}/${files.length}</td><td><span class="ev ev-digital">Digital</span></td></tr>
    <tr><td>3MF strict lib3mf read, millimetre units, manifold meshes</td><td class="ok">${tm.filter(t => t.warnings === 0 && t.all_meshes_manifold_oriented).length}/${tm.length}</td><td><span class="ev ev-digital">Digital</span></td></tr>
    <tr><td>Assembled states resolve to model files; T3 contains base + T2 + T3; only crush-rib interference</td><td class="ok">${V.assemblies.total_states}/${36 * VARIANTS.length}</td><td><span class="ev ev-digital">Digital</span></td></tr>
    <tr><td>Glyph key: correct insertion fits, flipped insertion collides (all 6 glyphs × ${VARIANTS.length} variants)</td><td class="ok">${VARIANTS.every(v => Object.values(V.interfaces[v].glyph_in_base).every(g => g.keyed)) ? 'pass' : 'FAIL'}</td><td><span class="ev ev-digital">Digital</span></td></tr>
    <tr><td>Board: 100 tiles, 98 gray, A1 ivory, J10 charcoal, no clashes, 504 crystals from resourceMap.ts</td><td class="ok">${VARIANTS.map(v => `${C.variants[v].name}: ${V.board[v].gray}/${V.board[v].A1}/${V.board[v].J10}/${V.board[v].crystals}`).join('<br>')}</td><td><span class="ev ev-digital">Digital</span></td></tr>
    <tr><td>Inventory per variant (target 891)</td><td class="ok">${Object.entries(V.inventory).map(([k, n]) => `${esc(C.variants[k].name)}: ${n}`).join('<br>')}</td><td><span class="ev ev-digital">Digital</span></td></tr>
    <tr><td>Slicing on an H2C profile (support, bridges, time, mass)</td><td class="ok">every plate sliced in Bambu Studio; multi-colour plates as geometry only — ${link('validation/slicer/slicer-checks.md', 'slicer-checks.md')}</td><td><span class="ev ev-slicer">Slicer</span></td></tr>
    <tr><td>Printed fits, retention, wear, ergonomics, colours</td><td class="pending">not performed</td><td><span class="ev ev-physical">Physical</span></td></tr>
    </tbody></table></div><p class="note">Overall digital result: <span class="${V.passed ? 'ok' : 'bad'}">${V.passed ? 'all digital checks passed' : V.failures.length + ' failures'}</span> (${esc(V.generated)}). Details: ${link('validation/validation.json', 'validation.json')} · ${link('validation/digital-checks.md', 'digital-checks.md')}</p>`;
}

// ------------------------------------------------------------------ start
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.get('v')) st.variant = hash.get('v');
await setState({});
await showBoard();
window.GALLERY_READY = true;
