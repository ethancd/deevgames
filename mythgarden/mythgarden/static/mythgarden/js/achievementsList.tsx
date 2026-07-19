import React from 'react'
import RainbowText from "./rainbowText";

function AchievementsList ({ achievements, totalAchievements, show }: AchievementsListProps): JSX.Element {
  if (show) {
    const paddedAchievements = achievements.concat(Array(totalAchievements - achievements.length).fill(null))
    return (
        <ul id='achievements'>
          <li><h2>Achievements {`(${achievements.length} / ${totalAchievements})`}</h2></li>
          {paddedAchievements.map((achievement, n) => {
            return achievement == null
            ? <EmptyAchievement key={`empty-slot-${n}`}></EmptyAchievement>
            : <Achievement {...achievement} key={achievement.id}></Achievement>
          })
          }
        </ul>
    )
  } else {
    return (
     <ul id="achievements" style={{ display: 'none' }}></ul>
    )
  }
}

function Achievement({name, description, emoji, unlockedKnowledge}: AchievementProps): JSX.Element {
  return (
      <li className='achievement'>
        <div className='row'>
          <div className='icon'>{emoji}</div>
          <div className='column'>
            <span className='title'>{name}</span>
            <span className='description'>{description}</span>
          </div>
        </div>
        { unlockedKnowledge != null
          ? <div className='column knowledge'>
              <span className='title'>
                <RainbowText text={'knowledge granted:'} shading={0.2}></RainbowText>
              </span>
            {unlockedKnowledge.map((knowledge) => {
              return <span className='knowledge-description'>{knowledge}</span>
            })}
            </div>
          : null
        }
      </li>
  )
}

function EmptyAchievement (): JSX.Element {
  return (
    <li className="achievement empty-slot">
      <div className='row'>
        <div className="icon">❓</div>
        <div className='column'>
          <span className="title">Unknown</span>
          <span className="description">Not yet unlocked...</span>
        </div>
      </div>
    </li>
  )
}

type AchievementProps = AchievementData

interface AchievementData {
  name: string
  description: string
  emoji: string
  id: number
  unlockedKnowledge?: string[]
}

interface AchievementsListProps {
  achievements: AchievementData[]
  show: boolean
  totalAchievements: number
}

export { AchievementsList, type AchievementData }