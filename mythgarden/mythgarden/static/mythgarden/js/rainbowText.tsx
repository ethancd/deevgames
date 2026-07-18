import React, {useContext} from "react";
import colors from './_colors';
import Color from "color";
import {FilterizeColorContext} from "./lightColorLogic";

export default function RainbowText ({ text, shading = 0}: RainbowTextProps): JSX.Element {
  const filterizeColor = useContext(FilterizeColorContext)
  const pageColor = filterizeColor(colors.whiteYellow)
  const isDarkMode = Color(pageColor).isDark()

  const baseColors = [
    colors.fuschia,
    colors.electricBlue,
    colors.brightGreen,
    colors.lightOrange,
    colors.hotRed
  ]

  const textColors = baseColors.map(baseColor => {
    const color = Color(baseColor)

    const newColorHex = isDarkMode
      ? color.desaturate(shading).hex()
      : color.darken(shading).desaturate(shading).hex()

    return newColorHex
  })

  return (
    <span className='rainbow-text'>
      {text.split('').map((char, n) => {
        const ix = n % textColors.length
        return <span style={{color: textColors[ix]}} key={`${char}-${n}`}>{char}</span>
      })}
    </span>
  )
}

interface RainbowTextProps {
  text: string
  shading?: number
}