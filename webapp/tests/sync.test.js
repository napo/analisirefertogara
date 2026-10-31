// Synchronisation with a fake cloud service: merge, conflicts, deletions, concurrent writes, the file on the service
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseTbt } from '../src/tbt-parser.js'
import { planImport } from '../src/archive.js'
import { ArchiveError } from '../src/archive.js'
import { synchronise, forgetSync } from '../src/sync/engine.js'
import { readSyncFile, writeSyncFile } from '../src/sync/file.js'
import { mergeSnapshots } from '../src/sync/merge.js'
import { pdfKey, validPdf } from '../src/sync/pdfs.js'
import { DriveClient } from '../src/sync/drive.js'
import { DropboxClient } from '../src/sync/dropbox.js'
import { OneDriveClient } from '../src/sync/onedrive.js'
import { StorageError } from '../src/sync/storage.js'
import { PROVIDERS, syncAvailable } from '../src/sync/providers.js'

const sample = parseTbt(JSON.parse(readFileSync(new URL('./fixtures/tbt-13-athletes-readings.json', import.meta.url))))
const hex = c => c.repeat(64)
const match = (c, updatedAt, patch = {}) => ({ ...sample, id: hex(c), updatedAt, ...patch })

class FakeArchive {
  matches = new Map()
  deletions = []
  meta = new Map()
  constructor(list = []) { list.forEach(m => this.matches.set(m.id, m)) }
  getMeta = async key => this.meta.get(key)
  setMeta = async (key, value) => { this.meta.set(key, value) }
  snapshot = async () => ({ matches: [...this.matches.values()], deletions: this.deletions })
  pdfs = new Map()
  pdfState = async () => [...this.matches.values()].map(({ id, pdfSource }) => ({ id, pdfSource, hasPdf: this.pdfs.has(id) }))
  pdfBytes = async id => this.pdfs.get(id)
  setPdf = async (id, bytes) => { this.pdfs.set(id, bytes) }
  applySync = async (puts, deletions, stamps) => {
    let count = 0
    for (const { record } of puts) {
      if ((this.matches.get(record.id)?.updatedAt ?? '') !== (stamps.get(record.id) ?? '') && this.matches.has(record.id)) continue
      this.matches.set(record.id, record); count++
    }
    for (const d of deletions) { this.matches.delete(d.id); this.deletions = [...this.deletions.filter(o => o.id !== d.id), d]; count++ }
    return count
  }
}

class FakeStorage {
  file = null
  version_ = 0
  beforeUpdate = null
  findArchive = async () => (this.file ? { id: 'f', version: String(this.version_) } : null)
  version = async () => (this.file ? String(this.version_) : null)
  download = async () => this.file
  create = async bytes => { this.file = bytes; this.version_ = 1; return { id: 'f', version: '1' } }
  update = async (id, bytes, expected) => {
    if (this.beforeUpdate) { const run = this.beforeUpdate; this.beforeUpdate = null; await run() }
    if (expected !== String(this.version_)) return null
    this.file = bytes; this.version_++
    return { id, version: String(this.version_) }
  }
  trash = async () => { this.file = null }
  pdfs = new Map()
  transfers = { up: 0, down: 0 }
  listPdfs = async () => [...this.pdfs.keys()]
  uploadPdf = async (id, bytes) => { this.pdfs.set(id, bytes); this.transfers.up++ }
  downloadPdf = async id => { this.transfers.down++; return this.pdfs.get(id) }
  deletePdf = async id => { this.pdfs.delete(id) }
}

const auth = { token: async () => 'token', invalidate() {}, signOut: async () => {} }
const run = (archive, storage, { at = '2026-11-01T10:00:00.000Z', tokens = auth } = {}) => synchronise({ archive, auth: tokens, appVersion: '0', storage: () => storage, now: () => new Date(at) }, true)

test('Sync: two devices end up with the same matches, and the deletions reach the other one', async () => {
  const remote = new FakeStorage()
  const one = new FakeArchive([match('a', '2026-10-01T00:00:00.000Z')]), two = new FakeArchive([match('b', '2026-10-02T00:00:00.000Z')])
  assert.equal((await run(one, remote)).uploaded, true)
  await run(two, remote)
  await run(one, remote)
  assert.deepEqual([...one.matches.keys()].sort(), [hex('a'), hex('b')])
  assert.deepEqual([...two.matches.keys()].sort(), [hex('a'), hex('b')])
  // nothing changed: no upload
  assert.equal((await run(one, remote)).uploaded, false)
  one.matches.delete(hex('b'))
  one.deletions = [{ id: hex('b'), deletedAt: '2026-10-20T00:00:00.000Z' }]
  await run(one, remote)
  await run(two, remote)
  assert.deepEqual([...two.matches.keys()], [hex('a')])
})

test('Sync: changed on one side wins, changed on both keeps both versions', async () => {
  const base = { [hex('a')]: 'old' }
  const local = { matches: [match('a', 'new', { notes: 'locale' })], deletions: [] }, remote = { matches: [match('a', 'old')], deletions: [] }
  assert.equal(mergeSnapshots(local, remote, base).merged.matches[0].notes, 'locale')
  assert.equal(mergeSnapshots(remote, local, base).merged.matches[0].notes, 'locale')
  const both = mergeSnapshots({ matches: [match('a', '2026-10-02', { notes: 'dopo' })], deletions: [] }, { matches: [match('a', '2026-10-01', { notes: 'prima' })], deletions: [] }, base, () => hex('c'))
  assert.equal(both.conflicts, 1)
  assert.deepEqual(both.merged.matches.map(m => [m.id, m.notes]), [[hex('a'), 'dopo'], [hex('c'), 'prima']])
  // the same data with different times is not a conflict
  assert.equal(mergeSnapshots({ matches: [match('a', 'x')], deletions: [] }, { matches: [match('a', 'x')], deletions: [] }, {}).conflicts, 0)
  // a match imported again after its deletion stays
  const again = mergeSnapshots({ matches: [match('a', '2026-10-05')], deletions: [] }, { matches: [], deletions: [{ id: hex('a'), deletedAt: '2026-10-01' }] }, {})
  assert.equal(again.merged.matches.length, 1)
})

test('Sync: another device writes during the round: merged again, nothing lost', async () => {
  const remote = new FakeStorage()
  const one = new FakeArchive([match('a', '2026-10-01T00:00:00.000Z')]), two = new FakeArchive([match('b', '2026-10-02T00:00:00.000Z')])
  await run(one, remote)
  remote.beforeUpdate = () => run(new FakeArchive([match('c', '2026-10-03T00:00:00.000Z')]), remote)
  await run(two, remote)
  assert.deepEqual(readSyncFile(remote.file).matches.map(m => m.id).sort(), [hex('a'), hex('b'), hex('c')])
})

test('Sync: a refused token is renewed once; no token means paused, without touching anything', async () => {
  let invalidated = 0, calls = 0
  const remote = new FakeStorage()
  const refusing = { ...remote, findArchive: async () => { if (!calls++) throw new StorageError(401); return null }, version: remote.version, create: remote.create }
  await run(new FakeArchive(), refusing, { tokens: { ...auth, invalidate: () => { invalidated++ } } })
  assert.equal(invalidated, 1)
  const untouched = new FakeStorage()
  const outcome = await run(new FakeArchive([match('a', 'x')]), untouched, { tokens: { ...auth, token: async () => null } })
  assert.equal(outcome.done, false)
  assert.equal(untouched.file, null)
})

test('Sync file: a .zrv without PDFs, importable by hand; a foreign file is refused and not overwritten', async () => {
  const bytes = await writeSyncFile({ matches: [match('a', '2026-10-01T00:00:00.000Z')], deletions: [{ id: hex('d'), deletedAt: '2026-10-01T00:00:00.000Z' }] }, '0.27')
  const read = readSyncFile(bytes)
  assert.equal(read.matches[0].id, hex('a'))
  assert.equal(read.matches[0].updatedAt, '2026-10-01T00:00:00.000Z')
  assert.equal('pdf' in read.matches[0], false)
  assert.deepEqual(read.deletions, [{ id: hex('d'), deletedAt: '2026-10-01T00:00:00.000Z' }])
  assert.equal(planImport(bytes, []).toImport.length, 1)
  const remote = new FakeStorage()
  remote.file = new TextEncoder().encode('non un archivio')
  remote.version_ = 3
  await assert.rejects(run(new FakeArchive([match('a', 'x')]), remote), ArchiveError)
  assert.equal(remote.version_, 3)
})

test('Sync file: a match that does not pass the checks does not block the others and is not lost', async () => {
  const broken = { id: hex('e'), team: 'VECCHIA', opponent: 'GARA', date: '2020-01-01', sets: [{ number: 1 }], updatedAt: '2020-01-01T00:00:00.000Z' }
  const good = match('a', '2026-10-01T00:00:00.000Z')
  const remote = new FakeStorage()
  const device = new FakeArchive([broken, good])
  await run(device, remote)
  assert.deepEqual(readSyncFile(remote.file).matches.map(m => m.id), [hex('a')])
  const added = match('b', '2026-10-02T00:00:00.000Z')
  device.matches.set(added.id, added)
  await run(device, remote)
  assert.deepEqual(readSyncFile(remote.file).matches.map(m => m.id).sort(), [hex('a'), hex('b')])
  assert.equal(device.matches.has(hex('e')), true)
})

const pdfBytes = text => new TextEncoder().encode(`%PDF-1.4 ${text}`)
const pdfId = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')

test('Sync PDFs: each one travels once and reaches the other device, verified by its fingerprint', async () => {
  const bytes = pdfBytes('referto'), id = await pdfId(bytes)
  const remote = new FakeStorage()
  const one = new FakeArchive([{ ...match('a', '2026-10-01T00:00:00.000Z'), id }]), two = new FakeArchive()
  one.pdfs.set(id, bytes)
  await run(one, remote)
  await run(one, remote)
  assert.equal(remote.transfers.up, 1)
  assert.equal(readSyncFile(remote.file).matches.length, 1)
  await run(two, remote)
  assert.deepEqual(two.pdfs.get(id), bytes)
  await run(two, remote)
  assert.equal(remote.transfers.down, 1)
  // deleted everywhere: the PDF leaves the service too
  one.matches.delete(id)
  one.deletions = [{ id, deletedAt: '2026-10-20T00:00:00.000Z' }]
  await run(one, remote)
  assert.equal(remote.pdfs.has(id), false)
})

test('Sync PDFs: a file that is not the expected PDF is refused; a conflict copy keeps the PDF of its original', async () => {
  const good = pdfBytes('vero'), id = await pdfId(good)
  assert.equal(await validPdf(id, good), true)
  assert.equal(await validPdf(id, pdfBytes('altro')), false)
  assert.equal(await validPdf(id, new TextEncoder().encode('<html>')), false)
  const remote = new FakeStorage()
  remote.pdfs.set(id, pdfBytes('altro'))
  const device = new FakeArchive([{ ...match('a', 'x'), id }])
  await run(device, remote)
  assert.equal(device.pdfs.has(id), false)
  const both = mergeSnapshots({ matches: [{ ...match('a', '2026-10-02', { notes: 'dopo' }), id }], deletions: [] }, { matches: [{ ...match('a', '2026-10-01', { notes: 'prima' }), id }], deletions: [] }, {}, () => hex('c'))
  assert.equal(both.merged.matches.find(m => m.id === hex('c')).pdfSource, id)
  assert.equal(pdfKey(both.merged.matches.find(m => m.id === hex('c'))), id)
})

test('Cloud clients: requests for the PDFs of each service, foreign file names ignored', async () => {
  const id = 'a'.repeat(64)
  const answer = (body, init = {}) => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), init)
  const calls = []
  const fake = responder => async (url, init = {}) => { calls.push({ url, init }); return responder(url, init) }

  const dropbox = new DropboxClient('t', fake(url => (url.endsWith('list_folder') ? answer({ entries: [{ name: `${id}.pdf` }, { name: '../evil.pdf' }], has_more: false }) : answer({}))))
  assert.deepEqual(await dropbox.listPdfs(), [id])
  await dropbox.uploadPdf(id, pdfBytes('x'))
  assert.equal(JSON.parse(calls.at(-1).init.headers['Dropbox-API-Arg']).path, `/pdf/${id}.pdf`)
  const empty = new DropboxClient('t', fake(() => answer({ error_summary: 'path/not_found/..' }, { status: 409 })))
  assert.deepEqual(await empty.listPdfs(), [])

  const onedrive = new OneDriveClient('t', fake(url => (url.includes('children') ? answer({ value: [{ name: `${id}.pdf` }, { name: 'altro.txt' }] }) : answer({}))))
  assert.deepEqual(await onedrive.listPdfs(), [id])
  await onedrive.uploadPdf(id, pdfBytes('x'))
  assert.match(calls.at(-1).url, new RegExp(`approot:/pdf/${id}\\.pdf:/content$`))
  const none = new OneDriveClient('t', fake(() => answer({}, { status: 404 })))
  assert.deepEqual(await none.listPdfs(), [])

  const drive = new DriveClient('t', fake(url => (url.includes('files?') ? answer({ files: [{ id: 'd1', appProperties: { pdfId: id } }, { id: 'd2', appProperties: { pdfId: 'x' } }] }) : answer({ id: 'f' }))))
  assert.deepEqual(await drive.listPdfs(), [id])
  await drive.deletePdf(id)
  assert.match(calls.at(-1).url, /files\/d1$/)
  assert.equal(JSON.parse(calls.at(-1).init.body).trashed, true)
})

test('Sync: forgetting keeps the matches and the choice of the service is cleared', async () => {
  const archive = new FakeArchive([match('a', 'x')])
  await archive.setMeta('sync.fileId', 'f')
  await forgetSync(archive)
  assert.equal(archive.meta.get('sync.fileId'), null)
  assert.equal(archive.matches.size, 1)
})

test('Sync: hidden until the project has a client for a service', () => {
  assert.deepEqual(PROVIDERS.map(p => p.id), ['google-drive', 'dropbox', 'onedrive'])
  assert.equal(syncAvailable('web'), false)
  assert.equal(syncAvailable('desktop'), false)
  assert.equal(syncAvailable('android'), false)
})
