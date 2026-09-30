import assert from 'node:assert/strict'
import { test } from 'node:test'
import { strToU8 } from 'fflate'
import { fallbackHash, hashBuffer } from '../src/hash.js'
import { buildArchive, planImport } from '../src/archive.js'
import { parseItems } from '../src/pdf-parser.js'
import { readFileSync } from 'node:fs'

test('fallback hash: 64 hex characters, like SHA-256, and depends on the content', () => {
  const a = fallbackHash(strToU8('%PDF-1.4 a')), b = fallbackHash(strToU8('%PDF-1.4 b'))
  assert.match(a, /^[a-f0-9]{64}$/)
  assert.notEqual(a, b)
  assert.equal(a, fallbackHash(strToU8('%PDF-1.4 a')))
  assert.notEqual(fallbackHash(new Uint8Array(0)), fallbackHash(new Uint8Array(1)))
})

test('hashBuffer: SHA-256 when crypto.subtle is available', async () => {
  assert.equal(await hashBuffer(strToU8('abc').buffer),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('archive import accepts the 32-character ids of matches saved by earlier versions without crypto.subtle', async () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  const match = { ...parseItems(fx.items, fx.width, fx.height), id: '0123456789abcdef'.repeat(2), fileName: 'referto.pdf' }
  const fallback = { ...match, id: fallbackHash(strToU8('x')) }
  for (const m of [match, fallback]) {
    const plan = planImport(await buildArchive([m]), [])
    assert.deepEqual(plan.problems, [])
    assert.equal(plan.toImport[0].id, m.id)
  }
})
