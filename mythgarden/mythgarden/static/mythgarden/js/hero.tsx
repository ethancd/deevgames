'use strict'

import React, {useContext} from 'react'
import TypeableName from "./typeableName";
import {ImageFilterContext} from "./lightColorLogic";
import RainbowText from "./rainbowText";
import {AchievementData} from "./achievementsList";

export default function Hero ({ name, isDefaultName, imageUrl, score, highScore, koinEarned, heartsEarned, mytheggsFound, achievementsCount, totalAchievements }: HeroProps): JSX.Element {
  const { backgroundColor, opacity } = useContext(ImageFilterContext)

  return (
    <div id="hero">
      <div className="portrait hero-portrait">
        <img src={imageUrl}></img>
        <div className='portrait-filter' style={{ backgroundColor, opacity }}></div>
        <div className='achievements-pill'><span>🏆</span> <span>({achievementsCount}/{totalAchievements})</span></div>
      </div>
      <div className="column">
        <TypeableName {...{ name, isDefaultName }}></TypeableName>
        {highScore > 0 ? <span id='high-score'> High Score: {highScore}</span> : null }
        <div id="score">
          <span className='total-score'>{score}</span>
          <span>
            (⚜️{koinEarned} x {heartsEarned}❤️{mytheggsFound > 0
              ? <span> +{mytheggsFound *10}%🥚<RainbowText text={'bonus'} shading={0.4}></RainbowText></span>
              : null
            })
          </span>
        </div>
      </div>
    </div>
  )
}

interface HeroData {
  name: string
  isDefaultName: boolean
  imageUrl: string
  score: number
  highScore: number
  koinEarned: number
  heartsEarned: number
            mytheggsFound: number
  boostLevel: number
  luckPercent: string
  achievementsCount: number
}

interface HeroExtras {
  totalAchievements: number
}

type HeroProps = Omit<HeroData, 'boostLevel'|'luckPercent'> & HeroExtras

export { Hero, type HeroData, type HeroProps }
