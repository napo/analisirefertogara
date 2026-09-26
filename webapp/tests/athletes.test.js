import assert from 'node:assert/strict'
import { test } from 'node:test'
import { athleteStats } from '../src/athletes.js'
const match = (team, number, name) => ({ team, roster: [{number, name}], sets: [{lineup: [number], own: [2], scoreOwn: 25, scoreOther: 20}] })
test('same jersey on different teams or different athletes never merges', () => {
  assert.equal(athleteStats([match('A', 1, 'Anna'), match('B', 1, 'Anna'), match('A', 1, 'Maria')]).length, 3)
})
test('same named athlete changing jersey aggregates within her team', () => {
  const [player] = athleteStats([match('A', 1, 'Anna'), match('A', 7, 'Anna')])
  assert.equal(player.pointsPlayed, 90)
  assert.equal(player.serviceTurns, 2)
})
test('unknown names are never borrowed from another match', () => {
  const result = athleteStats([match('A', 1, ''), match('A', 1, 'Anna')])
  assert.equal(result.length, 2)
  assert.equal(result[0].name, '')
})
