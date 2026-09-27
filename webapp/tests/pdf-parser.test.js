import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { applySetter, parseItems, refreshImportedMatch } from '../src/pdf-parser.js'
import { analyze, validateMatch } from '../src/analysis.js'

// Text items of the SNUG sample scoresheet (ANGUILL - LIFE F, U14, 10/01/2026) extracted with PDF.js.
// Names of athletes, staff and officials and the validation code are anonymized; game data are original.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/snug-items.json', import.meta.url)))
const items = fixture.items
const viewport = { width: fixture.width, height: fixture.height }
const parse = (input = items) => parseItems(input, viewport.width, viewport.height)

test('SNUG sample imports valid sets and distinct complete named rosters, including liberos', () => {
  const match = applySetter(parse())
  assert.deepEqual(validateMatch(match), [])
  assert.deepEqual(match.sets.map(s => [s.scoreOwn, s.scoreOther]), [[6, 25], [22, 25], [15, 25]])
  assert.equal(match.roster.length, 13)
  assert.equal(match.opponentRoster.length, 13)
  assert.deepEqual(match.roster.find(p => p.number === 7), { number: 7, name: 'ATLETA 7' })
  assert.equal(match.roster.find(p => p.number === 99).name, 'ATLETA 99 - L1')
  assert.equal(match.opponentRoster.find(p => p.number === 4).name, 'ATLETA 4')
  assert.equal(match.opponentRoster.find(p => p.number === 1).name, 'ATLETA 1 - L2')
  assert.ok(!match.roster.some(p => p.number === 43))
  assert.ok(!match.opponentRoster.some(p => p.number === 7))
  assert.ok([...match.roster, ...match.opponentRoster].every(p => p.name))
})

test('SNUG: substitutions and time-outs are read per position', () => {
  const match = parse()
  const subs = list => list.map((cell, i) => cell.in ? `${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}:${cell.in} ${cell.scoreIn}/${cell.scoreOut}` : '').filter(Boolean)
  assert.deepEqual(subs(match.sets[0].substitutions), ['II:5 3:11/', 'IV:26 3:14/'])
  assert.deepEqual(match.sets[0].timeouts, ['3:10', '5:20'])
  assert.deepEqual(match.sets[0].opponentTimeouts, ['', ''])
  assert.deepEqual(subs(match.sets[1].substitutions), ['II:12 18:18/', 'V:5 17:18/22:23'])
  assert.deepEqual(subs(match.sets[1].opponentSubstitutions), ['II:43 22:21/', 'V:39 14:13/'])
  assert.deepEqual(match.sets[1].opponentTimeouts, ['9:7', ''])
  assert.deepEqual(subs(match.sets[2].substitutions), ['I:11 8:9/14:18', 'IV:17 15:21/'])
  // substitutes now count as having played
  assert.deepEqual(match.sets[0].substituteNumbers, ['5', '26'])
  assert.deepEqual(match.sets[2].substituteNumbers, ['11', '17'])
})

test('observations box is kept, also after re-import when edited by hand', () => {
  const match = parse()
  assert.equal(match.notes, 'Alle ore 17.30 si osserva un minuto di silenzio -')
  const edited = { ...applySetter(match), notes: 'Nota corretta a mano' }
  assert.equal(refreshImportedMatch(edited, parse()).notes, 'Nota corretta a mano')
  assert.equal(refreshImportedMatch({ ...edited, notes: '' }, parse()).notes, match.notes)
})

test('substitutions and time-outs are validated', () => {
  const match = applySetter(parse())
  const withSet = patch => ({ ...match, sets: [{ ...match.sets[0], ...patch }, ...match.sets.slice(1)] })
  const cells = (column, cell) => Array.from({ length: 6 }, (_, i) => i === column ? cell : { in: '', scoreIn: '', scoreOut: '' })
  const starter = match.sets[0].lineup[0]
  assert.deepEqual(validateMatch(withSet({ timeouts: ['3:10', '5:20'] })), [])
  assert.ok(validateMatch(withSet({ timeouts: ['3-10x', ''] })).some(e => /1° time-out non valido/.test(e)))
  assert.ok(validateMatch(withSet({ timeouts: ['', '7:20'] })).some(e => /2° time-out 7:20 oltre il risultato/.test(e)))
  assert.ok(validateMatch(withSet({ substitutions: cells(1, { in: '', scoreIn: '3:11', scoreOut: '' }) })).some(e => /indica il numero della riserva entrata in posizione II/.test(e)))
  assert.ok(validateMatch(withSet({ substitutions: cells(1, { in: '5', scoreIn: '4:12', scoreOut: '3:11' }) })).some(e => /rientro in posizione II precede l'entrata/.test(e)))
  assert.ok(validateMatch(withSet({ substitutions: cells(1, { in: starter, scoreIn: '3:11', scoreOut: '' }) })).some(e => new RegExp(`numero ${starter} è tra i titolari`).test(e)))
  // backups saved before these checks still restore
  assert.deepEqual(validateMatch(withSet({ timeouts: ['3-10x', ''] }), false, { strict: false }), [])
})

test('starting lineup numbers must be unique within each team', () => {
  const match = applySetter(parse())
  const set = match.sets[0]
  // The same number for both teams is allowed
  const shared = { ...match, sets: [{ ...set, opponentLineup: [set.lineup[0], ...set.opponentLineup.slice(1)] }, ...match.sets.slice(1)] }
  assert.deepEqual(validateMatch(shared), [])
  const repeated = { ...match, sets: [{ ...set, lineup: [set.lineup[0], ...set.lineup.slice(1, 5), set.lineup[0]] }, ...match.sets.slice(1)] }
  assert.deepEqual(validateMatch(repeated), [`Set 1: il numero ${Number(set.lineup[0])} è ripetuto tra i titolari (${match.team}).`])
})

test('without roster table, fallback numbers follow the team across court changes', () => {
  const match = parse(items.filter(t => !(t.transform[4] > 905 && viewport.height - t.transform[5] > 410 && viewport.height - t.transform[5] < 640)))
  assert.ok(match.roster.some(p => p.number === 7))
  assert.ok(!match.roster.some(p => p.number === 43))
  assert.ok(match.opponentRoster.some(p => p.number === 43))
  assert.ok(!match.opponentRoster.some(p => p.number === 7))
})

test('reimport updates legacy numbers and retains corrected names and set edits', () => {
  const parsed = parse()
  const existing = { ...parsed, roster: [7, { number: 11, name: 'Nome corretto' }], sets: [{ rotation: 6 }] }
  const updated = refreshImportedMatch(existing, parsed)
  assert.equal(updated.roster.find(p => p.number === 7).name, 'ATLETA 7')
  assert.equal(updated.roster.find(p => p.number === 11).name, 'Nome corretto')
  assert.equal(updated.sets[0].rotation, 6)
  assert.equal(updated.sets[0].durationMinutes, 14)
  assert.equal(updated.durationMinutes, 69)
})

test('reimport respects the selected team after swapping sides', () => {
  const parsed = parse()
  const updated = refreshImportedMatch({ ...parsed, team: parsed.opponent, opponent: parsed.team, roster: [4], opponentRoster: [7] }, parsed)
  assert.equal(updated.roster.find(p => p.number === 4).name, 'ATLETA 4')
  assert.equal(updated.opponentRoster.find(p => p.number === 7).name, 'ATLETA 7')
})

test('unsupported documents give an explicit error', () => {
  assert.throws(() => parse([]), /^Error: Formato non riconosciuto. Attualmente sono supportati i formati dei software di NEWBIT e SNUG.$/)
})


test('extracts set minutes and total match duration including intervals', () => {
  const match = parse()
  assert.deepEqual(match.sets.map(set => set.durationMinutes), [14, 27, 22])
  assert.equal(match.durationMinutes, 69)
})

test('reimport preserves manually corrected durations', () => {
  const parsed = parse()
  const existing = { ...parsed, durationMinutes: 90, sets: parsed.sets.map(set => ({ ...set, durationMinutes: 30 })) }
  const updated = refreshImportedMatch(existing, parsed)
  assert.equal(updated.durationMinutes, 90)
  assert.deepEqual(updated.sets.map(set => set.durationMinutes), [30, 30, 30])
})

test('analyze runs successfully on parsed match', () => {
  const match = applySetter(parse())
  const result = analyze([match])
  assert.equal(result.scored, 43)
  assert.equal(result.conceded, 75)
})

test('analyze runs on parsed match even without setter rotation', () => {
  const match = parse()
  const result = analyze([match])
  assert.equal(result.scored, 43)
})
