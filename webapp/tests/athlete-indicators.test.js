import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseItems } from '../src/pdf-parser.js'
import { analyze } from '../src/analysis.js'
import { athleteStats } from '../src/athletes.js'
import { matchFlow } from '../src/match-flow.js'
import { ATHLETE_INDICATORS, athleteRows, extremes, indicatorValue } from '../src/athlete-indicators.js'

const fromFixture = name => {
  const f = JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
  return parseItems(f.items, f.width, f.height)
}
const tiebreak = fromFixture('fipav-tiebreak-items.json')
const newbit = fromFixture('referto11605-items.json')
const indicator = key => ATHLETE_INDICATORS.find(entry => entry.key === key)

test('servers\' points add up to the team break points; services follow the documented estimate', () => {
  for (const match of [tiebreak, newbit]) {
    const players = athleteStats([match])
    const bp = players.reduce((total, player) => total + player.pointsAtServe, 0)
    assert.equal(bp, analyze([match]).breakPoints, 'points at serve = BP card')
    // "Servizi stimati" count one lost serve per turn; the last turn of a set won by the team has none,
    // so the estimate exceeds the rallies actually served by one per set won (documented approximation)
    const served = matchFlow(match).flows.reduce((total, flow) => total + flow.points.filter(point => point.phase === 'BP').length, 0)
    const won = match.sets.filter(set => set.scoreOwn > set.scoreOther).length
    assert.equal(players.reduce((total, player) => total + player.services, 0), served + won, 'services = rallies served + sets won')
  }
  // LAGARIS serves first in set 1 and wins 4 rallies before losing the serve: 5 services, 4 BP points
  const set1 = athleteStats([{ ...tiebreak, sets: [tiebreak.sets[0]] }])
  const firstServer = set1.find(player => Number(player.number) === Number(tiebreak.sets[0].lineup[0]))
  assert.equal(tiebreak.sets[0].own[0], 4)
  assert.ok(firstServer.services >= 5 && firstServer.pointsAtServe >= 4)
})

test('per-set breakdown uses the same function and adds up to the total', () => {
  const rows = athleteRows([tiebreak])
  assert.ok(rows.every(row => row.sets.length === tiebreak.sets.length))
  for (const row of rows) {
    for (const key of ['pointsPlayed', 'services', 'serviceTurns', 'pointsAtServe']) {
      assert.equal(row.sets.reduce((total, stat) => total + (stat?.[key] || 0), 0), row.total[key], `#${row.number} ${key}`)
    }
  }
  // several matches: totals only
  assert.ok(athleteRows([tiebreak, newbit]).every(row => row.sets.length === 0))
})

test('0, not applicable and not on court are different states', () => {
  const rows = athleteRows([tiebreak])
  const libero = rows.find(row => /L1/.test(row.name))
  assert.deepEqual(indicatorValue(libero, indicator('services'), 'total'), { value: 0, state: 'value' })
  assert.equal(indicatorValue(libero, indicator('averagePointsAtServe'), 'total').state, 'not-applicable')
  const absent = rows.find(row => row.sets.some(stat => stat === null))
  const set = absent.sets.findIndex(stat => stat === null)
  assert.equal(indicatorValue(absent, indicator('pointsPlayed'), set).state, 'absent')
})

test('best and worst: same indicator, same scope, only comparable values, only with a direction', () => {
  const rows = athleteRows([tiebreak])
  // no direction: never marked
  for (const key of ['pointsPlayed', 'services']) {
    const marks = extremes(rows, indicator(key), 'total')
    assert.equal(marks.best.size + marks.worst.size, 0, key)
  }
  for (const scope of ['total', ...tiebreak.sets.map((_, i) => i)]) {
    const mp = indicator('averagePointsAtServe')
    const marks = extremes(rows, mp, scope)
    const comparable = rows.map(row => ({ row, ...indicatorValue(row, mp, scope) })).filter(entry => entry.state === 'value')
    const values = comparable.map(entry => Number(entry.value.toFixed(2)))
    if (comparable.length < 2 || Math.max(...values) === Math.min(...values)) {
      assert.equal(marks.best.size + marks.worst.size, 0)
      continue
    }
    for (const id of marks.best) assert.equal(Number(comparable.find(entry => entry.row.id === id).value.toFixed(2)), Math.max(...values))
    for (const id of marks.worst) assert.equal(Number(comparable.find(entry => entry.row.id === id).value.toFixed(2)), Math.min(...values))
    // not applicable / not on court are never marked
    for (const id of [...marks.best, ...marks.worst]) assert.ok(comparable.some(entry => entry.row.id === id))
  }
})
