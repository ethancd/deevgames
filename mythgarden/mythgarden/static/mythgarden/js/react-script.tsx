import React from 'react'
import ReactDOM from 'react-dom/client'
import { App, type AppProps } from './app'
import { acceptStateVersion } from './ajax'
import '../style.scss'
import '../mobile.scss'
import '../touch.scss'

const root = ReactDOM.createRoot(document.getElementById('app-root') as Element)
const appDataElement = document.getElementById('app-data') as Element
const appData = JSON.parse(appDataElement.textContent as string)

export default function renderApp (appData: Partial<AppProps>): void {
  acceptStateVersion(appData.stateVersion)
  root.render(
        <React.StrictMode>
            <App {...appData} />
        </React.StrictMode>
  )
}

renderApp(appData)
