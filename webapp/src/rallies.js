// Chronological rallies of a set, rebuilt from the service-turn grids (set.own / set.other).
// Shared base of "Andamento della gara" (match-flow.js) and of presence on court (on-court.js).
// No imports: it can be used by any module without cycles.

const opposite = team => (team === 'own' ? 'other' : 'own')

// Service turns in chronological order. The team serving first uses box I; the receiving team's box I
// is crossed out ("X") and its first turn is box II. For every column c >= 1 the receiving team's turn
// comes before the serving team's turn.
export function chronologicalTurns(set) {
  const ownServesFirst = set.own?.[0] !== 'X'
  const first = ownServesFirst ? 'own' : 'other'
  const second = opposite(first)
  const turns = []
  for (let cell = 0; cell < 36; cell++) {
    for (const team of [second, first]) {
      const value = set[team]?.[cell]
      if (Number.isInteger(value)) turns.push({ team, cell, end: value })
    }
  }
  return { turns, servesFirst: first }
}

// Rallies: { index (1-based), own, other (score after the rally), winner, servingTeam, cell, columns }.
// cell = service-grid box of the serving team's turn (column = cell % 6).
// columns = rotation column of each team during the rally: the box of its most recent service turn (the
// current one when serving), 0 before its first turn. A receiving team keeps its column when it loses a
// rally and moves on only when it wins the side-out and starts its next turn (that rally is still played
// in the old column). Also valid after the fifth-set court change: the boxes simply continue.
export function setRallies(set) {
  const { turns, servesFirst } = chronologicalTurns(set)
  const score = { own: 0, other: 0 }
  const last = { own: 0, other: 0 }
  const rallies = []
  let server = null
  const rally = (winner, serving) => {
    score[winner] += 1
    rallies.push({
      index: rallies.length + 1, own: score.own, other: score.other, winner, servingTeam: serving.team, cell: serving.cell,
      columns: { own: last.own % 6, other: last.other % 6 },
    })
  }
  let consistent = true
  for (const turn of turns) {
    if (server) {
      // side-out: the rally served by the previous server is won by the team starting this turn
      if (score[turn.team] + 1 > turn.end) { consistent = false; break }
      rally(turn.team, server)
    }
    server = turn
    last[turn.team] = turn.cell
    while (score[turn.team] < turn.end) rally(turn.team, turn)
  }
  const complete = consistent && score.own === set.scoreOwn && score.other === set.scoreOther
  return { servesFirst, rallies, complete }
}
