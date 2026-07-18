import React from 'react'
import ActionPill, {ActionPillProps} from "./action";

function ActivitiesList ({ activities, actionDictionary }: ActivityListProps): JSX.Element {
  return (
    <ul id='activities'>
      {activities.map(activity => {
        const actionPill = (activity.id != null)
          ? actionDictionary[`place-${activity.id}`]
          : actionDictionary['no-entity']

        return (
          <Activity {...{...activity, actionPill}} key={`${activity.actionType}-${activity.id}`}></Activity>
        )
      })}
    </ul>
  )
}

function Activity({id, actionType, imageUrl, actionPill }: ActivityProps): JSX.Element {
  return (
      <li
      className={`local-activity ${actionType.toLowerCase()} ${actionPill == null ? 'inactive' : ''}`}
      key={actionType}
      data-entity-id={id}
      data-action-type={actionType}>
        <img src={imageUrl}></img>
      { actionPill != null
          ? <ActionPill {...actionPill}></ActionPill>
          : null
        }
      </li>
  )
}

type ActivityProps = ActivityData & {actionPill: ActionPillProps};

interface ActivityData {
  actionType: string
  id?: number
  imageUrl: string
}


interface ActivityListProps {
  activities: ActivityData[]
  actionDictionary: Record<string, ActionPillProps>
}

export { ActivitiesList, type ActivityData }