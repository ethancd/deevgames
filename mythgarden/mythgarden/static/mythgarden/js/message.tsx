'use strict'

import React from 'react'

export default function Message ({ text, isError, id }: MessageProps): JSX.Element {
  return (
    <div className={`message${isError ? ' error' : ''}`} key={id}>{text}</div>
  )
}

interface MessageProps {
  text: string
  isError: boolean
  id: number
}

export { Message, type MessageProps }
