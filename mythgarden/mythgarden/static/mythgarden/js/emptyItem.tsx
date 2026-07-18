'use strict'

import React from 'react'

export default function EmptyItem (): JSX.Element {
  return (
    <li className="item empty-slot">
      <span className="type">ㅤ</span><span className="name">Empty</span>
    </li>
  )
}
