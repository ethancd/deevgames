import type { ActionData } from './action'

export const TOUCH_UI_STORAGE_KEY = 'mythgarden.touch-ui.v1'
export const SLOT_STORAGE_KEY = 'mythgarden.destination-slots.v1'

export function arrangeSlots<T extends {id: number, placementId?: number}>(items: T[], placements: Record<number, number> = {}): Array<T | null> {
  const slots: Array<T | null> = Array(6).fill(null)
  const unplaced: T[] = []
  for (const item of items) {
    const index = placements?.[item.placementId ?? item.id]
    if (Number.isInteger(index) && index >= 0 && index < 6 && slots[index] == null) slots[index] = item
    else unplaced.push(item)
  }
  for (const item of unplaced) {
    const free = slots.indexOf(null)
    if (free < 0) slots.push(item)
    else slots[free] = item
  }
  return slots
}

export function readTouchPreference(storage?: Pick<Storage, 'getItem'>): boolean {
  try { return storage?.getItem(TOUCH_UI_STORAGE_KEY) !== 'off' } catch { return true }
}

export function actionCost(action?: Pick<ActionData, 'costAmount' | 'costType'>): string {
  if (action?.costAmount == null) return ''
  const amount = action.costAmount
  if (action.costType === 'money') return `${amount} fleurs`
  if (action.costType !== 'time') return ''
  return amount >= 60 ? `${Math.floor(amount / 60)}h${amount % 60 ? ` ${amount % 60}m` : ''}` : `${amount}m`
}

// Resolve only digests actually offered by the server. Selecting an item must
// never fall through to TALK, BUY, WATER or another unrelated action.
export function destinationAction(actions: ActionData[], itemId: number | null, target: 'soil' | 'storage' | 'sell' | 'villager', receiverId?: number, localCount = 0): ActionData | undefined {
  if (itemId == null) return undefined
  if ((target === 'soil' || target === 'storage') && localCount >= 6) return undefined
  const digest = target === 'villager' ? `GIVE-${itemId}-${receiverId}` : `${{soil: 'PLANT', storage: 'STOW', sell: 'SELL'}[target]}-${itemId}`
  return actions.find(action => action.uniqueDigest === digest)
}

export function activateOnKey(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    event.currentTarget.click()
  }
}
