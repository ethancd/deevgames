import { useState } from 'react'
import SubjectPicker from './components/SubjectPicker.jsx'
import GeologyApp from './components/GeologyApp.jsx'
import PeriodicApp from './components/periodic/PeriodicApp.jsx'

// Remember which subject you were in, so a page reload returns you there (to that
// subject's home) instead of dumping you back on the subject picker.
const SUBJECT_KEY = 'active-subject-v1'

function readSubject() {
  try {
    const v = localStorage.getItem(SUBJECT_KEY)
    return v === 'geology' || v === 'periodic' ? v : null
  } catch {
    return null
  }
}

export default function App() {
  const [subject, setSubject] = useState(readSubject)

  const choose = (s) => {
    try {
      if (s) localStorage.setItem(SUBJECT_KEY, s)
      else localStorage.removeItem(SUBJECT_KEY)
    } catch {
      /* ignore */
    }
    setSubject(s)
  }
  const back = () => choose(null)

  let content
  if (subject === 'geology') content = <GeologyApp onExitSubject={back} />
  else if (subject === 'periodic') content = <PeriodicApp onExitSubject={back} />
  else content = <SubjectPicker onPick={choose} />

  return <div className="app">{content}</div>
}
