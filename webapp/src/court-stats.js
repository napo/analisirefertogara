// Pure aggregations. Input may contain canonical records from one or several matches.
import { backRowSlots, frontRow, playerAt } from './rally-state.js'

// Compact label of a back-row slot: "#10", "L#5⇒#11" (libero #5 in place of #11), "L?⇒#11" (exchange
// not placeable with certainty)
export const slotLabel = slot => (slot.libero ? `L${slot.number ? `#${slot.number}` : '?'}⇒#${slot.replaced}` : slot.number ? `#${slot.number}` : '—')
export const backRowLabels = (state, team) => backRowSlots(state, team).map(slotLabel)

// Descriptive UI warning only ("pochi rally osservati"): never used in calculations
export const FEW_RALLIES = 5
// "Confronto delle rotazioni": below this number of rallies a cell is drawn lighter and a rotation or a
// crossing is not proposed as the most profitable / most in difficulty
export const COMPARISON_MIN_RALLIES = 4

// Rallies of one set (1-based) or of all sets ('all'); states of several matches keep their own set number
export const filterSet = (states, set = 'all') => (set === 'all' ? states : states.filter(s => s.set === Number(set)))

export const filterPhase = (states, phase = 'all') => states.filter(s => phase === 'all' || s.phase === phase)
export function tally(states) {
  const rallies = states.length
  const won = states.filter(s => s.winner === 'own').length
  return { rallies, won, lost: rallies - won, percent: rallies ? won / rallies * 100 : null }
}
const knownP = P => Number.isInteger(P) && P >= 1 && P <= 6
export const matrixEligible = s => knownP(s.teams.own.P) && knownP(s.teams.other.P) && s.reliable !== false
// Rallies on court per player of one team (won/lost by the team while the player was on court).
// { rallies, won, lost, uncertain }: uncertain = rallies counted for the player listed on the scoresheet
// while a libero exchange that cannot be placed may have taken her place (inferred, not observed). When a
// libero surely plays but it is not known which one, the rally is attributed to nobody in that position.
export function presenceByPlayer(states, team) {
  const presence = new Map()
  for (const state of states) {
    const side = state.teams[team]
    const counted = new Map()
    side.columns.forEach((nominal, column) => {
      const physical = side.onCourt[column]
      if (physical) counted.set(physical, counted.get(physical) || false)
      else if (side.libero?.column === column && side.libero.reason === 'unmatched' && nominal) counted.set(nominal, true)
    })
    for (const [number, inferred] of counted) {
      const entry = presence.get(number) || { rallies: 0, won: 0, lost: 0, uncertain: 0 }
      entry.rallies += 1
      if (state.winner === team) entry.won += 1
      else entry.lost += 1
      if (inferred) entry.uncertain += 1
      presence.set(number, entry)
    }
  }
  return presence
}

// Why the P of a team is not determined, per team and reason, with the sets involved. A rally missing
// both P appears under both teams. reason: 'unreliable' (court not reconstructable) or the setter status
// ('unmarked', 'none', 'ambiguous', 'unknown').
export function exclusionReasons(states) {
  const groups = new Map()
  for (const state of states) {
    for (const team of ['own', 'other']) {
      const side = state.teams[team]
      if (knownP(side.P)) continue
      const reason = side.reliable === false ? 'unreliable' : side.setter?.status || 'unmarked'
      const key = `${team}:${reason}`
      if (!groups.has(key)) groups.set(key, { team, reason, rallies: 0, sets: new Set() })
      const group = groups.get(key)
      group.rallies += 1
      group.sets.add(state.set)
    }
  }
  return [...groups.values()].map(group => ({ ...group, sets: [...group.sets].sort((a, b) => a - b) }))
    .sort((a, b) => b.rallies - a.rallies)
}
export function groupRallies(states, fields) {
  const groups = new Map()
  for (const state of states) {
    const values = fields(state), key = JSON.stringify(values)
    if (!groups.has(key)) groups.set(key, { ...values, key, states: [] })
    groups.get(key).states.push(state)
  }
  return [...groups.values()].map(({ states, ...group }) => ({ ...group, ...tally(states) }))
    .sort((a, b) => b.rallies - a.rallies || a.key.localeCompare(b.key))
}
export function courtConfigurations(states, phase = 'all') {
  return groupRallies(filterPhase(states, phase).filter(s => s.teams.own.reliable !== false), s => ({
    phase: s.phase, server: s.phase === 'BP' ? s.teams.own.server : null,
    frontRow: frontRow(s, 'own'), backRow: backRowLabels(s, 'own'), P: s.teams.own.P,
  }))
}
// ---- "Confronto delle rotazioni": P of the analyzed team (rows) against P of the opponent (columns) ----
// Every cell counts BP and CP apart. Two measures of the same rallies:
//   difference: rallies won minus rallies lost in that phase;
//   average:    rallies won minus the ones expected with the team's share of rallies won in that phase over
//               the whole selection (removes the natural disadvantage of the serving team, so BP and CP are
//               read on the same scale).
// Row 6 and column 6 ("Tutte") are counted directly on the rallies, never summed from rounded cells.
export const PHASES = ['BP', 'CP']
export const isDoubleChange = state => Boolean(state.teams.own.doubleChange || state.teams.other.doubleChange)
const DOUBLE_CHANGE_FILTERS = { all: () => true, exclude: state => !isDoubleChange(state), only: isDoubleChange }

export function rotationComparison(states, { measure = 'difference', doubleChange = 'all' } = {}) {
  const eligible = states.filter(matrixEligible)
  const included = eligible.filter(DOUBLE_CHANGE_FILTERS[doubleChange] || DOUBLE_CHANGE_FILTERS.all)
  const rates = Object.fromEntries(PHASES.map(phase => {
    const list = eligible.filter(s => s.phase === phase)
    return [phase, list.length ? list.filter(s => s.winner === 'own').length / list.length : 0]
  }))
  const count = list => {
    const cell = { rallies: list.length, doubleChange: list.filter(isDoubleChange).length, value: 0 }
    for (const phase of PHASES) {
      const inPhase = list.filter(s => s.phase === phase)
      const won = inPhase.filter(s => s.winner === 'own').length, lost = inPhase.length - won
      const value = measure === 'average' ? won - rates[phase] * inPhase.length : won - lost
      cell[phase] = { rallies: inPhase.length, won, lost, value }
      cell.value += value
    }
    return cell
  }
  const cells = Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (_, col) =>
    count(included.filter(s => (row === 6 || s.teams.own.P === row + 1) && (col === 6 || s.teams.other.P === col + 1)))))
  const largest = list => Math.max(1, ...list.flatMap(cell => PHASES.map(phase => Math.abs(cell[phase].value))))
  const inner = cells.slice(0, 6).flatMap(row => row.slice(0, 6))
  // Most profitable and most in difficulty: own P with enough rallies (ties: more rallies first)
  const rows = cells.slice(0, 6).map((row, index) => ({ P: index + 1, ...row[6] })).filter(row => row.rallies >= COMPARISON_MIN_RALLIES)
  const order = (list, sign) => [...list].sort((a, b) => sign * (b.value - a.value) || b.rallies - a.rallies)
  const best = order(rows, 1)[0] || null
  const worst = rows.length > 1 ? order(rows, -1)[0] : null
  const crossings = inner.flatMap((cell, i) => PHASES.map(phase => ({ P: Math.floor(i / 6) + 1, otherP: (i % 6) + 1, phase, ...cell[phase] })))
    .filter(crossing => crossing.rallies >= COMPARISON_MIN_RALLIES)
  return {
    measure, doubleChange, rates, cells, states: included,
    cellMax: largest(inner), totalMax: largest([...cells.slice(0, 6).map(row => row[6]), ...cells[6]]),
    best, worst: worst && best && worst.P !== best.P ? worst : null,
    extremes: { best: order(crossings, 1)[0] || null, worst: crossings.length > 1 ? order(crossings, -1)[0] : null },
    excluded: states.length - eligible.length,
    excludedDoubleChange: eligible.length - included.length,
    reasons: exclusionReasons(states.filter(s => !matrixEligible(s))),
  }
}

// Rallies behind a cell of the comparison (row/col 0..5 = P1..P6, 6 = Tutte)
export const comparisonStates = (comparison, row, col) => comparison.states.filter(s =>
  (row === 6 || s.teams.own.P === row + 1) && (col === 6 || s.teams.other.P === col + 1))

// Formations of a team (nominal players of positions 1-6, libero excluded) with the setter, most frequent
// first: [{ positions: [p1..p6], setter, rallies }]
export function formations(states, team) {
  return groupRallies(states, s => ({
    positions: [1, 2, 3, 4, 5, 6].map(position => playerAt(s, team, position, { nominal: true })),
    setter: s.teams[team].setter?.number || null,
  }))
}

// Who was physically on court (libero included) with setter and server, most frequent first:
// [{ positions: [slot of p1..p6], setter, server, rallies, won, lost }], slot = { number, libero, replaced, certain }
export function courtsOnField(states, team) {
  return groupRallies(states, s => {
    const back = Object.fromEntries(backRowSlots(s, team).map(slot => [slot.position, slot]))
    const front = frontRow(s, team)
    return {
      positions: [1, 2, 3, 4, 5, 6].map(position => back[position]
        ? { number: back[position].number, libero: back[position].libero, replaced: back[position].replaced, certain: back[position].certain }
        : { number: front[position - 2], libero: false, replaced: null, certain: true }),
      setter: s.teams[team].setter?.number || null,
      server: s.servingTeam === team ? s.teams[team].server : null,
    }
  })
}

// Stretches of consecutive rallies with a player entered in a double change on court, per team and set:
// [{ team, matchId, set, players, from (score before the first rally), to (score after the last), P, rallies, won, lost }]
// won / lost are rallies of the analyzed team.
export function doubleChangeStretches(states) {
  const stretches = []
  for (const team of ['own', 'other']) {
    let current = null
    for (const s of states) {
      if (!s.teams[team].doubleChange) { current = null; continue }
      if (!current || current.matchId !== s.matchId || current.set !== s.set || current.last !== s.rally - 1) {
        stretches.push(current = { team, matchId: s.matchId, set: s.set, list: [] })
      }
      current.list.push(s)
      current.last = s.rally
    }
  }
  return stretches.map(({ list, ...stretch }) => {
    const won = list.filter(s => s.winner === 'own').length
    return {
      team: stretch.team, matchId: stretch.matchId, set: stretch.set,
      players: [...new Set(list.flatMap(s => s.teams[stretch.team].doubleChangePlayers || []))],
      from: list[0].scoreBefore, to: list.at(-1).score,
      P: [...new Set(list.map(s => s.teams[stretch.team].P).filter(Boolean))],
      rallies: list.length, won, lost: list.length - won,
    }
  }).sort((a, b) => String(a.matchId).localeCompare(String(b.matchId)) || a.set - b.set || a.from.own + a.from.other - (b.from.own + b.from.other))
}
