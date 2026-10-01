// "Confronto delle rotazioni": every P of the analyzed team (rows) against every P of the opponent
// (columns), with the rallies in BP and in CP apart. Only display: the rally states come from
// rally-state.js, every count from court-stats.js.
// Screen: filters (set, measure, double change), summary, grid, detail of the selected cell (by default the
// most profitable P). PDF: whole match, one grid per set (own "Includi nel PDF"), detail of the most
// profitable P and of the P most in difficulty, double changes.
import { useMemo, useState } from 'react'
import {
  COMPARISON_MIN_RALLIES, PHASES, comparisonStates, courtsOnField, doubleChangeStretches, filterSet, formations,
  isDoubleChange, rotationComparison,
} from './court-stats.js'
import { COMPARISON_COLORS, EVENT_COLORS, PHASE_COLORS, ROTATION_COLORS } from './theme.js'

const MEASURES = [['difference', 'Vinti − persi'], ['average', 'Rispetto alla media']]
const DOUBLE_CHANGE_FILTERS = [['all', 'Inclusi'], ['exclude', 'Esclusi'], ['only', 'Solo DC']]
const measureName = measure => (measure === 'average' ? 'rispetto alla media' : 'vinti − persi')
const EXCLUSION_TEXT = {
  unmarked: 'nessun possibile palleggiatore segnato nell’elenco atleti.',
  none: 'nessun palleggiatore segnato in campo: spesso è una scelta tattica (per esempio finché la squadra è in fase BP) e in quei rally la P non è determinata. Se chi è entrato al suo posto palleggiava, segnalo come possibile palleggiatore.',
  ambiguous: 'due o più palleggiatori in campo insieme: indica chi palleggiava.',
  unknown: 'hai indicato “Non so” per chi palleggiava.',
  unreliable: 'formazione non ricostruibile con certezza (controlla punteggi di sostituzioni e turni).',
}
// Positions as drawn: net on top, front row 4 3 2, back row 5 6 1
const COURT_ORDER = [4, 3, 2, 5, 6, 1]

const signed = (value, measure) => {
  if (Math.abs(value) < 0.05) return measure === 'average' ? '0,0' : '0'
  const text = measure === 'average'
    ? Math.abs(value).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : String(Math.abs(value))
  return `${value > 0 ? '+' : '−'}${text}`
}
const flagOf = (comparison, row) => (comparison.best?.P === row + 1 ? 'best' : comparison.worst?.P === row + 1 ? 'worst' : null)
const FLAG_TEXT = { best: 'più redditizia', worst: 'più in difficoltà' }

function PBadge({ P }) {
  return <span className="vs-rc-p"><i style={{ background: ROTATION_COLORS[P].fill }} aria-hidden="true" />P{P}</span>
}

// Nominal formation (libero excluded) with the setter marked
function Formation({ formation, others = 0 }) {
  if (!formation) return null
  const { positions, setter } = formation
  const label = `Prima linea 4, 3, 2: ${[4, 3, 2].map(p => positions[p - 1] || '—').join(', ')}; seconda linea 5, 6, 1: ${[5, 6, 1].map(p => positions[p - 1] || '—').join(', ')}${setter ? `; palleggiatore #${setter}` : ''}`
  return (
    <>
      <span className="vs-rc-formation" role="img" aria-label={label} title={label}>
        {COURT_ORDER.map(position => {
          const number = positions[position - 1]
          return <span key={position} className={number && number === setter ? 'setter' : undefined}>{number || '—'}</span>
        })}
      </span>
      {others > 0 && <span className="vs-rc-more">+{others} {others === 1 ? 'altra' : 'altre'}</span>}
    </>
  )
}
function MostFrequentFormation({ states, team }) {
  const list = formations(states, team)
  return list.length ? <Formation formation={list[0]} others={list.length - 1} /> : null
}

// Who was physically on court (libero included), setter marked, server underlined
function Court({ states, team, name, serving }) {
  const courts = courtsOnField(states, team)
  if (!courts.length) return null
  const [court] = courts
  return (
    <div className="vs-rc-court">
      <span className="vs-rc-court-name" title={name}>{name}{serving ? ' · al servizio' : ''}</span>
      <span className="vs-rc-court-grid">
        {COURT_ORDER.map(position => {
          const slot = court.positions[position - 1]
          const text = slot.libero ? (slot.certain ? `L${slot.number}` : 'L?') : slot.number || '—'
          const title = slot.libero
            ? (slot.certain ? `Libero #${slot.number} al posto di #${slot.replaced}` : `Presenza del libero non collocabile con certezza al posto di #${slot.replaced}`)
            : slot.number && slot.number === court.setter ? `#${slot.number}, palleggiatore` : slot.number ? `#${slot.number}` : 'non determinato'
          const classes = [slot.libero ? (slot.certain ? 'libero' : 'uncertain') : '', !slot.libero && slot.number && slot.number === court.setter ? 'setter' : '',
            position === 1 && court.server ? 'server' : ''].filter(Boolean).join(' ')
          return <span key={position} className={classes || undefined} title={title}>{text}</span>
        })}
      </span>
      <span className="vs-rc-note">in {court.rallies} di {states.length} rally{courts.length > 1 ? ` · altre ${courts.length - 1} formazioni` : ''}</span>
    </div>
  )
}

function Bar({ phase, cell, max, measure, labeled }) {
  const { rallies, value } = cell[phase]
  const visible = rallies > 0 && Math.abs(value) >= 0.05
  const width = Math.min(50, (Math.abs(value) / max) * 50)
  return (
    <span className="vs-rc-bar">
      {labeled && <span className="vs-rc-phase">{phase}</span>}
      <span className="vs-rc-track">
        {visible && <span className={`vs-rc-fill ${value >= 0 ? 'right' : 'left'}`} style={{ width: `calc(${width}% - 1px)`, background: PHASE_COLORS[phase] }} />}
      </span>
      <span className={`vs-rc-value${visible ? '' : ' zero'}`}>{rallies ? signed(value, measure) : '·'}</span>
    </span>
  )
}

const cellText = (row, col, cell, measure, team, opponent) => {
  const who = row === 6 && col === 6 ? `Tutte le P`
    : row === 6 ? `${opponent} in P${col + 1}, qualunque P di ${team}`
      : col === 6 ? `${team} in P${row + 1}, qualunque P di ${opponent}`
        : `${team} in P${row + 1} contro ${opponent} in P${col + 1}`
  const phase = name => `${name}: ${cell[name].won} vinti, ${cell[name].lost} persi (${signed(cell[name].value, measure)})`
  return `${who}. ${phase('BP')}; ${phase('CP')}.${cell.doubleChange ? ` ${cell.doubleChange} rally con doppio cambio.` : ''}${cell.rallies < COMPARISON_MIN_RALLIES ? ' Pochi rally.' : ''}`
}

function ComparisonGrid({ comparison, team, opponent, selected = null, onSelect = null, compact = false }) {
  return (
    <div className="vs-court-scroll">
      <table className={`vs-rc-grid${compact ? ' compact' : ''}`}>
        <caption className="vs-sr-only">P di {team} (righe) contro P di {opponent} (colonne): rally in fase BP e in fase CP, {measureName(comparison.measure)}</caption>
        <thead>
          <tr>
            {/* corner split by a diagonal: columns team top right, rows team bottom left */}
            <th scope="col" className="vs-rc-axis">
              <span className="vs-rc-axis-cols">P di {opponent} →</span>
              <span className="vs-rc-axis-rows">↓ P di {team}</span>
            </th>
            {[0, 1, 2, 3, 4, 5].map(col => (
              <th scope="col" key={col}><PBadge P={col + 1} /><MostFrequentFormation states={comparisonStates(comparison, 6, col)} team="other" /></th>
            ))}
            <th scope="col">Tutte</th>
          </tr>
        </thead>
        <tbody>
          {comparison.cells.map((row, r) => {
            const flag = r < 6 ? flagOf(comparison, r) : null
            return (
              <tr key={r}>
                <th scope="row" className="vs-rc-row">
                  {r === 6 ? 'Tutte' : (
                    <span className={`vs-rc-rowhead${flag ? ` ${flag}` : ''}`}>
                      <PBadge P={r + 1} />
                      {flag && <span className={`vs-rc-flag ${flag}`}>{FLAG_TEXT[flag]}</span>}
                      <MostFrequentFormation states={comparisonStates(comparison, r, 6)} team="own" />
                    </span>
                  )}
                </th>
                {row.map((cell, c) => {
                  if (!cell.rallies) return <td key={c}><span className="vs-rc-cell empty" aria-label="Incrocio non giocato">—</span></td>
                  const total = r === 6 || c === 6
                  const classes = ['vs-rc-cell', total ? 'total' : '', cell.doubleChange ? 'dc' : '', cell.rallies < COMPARISON_MIN_RALLIES ? 'few' : '', c === 6 && flag ? flag : ''].filter(Boolean).join(' ')
                  const label = `${cellText(r, c, cell, comparison.measure, team, opponent)}${c === 6 && flag ? ` Rotazione ${FLAG_TEXT[flag]}.` : ''}`
                  const content = <>
                    {PHASES.map(phase => <Bar key={phase} phase={phase} cell={cell} max={total ? comparison.totalMax : comparison.cellMax} measure={comparison.measure} labeled={total} />)}
                    {cell.doubleChange > 0 && <span className="vs-rc-dc">DC {cell.doubleChange}</span>}
                  </>
                  return (
                    <td key={c}>
                      {onSelect
                        ? <button type="button" className={classes} aria-label={label} title={label} aria-pressed={selected?.[0] === r && selected?.[1] === c} onClick={() => onSelect([r, c])}>{content}</button>
                        : <span className={classes} title={label}>{content}</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Legend() {
  return (
    <div className="vs-rc-legend">
      <span><i className="vs-rc-swatch" style={{ background: PHASE_COLORS.BP }} />BP, squadra al servizio</span>
      <span><i className="vs-rc-swatch" style={{ background: PHASE_COLORS.CP }} />CP, squadra in ricezione</span>
      <span>BP sopra, CP sotto · barra a destra positivo, a sinistra negativo</span>
      <span><i className="vs-rc-ring" style={{ borderColor: COMPARISON_COLORS.best }} />P più redditizia</span>
      <span><i className="vs-rc-ring" style={{ borderColor: COMPARISON_COLORS.worst }} />P più in difficoltà</span>
      <span><b className="vs-rc-dc-key" style={{ color: EVENT_COLORS.doubleChange, borderColor: EVENT_COLORS.doubleChange }}>DC</b>rally con in campo chi è entrato per doppio cambio</span>
      <span>cella chiara = meno di {COMPARISON_MIN_RALLIES} rally · — = incrocio non giocato</span>
    </div>
  )
}

const noteText = comparison => (comparison.measure === 'average'
  ? `Rally vinti meno quelli attesi con la media della selezione: BP ${Math.round(comparison.rates.BP * 100)}% vinti, CP ${Math.round(comparison.rates.CP * 100)}% vinti.`
  : `Rally vinti meno rally persi dalla squadra in ogni fase. Barre in scala: celle fino a ±${comparison.cellMax}, “Tutte” fino a ±${comparison.totalMax}.`)

function Summary({ comparison }) {
  const { best, worst, extremes, measure } = comparison
  if (!best) return <p className="vs-court-note">Nessuna P con almeno {COMPARISON_MIN_RALLIES} rally in questa selezione: la sintesi non viene proposta.</p>
  const tile = (row, flag, title) => row && (
    <article className={`vs-rc-tile ${flag}`}>
      <h3>{title}</h3>
      <p className="vs-rc-tile-main"><PBadge P={row.P} /> <strong>{signed(row.value, measure)}</strong></p>
      <p>BP {signed(row.BP.value, measure)} ({row.BP.won} vinti su {row.BP.rallies}) · CP {signed(row.CP.value, measure)} ({row.CP.won} su {row.CP.rallies})</p>
      <MostFrequentFormation states={comparisonStates(comparison, row.P - 1, 6)} team="own" />
    </article>
  )
  const crossing = item => item ? <><strong>P{item.P}</strong> contro P{item.otherP} in <strong>{item.phase}</strong>: {signed(item.value, measure)} ({item.won} vinti su {item.rallies})</> : '—'
  return (
    <div className="vs-rc-summary">
      {tile(best, 'best', 'P più redditizia')}
      {tile(worst, 'worst', 'P più in difficoltà')}
      <article className="vs-rc-tile">
        <h3>Incroci estremi (almeno {COMPARISON_MIN_RALLIES} rally)</h3>
        <p>Meglio: {crossing(extremes.best)}</p>
        <p>Peggio: {crossing(extremes.worst)}</p>
      </article>
    </div>
  )
}

function Detail({ comparison, row, col, team, opponent, title = null }) {
  const list = comparisonStates(comparison, row, col)
  const cell = comparison.cells[row][col]
  const heading = title || (row === 6 && col === 6 ? 'Tutte le P'
    : col === 6 ? `${team} in P${row + 1}` : row === 6 ? `${opponent} in P${col + 1}` : `${team} in P${row + 1} contro ${opponent} in P${col + 1}`)
  return (
    <div className="vs-rc-detail" aria-live="polite">
      <div className="vs-rc-detail-head">
        <h3>{heading}</h3>
        <span className="vs-rc-note">{cell.rallies} rally{cell.doubleChange ? ` · ${cell.doubleChange} con doppio cambio (bordo tratteggiato)` : ''} · riquadro marcato = palleggiatore, arancio = libero, sottolineato = al servizio</span>
      </div>
      <div className="vs-rc-phases">
        {PHASES.map(phase => {
          const inPhase = list.filter(s => s.phase === phase)
          return (
            <div className="vs-rc-phase-box" key={phase}>
              <p className="vs-rc-phase-title">
                <strong style={{ color: PHASE_COLORS[phase] }}>{phase === 'BP' ? 'BP · squadra al servizio' : 'CP · squadra in ricezione'}</strong>{' '}
                {cell[phase].won} vinti, {cell[phase].lost} persi · {signed(cell[phase].value, comparison.measure)}
              </p>
              {inPhase.length ? <>
                <div className="vs-rc-courts">
                  <Court states={inPhase} team="own" name={team} serving={phase === 'BP'} />
                  <Court states={inPhase} team="other" name={opponent} serving={phase === 'CP'} />
                </div>
                <div className="vs-rc-rallies" aria-label="Rally">
                  {inPhase.map(s => (
                    <span key={`${s.set}-${s.rally}`} className={`${s.winner === 'own' ? 'won' : 'lost'}${isDoubleChange(s) ? ' dc' : ''}`}
                      title={`Set ${s.set}, rally ${s.rally}, dal ${s.scoreBefore.own}-${s.scoreBefore.other}: ${s.winner === 'own' ? 'vinto' : 'perso'}${isDoubleChange(s) ? ', doppio cambio' : ''}`}>
                      S{s.set} {s.scoreBefore.own}–{s.scoreBefore.other} {s.winner === 'own' ? '✓' : '✗'}
                    </span>
                  ))}
                </div>
              </> : <p className="vs-rc-note">Nessun rally in questa fase.</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Excluded({ comparison, team, opponent, onVerify, printing }) {
  if (!comparison.excluded) return null
  return (
    <div className="vs-court-excluded">
      <p>{comparison.excluded} rally non inclusi perché la P di una squadra non è determinata:</p>
      <ul>
        {comparison.reasons.map(reason => (
          <li key={`${reason.team}-${reason.reason}`}>
            {reason.team === 'own' ? team : opponent}: {reason.rallies} rally{reason.sets.length ? ` (set ${reason.sets.join(', ')})` : ''} — {EXCLUSION_TEXT[reason.reason]}
          </li>
        ))}
      </ul>
      {!printing && onVerify && <button type="button" className="vs-btn vs-btn-sm vs-court-verify" onClick={onVerify}>Verifica</button>}
    </div>
  )
}

function DoubleChanges({ states, team, opponent }) {
  const stretches = doubleChangeStretches(states)
  if (!stretches.length) return <p className="vs-rc-note">Nessun doppio cambio in questa gara.</p>
  return (
    <div className="vs-court-scroll">
      <table className="vs-court-table">
        <thead><tr><th scope="col">Set</th><th scope="col">Squadra</th><th scope="col">Entrati</th><th scope="col">Punteggio</th><th scope="col">P</th><th scope="col">Rally di {team}</th></tr></thead>
        <tbody>
          {stretches.map(s => (
            <tr key={`${s.team}-${s.set}-${s.from.own}-${s.from.other}`}>
              <td>{s.set}</td>
              <td>{s.team === 'own' ? team : opponent}</td>
              <td>{s.players.map(n => `#${n}`).join(', ')}</td>
              <td>{s.from.own}-{s.from.other} → {s.to.own}-{s.to.other}</td>
              <td>{s.P.length ? s.P.map(p => `P${p}`).join(', ') : '—'}</td>
              <td>{s.won} vinti, {s.lost} persi</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Chips({ label, items, value, onChange }) {
  return (
    <div className="vs-court-filters" role="group" aria-label={label}>
      <span className="vs-rc-filter-label">{label}</span>
      {items.map(([key, text, extra]) => (
        <button type="button" key={key} aria-pressed={value === key} className="vs-btn vs-btn-sm vs-btn-secondary" onClick={() => onChange(key)}>
          {text}{extra && <small>{extra}</small>}
        </button>
      ))}
    </div>
  )
}

export default function RotationComparison({ match, sets, states, printing = false, includeInPdf = () => true, printToggle = () => null, verification, onVerify }) {
  const [set, setSet] = useState('all')
  const [measure, setMeasure] = useState('difference')
  const [doubleChange, setDoubleChange] = useState('all')
  const [selected, setSelected] = useState(null)
  const comparison = useMemo(() => rotationComparison(filterSet(states, set), { measure, doubleChange }), [states, set, measure, doubleChange])
  const whole = useMemo(() => rotationComparison(states, { measure }), [states, measure])
  const { team, opponent } = match
  const played = sets.filter(s => s.states.length)
  const reset = setter => value => { setter(value); setSelected(null) }

  if (printing) {
    if (verification.open || !includeInPdf('matchup')) return null
    const onlyDoubleChange = rotationComparison(states, { measure, doubleChange: 'only' })
    const hasDoubleChange = states.some(isDoubleChange)
    return (
      <>
        {/* the only comparison block that may be split across two PDF pages, between its parts */}
        <section className="vs-card vs-rc-card vs-rc-splittable">
          <h2 className="vs-card-title">Confronto delle rotazioni · gara intera · {measureName(measure)}</h2>
          <p className="vs-court-note">{noteText(whole)}</p>
          <Summary comparison={whole} />
          <Legend />
          <ComparisonGrid comparison={whole} team={team} opponent={opponent} />
          <Excluded comparison={whole} team={team} opponent={opponent} printing />
        </section>
        {includeInPdf('matchup-sets') && played.map(s => {
          const bySet = rotationComparison(s.states, { measure })
          const last = s.states.at(-1).score
          return (
            <section className="vs-card vs-rc-card" key={s.set}>
              <h2 className="vs-card-title">Confronto delle rotazioni · set {s.set} · {last.own}-{last.other} · {measureName(measure)}</h2>
              <ComparisonGrid comparison={bySet} team={team} opponent={opponent} compact />
            </section>
          )
        })}
        {[['best', 'più redditizia'], ['worst', 'più in difficoltà']].map(([flag, text]) => whole[flag] && (
          <section className="vs-card vs-rc-card" key={flag}>
            <Detail comparison={whole} row={whole[flag].P - 1} col={6} team={team} opponent={opponent} title={`P ${text}: ${team} in P${whole[flag].P} · gara intera`} />
          </section>
        ))}
        {hasDoubleChange && (
          <section className="vs-card vs-rc-card">
            <h2 className="vs-card-title">Doppi cambi</h2>
            <DoubleChanges states={states} team={team} opponent={opponent} />
            {onlyDoubleChange.states.length > 0
              ? <>
                <h3 className="vs-rc-subtitle">Solo rally con doppio cambio · {measureName(measure)}</h3>
                <ComparisonGrid comparison={onlyDoubleChange} team={team} opponent={opponent} compact />
              </>
              : <p className="vs-rc-note">Nei rally con doppio cambio la P di una squadra non è determinata: non entrano nel confronto.</p>}
          </section>
        )}
      </>
    )
  }

  const current = selected || (comparison.best ? [comparison.best.P - 1, 6] : [6, 6])
  return (
    <section className="vs-card vs-rc-card">
      <div className="vs-court-title"><h2 className="vs-card-title">Confronto delle rotazioni</h2>{printToggle('matchup')}</div>
      {verification.open && (
        <p className="vs-court-verify-note">
          Palleggiatori da verificare{verification.unmarked.length ? ` (nessun possibile palleggiatore segnato per ${verification.unmarked.map(side => (side === 'own' ? team : opponent)).join(' e ')})` : ''}{verification.pending.length ? ` (${verification.pending.length} ${verification.pending.length === 1 ? 'tratto' : 'tratti'} con più palleggiatori in campo)` : ''}: fino a che non è verificato non apparirà nella stampa del PDF.
          {' '}<button type="button" className="vs-btn vs-btn-sm vs-court-verify" onClick={onVerify}>Verifica</button>
        </p>
      )}
      <p className="vs-card-subtitle">Ogni P di {team} contro ogni P di {opponent}, con i rally in fase BP e in fase CP separati. Tocca una cella per vedere chi era in campo nelle due fasi.</p>
      <div className="vs-court-filter-rows">
        <Chips label="Set" value={set} onChange={reset(setSet)}
          items={[['all', 'Gara'], ...played.map(s => [s.set, `Set ${s.set}`, `${s.states.at(-1).score.own}-${s.states.at(-1).score.other}`])]} />
        <Chips label="Misura" value={measure} onChange={reset(setMeasure)} items={MEASURES} />
        <Chips label="Doppio cambio" value={doubleChange} onChange={reset(setDoubleChange)} items={DOUBLE_CHANGE_FILTERS} />
      </div>
      <div className="vs-print-toggle-row">{printToggle('matchup-sets', 'Includi nel PDF anche set per set')}</div>
      <Summary comparison={comparison} />
      <p className="vs-court-note">{noteText(comparison)}</p>
      <Legend />
      <ComparisonGrid comparison={comparison} team={team} opponent={opponent} selected={current} onSelect={setSelected} />
      <p className="vs-court-note">
        {comparison.states.length} rally nel confronto{comparison.excludedDoubleChange ? `; ${comparison.excludedDoubleChange} ${doubleChange === 'only' ? 'senza doppio cambio non mostrati' : 'con doppio cambio esclusi'}` : ''}.
      </p>
      <Excluded comparison={comparison} team={team} opponent={opponent} onVerify={onVerify} />
      <Detail comparison={comparison} row={current[0]} col={current[1]} team={team} opponent={opponent} />
      <details className="vs-rc-dc-list">
        <summary>Doppi cambi della gara</summary>
        <DoubleChanges states={states} team={team} opponent={opponent} />
      </details>
    </section>
  )
}
