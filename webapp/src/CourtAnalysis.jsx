// "Configurazioni in campo" and "Confronto delle rotazioni" for one match. Only display: the rally states
// come from rally-state.js, every count from court-stats.js.
import { useMemo, useRef, useState } from 'react'
import { chooseSetter, matchStates, setterVerification } from './rally-state.js'
import { rosterPlayer, isSetter } from './athletes.js'
import { FEW_RALLIES, courtConfigurations } from './court-stats.js'
import { PHASE_COLORS, ROTATION_COLORS } from './theme.js'
import { configurationsReading } from './court-reading.js'
import RotationComparison from './RotationComparison.jsx'
import './court-analysis.css'

const percent = (value, digits = 1) => (value === null ? '—' : `${value.toLocaleString('it-IT', { maximumFractionDigits: digits })}%`)
const players = numbers => numbers.map(n => (n ? `#${n}` : '—')).join(' · ')
const few = rallies => rallies > 0 && rallies < FEW_RALLIES

// Second line; an uncertain libero ("L?⇒#11") is marked and explained, never shown as observed
const LIBERO_UNCERTAIN = 'La presenza del libero in questo tratto è ricostruita dalle informazioni disponibili nel referto e dalle regole di gioco, ma non può essere collocata con certezza rally per rally.'
function BackRow({ labels }) {
  return labels.map((label, i) => (
    <span key={i}>
      {i > 0 && ' · '}
      {label.startsWith('L?')
        ? <span className="vs-court-uncertain" title={LIBERO_UNCERTAIN}>{label}<span className="vs-sr-only"> (presenza del libero non determinabile con certezza)</span></span>
        : label}
    </span>
  ))
}

// P always written, the color swatch is only an extra cue
function PBadge({ P }) {
  if (!P) return <span className="vs-court-muted">non determinata</span>
  return <span className="vs-court-p"><i style={{ background: ROTATION_COLORS[P].fill }} aria-hidden="true" />P{P}</span>
}
function PhaseBadge({ phase }) {
  return <span className="vs-court-phase" style={{ borderColor: PHASE_COLORS[phase] }}>{phase}</span>
}
function Percent({ row }) {
  return <>{percent(row.percent)}{few(row.rallies) && <small className="vs-court-few">pochi rally osservati</small>}</>
}

// Automatic reading under each section (sentences from court-reading.js)
function Reading({ sentences }) {
  return (
    <div className="vs-flow-reading vs-court-reading">
      <h3>Lettura automatica</h3>
      <ul>{sentences.map(sentence => <li key={sentence}>{sentence}</li>)}</ul>
    </div>
  )
}

function PhaseFilter({ value, onChange, all }) {
  return (
    <div className="vs-court-filters" role="group" aria-label="Fase">
      {['all', 'BP', 'CP'].map(phase => (
        <button type="button" key={phase} aria-pressed={value === phase} className="vs-btn vs-btn-sm vs-btn-secondary" onClick={() => onChange(phase)}>
          {phase === 'all' ? all : phase}
        </button>
      ))}
    </div>
  )
}

const CONFIGURATION_ROWS = 15

function Configurations({ rows: allRows, phase, limit = null, onShowAll = null }) {
  if (!allRows.length) return <p>Nessun rally osservato per questo filtro.</p>
  const rows = limit ? allRows.slice(0, limit) : allRows
  return (
    <div className="vs-court-scroll">
      <table className="vs-court-table">
        <thead>
          <tr>
            {phase === 'all' && <th scope="col">Fase</th>}
            {phase !== 'CP' && <th scope="col">Al servizio</th>}
            <th scope="col">Prima linea</th><th scope="col">Seconda linea</th><th scope="col">P</th><th scope="col">Rally</th><th scope="col">Vinti</th><th scope="col">Persi</th><th scope="col">% vinti</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} title={`${row.server ? `Con #${row.server} al servizio e ` : 'Con '}${players(row.frontRow)} in prima linea la squadra ha vinto ${row.won} dei ${row.rallies} rally osservati.`}>
              {phase === 'all' && <td><PhaseBadge phase={row.phase} /></td>}
              {phase !== 'CP' && <td>{row.server ? `#${row.server}` : '—'}</td>}
              <td>{players(row.frontRow)}</td>
              <td><BackRow labels={row.backRow} /></td>
              <td><PBadge P={row.P} /></td>
              <td>{row.rallies}</td><td>{row.won}</td><td>{row.lost}</td>
              <td><Percent row={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length < allRows.length && (
        <p className="vs-court-note">
          Mostrate le {rows.length} configurazioni con più rally osservati su {allRows.length}.
          {onShowAll && <> <button type="button" className="vs-btn vs-btn-sm vs-btn-secondary" onClick={onShowAll}>Mostra tutte</button></>}
        </p>
      )}
    </div>
  )
}

function SetterChoices({ match, ambiguities, saving, save, detailsRef, open }) {
  return (
    <details className="vs-card vs-court-setters" ref={detailsRef}>
      <summary>Palleggiatori{open && <span className="vs-court-verify-badge">da verificare</span>}</summary>
      <p>Segna tutti i possibili palleggiatori delle due squadre. Se in campo ce n&apos;è uno solo, l&apos;app lo riconosce da sola; se ce ne sono due o più, la P resta non determinata finché non indichi chi palleggiava in quel tratto.</p>
      <div className="vs-court-rosters">
        {[['roster', match.team], ['opponentRoster', match.opponent]].map(([key, name]) => (
          <fieldset key={key} disabled={saving}>
            <legend>{name}</legend>
            {(match[key] || []).map(rosterPlayer).map((player, index) => (
              <label key={`${player.number}-${index}`}>
                <input
                  type="checkbox"
                  checked={isSetter(player)}
                  onChange={event => save({
                    ...match,
                    [key]: match[key].map((current, i) => (i === index ? { ...rosterPlayer(current), isSetter: event.target.checked, setterRole: '' } : current)),
                  })}
                />
                #{player.number} {player.name}
              </label>
            ))}
            {!match[key]?.length && <p>Elenco atleti non disponibile: aggiungi gli atleti nella modifica del referto.</p>}
          </fieldset>
        ))}
      </div>
      {ambiguities.map(stretch => {
        const name = `setter-${stretch.set}-${stretch.team}-${stretch.from}`
        const roster = ((stretch.team === 'own' ? match.roster : match.opponentRoster) || []).map(rosterPlayer)
        return (
          <fieldset key={name} disabled={saving} className="vs-court-choice">
            <legend>Chi palleggiava in questa fase?</legend>
            <p>{stretch.team === 'own' ? match.team : match.opponent} · Set {stretch.set} · rally {stretch.from}–{stretch.to} · {stretch.candidates.map(n => `#${n}`).join(' e ')} in campo insieme</p>
            {[...stretch.candidates, null].map(number => (
              <label key={number ?? 'unknown'}>
                <input type="radio" name={name} checked={stretch.choice === number} onChange={() => save(chooseSetter(match, stretch, number))} />
                {number === null ? 'Non so' : `#${number} ${roster.find(p => Number(p.number) === Number(number))?.name || ''}`}
              </label>
            ))}
          </fieldset>
        )
      })}
    </details>
  )
}

export default function CourtAnalysis({ match, onUpdate, printing = false, includeInPdf = () => true, printToggle = () => null }) {
  const sets = useMemo(() => matchStates(match), [match])
  const states = useMemo(() => sets.flatMap(set => set.states), [sets])
  const ambiguities = useMemo(() => sets.flatMap(set => set.ambiguities), [sets])
  const verification = useMemo(() => setterVerification(match, sets), [match, sets])
  const [configPhase, setConfigPhase] = useState('all')
  const [allConfigurations, setAllConfigurations] = useState(false)
  const [saving, setSaving] = useState(false)
  const choicesRef = useRef(null)
  const configurations = useMemo(() => courtConfigurations(states, configPhase), [states, configPhase])
  const configurationSentences = useMemo(() => configurationsReading(states, { team: match.team, phase: configPhase }), [states, configPhase, match.team])
  const save = async next => {
    setSaving(true)
    try { await onUpdate(next) } finally { setSaving(false) }
  }
  const clarify = () => {
    const node = choicesRef.current
    if (!node) return
    node.open = true
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.querySelector('input')?.focus({ preventScroll: true })
  }

  return (
    <div className="vs-court-analysis">
      {!printing && <SetterChoices match={match} ambiguities={ambiguities} saving={saving} save={save} detailsRef={choicesRef} open={verification.open} />}

      <RotationComparison match={match} sets={sets} states={states} printing={printing} includeInPdf={includeInPdf} printToggle={printToggle} verification={verification} onVerify={clarify} />

      {!(printing && !includeInPdf('configurations')) && <section className="vs-card">
        <div className="vs-court-title"><h2 className="vs-card-title">Configurazioni in campo</h2>{printToggle('configurations')}</div>
        <p className="vs-card-subtitle">
          Rally osservati per atleta al servizio, prima linea (posti 2, 3 e 4), seconda linea (posti 1, 6 e 5) e P. Vinti e persi sono della squadra mentre quella configurazione era in campo: non sono punti dei singoli atleti.
        </p>
        {!printing && <PhaseFilter value={configPhase} onChange={setConfigPhase} all="Tutte" />}
        <p className="vs-court-note">Fase: {configPhase === 'all' ? 'Tutte' : configPhase} · ordinate per numero di rally osservati · L#5⇒#11 = libero #5 in campo al posto di #11; L?⇒#11 = presenza del libero non determinabile con certezza (non è una presenza osservata).</p>
        <Configurations
          rows={configurations}
          phase={configPhase}
          limit={allConfigurations && !printing ? null : CONFIGURATION_ROWS}
          onShowAll={printing ? null : () => setAllConfigurations(true)}
        />
        <Reading sentences={configurationSentences} />
        {states.some(state => !state.teams.own.reliable) && (
          <p className="vs-court-note">I rally la cui formazione non è ricostruibile con certezza sono esclusi: verifica formazioni, punteggi e sostituzioni.</p>
        )}
      </section>}
    </div>
  )
}
