import Color from 'color'
import { createContext } from 'react'

const SUNRISE = 6 * 60
const SUNSET = 18 * 60

const TWILIGHT_LENGTH = 90
const TRUE_DAWN = SUNRISE - TWILIGHT_LENGTH
const TRUE_NIGHT = SUNSET + TWILIGHT_LENGTH

const GOLDEN_HOUR_LENGTH = 2 * 60 // might look nicer for golden "hour" to last longer than 60min
const END_MORNING_GOLDEN_HOUR = SUNRISE + GOLDEN_HOUR_LENGTH
const START_EVENING_GOLDEN_HOUR = SUNSET - GOLDEN_HOUR_LENGTH

const HORIZON_KELVIN = 1900
const DAYLIGHT_KELVIN = 6500
const MOONLIGHT_KELVIN = 4100

const HORIZON_LUX = 400
const DAYLIGHT_LUX = 20000
const MOONLIGHT_LUX = 10

const MAX_SHADING = 0.75
const MIX_RATIO = 0.1

const MAX_FILTER_OPACITY = 0.5;

enum DaySegment {
  Predawn = 'predawn',
  Morning = 'morning',
  Midday = 'midday',
  Evening = 'evening',
  Twilight = 'twilight',
  Night = 'night'
}

interface ColorFilter {
  shadeBy: number
  rgbTemperature: number[]
  mixRatio: number
}

const getImageFilter = function (colorFilter: ColorFilter) {
  const backgroundColor = Color.rgb(colorFilter.rgbTemperature).darken(colorFilter.shadeBy).hex()
  const opacity = Math.min(colorFilter.shadeBy, MAX_FILTER_OPACITY)

  return {
    backgroundColor,
    opacity,
  }
}

// eslint-disable-next-line @typescript-eslint/ban-types
const filterFuncFactory = function (colorFilter: ColorFilter): Function {
  return function (baseColor: string): string {
    const { shadeBy, rgbTemperature, mixRatio } = colorFilter

    const color = Color(baseColor)

    const baseAlpha = color.alpha()
    const baseLightness = color.lightness()
    const lightColor = Color.rgb(rgbTemperature)

    return color.mix(lightColor, mixRatio).lightness(baseLightness).darken(shadeBy).alpha(baseAlpha).hexa()
  }
}

const defaultFilter = {
  shadeBy: 0,
  rgbTemperature: [255, 255, 255],
  mixRatio: 0.5
}

const defaultFilterStyle = {
  backgroundColor: '#fff',
  opacity: 0,
}

const defaultFilterFn = filterFuncFactory(defaultFilter)

const ImageFilterContext = createContext(defaultFilterStyle)
const FilterizeColorContext = createContext(defaultFilterFn)

function getColorFilterByTime (time: number): ColorFilter {
  const kelvin = getKelvinByTime(time)
  const lux = getLuxByTime(time)

  const rgbTemperature = convertKelvinToRGB(kelvin)
  const shadeBy = convertLuxToShadeBy(lux)

  return { rgbTemperature, shadeBy, mixRatio: MIX_RATIO }
}

function getKelvinByTime (time: number): number {
  const daySegment = getDaySegment(time)

  if (daySegment === DaySegment.Predawn) {
    throw new Error("Not yet implemented! --thx, sky god")
  }

  if (daySegment === DaySegment.Morning) {
    return pointInRange(DAYLIGHT_KELVIN, HORIZON_KELVIN, (time - SUNRISE) / GOLDEN_HOUR_LENGTH)
  }

  if (daySegment === DaySegment.Midday) return DAYLIGHT_KELVIN

  if (daySegment === DaySegment.Evening) {
    return pointInRange(DAYLIGHT_KELVIN, HORIZON_KELVIN, (SUNSET - time) / GOLDEN_HOUR_LENGTH)
  }

  if (daySegment === DaySegment.Twilight) {
    return pointInRange(MOONLIGHT_KELVIN, HORIZON_KELVIN, (TRUE_NIGHT - time) / TWILIGHT_LENGTH)
  }

  if (daySegment === DaySegment.Night) return MOONLIGHT_KELVIN

  throw new Error('daySegment not caught by conditionals')
}

function getLuxByTime (time: number): number {
  const daySegment = getDaySegment(time)

  if (daySegment === DaySegment.Predawn) {
    throw new Error("Not yet implemented! --thx, sky god")
  }

  if (daySegment === DaySegment.Morning) {
    return pointInRange(DAYLIGHT_LUX, HORIZON_LUX, (time - SUNRISE) / GOLDEN_HOUR_LENGTH)
  }

  if (daySegment === DaySegment.Midday) return DAYLIGHT_LUX

  if (daySegment === DaySegment.Evening) {
    return pointInRange(DAYLIGHT_LUX, HORIZON_LUX, (SUNSET - time) / GOLDEN_HOUR_LENGTH)
  }

  if (daySegment === DaySegment.Twilight) {
    return pointInRange(HORIZON_LUX, MOONLIGHT_LUX, (TRUE_NIGHT - time) / TWILIGHT_LENGTH)
  }

  if (daySegment === DaySegment.Night) return MOONLIGHT_LUX

  throw new Error('daySegment not caught by conditionals')
}

function getDaySegment (time: number): DaySegment {
  if (time >= TRUE_DAWN && time < SUNRISE) return DaySegment.Predawn
  if (time >= SUNRISE && time < END_MORNING_GOLDEN_HOUR) return DaySegment.Morning
  if (time >= END_MORNING_GOLDEN_HOUR && time < START_EVENING_GOLDEN_HOUR) return DaySegment.Midday
  if (time >= START_EVENING_GOLDEN_HOUR && time < SUNSET) return DaySegment.Evening
  if (time >= SUNSET && time < TRUE_NIGHT) return DaySegment.Twilight
  if (time >= TRUE_NIGHT || time < TRUE_DAWN) return DaySegment.Night

  throw new Error('time not caught by getDaySegment conditionals')
}

function pointInRange (max: number, min: number, fraction: number): number {
  return ((max - min) * fraction) + min
}

function convertKelvinToRGB (kelvin: number): number[] {
  // algorithm and constants based on
  // https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html
  const red = getRedFromKelvin(kelvin)
  const green = getGreenFromKelvin(kelvin)
  const blue = getBlueFromKelvin(kelvin)

  return [red, green, blue]
}

function getRedFromKelvin (kelvin: number): number {
  if (kelvin <= 6600) return 255

  const red = 330 * ((kelvin / 100 - 60) ^ -0.133)

  if (red < 0) return 0
  if (red > 255) return 255
  return Math.round(red)
}

function getGreenFromKelvin (kelvin: number): number {
  let green
  if (kelvin <= 6600) {
    green = (100 * Math.log(kelvin / 100)) - 161
  } else {
    green = 288 * ((kelvin / 100 - 60) ^ -0.075)
  }

  if (green < 0) return 0
  if (green > 255) return 255
  return Math.round(green)
}

function getBlueFromKelvin (kelvin: number): number {
  if (kelvin >= 6600) return 255
  if (kelvin <= 1900) return 0

  const blue = (138 * Math.log(kelvin / 100 - 10)) - 305

  if (blue < 0) return 0
  if (blue > 255) return 255
  return Math.round(blue)
}

function convertLuxToShadeBy (lux: number): number {
  // use log scale for light to reflect how perception works
  const logMax = Math.log2(DAYLIGHT_LUX)
  const logMin = Math.log2(MOONLIGHT_LUX)
  const logLux = Math.log2(lux)

  const logRange = logMax - logMin
  const amountAboveMin = logLux - logMin
  const fractionThrough = amountAboveMin / logRange

  // get brightness from 0 (dark of night) to 1 (midday)
  const brightness = pointInRange(1, 0, fractionThrough)

  // get decimal to shade by, from ~.9 (dark of night) to ~.45 (sunset) to 0 (midday)
  return MAX_SHADING - (brightness * MAX_SHADING)
}

export {
  ImageFilterContext,
  FilterizeColorContext,
  filterFuncFactory,
  getColorFilterByTime,
  getImageFilter,
  type ColorFilter
}
