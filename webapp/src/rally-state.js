// Canonical state of the court, rally by rally: the only place where the app decides who is on court,
// where every player stands (positions 1-6), who serves, who the effective setter is and therefore the
// P (P1-P6) of both teams. "Andamento della gara", "Rendimento per rotazione", "Configurazioni in campo"
// and "Confronto delle rotazioni" all read from here.
//
// Built only on the existing reconstructions:
//   setRallies (rallies.js)         → sequence of rallies, winner, serving team, rotation columns
//   positionSegments (on-court.js)  → who occupies columns I–VI in each rally (substitutions, re-entries)
// Pure functions, no React: states from several matches can be aggregated (court-stats.js).
//
// Libero: the scoresheet lists who the libero replaced, in order, but not when. The libero is placed with
// the rule of the game: it replaces that player while she is in the back row (positions 5 and 6, and 1
// while the team is receiving: the player serves herself and stays on court until the opponent wins the
// service). Every back-row stretch of a listed player is matched in order with the listed exchanges; a
// stretch that cannot be matched is marked uncertain (never shown as surely the libero or the player).
// A chain "13-7-11-7" (libero for libero) changes libero at every change of phase (BP/CP) in the stretch.
// Columns (I–VI) keep the nominal players: rotation, server and setter are the ones of the scoresheet.
import { isSetter, rosterPlayer } from './roster.js'
import { onCourt } from './on-court.js'
import { setRallies } from './rallies.js'

export const TEAMS = ['own', 'other']
export const opposite = team => (team === 'own' ? 'other' : 'own')

export const normNumber = value => {
  const text = String(value ?? '').trim()
  return /^\d+$/.test(text) ? String(Number(text)) : ''
}

// Possible setters of a team: players marked in the roster ("p" column), as normalized jersey numbers
export const setterNumbers = roster => [...new Set((roster || []).map(rosterPlayer)
  .filter(player => isSetter(player) && normNumber(player.number))
  .map(player => normNumber(player.number)))]

// Libero exchanges of one team in one set, in the order of the scoresheet: [{ player, liberos: [...] }].
// SNUG / TieBreakTech / manual entry: liberoReplacements rows; NEWBIT: the libero box fields.
export function liberoChains(set, team) {
  const replacements = (team === 'own' ? set.liberoReplacements : set.opponentLiberoReplacements) || []
  const chains = []
  if (replacements.length) {
    for (const entry of replacements) {
      if (Number(entry.step) === 1 || !chains.length) chains.push({ player: normNumber(entry.player), liberos: [normNumber(entry.libero)] })
      else chains.at(-1).liberos.push(normNumber(entry.libero))
    }
  } else {
    const box = (team === 'own' ? set.libero : set.opponentLibero) || {}
    const values = key => (Array.isArray(box[key]) ? box[key] : [box[key]])
    values('onCourt').forEach((player, row) => {
      const liberos = [values('entered')[row], values('otherEntered')[row]].map(normNumber).filter(Boolean)
      if (normNumber(player) && liberos.length) chains.push({ player: normNumber(player), liberos })
    })
  }
  return chains.filter(chain => chain.player && chain.liberos.every(Boolean))
}

// Players entered in a double change of one team in one set: two or more substitutions of that team at
// the same entry score (the same rule of "Andamento della gara"), e.g. setter and opposite together.
export function doubleChangeEntrants(set, team) {
  const cells = ((team === 'own' ? set.substitutions : set.opponentSubstitutions) || [])
    .filter(cell => normNumber(cell?.in) && /^\s*\d+\s*:\s*\d+\s*$/.test(String(cell?.scoreIn ?? '')))
  const byScore = new Map()
  for (const cell of cells) {
    const key = String(cell.scoreIn).replace(/\s/g, '')
    byScore.set(key, [...(byScore.get(key) || []), normNumber(cell.in)])
  }
  return new Set([...byScore.values()].filter(group => group.length > 1).flat())
}

// Position (1-6) of the player in column k when the team is in rotation column c: column c serves from
// position 1, column c+1 is in position 2 (it will serve next), and so on.
const positionOfColumn = (column, rotationColumn) => ((column - rotationColumn + 6) % 6) + 1
const columnOfPosition = (position, rotationColumn) => (rotationColumn + position - 1) % 6

// ---- queries on a rally state (derived, nothing duplicated) ----
// side.columns: nominal players of columns I–VI; side.onCourt: who is physically there (libero applied,
// null where the libero exchange is uncertain).

// Position 1-6 of a player physically on court in this rally, null if not on court or uncertain
export function positionOf(state, team, number) {
  const side = state.teams[team]
  const column = side.onCourt.indexOf(normNumber(number))
  return column < 0 || !normNumber(number) ? null : positionOfColumn(column, side.column)
}

// Player physically in a position (1-6) in this rally; null if unknown (e.g. libero exchange uncertain).
// { nominal: true } gives the player of the rotation slot (the one the libero replaces).
export function playerAt(state, team, position, { nominal = false } = {}) {
  const side = state.teams[team]
  if (!Number.isInteger(position) || position < 1 || position > 6) return null
  return (nominal ? side.columns : side.onCourt)[columnOfPosition(position, side.column)] || null
}

// Back row: positions 1, 6 and 5 (libero included)
export const BACK_ROW = [1, 6, 5]
export const backRow = (state, team) => BACK_ROW.map(position => playerAt(state, team, position))

// Back row with the libero made explicit: [{ position, number, libero, replaced, certain }]. number is who
// is physically there; when the libero plays, replaced is the player of the scoresheet it replaces.
// An exchange that cannot be placed: libero true, number null, certain false.
export function backRowSlots(state, team) {
  const side = state.teams[team]
  return BACK_ROW.map(position => {
    const column = columnOfPosition(position, side.column)
    const libero = side.libero && side.libero.column === column ? side.libero : null
    return libero
      ? { position, number: libero.certain ? libero.number : null, libero: true, replaced: libero.replaced, certain: libero.certain }
      : { position, number: side.columns[column] || null, libero: false, replaced: null, certain: true }
  })
}

// Front row: positions 2, 3 and 4
export const FRONT_ROW = [2, 3, 4]
export const frontRow = (state, team) => FRONT_ROW.map(position => playerAt(state, team, position))

// Setter status: 'unmarked' (no possible setter in the roster), 'none' (none on court), 'auto' (one on
// court), 'ambiguous' (two or more, no choice), 'choice' (chosen by the user), 'unknown' (user: "Non so")
const setterKey = candidates => [...candidates].sort((a, b) => Number(a) - Number(b)).join(',')

function resolveSetters(setIndex, team, columnsByRally, setters, choices) {
  const candidatesByRally = columnsByRally.map(columns => setters.filter(number => columns.includes(number)))
  // Ambiguous stretches: continuous rallies with the same two or more setters on court
  const ambiguities = []
  candidatesByRally.forEach((candidates, i) => {
    if (candidates.length < 2) return
    const key = setterKey(candidates)
    const current = ambiguities.at(-1)
    if (current && current.key === key && current.to === i) current.to = i + 1
    else ambiguities.push({ set: setIndex + 1, team, key, candidates: key.split(','), from: i + 1, to: i + 1 })
  })
  for (const stretch of ambiguities) {
    // A choice applies only to the same stretch (same start, same candidates): if the data change and the
    // stretch is no longer there, the choice is ignored and the question comes back
    const choice = (choices || []).find(entry => entry.set === stretch.set && entry.team === team &&
      Number(entry.from) === stretch.from && setterKey(entry.candidates || []) === stretch.key)
    stretch.choice = choice ? (choice.number === null ? null : normNumber(choice.number)) : undefined
    if (stretch.choice !== null && stretch.choice !== undefined && !stretch.candidates.includes(stretch.choice)) stretch.choice = undefined
    delete stretch.key
  }
  const setterByRally = candidatesByRally.map((candidates, i) => {
    if (!setters.length) return { number: null, status: 'unmarked', candidates }
    if (!candidates.length) return { number: null, status: 'none', candidates }
    if (candidates.length === 1) return { number: candidates[0], status: 'auto', candidates }
    const stretch = ambiguities.find(entry => i + 1 >= entry.from && i + 1 <= entry.to)
    if (stretch.choice === undefined) return { number: null, status: 'ambiguous', candidates }
    if (stretch.choice === null) return { number: null, status: 'unknown', candidates }
    return { number: stretch.choice, status: 'choice', candidates }
  })
  return { setterByRally, ambiguities }
}

// Libero on court, rally by rally, for one team: { number, replaced, column, certain, reason } or null per
// rally. certain: the exchange of the scoresheet is placed in this back-row stretch (shown normally).
// Not certain: reason 'unmatched' (stretch without a row on the scoresheet: libero or listed player, not
// determinable) or 'identity' (a libero surely plays, but a libero-for-libero chain does not say which).
function placeLiberos(rallies, team, columnsByRally, chains) {
  const result = rallies.map(() => null)
  const players = [...new Set(chains.map(chain => chain.player))]
  // Back-row stretches of every listed player, in chronological order
  const stretches = []
  for (const player of players) {
    let current = null
    rallies.forEach((rally, i) => {
      const column = columnsByRally[i].indexOf(player)
      const position = column < 0 ? null : positionOfColumn(column, rally.columns[team])
      const back = position === 5 || position === 6 || (position === 1 && rally.servingTeam !== team)
      if (back && current && current.column === column && current.to === i) current.to = i + 1
      else if (back) stretches.push(current = { player, column, from: i, to: i + 1 })
      else current = null
    })
  }
  stretches.sort((a, b) => a.from - b.from)
  // Match stretches and scoresheet exchanges in order
  let next = 0
  const unmatchedStretches = []
  for (const stretch of stretches) {
    const chain = chains[next]
    if (chain && chain.player === stretch.player) {
      next++
      // phase segments inside the stretch: a libero-for-libero chain changes at each change of phase
      const segments = []
      for (let i = stretch.from; i < stretch.to; i++) {
        const phase = rallies[i].servingTeam === team ? 'BP' : 'CP'
        if (!segments.length || segments.at(-1).phase !== phase) segments.push({ phase, from: i })
        segments.at(-1).to = i + 1
      }
      const identified = chain.liberos.length === 1 || chain.liberos.length === segments.length
      segments.forEach((segment, k) => {
        const number = chain.liberos.length === 1 ? chain.liberos[0] : identified ? chain.liberos[k] : null
        // identity unknown: a libero surely replaces the player, but the chain does not say which one
        for (let i = segment.from; i < segment.to; i++) result[i] = { number, replaced: stretch.player, column: stretch.column, certain: Boolean(number), reason: number ? null : 'identity' }
      })
    } else {
      unmatchedStretches.push(stretch)
      // no exchange on the scoresheet for this stretch: libero or listed player, not determinable
      for (let i = stretch.from; i < stretch.to; i++) result[i] = { number: null, replaced: stretch.player, column: stretch.column, certain: false, reason: 'unmatched' }
    }
  }
  return { byRally: result, unmatchedStretches: unmatchedStretches.length, unmatchedChains: chains.length - next }
}

// All rally states of one set
export function setStates(match, setIndex, { choices = match.setterChoices } = {}) {
  const set = match.sets[setIndex]
  const built = setRallies(set)
  const { rallies } = built
  const setters = { own: setterNumbers(match.roster), other: setterNumbers(match.opponentRoster) }
  const perTeam = {}
  const entrants = { own: doubleChangeEntrants(set, 'own'), other: doubleChangeEntrants(set, 'other') }
  const unresolved = []
  const ambiguities = []
  for (const team of TEAMS) {
    const court = onCourt(set, team, built)
    unresolved.push(...court.unresolved)
    const columnsByRally = court.occupants
    const resolved = resolveSetters(setIndex, team, columnsByRally, setters[team], choices)
    ambiguities.push(...resolved.ambiguities)
    const liberos = placeLiberos(rallies, team, columnsByRally, liberoChains(set, team))
    perTeam[team] = { columnsByRally, setterByRally: resolved.setterByRally, court, liberos }
  }
  const states = rallies.map((rally, i) => {
    const previous = rallies[i - 1]
    const teams = {}
    for (const team of TEAMS) {
      const columns = perTeam[team].columnsByRally[i]
      const column = rally.columns[team]
      const setter = perTeam[team].setterByRally[i]
      const court = perTeam[team].court
      const reliable = built.complete && court.unresolved.length === 0 && columns.every(Boolean) && new Set(columns).size === 6
      const libero = perTeam[team].liberos.byRally[i]
      const onCourt = libero ? columns.map((number, k) => (k === libero.column ? (libero.certain ? libero.number : null) : number)) : columns
      // positions 1..6 (index 0..5) of the players physically on court; null = libero exchange uncertain
      const positions = Array.from({ length: 6 }, (_, index) => onCourt[columnOfPosition(index + 1, column)] || null)
      // doubleChange: a player entered in a double change is on court (the P may come from that change)
      const doubleChangePlayers = columns.filter(number => entrants[team].has(number))
      const side = { column, columns, onCourt, positions, libero, server: court.server[i] || null, setter, P: null, reliable,
        doubleChange: doubleChangePlayers.length > 0, doubleChangePlayers }
      side.P = reliable && setter.number ? positionOfColumn(columns.indexOf(setter.number), column) : null
      teams[team] = side
    }
    return {
      matchId: match.id ?? null,
      set: setIndex + 1,
      rally: rally.index,
      scoreBefore: { own: previous ? previous.own : 0, other: previous ? previous.other : 0 },
      score: { own: rally.own, other: rally.other },
      winner: rally.winner,
      servingTeam: rally.servingTeam,
      phase: rally.servingTeam === 'own' ? 'BP' : 'CP',
      cell: rally.cell,
      reliable: TEAMS.every(team => teams[team].reliable),
      teams,
    }
  })
  const liberoChecks = Object.fromEntries(TEAMS.map(team => [team, {
    unmatchedStretches: perTeam[team].liberos.unmatchedStretches,
    unmatchedChains: perTeam[team].liberos.unmatchedChains,
  }]))
  return { set: setIndex + 1, servesFirst: built.servesFirst, complete: built.complete, reliable: states.every(state => state.reliable), unresolved, ambiguities, liberoChecks, states }
}

// Every set of a match
export const matchStates = (match, options) => (match.sets || []).map((_, index) => setStates(match, index, options))

// Flat list of rally states of a match (input of court-stats.js)
export const matchRallyStates = (match, options) => matchStates(match, options).flatMap(set => set.states)

// Setter checks still open for a match: two or more possible setters on court with no answer, or a team
// without any possible setter marked. While something is open the rotation comparison is not printed.
export function setterVerification(match, sets = matchStates(match)) {
  const pending = sets.flatMap(set => set.ambiguities).filter(stretch => stretch.choice === undefined)
  const unmarked = TEAMS.filter(team => !setterNumbers(team === 'own' ? match.roster : match.opponentRoster).length)
  return { pending, unmarked, open: pending.length > 0 || unmarked.length > 0 }
}

// Persist only the answer, never derived court states or the end of a stretch.
export function chooseSetter(match, stretch, number) {
  const choice = { set: stretch.set, team: stretch.team, from: stretch.from,
    candidates: [...stretch.candidates], number: number === null ? null : normNumber(number) }
  return { ...match, setterChoices: [...(match.setterChoices || []).filter(entry =>
    !(entry.set === choice.set && entry.team === choice.team && entry.from === choice.from)), choice] }
}
