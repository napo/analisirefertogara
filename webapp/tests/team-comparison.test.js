import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseItems } from '../src/pdf-parser.js'
import { matchStates } from '../src/rally-state.js'
import { closingPoints, comparisonReading, longestRun, phaseTally, teamComparison } from '../src/team-comparison.js'
import { PRINT_SECTIONS } from '../src/print-sections.js'

const match = () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  const m = parseItems(fx.items, fx.width, fx.height)
  return {
    ...m, team: 'Casa', opponent: 'Ospiti',
    roster: m.roster.map(p => ({ ...p, isSetter: [17, 15].includes(p.number) })),
    opponentRoster: m.opponentRoster.map(p => ({ ...p, isSetter: [12, 44].includes(p.number) })),
  }
}

const rally = (servingTeam, winner, own = 0, other = 0, set = 1) => ({ servingTeam, winner, set, scoreBefore: { own, other } })

test('phaseTally: break while serving, cambio palla while receiving', () => {
  const states = [rally('own', 'own'), rally('own', 'other'), rally('other', 'own'), rally('other', 'own'), rally('other', 'other')]
  assert.deepEqual(phaseTally(states, 'own'), { served: 2, breaks: 1, breakPct: 50, received: 3, sideOuts: 2, sideOutPct: 67 })
  assert.deepEqual(phaseTally(states, 'other'), { served: 3, breaks: 1, breakPct: 33, received: 2, sideOuts: 1, sideOutPct: 50 })
})

test('longestRun does not continue across sets; closingPoints from 20 (10 in the fifth set)', () => {
  const sets = [{ states: [rally('own', 'own'), rally('own', 'own')] }, { states: [rally('own', 'own'), rally('own', 'other')] }]
  assert.equal(longestRun(sets, 'own'), 2)
  const states = [rally('own', 'own', 19, 15), rally('own', 'own', 20, 15), rally('own', 'other', 10, 3, 5), rally('own', 'own', 9, 3, 5)]
  assert.equal(closingPoints(states, 'own'), 1)
  assert.equal(closingPoints(states, 'other'), 1)
})

test('teamComparison on a real five-set scoresheet', () => {
  const data = teamComparison(matchStates(match()))
  assert.equal(data.perSet.length, 5)
  assert.deepEqual(data.perSet.map(s => [s.score.own, s.score.other]), [[25, 19], [25, 23], [21, 25], [22, 25], [15, 9]])
  assert.equal(data.total.own.sideOutPct, 57)
  assert.equal(data.total.other.sideOutPct, 53)
  // every rally is a break of one team or a cambio palla of the other
  assert.equal(data.total.own.breaks + data.total.other.sideOuts, data.total.own.served)
  assert.equal(data.rallies, data.total.own.served + data.total.own.received)
  assert.deepEqual(data.longest, { own: 6, other: 8 })
  assert.deepEqual(data.closing, { own: 29, other: 22 })
  assert.equal(data.rotationsKnown, true)
  assert.equal(data.duel.P, 2)
  assert.deepEqual(data.duel.rows.find(r => r.P === 2), { P: 2, served: 5, won: 5 })
  const reading = comparisonReading(data, { team: 'Casa', opponent: 'Ospiti' })
  assert.ok(reading.sets[0].startsWith('Set vinti (1°, 2° e 5°)'))
  assert.ok(reading.rotations[0].includes('P2'))
  assert.ok(reading.serve.length >= 1)
})

test('without setters the rotations are not shown but the rest is', () => {
  const m = match()
  const data = teamComparison(matchStates({ ...m, roster: m.roster.map(p => ({ ...p, isSetter: false })) }))
  assert.equal(data.rotationsKnown, false)
  assert.equal(data.total.own.sideOutPct, 57)
})

test('the section can be left out of the PDF', () => {
  assert.ok(PRINT_SECTIONS.some(s => s.id === 'teams'))
})
