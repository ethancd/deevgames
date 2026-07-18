import React from 'react'
import ActionPill, {ActionPillProps} from "./action";

function ArrowsList ({ arrows, actionDictionary }: ArrowsListProps): JSX.Element {
  return (
      <ul id="directions">
        {arrows.map(arrow => {
          const actionPill = actionDictionary[`place-${arrow.id}`]
          return (
            <Arrow {...{...arrow, actionPill}} key={arrow.id}></Arrow>
          )
        })}
      </ul>
  )
}

function Arrow({id, direction, actionPill }: ArrowProps): JSX.Element {
  return (
      <li
      className={`arrow ${direction.toLowerCase()}`}
      data-entity-id={id}>
        <div
          className='inner-triangle'
          style={{backgroundImage: `url("/static/mythgarden/images/dark-wood-texture.png")`}}>
        </div>
        <ActionPill {...actionPill}></ActionPill>
      </li>
  )
}

type ArrowProps = ArrowData & {actionPill: ActionPillProps};

interface ArrowData {
  direction: string
  id: number
}

interface ArrowsListProps {
  arrows: ArrowData[]
  actionDictionary: Record<string, ActionPillProps>
}

export { ArrowsList, type ArrowData }