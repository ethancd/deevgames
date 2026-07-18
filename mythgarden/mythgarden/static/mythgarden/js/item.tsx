'use strict'

import React, {useContext} from 'react'

import ActionPill, {ActionPillProps} from "./action";
import {ImageFilterContext} from "./lightColorLogic";
import RainbowText from "./rainbowText";

const RAINBOW = 'RAINBOW'

export default function Item ({ name, emoji, id, rarity, price, hasBeenWatered, mythlingType, quantity, actionPill, style}: ItemProps): JSX.Element {
  const { backgroundColor, opacity } = useContext(ImageFilterContext)

  const getNameLength = (string: string) => {
    const wordCount = string.split(/[ -]/).length
    const letterCount = string.length

    if (wordCount == 1 && letterCount < 10) return 'short'
    if (wordCount == 2 || (letterCount >= 10 && letterCount < 20)) return 'long'
    if (wordCount >= 3 || (letterCount >= 20)) return 'very-long'
  }

  const isRainbowEgg = mythlingType != null && mythlingType == RAINBOW

  return (
        <li
            className={`item ${rarity}${hasBeenWatered ? ' watered' : ''}`}
            key={id}
            data-entity-id={id}
            style={style}
        >
            <span className={`type ${ mythlingType != null ? mythlingType.toLowerCase() : ''}`}>{emoji}</span>
            {quantity != null ? <span className='quantity'>x{quantity}</span> : null}
            <span className={`name ${getNameLength(name)} ${ mythlingType != null ? mythlingType.toLowerCase() : ''}`}>{
              isRainbowEgg ? <RainbowText text={name} shading={0.5}></RainbowText> : name
            }</span>
            { actionPill != null
              ? <ActionPill {...actionPill}></ActionPill>
              : price != null
                ? <div className='price-pill'>⚜️{price}</div>
                : null
            }
            <div className='item-filter' style={{backgroundColor, opacity}}></div>
        </li>
  )
}

type ItemProps = ItemData & ItemExtras

interface ItemData {
  name: string
  emoji: string
  id: number
  rarity: string
  price?: number
  hasBeenWatered?: boolean
  quantity?: number
  mythlingType?: string
}

interface ItemExtras {
  actionPill?: ActionPillProps
  style?: React.CSSProperties
}

export { Item, type ItemData }
