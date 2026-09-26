import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseItems } from '../src/pdf-parser.js'
import { analyze } from '../src/analysis.js'
import { buildSetFlow, findRuns, matchFlow } from '../src/match-flow.js'
import { describeMatch, describeSet } from '../src/match-reading.js'
import { ALL_SETS_LAYERS, DEFAULT_LAYERS, chartLayout, commonYRange, flowChartOption, tooltipHtml } from '../src/match-flow-chart.js'
import { CHART_SERIES_COLORS, PHASE_COLORS, ROTATION_COLORS } from '../src/theme.js'

const fromFixture = name => {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
  return parseItems(f.items, f.width, f.height)
}
const tiebreak = fromFixture('fipav-tiebreak-items.json')
const newbit = fromFixture('referto11605-items.json')
const task = getDocument({
  data: new Uint8Array(readFileSync(new URL('../../Referto gara Ritorno Volley Life vs Anguillara.pdf', import.meta.url))),
  standardFontDataUrl: join(dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'))), '../../standard_fonts') + '/',
})
let snug
try {
  const page = await (await task.promise).getPage(1)
  const viewport = page.getViewport({ scale: 1 })
  snug = parseItems((await page.getTextContent()).items, viewport.width, viewport.height)
} finally {
  await task.destroy()
}
const matches = { tiebreak, newbit, snug }

// Mark #12 as setter so P1–P6 are known (as the user does with the "p" column)
const withSetter = (match, number) => ({
  ...match,
  roster: match.roster.map(player => (player.number === number ? { ...player, isSetter: true } : player)),
  sets: match.sets.map(set => ({ ...set, rotation: set.lineup.findIndex(n => Number(n) === number) + 1 })),
})

test('the point sequence rebuilt from the service turns reaches every final score', () => {
  for (const [name, match] of Object.entries(matches)) {
    for (const flow of matchFlow(match).flows) {
      assert.ok(flow.complete, `${name} set ${flow.set}`)
      const last = flow.points.at(-1)
      assert.deepEqual([last.own, last.other], [flow.scoreOwn, flow.scoreOther])
      assert.equal(flow.points.length, flow.scoreOwn + flow.scoreOther)
      // one point per rally, the difference moves by exactly one
      flow.points.forEach((point, i) => {
        const previous = i ? flow.points[i - 1].diff : 0
        assert.equal(Math.abs(point.diff - previous), 1)
      })
    }
  }
})

test('every time-out and substitution of the scoresheets falls on a score of the sequence', () => {
  let placed = 0
  for (const match of Object.values(matches)) {
    for (const flow of matchFlow(match).flows) {
      assert.deepEqual(flow.unplacedEvents, [], `set ${flow.set}`)
      placed += flow.events.filter(event => event.type !== 'courtChange').length
    }
  }
  assert.ok(placed > 50)
})

test('BP/CP and P come from the same logic as the existing statistics', () => {
  for (const match of [tiebreak, newbit, snug]) {
    const known = withSetter(match, Number(match.sets[0].lineup[1]))
    const { flows } = matchFlow(known)
    flows.forEach((flow, index) => {
      const set = known.sets[index]
      const rows = analyze([{ ...known, sets: [set] }]).rows
      const sum = key => rows.reduce((total, row) => total + row[key], 0)
      // Same totals as the rotation table (calculateGridPoints)
      assert.equal(flow.points.filter(point => point.phase === 'BP' && point.winner === 'own').length, sum('points'), 'BP points')
      assert.equal(flow.points.filter(point => point.phase === 'CP' && point.winner === 'other').length, sum('conceded'), 'opponent BP points')
      if (!flow.rotationKnown) return
      for (let p = 1; p <= 6; p++) {
        assert.equal(flow.points.filter(point => point.rotation === p && point.phase === 'BP' && point.winner === 'own').length, rows[p - 1].points, `P${p} points`)
        assert.equal(flow.points.filter(point => point.rotation === p && point.phase === 'CP' && point.winner === 'other').length, rows[p - 1].conceded, `P${p} conceded`)
      }
    })
  }
})

test('without a setter the P is not shown', () => {
  const flow = buildSetFlow(tiebreak, 2)
  assert.equal(flow.rotationKnown, false)
  assert.ok(flow.points.every(point => point.rotation === null))
})

test('tie-break set 3: indicators, runs and events', () => {
  const { flows, indicators } = matchFlow(tiebreak)
  const i = indicators[2]
  assert.deepEqual([i.maxLead.own, i.maxLead.other, i.maxLead.diff], [7, 4, 3])
  assert.ok(i.leadLost)
  assert.deepEqual([i.maxDeficit.own, i.maxDeficit.other], [18, 22])
  assert.equal(i.ties, 7)
  assert.deepEqual([i.lastTie.own, i.lastTie.other], [16, 16])
  assert.deepEqual(i.bp, { rallies: 22, won: 8 })
  assert.deepEqual(i.cp, { rallies: 24, won: 13 })
  assert.deepEqual(flows[2].runs.map(run => run.sign * run.length), [5, -3, -3, -3])
  assert.deepEqual(flows[2].runs[0].from, { own: 2, other: 4 })
  assert.deepEqual(flows[2].runs[0].to, { own: 7, other: 4 })
  const double = flows[2].events.find(event => event.type === 'doubleChange')
  assert.deepEqual([double.team, double.score], ['own', { own: 17, other: 19 }])
  assert.deepEqual(double.changes.map(change => [change.position, change.in.number, change.out.number]), [['I', '3', '17'], ['IV', '15', '5']])
  // Opponent time-out written "24:21" on its box = 21-24 for the analyzed team
  assert.deepEqual(flows[2].events.find(event => event.type === 'timeout' && event.team === 'other').score, { own: 21, other: 24 })
})

test('fifth set: court change when the first team reaches 8 (4 for the other, as circled on the scoresheet)', () => {
  const flow = matchFlow(tiebreak).flows[4]
  const change = flow.events.find(event => event.type === 'courtChange')
  assert.deepEqual(change.score, { own: 8, other: 4 })
  assert.equal(matchFlow(tiebreak).flows[2].events.some(event => event.type === 'courtChange'), false)
})

test('runs: default of 3 consecutive points, threshold configurable', () => {
  const flow = buildSetFlow(tiebreak, 1)
  assert.ok(flow.runs.every(run => run.length >= 3))
  assert.ok(findRuns(flow.points, 5).every(run => run.length >= 5))
  assert.ok(findRuns(flow.points, 2).length > flow.runs.length)
})

test('readings are deterministic, descriptive and never causal', () => {
  const { flows, indicators } = matchFlow(tiebreak)
  const context = { team: tiebreak.team, opponent: tiebreak.opponent, female: true }
  const set3 = describeSet(indicators[2], flows[2], context)
  assert.equal(set3, describeSet(indicators[2], flows[2], context))
  assert.match(set3, /^3° set perso 21-25\. Ultima parità sul 16-16/)
  assert.match(set3, /Vantaggio massimo di 3 punti sul 7-4, annullato sul 10-10\./)
  assert.match(set3, /Time-out richiesto sul 16-18; nei punti successivi il punteggio è arrivato a 18-21\./)
  assert.match(set3, /Doppio cambio \(#3 in I, #15 in IV\) sul 17-19/)
  const match = describeMatch(indicators, flows, context)
  assert.match(match, /gara vinta 3-2 \(25-19, 25-23, 21-25, 22-25, 15-9\)/)
  assert.match(match, /svantaggio di 9 sull'8-17/)
  for (const text of [set3, match]) {
    assert.doesNotMatch(text, /grazie|a causa|ha permesso|ha consentito|carattere|combattut|deve migliorare|Differenziale|[Bb]attit/)
  }
})

test('chart: terminology, tooltip and filters that do not touch the data', () => {
  const known = withSetter(tiebreak, 12)
  const flow = buildSetFlow(known, 2)
  const snapshot = JSON.stringify(flow)
  const context = { team: known.team, opponent: known.opponent }
  const raw = tooltipHtml(flow, 34, context)
  const html = raw.replace(/<span[^>]*><\/span>/g, '') // drop color swatches, keep text
  assert.match(html, /Punteggio: 16-18/)
  assert.match(html, /Differenza: −2/)
  assert.match(html, /Fase: CP/)
  assert.match(html, /P: P\d/)
  assert.match(html, /Al servizio: #\d+/)
  assert.match(html, /Time-out/)
  assert.match(html, /Serie negativa: 3 punti/)
  assert.match(html, /Evento:<\/strong> Time-out/)
  assert.match(raw, /background:#E65100/, 'CP swatch uses the CP color')
  assert.doesNotMatch(html, /Differenziale|[Bb]attit/)
  for (const filters of [{ phase: 'BP', rotation: 'all', events: 'all' }, { phase: 'all', rotation: '2', events: 'timeouts' }]) {
    const option = flowChartOption(flow, { layers: DEFAULT_LAYERS, filters, context })
    assert.ok(option.series.length > 0)
  }
  assert.equal(JSON.stringify(flow), snapshot)
})

test('break point and side-out cards match the rotation table and the point sequence', () => {
  for (const [name, match] of Object.entries(matches)) {
    const result = analyze([match])
    const tablePoints = result.rows.reduce((total, row) => total + row.points, 0)
    assert.equal(result.breakPoints, tablePoints, `${name}: BP card = rotation table`)
    const flowBp = matchFlow(match).flows.reduce((total, flow) => total + flow.points.filter(p => p.phase === 'BP' && p.winner === 'own').length, 0)
    assert.equal(result.breakPoints, flowBp, `${name}: BP card = sequence`)
    assert.equal(result.reception.pointsInReception, result.scored - result.breakPoints, `${name}: CP card`)
  }
  // Tie-break: LAGARIS serves first in set 1 and wins the first 4 rallies: 50 BP, 58 CP
  assert.deepEqual([analyze([tiebreak]).breakPoints, analyze([tiebreak]).reception.pointsInReception], [50, 58])
})

test('visual defaults and shared colors', () => {
  // Shown at first: score, phase, P, time-outs, double changes; the rest available but off
  assert.deepEqual(Object.keys(DEFAULT_LAYERS).filter(key => DEFAULT_LAYERS[key]), ['score', 'phase', 'rotation', 'timeouts', 'doubleChanges'])
  // BP/CP are the same colors as the "Rendimento per rotazione" bar chart (first two series)
  assert.deepEqual([PHASE_COLORS.BP, PHASE_COLORS.CP], CHART_SERIES_COLORS.slice(0, 2))
  // Six fixed, distinct P colors, none equal to a phase color; readable label on each
  const fills = [1, 2, 3, 4, 5, 6].map(p => ROTATION_COLORS[p].fill.toLowerCase())
  assert.equal(new Set(fills).size, 6)
  assert.ok(fills.every(fill => ![PHASE_COLORS.BP, PHASE_COLORS.CP].map(c => c.toLowerCase()).includes(fill)))
  const luminance = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0)
  const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  for (let p = 1; p <= 6; p++) assert.ok(contrast(ROTATION_COLORS[p].fill, ROTATION_COLORS[p].text) >= 4.4, `P${p} label contrast`)
})

test('chart: y scale fitted to the set, zero visible, clean line without fill', () => {
  const flow = buildSetFlow(tiebreak, 4) // 15-9, the difference never goes below zero after 0-0
  const option = flowChartOption(flow, { layers: DEFAULT_LAYERS, filters: { phase: 'all', rotation: 'all', events: 'all' }, context: {} })
  const y = option.yAxis[0]
  assert.equal(y.max, Math.max(...flow.points.map(p => p.diff)) + 1)
  assert.equal(y.min, Math.min(0, ...flow.points.map(p => p.diff)) - 1)
  assert.ok(y.min < 0 && y.min >= -2, 'zero visible without a large empty negative half')
  assert.ok(option.series.every(series => !series.areaStyle), 'no filled area under the line')
  assert.equal(option.xAxis[0].name, undefined)
  assert.equal(y.name, 'Differenza')
})

test('"Tutti i set": one Y scale for the whole match, compact layout, same data', () => {
  const { flows, indicators } = matchFlow(tiebreak)
  const range = commonYRange(flows)
  const all = flows.flatMap(flow => flow.points.map(point => point.diff))
  assert.deepEqual(range, { min: Math.min(0, ...all) - 1, max: Math.max(0, ...all) + 1 })
  assert.ok(range.min < 0 && range.max > 0)
  for (const flow of flows) {
    const option = flowChartOption(flow, { layers: ALL_SETS_LAYERS, context: {}, compact: true, yRange: range })
    assert.deepEqual([option.yAxis[0].min, option.yAxis[0].max], [range.min, range.max], `set ${flow.set} uses the common scale`)
  }
  // compact chart: smaller, one event lane per team; details (substitutions, runs, server) off
  const known = withSetter(tiebreak, 12)
  const flow = buildSetFlow(known, 2)
  assert.ok(chartLayout(flow, ALL_SETS_LAYERS, { compact: true }).height < chartLayout(flow, DEFAULT_LAYERS).height)
  assert.equal(chartLayout(flow, ALL_SETS_LAYERS, { compact: true }).eventLanes.length, 2)
  assert.deepEqual([ALL_SETS_LAYERS.substitutions, ALL_SETS_LAYERS.runs, ALL_SETS_LAYERS.server], [false, false, false])
  // compact reading = the beginning of the full reading, same sentences
  const context = { team: tiebreak.team, opponent: tiebreak.opponent }
  const full = describeSet(indicators[2], flows[2], context)
  const compact = describeSet(indicators[2], flows[2], context, { compact: true })
  assert.ok(compact.length < full.length && full.startsWith(compact))
  assert.doesNotMatch(compact, /fase BP|Time-out/)
})
