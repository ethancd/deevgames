/**
 * Lighting utilities for time-of-day tinting and cloud dimming.
 * Used by both the surface overlay and underground hole light shafts.
 */

/** Linearly interpolate between two hex colors channel-by-channel. */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff
  const ag = (a >> 8) & 0xff
  const ab = a & 0xff
  const br = (b >> 16) & 0xff
  const bg = (b >> 8) & 0xff
  const bb = b & 0xff
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const blue = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | blue
}

/**
 * Returns the multiply-overlay tint color for a given timeOfDay (0.0-1.0).
 *
 * | Phase              | timeOfDay     | Color                          |
 * |--------------------|---------------|--------------------------------|
 * | Midnight/darkness  | 0.00 - 0.15   | 0x1a1a3a                       |
 * | Pre-dawn           | 0.15 - 0.25   | lerp 0x1a1a3a -> 0x7a5a4a      |
 * | Sunrise            | 0.25 - 0.35   | lerp 0x7a5a4a -> 0xffddaa      |
 * | Morning -> Noon    | 0.35 - 0.50   | lerp 0xffddaa -> 0xffffff      |
 * | Noon -> Afternoon  | 0.50 - 0.65   | 0xffffff                       |
 * | Sunset             | 0.65 - 0.75   | lerp 0xffffff -> 0xff9966      |
 * | Twilight           | 0.75 - 0.85   | lerp 0xff9966 -> 0x3a3a6a      |
 * | Night              | 0.85 - 1.00   | lerp 0x3a3a6a -> 0x1a1a3a      |
 */
export function getTimeOfDayTint(timeOfDay: number): number {
  const t = ((timeOfDay % 1.0) + 1.0) % 1.0 // clamp to [0,1)

  if (t < 0.15) {
    return 0x1a1a3a
  } else if (t < 0.25) {
    return lerpColor(0x1a1a3a, 0x7a5a4a, (t - 0.15) / 0.10)
  } else if (t < 0.35) {
    return lerpColor(0x7a5a4a, 0xffddaa, (t - 0.25) / 0.10)
  } else if (t < 0.50) {
    return lerpColor(0xffddaa, 0xffffff, (t - 0.35) / 0.15)
  } else if (t < 0.65) {
    return 0xffffff
  } else if (t < 0.75) {
    return lerpColor(0xffffff, 0xff9966, (t - 0.65) / 0.10)
  } else if (t < 0.85) {
    return lerpColor(0xff9966, 0x3a3a6a, (t - 0.75) / 0.10)
  } else {
    return lerpColor(0x3a3a6a, 0x1a1a3a, (t - 0.85) / 0.15)
  }
}

/**
 * Apply cloud dimming to a base tint color.
 * - Reduces brightness by up to 30% at full cloud coverage.
 * - Shifts color toward blue-gray (0x8899aa) by up to 20%.
 */
export function getCloudedTint(baseTint: number, cloudFactor: number): number {
  if (cloudFactor <= 0) return baseTint

  const cf = Math.min(cloudFactor, 1.0)

  // Darken by up to 30%
  const dimScale = 1.0 - cf * 0.3
  let r = ((baseTint >> 16) & 0xff) * dimScale
  let g = ((baseTint >> 8) & 0xff) * dimScale
  let b = (baseTint & 0xff) * dimScale

  // Blend toward blue-gray 0x8899aa by cloudFactor * 0.2
  const blendAmt = cf * 0.2
  r = r * (1 - blendAmt) + 0x88 * blendAmt
  g = g * (1 - blendAmt) + 0x99 * blendAmt
  b = b * (1 - blendAmt) + 0xaa * blendAmt

  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

/**
 * Returns the alpha for hole light shafts based on whether it's day or night.
 * Daytime ~0.4, nighttime ~0.1, with smooth transitions at dawn/dusk.
 */
export function getHoleLightAlpha(timeOfDay: number): number {
  const t = ((timeOfDay % 1.0) + 1.0) % 1.0
  // Roughly day from 0.25–0.75, with transitions
  if (t < 0.20) return 0.1
  if (t < 0.30) return 0.1 + (t - 0.20) / 0.10 * 0.3   // 0.1 -> 0.4
  if (t < 0.70) return 0.4
  if (t < 0.80) return 0.4 - (t - 0.70) / 0.10 * 0.3   // 0.4 -> 0.1
  return 0.1
}
