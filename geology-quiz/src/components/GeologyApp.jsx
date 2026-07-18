import { useState } from 'react'
import { decks } from '../data/decks.js'
import Home from './Home.jsx'
import DeckMenu from './DeckMenu.jsx'
import Training from './Training.jsx'
import Test from './Test.jsx'
import Gauntlet from './Gauntlet.jsx'

// The geology subject — the original hand-rolled router, unchanged except for the
// onExitSubject hook passed to Home (the "‹ Subjects" back button).
export default function GeologyApp({ onExitSubject }) {
  const [screen, setScreen] = useState({ name: 'home' })

  const go = (s) => {
    window.scrollTo(0, 0)
    setScreen(s)
  }

  const deck = screen.deckId ? decks.find((d) => d.id === screen.deckId) : null

  switch (screen.name) {
    case 'deck':
      return <DeckMenu deck={deck} onBack={() => go({ name: 'home' })} onStart={go} />
    case 'training':
      return (
        <Training
          deck={deck}
          dir={screen.dir}
          tag={screen.tag}
          onExit={() => go({ name: 'deck', deckId: deck.id })}
        />
      )
    case 'test':
      return (
        <Test
          deck={deck}
          dir={screen.dir}
          tag={screen.tag}
          length={screen.length}
          onExit={() => go({ name: 'deck', deckId: deck.id })}
          onHome={() => go({ name: 'home' })}
        />
      )
    case 'gauntlet':
      return <Gauntlet onExit={() => go({ name: 'home' })} />
    default:
      return (
        <Home
          onPick={(id) => go({ name: 'deck', deckId: id })}
          onOpenGauntlet={() => go({ name: 'gauntlet' })}
          onExitSubject={onExitSubject}
        />
      )
  }
}
