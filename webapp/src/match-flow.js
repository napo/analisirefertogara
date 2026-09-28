// Point-by-point flow of a set. Phase, P of both teams, front rows and who serves come from the canonical
// rally states (rally-state.js); here only the chart data, runs and events are built.
// Pure functions, no React: the same logic can later be applied to several matches (history).
import { rosterPlayer } from './athletes.js'
import { frontRow, setStates } from './rally-state.js'

export const DEFAULT_RUN_LENGTH = 3
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

const parseScore = text => {
  const match = String(text ?? '').match(/^\s*(\d+)\s*:\s*(\d+)\s*$/)
  return match ? [Number(match[1]), Number(match[2])] : null
}
const playerLabel = (number, roster) => {
  if (number === undefined || number === null || String(number).trim() === '') return null
  const player = (roster || []).map(rosterPlayer).find(entry => Number(entry.number) === Number(number))
  const name = (player?.name || '').replace(/\s*-\s*L[12]?$/, '').trim()
  return { number: String(number).trim(), name }
}

// Rebuild the rallies of a set. Each rally: score after it, winner, serving team, phase of the analyzed
// team (BP = analyzed team serving, CP = receiving), P (same formula as the statistics) and who serves.
export function buildSetFlow(match, setIndex, { runLength = DEFAULT_RUN_LENGTH } = {}) {
  const set = match.sets[setIndex]
  const built = setStates(match, setIndex)
  const { servesFirst, complete } = built
  const knownRotation = built.states.some(state => state.teams.own.P !== null)
  const points = built.states.map(state => ({
    index: state.rally,
    own: state.score.own,
    other: state.score.other,
    diff: state.score.own - state.score.other,
    winner: state.winner,
    servingTeam: state.servingTeam,
    phase: state.phase,
    column: state.teams.own.column,
    rotation: state.teams.own.P,
    opponentRotation: state.teams.other.P,
    frontRow: frontRow(state, 'own'),
    opponentFrontRow: frontRow(state, 'other'),
    server: { team: state.servingTeam, ...(playerLabel(state.teams[state.servingTeam].server,
      state.servingTeam === 'own' ? match.roster : match.opponentRoster) || { number: '', name: '' }) },
  }))

  const runs = findRuns(points, runLength)
  for (const run of runs) {
    for (let i = run.start; i <= run.end; i++) points[i - 1].run = { sign: run.sign, length: run.length }
  }
  const events = placeEvents(match, setIndex, points)
  return {
    set: setIndex + 1,
    scoreOwn: set.scoreOwn,
    scoreOther: set.scoreOther,
    won: set.scoreOwn > set.scoreOther,
    servesFirst,
    rotationKnown: knownRotation,
    excludedRotations: points.filter(point => point.rotation === null).length,
    complete,
    points,
    runs,
    events: events.placed,
    unplacedEvents: events.unplaced,
  }
}

// Consecutive points won by the same team, at least `minLength` long.
export function findRuns(points, minLength = DEFAULT_RUN_LENGTH) {
  const runs = []
  let start = 0
  for (let i = 1; i <= points.length; i++) {
    if (i < points.length && points[i].winner === points[start].winner) continue
    const length = i - start
    if (points.length && length >= minLength) {
      const before = start ? points[start - 1] : { own: 0, other: 0 }
      const slice = points.slice(start, i)
      runs.push({
        sign: points[start].winner === 'own' ? 1 : -1,
        length,
        start: start + 1,
        end: i,
        from: { own: before.own, other: before.other },
        to: { own: points[i - 1].own, other: points[i - 1].other },
        phases: countBy(slice, point => point.phase),
        rotations: countBy(slice.filter(point => point.rotation), point => point.rotation),
      })
    }
    start = i
  }
  return runs
}

const countBy = (list, key) => list.reduce((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] || 0) + 1 }), {})

// Place time-outs, substitutions, double changes and the fifth-set court change on the sequence.
// Scores on the scoresheet are written with the requesting team's points first. `after` is the number
// of rallies already played (0 = before the first rally).
function placeEvents(match, setIndex, points) {
  const set = match.sets[setIndex]
  const placed = []
  const unplaced = []
  const indexOf = (team, pair) => {
    const own = team === 'own' ? pair[0] : pair[1]
    const other = team === 'own' ? pair[1] : pair[0]
    if (own === 0 && other === 0) return 0
    const found = points.findIndex(point => point.own === own && point.other === other)
    return found < 0 ? -1 : found + 1
  }
  const scoreAt = after => (after === 0 ? { own: 0, other: 0 } : { own: points[after - 1].own, other: points[after - 1].other })
  const add = (event, text) => {
    const pair = parseScore(text)
    const after = pair ? indexOf(event.team, pair) : -1
    if (after < 0) unplaced.push({ ...event, scoreText: text })
    else placed.push({ ...event, after, score: scoreAt(after) })
  }

  for (const team of ['own', 'other']) {
    const prefix = team === 'own' ? '' : 'opponent'
    const key = name => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name)
    for (const text of set[key('timeouts')] || []) if (String(text ?? '').trim()) add({ type: 'timeout', team }, text)

    const lineup = set[key('lineup')] || []
    const roster = team === 'own' ? match.roster : match.opponentRoster
    const substitutions = (set[key('substitutions')] || []).map((cell, column) => ({ ...cell, column }))
      .filter(cell => String(cell?.in ?? '').trim())
    // Same team, same score, two or more positions: a double change (e.g. setter and opposite)
    for (const field of ['scoreIn', 'scoreOut']) {
      const groups = new Map()
      for (const cell of substitutions) {
        const text = String(cell[field] ?? '').trim()
        if (!parseScore(text)) continue
        const pair = parseScore(text).join(':')
        groups.set(pair, [...(groups.get(pair) || []), cell])
      }
      for (const [pair, cells] of groups) {
        const changes = cells.map(cell => ({
          position: ROMAN[cell.column],
          in: playerLabel(field === 'scoreIn' ? cell.in : lineup[cell.column], roster),
          out: playerLabel(field === 'scoreIn' ? lineup[cell.column] : cell.in, roster),
        }))
        add({ type: cells.length > 1 ? 'doubleChange' : 'substitution', team, returning: field === 'scoreOut', changes }, pair)
      }
    }
  }

  // Fifth set (tie-break at 15): teams change court when the first team reaches 8 points.
  if (setIndex === 4) {
    const found = points.findIndex(point => Math.max(point.own, point.other) === 8)
    if (found >= 0) placed.push({ type: 'courtChange', team: null, after: found + 1, score: scoreAt(found + 1) })
  }
  placed.sort((a, b) => a.after - b.after)
  return { placed, unplaced }
}

// Figures describing a set, used by the chart and by the automatic reading.
export function setIndicators(flow) {
  const { points } = flow
  const peak = (compare) => points.reduce((best, point) => (!best || compare(point.diff, best.diff) ? point : best), null)
  const maxLead = peak((a, b) => a > b)
  const maxDeficit = peak((a, b) => a < b)
  const ties = points.filter(point => point.diff === 0)
  let leadChanges = 0
  let lastSign = 0
  for (const point of points) {
    const sign = Math.sign(point.diff)
    if (sign && lastSign && sign !== lastSign) leadChanges += 1
    if (sign) lastSign = sign
  }
  const phase = name => {
    const rallies = points.filter(point => point.phase === name)
    return { rallies: rallies.length, won: rallies.filter(point => point.winner === 'own').length }
  }
  const longest = sign => flow.runs.filter(run => run.sign === sign).reduce((best, run) => (!best || run.length > best.length ? run : best), null)
  // Lead given away: a lead of 3+ later cancelled (score back to level or behind)
  const leadLost = maxLead && maxLead.diff >= 3 && points.slice(maxLead.index).some(point => point.diff <= 0) ? maxLead : null
  // Deficit recovered: a deficit of 3+ later cancelled
  const deficitRecovered = maxDeficit && maxDeficit.diff <= -3 && points.slice(maxDeficit.index).some(point => point.diff >= 0) ? maxDeficit : null
  return {
    set: flow.set,
    won: flow.won,
    final: { own: flow.scoreOwn, other: flow.scoreOther },
    margin: Math.abs(flow.scoreOwn - flow.scoreOther),
    rallies: points.length,
    maxLead: maxLead && maxLead.diff > 0 ? maxLead : null,
    maxDeficit: maxDeficit && maxDeficit.diff < 0 ? maxDeficit : null,
    ties: ties.length,
    lastTie: ties.at(-1) || null,
    leadChanges,
    leadLost,
    deficitRecovered,
    longestPositive: longest(1),
    longestNegative: longest(-1),
    bp: phase('BP'),
    cp: phase('CP'),
    rotationKnown: flow.rotationKnown,
  }
}

// Everything needed for one match: flows and indicators per set.
export function matchFlow(match, options) {
  const flows = (match.sets || []).map((_, index) => buildSetFlow(match, index, options))
  return { flows, indicators: flows.map(setIndicators) }
}
