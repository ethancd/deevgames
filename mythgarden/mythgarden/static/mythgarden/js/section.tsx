'use strict'

import React, {SyntheticEvent, useContext} from 'react'
import Color from 'color'
import {FilterizeColorContext} from "./lightColorLogic";

export default function Section ({ id, baseColor, children, handleClick, className = '' }: React.PropsWithChildren<SectionProps>): JSX.Element {
  const filterizeColor = useContext(FilterizeColorContext)
  const backgroundColor = filterizeColor(baseColor)

  return (
        <section id={id}
                 onClick={handleClick}
                 className={`${className} ${Color(backgroundColor).isDark() ? 'dark-mode' : ''}`}
                 style={{ backgroundColor }}>
            {children}
        </section>
  )
}

interface SectionProps {
  id: string
  className?: string
  baseColor: string
  handleClick?: (e: SyntheticEvent) => void
}
