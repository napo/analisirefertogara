// "Informazioni" page as tabs: one group of cards at a time. The first tab ("Il progetto") has the
// donation and the basic explanation of the project. The chosen tab is kept in the address (#info-…), so
// a link can open a given tab and the browser's back button works.
import { useEffect, useState } from 'react'

const PREFIX = '#info-'
const fromHash = (tabs) => {
  const key = globalThis.location?.hash?.startsWith(PREFIX) ? globalThis.location.hash.slice(PREFIX.length) : null
  return tabs.some(([id]) => id === key) ? key : tabs[0][0]
}

export default function InfoTabs({ tabs }) {
  const [active, setActive] = useState(() => fromHash(tabs))
  useEffect(() => {
    const sync = () => setActive(fromHash(tabs))
    globalThis.addEventListener?.('hashchange', sync)
    return () => globalThis.removeEventListener?.('hashchange', sync)
  }, [tabs])
  const choose = (id) => {
    setActive(id)
    try { globalThis.history?.replaceState(null, '', `${PREFIX}${id}`) } catch { /* address not writable: the tab still changes */ }
  }
  const onKeyDown = (event) => {
    const index = tabs.findIndex(([id]) => id === active)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = tabs[(index + step + tabs.length) % tabs.length][0]
    choose(next)
    document.getElementById(`vs-info-tab-${next}`)?.focus()
  }
  const current = tabs.find(([id]) => id === active) || tabs[0]
  return (
    <section className="vs-info">
      <div className="vs-flow-tabs vs-info-tabs" role="tablist" aria-label="Informazioni" onKeyDown={onKeyDown}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`vs-info-tab-${id}`} aria-selected={id === active} aria-controls="vs-info-panel"
            tabIndex={id === active ? 0 : -1} className={`vs-flow-tab${id === active ? ' active' : ''}`} onClick={() => choose(id)}>
            {label}
          </button>
        ))}
      </div>
      <div id="vs-info-panel" role="tabpanel" aria-labelledby={`vs-info-tab-${current[0]}`}>{current[2]}</div>
    </section>
  )
}
