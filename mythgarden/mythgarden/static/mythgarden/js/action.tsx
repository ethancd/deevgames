import React from 'react'
import Duration, { WaitClass } from "./duration";
import PriceTag from "./priceTag";

export default function ActionPill ({ emoji, costAmount, costType, waitClass, backgroundColor, opacity }: ActionPillProps): JSX.Element {
  if (costAmount == null || costType == null) {
    return (
      <div className='action-pill'>
        <span className='action-type'>{emoji}</span>
      </div>
    )
  } else {
    return (
      <div className='action-pill'>
          { costType == CostType.Time
            ? <>
                <span className='action-type'>{emoji}</span>
                <Duration amount={costAmount} waitClass={waitClass}></Duration>
              </>
            : <PriceTag amount={costAmount}></PriceTag>
          }
          { backgroundColor != null
            ? <div className='action-filter' style={{ backgroundColor, opacity }}></div>
            : null
          }
      </div>
    )
  }
}

enum CostType {
  Time = 'time',
  Money = 'money'
}

enum EntityType {
  Item = 'item',
  Villager = 'villager',
  Place = 'place',
  Gift = 'gift'
}

interface ActionData {
  description: string
  costAmount?: number
  costType?: CostType
  waitClass?: WaitClass
  emoji: string
  entityType: EntityType|null
  entityId: number|null
  giftReceiverId?: number
  uniqueDigest: string
}

interface ActionExtras {
  backgroundColor?: string
  opacity?: number
}

type ActionPillProps = Pick<ActionData, 'costAmount'|'costType'|'emoji'|'waitClass'> & ActionExtras;


export { ActionPill, type ActionPillProps, type ActionData, WaitClass }
