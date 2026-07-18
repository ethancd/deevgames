import RainbowText from "./rainbowText";
import React from "react";
import {HeroData} from "./hero";

export default function BonusStats ({ boostLevel, luckPercent }: BonusStatsProps): JSX.Element {
  return (
    <>
      {boostLevel > 0
        ? <div id="boost">Time Boost lvl <strong>{boostLevel}</strong></div>
        : null
      }
      {
        luckPercent != ''
          ? <div id='luck-percent'>{`+${luckPercent}`} <RainbowText text={'luck'} shading={0.35}></RainbowText></div>
          : null
      }
    </>
  )
}

type BonusStatsProps = Pick<HeroData, 'boostLevel'|'luckPercent'>