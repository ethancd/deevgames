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
  touchUi: boolean
  touchUiAvailable: boolean
  onTouchUiChange: (enabled: boolean) => void
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
    description: 'On: villagers follow their schedules. Off: everyone stays in one place, including Trix at the beach.',
    bonus: 50,
  },
  {
    key: 'building_hours',
    label: 'Building hours',
    description: 'On: buildings follow opening and closing times. Off: every building is always open.',
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
    label: 'Random shop inventory',
    description: 'On: random merchandise and mytheggs can appear. Off: a predictable daily selection of seeds and universally loved gifts, with both available every day.',
    bonus: 25,
  },
]

export default function SettingsMenu({ show, onClose, currentPortraitUrl, portraitUrls, heroName, isDefaultName, touchUi, touchUiAvailable, onTouchUiChange }: SettingsMenuProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<'hero' | 'settings'>('hero')
  const [settings, setSettings] = useState<GameSettings | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    if (!show) return
    let cancelled = false
    setSettings(null)
    setLoadError('')
    getSettings().then(value => {
      if (!cancelled) setSettings(value)
    }).catch(() => {
      if (!cancelled) setLoadError('Could not load settings. Please try again.')
    })
    return () => { cancelled = true }
  }, [show, loadAttempt])

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
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Game settings" onClick={e => e.stopPropagation()}>
        <button className="close-button" aria-label="Close settings" onClick={onClose}>×</button>

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
          <div className="interface-setting">
            <label><input type="checkbox" checked={touchUi} disabled={!touchUiAvailable} onChange={event => onTouchUiChange(event.target.checked)} /> Touch-friendly interface</label>
            <p>{touchUiAvailable ? 'Compact phone layout and tap-to-use items on phone and tablet. Applies now on this browser; turn off to restore the previous interface.' : 'The new interface is currently disabled for this host.'}</p>
          </div>
          {activeTab === 'hero' ? (
            <HeroTab
              currentPortraitUrl={currentPortraitUrl}
              portraitUrls={portraitUrls}
              heroName={heroName}
              isDefaultName={isDefaultName}
            />
          ) : (
            loadError ? (
              <div role="alert">
                <p>{loadError}</p>
                <button onClick={() => setLoadAttempt(value => value + 1)}>Try again</button>
              </div>
            ) : <SettingsTab settings={settings} setSettings={setSettings} />
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
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  if (!settings) {
    return <div className="settings-tab">Loading...</div>
  }

  const toggleSetting = async (key: string) => {
    if (saving) return
    const draftKey = `draft_${key}` as keyof GameSettings
    const newValue = !settings[draftKey]

    try {
      setSaving(true)
      setSaveError('')
      const updatedSettings = await postSettings({ [draftKey]: newValue })
      setSettings(updatedSettings)
    } catch (error) {
      setSaveError('Your change was not saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-tab">
      <h3>Challenge Options</h3>
      <p>Uncheck an option to simplify the game. Changes apply immediately before your first action of the week. Once you start playing, changes apply next week.</p>
      <p role="status">{settings.can_apply_immediately ? 'You haven’t taken an action yet. Changes apply to this week.' : 'Your week has started. Changes are saved for next week.'}</p>
      {saveError && <p role="alert">{saveError}</p>}
      {saving && <p role="status">Saving…</p>}

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
                  disabled={saving}
                  onChange={() => toggleSetting(option.key)}
                />
                <span className="setting-label">{option.label}</span>
                <span className="setting-bonus">+{option.bonus}%</span>
              </label>
              <p className="setting-description">{option.description}</p>
              <p className="setting-description">This week: {isActive ? 'On' : 'Off'}</p>
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
