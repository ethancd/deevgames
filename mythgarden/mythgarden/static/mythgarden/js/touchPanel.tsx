import React, { useEffect, useRef } from 'react'

export default function TouchPanel({ title, onClose, children }: React.PropsWithChildren<{title: string, onClose: () => void}>): JSX.Element {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current() }
      if (event.key !== 'Tab') return
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"], input, textarea, a[href]') ?? []).filter(node => node.getClientRects().length)
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => { document.removeEventListener('keydown', handleKey, true); previousFocus?.focus() }
  }, [])
  return <div className="touch-panel-overlay" onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose() }}>
    <div ref={panel} className="touch-panel" role="dialog" aria-modal="true" aria-label={title}>
      <div className="touch-panel-heading"><h2>{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>
}
