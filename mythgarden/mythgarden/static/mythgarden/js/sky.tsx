'use strict'

import React, {useState} from 'react'
import { type ClockData } from './clock'
import useAnimationFrame from "./useAnimationFrame";

const SUNRISE = 6 * 60
const SUNSET = 18 * 60
const TIME_IN_2_HOURS = 2 * 60
const TIME_IN_12_HOURS = SUNSET - SUNRISE
const TIME_IN_24_HOURS = 24 * 60

const TWILIGHT_LENGTH = 90
const TRUE_DAWN = SUNRISE - TWILIGHT_LENGTH
const TRUE_NIGHT = SUNSET + TWILIGHT_LENGTH

const MOON_HI = SUNSET - 30
const MOON_BYE = SUNRISE

const PHASE_WIDTH_STEP = 0.08 // ~ 1 / 14 – aka how big of steps to take to move from 1 to 0 in 14 days
const INITIAL_PHASE_WIDTH = PHASE_WIDTH_STEP * 6 // this way, the final day will have phase-width = 0 aka half moon

const MS_TO_GAME_MINUTES_RATIO = 0.12

function Sky ({ time, dayNumber }: Pick<ClockData, 'time' | 'dayNumber'>): JSX.Element | null {
  const [gameTime, setGameTime] = useState(time)
  const [gameDay, setGameDay] = useState(dayNumber)

  const shouldSpeedUp = (time: number, gameTime: number, dayNumber: number, gameDay: number) => {
    return (dayNumber != gameDay) || Math.abs(time - gameTime) >= TIME_IN_2_HOURS
  }

  const tickTimeForward = (deltaInMs: number) => {
    let gameTimeToAdd = deltaInMs * MS_TO_GAME_MINUTES_RATIO
    if (shouldSpeedUp(time, gameTime, dayNumber, gameDay)) {
      gameTimeToAdd *= 6
    }

    let newTime = gameTime + gameTimeToAdd
    if (newTime > TIME_IN_24_HOURS) {
      setGameDay(gameDay + 1)
      newTime -= TIME_IN_24_HOURS
    }

    if (dayNumber > gameDay) {
      setGameTime(newTime)
    } else {
      setGameTime(Math.min(newTime, time))
    }
  }

  const tickTimeBackward = (deltaInMs: number) => {
    let gameTimeToDock = deltaInMs * MS_TO_GAME_MINUTES_RATIO
    if (shouldSpeedUp(time, gameTime, dayNumber, gameDay)) {
      gameTimeToDock *= 36
    }

    let newTime = gameTime - gameTimeToDock
    if (newTime < 0) {
      setGameDay(gameDay - 1)
      newTime += TIME_IN_24_HOURS
    }

    if (dayNumber < gameDay) {
      setGameTime(newTime)
    } else {
      setGameTime(Math.max(newTime, time))
    }
  }

  useAnimationFrame(deltaInMs => {
    const sameDay = dayNumber == gameDay
    const sameTime = time == gameTime

    if (sameDay && sameTime) return

    if (dayNumber > gameDay || (sameDay && time > gameTime)) {
      tickTimeForward(deltaInMs)
    }

    if (dayNumber < gameDay || (sameDay && time < gameTime)) {
      tickTimeBackward(deltaInMs)
    }

  }, [time, gameTime, dayNumber, gameDay])

  return (
    <div id='sky-container'>
        <Sun time={gameTime}></Sun>
        <Moon time={gameTime} dayNumber={dayNumber}></Moon>
    </div>
  )
}

const getThetaFromTime = (time: number, zeroPoint: number): number => (zeroPoint + 2 - time/TIME_IN_12_HOURS) % 2 * Math.PI
const getX = (theta: number): number => Math.cos(theta)/2 + 0.5
const getY = (theta: number): number => Math.sin(theta)
const getPercent = (n: number): string => `${n * 100}%`

function Sun ({ time }: Pick<ClockData, 'time'>): JSX.Element | null {
  const isSunVisible = (time: number) => time > TRUE_DAWN && time < TRUE_NIGHT

  const theta = getThetaFromTime(time, 3/2)
  const x = getX(theta)
  const y = getY(theta)

  return (isSunVisible(time))
    ? <div id="sun" style={{ left: getPercent(x), bottom: getPercent(y) }}></div>
    : null
}

function Moon ({ time, dayNumber }: Pick<ClockData, 'time' | 'dayNumber'>): JSX.Element | null {
  const isMoonVisible = (time: number) => time < MOON_BYE || time > MOON_HI

  function getPhaseWidth (dayNumber: number): number {
    return INITIAL_PHASE_WIDTH - (PHASE_WIDTH_STEP * dayNumber)
  }

  const theta = getThetaFromTime(time, 1/2)
  const x = getX(theta)
  const y = getY(theta)
  const phaseWidth = getPhaseWidth(dayNumber)

  return (isMoonVisible(time))
    ? <div id="moon" style={{ left: getPercent(x), bottom: getPercent(y) }}>
        <div id="darkside"></div>
        <div id="ellipse" style={{ width: getPercent(phaseWidth) }}></div>
      </div>
    : null
}

export {
  Sky,
  Sun,
  Moon
}
