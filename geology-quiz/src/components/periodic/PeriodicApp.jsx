import { useState } from 'react'
import { getNode } from '../../data/elements.js'
import { DIRECTIONS } from '../../periodic/quiz.js'
import PeriodicHome from './PeriodicHome.jsx'
import ElementDeckMenu from './ElementDeckMenu.jsx'
import PtTraining from './PtTraining.jsx'
import PtTest from './PtTest.jsx'
import GradualGauntlet from './GradualGauntlet.jsx'
import GrandGauntlet from './GrandGauntlet.jsx'

// The periodic subject router (mirrors GeologyApp).
export default function PeriodicApp({ onExitSubject }) {
  const [screen, setScreen] = useState({ name: 'ptHome' })
  const go = (s) => {
    window.scrollTo(0, 0)
    setScreen(s)
  }

  const node = screen.nodeId ? getNode(screen.nodeId) : null
  const dir = screen.dirId ? DIRECTIONS.find((d) => d.id === screen.dirId) : null

  switch (screen.name) {
    case 'ptDeck':
      return <ElementDeckMenu node={node} onBack={() => go({ name: 'ptHome' })} onStart={go} />
    case 'ptTraining':
      return <PtTraining node={node} dir={dir} onExit={() => go({ name: 'ptDeck', nodeId: node.id })} />
    case 'ptTest':
      return <PtTest node={node} dir={dir} onExit={() => go({ name: 'ptDeck', nodeId: node.id })} />
    case 'ptGradual':
      return <GradualGauntlet onExit={() => go({ name: 'ptHome' })} />
    case 'ptGrand':
      return <GrandGauntlet onExit={() => go({ name: 'ptHome' })} />
    default:
      return (
        <PeriodicHome
          onPickNode={(id) => go({ name: 'ptDeck', nodeId: id })}
          onOpenGradual={() => go({ name: 'ptGradual' })}
          onOpenGrand={() => go({ name: 'ptGrand' })}
          onExitSubject={onExitSubject}
        />
      )
  }
}
