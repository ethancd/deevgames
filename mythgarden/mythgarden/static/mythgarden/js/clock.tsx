'use strict'

import React from 'react'

import {type HeroData} from './hero'
import RainbowText from "./rainbowText";

const LATE_WARNING_TIME = 20 * 60
const VERY_LATE_WARNING_TIME = 22 * 60
const VERY_VERY_LATE_WARNING_TIME = 23.5 * 60

const BONUS_WARNING_TIME = 2 * 60
const MAJOR_BONUS_WARNING_TIME = 2.5 * 60
const END_BONUS_TIME = 3 * 60

export default function Clock ({ dayDisplay, timeDisplay, time, dayNumber}: ClockProps): JSX.Element {
  function getDayIntensity(dayNumber: number) {
    // dayNumber is index 0, right? right.
    if (dayNumber <= 2) return ''
    if (dayNumber == 3) return 'mild'
    if (dayNumber == 4) return 'moderate'
    if (dayNumber == 5) return 'severe'
    if (dayNumber == 6) return 'final'

    return ''
  }

  function getLateness(time: number) {
    if (time >= VERY_VERY_LATE_WARNING_TIME) return 'very-very-late'
    if (time >= VERY_LATE_WARNING_TIME) return 'very-late'
    if (time >= LATE_WARNING_TIME) return 'late'

    if (time < END_BONUS_TIME) {
      if (time >= MAJOR_BONUS_WARNING_TIME) return 'major-bonus-warning'
      if (time >= BONUS_WARNING_TIME ) return 'bonus-warning'
    }
    return ''
  }

  const dayIntensity = getDayIntensity(dayNumber)
  const lateness = getLateness(time)
  const isBonusTime = time < END_BONUS_TIME

  return (
      <div id="clock">
        <div className={`day ${dayIntensity}`}>{dayDisplay}</div>
        <div className={`time ${lateness}`}>
          { isBonusTime ? <RainbowText text={timeDisplay}></RainbowText> : timeDisplay}
        </div>
      </div>
  )
}

interface ClockData {
  dayDisplay: string
  timeDisplay: string
  time: number
  dayNumber: number
}

type ClockProps = ClockData

export { Clock, type ClockData }
