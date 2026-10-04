import test from 'node:test'
import assert from 'node:assert/strict'
import { savedMessage } from '../src/save-file.js'

test('saved file message: full path in the installed apps, Downloads folder in the browser', () => {
  assert.equal(savedMessage('Report PDF', { fileName: 'r.pdf', path: 'C:\\Users\\a\\Downloads\\r.pdf' }), 'Report PDF salvato in: C:\\Users\\a\\Downloads\\r.pdf')
  assert.match(savedMessage('Report PDF', { fileName: 'r.pdf' }), /r\.pdf.*download del browser/)
})
