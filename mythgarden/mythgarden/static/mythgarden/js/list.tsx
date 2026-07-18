'use strict'

import React, { useContext } from 'react'
import { FilterizeColorContext } from './lightColorLogic'

export default function List ({ id, baseColor, children }: React.PropsWithChildren<ListProps>): JSX.Element {
  const filterizeColor = useContext(FilterizeColorContext)
  const backgroundColor = filterizeColor(baseColor)

  return (
        <ul id={id} style={{ backgroundColor }}>
            {children}
        </ul>
  )
}

interface ListProps {
  id: string
  baseColor: string
}
