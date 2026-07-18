'use strict'

import React, {useContext} from 'react'
import {Affinity, AffinityProps} from "./affinity";
import ActionPill, {ActionPillProps} from "./action";
import { useDrop } from "react-dnd";
import {DraggableGiftProps} from "./draggableGift";
import {postAction} from "./ajax";
import {ImageFilterContext} from "./lightColorLogic";

const GIFT_DIGEST_TEMPLATE = `GIVE-giftId-villagerId`

export default function Villager ({ name, imageUrl, affinity, description, preferences, id, actionPill, isGiftReceiver}: VillagerProps): JSX.Element {
  const { backgroundColor, opacity } = useContext(ImageFilterContext)
  const [{isDragging}, dropRef] = useDrop(() => ({
    accept: 'GIFT',
    drop: (item: DraggableGiftProps, monitor) => {
      if (!isGiftReceiver) return

      const digest = GIFT_DIGEST_TEMPLATE.replace('giftId', `${item.giftData.id}`).replace('villagerId',  `${id}`)
      void postAction(digest)
    },
    collect: (monitor) => ({
      isDragging: monitor.getItem() != null,
    })
  }), [isGiftReceiver])

  const highlight = isDragging && isGiftReceiver
  const grayOut = isDragging && !isGiftReceiver
  const ignore = (!isDragging && actionPill == null)

  return (
    <li
      className={`villager ${highlight ? 'highlighted' : ''} ${grayOut ? 'inactive' : ''} ${ignore ? 'gray-on-hover': ''}`}
      key={id}
      data-entity-id={id}
      ref={dropRef}>
      <div className="row">
        <div className="portrait">
          <img src={imageUrl}></img>
          { actionPill != null
            ? <ActionPill {...{...actionPill, backgroundColor, opacity}}></ActionPill>
            : null
          }
          <div className='portrait-filter' style={{ backgroundColor, opacity }}></div>
        </div>
        <div className="column">
          <Affinity {...affinity}></Affinity>
        </div>
      </div>
      <div className="column">
        {preferences?.lovedGifts != null
          ? <div className='loved emoji'>{preferences.lovedGifts}</div>
          : null}
        <span className="name">{name}</span>
        {preferences?.likedGifts != null
          ? <div className='liked emoji'>{preferences.likedGifts}</div>
          : null}
      </div>
      <span className="description">{description}</span>
    </li>
  )
}

type VillagerProps = VillagerData & VillagerExtras

interface VillagerData {
  name: string
  imageUrl: string
  description: string
  preferences?: {
    lovedGifts?: string[]
    likedGifts?: string[]
  }
  id: number
  affinity: AffinityProps
}

interface VillagerExtras {
  actionPill: ActionPillProps
  isGiftReceiver: boolean
}

export { Villager, type VillagerProps, type VillagerData }
