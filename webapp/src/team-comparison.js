// "Confronto tra le squadre": the two teams of one match side by side. Pure counts on the rally states of
// rally-state.js, no React (TeamComparison.jsx draws them).
// Cambio palla % = rallies won while receiving / rallies received; break % = rallies won while serving /
// rallies served. Rotations: each team in its own P (setter position), only where it is known.
import { COMPARISON_MIN_RALLIES } from './court-stats.js'
import { TEAMS, opposite } from './rally-state.js'

const knownP = P => Number.isInteger(P) && P >= 1 && P <= 6
export const percent = (part, total) => (total ? Math.round((part / total) * 100) : null)

// Serve and receive of one team over a list of rallies
export function phaseTally(states, team) {
  const served = states.filter(s => s.servingTeam === team)
  const received = states.filter(s => s.servingTeam === opposite(team))
  const breaks = served.filter(s => s.winner === team).length
  const sideOuts = received.filter(s => s.winner === team).length
  return {
    served: served.length, breaks, breakPct: percent(breaks, served.length),
    received: received.length, sideOuts, sideOutPct: percent(sideOuts, received.length),
  }
}

// Longest run of consecutive points of a team within a set
export function longestRun(sets, team) {
  let best = 0
  for (const set of sets) {
    let run = 0
    for (const s of set.states) {
      run = s.winner === team ? run + 1 : 0
      best = Math.max(best, run)
    }
  }
  return best
}

// Points won from 20 on (from 10 on in the fifth set), counted on the score before the rally
export const CLOSING_FROM = set => (set === 5 ? 10 : 20)
export const closingPoints = (states, team) =>
  states.filter(s => Math.max(s.scoreBefore.own, s.scoreBefore.other) >= CLOSING_FROM(s.set) && s.winner === team).length

export function rotationTally(states, team) {
  return [1, 2, 3, 4, 5, 6].map(P => {
    const list = states.filter(s => s.teams[team].P === P && s.teams[team].reliable !== false)
    return { P, ...phaseTally(list, team) }
  })
}

// Our serve in rotation P against each rotation of the opponent in reception
export function serveDuel(states, P) {
  return [1, 2, 3, 4, 5, 6].map(Q => {
    const list = states.filter(s => s.servingTeam === 'own' && s.teams.own.P === P && s.teams.other.P === Q && s.reliable !== false)
    return { P: Q, served: list.length, won: list.filter(s => s.winner === 'own').length }
  }).filter(row => row.served > 0)
}

// Most profitable serving rotation of the analyzed team (at least COMPARISON_MIN_RALLIES serves)
export function bestServingRotation(rotations) {
  return rotations
    .filter(r => r.served >= COMPARISON_MIN_RALLIES)
    .sort((a, b) => b.breakPct - a.breakPct || b.served - a.served)[0] || null
}

export function teamComparison(sets) {
  const states = sets.flatMap(set => set.states)
  const both = fn => Object.fromEntries(TEAMS.map(team => [team, fn(team)]))
  const perSet = sets.filter(set => set.states.length).map(set => {
    const last = set.states.at(-1)
    return { set: set.set, score: { own: last.score.own, other: last.score.other }, ...both(team => phaseTally(set.states, team)) }
  })
  const rotations = both(team => rotationTally(states, team))
  const best = bestServingRotation(rotations.own)
  return {
    rallies: states.length,
    total: both(team => phaseTally(states, team)),
    longest: both(team => longestRun(sets, team)),
    closing: both(team => closingPoints(states, team)),
    perSet,
    rotations,
    rotationsKnown: states.some(s => knownP(s.teams.own.P)) && states.some(s => knownP(s.teams.other.P)),
    duel: best ? { P: best.P, rows: serveDuel(states, best.P) } : null,
  }
}

const pct = value => (value == null ? '—' : `${value}%`)
const ordinal = n => `${n}°`
const list = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`)

// One or two sentences for each tab. team/opponent: names as shown
export function comparisonReading(data, { team, opponent }) {
  const won = data.perSet.filter(s => s.score.own > s.score.other)
  const lost = data.perSet.filter(s => s.score.own < s.score.other)
  const sets = []
  const better = s => s.own.sideOutPct > s.other.sideOutPct
  const wonBetter = won.filter(better)
  if (won.length) sets.push(`Set vinti (${list(won.map(s => ordinal(s.set)))}): ${team} ha cambiato palla meglio in ${wonBetter.length} su ${won.length}.`)
  const lostWorse = lost.filter(s => s.other.sideOutPct > s.own.sideOutPct)
  if (lostWorse.length) sets.push(`Nei set persi ${list(lostWorse.map(s => `${ordinal(s.set)} (${pct(s.other.sideOutPct)})`))} ${opponent} ha cambiato palla meglio.`)

  const rotations = []
  const strongest = (team_) => data.rotations[team_].filter(r => r.served >= COMPARISON_MIN_RALLIES).sort((a, b) => b.breakPct - a.breakPct)
  const ours = strongest('own'), theirs = strongest('other')
  if (ours.length) rotations.push(`La rotazione di ${team} più forte al servizio è P${ours[0].P} (${pct(ours[0].breakPct)} di break).`)
  if (theirs.length) rotations.push(`Quella più debole di ${opponent} è P${theirs.at(-1).P} (${pct(theirs.at(-1).breakPct)} di break).`)

  const serve = [`Al servizio ${team} ha fatto punto nel ${pct(data.total.own.breakPct)} dei casi, ${opponent} nel ${pct(data.total.other.breakPct)}.`]
  const top = data.duel?.rows.filter(r => r.served >= 3).sort((a, b) => b.won / b.served - a.won / a.served)[0]
  if (top) serve.push(`In P${data.duel.P}, contro la loro P${top.P}, ${top.won} punti su ${top.served} battute.`)
  return { sets, rotations, serve }
}
