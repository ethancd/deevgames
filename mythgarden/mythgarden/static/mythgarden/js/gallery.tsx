import React from 'react'
import { postUserData } from './ajax'

export default function Gallery ({ show, currentPortraitUrl, portraitUrls }: GalleryProps): JSX.Element {
  const PORTRAIT_PATH_REGEX = /portraits\/farmer\/(?<name>[a-z-]+).*(?<ext>\.\w+)/
  // aka: find the name ($1) which is any lower-case-dashed-text right after "portraits/farmer/"
  // and the ext ($2) which is the extension at the end, so .png, .jpeg, etc

  const getPortraitPath = (portraitUrl: string): string => {
    const found = portraitUrl.match(PORTRAIT_PATH_REGEX)

    if (found?.groups?.name == null || found?.groups?.ext == null) {
      throw new Error(`Unexpectedly malformed portraitUrl: ${portraitUrl}`)
    }

    return found.groups.name + found.groups.ext
  }

  const choosePortrait = (e: any) => {
    const portraitUrl = e.target.src
    const portraitPath = getPortraitPath(portraitUrl)

    if (portraitPath === getPortraitPath(currentPortraitUrl)) return

    void postUserData({portraitPath})
  }

  if (show) {
    return (
      <ul id='gallery' className='gallery'>
        {portraitUrls.map(portraitUrl => {
          const isCurrent = portraitUrl === currentPortraitUrl;

          return (
            <li
              className={`portrait gallery-portrait${isCurrent ? ' current' : ''}`}
              key={portraitUrl}
            >
              <img
                onClick={e => choosePortrait(e)}
                src={portraitUrl}
              ></img>
            </li>
          )
        })}
      </ul>
    )
  } else {
    return (<ul id="gallery" style={{ display: 'none' }}></ul>)
  }
}

interface GalleryProps {
  show: boolean
  currentPortraitUrl: string
  portraitUrls: string[]
}
