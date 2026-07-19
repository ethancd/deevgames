'use strict'

import React, { useContext } from 'react'
import colors from './_colors'
import {FilterizeColorContext} from "./lightColorLogic";

export default function Wallet ({ value }: WalletProps): JSX.Element {
  const filterizeColor = useContext(FilterizeColorContext)
  const backgroundColor = filterizeColor(colors.whiteYellow)

  const getValueLength = (value: string) => {

    const valueLength = value.length - 2 // emoji + space length

    if (valueLength >=4) return 'long'
    else return ''
  }

  const valueLength = getValueLength(value)

  return (
        <div id="wallet" className={valueLength} style={{backgroundColor}}><span>{value}</span></div>
  )
}

interface WalletProps {
  value: string
}

export { Wallet, type WalletProps }
