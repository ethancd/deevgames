import Cookies from 'js-cookie'

import renderApp from './react-script'
import { type MessageProps } from './message'
import {HeroData} from "./hero";

// fn: given a post url and a data object, make an xhr call to the server and return the response
async function post (url: string, data: object): Promise<Response> {
  const csrfToken = Cookies.get('csrftoken') as string

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('X-CSRFToken', csrfToken)
    xhr.send(JSON.stringify(data))

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(xhr.responseText)
      }
    }
  })
}

async function postAction (uniqueDigest: string): Promise<void> {
  await post('/action', { uniqueDigest })
    .then((response: any) => {
      console.log(response)

      if (response.error != null) {
        throw response
      }

      renderApp(response)
    }).catch((response: any) => {
      console.log(response)
      renderApp({ messages: response.messages as MessageProps[] })
    })
}

async function postUserData (userData: UserData): Promise<void> {
  await post('/user_data', { userData })
    .then((response: any) => {
      if (response.error != null) {
        throw response
      }
      renderApp({ hero: response.hero as HeroData, messages: response.messages as MessageProps[] })
    }).catch((response: any) => {
      renderApp({ messages: response.messages as MessageProps[] })
    })
}

async function getSettings (): Promise<GameSettings> {
  const csrfToken = Cookies.get('csrftoken') as string

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/settings')
    xhr.setRequestHeader('X-CSRFToken', csrfToken)
    xhr.send()

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        reject(xhr.responseText)
      }
    }
  })
}

async function postSettings (settings: Partial<GameSettings>): Promise<GameSettings> {
  return await post('/settings/update', settings) as Promise<GameSettings>
}

interface UserData {
  name?: string
  portraitPath?: string
}

export interface GameSettings {
  villagers_move: boolean
  building_hours: boolean
  advanced_crops: boolean
  dynamic_shop: boolean
  draft_villagers_move: boolean
  draft_building_hours: boolean
  draft_advanced_crops: boolean
  draft_dynamic_shop: boolean
  score_multiplier: number
  draft_score_multiplier: number
}

export {
  post,
  postAction,
  postUserData,
  getSettings,
  postSettings
}
