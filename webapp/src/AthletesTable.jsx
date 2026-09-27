import React, { Fragment, useMemo, useState } from 'react'
import { ATHLETE_INDICATORS, MIN_RALLIES_FOR_SHARE, TABLE_INDICATORS, TREND_INDICATOR, athleteRows, extremes, indicatorValue } from './athlete-indicators'
import { PHASE_COLORS } from './theme'
import { InfoTip } from './GlossaryView'

const formatNumber = (value, decimals) => Number(value).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
const formatValue = (value, indicator) => (indicator.percent ? `${formatNumber(value * 100, indicator.decimals)}%` : formatNumber(value, indicator.decimals))
const trendIndicator = ATHLETE_INDICATORS.find(indicator => indicator.key === TREND_INDICATOR)

// SVG triangles instead of ▲▼ glyphs: always rendered, also in the PDF capture
const Triangle = ({ up = false }) => (
  <svg className="vs-ath-tri" width="9" height="8" viewBox="0 0 8 7" aria-hidden="true" focusable="false">
    <path d={up ? 'M4 0 L8 7 L0 7 Z' : 'M0 0 L8 0 L4 7 Z'} fill="currentColor" />
  </svg>
)

// One value with its state: 0 is a value; "–" not applicable; "·" not on court in that set
function Value({ entry, indicator, mark, scopeLabel }) {
  if (entry.state === 'absent') return <span className="vs-ath-na" title="Non in campo in questo set">·</span>
  if (entry.state === 'not-applicable') return <span className="vs-ath-na" title="Non applicabile: nessun turno al servizio">–</span>
  const text = formatValue(entry.value, indicator)
  if (mark === 'best') return <span className="vs-ath-ext best" title={`Valore più alto ${scopeLabel}`}><Triangle up />{text}<span className="vs-sr"> (più alto {scopeLabel})</span></span>
  if (mark === 'worst') return <span className="vs-ath-ext worst" title={`Valore più basso ${scopeLabel}`}><Triangle />{text}<span className="vs-sr"> (più basso {scopeLabel})</span></span>
  return <span>{text}</span>
}

// Mini bars of the trend indicator, one per played set, with the value written under each bar
function SetTrend({ row, max, scope }) {
  return (
    <div className="vs-ath-trend" role="img" aria-label={`${trendIndicator.label} nei set: ${row.sets.map((_, i) => {
      const entry = indicatorValue(row, trendIndicator, i)
      return `set ${i + 1} ${entry.state === 'value' ? formatNumber(entry.value, 2) : entry.state === 'absent' ? 'non in campo' : 'non applicabile'}`
    }).join(', ')}`}>
      {row.sets.map((_, i) => {
        const entry = indicatorValue(row, trendIndicator, i)
        const height = entry.state === 'value' && max > 0 ? Math.max(2, Math.round((entry.value / max) * 13)) : 0
        return (
          <span key={i} className={`vs-ath-bar${scope === i ? ' current' : ''}`}>
            <span className="vs-ath-bar-track">
              {entry.state === 'value'
                ? <span className="vs-ath-bar-fill" style={{ height, background: PHASE_COLORS.BP }} />
                : <span className="vs-ath-bar-empty">{entry.state === 'absent' ? '·' : '–'}</span>}
            </span>
            <span className="vs-ath-bar-value">{entry.state === 'value' ? formatNumber(entry.value, 1) : ''}</span>
          </span>
        )
      })}
    </div>
  )
}

export default function AthletesTable({ matches, female = false, printing = false }) {
  const rows = useMemo(() => athleteRows(matches), [matches])
  const setCount = rows[0]?.sets.length || 0
  const withSets = setCount > 1
  const [scopeState, setScope] = useState('total')
  const [expanded, setExpanded] = useState(() => new Set())
  // PDF/print: always the whole match, deterministic
  const scope = printing || scopeState === 'total' || scopeState >= setCount ? 'total' : scopeState
  const scopeLabel = scope === 'total' ? (matches.length > 1 ? 'nelle gare' : 'nella gara') : `nel set ${scope + 1}`
  const marks = useMemo(() => Object.fromEntries(ATHLETE_INDICATORS.map(indicator => [indicator.key, extremes(rows, indicator, scope)])), [rows, scope])
  const trendMax = useMemo(() => Math.max(0, ...rows.flatMap(row => row.sets.map((_, i) => {
    const entry = indicatorValue(row, trendIndicator, i)
    return entry.state === 'value' ? entry.value : 0
  }))), [rows])
  const markOf = (indicator, row) => (marks[indicator.key].best.has(row.id) ? 'best' : marks[indicator.key].worst.has(row.id) ? 'worst' : null)
  const toggle = id => setExpanded(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const columns = 1 + TABLE_INDICATORS.length + (withSets ? 1 : 0)

  return (
    <div className={`vs-ath${printing ? ' printing' : ''}`}>
      {withSets && !printing && (
        <div className="vs-ath-scope" role="radiogroup" aria-label="Confronta">
          <span>Confronta</span>
          {[['total', 'Gara'], ...Array.from({ length: setCount }, (_, i) => [i, `Set ${i + 1}`])].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              className={scope === value ? 'active' : undefined}
              onClick={() => setScope(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="vs-table-wrap">
        <table className="vs-table vs-ath-table">
          <thead>
            <tr>
              <th>Atleta</th>
              {TABLE_INDICATORS.map(indicator => (
                <th key={indicator.key} className="num-cell-header">
                  <span title={indicator.label}>{indicator.short}</span>
                  {indicator.glossary && <InfoTip id={indicator.glossary} />}
                </th>
              ))}
              {withSets && <th className="vs-ath-trend-head" title={`${trendIndicator.label}, set per set`}>Nei set · MP BP</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const open = expanded.has(row.id) && withSets && !printing
              return (
                <Fragment key={row.id}>
                  <tr className={open ? 'open' : undefined}>
                    <td className="vs-ath-name">
                      {withSets && !printing && (
                        <button type="button" className="vs-ath-toggle" aria-expanded={open} aria-label={`Dettaglio per set di #${row.number}`} onClick={() => toggle(row.id)}>
                          {open ? '▾' : '▸'}
                        </button>
                      )}
                      <strong>#{row.number}</strong>
                      {row.name
                        ? <span className="vs-ath-player">{row.name}</span>
                        : <span className="vs-ath-missing">(nome non associato)</span>}
                      {row.isSetter && <span className="vs-ath-setter" title="Palleggio">P</span>}
                    </td>
                    {TABLE_INDICATORS.map(indicator => (
                      <td key={indicator.key} className="num-cell" data-label={indicator.short}>
                        <Value entry={indicatorValue(row, indicator, scope)} indicator={indicator} mark={markOf(indicator, row)} scopeLabel={scopeLabel} />
                      </td>
                    ))}
                    {withSets && (
                      <td className="vs-ath-trend-cell" data-label="Nei set · MP BP">
                        <SetTrend row={row} max={trendMax} scope={scope} />
                      </td>
                    )}
                  </tr>
                  {open && (
                    <tr className="vs-ath-detail">
                      <td colSpan={columns}>
                        <table className="vs-ath-detail-table">
                          <thead>
                            <tr>
                              <th />
                              <th>Gara</th>
                              {row.sets.map((_, i) => <th key={i}>Set {i + 1}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {ATHLETE_INDICATORS.map(indicator => (
                              <tr key={indicator.key}>
                                <th scope="row">{indicator.label}</th>
                                {['total', ...row.sets.map((_, i) => i)].map(cellScope => {
                                  const cellMarks = extremes(rows, indicator, cellScope)
                                  const mark = cellMarks.best.has(row.id) ? 'best' : cellMarks.worst.has(row.id) ? 'worst' : null
                                  return (
                                    <td key={cellScope}>
                                      <Value
                                        entry={indicatorValue(row, indicator, cellScope)}
                                        indicator={indicator}
                                        mark={mark}
                                        scopeLabel={cellScope === 'total' ? 'nella gara' : `nel set ${cellScope + 1}`}
                                      />
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="vs-ath-legend">
        <span><Triangle up /> valore più alto, <Triangle /> più basso {scopeLabel}: medie di servizio tra {female ? 'le atlete' : 'gli atleti'} con almeno un turno al servizio, % rally vinti da {MIN_RALLIES_FOR_SHARE} rally in campo</span>
        <span>Rally in campo, vinti e persi: rally della squadra con l’atleta in campo, sostituzioni (uscite e rientri) comprese; i cambi del libero non hanno il punteggio sul referto e non sono considerati</span>
        <span>“<b>–</b>” non applicabile, “<b>·</b>” non in campo nel set; 0 è un valore</span>
        {withSets && <span>Nei set: {trendIndicator.label}, stessa scala per tutti</span>}
      </p>
    </div>
  )
}
