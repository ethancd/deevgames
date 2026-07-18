// Shared multiple-choice option block (same markup/CSS as the geology quiz).
export default function McOptions({ q, picked, onChoose }) {
  return (
    <div className="options">
      {q.options.map((opt) => {
        let cls = 'option'
        if (picked) {
          if (opt === q.correct) cls += ' correct'
          else if (opt === picked) cls += ' wrong'
          else cls += ' dim'
        }
        return (
          <button key={opt} className={cls} onClick={() => onChoose(opt)} disabled={!!picked}>
            <span className="opt-body">
              <span className="opt-text">{opt}</span>
            </span>
            {picked && opt === q.correct && <span className="opt-mark">✓</span>}
            {picked && opt === picked && opt !== q.correct && <span className="opt-mark">✗</span>}
          </button>
        )
      })}
    </div>
  )
}
