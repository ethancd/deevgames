import React from 'react'
import List from "./list";
import {ActionPillProps} from "./action";
import Item, {ItemData} from "./item";
import EmptyItem from "./emptyItem";
import DraggableGift from "./draggableGift";

const MAX_ITEMS = 6

function ItemsList ({ items, id, baseColor, actionDictionary, giftable }: ItemsListProps): JSX.Element {
  const paddedItems = items.concat(Array(MAX_ITEMS - items.length).fill(null))

  return (
      <List id={id} baseColor={baseColor}>
        {paddedItems.map((item, n) => {
          if (item == null) {
            return (
              <EmptyItem key={`empty-slot-${n}`}></EmptyItem>
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
                <Item {...{...item, actionPill}}></Item>
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
  items: ItemData[]
  id: string
  baseColor: string
  actionDictionary: Record<string, ActionPillProps>
  giftable: boolean
}

export { ItemsList }