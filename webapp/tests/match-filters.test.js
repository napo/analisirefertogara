import assert from 'node:assert/strict'
import { test } from 'node:test'
import { displayName, withDisplayNames } from '../src/match-names.js'
import { championshipOptions, defaultSortDirection, emptyFilters, filterMatches, hasActiveFilters, sortMatches, teamOptions } from '../src/match-filters.js'

const set = (own, other) => ({ scoreOwn: own, scoreOther: other })
const a = { id: 'a', date: '2026-10-23', team: 'Beta', opponent: 'Alfa', championship: 'Prima divisione', sets: [set(25, 20), set(25, 20), set(25, 20)] }
const b = { id: 'b', date: '2026-10-30', team: 'Gamma', opponent: 'Beta', championship: 'PRIMA DIVISIONE', sets: [set(20, 25), set(20, 25), set(20, 25)] }
const c = { id: 'c', date: '2026-09-01', team: 'Alfa', opponent: 'Delta', championship: 'Under 14', sets: [set(25, 20), set(20, 25), set(25, 20), set(25, 20)] }
const all = [a, b, c]
const ids = list => list.map(m => m.id).join('')

test('Filters: championship without regard to capitals, team on either side', () => {
  assert.equal(ids(filterMatches(all, { ...emptyFilters, championship: 'prima divisione' })), 'ab')
  assert.equal(ids(filterMatches(all, { ...emptyFilters, team: 'Beta' })), 'ab')
  assert.equal(ids(filterMatches(all, { ...emptyFilters, team: 'Delta' })), 'c')
  assert.equal(ids(filterMatches(all, { ...emptyFilters, query: 'under' })), 'c')
  assert.deepEqual(championshipOptions(all), ['Prima divisione', 'Under 14'])
  assert.deepEqual(teamOptions(all), ['Alfa', 'Beta', 'Delta', 'Gamma'])
  assert.equal(hasActiveFilters(emptyFilters), false)
  assert.equal(hasActiveFilters({ ...emptyFilters, team: 'Beta' }), true)
})

test('List of the matches: most recent first, by column in both directions', () => {
  assert.equal(ids(sortMatches(all)), 'bac')
  assert.equal(ids(sortMatches(all, { key: 'date', direction: 'asc' })), 'cab')
  assert.equal(ids(sortMatches(all, { key: 'match', direction: 'asc' })), 'cab')
  assert.equal(ids(sortMatches(all, { key: 'result', direction: 'desc' })), 'acb')
  // same championship in other capitals: equal, the most recent first
  assert.equal(ids(sortMatches(all, { key: 'championship', direction: 'asc' })), 'bac')
  assert.equal(defaultSortDirection('date'), 'desc')
  assert.equal(defaultSortDirection('match'), 'asc')
  assert.equal(all[0], a) // the list given is not changed
})

test('Names: capital initials whatever the scoresheet prints', () => {
  assert.equal(displayName('SILC GRASSOBBIO'), 'Silc Grassobbio')
  assert.equal(displayName('POLISP.PALLAVOLO MORNICO'), 'Polisp.Pallavolo Mornico')
  assert.equal(displayName('terza divisione'), 'Terza Divisione')
  assert.equal(displayName('PRIMA DIVISIONE FEMMINILE GIRONE A'), 'Prima Divisione Femminile Girone A')
  assert.equal(displayName('CARPE DIEM VOLLEY ASD PIZZERIA SANDRINO'), 'Carpe Diem Volley ASD Pizzeria Sandrino')
  assert.equal(displayName('POL. MUGELLO88'), 'Pol. Mugello88')
  assert.equal(displayName('VOLLEYTEAM S.GIACOMO NEW BRAND'), 'Volleyteam S.Giacomo New Brand')
  assert.equal(displayName('ADP LAIVES SECONDA DIVISIONE'), 'ADP Laives Seconda Divisione')
  assert.equal(displayName('CAMPIONATO DI SERIE C II'), 'Campionato di Serie C II')
  assert.equal(displayName('VolleyTeam'), 'VolleyTeam')
  assert.equal(displayName(undefined), '')
  const match = { team: 'ALFA', opponent: 'Beta', championship: 'under 14', number: '1' }
  assert.deepEqual(withDisplayNames(match), { team: 'Alfa', opponent: 'Beta', championship: 'Under 14', number: '1' })
  const done = { team: 'Alfa', opponent: 'Beta', championship: '' }
  assert.equal(withDisplayNames(done), done)
})
