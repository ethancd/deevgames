'use strict'

import React from 'react'
import {activateOnKey} from './touchControls'

export default function EmptyItem ({destination, label = 'Empty', available = false, slotIndex}: {destination?: 'soil' | 'storage', label?: string, available?: boolean, slotIndex?: number}): JSX.Element {
  return (
    <li className={`item empty-slot ${available ? 'valid-destination' : ''}`} data-destination={destination} data-slot-index={slotIndex}
        role={destination ? 'button' : undefined} tabIndex={destination ? 0 : undefined} onKeyDown={activateOnKey} aria-label={label}>
      <span className="type">{destination === 'soil' ? '🟫' : destination === 'storage' ? '📦' : 'ㅤ'}</span><span className="name">{label}</span>
    </li>
  )
}
