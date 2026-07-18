// Landing screen: choose a subject.
export default function SubjectPicker({ onPick }) {
  return (
    <div className="home screen subject-picker">
      <header className="home-head">
        <h1>
          <span className="logo-emoji">🎓</span> Master Decks
        </h1>
        <p className="tagline">Pick a subject to master</p>
      </header>

      <div className="subject-grid">
        <button className="subject-tile" style={{ '--accent': '#2563eb' }} onClick={() => onPick('geology')}>
          <div className="subject-emoji">🌋</div>
          <div className="subject-title">Geology</div>
          <div className="subject-sub">Rocks, minerals & deep time</div>
        </button>
        <button className="subject-tile" style={{ '--accent': '#0d9488' }} onClick={() => onPick('periodic')}>
          <div className="subject-emoji">⚛️</div>
          <div className="subject-title">Periodic Table</div>
          <div className="subject-sub">118 elements, blocks & families</div>
        </button>
      </div>

      <footer className="home-foot">Two worlds to conquer • Works offline</footer>
    </div>
  )
}
