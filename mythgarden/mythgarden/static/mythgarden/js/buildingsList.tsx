import React from 'react'
import List from "./list";
import {ActionPillProps} from "./action";
import colors from "./_colors";
import Building, {type BuildingData} from "./building";

function BuildingsList ({ buildings, actionDictionary, time}: BuildingsListProps): JSX.Element {
  return (
      <List id='buildings' baseColor={colors.lavenderPurpleTranslucent}>
        {buildings.map(building => {
          const actionPill = actionDictionary[`place-${building.id}`]
          // The server accounts for the current run's building-hours option.
          const isOpen = actionPill != null
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
