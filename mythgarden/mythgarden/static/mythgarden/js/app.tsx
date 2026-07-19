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
      ephemerealMessage: undefined
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
      this.setState({ combinedProps })
    }
  }

  componentDidMount (): void {
    this.scrollToMessageBottom()
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
    messageContainer.scrollTop = messageContainer.scrollHeight
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

      const {emoji, costAmount, costType, waitClass} = action

      actionDictionary[key] = {emoji, costAmount, costType, waitClass}
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
    this.setState({ showGallery: false, showDialogue: false, showAchievementsList: false, showSettingsMenu: false, ephemerealMessage: undefined })
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
    const pageClassName = isProduction ? 'production' : ''

    return (
      <FilterizeColorContext.Provider value={ filterFn }>
        <ImageFilterContext.Provider value={imageFilter}>
        <DndProvider backend={TouchBackend} options={{enableMouseEvents: true}}>
        <Section id="page" className={pageClassName} baseColor={colors.whiteYellow} handleClick={this.handleClick.bind(this)}>

          <Section id="top-bar" baseColor={colors.skyBlue}>
            <Hero {...hero} achievementsCount={achievements.length} totalAchievements={TOTAL_ACHIEVEMENTS}></Hero>
            <Gallery {...{show: showGallery, currentPortraitUrl: hero.imageUrl, portraitUrls} }></Gallery>
            <AchievementsList show={showAchievementsList} achievements={achievements} totalAchievements={TOTAL_ACHIEVEMENTS}></AchievementsList>
            <button className="hamburger-button" onClick={() => this.showSettingsMenu()}>☰</button>
            <DeployInfo branchName={branchName} deployTime={deployTime} />
            <SettingsMenu
              show={showSettingsMenu}
              onClose={() => this.clearActiveUX()}
              currentPortraitUrl={hero.imageUrl}
              portraitUrls={portraitUrls}
              heroName={hero.name}
              isDefaultName={hero.isDefaultName}
            />
            <h1 id="logo"><RainbowText text={'Mythgarden'}></RainbowText></h1>
            <div className='column'>
              <Clock {...clock}></Clock>
              <BonusStats boostLevel={hero.boostLevel} luckPercent={hero.luckPercent}></BonusStats>
            </div>
            <Sky time={clock.time} dayNumber={clock.dayNumber}></Sky>
          </Section>

          <div id="main-area">
            <section id="sidebar">
              <ItemsList
                id='inventory'
                baseColor={colors.whiteYellow}
                items={inventory}
                actionDictionary={actionDictionary}
                giftable={true}
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
                  ></ItemsList>
                  : null
                }
              </Location>

              <List id='message-log' baseColor={colors.whiteYellow}>
                {messages?.map(message => Message({ ...message }))}
                {ephemerealMessage ? Message({text: ephemerealMessage, isError: true, id: EPHEMEREAL_MSG_ID}) : null}
              </List>
            </section>
            <section id='far-sidebar'>
              <VillagersList villagers={villagerStates}
                           actionDictionary={actionDictionary}
                           giftReceiverIds={giftReceiverIds}
              ></VillagersList>
              {(showDialogue && dialogue != null) ? <Dialogue {...dialogue} affinity={speaker?.affinity} key={dialogue.id}></Dialogue> : null}
            </section>
          </div>
        </Section>
          </DndProvider>
          </ImageFilterContext.Provider>
      </FilterizeColorContext.Provider>
    )
  }
}

type ActionRecord = Record<string, ActionPillProps>

interface AppProps {
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
  combinedProps: AppProps
  showGallery: boolean
  showDialogue: boolean
  showAchievementsList: boolean
  showSettingsMenu: boolean
  ephemerealMessage?: string
}

export { App, type AppProps }
