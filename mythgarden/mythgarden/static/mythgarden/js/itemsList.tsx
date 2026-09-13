import React from 'react'
import List from "./list";
import {ActionPillProps} from "./action";
import Item, {ItemData} from "./item";
import EmptyItem from "./emptyItem";
import DraggableGift from "./draggableGift";
import {arrangeSlots} from './touchControls'

const MAX_ITEMS = 6

function ItemsList ({ items, id, baseColor, actionDictionary, giftable, touchUi = false, selectedItemId, destination, destinationLabel, destinationAvailable, placements, children }: React.PropsWithChildren<ItemsListProps>): JSX.Element {
  const paddedItems = arrangeSlots(items, placements)

  return (
      <List id={id} baseColor={baseColor}>
        {children}
        {paddedItems.map((item, n) => {
          if (item == null) {
            return (
              <EmptyItem key={`empty-slot-${n}`} destination={destination} label={destinationLabel} available={destinationAvailable} slotIndex={n}></EmptyItem>
            )
          }

          const actionPill = actionDictionary[`item-${item.id}`]

          if (giftable) {
            const giftActionPill = actionDictionary[`gift-${item.id}`]
            const { name, emoji, id, rarity } = item;
            return (
              <DraggableGift giftData={{ name, emoji, id, rarity }}
                             giftActionPill={giftActionPill}
                            key={`${id}-draggable`}
              >
                <Item {...item} actionPill={touchUi ? undefined : actionPill} price={touchUi ? undefined : item.price} selectable={touchUi} selected={selectedItemId === item.id}></Item>
              </DraggableGift>
            )
          } else {
            return (
              <Item {...{...item, actionPill}} key={item.id}></Item>
            )
          }
        })}
      </List>
  )
}

interface ItemsListProps {
  placements?: Record<number, number>
  touchUi?: boolean
  selectedItemId?: number | null
  destination?: 'soil' | 'storage'
  destinationLabel?: string
  destinationAvailable?: boolean
  items: ItemData[]
  id: string
  baseColor: string
  actionDictionary: Record<string, ActionPillProps>
  giftable: boolean
}

export { ItemsList }
