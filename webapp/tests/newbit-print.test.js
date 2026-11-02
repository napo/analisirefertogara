import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { gunzipSync, strFromU8 } from 'fflate'
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { filledShapes, parsePrintedShapes, PRINTED_WARNING } from '../src/newbit-print.js'
import { validateMatch } from '../src/analysis.js'

// Shapes of the characters and marks of a NEWBIT scoresheet (Lagaris - SSV Bozen, U15, 31/10/2026) printed
// with "Microsoft: Print To PDF" (portrait page, no text). Names of athletes, staff and officials removed;
// game data are original. Coordinates in hundredths of a point, each point relative to the previous one.
const fixture = JSON.parse(strFromU8(gunzipSync(readFileSync(new URL('./fixtures/newbit-printed-shapes.json.gz', import.meta.url)))))
const shapes = fixture.map(([color, evenOdd, polys]) => ({
  color, evenOdd: evenOdd === 1, polys: polys.map(deltas => {
    const points = []
    let x = 0, y = 0
    for (let i = 0; i < deltas.length; i += 2) points.push([(x += deltas[i]) / 100, (y += deltas[i + 1]) / 100])
    return points
  }),
}))

test('printed NEWBIT scoresheet: header, scores and gender read from the shapes of the characters', () => {
  const m = parsePrintedShapes(shapes)
  assert.equal(m.sourceFormat, 'FIPAV')
  assert.equal(m.team, 'LAGARIS VOLLEY')
  assert.equal(m.opponent, 'SSV BOZEN')
  assert.equal(m.date, '2026-10-31')
  assert.equal(m.number, '1357')
  assert.equal(m.championship, 'Under 15')
  assert.equal(m.location, 'Rovereto')
  assert.equal(m.venue, 'Pal. Sc. Media Negrelli')
  assert.equal(m.gender, 'Maschile')
  assert.deepEqual(m.sets.map(s => [s.scoreOwn, s.scoreOther]), [[21, 25], [21, 25], [25, 10], [25, 18], [7, 15]])
  assert.deepEqual(m.sets.map(s => s.durationMinutes), [22, 25, 18, 29, 18])
  assert.equal(m.durationMinutes, 112)
  // the only warning: values come from a printed copy (turns and scores are consistent)
  assert.deepEqual(m.importWarnings, [PRINTED_WARNING])
})

test('printed NEWBIT scoresheet: lineups, service turns, substitutions, time-outs and libero', () => {
  const m = parsePrintedShapes(shapes)
  assert.deepEqual(m.sets[0].lineup, ['8', '33', '34', '31', '30', '22'])
  assert.deepEqual(m.sets[0].opponentLineup, ['5', '30', '31', '17', '35', '26'])
  assert.deepEqual(m.sets[0].own.filter(v => v !== ''), [1, 8, 9, 10, 11, 12, 16, 18, 19, 21])
  assert.deepEqual(m.sets[0].other.filter(v => v !== ''), ['X', 1, 2, 3, 4, 14, 17, 18, 19, 24, 25])
  assert.deepEqual(m.sets[4].own.filter(v => v !== ''), [0, 1, 3, 4, 6, 7])
  assert.deepEqual(m.sets[4].other.filter(v => v !== ''), ['X', 1, 6, 8, 9, 11, 15])
  assert.deepEqual(m.sets[1].substitutions.filter(c => c.in), [
    { in: '10', scoreIn: '10:13', scoreOut: '20:20' }, { in: '18', scoreIn: '19:18', scoreOut: '' }])
  assert.deepEqual(m.sets[2].opponentSubstitutions.filter(c => c.in).map(c => [c.in, c.scoreIn]), [['41', '8:17'], ['28', '8:20'], ['29', '8:19']])
  // scores written with wide spaces around the colon ("11 : 12")
  assert.deepEqual(m.sets[0].substitutions.filter(c => c.in), [{ in: '18', scoreIn: '11:12', scoreOut: '19:22' }])
  assert.deepEqual(m.sets[0].timeouts, ['11:9', '11:12'])
  assert.deepEqual(m.sets[4].timeouts, ['1:4', '1:6'])
  assert.deepEqual(m.sets[3].timeouts, ['6:5', '18:15'])
  assert.deepEqual(m.sets[3].opponentTimeouts, ['18:22', '18:24'])
  assert.deepEqual(m.sets[0].libero.onCourt.slice(0, 4), ['22', '34', '22', '34'])
  // the libero who entered comes from the roster (L1), whose names are not in the fixture
  assert.deepEqual(m.sets[0].opponentLibero.onCourt.slice(0, 4), ['5', '17', '5', '17'])
  assert.deepEqual(validateMatch(m), [])
})

test('printed NEWBIT scoresheet: the same reading whichever way the sheet lies on the page', () => {
  const expected = parsePrintedShapes(shapes).sets
  for (const turn of [([x, y]) => [-y, x], ([x, y]) => [-x, -y], ([x, y]) => [y, -x]]) {
    const turned = shapes.map(shape => ({ ...shape, polys: shape.polys.map(poly => poly.map(turn)) }))
    assert.deepEqual(parsePrintedShapes(turned).sets, expected)
  }
})

test('printed NEWBIT scoresheet: shapes of the operator list placed with the transforms, other pages refused', () => {
  const operatorList = {
    fnArray: [OPS.transform, OPS.save, OPS.transform, OPS.setFillRGBColor, OPS.constructPath, OPS.restore],
    argsArray: [[2, 0, 0, 2, 0, 0], null, [1, 0, 0, 1, 10, 20], ['#5d5d5f'],
      [OPS.fill, [new Float32Array([0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 4])], new Float32Array([0, 0, 1, 1])], null],
  }
  assert.deepEqual(filledShapes(operatorList), [{ color: '#5d5d5f', evenOdd: false, polys: [[[20, 40], [22, 40], [22, 42], [20, 42]]] }])
  assert.equal(parsePrintedShapes(filledShapes(operatorList)), null)
})
