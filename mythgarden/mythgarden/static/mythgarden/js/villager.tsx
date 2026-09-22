'use strict'

import React, {useContext} from 'react'
import {Affinity, AffinityProps} from "./affinity";
import ActionPill, {ActionPillProps} from "./action";
import { useDrop } from "react-dnd";
import {DraggableGiftProps} from "./draggableGift";
import {postAction} from "./ajax";
import {ImageFilterContext} from "./lightColorLogic";
import {activateOnKey, actionCost} from './touchControls'
import {SceneRect} from './sceneLayout'

const GIFT_DIGEST_TEMPLATE = `GIVE-giftId-villagerId`

export default function Villager ({ name, imageUrl, affinity, description, preferences, id, actionPill, isGiftReceiver, giftSelected = false, giftAction, onDetails, scenePosition}: VillagerProps): JSX.Element {
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

  const highlight = (isDragging && isGiftReceiver) || (giftSelected && giftAction != null)
  const grayOut = (isDragging && !isGiftReceiver) || (giftSelected && giftAction == null)
  const ignore = (!isDragging && !giftSelected && actionPill == null)
  const displayedAction = giftSelected ? giftAction : actionPill

  return (
    <li
      className={`villager ${highlight ? 'highlighted valid-destination' : ''} ${grayOut ? 'inactive' : ''} ${ignore ? 'gray-on-hover': ''}`}
      role="button" tabIndex={0} onKeyDown={activateOnKey}
      aria-label={`${giftSelected ? 'Give selected item to' : 'Talk to'} ${name}${displayedAction ? `, ${actionCost(displayedAction)}` : ', unavailable'}`}
      key={id}
      data-entity-id={id}
      style={scenePosition ? {left: scenePosition.x, top: scenePosition.y, width: scenePosition.width, height: scenePosition.height} : undefined}
      ref={dropRef}>
      <div className="row">
        <div className="portrait">
          <img src={imageUrl} alt=""></img>
          { displayedAction != null
            ? <ActionPill {...{...displayedAction, backgroundColor, opacity}}></ActionPill>
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
      {onDetails && <button className="villager-details" type="button" aria-label={`About ${name}`} onClick={event => {event.stopPropagation(); onDetails()}}>ⓘ</button>}
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
  scenePosition?: SceneRect
  giftSelected?: boolean
  giftAction?: ActionPillProps
  onDetails?: () => void
  actionPill: ActionPillProps
  isGiftReceiver: boolean
}

export { Villager, type VillagerProps, type VillagerData }
