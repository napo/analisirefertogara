import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { analyze } from '../src/analysis.js'
import { parseItems } from '../src/pdf-parser.js'
import { swapTeams } from '../src/match-teams.js'

const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
const match = {
  ...parseItems(fx.items, fx.width, fx.height), id: 'a'.repeat(64),
  setterChoices: [{ set: 1, team: 'own', from: 3, candidates: ['9', '12'], number: '12' }],
}

// "Inverti" is only a view: a change made from it (setters, setter choices) is saved by swapping back, so
// swapping twice must give back the match as saved
test('inverted view: swapping twice gives back the saved match, same id', () => {
  const inverted = swapTeams(match)
  assert.equal(inverted.id, match.id)
  assert.equal(inverted.team, match.opponent)
  assert.equal(inverted.setterChoices[0].team, 'other')
  assert.deepEqual(swapTeams(inverted), match)
})

test('inverted view: the analysis is the one of the other team', () => {
  const own = analyze([match]), other = analyze([swapTeams(match)])
  assert.equal(other.scored, own.conceded)
  assert.equal(other.conceded, own.scored)
  assert.equal(other.wins, 1 - own.wins)
})
