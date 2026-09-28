// Pure aggregations. Input may contain canonical records from one or several matches.
import { backRowSlots, frontRow } from './rally-state.js'
import { HEAT_COLORS } from './theme.js'

// Compact label of a back-row slot: "#10", "L#5⇒#11" (libero #5 in place of #11), "L?⇒#11" (exchange
// not placeable with certainty)
export const slotLabel = slot => (slot.libero ? `L${slot.number ? `#${slot.number}` : '?'}⇒#${slot.replaced}` : slot.number ? `#${slot.number}` : '—')
export const backRowLabels = (state, team) => backRowSlots(state, team).map(slotLabel)

// Descriptive UI warning only ("pochi rally osservati"): never used in calculations
export const FEW_RALLIES = 5

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

export function rotationMatrix(states, phase = 'all') {
  const filtered = filterPhase(states, phase)
  const included = filtered.filter(matrixEligible)
  // Marginals are independent tallies over the original included rallies, never averages of cells.
  const cells = Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (_, col) =>
    tally(included.filter(s => (row === 6 || s.teams.own.P === row + 1) && (col === 6 || s.teams.other.P === col + 1)))))
  return { cells, included, excluded: filtered.length - included.length,
    unknown: filtered.filter(s => !knownP(s.teams.own.P) || !knownP(s.teams.other.P)).length,
    unreliable: filtered.filter(s => s.reliable === false).length,
    reasons: exclusionReasons(filtered.filter(s => !matrixEligible(s))) }
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
export function cellDetail(states, row, col, phase = 'all') {
  const selected = filterPhase(states, phase).filter(s => matrixEligible(s) &&
    (row === 6 || s.teams.own.P === row + 1) && (col === 6 || s.teams.other.P === col + 1))
  return { ...tally(selected), BP: tally(filterPhase(selected, 'BP')), CP: tally(filterPhase(selected, 'CP')),
    ownFrontRows: groupRallies(selected, s => ({ players: frontRow(s, 'own') })),
    otherFrontRows: groupRallies(selected, s => ({ players: frontRow(s, 'other') })),
    ownBackRows: groupRallies(selected, s => ({ labels: backRowLabels(s, 'own') })),
    otherBackRows: groupRallies(selected, s => ({ labels: backRowLabels(s, 'other') })),
    servers: groupRallies(selected.filter(s => s.phase === 'BP'), s => ({ number: s.teams.own.server })),
    configurations: courtConfigurations(selected),
    // the rallies behind the cell, in match order: where the numbers come from
    list: selected.map(s => ({
      matchId: s.matchId, set: s.set, rally: s.rally, before: s.scoreBefore, after: s.score, phase: s.phase,
      servingTeam: s.servingTeam, server: s.teams[s.servingTeam]?.server ?? null, winner: s.winner,
      ownP: s.teams.own.P, otherP: s.teams.other.P,
    })),
  }
}

// Background of a heatmap cell. The percentage picks the side and the strength of the tint (50% =
// neutral); the number of rallies only softens it (n / (n + 4)), so that 100% on 2 rallies does not look
// stronger than 72% on 32. The percentage itself is never changed. No rally observed: empty surface.
export function heatColor({ rallies, percent }) {
  if (!rallies || percent === null) return HEAT_COLORS.empty
  const hex = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
  const neutral = hex(HEAT_COLORS.neutral), pole = hex(percent < 50 ? HEAT_COLORS.low : HEAT_COLORS.high)
  const tint = HEAT_COLORS.maxTint * (Math.abs(percent - 50) / 50) * (rallies / (rallies + 4))
  return `rgb(${neutral.map((value, i) => Math.round(value + (pole[i] - value) * tint)).join(', ')})`
}
