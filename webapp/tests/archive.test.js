import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { strFromU8, strToU8, unzipSync } from 'fflate'
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, archiveFileName, buildArchive, csv, readArchive } from '../src/archive.js'
import { parseItems } from '../src/pdf-parser.js'
import { validateMatch } from '../src/analysis.js'

// NEWBIT scoresheet (anonymized fixture) as a saved match, with a small fake PDF
const PDF = strToU8('%PDF-1.4\n% fake\n%%EOF\n')
const match = () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  const m = parseItems(fx.items, fx.width, fx.height)
  return {
    ...m, id: 'a'.repeat(64), fileName: 'referto.pdf', importedAt: '2026-01-01T00:00:00.000Z',
    roster: m.roster.map(p => ({ ...p, isSetter: p.number === 12 })), opponentRoster: m.opponentRoster.map(p => ({ ...p, isSetter: p.number === 11 })),
    setterChoices: [], analysis: { derived: true }, pdf: new Blob([PDF], { type: 'application/pdf' }),
  }
}
const parseCsv = text => text.replace(/^﻿/, '').trim().split('\r\n').map(line => line.split(';'))

test('archive: documented files, CSV tables and PDFs; the rally table has one row per rally', async () => {
  const m = match()
  const files = unzipSync(await buildArchive([m], { appVersion: '0.15', exportedAt: '2026-09-28T10:00:00.000Z' }))
  assert.deepEqual(Object.keys(files).sort(), ['LEGGIMI.txt', 'archivio.json', 'csv/atleti.csv', 'csv/gare.csv', 'csv/rally.csv', 'csv/set.csv', `pdf/${m.id}.pdf`, 'schema/archivio.schema.json'])
  const archive = JSON.parse(strFromU8(files['archivio.json']))
  assert.deepEqual([archive.format, archive.version, archive.app.version, archive.exportedAt], [ARCHIVE_FORMAT, ARCHIVE_VERSION, '0.15', '2026-09-28T10:00:00.000Z'])
  assert.equal(archive.matches[0].pdfFile, `pdf/${m.id}.pdf`)
  assert.ok(!('pdf' in archive.matches[0]) && !('analysis' in archive.matches[0]))
  assert.deepEqual(files[`pdf/${m.id}.pdf`], PDF)
  JSON.parse(strFromU8(files['schema/archivio.schema.json']))
  assert.match(strFromU8(files['LEGGIMI.txt']), /rally\.csv/)
  // CSV: BOM, semicolons, one row per rally with the same scores as the match
  const rally = parseCsv(strFromU8(files['csv/rally.csv']))
  const header = rally[0]
  const points = m.sets.reduce((t, s) => t + s.scoreOwn + s.scoreOther, 0)
  assert.equal(rally.length - 1, points)
  const col = name => header.indexOf(name)
  const last = rally.filter(row => row[col('set')] === '1').at(-1)
  assert.deepEqual([last[col('punti_squadra_dopo')], last[col('punti_avversaria_dopo')]], [String(m.sets[0].scoreOwn), String(m.sets[0].scoreOther)])
  // libero columns and positions: rally 14 of set 1, libero #6 in position 1 in place of #18
  const r14 = rally.find(row => row[col('set')] === '1' && row[col('rally')] === '14')
  assert.deepEqual([r14[col('squadra_posto1')], r14[col('libero_squadra')], r14[col('libero_squadra_al_posto_di')], r14[col('libero_squadra_certo')], r14[col('fase')]], ['6', '6', '18', 'si', 'CP'])
  const gare = parseCsv(strFromU8(files['csv/gare.csv']))
  assert.equal(gare.length, 2)
  assert.equal(gare[1][gare[0].indexOf('set_vinti')], '3')
  const set = parseCsv(strFromU8(files['csv/set.csv']))
  assert.equal(set.length - 1, m.sets.length)
  const atleti = parseCsv(strFromU8(files['csv/atleti.csv']))
  assert.equal(atleti.length - 1, m.roster.length + m.opponentRoster.length)
  assert.ok(atleti.some(row => row[atleti[0].indexOf('possibile_palleggiatore')] === 'si'))
  assert.ok(atleti.some(row => /^L[12]?$/.test(row[atleti[0].indexOf('libero')])))
  assert.match(archiveFileName(new Date('2026-09-28T10:00:00Z')), /^referto-volley-archivio-2026-09-28\.zrv$/)
})

test('archive: export and reimport give back the same matches and PDFs', async () => {
  const m = match()
  const [back] = readArchive(await buildArchive([m]))
  const strip = x => { const copy = { ...x }; delete copy.pdf; delete copy.analysis; return copy }
  assert.deepEqual(strip(back), strip(m))
  assert.deepEqual(new Uint8Array(await back.pdf.arrayBuffer()), PDF)
  assert.deepEqual(validateMatch(back, { strict: false }), [])
  // a match without PDF (manual entry)
  const manual = { ...m, id: 'b'.repeat(64), pdf: null }
  const [again] = readArchive(await buildArchive([manual]))
  assert.equal(again.pdf, null)
})

test('CSV cells with separators, quotes and new lines are quoted', () => {
  const text = csv(['a', 'b'], [['x;y', 'say "hi"'], ['line\nbreak', null]])
  assert.equal(text, '﻿a;b\r\n"x;y";"say ""hi"""\r\n"line\nbreak";\r\n')
})
