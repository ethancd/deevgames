'use strict'

import React from 'react'
import ActionPill, {ActionPillProps} from "./action";

export default function Building ({ id, imageUrl, coords, actionPill, isOpen}: BuildingProps): JSX.Element {
  return (
        <li
          className={`building over-${coords.over} down-${coords.down} ${!isOpen ? 'inactive' : ''}`}
          key={id}
          data-entity-id={id}
        >
          <img src={imageUrl}></img>
          { actionPill
            ? <ActionPill {...actionPill}></ActionPill>
            : null
          }
        </li>
  )
}

type BuildingProps = Omit<BuildingData, 'name'|'openingTime'|'closingTime'|'openingTimeDisplay'|'closingTimeDisplay'>
                      & BuildingExtras;

interface BuildingData {
  name: string
  id: number
  imageUrl: string
  coords: {
    over: number
    down: number
  }
  openingTime: number
  closingTime: number
  openingTimeDisplay: string
  closingTimeDisplay: string
}

interface BuildingExtras {
  actionPill?: ActionPillProps
  isOpen: boolean
}

export { Building, type BuildingData }
