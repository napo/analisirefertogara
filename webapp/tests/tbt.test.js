import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { chooseIncreasing, decodeLiberoEntry, parseTbt, valueCost } from '../src/tbt-parser.js'
import { cleanCell, openInk, removeRings, removeStrike } from '../src/tbt-image.js'
import { isTbtPage } from '../src/tbt-reader.js'
import { validateMatch } from '../src/analysis.js'
import { fieldId, flaggedFields } from '../src/import-flags.js'
import { swapTeams } from '../src/match-teams.js'
import { liberoLines, liberoLinesPatch, liberoReplacementsOf } from '../src/libero-lines.js'
import { liberoChains } from '../src/rally-state.js'

// OCR readings (tbt-reader.js with tesseract.js) of TieBreakTech scoresheets, with every candidate
// reading of each cell. Anonymized: names of athletes and liberos, city, venue, match number and date;
// in the Under 14 match and in the version 2 scoresheet also the team names and abbreviations. Numbers
// and scores are the original ones.
const load = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)))
const u14 = parseTbt(load('tbt-u14-readings.json'))
const serieD = parseTbt(load('tbt-seried-readings.json'))
const tiebreak = parseTbt(load('tbt-tiebreak-readings.json'))
// version 2 of the template: one page, libero exchanges in the "LIBERO / UNDER" columns
const v2 = parseTbt(load('tbt-v2-readings.json'))
// version 2 with team B on the left of the header and of the roster, thin digits in the substitutions
const swapped = parseTbt(load('tbt-v2-swapped-readings.json'))
// version 1, a team with 13 athletes and one libero; thin roster digits misread
const thirteen = parseTbt(load('tbt-13-athletes-readings.json'))
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

test('TBT version 2: header with full team names and date, result table', () => {
  assert.equal(v2.team, 'SQUADRA GAMMA VOLLEY ASD')
  assert.equal(v2.opponent, 'POL. SQUADRA DELTA88')
  assert.equal(v2.date, '2026-01-17')
  assert.equal(v2.number, '4321')
  assert.equal(v2.gender, 'Femminile')
  assert.equal(v2.championship, 'Terza divisione')
  assert.deepEqual(v2.sets.map(s => [s.scoreOwn, s.scoreOther, s.durationMinutes]), [[25, 14, 19], [25, 19, 27], [25, 7, 21]])
  assert.equal(v2.durationMinutes, 67)
})

test('TBT version 2: panels with smaller cells', () => {
  assert.deepEqual(v2.sets[0].lineup, ['99', '31', '13', '10', '23', '42'])
  assert.deepEqual(v2.sets[1].opponentLineup, ['13', '15', '8', '3', '21', '1'])
  assert.deepEqual(turns(v2.sets[0].own), ['X', 1, 2, 4, 5, 9, 11, 16, 17, 18, 21, 23, 25])
  assert.deepEqual(turns(v2.sets[0].other), [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14])
  assert.deepEqual(turns(v2.sets[1].own), [3, 4, 6, 8, 13, 14, 15, 23, 24, 25])
  assert.deepEqual(turns(v2.sets[1].other), ['X', 2, 3, 4, 5, 6, 7, 8, 10, 19])
  assert.deepEqual(turns(v2.sets[2].own), ['X', 2, 13, 17, 20, 23, 24, 25])
  assert.deepEqual(subs(v2.sets[0].substitutions), ['', '1 19:11>', '5 22:13>', '', '8 19:11>', '9 21:11>'])
  assert.deepEqual(subs(v2.sets[1].opponentSubstitutions), ['20 11:24>', '', '2 6:14>', '', '4 8:18>', ''])
  assert.deepEqual(v2.sets[1].timeouts, ['24:19', ''])
  assert.deepEqual(v2.sets[1].opponentTimeouts, ['5:13', '8:22'])
})

test('TBT version 2: libero exchanges of the panels (struck-through ones too) and rosters', () => {
  const chains = list => list.filter(r => r.step === 1).map(r => r.raw)
  assert.deepEqual(chains(v2.sets[0].liberoReplacements), ['99-2', '10-2', '99-2', '10-2'])
  assert.deepEqual(chains(v2.sets[0].opponentLiberoReplacements), ['13-6', '3-6', '13-6', '3-6', '13-6'])
  assert.deepEqual(chains(v2.sets[1].liberoReplacements), ['99-2', '12-2', '99-2-16', '12-16'])
  assert.deepEqual(chains(v2.sets[1].opponentLiberoReplacements), ['13-45', '3-45', '13-45'])
  assert.deepEqual(chains(v2.sets[2].liberoReplacements), ['10-2', '99-2-16', '10-16'])
  assert.deepEqual(numbers(v2.roster), [1, 5, 8, 9, 10, 12, 13, 23, 31, 42, 99, 2, 16])
  assert.deepEqual(numbers(v2.opponentRoster), [1, 2, 3, 4, 8, 13, 15, 18, 20, 21, 46, 6, 45])
  assert.deepEqual(validateMatch(v2), [])
})

test('TBT version 2: team names follow the circled letters of the header, not their side', () => {
  assert.equal(swapped.team, 'SQUADRA ZETA VOLLEY')
  assert.equal(swapped.opponent, 'SQUADRA ETA')
  assert.deepEqual(swapped.sets[0].lineup, ['6', '20', '14', '40', '25', '21'])
  assert.equal(swapped.roster[0].name, 'ATLETA A 1')
  assert.deepEqual(numbers(swapped.roster), [5, 6, 8, 9, 12, 14, 16, 20, 21, 22, 25, 40, 1, 2])
  assert.deepEqual(numbers(swapped.opponentRoster), [1, 3, 5, 8, 9, 14, 16, 17, 22, 23, 29, 30, 4, 12])
  // without the letters: the abbreviation of the result table is the beginning of the name
  const readings = load('tbt-v2-swapped-readings.json')
  delete readings.page1.header.letters
  const byAbbreviation = parseTbt(readings)
  assert.equal(byAbbreviation.team, 'SQUADRA ZETA VOLLEY')
  assert.equal(byAbbreviation.opponent, 'SQUADRA ETA')
})

test('TBT version 2: thin substitutes and time-outs, wrapped libero exchanges, unread service turns', () => {
  assert.deepEqual(subs(swapped.sets[0].substitutions), ['', '16 21:22>', '', '9 21:20>', '5 21:22>', ''])
  assert.deepEqual(subs(swapped.sets[0].opponentSubstitutions), ['', '', '', '', '', '14 24:22>'])
  assert.deepEqual(swapped.sets[0].timeouts, ['20:19', '21:23'])
  assert.deepEqual(swapped.sets[3].timeouts, ['3:7', '7:14'])
  // numbers in a ring cut by the edges of the cell
  assert.equal(swapped.sets[2].opponentSubstitutions[0].in, '22')
  assert.deepEqual(subs(swapped.sets[1].substitutions)[0], '9 19:11>20:12')
  assert.deepEqual(subs(swapped.sets[2].substitutions)[2], '12 9:8>13:16')
  const chains = list => [...new Set(list.map(r => r.raw))]
  assert.deepEqual(chains(swapped.sets[0].liberoReplacements), ['6-1-2-1-2-1', '40-1-2-1-2-1', '40-1-2-1', '6-1-2'])
  // wrapped inside a number: "9-12-4-1" + "2-4-12"
  assert.ok(chains(swapped.sets[0].opponentLiberoReplacements).includes('9-12-4-12-4-12'))
  // first column read blank on a whole row of a panel: the following rows are still read
  assert.deepEqual(chains(swapped.sets[3].liberoReplacements), ['6-2-1-2-1', '9-1-2', '6-2', '9-2'])
  // two cells seen as empty between 3 and 7: the sequence gives their values
  assert.deepEqual(turns(swapped.sets[3].own), [0, 2, 3, 4, 5, 6, 7, 9, 10])
  assert.ok(swapped.importWarnings.some(w => /giro 1 pos. V$/.test(w.zone) && w.expected === 5 && /ricavato dalla sequenza/.test(w.message)))
  assert.deepEqual(validateMatch(swapped), [])
})

test('TBT: 13th athlete beside the libero title, her only libero is the first one', () => {
  assert.deepEqual(numbers(thirteen.opponentRoster), [1, 3, 5, 7, 8, 10, 11, 12, 14, 16, 21, 22, 23, 2])
  assert.equal(thirteen.opponentRoster.at(-1).name, 'LIBERO B 1 - L1')
  assert.deepEqual(thirteen.sets[0].opponentLineup, ['21', '1', '11', '14', '23', '3'])
  assert.deepEqual(validateMatch(thirteen), [])
})

test('TBT: roster numbers checked with the panels, lineup numbers with the roster and the libero exchanges', () => {
  // 8 and 9 read as 5 and 0 in the thin print of the roster, bold and right in the lineups
  assert.deepEqual(numbers(thirteen.roster), [8, 9, 16, 44, 66, 67, 71, 73, 84, 89, 92, 76, 70])
  assert.deepEqual(thirteen.sets[0].lineup, ['8', '71', '16', '92', '67', '73'])
  // "4" close to 9 and 44: only 44 starts the libero exchanges of the set
  assert.deepEqual(thirteen.sets[1].lineup, ['73', '89', '92', '44', '84', '71'])
  assert.ok(thirteen.importWarnings.some(w => w.expected === 44 && /elenco atleti/.test(w.message)))
  assert.equal(thirteen.sets[1].liberoReplacements.filter(r => r.step === 1 && r.player === 44).length, 2)
})

test('TBT: uncertain values are flagged on their field until they change', () => {
  const set = swapped.sets[3]
  const flags = flaggedFields(swapped.importWarnings, 4, set)
  assert.ok(flags.has(fieldId('own', 4)))
  assert.match(flags.get(fieldId('own', 4)), /ricavato dalla sequenza/)
  const own = [...set.own]
  own[4] = 8
  assert.equal(flaggedFields(swapped.importWarnings, 4, { ...set, own }).has(fieldId('own', 4)), false)
  // other sets are not affected
  assert.equal(flaggedFields(swapped.importWarnings, 1, swapped.sets[0]).has(fieldId('own', 4)), false)
  // lineup of the opponent key, and the same field seen from the other team
  const lineup = flaggedFields(thirteen.importWarnings, 2, thirteen.sets[1])
  assert.ok(lineup.has(fieldId('lineup', 3)))
  const view = swapTeams(thirteen)
  assert.ok(flaggedFields(view.importWarnings, 2, view.sets[1]).has(fieldId('opponentLineup', 3)))
})

test('Side of the teams on the sheet, set by set, also seen from the other team', () => {
  // team A on the left in sets 1 and 3 of both scoresheets
  assert.deepEqual(thirteen.sets.map(s => s.opponentOnLeft), [false, true, false])
  assert.deepEqual(swapped.sets.map(s => s.opponentOnLeft), [false, true, false, true])
  assert.deepEqual(swapTeams(swapped).sets.map(s => s.opponentOnLeft), [true, false, true, false])
})

test('Libero rows: the chains of the sheet, editable, and the exchanges of the statistics', () => {
  const set = swapped.sets[0]
  const lines = liberoLines(set, 'own')
  assert.deepEqual(lines, ['6-1-2-1-2-1', '40-1-2-1-2-1', '6-1-2-1-2-1', '40-1-2-1', '6-1-2'])
  assert.deepEqual(liberoReplacementsOf(lines).map(r => [r.row, r.step, r.player, r.libero]), set.liberoReplacements.map(r => [r.row, r.step, r.player, r.libero]))
  // an unread row keeps its place and is flagged until it is written
  const first = thirteen.sets[0]
  assert.equal(liberoLines(first, 'own')[0], '')
  assert.ok(flaggedFields(thirteen.importWarnings, 1, first).has(fieldId('liberoReplacements', 0)))
  const next = liberoLines(first, 'own')
  next[0] = '73-76-70-76'
  const edited = { ...first, ...liberoLinesPatch('own', next) }
  assert.deepEqual(liberoChains(edited, 'own')[0], { player: '73', liberos: ['76', '70', '76'] })
  assert.equal(flaggedFields(thirteen.importWarnings, 1, edited).has(fieldId('liberoReplacements', 0)), false)
  // incomplete rows are not used
  assert.deepEqual(liberoReplacementsOf(['73-', '', '9']), [])
  // rows read from the libero box (NEWBIT)
  assert.deepEqual(liberoLines({ libero: { onCourt: ['5', ''], entered: ['1', ''], otherEntered: ['2', ''] } }, 'own'), ['5-1-2'])
})

test('Service turns up to the eighth round, three rows in the fifth set of version 1', () => {
  assert.equal(thirteen.sets[0].own.length, 48)
  assert.equal(tiebreak.sets[4].turnRows, 3)
  assert.equal(tiebreak.sets[3].turnRows, undefined)
  assert.equal(swapped.sets[0].turnRows, undefined)
  assert.deepEqual(swapTeams(thirteen).sheetTeams, { own: thirteen.sheetTeams.other, other: thirteen.sheetTeams.own })
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
  assert.equal(isTbtPage(image(3076, 2174, () => false)), false)
})

test('TBT images: a ring taller than a digit is removed, thin digits are kept', () => {
  // bar 3 px wide (digit) touching a line 1 px wide and 20 px high (ring); a thin 1 px digit apart
  const cell = image(30, 24, (x, y) => (x === 5 && y < 20) || (x >= 6 && x < 9 && y >= 8 && y < 18) || (x === 20 && y >= 6 && y < 18))
  const clean = removeRings(cell, 15)
  const at = (x, y) => clean.data[y * 30 + x]
  assert.equal(at(5, 2), 255)
  assert.equal(at(7, 12), 0)
  assert.equal(at(20, 10), 0)
})

test('TBT images: strike-through line removed, crossing strokes kept', () => {
  // two bars 2 px wide, 10 px high, struck through at rows 3-4 from x = 2 to x = 17
  const struck = image(20, 14, (x, y) => (y >= 2 && y < 12 && (x === 4 || x === 5 || x === 12 || x === 13)) || ((y === 4 || y === 5) && x >= 2 && x < 18))
  const clean = removeStrike(struck)
  const at = (x, y) => clean.data[y * 20 + x]
  assert.equal(at(8, 4), 255)
  assert.equal(at(16, 5), 255)
  assert.equal(at(4, 4), 0)
  assert.equal(at(13, 5), 0)
  // nothing to remove: the image is returned as it is
  const plain = image(20, 14, (x, y) => y >= 2 && y < 12 && (x === 4 || x === 5))
  assert.equal(removeStrike(plain), plain)
})
