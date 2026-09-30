// Scene builders: turn manifest/assemblies data into lists of {glb, matrix, label}.
// Everything comes from ../manifest.json and ../assemblies/assemblies.json, so the
// gallery cannot drift from the exported models.
export const ELEMENTS = ['fire', 'lightning', 'water', 'shadow', 'plant', 'metal'];
export const OWNERS = ['ivory', 'charcoal'];

export async function loadData() {
  const [manifest, asm, validation, content] = await Promise.all([
    fetch('../manifest.json').then(r => r.json()),
    fetch('../assemblies/assemblies.json').then(r => r.json()),
    fetch('../validation/validation.json').then(r => r.json()).catch(() => null),
    fetch('content.json').then(r => r.json()),
  ]);
  const parts = Object.fromEntries(manifest.parts.map(p => [p.id, p]));
  return { manifest, asm, validation, content, parts };
}

const I = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function T(x = 0, y = 0, z = 0, rz = 0) {
  const c = Math.cos(rz * Math.PI / 180), s = Math.sin(rz * Math.PI / 180);
  return [c, -s, 0, x, s, c, 0, y, 0, 0, 1, z, 0, 0, 0, 1];
}
export function mul(a, b) { // row-major 4x4
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  return o;
}
const glb = (D, id, color) => D.parts[id].geometry.glb[color];

export function state(D, v, el, owner, tier) {
  return D.asm.variants[v].piece_states.find(s => s.element === el && s.owner === owner && s.tier === tier);
}

export function pieceItems(D, v, el, owner, tier, at = I()) {
  return state(D, v, el, owner, tier).parts.map(p => ({ ...p, matrix: mul(at, p.matrix) }));
}

export function stackItems(D, x, y, n, z0) {
  const g = D.content.geometry;
  return Array.from({ length: n }, (_, k) => ({ glb: glb(D, 'shared.crystal', 'crystal'), matrix: T(x, y, z0 + k * g.cube), label: null }));
}

export function tileWithStacks(D, v, per, ox = 0, oy = 0, type = per === 0 ? 'interior-flat' : 'interior', color = 'gray') {
  const g = D.content.geometry;
  const items = [{ glb: glb(D, `${v}.tile-${type}`, color), matrix: T(ox, oy, 0) }];
  for (const [x, y] of g.studs) items.push(...stackItems(D, ox + x, oy + y, per, g.tile_h));
  return items;
}

export function looseItems(D, v, el, at = T()) {
  return [{ glb: glb(D, `${v}.glyph-${el}`, el), matrix: at, label: `Loose ${el} glyph — pending summon`, part: `${v}.glyph-${el}` }];
}

/** A piece on a tile with four 4-high stacks and a loose glyph beside it (SPEC 5.2 coexistence). */
export function besideItems(D, v, el, owner, tier, looseEl = el) {
  const g = D.content.geometry;
  const pl = D.asm.loose_beside_piece[String(tier)][looseEl];
  return [
    ...tileWithStacks(D, v, 4),
    ...pieceItems(D, v, el, owner, tier, T(0, 0, g.tile_h)),
    ...looseItems(D, v, looseEl, T(pl.x, pl.y, g.tile_h, pl.rotation_deg)),
  ];
}

export function lineupItems(D, v) {
  // Same composition for every variant: ivory row in front, charcoal behind,
  // tiers 1-2-3 repeated across the six elements, plus two loose glyphs.
  const items = [];
  ELEMENTS.forEach((el, i) => {
    const x = (i - 2.5) * 42;
    items.push(...pieceItems(D, v, el, 'ivory', (i % 3) + 1, T(x, -26, 0)));
    items.push(...pieceItems(D, v, el, 'charcoal', 3 - (i % 3), T(x, 26, 0, 180)));
  });
  items.push(...looseItems(D, v, 'metal', T(-140, -75, 0, 0)));
  items.push(...looseItems(D, v, 'lightning', T(-105, -75, 0, 0)));
  const g = D.content.geometry;
  items.push(...stackItems(D, 130, -75, 4, 0), ...stackItems(D, 142, -75, 2, 0), ...stackItems(D, 154, -75, 1, 0));
  return items;
}

export function crystalStackItems(D) {
  const g = D.content.geometry;
  const items = [];
  [1, 2, 3, 4].forEach((n, i) => items.push(...stackItems(D, (i - 1.5) * 14, 0, n, 0)));
  items.push({ glb: glb(D, 'shared.half-crystal', 'crystal'), matrix: T(38, 0, 0), label: 'Half-crystal token' });
  items.push({ glb: glb(D, 'shared.half-crystal', 'crystal'), matrix: T(-38, 0, 0), label: null }, ...stackItems(D, -38, 14, 1, 0));
  return items;
}

export function tileJoinItems(D, v, spread = 0) {
  return D.asm.variants[v].tile_join.map(t => ({ ...t, matrix: mul(T(t.board_xy[0] * spread, t.board_xy[1] * spread, 0), t.matrix) }));
}

export function patchItems(D, v) { return D.asm.variants[v].crowded_patch; }

export function boardItems(D, v) {
  const B = D.asm.variants[v].board;
  return [
    ...B.tiles.map(t => ({ glb: t.glb, matrix: t.matrix })),
    ...B.crystal_matrices.map(m => ({ glb: B.crystal_glb, matrix: m })),
    ...B.start_pieces.flatMap(p => p.parts.map(q => ({ glb: q.glb, matrix: q.matrix }))),
  ];
}

export function partItems(D, id, color) {
  const p = D.parts[id];
  const c = color || Object.keys(p.geometry.glb)[0];
  return [{ glb: p.geometry.glb[c], matrix: T(), label: null, part: id }];
}

export function boardGradientItems(D, v) {
  const B = D.asm.variants[v].board;
  return [
    ...D.asm.variants[v].board_gradient_tiles.map(t => ({ glb: t.glb, matrix: t.matrix })),
    ...B.crystal_matrices.map(m => ({ glb: B.crystal_glb, matrix: m })),
    ...B.start_pieces.flatMap(p => p.parts.map(q => ({ glb: q.glb, matrix: q.matrix }))),
  ];
}

/** The nine printed board sections of a scheme, spread `gap` mm apart, with crystals and start pieces on them. */
export function sectionItems(D, v, scheme, gap = 8) {
  const V = D.asm.variants[v], B = V.board, pitch = D.content.geometry.pitch;
  const bnd = { sw: [0, 0], s: [1, 0], se: [2, 0], w: [0, 1], c: [1, 1], e: [2, 1], nw: [0, 2], n: [1, 2], ne: [2, 2] };
  const shift = (i) => (i - 1) * gap;
  const secOf = (x, y) => [x < 3 ? 0 : x < 7 ? 1 : 2, y < 3 ? 0 : y < 7 ? 1 : 2];
  const moveBy = (m, dx, dy) => { const o = m.slice(); o[3] += dx; o[7] += dy; return o; };
  const items = V.board_sections[scheme].map(s => ({ glb: s.glb, matrix: moveBy(s.matrix, shift(bnd[s.section][0]), shift(bnd[s.section][1])) }));
  const toXY = (m) => [Math.floor((m[3] + 5 * pitch) / pitch), Math.floor((m[7] + 5 * pitch) / pitch)];
  for (const m of B.crystal_matrices) { const [i, j] = secOf(...toXY(m)); items.push({ glb: B.crystal_glb, matrix: moveBy(m, shift(i), shift(j)) }); }
  for (const p of B.start_pieces) for (const q of p.parts) { const [i, j] = secOf(...toXY(q.matrix)); items.push({ glb: q.glb, matrix: moveBy(q.matrix, shift(i), shift(j)) }); }
  return items;
}
