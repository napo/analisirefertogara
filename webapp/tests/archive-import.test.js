import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, ArchiveError, buildArchive, importSummary, inspectArchive, planImport, readArchive, safeArchivePath } from '../src/archive.js'
import { parseItems } from '../src/pdf-parser.js'

// A saved match (NEWBIT anonymized fixture) with possible setters, a setter choice and a small PDF
const PDF = strToU8('%PDF-1.4\n% referto\n%%EOF\n')
const base = (() => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  return parseItems(fx.items, fx.width, fx.height)
})()
const match = (id = 'a', extra = {}) => ({
  ...base, id: id.repeat(64).slice(0, 64), fileName: 'referto.pdf', importedAt: '2026-01-01T00:00:00.000Z',
  roster: base.roster.map(p => ({ ...p, isSetter: p.number === 12 || p.number === 9 })),
  opponentRoster: base.opponentRoster.map(p => ({ ...p, isSetter: p.number === 11 })),
  setterChoices: [{ set: 1, team: 'own', from: 3, candidates: ['9', '12'], number: '12' }],
  pdf: new Blob([PDF], { type: 'application/pdf' }),
  ...extra,
})
// Rewrite archivio.json (and optionally other files) of a valid archive
const edit = async (matches, change, files = {}) => {
  const entries = unzipSync(await buildArchive(matches))
  const archive = JSON.parse(strFromU8(entries['archivio.json']))
  change(archive)
  entries['archivio.json'] = strToU8(JSON.stringify(archive))
  for (const [name, content] of Object.entries(files)) {
    if (content === null) delete entries[name]
    else entries[name] = content
  }
  return zipSync(entries)
}
const problems = bytes => inspectArchive(bytes).problems
const strip = m => { const copy = { ...m }; delete copy.pdf; delete copy.analysis; return copy }

test('1-5. valid archive: export → import in an empty archive gives back matches, PDF, setters and setter choices', async () => {
  const original = [match('a'), match('b', { team: 'SQUADRA B', pdf: null })]
  const plan = planImport(await buildArchive(original), [])
  assert.equal(plan.ok, true)
  assert.deepEqual([plan.total, plan.toImport.length, plan.duplicates.length], [2, 2, 0])
  const [a, b] = plan.toImport
  assert.deepEqual(strip(a), strip(original[0]))
  assert.deepEqual(strip(b), strip(original[1]))
  assert.deepEqual(new Uint8Array(await a.pdf.arrayBuffer()), PDF)
  assert.equal(b.pdf, null)
  assert.deepEqual(a.setterChoices, original[0].setterChoices)
  assert.deepEqual(a.roster.filter(p => p.isSetter).map(p => p.number), [9, 12])
  assert.deepEqual(a.opponentRoster.filter(p => p.isSetter).map(p => p.number), [11])
  assert.ok(!('pdfFile' in a))
  assert.deepEqual(importSummary(plan), { ok: true, title: 'Archivio importato correttamente.', lines: ['2 gare lette', '2 importate', '0 già presenti'] })
})

test('6-10. container and archivio.json: missing, malformed, wrong format, future version, missing matches', async () => {
  const valid = unzipSync(await buildArchive([match()]))
  const without = { ...valid }
  delete without['archivio.json']
  assert.deepEqual(problems(zipSync(without)), ['Archivio incompleto: manca archivio.json.'])
  assert.deepEqual(problems(zipSync({ ...valid, 'archivio.json': strToU8('{ "format": ') })), ['archivio.json non contiene JSON valido.'])
  assert.match(problems(await edit([match()], a => { a.format = 'altro' }))[0], /^Formato archivio non riconosciuto/)
  const future = problems(await edit([match()], a => { a.version = ARCHIVE_VERSION + 2 }))
  assert.equal(future.length, 1)
  assert.match(future[0], /formato più recente/)
  assert.match(future[0], new RegExp(`versione archivio ${ARCHIVE_VERSION + 2}, massima supportata ${ARCHIVE_VERSION}`))
  assert.match(future[0], /Aggiorna Referto Volley/)
  assert.deepEqual(problems(await edit([match()], a => { delete a.matches })), ['L’archivio non contiene l’elenco delle gare (matches).'])
  assert.match(problems(await edit([match()], a => { a.version = 1 }))[0], /Versione archivio 1 non supportata/)
})

test('11-13. matches: missing id, invalid id, invalid structure, with the match name and the set', async () => {
  assert.deepEqual(problems(await edit([match()], a => { delete a.matches[0].id })),
    ["La gara 'A.S.D. LAGARIS VOLLEY TN - STUDIO55 ATATRENTO TN' non può essere importata: manca l’identificativo."])
  assert.deepEqual(problems(await edit([match()], a => { a.matches[0].id = 'abc' })),
    ["La gara 'A.S.D. LAGARIS VOLLEY TN - STUDIO55 ATATRENTO TN' non può essere importata: identificativo non valido."])
  const broken = problems(await edit([match()], a => { a.matches[0].sets[2].scoreOwn = 'x'; a.matches[0].setterChoices = [{ set: 1 }] }))
  assert.ok(broken.includes("La gara 'A.S.D. LAGARIS VOLLEY TN - STUDIO55 ATATRENTO TN', set 3: punteggio non valido."), broken.join('\n'))
  assert.ok(broken.some(p => /setterChoices/.test(p)))
  assert.deepEqual(problems(await edit([match()], a => { a.matches[0] = 'gara' })), ['La gara n. 1 non è descritta correttamente nell’archivio.'])
})

test('14-16. PDF: declared but missing, empty, not a PDF, path not allowed', async () => {
  const path = `pdf/${'a'.repeat(64)}.pdf`
  assert.deepEqual(problems(await edit([match()], () => {}, { [path]: null })),
    [`Il PDF dichiarato per 'A.S.D. LAGARIS VOLLEY TN - STUDIO55 ATATRENTO TN' non è presente nell’archivio (${path}).`])
  assert.deepEqual(problems(await edit([match()], () => {}, { [path]: new Uint8Array() })), [`Il file ${path} è vuoto.`])
  assert.deepEqual(problems(await edit([match()], () => {}, { [path]: strToU8('non sono un pdf') })), [`Il file ${path} non sembra essere un PDF valido.`])
  assert.match(problems(await edit([match()], a => { a.matches[0].pdfFile = '../fuori.pdf' }))[0], /percorso non consentito/)
})

test('17-18. duplicates: already present matches are not errors and are never overwritten', async () => {
  const bytes = await buildArchive([match('a'), match('b'), match('c')])
  const some = planImport(bytes, ['b'.repeat(64)])
  assert.equal(some.ok, true)
  assert.deepEqual([some.toImport.length, some.duplicates.length], [2, 1])
  assert.deepEqual(importSummary(some).lines, ['3 gare lette', '2 importate', '1 già presente'])
  const all = planImport(bytes, ['a', 'b', 'c'].map(c => c.repeat(64)))
  assert.deepEqual([all.ok, all.toImport.length], [true, 0])
  assert.deepEqual(importSummary(all), { ok: true, title: 'Archivio letto correttamente.', lines: ['Le 3 gare sono già presenti nell’archivio locale.'] })
  // the same match twice inside one archive is a problem of the archive
  assert.match(problems(await edit([match('a')], a => { a.matches.push(a.matches[0]) })).join(' '), /compare più volte/)
})

test('19-20. several problems at once; nothing is imported when any problem is found (atomic)', async () => {
  const bytes = await edit([match('a'), match('b'), match('c')], a => {
    delete a.matches[0].id
    a.matches[1].sets[1].own = 'x'
  }, { [`pdf/${'c'.repeat(64)}.pdf`]: strToU8('???') })
  const plan = planImport(bytes, [])
  assert.equal(plan.ok, false)
  assert.equal(plan.problems.length, 3, plan.problems.join('\n'))
  assert.deepEqual([plan.toImport.length, plan.duplicates.length], [0, 0]) // the valid parts are not imported either
  const summary = importSummary(plan)
  assert.equal(summary.title, 'Importazione non riuscita.')
  assert.equal(summary.lines[0], 'Sono stati trovati 3 problemi:')
  assert.ok(summary.lines.slice(1).every(line => line.startsWith('• ')))
  assert.throws(() => readArchive(bytes), error => error instanceof ArchiveError && error.problems.length === 3)
})

test('21-23. damaged ZIP, harmless extra files, unsafe paths, duplicated canonical files, decompression bombs', async () => {
  const valid = await buildArchive([match()])
  assert.deepEqual(problems(valid.slice(0, 200)), ['Il file non è un archivio .zrv leggibile: il contenuto ZIP è danneggiato.'])
  const extra = zipSync({ ...unzipSync(valid), 'futuro/altro.json': strToU8('{"nuovo": true}'), 'LEGGIMI-2.txt': strToU8('note') })
  assert.equal(planImport(extra, []).ok, true)
  assert.match(problems(zipSync({ ...unzipSync(valid), '../evil.txt': strToU8('x') }))[0], /percorso non consentito/)
  assert.match(problems(zipSync({ ...unzipSync(valid), '/etc/passwd': strToU8('x') }))[0], /percorso non consentito/)
  for (const bad of ['../x', '/x', 'a/../b', 'C:/x', 'a\\b', '']) assert.equal(safeArchivePath(bad), false, bad)
  for (const good of ['archivio.json', 'pdf/a.pdf', 'csv/rally.csv']) assert.equal(safeArchivePath(good), true, good)
  // a small entry that expands enormously
  const bomb = zipSync({ ...unzipSync(valid), 'zeri.bin': new Uint8Array(20 * 1024 * 1024) }, { level: 9 })
  assert.match(problems(bomb)[0], /rapporto di compressione anomalo/)
  // the same canonical file twice (ZIP central directory with duplicate names)
  const one = zipSync({ 'archivio.json': unzipSync(valid)['archivio.json'] })
  const twice = duplicateEntry(one)
  assert.match(problems(twice).join(' '), /archivio\.json compare più volte/)
})

test('24. older JSON backups are still imported', async () => {
  const m = match()
  const legacy = JSON.stringify({ version: 1, matches: [{ ...m, pdf: `data:application/pdf;base64,${Buffer.from(PDF).toString('base64')}` }] })
  const plan = planImport(strToU8(legacy), [])
  assert.equal(plan.ok, true)
  assert.deepEqual(new Uint8Array(await plan.toImport[0].pdf.arrayBuffer()), PDF)
  assert.deepEqual(strip(plan.toImport[0]), strip(m))
  assert.deepEqual(problems(strToU8('{"version":3,"matches":[]}')), ['Backup JSON in un formato non riconosciuto.'])
  assert.deepEqual(problems(strToU8('non è json')), ['Il file non è un archivio .zrv né un backup JSON di Referto Volley.'])
  const badPdf = JSON.stringify({ version: 1, matches: [{ ...m, pdf: 'data:application/pdf;base64,AAAA' }] })
  assert.match(problems(strToU8(badPdf))[0], /non sembra essere un PDF valido/)
})

test('an empty archive is read correctly', async () => {
  const plan = planImport(await buildArchive([]), [])
  assert.deepEqual([plan.ok, plan.total], [true, 0])
  assert.deepEqual(importSummary(plan).lines, ['L’archivio non contiene gare.'])
  assert.equal(JSON.parse(strFromU8(unzipSync(await buildArchive([]))['archivio.json'])).format, ARCHIVE_FORMAT)
})

// Builds a ZIP whose central directory lists the only entry twice (as some tools may produce)
function duplicateEntry(zip) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const eocd = zip.length - 22
  const cdSize = view.getUint32(eocd + 12, true), cdOffset = view.getUint32(eocd + 16, true)
  const central = zip.slice(cdOffset, cdOffset + cdSize)
  const out = new Uint8Array(cdOffset + cdSize * 2 + 22)
  out.set(zip.slice(0, cdOffset), 0)
  out.set(central, cdOffset)
  out.set(central, cdOffset + cdSize)
  const end = zip.slice(eocd, eocd + 22)
  const endView = new DataView(end.buffer)
  endView.setUint16(8, 2, true)
  endView.setUint16(10, 2, true)
  endView.setUint32(12, cdSize * 2, true)
  out.set(end, cdOffset + cdSize * 2)
  return out
}
