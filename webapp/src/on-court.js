// Who is on court in each rally, position by position (I–VI), applying the substitutions of the
// scoresheet: the starter plays until the entry score of the substitute; the substitute plays until the
// score at which the starter comes back (exit and re-entry). Only data of the scoresheet are used.
// Libero replacements carry no score on the scoresheet: they cannot be placed in time and are not applied
// (the player replaced by the libero is counted on court).
import { setRallies } from './rallies.js'

const norm = value => {
  const text = String(value ?? '').trim()
  return /^\d+$/.test(text) ? String(Number(text)) : ''
}
const parsePair = text => {
  const match = String(text ?? '').match(/^\s*(\d+)\s*:\s*(\d+)\s*$/)
  return match ? [Number(match[1]), Number(match[2])] : null
}

// Number of rallies already played when the score (written with `team` points first, as on the
// scoresheet box) was reached: 0 = before the first rally; -1 when the score never occurs in the set.
function stateIndex(rallies, team, pair) {
  const own = team === 'own' ? pair[0] : pair[1]
  const other = team === 'own' ? pair[1] : pair[0]
  if (own === 0 && other === 0) return 0
  const found = rallies.findIndex(rally => rally.own === own && rally.other === other)
  return found < 0 ? -1 : found + 1
}

// Segments of each position: [{ number, from, to }] in "states" (rallies already played).
// A rally r (1-based) is played from state r-1: the player on court is the segment containing r-1.
export function positionSegments(set, team, rallies) {
  const lineup = (team === 'own' ? set.lineup : set.opponentLineup) || []
  const substitutions = (team === 'own' ? set.substitutions : set.opponentSubstitutions) || []
  const end = rallies.length
  const unresolved = []
  const columns = Array.from({ length: 6 }, (_, column) => {
    const starter = norm(lineup[column])
    const cell = substitutions[column] || {}
    const substitute = norm(cell.in)
    const inPair = parsePair(cell.scoreIn)
    const outPair = parsePair(cell.scoreOut)
    if (!substitute || !inPair) return [{ number: starter, from: 0, to: end }]
    const enter = stateIndex(rallies, team, inPair)
    if (enter < 0) {
      unresolved.push({ team, column, number: substitute, score: cell.scoreIn, reason: 'entrata' })
      return [{ number: starter, from: 0, to: end }]
    }
    const exit = outPair ? stateIndex(rallies, team, outPair) : end
    if (outPair && (exit < 0 || exit < enter)) {
      unresolved.push({ team, column, number: substitute, score: cell.scoreOut, reason: 'rientro' })
      return [{ number: starter, from: 0, to: enter }, { number: substitute, from: enter, to: end }]
    }
    const segments = [
      { number: starter, from: 0, to: enter },
      { number: substitute, from: enter, to: exit },
      { number: starter, from: exit, to: end },
    ].filter(segment => segment.to > segment.from)
    return segments.length ? segments : [{ number: starter, from: 0, to: end }]
  })
  return { columns, unresolved }
}

// Player of a position during rally r (1-based)
export function occupantAt(columns, column, rally) {
  const state = rally - 1
  const segment = columns[column].find(entry => state >= entry.from && state < entry.to) || columns[column].at(-1)
  return segment?.number || ''
}

// Everything about presence for one team in one set
export function onCourt(set, team = 'own', built = setRallies(set)) {
  const { rallies } = built
  const { columns, unresolved } = positionSegments(set, team, rallies)
  const occupants = rallies.map(rally => Array.from({ length: 6 }, (_, column) => occupantAt(columns, column, rally.index)))
  // Presence per player: rallies on court, won and lost by the team while on court
  const presence = new Map()
  occupants.forEach((numbers, i) => {
    const won = rallies[i].winner === team
    for (const number of new Set(numbers.filter(Boolean))) {
      const entry = presence.get(number) || { rallies: 0, won: 0, lost: 0 }
      entry.rallies += 1
      if (won) entry.won += 1
      else entry.lost += 1
      presence.set(number, entry)
    }
  })
  // Player at the service in each rally served by this team: the occupant of the serving column
  const server = rallies.map((rally, i) => (rally.servingTeam === team ? occupants[i][rally.cell % 6] : ''))
  return { rallies, occupants, presence, server, unresolved, complete: built.complete }
}
