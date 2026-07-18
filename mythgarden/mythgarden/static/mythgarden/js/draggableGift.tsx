'use strict'

import React from 'react'
import { useDrag } from 'react-dnd'
import { usePreview } from 'react-dnd-preview'
import Item, {ItemData} from "./item";
import {ActionPillProps} from "./action";

export default function DraggableGift ({ giftData, giftActionPill, left = 0, top = 0, children }: React.PropsWithChildren<DraggableGiftProps>): JSX.Element {
  const [{ isDragging }, dragRef] = useDrag(
    () => ({
      type: 'GIFT',
      item: { giftData, giftActionPill, left, top },
      collect: (monitor) => ({
        isDragging: monitor.isDragging(),
      }),
    }),
    [giftData, left, top],
  )

  return (
    <div
      className="draggable-gift"
      ref={dragRef}
      style={{ position: 'relative', left, top }}
    >
      {children}
    </div>
  )
}

const GiftPreview = () => {
  const preview = usePreview()
  if (!preview.display) {
    return null
  }

  const {itemType, style} = preview
  const item = preview.item as DraggableGiftProps

  if (itemType !== 'GIFT') return null

  const giftData = item.giftData as GiftData
  const giftActionPill = item.giftActionPill as ActionPillProps

  return (
    <Item {...giftData} actionPill={giftActionPill} style={style}></Item>
  )
}

type GiftData = Pick<ItemData, 'id'|'name'|'rarity'|'emoji'>

interface DraggableGiftProps {
  giftData: GiftData
  giftActionPill: ActionPillProps
  left?: number
  top?: number
}

export { DraggableGift, GiftPreview, type DraggableGiftProps }
