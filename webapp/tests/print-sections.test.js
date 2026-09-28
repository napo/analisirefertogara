import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRINT_SECTIONS, defaultPrintSections, loadPrintSections, savePrintSections } from '../src/print-sections.js'

test('PDF blocks: all included by default, choice saved and restored, defaults without storage', () => {
  assert.ok(Object.values(defaultPrintSections()).every(Boolean))
  assert.deepEqual(Object.keys(defaultPrintSections()), PRINT_SECTIONS.map(s => s.id))
  // no storage (Node, private mode): defaults
  delete globalThis.localStorage
  assert.deepEqual(loadPrintSections(), defaultPrintSections())
  assert.doesNotThrow(() => savePrintSections({ ...defaultPrintSections(), athletes: false }))
  // with storage
  const store = new Map()
  globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  savePrintSections({ ...defaultPrintSections(), athletes: false, glossary: false })
  const loaded = loadPrintSections()
  assert.equal(loaded.athletes, false)
  assert.equal(loaded.glossary, false)
  assert.equal(loaded.summary, true)
  // unknown or broken values fall back to the default
  store.set('referto-volley.print-sections', '{"athletes":"no","extra":false')
  assert.deepEqual(loadPrintSections(), defaultPrintSections())
  // storage that throws
  globalThis.localStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.deepEqual(loadPrintSections(), defaultPrintSections())
  assert.doesNotThrow(() => savePrintSections(defaultPrintSections()))
  delete globalThis.localStorage
})
