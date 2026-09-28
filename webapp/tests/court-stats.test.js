import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rotationMatrix, courtConfigurations, cellDetail, heatColor } from '../src/court-stats.js'
import { matchRallyStates, setStates } from '../src/rally-state.js'
import { swapTeams } from '../src/match-teams.js'
import { analyze } from '../src/analysis.js'

const state = (P, otherP, winner='own', phase='BP', columns=['1','2','3','4','5','6']) => ({
  matchId:'a', set:1, rally:1, winner, phase, servingTeam: phase === 'BP' ? 'own' : 'other', scoreBefore:{own:0,other:0}, score:{own:0,other:0}, reliable:true,
  teams: { own: { P, column:0, columns, onCourt: columns, server:'1' }, other: { P:otherP, column:0, columns:['7','8','9','10','11','12'], onCourt:['7','8','9','10','11','12'] } },
})

test('6×6 matrix plus weighted marginals, empty cell versus zero percent', () => {
  const states = [state(1,1), ...Array.from({length:9}, () => state(1,2,'other')),state(2,1,'other')]
  const { cells } = rotationMatrix(states)
  assert.equal(cells.length,7)
  assert.ok(cells.every(row => row.length === 7))
  assert.equal(cells[0][0].percent,100)
  assert.equal(cells[0][1].percent,0)
  assert.equal(cells[0][2].percent,null)
  assert.equal(cells[0][6].percent,10)
  assert.equal(cells[6][0].percent,50)
  assert.deepEqual(cells[6][6],{rallies:11,won:1,lost:10,percent:100/11})
})

test('Tutti/BP/CP recalculate cells, marginal counts and excluded rallies', () => {
  const s = [state(1,1),state(1,1,'other','CP'),state(null,2,'own','CP'),state(1,null)]
  assert.equal(rotationMatrix(s).excluded,2)
  assert.deepEqual(rotationMatrix(s,'BP').cells[6][6],{rallies:1,won:1,lost:0,percent:100})
  assert.equal(rotationMatrix(s,'CP').cells[6][6].percent,0)
  assert.equal(rotationMatrix(s,'CP').excluded,1)
  assert.equal(rotationMatrix(s,'BP').excluded,1)
  assert.equal(rotationMatrix([...s,{...state(2,2),reliable:false}]).unreliable,1)
})

test('detail separates substitutions in the same P pair, phases and servers', () => {
  const states = [state(4,1),state(4,1,'other','CP'),state(4,1,'own','BP',['1','2','18','4','5','6'])]
  const d = cellDetail(states,3,0)
  assert.deepEqual([d.rallies,d.won,d.lost,d.BP.rallies,d.CP.rallies],[3,2,1,2,1])
  assert.equal(d.ownFrontRows.length,2)
  assert.equal(d.ownFrontRows[0].rallies,2)
  assert.equal(d.otherFrontRows.length,1)
  assert.equal(d.servers[0].rallies,2)
  assert.equal(cellDetail(states,3,0,'CP').BP.rallies,0)
  assert.equal(courtConfigurations(states).length,3)
})

test('configurations sorted by observed rallies, unknown P retained; multi-match records aggregate', () => {
  const states = [state(1,1),state(2,1,'other'),state(2,1,'other'),state(null,1)]
  assert.equal(courtConfigurations(states)[0].P,2)
  assert.equal(courtConfigurations(states).at(-1).rallies,1)
  assert.ok(courtConfigurations(states).some(g=>g.P===null))
  const all = [...states,...states.map(s=>({...s,matchId:'b'}))]
  assert.equal(rotationMatrix(all).cells[6][6].rallies,6)
  assert.equal(heatColor({rallies:0,percent:null}),'#ffffff')
  assert.notEqual(heatColor({rallies:2,percent:100}),heatColor({rallies:32,percent:100}))
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

test('real match: counts of the matrix and of the configurations agree with the original sequence', () => {
  const m = tiebreakMatch()
  const states = matchRallyStates(m)
  const total = m.sets.reduce((t, s) => t + s.scoreOwn + s.scoreOther, 0)
  const won = m.sets.reduce((t, s) => t + s.scoreOwn, 0)
  assert.equal(states.length, total)
  assert.equal(states.filter(s => s.winner === 'own').length, won)
  const { cells, excluded } = rotationMatrix(states)
  assert.equal(cells[6][6].rallies + excluded, total)
  // marginals from the rallies: row/column totals equal the sum of their cells' counts (not of percentages)
  for (let i = 0; i < 6; i++) {
    assert.equal(cells[i][6].rallies, cells[i].slice(0, 6).reduce((t, c) => t + c.rallies, 0))
    assert.equal(cells[i][6].won, cells[i].slice(0, 6).reduce((t, c) => t + c.won, 0))
    assert.equal(cells[6][i].won, cells.slice(0, 6).reduce((t, row) => t + row[i].won, 0))
  }
  const configurations = courtConfigurations(states)
  assert.equal(configurations.reduce((t, c) => t + c.rallies, 0), states.filter(s => s.teams.own.reliable).length)
  assert.equal(configurations.reduce((t, c) => t + c.won, 0), states.filter(s => s.teams.own.reliable && s.winner === 'own').length)
  // BP + CP = Tutti
  assert.equal(rotationMatrix(states, 'BP').cells[6][6].rallies + rotationMatrix(states, 'CP').cells[6][6].rallies, cells[6][6].rallies)
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
