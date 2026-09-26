import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { GLOSSARY, glossaryEntries, glossaryEntry } from '../src/glossary.js'
import { ATHLETE_INDICATORS } from '../src/athlete-indicators.js'
import { parseItems } from '../src/pdf-parser.js'
import { buildSetFlow } from '../src/match-flow.js'
import { tooltipHtml } from '../src/match-flow-chart.js'

const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

test('one glossary source: unique ids, every referenced entry exists', () => {
  assert.equal(new Set(GLOSSARY.map(entry => entry.id)).size, GLOSSARY.length)
  for (const indicator of ATHLETE_INDICATORS) if (indicator.glossary) assert.ok(glossaryEntry(indicator.glossary))
  // every <InfoTip id="..."> used in the UI points to an existing, available entry
  for (const file of readdirSync(new URL('../src/', import.meta.url)).filter(name => name.endsWith('.jsx'))) {
    for (const [, id] of source(file).matchAll(/<InfoTip id="([^"]+)"/g)) assert.notEqual(glossaryEntry(id).available, false, id)
  }
})

test('PDF glossary explains the terms needed to read the report on its own', () => {
  const pdf = glossaryEntries('pdf').map(entry => entry.id)
  for (const id of ['rally', 'bp', 'cp', 'p1-p6', 'differenza', 'turno-servizio', 'rally-set-presenza', 'mp', 'tt', 'differenza-mp', 'al-servizio'])
    assert.ok(pdf.includes(id), id)
  // data not computed by the app are never shown
  for (const place of ['info', 'analysis', 'pdf'])
    assert.ok(glossaryEntries(place).every(entry => !['rally-in-campo', 'rally-vinti', 'rally-persi'].includes(entry.id)))
})

test('vocabulary: no "differenziale", "battitore/battitrice", "azione" as rally, no individual attribution', () => {
  const texts = GLOSSARY.flatMap(entry => [entry.term, entry.short, entry.full, entry.tooltip].filter(Boolean)).join(' ')
  assert.doesNotMatch(texts, /[Dd]ifferenziale|[Bb]attit|\b[Aa]zion[ei]\b/)
  for (const file of ['match-reading.js', 'match-flow-chart.js', 'MatchFlow.jsx', 'AthletesTable.jsx', 'athlete-indicators.js'])
    assert.doesNotMatch(source(file), /[Dd]ifferenziale|[Bb]attitor|[Bb]attitric|\bscambi\b/, file)
  assert.match(glossaryEntry('rally-vinti').short, /dalla squadra/)
  assert.match(glossaryEntry('mp-bp-atleta').short, /punti della squadra/)
})

test('chart tooltip names the rally, then the score', () => {
  const f = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  const flow = buildSetFlow(parseItems(f.items, f.width, f.height), 2)
  const text = tooltipHtml(flow, 32, {}).replace(/<[^>]+>/g, ' ')
  assert.match(text, /Rally 32\s+Punteggio: \d+-\d+/)
  assert.doesNotMatch(text, /Punto 32/)
})
