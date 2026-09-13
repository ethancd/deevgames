import React, {useLayoutEffect, useRef, useState} from 'react'
import Villager, {VillagerData} from './villager'
import {ActionData, ActionPillProps} from './action'
import {destinationAction} from './touchControls'
import {placeScenePeople, SceneRect} from './sceneLayout'

interface Props {
  villagers: VillagerData[]
  actionDictionary: Record<string, ActionPillProps>
  giftReceiverIds: Set<number>
  selectedItemId: number | null
  actions: ActionData[]
  compact: boolean
  placeId: number
  placeType?: string
  onPeople: () => void
}

export default function SceneVillagers({villagers, actionDictionary, giftReceiverIds, selectedItemId, actions, compact, placeId, placeType, onPeople}: Props): JSX.Element {
  const list = useRef<HTMLUListElement>(null)
  const [positions, setPositions] = useState<SceneRect[]>([])
  const occupants = [...villagers].sort((a, b) => a.id - b.id)
  const occupantIds = occupants.map(v => v.id).join(',')
  useLayoutEffect(() => {
    const scene = list.current?.closest('#location') as HTMLElement | null
    if (!scene) return
    const targets = Array.from(scene.querySelectorAll<HTMLElement>('.building, .arrow, .local-activity, #local-items, .sell-destination, h2.name, .scene-people, #activities .action-pill, #directions .action-pill, #buildings .action-pill'))
    const measure = () => {
      const origin = scene.getBoundingClientRect()
      const obstacles = targets.filter(el => el.getClientRects().length).map(el => {
        const rect = el.getBoundingClientRect()
        return {x: rect.left - origin.left - scene.clientLeft, y: rect.top - origin.top - scene.clientTop, width: rect.width, height: rect.height}
      })
      const next = placeScenePeople(scene.clientWidth, scene.clientHeight, obstacles, occupants.length, compact, placeType)
      setPositions(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    ;[scene, ...targets].forEach(el => observer.observe(el))
    window.addEventListener('resize', measure)
    // Re-measure when landscape/building art finishes loading or fonts settle.
    scene.addEventListener('load', measure, true)
    let active = true
    void document.fonts?.ready.then(() => { if (active) measure() })
    return () => { active = false; observer.disconnect(); window.removeEventListener('resize', measure); scene.removeEventListener('load', measure, true) }
  }, [placeId, placeType, compact, occupantIds])

  return <>
    <button className="scene-people" type="button" aria-label={`People nearby, ${villagers.length}`} onClick={event => {event.stopPropagation(); onPeople()}}>People · {villagers.length}</button>
    <ul id="scene-villagers" ref={list} aria-label="People in the landscape">
      {occupants.slice(0, positions.length).map((villager, index) => <Villager {...villager} key={villager.id}
        scenePosition={positions[index]}
        actionPill={actionDictionary[`villager-${villager.id}`]} isGiftReceiver={giftReceiverIds.has(villager.id)}
        giftSelected={selectedItemId != null} giftAction={destinationAction(actions, selectedItemId, 'villager', villager.id)} />)}
    </ul>
  </>
}
