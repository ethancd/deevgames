/**
 * EMBER — render palette (src/render/palette.ts).
 *
 * Every color the renderer uses lives here as a named constant, sampled from
 * the reference renders' feel (ember/reference/night-defend.png,
 * ember/reference/day-explore.png): dusk indigo/teal night, warm greens by
 * day, burnt-orange ember, cream speech bubble. Kept in one file so a later
 * judge/tuning pass can retint without touching drawing logic.
 */

export const TILE_PX = 16;

export const PALETTE = {
  tiles: {
    grass: ['#3c6e46', '#417a4b', '#386541', '#457f4f'],
    grassFlower: ['#e0c34f', '#c9739a', '#8fb7e0'],
    forestFloor: '#2f5a3a',
    forestCanopy: ['#1f4d33', '#245b3a', '#1a4530', '#2a6440'],
    forestTrunk: '#4a2f1c',
    rockBase: ['#6b6f76', '#5e626a', '#75797f', '#54585f'],
    rockHighlight: '#8a8e94',
    rockShadow: '#3f4247',
    waterBase: ['#204a63', '#255574', '#1c4359'],
    waterRipple: '#3f7fa0',
    denRock: '#4d4a52',
    denRockDark: '#332f38',
    denMouth: '#0a0810',
  },
  deadwood: {
    log: '#5a3a24',
    logShadow: '#3c2718',
    logHighlight: '#7a5334',
  },
  sunpatch: {
    core: '#f4d35e',
    glow: 'rgba(244, 211, 94, 0.35)',
  },
  ember: {
    // brightness/saturation scale toward these as fuel -> 1; a dim ember
    // (low fuel) is pulled toward `dim` in ember.ts.
    core: '#fff3d6',
    hot: '#ffb648',
    warm: '#e2701f',
    dim: '#5c3319',
    spark: '#ffcf7a',
  },
  wolf: {
    fur: '#0c0c10',
    furLit: '#1c1a20',
    eye: '#d8f6ff',
    eyeAttack: '#ff5a3c',
  },
  glow: {
    // radial gradient stops from ember-adjacent (warm) to night (cold).
    inner: 'rgba(255, 214, 140, 0.85)',
    mid: 'rgba(255, 150, 60, 0.28)',
    outer: 'rgba(255, 150, 60, 0)',
  },
  night: {
    // Cold indigo/blue-violet, high opacity: blended over green grass/forest
    // tiles this still needs to read as near-black-indigo (reference:
    // ~#000309), not the teal-green a lower-opacity/greener-leaning value
    // lets bleed through.
    overlay: 'rgba(4, 4, 18, 0.93)',
    tint: 'rgba(14, 16, 40, 0.5)',
  },
  day: {
    tint: 'rgba(255, 244, 214, 0.08)',
  },
  rain: {
    streak: 'rgba(180, 205, 224, 0.45)',
  },
  path: {
    dot: '#e0a458',
    dotShadow: 'rgba(20, 14, 6, 0.5)',
  },
  bubble: {
    bg: '#f4ecd8',
    border: '#1a1512',
    text: '#1a1512',
  },
} as const;
