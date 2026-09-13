import React, {SyntheticEvent} from 'react'
import { TouchBackend } from 'react-dnd-touch-backend'
import { DndProvider } from 'react-dnd'

import RainbowText from "./rainbowText";

import {type ActionData, ActionPillProps} from './action'
import {AchievementData, AchievementsList} from "./achievementsList";
import {ActivitiesList} from "./activitiesList";
import {ArrowsList} from "./arrowsList";
import BonusStats from "./bonusStats";
import {Building, type BuildingData} from './building'
import {BuildingsList} from "./buildingsList";
import {Clock, type ClockData} from './clock'
import {Dialogue, type DialogueData} from './dialogue'
import {GiftPreview} from "./draggableGift";
import {Hero, type HeroData} from './hero'
import {Item, type ItemData} from './item'
import {ItemsList} from "./itemsList";
import List from './list'
import {Location, type LocationData} from './location'
import {Message, type MessageProps} from './message'
import Section from './section'
import {Sky} from './sky'
import {Villager, VillagerData } from './villager'
import {VillagersList} from "./villagersList";
import Wallet from './wallet'

import { isDeepEqual } from './staticUtils'
import { FilterizeColorContext, ImageFilterContext, filterFuncFactory, getImageFilter, getColorFilterByTime } from './lightColorLogic'
import colors from './_colors'
import Gallery from "./gallery";
import SettingsMenu from "./settingsMenu";
import DeployInfo from "./deployInfo";
import {postAction} from "./ajax";
import {actionCost, destinationAction, readTouchPreference, TOUCH_UI_STORAGE_KEY, SLOT_STORAGE_KEY, arrangeSlots} from './touchControls'
import TouchPanel from './touchPanel'


const TALK_ACTION = 'TALK'
const TRAVEL_ACTION = 'TRAVEL'

const WATER_ACTION = 'WATER'
const PLANT_ACTION = 'PLANT'
const HARVEST_ACTION = 'HARVEST'
const BUY_ACTION = 'BUY'
const SELL_ACTION = 'SELL'
const STOW_ACTION = 'STOW'
const RETRIEVE_ACTION = 'RETRIEVE'

const ITEM_ACTIONS = [WATER_ACTION, PLANT_ACTION, HARVEST_ACTION, BUY_ACTION, SELL_ACTION, STOW_ACTION, RETRIEVE_ACTION]

const EPHEMEREAL_MSG_ID = 0

const TOTAL_ACHIEVEMENTS = 114  // should we be getting this from the db somehow? probably. will we? no.

class App extends React.Component<Partial<AppProps>, AppState> {
  constructor (props: AppProps) {
    super(props)
    this.state = {
      combinedProps: props,
      showGallery: false,
      showDialogue: false,
      showAchievementsList: false,
      showSettingsMenu: false,
      ephemerealMessage: undefined,
      touchPreference: this.loadTouchPreference(),
      phoneViewport: window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches,
      selectedItemId: null,
      slotPlacements: this.loadSlotPlacements(),
      touchPanel: null,
      detailVillager: null,
      dismissedError: null
    }
  }

  componentDidUpdate (prevProps: Readonly<Partial<AppProps>>, prevState: Readonly<AppState>): void {
    /*
     * Expect the server to only return models that have been updated on the most recent request.
     * Therefore, combine the previous props with new props for the next render, so existing data keeps being displayed.
     * Do set dialogue: null if dialogue isn't in the new props, so that the dialogue box disappears after one action.
     */
    const combinedProps = { ...this.state.combinedProps, dialogue: null, ...this.props }

    this.resetDialogueAsNeeded(combinedProps)
    this.scrollToMessageBottom()

    if (!isDeepEqual(combinedProps, this.state.combinedProps)) {
      this.setState({ combinedProps, selectedItemId: combinedProps.stateVersion !== this.state.combinedProps.stateVersion ? null : this.state.selectedItemId })
    }
  }

  componentDidMount (): void {
    this.scrollToMessageBottom()
    this.updateViewport()
    window.addEventListener('resize', this.updateViewport)
    window.visualViewport?.addEventListener('resize', this.updateViewport)
    window.addEventListener('keydown', this.cancelSelection)
  }

  componentWillUnmount (): void {
    window.removeEventListener('resize', this.updateViewport)
    window.visualViewport?.removeEventListener('resize', this.updateViewport)
    window.removeEventListener('keydown', this.cancelSelection)
  }

  loadTouchPreference(): boolean {
    try { return readTouchPreference(window.localStorage) } catch { return true }
  }

  loadSlotPlacements(): Record<number, Record<number, number>> {
    try {
      const stored = JSON.parse(window.localStorage.getItem(SLOT_STORAGE_KEY) ?? '{}')
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
    } catch { return {} }
  }

  rememberDestination(itemId: number, slotIndex: number): void {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 5) return
    const {place, localItemTokens, inventory} = this.state.combinedProps
    const placements: Record<number, number> = {}
    arrangeSlots(localItemTokens, this.state.slotPlacements[place.id] ?? {}).forEach((item, index) => {if (item) placements[item.placementId ?? item.id] = index})
    const selected = inventory.find(item => item.id === itemId)
    placements[selected?.placementId ?? itemId] = slotIndex
    const slotPlacements = {...this.state.slotPlacements, [place.id]: placements}
    this.setState({slotPlacements})
    try { window.localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(slotPlacements)) } catch { /* Cosmetic placement remains available in this tab. */ }
  }

  updateViewport = (): void => {
    const viewport = window.visualViewport
    // Preserve native pinch zoom; only follow the keyboard/browser chrome at 1x.
    if (!viewport || viewport.scale === 1) {
      document.documentElement.style.setProperty('--game-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
    }
    const phoneViewport = window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches
    if (phoneViewport !== this.state.phoneViewport) this.setState({phoneViewport})
  }

  cancelSelection = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.setState({selectedItemId: null})
  }

  get touchUi(): boolean { return this.state.combinedProps.touchUiEnabled !== false && this.state.touchPreference }

  setTouchPreference = (enabled: boolean): void => {
    try { window.localStorage.setItem(TOUCH_UI_STORAGE_KEY, enabled ? 'on' : 'off') } catch { /* Still works for this tab if storage is unavailable. */ }
    this.setState({touchPreference: enabled, selectedItemId: null, touchPanel: null})
  }


  resetDialogueAsNeeded (combinedProps: Partial<AppProps>) {
    const prevId = this.state.combinedProps.dialogue?.id
    const newId = combinedProps.dialogue?.id

    if (newId != null && prevId != newId) {
      this.setState({showDialogue: true})
    }
  }

  // might be nice to move this to a MessagesList component and just do it on render there
  scrollToMessageBottom (): void {
    const messageContainer = document.getElementById('message-log') as HTMLElement
    if (messageContainer) messageContainer.scrollTop = messageContainer.scrollHeight
  }

  marshalActionDictionary (actions: ActionData[]): ActionRecord {
    const actionDictionary = {} as ActionRecord

    actions.forEach(action => {
      const hasEntity = action.entityType != null && action.entityId != null
      const isGiftAction = action.giftReceiverId != null

      const key = hasEntity
        ? isGiftAction
          ? `gift-${action.entityId}`
          : `${action.entityType}-${action.entityId}`
        : 'no-entity'

      const {emoji, costAmount, costType, waitClass, description} = action

      actionDictionary[key] = {emoji, costAmount, costType, waitClass, description}
    })

    return actionDictionary;
  }

  marshalGiftReceiverIds (actions: ActionData[]): Set<number> {
    const giftReceiverIds = new Set<number>()

    actions.forEach(action => {
      if (action.giftReceiverId != null) {
        giftReceiverIds.add(action.giftReceiverId)
      }
    })

    return giftReceiverIds
  }

  getComponentTarget(e: React.SyntheticEvent) {
    const componentClasses = ['action', 'local-activity', 'item', 'villager', 'building', 'hero-portrait', 'achievements-pill', 'gallery', 'arrow']
    const componentClassSelector = componentClasses.map(c => '.' + c).join(', ')
    const componentDomNode = (e.target as HTMLElement).closest(componentClassSelector) as HTMLElement

    return componentDomNode
  }

  hasClass(element: HTMLElement, className: string) {
    return element.classList.contains(className);
  }

  marshalActivityClickData(dataset: DOMStringMap) {
    const entityId = this.grabId(dataset) || ''
    const actionType = dataset.actionType == null ? null : dataset.actionType

    return {
      entityId,
      actionType
    }
  }

  grabId(dataset: DOMStringMap): number|null {
    const entityId = dataset.entityId == null ? null : parseInt(dataset.entityId)

    return entityId
  }

  findMatchingAction(actionType: string, entityId: number): ActionData | undefined {
    const matchingAction = this.state.combinedProps.actions.find(action => {
      return action.uniqueDigest === `${actionType}-${entityId}`
    })

    return matchingAction
  }

  fireActionIfAvailable(actionType: string, target: HTMLElement) {
    const entityId = this.grabId(target.dataset)
    if (entityId == null) return

    const matchingAction = this.findMatchingAction(actionType, entityId)
    if (matchingAction == null) return

    void postAction(matchingAction.uniqueDigest)
  }

  fireActionWithEmptyIdIfAvailable(actionType: string) {
    const matchingAction = this.state.combinedProps.actions.find(action => {
      return action.uniqueDigest === `${actionType}-`  // load-bearing hyphen at the end there
    })
    if (matchingAction == null) return

    void postAction(matchingAction.uniqueDigest)
  }

  handleClick (e: SyntheticEvent): void {
    if (this.state.combinedProps.actionPending) return
    const clicked = e.target as HTMLElement
    if (this.touchUi) {
      const bagItem = clicked.closest('#inventory .item[data-entity-id]') as HTMLElement | null
      if (bagItem) {
        if (bagItem.closest('.is-dragging')) return
        const id = this.grabId(bagItem.dataset)
        this.clearActiveUX()
        this.setState({selectedItemId: id === this.state.selectedItemId ? null : id})
        return
      }
      const selectedItemId = this.state.selectedItemId
      if (selectedItemId != null) {
        const villager = clicked.closest('.villager') as HTMLElement | null
        const destination = clicked.closest('[data-destination]') as HTMLElement | null
        const target = villager ? 'villager' : destination?.dataset.destination as 'soil' | 'storage' | 'sell' | undefined
        if (target) {
          const {actions, localItemTokens} = this.state.combinedProps
          const action = destinationAction(actions, selectedItemId, target, villager ? this.grabId(villager.dataset) ?? undefined : undefined, localItemTokens.length)
          if (action) {
            if ((target === 'soil' || target === 'storage') && destination) this.rememberDestination(selectedItemId, Number(destination.dataset.slotIndex))
            this.clearActiveUX()
            this.setState({selectedItemId: null})
            void postAction(action.uniqueDigest)
          } else {
            this.setState({ephemerealMessage: 'That destination is unavailable. Choose a highlighted destination, or tap your selected item to cancel.'})
          }
          return
        }
        if (this.getComponentTarget(e)) {
          this.setState({ephemerealMessage: 'Finish using your selected item, or tap it again to cancel.'})
          return
        }
        this.setState({selectedItemId: null})
      }
      const emptyDestination = clicked.closest('[data-destination]') as HTMLElement | null
      if (emptyDestination) {
        this.setState({ephemerealMessage: emptyDestination.dataset.destination === 'soil' ? 'Select seeds in your bag, then tap an empty soil spot.' : 'Select an item in your bag, then tap an empty chest slot.'})
        return
      }
    }
    this.clearActiveUX()

    const target = this.getComponentTarget(e)
    if (target == null) return

    if (this.hasClass(target, 'hero-portrait')) {
      if (!this.state.showGallery) {
        this.showGallery()
      }
    }

    else if (this.hasClass(target, 'achievements-pill')) {
      this.showAchievementsList()
    }

    else if (this.hasClass(target, 'villager')) {
      if (this.hasClass(target, 'gray-on-hover')) {
        this.printVillagerTalkedToWarning(this.grabId(target.dataset) as number)
      }
      this.fireActionIfAvailable(TALK_ACTION, target)
    }

    else if (this.hasClass(target, 'building')) {
      if (this.hasClass(target, 'inactive')) {
        this.printBuildingClosedWarning(this.grabId(target.dataset) as number)
      } else {
        this.fireActionIfAvailable(TRAVEL_ACTION, target)
      }
    }

    else if (this.hasClass(target, 'arrow')) {
      this.fireActionIfAvailable(TRAVEL_ACTION, target)
    }

    else if (this.hasClass(target, 'local-activity')) {
      if (this.hasClass(target, 'inactive') && this.hasClass(target, 'sleep')) {
        this.printNoSleepTillWarning()
      } else {
        const {actionType, entityId} = this.marshalActivityClickData(target.dataset)

        if (actionType == null || entityId == null) return

        if (entityId == '') {  // expect these location activities to often have no entity id
          this.fireActionWithEmptyIdIfAvailable(actionType)
        } else {
          this.fireActionIfAvailable(actionType, target)
        }
      }
    }

    else if (this.hasClass(target, 'item')) {
      // relying on assumption that any item has only ONE action available at a time (excluding gift actions)
      ITEM_ACTIONS.forEach(actionType => {
        this.fireActionIfAvailable(actionType, target)
      })
    }
  }

  printVillagerTalkedToWarning(entityId: number) {
    const villager = this.state.combinedProps.villagerStates.find(villager => villager.id === entityId) as VillagerData
    const warning = `⚠️ You already talked to ${villager.name} today. But they'll be happy to talk again tomorrow!`
    this.setState({ ephemerealMessage: warning })
  }

  printBuildingClosedWarning(entityId: number) {
    const building = this.state.combinedProps.buildings.find(building => building.id === entityId) as BuildingData
    const warning = `⚠️ ${building.name} is closed right now. It's open from ${building.openingTimeDisplay} to ${building.closingTimeDisplay}`
    this.setState({ ephemerealMessage: warning })
  }

  printNoSleepTillWarning() {
    const warning = `⚠️ Hang on, you're not tired! You can go to bed any time after 6:00pm`
    this.setState({ ephemerealMessage: warning })
  }

  showGallery (): void {
    this.setState({ showGallery: true })
  }

  showAchievementsList (): void {
    this.setState({ showAchievementsList: true })
  }

  showSettingsMenu (): void {
    this.setState({ showSettingsMenu: true })
  }

  clearActiveUX (): void {
    this.setState({ showGallery: false, showDialogue: false, showAchievementsList: false, showSettingsMenu: false, ephemerealMessage: undefined, touchPanel: null, detailVillager: null })
  }

  render (): JSX.Element {
    const {
      achievements,
      hero,
      portraitUrls,
      clock,
      wallet,
      inventory,
      actions,
      place,
      buildings,
      localItemTokens,
      messages,
      villagerStates,
      dialogue,
      speaker,
      environment,
      branchName,
      deployTime
    } = this.state.combinedProps

    const { showGallery, showDialogue, showAchievementsList, showSettingsMenu, ephemerealMessage } = this.state

    const colorFilter = getColorFilterByTime(clock.time)
    const imageFilter = getImageFilter(colorFilter)
    const filterFn = filterFuncFactory(colorFilter)

    const actionDictionary = this.marshalActionDictionary(actions)
    const giftReceiverIds = this.marshalGiftReceiverIds(actions)

    const isProduction = environment === 'production'
    const touchUi = this.touchUi
    const phoneUi = touchUi && this.state.phoneViewport
    const {selectedItemId, touchPanel, detailVillager} = this.state
    const selectedItem = inventory.find(item => item.id === selectedItemId)
    const soilAction = destinationAction(actions, selectedItemId, 'soil', undefined, localItemTokens.length)
    const storageAction = destinationAction(actions, selectedItemId, 'storage', undefined, localItemTokens.length)
    const sellAction = destinationAction(actions, selectedItemId, 'sell')
    const destination = touchUi ? place.placeType === 'FARM' ? 'soil' : place.isFarmhouse ? 'storage' : undefined : undefined
    const latestMessage = messages?.[messages.length - 1]
    const errorKey = latestMessage?.isError ? `${latestMessage.id}:${latestMessage.text}` : null
    const pageClassName = `${isProduction ? 'production' : ''} ${touchUi ? 'touch-ui' : ''} ${phoneUi ? 'phone-ui' : ''} ${selectedItem ? 'item-is-selected' : ''}`
    const villagerProps = {actionDictionary, giftReceiverIds, actions, selectedItemId: touchUi ? selectedItemId : null,
      onDetails: touchUi ? (villager: VillagerData) => this.setState({detailVillager: villager, touchPanel: 'villager'}) : undefined}
    const journal = <div className="compact-journal"><span role="status">{ephemerealMessage ?? (selectedItem ? 'Tap a highlighted destination.' : latestMessage?.text)}</span><button type="button" aria-label="Open journal" onClick={event => {event.stopPropagation(); this.setState({touchPanel: 'journal'})}}>Log</button></div>

    return (
      <FilterizeColorContext.Provider value={ filterFn }>
        <ImageFilterContext.Provider value={imageFilter}>
        <DndProvider backend={TouchBackend} options={{enableMouseEvents: true, delayTouchStart: 180, touchSlop: 8}}>
        <Section id="page" className={pageClassName} baseColor={colors.whiteYellow} handleClick={this.handleClick.bind(this)}>

          {phoneUi && <Section id="compact-hud" baseColor={colors.skyBlue}>
            <button className="compact-profile" aria-label="Farmer profile and score" onClick={event => {event.stopPropagation(); this.setState({touchPanel: 'profile'})}}><img src={hero.imageUrl} alt="" /></button>
            <div className="compact-clock"><Clock {...clock} /><span className="compact-stats">{wallet} <span>♥ {hero.heartsEarned}</span>{hero.boostLevel > 0 && <span aria-label={`Time boost level ${hero.boostLevel}`}>⚡{hero.boostLevel}</span>}</span></div>
            <button aria-label="Open settings" onClick={event => {event.stopPropagation(); this.showSettingsMenu()}}>☰</button>
          </Section>}

          <Section id="top-bar" baseColor={colors.skyBlue}>
            <Hero {...hero} achievementsCount={achievements.length} totalAchievements={TOTAL_ACHIEVEMENTS}></Hero>
            <Gallery {...{show: showGallery, currentPortraitUrl: hero.imageUrl, portraitUrls} }></Gallery>
            <AchievementsList show={showAchievementsList} achievements={achievements} totalAchievements={TOTAL_ACHIEVEMENTS}></AchievementsList>
            <button className="hamburger-button" aria-label="Open settings" onClick={e => { e.stopPropagation(); this.showSettingsMenu() }}>☰</button>
            <DeployInfo branchName={branchName} deployTime={deployTime} />
            <SettingsMenu
              show={showSettingsMenu}
              onClose={() => this.clearActiveUX()}
              currentPortraitUrl={hero.imageUrl}
              portraitUrls={portraitUrls}
              heroName={hero.name}
              isDefaultName={hero.isDefaultName}
              touchUi={touchUi}
              touchUiAvailable={this.state.combinedProps.touchUiEnabled !== false}
              onTouchUiChange={this.setTouchPreference}
            />
            <h1 id="logo"><RainbowText text={'Mythgarden'}></RainbowText></h1>
            <div className='column'>
              {!phoneUi && <Clock {...clock}></Clock>}
              <BonusStats boostLevel={hero.boostLevel} luckPercent={hero.luckPercent}></BonusStats>
            </div>
            <Sky time={clock.time} dayNumber={clock.dayNumber}></Sky>
          </Section>

          <div id="main-area" aria-busy={this.state.combinedProps.actionPending === true}>
            {this.state.combinedProps.actionPending && <div role="status" className="action-saving">Saving…</div>}
            <section id="sidebar">
              {touchUi && <div className="inventory-caption" aria-live="polite"><span>{selectedItem ? `${selectedItem.emoji} ${selectedItem.name}` : 'Bag · tap an item, then its destination'}</span><span>{inventory.length}/6</span></div>}
              <ItemsList
                id='inventory'
                baseColor={colors.whiteYellow}
                items={inventory}
                actionDictionary={actionDictionary}
                giftable={true}
                touchUi={touchUi}
                selectedItemId={selectedItemId}
              ></ItemsList>
              <GiftPreview></GiftPreview>
              <Wallet value={wallet}></Wallet>
            </section>

            <section id="center-col">
              <Location {...{...place, colorFilter, actionDictionary}}>
                <ActivitiesList activities={place.activities}
                                actionDictionary={actionDictionary}
                ></ActivitiesList>

                <ArrowsList arrows={place.arrows}
                actionDictionary={actionDictionary}
                ></ArrowsList>

                <BuildingsList
                  buildings={buildings}
                  actionDictionary={actionDictionary}
                  time={clock.time}
                ></BuildingsList>

                {place.hasInventory
                  ? <ItemsList
                    id='local-items'
                    baseColor={colors.sandyBrown}
                    items={localItemTokens}
                    actionDictionary={actionDictionary}
                    giftable={false}
                    destination={destination}
                    destinationAvailable={destination === 'soil' ? soilAction != null : storageAction != null}
                    placements={touchUi && destination ? this.state.slotPlacements[place.id] : undefined}
                    destinationLabel={destination === 'soil' ? soilAction ? `Plant · ${actionCost(soilAction)}` : 'Empty soil' : destination === 'storage' ? storageAction ? 'Store item' : 'Empty chest slot' : 'Empty'}
                  >
                    {touchUi && place.placeType === 'SHOP' && <li className="sell-destination-slot"><button type="button" className={`sell-destination ${sellAction ? 'valid-destination' : ''}`} data-destination="sell" disabled={!sellAction} aria-label={sellAction ? `Sell ${selectedItem?.name} for ${actionCost(sellAction)}` : 'Select a bag item to sell'}>{sellAction ? `Sell · +${actionCost(sellAction)}` : 'Select a bag item to sell'}</button></li>}
                  </ItemsList>
                  : null
                }
              </Location>

              {!touchUi && <List id='message-log' baseColor={colors.whiteYellow}>
                {messages?.map(message => Message({ ...message }))}
                {ephemerealMessage ? Message({text: ephemerealMessage, isError: true, id: EPHEMEREAL_MSG_ID}) : null}
              </List>}
              {touchUi && !phoneUi && journal}
            </section>
            <section id='far-sidebar'>
              <VillagersList villagers={phoneUi ? villagerStates.slice(0, 3) : villagerStates} {...villagerProps} />
              {phoneUi && <button className="all-people" aria-label={`People nearby, ${villagerStates.length}`} onClick={event => {event.stopPropagation(); this.setState({touchPanel: 'people'})}}>People<br />{villagerStates.length}</button>}
              {phoneUi && villagerStates.length === 0 && <span className="nobody-here">Nobody here right now.</span>}
              {(!touchUi && showDialogue && dialogue != null) ? <Dialogue {...dialogue} affinity={speaker?.affinity} key={dialogue.id}></Dialogue> : null}
            </section>
            {phoneUi && journal}
          </div>
          {touchUi && errorKey && errorKey !== this.state.dismissedError && <div className="touch-error" role="alert"><span>{latestMessage.text}</span><button aria-label="Dismiss error" onClick={event => {event.stopPropagation(); this.setState({dismissedError: errorKey})}}>×</button></div>}
          {touchUi && showDialogue && dialogue && <TouchPanel title={dialogue.name} onClose={() => this.setState({showDialogue: false})}><Dialogue {...dialogue} affinity={speaker?.affinity} /></TouchPanel>}
          {touchUi && touchPanel && <TouchPanel title={{profile: 'Your farmer', people: 'People nearby', journal: 'Journal', villager: detailVillager?.name ?? 'Villager'}[touchPanel]} onClose={() => this.setState({touchPanel: null, detailVillager: null})}>
            {touchPanel === 'profile' && <div className="touch-profile"><img src={hero.imageUrl} alt="" /><h3>{hero.name}</h3><p>Score: {hero.score.toLocaleString()} · Best: {hero.highScore.toLocaleString()}</p><p>Earned ⚜️ {hero.koinEarned} × {hero.heartsEarned} hearts{hero.mytheggsFound > 0 ? ` · ${hero.mytheggsFound} mytheggs` : ''}</p><p>Time boost: {hero.boostLevel} · Luck: {hero.luckPercent || '0%'}</p><button onClick={() => {this.setState({touchPanel: null}); this.showSettingsMenu()}}>Edit farmer & settings</button><button onClick={() => {this.setState({touchPanel: null}); this.showAchievementsList()}}>Achievements · {achievements.length}/{TOTAL_ACHIEVEMENTS}</button></div>}
            {touchPanel === 'journal' && <div id="journal-history">{messages?.map(message => <Message {...message} key={message.id} />)}{ephemerealMessage && <p>{ephemerealMessage}</p>}</div>}
            {touchPanel === 'people' && <div onClick={this.handleClick.bind(this)}><VillagersList id="people-list" villagers={villagerStates} {...villagerProps} />{villagerStates.length === 0 && <p>Nobody is here right now.</p>}</div>}
            {touchPanel === 'villager' && detailVillager && <div className="villager-biography"><img src={detailVillager.imageUrl} alt="" /><p>{detailVillager.description}</p><p>♥ {detailVillager.affinity.wholeHearts} / {detailVillager.affinity.maxHearts}</p><p>Loves: {detailVillager.preferences?.lovedGifts?.join(' ') || 'Discover by giving gifts.'}</p><p>Likes: {detailVillager.preferences?.likedGifts?.join(' ') || 'Discover by giving gifts.'}</p></div>}
          </TouchPanel>}
        </Section>
          </DndProvider>
          </ImageFilterContext.Provider>
      </FilterizeColorContext.Provider>
    )
  }
}

type ActionRecord = Record<string, ActionPillProps>

interface AppProps {
  touchUiEnabled?: boolean
  stateVersion: string
  actionPending?: boolean
  achievements: AchievementData[]
  actions: ActionData[]
  buildings: BuildingData[]
  clock: ClockData
  dialogue: DialogueData | null
  hero: HeroData
  inventory: ItemData[]
  localItemTokens: ItemData[]
  messages: MessageProps[]
  place: LocationData
  villagerStates: VillagerData[]
  wallet: string
  portraitUrls: string[]
  speaker: VillagerData | null
  environment?: string
  branchName?: string
  deployTime?: string
}

interface AppState {
  touchPreference: boolean
  phoneViewport: boolean
  selectedItemId: number | null
  slotPlacements: Record<number, Record<number, number>>
  touchPanel: 'profile' | 'people' | 'journal' | 'villager' | null
  detailVillager: VillagerData | null
  dismissedError: string | null
  combinedProps: AppProps
  showGallery: boolean
  showDialogue: boolean
  showAchievementsList: boolean
  showSettingsMenu: boolean
  ephemerealMessage?: string
}

export { App, type AppProps }
