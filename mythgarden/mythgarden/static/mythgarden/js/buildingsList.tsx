import React from 'react'
import List from "./list";
import {ActionPillProps} from "./action";
import colors from "./_colors";
import Building, {type BuildingData} from "./building";

function BuildingsList ({ buildings, actionDictionary, time}: BuildingsListProps): JSX.Element {
  function isBuildingOpen(building: BuildingData, time: number) {
    if (building.openingTime == null || building.closingTime == null) {
      return true
    } else {
      return building.openingTime <= time && time < building.closingTime
    }
  }

  return (
      <List id='buildings' baseColor={colors.lavenderPurpleTranslucent}>
        {buildings.map(building => {
          const actionPill = actionDictionary[`place-${building.id}`]
          const isOpen = isBuildingOpen(building, time)
          return (
            <Building {...{...building, actionPill, isOpen}} key={building.id}></Building>
          )
        })}
      </List>
  )
}

interface BuildingsListProps {
  buildings: BuildingData[]
  actionDictionary: Record<string, ActionPillProps>
  time: number
}

export { BuildingsList }