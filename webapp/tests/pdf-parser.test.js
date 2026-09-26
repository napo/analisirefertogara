import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { applySetter, parseItems, refreshImportedMatch } from '../src/pdf-parser.js'
import { analyze, validateMatch } from '../src/analysis.js'

const task = getDocument({
  data: new Uint8Array(readFileSync(new URL('../../Referto gara Ritorno Volley Life vs Anguillara.pdf', import.meta.url))),
  standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).pathname,
})
let items, viewport
try {
  const pdf = await task.promise
  const page = await pdf.getPage(1)
  items = (await page.getTextContent()).items
  viewport = page.getViewport({ scale: 1 })
} finally {
  await task.destroy()
}
const parse = (input = items) => parseItems(input, viewport.width, viewport.height)

test('sample PDF imports valid sets and distinct complete named rosters, including liberos', () => {
  const match = applySetter(parse())
  assert.deepEqual(validateMatch(match), [])
  assert.deepEqual(match.sets.map(s => [s.scoreOwn, s.scoreOther]), [[6, 25], [22, 25], [15, 25]])
  assert.equal(match.roster.length, 13)
  assert.equal(match.opponentRoster.length, 13)
  assert.deepEqual(match.roster.find(p => p.number === 7), { number: 7, name: 'LAZZERI ELENA' })
  assert.equal(match.roster.find(p => p.number === 99).name, 'PINZUTI RACHELE - L1')
  assert.equal(match.opponentRoster.find(p => p.number === 4).name, 'REALE IRENE')
  assert.equal(match.opponentRoster.find(p => p.number === 1).name, 'BARTONE GIORGIA - L2')
  assert.ok(!match.roster.some(p => p.number === 43))
  assert.ok(!match.opponentRoster.some(p => p.number === 7))
  assert.ok([...match.roster, ...match.opponentRoster].every(p => p.name))
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
  assert.equal(updated.roster.find(p => p.number === 7).name, 'LAZZERI ELENA')
  assert.equal(updated.roster.find(p => p.number === 11).name, 'Nome corretto')
  assert.equal(updated.sets[0].rotation, 6)
  assert.equal(updated.sets[0].durationMinutes, 14)
  assert.equal(updated.durationMinutes, 69)
})

test('reimport respects the selected team after swapping sides', () => {
  const parsed = parse()
  const updated = refreshImportedMatch({ ...parsed, team: parsed.opponent, opponent: parsed.team, roster: [4], opponentRoster: [7] }, parsed)
  assert.equal(updated.roster.find(p => p.number === 4).name, 'REALE IRENE')
  assert.equal(updated.opponentRoster.find(p => p.number === 7).name, 'LAZZERI ELENA')
})

test('unsupported documents give an explicit error', () => {
  assert.throws(() => parse([]), /Formato non riconosciuto/)
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
