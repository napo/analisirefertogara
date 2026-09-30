import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMPARISON_MIN_RALLIES, courtConfigurations, courtsOnField, formations, isDoubleChange, rotationComparison } from '../src/court-stats.js'
import { matchRallyStates, setStates } from '../src/rally-state.js'
import { swapTeams } from '../src/match-teams.js'
import { analyze } from '../src/analysis.js'

const state = (P, otherP, winner='own', phase='BP', columns=['1','2','3','4','5','6']) => ({
  matchId:'a', set:1, rally:1, winner, phase, servingTeam: phase === 'BP' ? 'own' : 'other', scoreBefore:{own:0,other:0}, score:{own:0,other:0}, reliable:true,
  teams: { own: { P, column:0, columns, onCourt: columns, server:'1' }, other: { P:otherP, column:0, columns:['7','8','9','10','11','12'], onCourt:['7','8','9','10','11','12'] } },
})

test('comparison: BP and CP apart, vinti − persi, Tutte counted on the rallies', () => {
  const states = [state(1,1), state(1,1,'other'), state(1,1,'own','CP'), state(1,2,'own','CP'), state(2,1,'other','CP')]
  const { cells, measure } = rotationComparison(states)
  assert.equal(measure,'difference')
  assert.equal(cells.length,7)
  assert.ok(cells.every(row => row.length === 7))
  assert.deepEqual(cells[0][0].BP,{rallies:2,won:1,lost:1,value:0})
  assert.deepEqual(cells[0][0].CP,{rallies:1,won:1,lost:0,value:1})
  assert.equal(cells[0][6].CP.value,2)
  assert.equal(cells[6][0].CP.value,0)
  assert.equal(cells[6][6].rallies,5)
  assert.equal(cells[6][6].value,cells[6][6].BP.value+cells[6][6].CP.value)
  assert.equal(cells[0][2].rallies,0)
})

test('comparison: "rispetto alla media" removes the share of rallies won in each phase', () => {
  // BP: 1 won of 4 (25%); CP: 3 won of 4 (75%)
  const states = [state(1,1), state(1,1,'other'), state(2,1,'other'), state(2,1,'other'),
    state(1,1,'own','CP'), state(1,1,'own','CP'), state(2,1,'own','CP'), state(2,1,'other','CP')]
  const c = rotationComparison(states, { measure: 'average' })
  assert.deepEqual(c.rates,{BP:0.25,CP:0.75})
  assert.equal(c.cells[0][0].BP.value,1-0.25*2)
  assert.equal(c.cells[1][0].CP.value,1-0.75*2)
  assert.ok(Math.abs(c.cells[6][6].value) < 1e-9)
})

test('comparison: most profitable and most in difficulty P need enough rallies; excluded rallies', () => {
  const many = (P, winner, n) => Array.from({length:n}, () => state(P,1,winner))
  const states = [...many(1,'own',4), ...many(2,'other',5), ...many(3,'own',3), state(null,1), {...state(4,1),reliable:false}]
  const c = rotationComparison(states)
  assert.equal(c.best.P,1)
  assert.equal(c.worst.P,2)
  assert.equal(c.excluded,2)
  assert.equal(c.cells[2][6].rallies,3)
  assert.equal(COMPARISON_MIN_RALLIES,4)
  assert.equal(c.extremes.best.P,1)
  assert.equal(c.extremes.worst.phase,'BP')
  // one P only: no "most in difficulty"
  assert.equal(rotationComparison(many(1,'own',6)).worst,null)
  assert.equal(rotationComparison(many(1,'own',2)).best,null)
})

test('comparison: double change rallies marked, excluded or alone', () => {
  const dc = s => ({...s, teams:{...s.teams, own:{...s.teams.own, doubleChange:true, doubleChangePlayers:['18']}}})
  const states = [state(1,1), dc(state(4,1)), dc(state(4,1,'other')), state(4,1)]
  assert.equal(isDoubleChange(states[1]),true)
  assert.equal(rotationComparison(states).cells[3][0].doubleChange,2)
  assert.equal(rotationComparison(states,{doubleChange:'exclude'}).cells[3][0].rallies,1)
  assert.equal(rotationComparison(states,{doubleChange:'exclude'}).excludedDoubleChange,2)
  assert.equal(rotationComparison(states,{doubleChange:'only'}).cells[6][6].rallies,2)
})

test('formations (nominal, setter) and courts on field (libero, server); configurations', () => {
  const s = {...state(4,1), teams:{...state(4,1).teams, own:{...state(4,1).teams.own, setter:{number:'4'}, libero:{column:4, number:'7', replaced:'5', certain:true}, onCourt:['1','2','3','4','7','6']}}}
  const [formation] = formations([s, s], 'own')
  assert.deepEqual(formation.positions,['1','2','3','4','5','6'])
  assert.equal(formation.setter,'4')
  assert.equal(formation.rallies,2)
  const [court] = courtsOnField([s], 'own')
  assert.deepEqual(court.positions[4],{number:'7',libero:true,replaced:'5',certain:true})
  assert.equal(court.server,'1')
  assert.equal(courtsOnField([{...s,phase:'CP',servingTeam:'other'}],'own')[0].server,null)
  const states = [state(1,1),state(2,1,'other'),state(2,1,'other'),state(null,1)]
  assert.equal(courtConfigurations(states)[0].P,2)
  assert.ok(courtConfigurations(states).some(g=>g.P===null))
})

test('team inversion maps roster, choices, scores, P and service consistently and is reversible', () => {
  const match = { id:'a',team:'A',opponent:'B',roster:[{number:1,isSetter:true},{number:2,isSetter:true}],
    opponentRoster:[{number:8,isSetter:true}],setterChoices:[{set:1,team:'own',from:1,candidates:['1','2'],number:'2'}],
    sets:[{own:[2],other:['X'],scoreOwn:2,scoreOther:0,lineup:['1','2','3','4','5','6'],opponentLineup:['7','8','9','10','11','12']}] }
  const inverted = swapTeams(match)
  const a = matchRallyStates(match), b = matchRallyStates(inverted)
  assert.equal(b[0].teams.other.P,a[0].teams.own.P)
  assert.equal(b[0].teams.other.setter.status,'choice')
  assert.equal(b[0].phase,'CP')
  assert.deepEqual(swapTeams(inverted).setterChoices, match.setterChoices)
  assert.deepEqual(matchRallyStates(swapTeams(inverted)),a)
})

test('rotation statistics split a turn into coherent segments when P changes', () => {
  const match = {roster:[{number:4,isSetter:true},{number:12,isSetter:true}],sets:[{
    own:[3],other:['X'],scoreOwn:3,scoreOther:0,lineup:['1','2','3','4','5','6'],
    substitutions:[{in:'12',scoreIn:'1:0',scoreOut:'2:0'},{},{},{in:'14',scoreIn:'1:0',scoreOut:'2:0'}],
  }]}
  const { rows } = analyze([match])
  assert.equal(rows[3].points,2)
  assert.equal(rows[3].turns,2)
  assert.equal(rows[0].points,1)
  assert.equal(rows[0].turns,1)
  assert.deepEqual(setStates(match,0).states.map(s=>s.teams.own.P),[4,1,4])
})

import { readFileSync } from 'node:fs'
import { parseTbt } from '../src/tbt-parser.js'
import { matchFlow } from '../src/match-flow.js'
import { flowChartOption, DEFAULT_LAYERS } from '../src/match-flow-chart.js'

// Real five-set scoresheet (TieBreakTech, anonymized readings) with one possible setter per team
const tiebreakMatch = () => {
  const m = parseTbt(JSON.parse(readFileSync(new URL('./fixtures/tbt-tiebreak-readings.json', import.meta.url))))
  return {
    ...m,
    roster: m.roster.map(p => ({ ...p, isSetter: p.number === 13 })),
    opponentRoster: m.opponentRoster.map(p => ({ ...p, isSetter: p.number === 15 })),
  }
}

test('real match: counts of the comparison and of the configurations agree with the original sequence', () => {
  const m = tiebreakMatch()
  const states = matchRallyStates(m)
  const total = m.sets.reduce((t, s) => t + s.scoreOwn + s.scoreOther, 0)
  const won = m.sets.reduce((t, s) => t + s.scoreOwn, 0)
  assert.equal(states.length, total)
  assert.equal(states.filter(s => s.winner === 'own').length, won)
  const { cells, excluded } = rotationComparison(states)
  assert.equal(cells[6][6].rallies + excluded, total)
  // marginals from the rallies: row/column totals equal the sum of their cells' counts
  for (let i = 0; i < 6; i++) {
    for (const phase of ['BP', 'CP']) {
      assert.equal(cells[i][6][phase].rallies, cells[i].slice(0, 6).reduce((t, c) => t + c[phase].rallies, 0))
      assert.equal(cells[i][6][phase].won, cells[i].slice(0, 6).reduce((t, c) => t + c[phase].won, 0))
      assert.equal(cells[6][i][phase].won, cells.slice(0, 6).reduce((t, row) => t + row[i][phase].won, 0))
    }
  }
  const configurations = courtConfigurations(states)
  assert.equal(configurations.reduce((t, c) => t + c.rallies, 0), states.filter(s => s.teams.own.reliable).length)
  assert.equal(configurations.reduce((t, c) => t + c.won, 0), states.filter(s => s.teams.own.reliable && s.winner === 'own').length)
  // BP + CP = all rallies of the cell
  assert.equal(cells[6][6].BP.rallies + cells[6][6].CP.rallies, cells[6][6].rallies)
})

test('real fifth set: the court change at 8 does not reset the rotation', () => {
  const m = tiebreakMatch()
  const { states } = setStates(m, 4)
  const change = states.findIndex(s => Math.max(s.scoreBefore.own, s.scoreBefore.other) === 8)
  assert.ok(change > 0)
  for (const team of ['own', 'other']) {
    // same rotation column right before and right after the court change (no service change in between)
    const before = states[change - 1], after = states[change]
    if (before.servingTeam === after.servingTeam) assert.equal(after.teams[team].column, before.teams[team].column)
    assert.notEqual(after.teams[team].column, null)
  }
  // rotation columns only move forward by one at each own side-out, never back to I
  let previous = 0
  for (const s of states) {
    assert.ok(s.teams.own.column === previous || s.teams.own.column === (previous + 1) % 6)
    previous = s.teams.own.column
  }
})

test('flow chart renders sets where the P is determined only in part', () => {
  const m = tiebreakMatch()
  m.roster = m.roster.map(p => ({ ...p, isSetter: p.number === 13 || p.number === 9 }))
  for (const flow of matchFlow(m).flows) {
    assert.doesNotThrow(() => flowChartOption(flow, { layers: DEFAULT_LAYERS, filters: { phase: 'all', rotation: 'all', events: 'all' }, context: {} }))
  }
  assert.ok(matchFlow(m).flows.some(flow => flow.excludedRotations > 0 && flow.rotationKnown))
})
