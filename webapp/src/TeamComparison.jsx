// "Confronto tra le squadre": the two teams of one match face to face. Always visible: cambio palla, break,
// longest run, points from 20 on. Below, one chart at a time (tabs): set per set, rotations side by side,
// serve and reception. In the PDF the three charts are printed one after the other.
// Counts from team-comparison.js; the analyzed team is on the left, the opponent on the right.
import { useMemo, useState } from 'react'
import { matchStates } from './rally-state.js'
import { comparisonReading, teamComparison } from './team-comparison.js'
import './court-analysis.css'

const TABS = [['sets', 'Set per set'], ['rotations', 'Rotazioni a specchio'], ['serve', 'Servizio e ricezione']]
const pct = value => (value == null ? '—' : `${value}%`)

function Tile({ label, own, other, format = String }) {
  const ownWins = own != null && other != null && own > other
  const otherWins = own != null && other != null && other > own
  return (
    <div className="vs-tc-tile">
      <div className="vs-tc-tile-label">{label}</div>
      <div className="vs-tc-tile-value">
        <b className={ownWins ? 'win' : undefined}>{own == null ? '—' : format(own)}</b>
        <span aria-hidden="true">·</span>
        <b className={otherWins ? 'win' : undefined}>{other == null ? '—' : format(other)}</b>
      </div>
    </div>
  )
}

// Mirrored bars: the left one grows to the left, the right one to the right
function Butterfly({ label, title, own, other, max, phase, format = pct }) {
  const width = value => `${Math.min(100, ((value || 0) / (max || 1)) * 100)}%`
  return (
    <div className="vs-tc-bf" title={title}>
      <div className="vs-tc-bf-side left"><span>{own == null ? '—' : format(own)}</span><i className={phase} style={{ width: width(own) }} /></div>
      <div className="vs-tc-bf-label">{label}</div>
      <div className="vs-tc-bf-side"><i className={phase} style={{ width: width(other) }} /><span>{other == null ? '—' : format(other)}</span></div>
    </div>
  )
}

function Names({ team, opponent }) {
  return <div className="vs-tc-names" aria-hidden="true"><span>{team}</span><span /><span>{opponent}</span></div>
}

function Reading({ sentences }) {
  if (!sentences.length) return null
  return <p className="vs-tc-reading"><strong>Lettura:</strong> {sentences.join(' ')}</p>
}

function SetsChart({ data, team, opponent, reading }) {
  const maxBreaks = Math.max(1, ...data.perSet.flatMap(s => [s.own.breaks, s.other.breaks]))
  return (
    <>
      <div className="vs-tc-legend"><span><i className="cp" />Cambio palla %</span><span><i className="bp" />Punti in break</span></div>
      <Names team={team} opponent={opponent} />
      {data.perSet.map(s => (
        <div key={s.set} className="vs-tc-block">
          <div className="vs-tc-block-head">Set {s.set} <b className="tabular-nums">{s.score.own}–{s.score.other}</b></div>
          <Butterfly label="CP" title="Cambio palla: rally vinti in ricezione sui rally in ricezione" own={s.own.sideOutPct} other={s.other.sideOutPct} max={100} phase="cp" />
          <Butterfly label="BP" title="Punti in break: rally vinti al servizio" own={s.own.breaks} other={s.other.breaks} max={maxBreaks} phase="bp" format={String} />
        </div>
      ))}
      <Reading sentences={reading.sets} />
    </>
  )
}

function RotationsChart({ data, team, opponent, reading }) {
  if (!data.rotationsKnown) return <p className="vs-court-note">La P di una delle due squadre non è determinata: segna i palleggiatori nell’elenco atleti per vedere le rotazioni a specchio.</p>
  return (
    <>
      <div className="vs-tc-legend"><span><i className="bp" />Break % (al servizio)</span><span><i className="cp" />Cambio palla % (in ricezione)</span></div>
      <Names team={team} opponent={opponent} />
      {data.rotations.own.map((own, i) => {
        const other = data.rotations.other[i]
        return (
          <div key={own.P} className="vs-tc-block">
            <div className="vs-tc-block-head"><b>P{own.P}</b> <span className="vs-tc-count">battute {own.served} · {other.served} — ricezioni {own.received} · {other.received}</span></div>
            <Butterfly label="BP" title="Break %: rally vinti al servizio in questa P" own={own.breakPct} other={other.breakPct} max={100} phase="bp" />
            <Butterfly label="CP" title="Cambio palla %: rally vinti in ricezione in questa P" own={own.sideOutPct} other={other.sideOutPct} max={100} phase="cp" />
          </div>
        )
      })}
      <p className="vs-court-note">Ogni squadra è nella propria P (posizione del suo palleggiatore): la P1 di sinistra e quella di destra non sono in campo per forza nello stesso momento.</p>
      <Reading sentences={reading.rotations} />
    </>
  )
}

function Split({ parts }) {
  return (
    <div className="vs-tc-split">
      {parts.filter(p => p.value > 0).map(p => <i key={p.text} className={p.className} style={{ flexGrow: p.value }}>{p.text}</i>)}
    </div>
  )
}

function ServeChart({ data, team, opponent, reading }) {
  const { own, other } = data.total
  return (
    <>
      <div className="vs-tc-duo">
        <div>
          <h4>Quando serve {team}</h4>
          <Split parts={[
            { value: own.breaks, text: `${pct(own.breakPct)} punto ${team}`, className: 'bp' },
            { value: other.sideOuts, text: `${pct(other.sideOutPct)} cambio palla ${opponent}`, className: 'bp-soft' },
          ]} />
        </div>
        <div>
          <h4>Quando serve {opponent}</h4>
          <Split parts={[
            { value: own.sideOuts, text: `${pct(own.sideOutPct)} cambio palla ${team}`, className: 'cp' },
            { value: other.breaks, text: `${pct(other.breakPct)} punto ${opponent}`, className: 'cp-soft' },
          ]} />
        </div>
      </div>
      {data.duel && data.duel.rows.length > 0 && <>
        <h4 className="vs-tc-sub">Servizio di {team} in P{data.duel.P} (la sua rotazione migliore al servizio) contro le rotazioni di {opponent} in ricezione</h4>
        <div className="vs-table-wrap">
          <table className="vs-tc-duel">
            <thead><tr><th scope="row">{opponent} in</th>{data.duel.rows.map(r => <th key={r.P} scope="col">P{r.P}</th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">Punti / battute</th>{data.duel.rows.map(r => <td key={r.P} className="tabular-nums"><b>{r.won}</b> / {r.served}</td>)}</tr>
              <tr aria-hidden="true"><th />{data.duel.rows.map(r => <td key={r.P}><div className="vs-tc-mini"><i style={{ width: `${(r.won / r.served) * 100}%` }} /></div></td>)}</tr>
            </tbody>
          </table>
        </div>
      </>}
      <Reading sentences={reading.serve} />
    </>
  )
}

export default function TeamComparison({ match, printing = false, printToggle = () => null }) {
  const [tab, setTab] = useState('sets')
  const sets = useMemo(() => matchStates(match), [match])
  const team = match.team || 'Squadra analizzata'
  const opponent = match.opponent || 'Avversari'
  const data = useMemo(() => teamComparison(sets), [sets])
  const reading = useMemo(() => comparisonReading(data, { team, opponent }), [data, team, opponent])
  if (!data.rallies) return null
  const props = { data, team, opponent, reading }
  const charts = { sets: <SetsChart {...props} />, rotations: <RotationsChart {...props} />, serve: <ServeChart {...props} /> }

  return (
    <section className="vs-card vs-tc">
      <div className="vs-court-title"><h2 className="vs-card-title">Confronto tra le squadre</h2>{printToggle('teams')}</div>
      <p className="vs-card-subtitle">Le due squadre una di fronte all’altra: a sinistra {team}, a destra {opponent}. Il valore migliore è in evidenza.</p>
      <div className="vs-tc-tiles">
        <Tile label="Cambio palla" own={data.total.own.sideOutPct} other={data.total.other.sideOutPct} format={pct} />
        <Tile label="Break" own={data.total.own.breakPct} other={data.total.other.breakPct} format={pct} />
        <Tile label="Serie più lunga" own={data.longest.own} other={data.longest.other} />
        <Tile label="Punti dal 20 in poi" own={data.closing.own} other={data.closing.other} />
      </div>
      <p className="vs-tc-tiles-note">Punti dal 20 in poi: dal 10 nel quinto set.</p>
      {printing
        ? TABS.map(([key, label]) => <div key={key} className="vs-tc-print"><h3>{label}</h3>{charts[key]}</div>)
        : <>
          <div className="vs-flow-tabs vs-tc-tabs" role="tablist" aria-label="Confronto tra le squadre">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" id={`vs-tc-tab-${key}`} aria-selected={tab === key} aria-controls="vs-tc-panel"
                className={`vs-flow-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
            ))}
          </div>
          <div id="vs-tc-panel" role="tabpanel" aria-labelledby={`vs-tc-tab-${tab}`}>{charts[tab]}</div>
        </>}
    </section>
  )
}
