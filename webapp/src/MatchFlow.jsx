import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import * as echarts from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import { MarkAreaComponent, MarkLineComponent } from 'echarts/components'
import { matchFlow } from './match-flow'
import { describeMatch, describeSet, eventLabel } from './match-reading'
import { ALL_SETS_LAYERS, DEFAULT_FILTERS, DEFAULT_LAYERS, chartLayout, commonYRange, flowChartOption } from './match-flow-chart'
import { EVENT_COLORS, PHASE_COLORS, ROTATION_COLORS } from './theme'

echarts.use([LineChart, ScatterChart, MarkAreaComponent, MarkLineComponent])

const LAYER_LABELS = [
  ['score', 'Andamento punteggio'],
  ['phase', 'Fase BP/CP'],
  ['rotation', 'P1-P6'],
  ['timeouts', 'Time-out'],
  ['doubleChanges', 'Doppi cambi'],
  ['substitutions', 'Sostituzioni'],
  ['runs', 'Serie di punti'],
  ['server', 'Al servizio'],
  ['courtChange', 'Cambio campo'],
]
const FILTERS = [
  ['phase', 'Fase', [['all', 'Tutte'], ['BP', 'BP'], ['CP', 'CP']]],
  ['rotation', 'P', [['all', 'Tutte'], ...[1, 2, 3, 4, 5, 6].map(p => [String(p), `P${p}`])]],
  ['events', 'Eventi', [['all', 'Tutti'], ['timeouts', 'Time-out'], ['substitutions', 'Sostituzioni'], ['doubleChanges', 'Doppi cambi']]],
]
const EVENT_KEY = [['TO', 'time-out', 'timeout'], ['DC', 'doppio cambio', 'doubleChange'], ['S', 'sostituzione', 'substitution'], ['CC', 'cambio campo', 'courtChange']]
const EVENT_LAYER = { timeout: 'timeouts', doubleChange: 'doubleChanges', substitution: 'substitutions', courtChange: 'courtChange' }
const VIEWS = [['interactive', 'Vista interattiva'], ['all', 'Tutti i set']]
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

// Color swatch next to a filter value, so BP/CP and P1-P6 read the same as in the chart
const filterSwatch = (key, value) => {
  if (key === 'phase' && PHASE_COLORS[value]) return PHASE_COLORS[value]
  if (key === 'rotation' && ROTATION_COLORS[value]) return ROTATION_COLORS[value].fill
  return null
}

// One chart, used by both views. Layout effects: when printing, charts are drawn before the capture.
function FlowChart({ flow, layers, filters = DEFAULT_FILTERS, context, compact = false, yRange = null }) {
  const ref = useRef(null)
  const chartRef = useRef(null)
  // The option depends on the width: labels are shown only where they fit
  const [width, setWidth] = useState(900)
  const option = useMemo(() => flowChartOption(flow, { layers, filters, context, width, compact, yRange }), [flow, layers, filters, context, width, compact, yRange])
  const { height } = chartLayout(flow, layers, { compact })

  useLayoutEffect(() => {
    if (!ref.current) return undefined
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    setWidth(ref.current.clientWidth || 900)
    const observer = new ResizeObserver(entries => {
      chart.resize()
      const next = Math.round(entries[0]?.contentRect.width || 0)
      if (next) setWidth(current => (Math.abs(current - next) > 4 ? next : current))
    })
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    chartRef.current?.setOption(option, true)
    chartRef.current?.resize()
  }, [option, height])

  return <div ref={ref} className="vs-flow-chart" style={{ height }} role="img" aria-label={`Andamento del ${flow.set}° set: differenza di punteggio punto per punto`} />
}

function EventKey({ flows, layers, team }) {
  const shown = EVENT_KEY.filter(([, , type]) => layers[EVENT_LAYER[type]] && flows.some(flow => flow.events.some(event => event.type === type)))
  if (!shown.length) return null
  return (
    <p className="vs-flow-key">
      {shown.map(([short, label, type]) => (
        <span key={short}><b style={{ color: EVENT_COLORS[type] }}>{short}</b> {label}</span>
      ))}
      <span>pieno: {team} · contorno: avversaria</span>
    </p>
  )
}

// "Tutti i set": every played set, one under the other, same style and same Y scale.
// It is also the content of the PDF / print, whatever view is on screen.
function AllSets({ flows, indicators, context, match, printing }) {
  const yRange = useMemo(() => commonYRange(flows), [flows])
  const layersFor = flow => ({ ...ALL_SETS_LAYERS, courtChange: flow.set === 5 })
  return (
    <div className="vs-flow-all">
      <EventKey flows={flows} layers={ALL_SETS_LAYERS} team={match.team} />
      <p className="vs-flow-footnote vs-flow-scale-note">
        Stessa scala per tutti i set: Differenza da {signed(yRange.min + 1)} a {signed(yRange.max - 1)}.
      </p>
      {flows.map((flow, index) => (
        <article key={flow.set} className="vs-flow-set" aria-label={`Set ${flow.set}`}>
          <h3 className="vs-flow-set-title">
            Set {flow.set} <span className={`tabular-nums ${flow.won ? 'won' : 'lost'}`}>{flow.scoreOwn}-{flow.scoreOther}</span>
          </h3>
          {!flow.complete && (
            <p className="vs-flow-notice">Sequenza dei punti incompleta: controlla la griglia dei turni di questo set.</p>
          )}
          <FlowChart flow={flow} layers={layersFor(flow)} context={context} compact yRange={yRange} />
          <p className="vs-flow-set-reading">
            {describeSet(indicators[index], flow, context, { compact: !printing })}
          </p>
        </article>
      ))}
      {flows.some(flow => !flow.rotationKnown) && (
        <p className="vs-flow-footnote">P non indicate: segna il palleggiatore nell&apos;elenco atleti (colonna &quot;p&quot;) per vedere P1-P6.</p>
      )}
    </div>
  )
}

// state lives in MatchFlow, so switching view and back keeps set, layers and filters
function InteractiveView({ flows, indicators, context, match, state }) {
  const { setIndex, setSetIndex, layers, setLayers, courtChangeTouched, setCourtChangeTouched, filters, setFilters } = state
  const index = Math.min(setIndex, flows.length - 1)
  const flow = flows[index]
  // Fifth set: the court change is shown automatically, until the user decides otherwise
  const effectiveLayers = useMemo(() => ({
    ...layers,
    courtChange: courtChangeTouched ? layers.courtChange : layers.courtChange || flow?.set === 5,
  }), [layers, courtChangeTouched, flow?.set])
  const setReading = useMemo(() => describeSet(indicators[index], flow, context), [flow, indicators, index, context])

  const activeFilters = FILTERS
    .filter(([key]) => filters[key] !== 'all')
    .map(([key, label, options]) => `${label}: ${options.find(([value]) => value === filters[key])?.[1]}`)

  return (
    <div className="vs-flow-interactive">
      <div className="vs-flow-tabs" role="tablist" aria-label="Set">
        {flows.map((item, i) => (
          <button
            key={item.set}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={`vs-flow-tab${i === index ? ' active' : ''}`}
            onClick={() => setSetIndex(i)}
          >
            Set {item.set} <span className="tabular-nums">{item.scoreOwn}-{item.scoreOther}</span>
          </button>
        ))}
      </div>

      <details className="vs-flow-options">
        <summary>
          Mostra e filtra
          {activeFilters.length > 0 && <span className="vs-flow-active">{activeFilters.join(' · ')}</span>}
        </summary>
        <div className="vs-flow-options-body">
          <div className="vs-flow-row" role="group" aria-label="Mostra">
            <span className="vs-flow-row-label">Mostra</span>
            {LAYER_LABELS.map(([key, label]) => {
              const disabled = key === 'rotation' && !flow.rotationKnown
              return (
                <label key={key} className={`vs-flow-chip${effectiveLayers[key] ? ' on' : ''}${disabled ? ' disabled' : ''}`}>
                  <input
                    type="checkbox"
                    checked={effectiveLayers[key]}
                    disabled={disabled}
                    onChange={e => {
                      if (key === 'courtChange') setCourtChangeTouched(true)
                      setLayers(current => ({ ...current, [key]: e.target.checked }))
                    }}
                  />
                  {label}
                </label>
              )
            })}
          </div>
          {FILTERS.map(([key, label, options]) => (
            <div key={key} className="vs-flow-row" role="group" aria-label={`Filtra ${label}`}>
              <span className="vs-flow-row-label">{key === 'phase' ? 'Filtra' : ''}</span>
              <span className="vs-flow-filter-name">{label}</span>
              {options.map(([value, text]) => {
                const color = filterSwatch(key, value)
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filters[key] === value}
                    className={`vs-flow-seg${filters[key] === value ? ' active' : ''}`}
                    disabled={key === 'rotation' && value !== 'all' && !flow.rotationKnown}
                    onClick={() => setFilters(current => ({ ...current, [key]: value }))}
                  >
                    {color && <i style={{ background: color }} aria-hidden="true" />}
                    {text}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </details>

      {!flow.complete && (
        <p className="vs-flow-notice">La sequenza dei punti ricostruita dai turni di servizio non arriva al punteggio finale del set: controlla la griglia dei turni.</p>
      )}
      {!flow.rotationKnown && effectiveLayers.rotation && (
        <p className="vs-flow-notice">P non indicate per questo set: segna il palleggiatore nell&apos;elenco atleti (colonna &quot;p&quot;) per vedere P1-P6.</p>
      )}

      <FlowChart flow={flow} layers={effectiveLayers} filters={filters} context={context} />

      <EventKey flows={[flow]} layers={effectiveLayers} team={match.team} />
      {effectiveLayers.server && (
        <p className="vs-flow-footnote">Al servizio: ricavato dalla formazione iniziale del set, come i servizi stimati; le sostituzioni non sono applicate.</p>
      )}
      {flow.unplacedEvents.length > 0 && (
        <p className="vs-flow-footnote">
          Eventi con un punteggio non presente nella sequenza del set, non collocati sul grafico:{' '}
          {flow.unplacedEvents.map(event => `${eventLabel(event)} (${event.scoreText})`).join('; ')}.
        </p>
      )}

      <div className="vs-flow-reading">
        <h3>Lettura del set</h3>
        <p>{setReading}</p>
      </div>
    </div>
  )
}

// printing: set by the PDF export; the browser print (Ctrl+P) is handled here with beforeprint.
// In both cases the content is always "Tutti i set", never the state of the interactive view.
export default function MatchFlow({ match, female = false, printing = false }) {
  const { flows, indicators } = useMemo(() => matchFlow(match), [match])
  const [view, setView] = useState('interactive')
  const [browserPrinting, setBrowserPrinting] = useState(false)
  const [setIndex, setSetIndex] = useState(0)
  const [layers, setLayers] = useState(DEFAULT_LAYERS)
  const [courtChangeTouched, setCourtChangeTouched] = useState(false)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const interactiveState = { setIndex, setSetIndex, layers, setLayers, courtChangeTouched, setCourtChangeTouched, filters, setFilters }
  const context = useMemo(() => ({ team: match.team, opponent: match.opponent, female }), [match.team, match.opponent, female])
  const matchReading = useMemo(() => describeMatch(indicators, flows, context), [indicators, flows, context])

  useEffect(() => {
    const before = () => flushSync(() => setBrowserPrinting(true))
    const after = () => setBrowserPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  if (!flows.length) return null
  const print = printing || browserPrinting
  const showAll = print || view === 'all'

  return (
    <section className={`vs-card vs-flow${print ? ' vs-flow-printing' : ''}`} aria-labelledby="vs-flow-title">
      <div className="vs-flow-head">
        <h2 id="vs-flow-title" className="vs-card-title">Andamento della gara</h2>
        <div className="vs-flow-views" role="radiogroup" aria-label="Vista">
          {VIEWS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={view === value}
              className={`vs-flow-view${view === value ? ' active' : ''}`}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showAll
        ? <AllSets flows={flows} indicators={indicators} context={context} match={match} printing={print} />
        : <InteractiveView flows={flows} indicators={indicators} context={context} match={match} state={interactiveState} />}

      <div className="vs-flow-reading vs-flow-match-reading">
        <h3>Lettura della gara</h3>
        <p>{matchReading}</p>
      </div>
    </section>
  )
}
