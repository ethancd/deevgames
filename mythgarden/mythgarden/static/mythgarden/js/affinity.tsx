'use strict'

import React from 'react'

const STATIC_PREFIX = '/static/mythgarden/images/'

export default function Affinity({wholeHearts, extraHeartFraction, maxHearts}: AffinityProps): JSX.Element {
  function calcEmptyHearts() {
    const nonEmptyHearts = extraHeartFraction > 0 ? wholeHearts + 1 : wholeHearts;

    return maxHearts - nonEmptyHearts
  }

  const emptyHearts = calcEmptyHearts()
  const redPath = STATIC_PREFIX + 'red-heart.png'
  const maroonPath = STATIC_PREFIX + 'maroon-heart.png'
  const blackPath = STATIC_PREFIX + 'black-heart.png'
  const height = `${extraHeartFraction * 100}%`

  return (
    <span className='affinity-container'>
      {[...Array(wholeHearts)].map((_, i) => <span className='heart' key={i}><img
        src={redPath}></img></span>)}

      {extraHeartFraction > 0
        ? <span className='partial-container' key='partial'>
            <span className='heart partial' style={{height}}><img src={maroonPath}></img></span>
            <span className='heart'><img src={blackPath}></img></span>
          </span>
        : null
      }

      {[...Array(emptyHearts)].map((_, j) => <span className='heart' key={maxHearts - j}><img
        src={blackPath}></img></span>)}
    </span>
  )
}

interface AffinityProps {
  wholeHearts: number
  extraHeartFraction: number
  maxHearts: number
}

export {Affinity, type AffinityProps}
