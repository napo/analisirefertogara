import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { analyze } from '../src/analysis.js'
import { parseItems } from '../src/pdf-parser.js'
import { commonTeam, swapTeams, viewAs } from '../src/match-teams.js'

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

test('matches of a team saved from either side are aggregated: common team and swapped views', () => {
  const game = (team, opponent) => ({ id: `${team}-${opponent}`, team, opponent, roster: [{ number: 1, name: team }], opponentRoster: [{ number: 2, name: opponent }], sets: [{ number: 1, scoreOwn: 25, scoreOther: 20 }] })
  const home = game('Carpe Diem ASD', 'Cmg Cassero Volley'), away = game('Bimont', 'Carpe Diem ASD')
  assert.equal(commonTeam([home, away]), 'Carpe Diem ASD')
  assert.equal(commonTeam([away, home]), 'Carpe Diem ASD')
  assert.equal(commonTeam([home, game('Bimont', 'Altra')]), '')
  assert.equal(commonTeam([]), '')
  // the same two teams twice: the one analyzed more often, then the one of the first match
  assert.equal(commonTeam([game('A', 'B'), game('B', 'A'), game('B', 'A')]), 'B')
  assert.equal(commonTeam([game('A', 'B'), game('B', 'A')]), 'A')
  // a team that is never the analyzed one
  assert.equal(commonTeam([game('A', 'X'), game('B', 'X')]), 'X')

  assert.equal(viewAs(home, 'Carpe Diem ASD'), home)
  const view = viewAs(away, 'Carpe Diem ASD')
  assert.equal(view.team, 'Carpe Diem ASD')
  assert.equal(view.opponent, 'Bimont')
  assert.equal(view.invertedView, true)
  assert.equal(view.id, away.id)
  assert.deepEqual([view.sets[0].scoreOwn, view.sets[0].scoreOther], [20, 25])
  assert.deepEqual(view.roster, away.opponentRoster)
  assert.equal(viewAs(home, 'Bimont'), null)
})
