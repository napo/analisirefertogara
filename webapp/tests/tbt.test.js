import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { chooseIncreasing, decodeLiberoEntry, parseTbt, valueCost } from '../src/tbt-parser.js'
import { cleanCell, openInk } from '../src/tbt-image.js'
import { isTbtPage } from '../src/tbt-reader.js'
import { validateMatch } from '../src/analysis.js'

// OCR readings (tbt-reader.js with tesseract.js) of two TieBreakTech scoresheets, with every candidate
// reading of each cell. Anonymized: names of athletes and liberos, city, venue, match number and date;
// in the Under 14 match also the team names and abbreviations. Numbers and scores are the original ones.
const load = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
const u14 = parseTbt(load('tbt-u14-readings.json'))
const serieD = parseTbt(load('tbt-seried-readings.json'))
const tiebreak = parseTbt(load('tbt-tiebreak-readings.json'))
const turns = cells => cells.filter(value => value !== '')
const subs = list => list.map(s => (s.in ? `${s.in} ${s.scoreIn}>${s.scoreOut}` : ''))
const numbers = roster => roster.map(p => p.number)

test('TBT: header, teams and result', () => {
  assert.equal(u14.sourceFormat, 'TBT')
  assert.equal(u14.team, 'SQUADRA ALFA')
  assert.equal(u14.opponent, 'SQUADRA BETA')
  assert.equal(u14.date, '2026-01-10')
  assert.equal(u14.number, '1234')
  assert.equal(u14.gender, 'Femminile')
  assert.equal(u14.championship, 'UNDER 14 FEMMINILE GIRONE X')
  assert.deepEqual(u14.sets.map(s => [s.scoreOwn, s.scoreOther, s.durationMinutes]), [[25, 10, 17], [25, 19, 27], [25, 19, 29]])
  assert.equal(u14.durationMinutes, 73)
  assert.deepEqual(serieD.sets.map(s => [s.scoreOwn, s.scoreOther]), [[7, 25], [20, 25], [13, 25]])
  assert.equal(serieD.team, 'CERTOSA VOLLEY')
})

test('TBT: service turns read with the progression rules (circled final points, "/" marks)', () => {
  assert.deepEqual(turns(u14.sets[0].own), [2, 6, 7, 13, 16, 17, 19, 21, 25])
  assert.deepEqual(turns(u14.sets[0].other), ['X', 1, 2, 3, 4, 5, 7, 9, 10])
  assert.deepEqual(turns(u14.sets[1].own), ['X', 7, 8, 9, 11, 12, 13, 18, 19, 22, 23, 25])
  assert.deepEqual(turns(u14.sets[1].other), [2, 3, 7, 8, 9, 12, 13, 14, 15, 17, 19])
  assert.deepEqual(turns(u14.sets[2].own), [1, 4, 6, 7, 9, 10, 12, 14, 16, 20, 22, 25])
  assert.deepEqual(turns(u14.sets[2].other), ['X', 1, 3, 5, 7, 10, 12, 13, 14, 17, 18, 19])
  assert.deepEqual(turns(serieD.sets[1].own), [0, 2, 3, 4, 5, 6, 8, 11, 13, 19, 20])
  assert.deepEqual(turns(serieD.sets[1].other), ['X', 4, 6, 11, 13, 16, 18, 21, 22, 23, 24, 25])
  assert.deepEqual(turns(serieD.sets[2].other), [1, 2, 4, 5, 6, 9, 14, 18, 25])
})

test('TBT: lineups, substitutions (circled numbers) and time-outs', () => {
  assert.deepEqual(u14.sets[0].lineup, ['20', '28', '12', '6', '11', '19'])
  assert.deepEqual(u14.sets[0].opponentLineup, ['8', '3', '16', '14', '5', '1'])
  assert.deepEqual(subs(u14.sets[0].substitutions), ['', '', '21 18:7>23:10', '', '', '10 18:7>'])
  assert.deepEqual(subs(u14.sets[1].opponentSubstitutions), ['', '18 9:12>14:18', '', '15 8:9>', '', ''])
  assert.deepEqual(u14.sets[0].opponentTimeouts, ['4:14', ''])
  assert.deepEqual(u14.sets[1].opponentTimeouts, ['2:6', '13:17'])
  assert.deepEqual(u14.sets[2].opponentTimeouts, ['14:16', '17:20'])
  assert.deepEqual(serieD.sets[0].lineup, ['1', '16', '8', '15', '11', '2'])
  assert.deepEqual(subs(serieD.sets[0].substitutions), ['6 3:10>', '4 6:21>', '7 3:8>', '', '', '20 3:8>'])
  assert.deepEqual(subs(serieD.sets[1].opponentSubstitutions), ['', '5 13:5>', '19 20:8>23:19', '18 17:6>', '10 13:5>', '16 20:8>'])
  assert.deepEqual(serieD.sets[1].opponentTimeouts, ['23:18', ''])
})

test('TBT: rosters with liberos from page 2, numbers in increasing order', () => {
  assert.deepEqual(numbers(u14.roster), [6, 8, 10, 11, 12, 16, 19, 20, 21, 24, 28, 5, 2])
  assert.deepEqual(numbers(u14.opponentRoster), [1, 3, 5, 6, 8, 9, 14, 15, 16, 18, 22, 4, 7])
  assert.equal(u14.roster.at(-2).name, 'LIBERO A 1 - L1')
  assert.deepEqual(numbers(serieD.roster), [1, 2, 4, 6, 7, 8, 10, 11, 15, 16, 17, 20, 23, 22])
  assert.deepEqual(numbers(serieD.opponentRoster), [1, 2, 5, 7, 8, 10, 11, 12, 16, 18, 19, 23, 6, 20])
})

test('TBT: libero exchanges of page 2, split with the liberos of the team', () => {
  const pairs = list => list.map(r => `${r.player}-${r.libero}`)
  assert.deepEqual(pairs(u14.sets[0].liberoReplacements), ['11-5', '28-5', '11-5', '28-5'])
  assert.deepEqual(pairs(u14.sets[0].opponentLiberoReplacements), ['1-7'])
  // "144" read without the dash: 14-4 (4 is a libero of the team)
  assert.deepEqual(pairs(u14.sets[2].opponentLiberoReplacements), ['14-4', '14-4'])
  assert.deepEqual(u14.sets[0].libero.onCourt.slice(0, 4), ['11', '28', '11', '28'])
  // unreadable rows are left out and reported
  assert.ok(serieD.importWarnings.some(w => /Ingresso del libero non leggibile/.test(w.message)))
})

test('TBT: matches are valid for the analysis; OCR warning always present', () => {
  for (const match of [u14, serieD]) {
    assert.deepEqual(validateMatch(match), [])
    assert.match(match.importWarnings[0].message, /OCR/)
  }
  // nothing to correct in the Under 14 match
  assert.equal(u14.importWarnings.length, 1)
})

test('TBT: choice of the readings', () => {
  assert.equal(valueCost(['12'], 12), 0)
  assert.equal(valueCost(['13', '12'], 12), 1)
  assert.equal(valueCost(['1'], 4), 3) // confused digit
  assert.equal(valueCost(['2'], 22), 4) // digit lost
  assert.equal(valueCost([], 7), 8)
  // "3" in the circled box of the final points, "1" for a 4 crossed by the "/" mark
  assert.deepEqual(chooseIncreasing([['2'], ['1'], ['5'], ['3']], { max: 25, last: 25 }).values, [2, 4, 5, 25])
  assert.equal(chooseIncreasing([['9'], ['3']], { max: 5, last: 5 }).values[1], 5)
  assert.deepEqual(decodeLiberoEntry(['144'], [1, 3, 14], [4, 7]).tokens, [14, 4])
  assert.deepEqual(decodeLiberoEntry(['23-20-6-20-6'], [23, 7], [6, 20]).tokens, [23, 20, 6, 20, 6])
  assert.equal(decodeLiberoEntry(['5-2-6206'], [23, 7], [6, 20]), null)
  // votes of the OCR variants
  assert.deepEqual(decodeLiberoEntry([{ text: '7-7', votes: 4 }, { text: '27-7', votes: 2 }], [27, 13], [7, 11]).tokens, [27, 7])
  // first digit lost ("7-7-11-7" for "27-7-11-7"): the width of the text chooses
  const width = { extent: 32, digit: 11 / 3, dash: 10 / 3 }
  assert.deepEqual(decodeLiberoEntry(['2-7-11-7', '7-7-11-7'], [2, 13, 27], [7, 11], width).tokens, [27, 7, 11, 7])
  // a split much shorter than the text is not imported
  assert.equal(decodeLiberoEntry(['16-20'], [16, 23], [6, 20], { extent: 50, digit: 3.7, dash: 3.3 }), null)
})

test('TBT: five sets, court change of the fifth set, small circled letters', () => {
  assert.equal(tiebreak.sets.length, 5)
  assert.deepEqual(tiebreak.sets.map(s => `${s.scoreOwn}-${s.scoreOther}`), ['25-19', '18-25', '16-25', '25-23', '18-16'])
  const fifth = tiebreak.sets[4]
  // team B on the left of the fifth-set panel, A on the right; B continues after the court change
  assert.deepEqual(fifth.lineup, ['11', '13', '10', '14', '6', '9'])
  assert.deepEqual(fifth.opponentLineup, ['6', '13', '15', '10', '16', '2'])
  assert.deepEqual(turns(fifth.own), ['X', 1, 3, 4, 5, 9, 11, 13, 14, 16, 18])
  assert.deepEqual(turns(fifth.other), [2, 3, 4, 5, 6, 11, 12, 14, 15, 16])
  // single-digit time-outs ("6 : 9")
  assert.deepEqual(fifth.timeouts, ['9:9', '13:14'])
  assert.deepEqual(fifth.opponentTimeouts, ['6:9', '13:13'])
  assert.deepEqual(turns(tiebreak.sets[3].own), [0, 1, 3, 5, 8, 9, 10, 11, 15, 16, 18, 19, 21, 23, 24, 25])
  assert.deepEqual(subs(tiebreak.sets[3].opponentSubstitutions), ['20 18:19>', '', '1 11:15>', '', '16 11:12>', ''])
  // roster digits matched against the digits of the same roster (3 and 5 told apart)
  assert.deepEqual(numbers(tiebreak.opponentRoster), [1, 2, 3, 6, 10, 12, 13, 15, 16, 20, 27, 11, 7])
  assert.deepEqual(numbers(tiebreak.roster), [3, 6, 8, 9, 10, 11, 13, 14, 15, 17, 2, 5])
  // "27" whose digits touch: completed and checked with the width of the text
  const chains = list => [...new Set(list.map(r => r.raw))]
  assert.deepEqual(chains(tiebreak.sets[0].opponentLiberoReplacements), ['27-11-7', '13-7-11-7-11-7', '27-7-11-7', '27-7-11-7-11'])
  assert.deepEqual(chains(tiebreak.sets[3].opponentLiberoReplacements), ['27-11', '13-11', '16-11'])
  assert.deepEqual(chains(tiebreak.sets[4].liberoReplacements), ['6-5', '13-5', '6-5-2-5'])
  assert.deepEqual(validateMatch(tiebreak), [])
})

// Synthetic images: a bold digit-like block crossed by a thin diagonal stroke
const image = (width, height, paint) => {
  const data = new Uint8Array(width * height).fill(255)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (paint(x, y)) data[y * width + x] = 0
  return { data, width, height }
}

test('TBT images: opening removes thin marks and keeps bold strokes', () => {
  const cell = image(60, 40, (x, y) => (x >= 10 && x < 16 && y >= 8 && y < 32) || (y < 30 && Math.abs(x - (34 - y)) < 1))
  const plain = cleanCell(cell)
  const opened = cleanCell(openInk(cell, 1, 2))
  assert.ok(plain.glyphs[0].w > 20) // the stroke is joined to the digit
  assert.equal(opened.glyphs.length, 1)
  assert.equal(opened.glyphs[0].h, 24)
  assert.ok(opened.glyphs[0].w <= 10) // only the root of the stroke is given back
})

test('TBT images: template check rejects blank and black pages', () => {
  assert.equal(isTbtPage(image(3309, 2339, () => false)), false)
  assert.equal(isTbtPage(image(3309, 2339, () => true)), false)
  assert.equal(isTbtPage(image(3309, 3309, () => false)), false)
})
