import React from 'react'
import List from "./list";
import colors from "./_colors";
import {Villager, type VillagerData} from "./villager";
import {ActionPillProps} from "./action";

function VillagersList ({ villagers, actionDictionary, giftReceiverIds}: VillagersListProps): JSX.Element {
  return (
      <List id='villagers' baseColor={colors.whiteYellow}>
        {villagers?.map(villager => {
          const actionPill = actionDictionary[`villager-${villager.id}`]
          const isGiftReceiver = giftReceiverIds.has(villager.id)

          return (
            <Villager {...{...villager, actionPill, isGiftReceiver}} key={villager.id}></Villager>
          )
        })}
      </List>
  )
}

interface VillagersListProps {
  villagers: VillagerData[]
  actionDictionary: Record<string, ActionPillProps>
  giftReceiverIds: Set<number>
}

export { VillagersList }