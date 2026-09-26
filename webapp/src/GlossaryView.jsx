import React, { useEffect, useId, useRef, useState } from 'react'
import { glossaryEntries, glossaryEntry, glossaryFull, glossaryTerm, glossaryTooltip } from './glossary'

// Contextual help "ⓘ": opens on hover, keyboard focus and tap; Escape closes it. The same definition is
// always available in the glossary too.
export function InfoTip({ id }) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  const ref = useRef(null)
  const text = glossaryTooltip(id)
  useEffect(() => {
    if (!open) return undefined
    const close = event => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', close)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('pointerdown', close)
    }
  }, [open])
  return (
    <span className={`vs-infotip${open ? ' open' : ''}`} ref={ref}>
      <button
        type="button"
        className="vs-infotip-button"
        aria-label={`Che cosa significa: ${glossaryEntry(id).term}`}
        aria-expanded={open}
        aria-describedby={tipId}
        onClick={event => {
          event.stopPropagation()
          setOpen(value => !value)
        }}
      >
        i
      </button>
      <span role="tooltip" id={tipId} className="vs-infotip-text">{text}</span>
    </span>
  )
}

// Full glossary (Informazioni page)
export function GlossaryList() {
  return (
    <dl className="vs-glossary-list">
      {glossaryEntries('info').map(entry => (
        <div key={entry.id} className="vs-glossary-item">
          <dt>{glossaryTerm(entry)}</dt>
          <dd>{glossaryFull(entry)}</dd>
        </div>
      ))}
    </dl>
  )
}

// Compact, collapsible glossary (Analisi page), closed by default
export function GlossaryDetails() {
  return (
    <details className="vs-glossary-details">
      <summary>Glossario</summary>
      <dl className="vs-glossary-compact">
        {glossaryEntries('analysis').map(entry => (
          <div key={entry.id}>
            <dt>{glossaryTerm(entry)}</dt>
            <dd>{entry.short}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

// Compact two-column table, last block of the PDF / print report (hidden on screen)
export function GlossaryPrintTable() {
  return (
    <section className="vs-glossary-print" aria-label="Glossario del report">
      <h2>Glossario</h2>
      <table>
        <thead>
          <tr>
            <th>Termine</th>
            <th>Significato</th>
          </tr>
        </thead>
        <tbody>
          {glossaryEntries('pdf').map(entry => (
            <tr key={entry.id}>
              <th scope="row">{glossaryTerm(entry)}</th>
              <td>{entry.short}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
