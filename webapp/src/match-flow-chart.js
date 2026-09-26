// ECharts option for the "Andamento della gara" chart, built from a match-flow set.
// Pure function: layers and filters only change what is drawn, never the data.
// Visual hierarchy: 1. difference line  2. phase lane  3. P lane  4. events lane  5. details (tooltip).
import { eventLabel } from './match-reading.js'
import { EVENT_COLORS, PHASE_COLORS, ROTATION_COLORS, TREND_COLORS } from './theme.js'

export const DEFAULT_LAYERS = {
  score: true,
  phase: true,
  rotation: true,
  timeouts: true,
  doubleChanges: true,
  substitutions: false,
  runs: false,
  server: false,
  courtChange: false,
}
export const DEFAULT_FILTERS = { phase: 'all', rotation: 'all', events: 'all' }

const EVENT_SHORT = { timeout: 'TO', substitution: 'S', doubleChange: 'DC', courtChange: 'CC' }
const EVENT_LAYER = { timeout: 'timeouts', substitution: 'substitutions', doubleChange: 'doubleChanges', courtChange: 'courtChange' }
const EVENT_FILTER = { timeouts: 'timeout', substitutions: 'substitution', doubleChanges: 'doubleChange' }
const EVENT_LANES = ['other:1', 'other:0', 'own:1', 'own:0'] // bottom to top
const COMPACT_EVENT_LANES = ['other:0', 'own:0']
const GRID_LEFT = 70
const GRID_RIGHT = 16
const AXIS_INK = '#7D7D7D'
const LANE_NAME = { phase: 'Fase', rotation: 'P', server: 'Al servizio', events: 'Eventi' }
const LANE_HEIGHT = { phase: 14, rotation: 20, server: 16, events: 4 * 15 }
const textWidth = text => String(text).length * 5.8 + 8 // 9px bold labels, approximate

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')
const swatch = color => `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${color};margin-right:4px;vertical-align:0"></span>`

export const servingText = (server, context) => {
  if (!server?.number) return ''
  const team = server.team === 'own' ? '' : ` (${context.opponent || 'avversaria'})`
  return `#${server.number}${server.name ? ` ${server.name}` : ''}${team}`
}

// Contiguous blocks of rallies sharing a value, as [from, to] on the x axis (rally i spans i-1..i)
function segments(points, key) {
  const blocks = []
  points.forEach(point => {
    const value = key(point)
    const last = blocks.at(-1)
    if (last && last.value === value) last.to = point.index
    else blocks.push({ value, from: point.index - 1, to: point.index })
  })
  return blocks
}

export function visibleEvents(flow, layers, filters) {
  return flow.events.filter(event => {
    if (!layers[EVENT_LAYER[event.type]]) return false
    if (filters.events === 'all') return true
    return EVENT_FILTER[filters.events] === event.type
  })
}

export function matchesFilters(point, filters) {
  return (filters.phase === 'all' || point.phase === filters.phase) &&
    (filters.rotation === 'all' || String(point.rotation) === String(filters.rotation))
}

export function tooltipHtml(flow, x, context) {
  if (x <= 0) return '<strong>Inizio set</strong><br/>Punteggio: 0-0'
  const point = flow.points[x - 1]
  if (!point) return ''
  const rows = [
    `<strong>Punteggio: ${point.own}-${point.other}</strong>`,
    `Differenza: ${signed(point.diff)}`,
    `Fase: ${swatch(PHASE_COLORS[point.phase])}${point.phase}`,
  ]
  if (point.rotation) rows.push(`P: ${swatch(ROTATION_COLORS[point.rotation].fill)}P${point.rotation}`)
  const serving = servingText(point.server, context)
  if (serving) rows.push(`Al servizio: ${escapeHtml(serving)}`)
  const events = flow.events.filter(e => e.after === x)
  if (events.length) {
    rows.push('')
    rows.push(`<strong>Evento:</strong> ${events.map(event => escapeHtml(eventLabel(event))).join('<br/>')}`)
  }
  if (point.run) {
    rows.push('')
    rows.push(`<strong>Serie ${point.run.sign > 0 ? 'positiva' : 'negativa'}: ${point.run.length} punti</strong>`)
  }
  return rows.join('<br/>')
}

// "Tutti i set": what each set shows by default (the fitter details stay in the interactive view)
export const ALL_SETS_LAYERS = {
  ...DEFAULT_LAYERS,
  substitutions: false,
  runs: false,
  server: false,
  courtChange: true, // only present in the fifth set
}

// One Y scale for all the sets of a match, from the largest deficit to the largest lead, zero included
export function commonYRange(flows) {
  const diffs = flows.flatMap(flow => flow.points.map(point => point.diff))
  return { min: Math.min(0, ...diffs) - 1, max: Math.max(0, ...diffs) + 1 }
}

// Vertical layout: main chart, then the lanes in hierarchy order (Fase, P, Al servizio, Eventi).
// compact: smaller chart and one event lane per team, for the "Tutti i set" view.
export function chartLayout(flow, layers, { compact = false } = {}) {
  const lanes = []
  if (layers.phase) lanes.push('phase')
  if (layers.rotation && flow.rotationKnown) lanes.push('rotation')
  if (layers.server) lanes.push('server')
  if (flow.events.some(event => layers[EVENT_LAYER[event.type]])) lanes.push('events')
  const top = compact ? 18 : 24
  const main = compact ? 140 : 220
  const eventLanes = compact ? COMPACT_EVENT_LANES : EVENT_LANES
  let y = top + main + 28 // room for the x axis numbers
  const positions = lanes.map(lane => {
    const height = lane === 'events' ? eventLanes.length * 15 : LANE_HEIGHT[lane]
    const position = { lane, top: y, height }
    y += height + 6
    return position
  })
  return { top, main, lanes: positions, eventLanes, height: y + 4 }
}

// yRange: a common scale for several sets ("Tutti i set"); by default the scale fits this set
export function flowChartOption(flow, { layers = DEFAULT_LAYERS, filters = DEFAULT_FILTERS, context = {}, width = 900, compact = false, yRange = null } = {}) {
  const n = flow.points.length
  const pxPerRally = Math.max(1, (width - GRID_LEFT - GRID_RIGHT) / Math.max(1, n))
  const fits = (rallies, label) => rallies * pxPerRally >= textWidth(label)
  const layout = chartLayout(flow, layers, { compact })
  const diffs = flow.points.map(point => point.diff)
  const filtering = filters.phase !== 'all' || filters.rotation !== 'all'
  const data = [[0, 0], ...flow.points.map(point => [point.index, point.diff])]

  // Y scale fitted to the values reached in the set, zero always visible
  const yMin = yRange ? yRange.min : Math.min(0, ...diffs) - 1
  const yMax = yRange ? yRange.max : Math.max(0, ...diffs) + 1

  const grids = [{ left: GRID_LEFT, right: GRID_RIGHT, top: layout.top, height: layout.main }]
  const xAxes = [{
    type: 'value', min: 0, max: n, gridIndex: 0, interval: 5,
    axisLine: { onZero: false, lineStyle: { color: '#CFD8DC' } },
    axisTick: { lineStyle: { color: '#CFD8DC' } },
    axisLabel: { color: AXIS_INK, showMaxLabel: false, fontSize: 10 },
    splitLine: { show: false },
  }]
  const yAxes = [{
    type: 'value', min: yMin, max: yMax, gridIndex: 0, minInterval: 1,
    name: 'Differenza', nameTextStyle: { color: '#505050', fontSize: 11, align: 'left' },
    axisLabel: { color: AXIS_INK, fontSize: 10, formatter: value => signed(value) },
    splitLine: { lineStyle: { color: '#F1F3F5' } },
  }]
  const series = []

  // 0. Full sequence, invisible: drives the tooltip and carries the "Parità" line
  series.push({
    name: 'Differenza', type: 'line', data, symbol: 'none', lineStyle: { opacity: 0 }, z: 1,
    markLine: {
      silent: true, symbol: 'none',
      lineStyle: { color: TREND_COLORS.level, width: 1.6, type: 'solid' },
      // at the end of the set, on the side the line is not
      label: { show: true, position: (diffs.at(-1) ?? 0) > 0 ? 'insideEndBottom' : 'insideEndTop', formatter: 'Parità', color: TREND_COLORS.level, fontSize: 10, fontWeight: 600 },
      data: [{ yAxis: 0 }],
    },
  })

  // 1. The difference line: dominant, no fill. The difference moves by one point per rally, so it
  // always touches zero when it changes sign and splitting it at zero is exact.
  if (layers.score) {
    for (const [name, keep, color] of [['In vantaggio', d => d >= 0, TREND_COLORS.positive], ['In svantaggio', d => d <= 0, TREND_COLORS.negative]]) {
      series.push({
        name, type: 'line', silent: true, symbol: 'none', connectNulls: false, z: 5,
        data: data.map(([x, d]) => [x, keep(d) ? d : null]),
        lineStyle: { color, width: 2.6, opacity: filtering ? 0.3 : 1, cap: 'round', join: 'round' },
      })
    }
  }

  // Runs: the stretch of the line itself is highlighted, with a small "+4" / "−3" label
  if (layers.runs) {
    flow.runs.forEach((run, i) => {
      const color = run.sign > 0 ? TREND_COLORS.positive : TREND_COLORS.negative
      const stretch = data.slice(run.start - 1, run.end + 1)
      series.push({
        name: `Serie ${i + 1}`, type: 'line', silent: true, symbol: 'none', z: 4,
        data: stretch,
        lineStyle: { color, width: 8, opacity: 0.25, cap: 'round' },
      })
    })
    // Labels at the end of each run (a line without symbols cannot carry labels)
    series.push({
      name: 'Etichette serie', type: 'scatter', silent: true, symbolSize: 0, z: 7,
      data: flow.runs.map(run => ({
        value: [run.end, flow.points[run.end - 1].diff],
        label: {
          show: true, position: run.sign > 0 ? 'top' : 'bottom', distance: 6,
          formatter: `${run.sign > 0 ? '+' : '−'}${run.length}`,
          color: run.sign > 0 ? TREND_COLORS.positive : TREND_COLORS.negative, fontWeight: 700, fontSize: 11,
        },
      })),
    })
  }

  if (filtering) {
    series.push({
      name: 'Punti filtrati', type: 'scatter', symbolSize: 8, z: 6,
      data: flow.points.filter(point => matchesFilters(point, filters)).map(point => ({
        value: [point.index, point.diff],
        itemStyle: { color: point.winner === 'own' ? TREND_COLORS.positive : TREND_COLORS.negative, borderColor: '#FFFFFF', borderWidth: 1.5 },
      })),
    })
  }

  // Event guides on the main chart: very light, the events lane carries the information
  const events = visibleEvents(flow, layers, filters)
  if (events.length) {
    series.push({
      name: 'Guide eventi', type: 'line', data: [], silent: true,
      markLine: {
        silent: true, symbol: 'none', label: { show: false },
        data: events.map(event => ({
          xAxis: event.after,
          lineStyle: { color: '#B0BEC5', width: 1, opacity: 0.55, type: event.team === 'other' ? 'dashed' : 'solid' },
        })),
      },
    })
  }

  const laneAxis = (position, extra = {}) => {
    const gridIndex = grids.length
    grids.push({ left: GRID_LEFT, right: GRID_RIGHT, top: position.top, height: position.height })
    xAxes.push({ type: 'value', min: 0, max: n, gridIndex, show: false })
    yAxes.push({
      type: 'category', gridIndex, data: [''],
      name: LANE_NAME[position.lane], nameLocation: 'middle', nameRotate: 0, nameGap: 12,
      nameTextStyle: { fontSize: 10, color: '#505050', align: 'right', fontWeight: 600 },
      axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
      ...extra,
    })
    return gridIndex
  }
  const blocksSeries = (gridIndex, name, blocks, borderWidth) => series.push({
    name, type: 'line', xAxisIndex: gridIndex, yAxisIndex: gridIndex, data: [], silent: true,
    markArea: {
      silent: true,
      data: blocks.map(block => {
        const dimmed = filtering && !flow.points.slice(block.from, block.to).some(point => matchesFilters(point, filters))
        return [{
          xAxis: block.from,
          itemStyle: { color: block.color, opacity: dimmed ? 0.25 : 1, borderColor: '#FFFFFF', borderWidth },
          label: { show: fits(block.to - block.from, block.label), position: 'inside', formatter: block.label, color: block.textColor || '#FFFFFF', fontSize: 9, fontWeight: 700 },
        }, { xAxis: block.to }]
      }),
    },
  })

  const doubleChanges = flow.events.filter(event => event.type === 'doubleChange' && event.team === 'own')
  for (const position of layout.lanes) {
    if (position.lane === 'phase') {
      const gridIndex = laneAxis(position)
      blocksSeries(gridIndex, 'Fase', segments(flow.points, point => point.phase)
        .map(block => ({ ...block, color: PHASE_COLORS[block.value], label: block.value })), 1)
    }
    if (position.lane === 'rotation') {
      const gridIndex = laneAxis(position)
      blocksSeries(gridIndex, 'P', segments(flow.points, point => point.rotation).map(block => ({
        ...block, color: ROTATION_COLORS[block.value].fill, textColor: ROTATION_COLORS[block.value].text, label: `P${block.value}`,
      })), 2)
      // Double changes of the analyzed team: a clear break in the P lane (the P itself comes from the
      // app's logic and is not reinterpreted here)
      if (doubleChanges.length && layers.doubleChanges) {
        series.push({
          name: 'Discontinuità P', type: 'line', xAxisIndex: gridIndex, yAxisIndex: gridIndex, data: [], silent: true,
          markLine: {
            silent: true, symbol: ['none', 'triangle'], symbolSize: 7,
            lineStyle: { color: EVENT_COLORS.doubleChange, width: 3, type: 'solid' },
            label: { show: false },
            data: doubleChanges.map(event => ({ xAxis: event.after })),
          },
        })
      }
    }
    if (position.lane === 'server') {
      const gridIndex = laneAxis(position)
      blocksSeries(gridIndex, 'Al servizio', segments(flow.points, point => `${point.server.team}:${point.server.number}`).map(block => {
        const own = block.value.startsWith('own:')
        const number = block.value.split(':')[1]
        return { ...block, color: own ? '#ECEFF1' : '#FAFAFA', label: number ? `#${number}` : '', textColor: own ? '#011627' : '#9E9E9E' }
      }), 1)
    }
    if (position.lane === 'events') {
      const gridIndex = laneAxis(position, {
        data: layout.eventLanes,
        name: '',
        axisLabel: {
          show: true, margin: 12, fontSize: 10, fontWeight: 600, color: '#505050',
          formatter: lane => ({ 'own:0': 'Eventi', 'other:0': 'avv.' })[lane] || '',
        },
      })
      // Two lanes per team; events on the same rally share one badge; close badges use the second lane
      const groups = new Map()
      for (const event of events) {
        const team = event.team === 'other' ? 'other' : 'own'
        const key = `${team}:${event.after}`
        groups.set(key, { team, after: event.after, events: [...(groups.get(key)?.events || []), event] })
      }
      const lastX = Object.fromEntries(layout.eventLanes.map(lane => [lane, -Infinity]))
      const badges = [...groups.values()].sort((a, b) => a.after - b.after).map(group => {
        const label = group.events.map(e => EVENT_SHORT[e.type]).join('+')
        const badgeWidth = textWidth(label) + 2
        const lanes = [`${group.team}:0`, `${group.team}:1`].filter(lane => layout.eventLanes.includes(lane))
        const lane = lanes.find(candidate => (group.after - lastX[candidate]) * pxPerRally >= badgeWidth + 3) ||
          lanes.reduce((best, candidate) => (lastX[candidate] < lastX[best] ? candidate : best))
        lastX[lane] = group.after
        return { ...group, label, lane, badgeWidth }
      })
      series.push({
        name: 'Eventi', type: 'scatter', xAxisIndex: gridIndex, yAxisIndex: gridIndex, silent: true, symbol: 'roundRect',
        data: badges.map(badge => {
          const color = badge.events.length === 1 ? EVENT_COLORS[badge.events[0].type] : '#455A64'
          const own = badge.team === 'own'
          // Analyzed team: filled badge. Opponent: outlined badge (same color, lighter weight)
          return {
            value: [badge.after, badge.lane],
            symbolSize: [badge.badgeWidth, 14],
            itemStyle: own ? { color } : { color: '#FFFFFF', borderColor: color, borderWidth: 1.5 },
            label: { show: true, position: 'inside', color: own ? '#FFFFFF' : color, fontSize: 9, fontWeight: 700, formatter: badge.label },
          }
        }),
      })
    }
  }

  return {
    animation: false,
    aria: { enabled: true },
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#90A4AE' } },
      textStyle: { fontFamily: 'Roboto, sans-serif', fontSize: 12 },
      formatter: params => {
        const x = Math.round(Array.isArray(params) ? params[0]?.axisValue ?? params[0]?.value?.[0] : params?.value?.[0])
        return tooltipHtml(flow, Number.isFinite(x) ? x : 0, context)
      },
    },
    series,
  }
}
