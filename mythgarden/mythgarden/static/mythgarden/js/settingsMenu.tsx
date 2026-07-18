import React, { useState, useEffect } from 'react'
import { GameSettings, getSettings, postSettings } from './ajax'
import { postUserData } from './ajax'
import TypeableName from './typeableName'

interface SettingsMenuProps {
  show: boolean
  onClose: () => void
  currentPortraitUrl: string
  portraitUrls: string[]
  heroName: string
  isDefaultName: boolean
}

interface SettingOption {
  key: string
  label: string
  description: string
  bonus: number
}

const SETTING_OPTIONS: SettingOption[] = [
  {
    key: 'villagers_move',
    label: 'Villagers move around',
    description: 'Villagers travel between locations on a schedule. (Trix always roams!)',
    bonus: 50,
  },
  {
    key: 'building_hours',
    label: 'Building hours',
    description: 'Shops and buildings have opening and closing times.',
    bonus: 25,
  },
  {
    key: 'advanced_crops',
    label: 'Advanced crops',
    description: 'Fantasy crops (Weedbulb, Cool Lettuce, Spice Carrot, Earth Yam, Lightning Artichoke, Hallowed Pumpkin, Mythfruit) with variable growth times. Disabled: classic crops (Parsnip, Potato, Rhubarb, Cauliflower, Melon, Pumpkin, Mythfruit) with 2-day growth.',
    bonus: 25,
  },
  {
    key: 'dynamic_shop',
    label: 'Dynamic shop inventory',
    description: 'Random merchandise items appear daily (fish, fossils, tech, magic, etc.). Disabled: only fixed items (seeds and gifts).',
    bonus: 25,
  },
]

export default function SettingsMenu({ show, onClose, currentPortraitUrl, portraitUrls, heroName, isDefaultName }: SettingsMenuProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'hero' | 'settings'>('hero')
  const [settings, setSettings] = useState<GameSettings | null>(null)

  useEffect(() => {
    if (show && !settings) {
      getSettings().then(setSettings).catch(console.error)
    }
  }, [show])

  if (!show) {
    return <div style={{ display: 'none' }}></div>
  }

  const handleClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="settings-modal-overlay" onClick={handleClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>×</button>

        <div className="tabs">
          <button
            className={activeTab === 'hero' ? 'active' : ''}
            onClick={() => setActiveTab('hero')}
          >
            Hero
          </button>
          <button
            className={activeTab === 'settings' ? 'active' : ''}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'hero' ? (
            <HeroTab
              currentPortraitUrl={currentPortraitUrl}
              portraitUrls={portraitUrls}
              heroName={heroName}
              isDefaultName={isDefaultName}
            />
          ) : (
            <SettingsTab settings={settings} setSettings={setSettings} />
          )}
        </div>
      </div>
    </div>
  )
}

function HeroTab({ currentPortraitUrl, portraitUrls, heroName, isDefaultName }: { currentPortraitUrl: string, portraitUrls: string[], heroName: string, isDefaultName: boolean }): JSX.Element {
  const PORTRAIT_PATH_REGEX = /portraits\/farmer\/(?<name>[a-z-]+).*(?<ext>\.\w+)/

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

    void postUserData({ portraitPath })
  }

  return (
    <div className="hero-tab">
      <div className="hero-name-section">
        <label>Hero Name:</label>
        <TypeableName name={heroName} isDefaultName={isDefaultName} />
      </div>

      <div className="portrait-gallery">
        <h3>Choose Portrait:</h3>
        <div className="portrait-grid">
          {portraitUrls.map(portraitUrl => {
            const isCurrent = portraitUrl === currentPortraitUrl

            return (
              <div
                className={`portrait gallery-portrait${isCurrent ? ' current' : ''}`}
                key={portraitUrl}
              >
                <img
                  onClick={e => choosePortrait(e)}
                  src={portraitUrl}
                  alt="Portrait option"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SettingsTab({ settings, setSettings }: { settings: GameSettings | null, setSettings: (settings: GameSettings) => void }): JSX.Element {
  if (!settings) {
    return <div className="settings-tab">Loading...</div>
  }

  const toggleSetting = async (key: string) => {
    const draftKey = `draft_${key}` as keyof GameSettings
    const newValue = !settings[draftKey]

    try {
      const updatedSettings = await postSettings({ [draftKey]: newValue })
      setSettings(updatedSettings)
    } catch (error) {
      console.error('Failed to update settings:', error)
    }
  }

  return (
    <div className="settings-tab">
      <h3>Challenge Options</h3>

      <div className="settings-list">
        {SETTING_OPTIONS.map(option => {
          const activeKey = option.key as keyof GameSettings
          const draftKey = `draft_${option.key}` as keyof GameSettings
          const isActive = settings[activeKey] as boolean
          const isDraft = settings[draftKey] as boolean
          const hasPendingChange = isActive !== isDraft

          return (
            <div key={option.key} className="setting-row">
              <label className="setting-checkbox">
                <input
                  type="checkbox"
                  checked={isDraft}
                  onChange={() => toggleSetting(option.key)}
                />
                <span className="setting-label">{option.label}</span>
                <span className="setting-bonus">+{option.bonus}%</span>
              </label>
              <p className="setting-description">{option.description}</p>
              {hasPendingChange && (
                <p className="pending-notice">
                  ⓘ This change will be applied when you start your next run
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="score-multiplier">
        <div className="multiplier-text">
          <strong>Score Multiplier: {Math.round(settings.score_multiplier * 100)}%</strong>
          {settings.score_multiplier !== settings.draft_score_multiplier && (
            <span className="draft-multiplier">
              {' '}(Next run: {Math.round(settings.draft_score_multiplier * 100)}%)
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
