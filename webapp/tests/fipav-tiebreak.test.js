import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseItems } from '../src/pdf-parser.js'
import { validateMatch, analyze } from '../src/analysis.js'

// Text items extracted with PDF.js from FIPAV_RefertoElettronico.pdf (NEWBIT 3.0.4.3, B2 femminile,
// 22/11/2025, tie-break with court change). Names of athletes, staff and officials and the free-text
// observations are anonymized; numbers, teams and scores are the original ones.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
const parse = (items = fixture.items) => parseItems(items, fixture.width, fixture.height, null, { debug: true })
const LAGARIS = 'A.S.D. LAGARIS VOLLEY TN'
const STUDIO55 = 'STUDIO55 ATATRENTO TN'
const filled = cells => cells.filter(value => value !== '' && value !== 'X')

// Replace the text of the item closest to a point (parser coordinates) to simulate a faulty PDF.
const tamper = (x, y, str) => {
  const sx = 1190.55 / fixture.width, sy = 841.89 / fixture.height
  const index = fixture.items.findIndex(item =>
    Math.abs(item.transform[4] * sx - x) < 1 && Math.abs((fixture.height - item.transform[5]) * sy - y) < 1)
  assert.ok(index >= 0, `item at ${x},${y}`)
  return fixture.items.map((item, i) => i === index ? { ...item, str } : item)
}
const addItem = (x, y, str, like) => {
  const sx = 1190.55 / fixture.width, sy = 841.89 / fixture.height
  const model = fixture.items.find(item => item.str === like.str && Math.abs(item.transform[4] * sx - like.x) < 1)
  const transform = [...model.transform]
  transform[4] = x / sx
  transform[5] = fixture.height - y / sy
  return [...fixture.items, { str, transform }]
}

test('tie-break match: teams, 3-2 result and all partials', () => {
  const m = parse()
  assert.equal(m.team, LAGARIS)
  assert.equal(m.opponent, STUDIO55)
  assert.deepEqual(m.sets.map(s => [s.scoreOwn, s.scoreOther]), [[25, 19], [25, 23], [21, 25], [22, 25], [15, 9]])
  assert.deepEqual([m.sets.filter(s => s.scoreOwn > s.scoreOther).length, m.sets.filter(s => s.scoreOther > s.scoreOwn).length], [3, 2])
  assert.deepEqual(validateMatch(m), [])
  assert.deepEqual(m.importWarnings, [])
  // "OSSERVAZIONI" box (anonymized in the fixture: the original note reports an injury)
  assert.equal(m.notes, 'OSSERVAZIONE')
})

test('fifth set is one continuous set across the court change', () => {
  const m = parse()
  assert.equal(m.sets.length, 5, 'the court-change panel must not create a sixth set')
  const set5 = m.sets[4]
  assert.deepEqual([set5.scoreOwn, set5.scoreOther], [15, 9])
  assert.deepEqual(set5.lineup, ['17', '12', '9', '5', '10', '18'])
  assert.deepEqual(set5.opponentLineup, ['14', '5', '17', '11', '18', '12'])

  // STUDIO55 serves first; LAGARIS' first box is crossed out
  assert.equal(set5.own[0], 'X')
  assert.deepEqual(filled(set5.own), [1, 2, 4, 7, 13, 14, 15])
  // STUDIO55 changes court at 4 points: 0,1,2,3,4 before, 6 (VI) and 9 (I, 2nd round) after
  assert.deepEqual(filled(set5.other), [0, 1, 2, 3, 4, 6, 9])

  for (const cells of [set5.own, set5.other]) {
    const values = filled(cells)
    // no duplicated points: strictly increasing, no repeated value
    assert.ok(values.every((value, i) => i === 0 || value > values[i - 1]), `increasing: ${values}`)
    // rotation continuity: occupied boxes are contiguous (no gap, no reset to position I)
    const used = cells.map((value, cell) => value === '' ? -1 : cell).filter(cell => cell >= 0)
    assert.deepEqual(used, used.map((_, i) => used[0] + i))
  }
  assert.equal(set5.own.findLastIndex(v => v !== ''), 7)
  assert.equal(set5.other.findLastIndex(v => v !== ''), 6)

  // The lineup repeated in the court-change panel is not a new formation; the substitution made
  // after the change (20 for 12 at 4:13) is recorded once
  assert.deepEqual(set5.opponentSubstituteNumbers, ['20'])
  assert.deepEqual(set5.substituteNumbers, [])
})

test('fifth set debug structure reconstructs a single timeline', () => {
  const debug = parse().debug.fifthSet
  assert.equal(debug.set, 5)
  assert.equal(debug.teamA, LAGARIS)
  assert.equal(debug.teamB, STUDIO55)
  assert.equal(debug.startingServer, STUDIO55)
  assert.deepEqual(debug.lineupA, ['17', '12', '9', '5', '10', '18'])
  assert.deepEqual(debug.lineupB, ['14', '5', '17', '11', '18', '12'])
  assert.deepEqual(debug.courtChange, { team: STUDIO55, letter: 'B' })
  assert.deepEqual(debug.scoreAtCourtChange, { [STUDIO55]: 4 })
  assert.deepEqual(debug.finalScore, { [LAGARIS]: 15, [STUDIO55]: 9 })

  const turns = debug.serviceTurns
  // no duplicated service turns
  assert.equal(new Set(turns.map(t => `${t.team}:${t.cell}`)).size, turns.length)
  assert.equal(turns.length, 14)
  // strict alternation between the teams, chronological order without holes
  assert.deepEqual(turns.map(t => t.order), turns.map((_, i) => i))
  assert.ok(turns.every((t, i) => i === 0 || t.team !== turns[i - 1].team))
  // only STUDIO55's last two turns are after the court change
  assert.deepEqual(turns.filter(t => t.afterCourtChange).map(t => [t.team, t.round, t.position, t.score]),
    [[STUDIO55, 1, 'VI', 6], [STUDIO55, 2, 'I', 9]])

  // Replay: every rally is won by exactly one team, totals match 15 + 9
  const score = { [LAGARIS]: 0, [STUDIO55]: 0 }
  let rallies = 0
  for (const turn of turns) {
    assert.ok(turn.score >= score[turn.team], `${turn.team} never goes back`)
    rallies += turn.score - score[turn.team]
    score[turn.team] = turn.score
  }
  assert.deepEqual(score, debug.finalScore)
  assert.equal(rallies, 15 + 9)
  // court change: STUDIO55 had 4 points when the change happened
  const lastBefore = turns.filter(t => t.team === STUDIO55 && !t.afterCourtChange).at(-1)
  const firstAfter = turns.find(t => t.team === STUDIO55 && t.afterCourtChange)
  assert.ok(lastBefore.score <= 4 && firstAfter.score >= 4)
})

test('fifth set statistics match the reconstructed sequence', () => {
  const m = parse()
  const set5 = m.sets[4]
  const only5 = { ...m, sets: [set5] }
  const result = analyze([only5])
  assert.equal(result.scored, 15)
  assert.equal(result.conceded, 9)
  const ownTurns = filled(set5.own).length
  const otherTurns = filled(set5.other).length
  assert.equal(result.rows.reduce((t, r) => t + r.turns, 0), ownTurns)
  assert.equal(result.rows.reduce((t, r) => t + r.concededTurns, 0), otherTurns)
  // Points on own serve = total - side-outs (every turn except the set's first serve starts with a side-out)
  assert.equal(result.rows.reduce((t, r) => t + r.points, 0), 15 - ownTurns)
  assert.equal(result.rows.reduce((t, r) => t + r.conceded, 0), 9 - (otherTurns - 1))
  assert.equal(result.breakPoints, 15 - ownTurns)
})

test('incompatible court-change data raises diagnostics instead of being repaired', () => {
  // The first turn after the court change (6, box VI) becomes 2: lower than the 4 points at the change
  const m = parse(tamper(799.8, 516.4, '2'))
  const warnings = m.importWarnings.filter(w => w.set === 5)
  const low = warnings.find(w => /inferiore ai punti al cambio/.test(w.message))
  assert.ok(low, JSON.stringify(warnings))
  assert.equal(low.team, STUDIO55)
  assert.equal(low.expected, '≥ 4 (punti al cambio)')
  assert.equal(low.found, 2)
  assert.match(low.zone, /CAMBIO CAMPO/)
  assert.ok(warnings.some(w => /devono crescere/.test(w.message) && /giro 1 pos\. VI/.test(w.zone)))
  // the value is kept as found in the PDF
  assert.deepEqual(filled(m.sets[4].other), [0, 1, 2, 3, 4, 2, 9])
})

test('a court-change turn in a box already used before the change is not merged', () => {
  // Extra "5" in box I (1st round) of the court-change grid, where STUDIO55 already has 0
  const items = addItem(655.0, 516.4, '5', { str: '9', x: 655.0 })
  const m = parse(items)
  const clash = m.importWarnings.find(w => /casella già usata/.test(w.message))
  assert.ok(clash, JSON.stringify(m.importWarnings))
  assert.equal(clash.set, 5)
  assert.equal(clash.team, STUDIO55)
  assert.equal(clash.found, 0)
  assert.match(clash.zone, /giro 1 pos\. I \(x≈655, y≈516\.4\)/)
  assert.deepEqual(filled(m.sets[4].other), [0, 1, 2, 3, 4, 6, 9])
})

test('tie-break may end beyond 15 with a two-point margin', () => {
  const m = parse()
  const withSet5 = (own, other) => {
    const set = { ...m.sets[4], scoreOwn: own, scoreOther: other }
    set.own = [...set.own]
    set.own[set.own.findLastIndex(v => v !== '')] = own
    set.other = [...set.other]
    set.other[set.other.findLastIndex(v => v !== '')] = other
    return { ...m, sets: [...m.sets.slice(0, 4), set] }
  }
  assert.deepEqual(validateMatch(withSet5(17, 15)), [])
  assert.ok(validateMatch(withSet5(16, 15)).some(e => /Set 5: risultato non concluso/.test(e)))
})

test('substitutions and time-outs are read per position, as on the scoresheet', () => {
  const m = parse()
  const subs = list => list.map((cell, i) => cell.in ? `${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}:${cell.in} ${cell.scoreIn}/${cell.scoreOut}` : '').filter(Boolean)
  // Set 1: STUDIO55, 20 for the starter in III at 12:16, back at 16:20
  assert.deepEqual(subs(m.sets[0].opponentSubstitutions), ['III:20 12:16/16:20'])
  assert.deepEqual(m.sets[0].timeouts, ['15:11', ''])
  assert.deepEqual(m.sets[0].opponentTimeouts, ['1:7', '15:20'])
  // Set 3: both teams, scores written with the box owner's points first
  assert.deepEqual(subs(m.sets[2].substitutions), ['I:3 17:19/20:24', 'IV:15 17:19/20:23'])
  assert.deepEqual(subs(m.sets[2].opponentSubstitutions), ['IV:5 4:7/17:16', 'V:20 20:17/20:18'])
  assert.deepEqual(m.sets[2].timeouts, ['16:18', '18:22'])
  assert.deepEqual(m.sets[2].opponentTimeouts, ['24:21', ''])
  // Set 5: the substitution recorded after the court change is kept; the time-out copied into the
  // court-change panel (4:9) is the same one, not a second time-out
  assert.deepEqual(subs(m.sets[4].opponentSubstitutions), ['VI:20 4:13/'])
  assert.deepEqual(m.sets[4].opponentTimeouts, ['4:9', ''])
  assert.deepEqual(m.sets[4].timeouts, ['14:9', ''])
  // participation list stays aligned with the "Riserve" row
  assert.deepEqual(m.sets[2].substituteNumbers, ['3', '15'])
})

test('edited PDFs: roster column without its A/B letter is matched by the team name, shifted names are read', () => {
  const sx = 1190.55 / fixture.width, sy = 841.89 / fixture.height
  const at = (item, x, y, d = 1.5) => Math.abs(item.transform[4] * sx - x) < d && Math.abs((fixture.height - item.transform[5]) * sy - y) < d
  // the circled "B" of the roster header covered by a long team name
  const withoutLetter = fixture.items.filter(item => !(item.str.trim() === 'B' && at(item, 1157, 429.4)))
  assert.equal(withoutLetter.length, fixture.items.length - 1)
  const m = parse(withoutLetter)
  assert.equal(m.opponentRoster.length, 13)
  assert.ok(m.importWarnings.some(w => w.set === null && w.team === STUDIO55 && /associata dal nome/.test(w.message)))
  // names rewritten 4.4pt higher and smaller than the jersey numbers
  const shifted = fixture.items.map(item => /^ATLETA /.test(item.str)
    ? { ...item, transform: [item.transform[0] * 0.5, 0, 0, item.transform[3] * 0.5, item.transform[4], item.transform[5] + 4.4 / sy] }
    : item)
  const n = parse(shifted)
  assert.deepEqual([n.roster.length, n.opponentRoster.length], [parse().roster.length, parse().opponentRoster.length])
})
