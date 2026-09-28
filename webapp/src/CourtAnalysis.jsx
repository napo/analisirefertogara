// "Configurazioni in campo" and "Confronto delle rotazioni" for one match. Only display: the rally states
// come from rally-state.js, every count from court-stats.js.
import { useMemo, useRef, useState } from 'react'
import { chooseSetter, matchStates, setterVerification } from './rally-state.js'
import { rosterPlayer, isSetter } from './athletes.js'
import { FEW_RALLIES, cellDetail, courtConfigurations, filterSet, heatColor, rotationMatrix } from './court-stats.js'
import { HEAT_COLORS, PHASE_COLORS, ROTATION_COLORS } from './theme.js'
import { cellSentence, configurationsReading, matrixGuide, matrixReading } from './court-reading.js'
import './court-analysis.css'

const percent = (value, digits = 1) => (value === null ? '—' : `${value.toLocaleString('it-IT', { maximumFractionDigits: digits })}%`)
const players = numbers => numbers.map(n => (n ? `#${n}` : '—')).join(' · ')
const rotationLabel = index => (index === 6 ? 'TUTTE' : `P${index + 1}`)
const phaseLabel = phase => (phase === 'all' ? 'Tutti' : phase)
const EXCLUSION_TEXT = {
  unmarked: 'nessun possibile palleggiatore segnato nell’elenco atleti.',
  none: 'nessun palleggiatore segnato in campo: spesso è una scelta tattica (per esempio finché la squadra è in fase BP) e in quei rally la P non è determinata. Se chi è entrato al suo posto palleggiava, segnalo come possibile palleggiatore.',
  ambiguous: 'due o più palleggiatori in campo insieme: indica chi palleggiava.',
  unknown: 'hai indicato “Non so” per chi palleggiava.',
  unreliable: 'formazione non ricostruibile con certezza (controlla punteggi di sostituzioni e turni).',
}
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

// Set filter of the matrix: every set with its final score
function SetFilter({ sets, value, onChange }) {
  return (
    <div className="vs-court-filters" role="group" aria-label="Set">
      <button type="button" aria-pressed={value === 'all'} className="vs-btn vs-btn-sm vs-btn-secondary" onClick={() => onChange('all')}>Tutti i set</button>
      {sets.filter(set => set.states.length).map(set => {
        const last = set.states.at(-1).score
        return (
          <button type="button" key={set.set} aria-pressed={value === set.set} className="vs-btn vs-btn-sm vs-btn-secondary" onClick={() => onChange(set.set)}>
            Set {set.set} <small>{last.own}-{last.other}</small>
          </button>
        )
      })}
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

const RALLY_ROWS = 15

// The rallies behind a cell: set, score, phase, who served, who won (to check them on the scoresheet)
function RallyList({ list, team, opponent }) {
  const [all, setAll] = useState(false)
  const rows = all ? list : list.slice(0, RALLY_ROWS)
  const name = side => (side === 'own' ? team : opponent)
  return (
    <div className="vs-court-rallies">
      <h4>Da quali rally deriva</h4>
      <div className="vs-court-scroll">
        <table className="vs-court-table">
          <thead><tr><th scope="col">Set</th><th scope="col">Rally</th><th scope="col">Punteggio</th><th scope="col">Fase</th><th scope="col">Al servizio</th><th scope="col">Vinto da</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.matchId}-${r.set}-${r.rally}`}>
                <td>{r.set}</td>
                <td>{r.rally}°</td>
                <td>{r.before.own}-{r.before.other} → {r.after.own}-{r.after.other}</td>
                <td><PhaseBadge phase={r.phase} /></td>
                <td>{r.server ? `#${r.server}` : '—'} <small className="vs-court-muted">{name(r.servingTeam)}</small></td>
                <td>{name(r.winner)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length < list.length && (
        <p className="vs-court-note">
          Mostrati {rows.length} rally su {list.length}.{' '}
          <button type="button" className="vs-btn vs-btn-sm vs-btn-secondary" onClick={() => setAll(true)}>Mostra tutti</button>
        </p>
      )}
    </div>
  )
}

function Detail({ detail, selected, phase, set = 'all', team, opponent, onClose }) {
  const title = `${rotationLabel(selected[0])} contro ${rotationLabel(selected[1])}`
  return (
    <section className="vs-court-detail" aria-label={`Dettaglio ${title}`} aria-live="polite">
      <div className="vs-court-detail-head">
        <h3>{title} · {set === 'all' ? 'Tutti i set' : `Set ${set}`} · {phaseLabel(phase)}</h3>
        <button type="button" className="vs-btn vs-btn-sm vs-btn-secondary" onClick={onClose}>Chiudi dettaglio</button>
      </div>
      {detail.rallies === 0 ? <p>Nessun rally osservato in questa combinazione.</p> : <>
        <p className="vs-court-detail-total">
          <strong>{detail.rallies} rally</strong> · {detail.won} vinti · {detail.lost} persi · <strong>{percent(detail.percent)}</strong>
          {few(detail.rallies) && <small className="vs-court-few">pochi rally osservati</small>}
        </p>
        <p>{cellSentence(detail, selected[0], selected[1], { team, opponent, phase, set })}</p>
        {phase === 'all' && (
          <p className="vs-court-detail-phases">
            <PhaseBadge phase="BP" /> {detail.BP.rallies} rally · {detail.BP.won}/{detail.BP.rallies} · {percent(detail.BP.percent)}
            <br />
            <PhaseBadge phase="CP" /> {detail.CP.rallies} rally · {detail.CP.won}/{detail.CP.rallies} · {percent(detail.CP.percent)}
          </p>
        )}
        <div className="vs-court-detail-columns">
          {[['Nostra prima linea', detail.ownFrontRows], ['Prima linea avversaria', detail.otherFrontRows]].map(([heading, rows]) => (
            <div key={heading}>
              <h4>{heading}</h4>
              <ul>{rows.map(row => <li key={row.key}>{players(row.players)} — {row.rallies} rally</li>)}</ul>
            </div>
          ))}
          {[['Nostra seconda linea', detail.ownBackRows], ['Seconda linea avversaria', detail.otherBackRows]].map(([heading, rows]) => (
            <div key={heading}>
              <h4>{heading}</h4>
              <ul>{rows.map(row => <li key={row.key}><BackRow labels={row.labels} /> — {row.rallies} rally</li>)}</ul>
            </div>
          ))}
          {detail.servers.length > 0 && (
            <div>
              <h4>Al servizio (BP)</h4>
              <ul>{detail.servers.map(row => <li key={row.key}>#{row.number} — {row.rallies} rally</li>)}</ul>
            </div>
          )}
        </div>
        <RallyList key={`${selected}-${phase}-${set}`} list={detail.list} team={team} opponent={opponent} />
      </>}
    </section>
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
  const [matrixPhase, setMatrixPhase] = useState('all')
  const [matrixSet, setMatrixSet] = useState('all')
  const matrixStates = useMemo(() => filterSet(states, matrixSet), [states, matrixSet])
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)
  const choicesRef = useRef(null)
  const matrix = useMemo(() => rotationMatrix(matrixStates, matrixPhase), [matrixStates, matrixPhase])
  const configurations = useMemo(() => courtConfigurations(states, configPhase), [states, configPhase])
  const matrixSentences = useMemo(() => matrixReading(matrixStates, { team: match.team, opponent: match.opponent, phase: matrixPhase, set: matrixSet }), [matrixStates, matrixPhase, matrixSet, match.team, match.opponent])
  const configurationSentences = useMemo(() => configurationsReading(states, { team: match.team, phase: configPhase }), [states, configPhase, match.team])
  const guide = useMemo(() => matrixGuide(matrixStates, { team: match.team, opponent: match.opponent, phase: matrixPhase, set: matrixSet }), [matrixStates, match.team, match.opponent, matrixPhase, matrixSet])
  const detail = selected ? cellDetail(matrixStates, selected[0], selected[1], matrixPhase) : null
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

      {!(printing && (verification.open || !includeInPdf('matchup'))) && <section className="vs-card vs-court-matrix-card">
        <div className="vs-court-title"><h2 className="vs-card-title">Confronto delle rotazioni</h2>{printToggle('matchup')}</div>
        {verification.open && (
          <p className="vs-court-verify-note">
            Palleggiatori da verificare{verification.unmarked.length ? ` (nessun possibile palleggiatore segnato per ${verification.unmarked.map(team => (team === 'own' ? match.team : match.opponent)).join(' e ')})` : ''}{verification.pending.length ? ` (${verification.pending.length} ${verification.pending.length === 1 ? 'tratto' : 'tratti'} con più palleggiatori in campo)` : ''}: fino a che non è verificato non apparirà nella stampa del PDF.
            {' '}<button type="button" className="vs-btn vs-btn-sm vs-court-verify" onClick={clarify}>Verifica</button>
          </p>
        )}
        <div className="vs-court-guide">
          <h3>Come si legge</h3>
          <p>{guide.rows} {guide.p}</p>
          <p>{guide.cell}</p>
          {guide.example && <p><strong>{guide.example}</strong></p>}
          {!printing && <p>Tocca una cella per vedere da quali rally deriva il numero, con set, punteggio, fase e chi era al servizio.</p>}
        </div>
        {!printing && (
          <div className="vs-court-filter-rows">
            <SetFilter sets={sets} value={matrixSet} onChange={setMatrixSet} />
            <PhaseFilter value={matrixPhase} onChange={setMatrixPhase} all="Tutti" />
          </div>
        )}
        <p className="vs-court-note">{matrixSet === 'all' ? 'Tutti i set' : `Set ${matrixSet}`} · Fase: {phaseLabel(matrixPhase)}</p>
        <div className="vs-court-scroll">
          <table className="vs-court-matrix">
            <caption className="vs-sr-only">Rotazione di {match.team} (righe) contro rotazione di {match.opponent} (colonne): percentuale di rally vinti da {match.team} e rally vinti sul totale</caption>
            <thead>
              <tr>
                <th className="vs-court-axis" />
                <th scope="colgroup" colSpan={7} className="vs-court-axis">{match.opponent} in… →</th>
              </tr>
              <tr>
                <th scope="col" className="vs-court-axis">{match.team} in… ↓</th>
                {matrix.cells[0].map((_, col) => (
                  <th scope="col" key={col}>{col === 6 ? 'TUTTE' : <PBadge P={col + 1} />}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.cells.map((row, r) => (
                <tr key={r}>
                  <th scope="row">{r === 6 ? 'TUTTE' : <PBadge P={r + 1} />}</th>
                  {row.map((cell, c) => {
                    const label = `${rotationLabel(r)} contro ${rotationLabel(c)}. ${cellSentence(cell, r, c, { team: match.team, opponent: match.opponent, phase: matrixPhase, set: matrixSet })}${few(cell.rallies) ? ' Pochi rally osservati.' : ''}`
                    const content = cell.rallies
                      ? <><strong>{percent(cell.percent, 0)}</strong><small>{cell.won}/{cell.rallies}</small></>
                      : <strong aria-hidden="true">—</strong>
                    const classes = [r === 6 || c === 6 ? 'vs-court-total' : '', cell.rallies ? '' : 'vs-court-empty'].filter(Boolean).join(' ')
                    return (
                      <td key={c} style={{ background: heatColor(cell) }} className={classes || undefined}>
                        {printing
                          ? <div className="vs-court-cell">{content}</div>
                          : <button type="button" className="vs-court-cell" aria-label={label} title={label} aria-pressed={selected?.[0] === r && selected?.[1] === c} onClick={() => setSelected([r, c])}>{content}</button>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="vs-court-legend" aria-label="Legenda: percentuale di rally vinti">
          <span>% rally vinti</span>
          <span className="vs-court-legend-bar" style={{ background: `linear-gradient(90deg, ${heatColor({ rallies: 1e6, percent: 0 })}, ${HEAT_COLORS.neutral}, ${heatColor({ rallies: 1e6, percent: 100 })})` }} />
          <span>0% — 50% — 100%</span>
          <span className="vs-court-legend-empty">— nessun rally osservato</span>
        </div>
        <p className="vs-court-note">
          TUTTE è calcolata direttamente sui rally, non come media delle celle. Con pochi rally la tinta è più tenue, ma la percentuale scritta non cambia. Il colore non indica una combinazione migliore o peggiore: leggi sempre anche il numero di rally.
        </p>
        {matrix.excluded > 0 && (
          <div className="vs-court-excluded">
            <p>{matrix.excluded} rally non inclusi perché una delle rotazioni non è determinata:</p>
            <ul>
              {matrix.reasons.map(reason => (
                <li key={`${reason.team}-${reason.reason}`}>
                  {reason.team === 'own' ? match.team : match.opponent}: {reason.rallies} rally{reason.sets.length ? ` (set ${reason.sets.join(', ')})` : ''} — {EXCLUSION_TEXT[reason.reason]}
                </li>
              ))}
            </ul>
            {!printing && <button type="button" className="vs-btn vs-btn-sm vs-court-verify" onClick={clarify}>Verifica</button>}
          </div>
        )}
        <Reading sentences={matrixSentences} />
        {!printing && detail && <Detail detail={detail} selected={selected} phase={matrixPhase} set={matrixSet} team={match.team} opponent={match.opponent} onClose={() => setSelected(null)} />}
      </section>}

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
