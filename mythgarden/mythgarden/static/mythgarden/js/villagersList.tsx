import React from 'react'
import List from "./list";
import colors from "./_colors";
import {Villager, type VillagerData} from "./villager";
import {ActionPillProps} from "./action";
import type {ActionData} from './action'
import {destinationAction} from './touchControls'

function VillagersList ({ villagers, actionDictionary, giftReceiverIds, selectedItemId = null, actions = [], onDetails, id = 'villagers'}: VillagersListProps): JSX.Element {
  return (
      <List id={id} baseColor={colors.whiteYellow}>
        {villagers?.map(villager => {
          const actionPill = actionDictionary[`villager-${villager.id}`]
          const isGiftReceiver = giftReceiverIds.has(villager.id)

          return (
            <Villager {...{...villager, actionPill, isGiftReceiver}} key={villager.id}
                      giftSelected={selectedItemId != null}
                      giftAction={destinationAction(actions, selectedItemId, 'villager', villager.id)}
                      onDetails={onDetails ? () => onDetails(villager) : undefined}></Villager>
          )
        })}
      </List>
  )
}

interface VillagersListProps {
  id?: string
  selectedItemId?: number | null
  actions?: ActionData[]
  onDetails?: (villager: VillagerData) => void
  villagers: VillagerData[]
  actionDictionary: Record<string, ActionPillProps>
  giftReceiverIds: Set<number>
}

export { VillagersList }
