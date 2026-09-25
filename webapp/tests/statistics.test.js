import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDuration, formatWins, matchDuration } from '../src/format.js'
import { receptionStats, servicePoints } from '../src/reception.js'

test('service points subtract one point from every service turn', () => {
  assert.equal(servicePoints([2, 3, 6]), 3)
  assert.equal(servicePoints(['X', 2, 3, 6]), 3)
})

test('durations are readable with correct singulars and missing values', () => {
  for (const [minutes, expected] of [[70, '1 ora e 10 minuti'], [60, '1 ora'], [121, '2 ore e 1 minuto'], [1, '1 minuto'], [14, '14 minuti'], ['', '–'], [null, '–']]) {
    assert.equal(formatDuration(minutes), expected)
  }
  assert.equal(formatWins(0, 1), '0 vittorie su una gara giocata')
  assert.equal(formatWins(1, 1), '1 vittoria su una gara giocata')
  assert.equal(formatWins(2, 3), '2 vittorie su 3 gare')
})

test('match duration uses elapsed time, and never sums incomplete set durations', () => {
  assert.equal(matchDuration({ durationMinutes: 69, sets: [{ durationMinutes: 14 }] }), 69)
  assert.equal(matchDuration({ sets: [{ durationMinutes: 14 }, { durationMinutes: '' }] }), null)
  assert.equal(matchDuration({ sets: [{ durationMinutes: 14 }, { durationMinutes: 27 }, { durationMinutes: 22 }] }), 63)
})

const stats = (other, scoreOwn, scoreOther) => receptionStats([{ sets: [{ other, scoreOwn, scoreOther }] }])

test('two conceded points followed by sideout require three rallies', () => {
  const result = stats([2], 25, 2)
  assert.equal(result.meanRallies, 3)
  assert.equal(result.meanLost, 2)
  assert.equal(result.completed, 1)
})

test('opponent sideout points are not played in our reception phase', () => {
  const result = stats(['X', 3, 4], 25, 4)
  assert.equal(result.pointsBeforeSideout, 2)
  assert.equal(result.completed, 2)
  assert.equal(result.meanRallies, 2)
})

test('a first-ball sideout counts as one rally even at zero opponent points', () => {
  assert.equal(stats([0], 25, 0).meanRallies, 1)
})

test('exclude final opponent winning run without a sideout', () => {
  const result = stats([2, 25], 10, 25)
  assert.equal(result.completed, 1)
  assert.equal(result.meanRallies, 3)
  assert.equal(result.unfinishedPoints, 22)
  assert.equal(stats([25], 0, 25).meanRallies, null)
})

test('aggregate by completed phases, not by averaging match means', () => {
  const result = receptionStats([{ sets: [{ other: [2], scoreOwn: 25, scoreOther: 2 }] }, { sets: [{ other: ['X', 1, 2], scoreOwn: 25, scoreOther: 2 }] }])
  assert.equal(result.completed, 3)
  assert.equal(result.meanRallies, 5 / 3)
})
