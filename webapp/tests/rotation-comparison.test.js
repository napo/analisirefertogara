import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseItems } from '../src/pdf-parser.js'
import { doubleChangeEntrants, matchRallyStates } from '../src/rally-state.js'
import { doubleChangeStretches, filterSet, rotationComparison } from '../src/court-stats.js'
import { glossaryEntries, glossaryEntry } from '../src/glossary.js'
import { PRINT_SECTIONS } from '../src/print-sections.js'

// NEWBIT scoresheet (anonymized fixture): double changes of the analyzed team in sets 3 and 4 (#3 and #15
// at the same score), of the opponent in set 2 (#5 and #44). Possible setters: #17 and #15, #12 and #44.
const match = () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  const m = parseItems(fx.items, fx.width, fx.height)
  return {
    ...m, id: 'a'.repeat(64),
    roster: m.roster.map(p => ({ ...p, isSetter: [17, 15].includes(p.number) })),
    opponentRoster: m.opponentRoster.map(p => ({ ...p, isSetter: [12, 44].includes(p.number) })),
  }
}

test('double change: two substitutions of a team at the same score; single ones are not', () => {
  const m = match()
  assert.deepEqual([...doubleChangeEntrants(m.sets[2], 'own')].sort(), ['15', '3'])
  assert.deepEqual([...doubleChangeEntrants(m.sets[1], 'other')].sort(), ['44', '5'])
  assert.equal(doubleChangeEntrants(m.sets[1], 'own').size, 0) // #3 alone at 7:12
  assert.equal(doubleChangeEntrants(m.sets[0], 'other').size, 0)
})

test('double change: rallies with an entrant on court, stretches with score, players and P', () => {
  const states = matchRallyStates(match())
  const own = states.filter(s => s.teams.own.doubleChange)
  assert.deepEqual([...new Set(own.map(s => s.set))], [3, 4])
  // on court from the entry score (17:19 in set 3) on
  const first = own.find(s => s.set === 3)
  assert.deepEqual([first.scoreBefore.own, first.scoreBefore.other], [17, 19])
  const stretches = doubleChangeStretches(states)
  assert.deepEqual(stretches.map(s => [s.set, s.team]), [[2, 'other'], [3, 'own'], [4, 'own']])
  const set3 = stretches.find(s => s.set === 3)
  assert.deepEqual(set3.players.sort(), ['15', '3'])
  assert.deepEqual(set3.from, { own: 17, other: 19 })
  assert.equal(set3.rallies, own.filter(s => s.set === 3).length)
  assert.equal(set3.won + set3.lost, set3.rallies)
})

test('comparison: sets add up to the whole match in both measures of counts, filters keep every rally', () => {
  const m = match()
  const states = matchRallyStates(m)
  const whole = rotationComparison(states)
  const bySet = m.sets.map((_, i) => rotationComparison(filterSet(states, i + 1)))
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      for (const phase of ['BP', 'CP']) {
        assert.equal(bySet.reduce((t, x) => t + x.cells[r][c][phase].rallies, 0), whole.cells[r][c][phase].rallies)
        assert.equal(bySet.reduce((t, x) => t + x.cells[r][c][phase].value, 0), whole.cells[r][c][phase].value)
      }
    }
  }
  const without = rotationComparison(states, { doubleChange: 'exclude' }), only = rotationComparison(states, { doubleChange: 'only' })
  assert.equal(without.cells[6][6].rallies + only.cells[6][6].rallies, whole.cells[6][6].rallies)
  assert.equal(whole.cells[6][6].doubleChange, only.cells[6][6].rallies)
  // the most profitable P has the highest value among the P with enough rallies
  const rows = whole.cells.slice(0, 6).map(row => row[6]).filter(cell => cell.rallies >= 4)
  assert.equal(whole.best.value, Math.max(...rows.map(cell => cell.value)))
  assert.equal(whole.worst.value, Math.min(...rows.map(cell => cell.value)))
})

test('glossary and PDF blocks of the comparison', () => {
  const pdf = glossaryEntries('pdf').map(entry => entry.id)
  for (const id of ['confronto-rotazioni', 'formazione', 'vinti-meno-persi', 'rispetto-media', 'doppio-cambio']) assert.ok(pdf.includes(id), id)
  assert.equal(glossaryEntry('doppio-cambio').term, 'DC')
  assert.ok(PRINT_SECTIONS.some(section => section.id === 'matchup-sets'))
})
