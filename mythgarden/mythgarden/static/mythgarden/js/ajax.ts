import Cookies from 'js-cookie'

import renderApp from './react-script'
import { type MessageProps } from './message'
import {HeroData} from "./hero";

async function requestJson<T> (method: 'GET' | 'POST', url: string, data?: object): Promise<T> {
  const csrfToken = Cookies.get('csrftoken') as string

  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.timeout = 20000
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('X-CSRFToken', csrfToken)
    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText)
        if (xhr.status !== 200 || response.error != null) {
          reject(response)
        } else {
          resolve(response as T)
        }
      } catch {
        reject(new Error('The server returned an unexpected response. Please reload and try again.'))
      }
    }
    xhr.onerror = () => reject(new Error('Connection lost. Please reload to check whether your action was saved.'))
    xhr.ontimeout = () => reject(new Error('The request timed out. Please reload to check whether your action was saved.'))
    xhr.onabort = () => reject(new Error('The request was interrupted. Please reload to check your progress.'))
    xhr.send(data == null ? null : JSON.stringify(data))
  })
}

async function post<T = any> (url: string, data: object): Promise<T> {
  return await requestJson<T>('POST', url, data)
}

function displayRequestError (response: any): void {
  renderApp({ messages: response?.messages ?? [{
    id: -1,
    isError: true,
    text: response?.error ?? response?.message ?? 'Unable to save. Please reload and try again.',
  }] })
}

async function postAction (uniqueDigest: string): Promise<void> {
  await post('/action', { uniqueDigest })
    .then((response: any) => {
      if (response.error != null) {
        throw response
      }

      renderApp(response)
    }).catch((response: any) => {
      displayRequestError(response)
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
      displayRequestError(response)
    })
}

async function getSettings (): Promise<GameSettings> {
  return await requestJson<GameSettings>('GET', '/settings')
}

async function postSettings (settings: Partial<GameSettings>): Promise<GameSettings> {
  const response = await post<GameSettings & { gameState?: any }>('/settings/update', settings)
  if (response.gameState) renderApp(response.gameState)
  return response
}

interface UserData {
  name?: string
  portraitPath?: string
}

export interface GameSettings {
  can_apply_immediately: boolean
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
