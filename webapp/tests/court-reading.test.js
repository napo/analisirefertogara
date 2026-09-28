import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseItems } from '../src/pdf-parser.js'
import { matchRallyStates } from '../src/rally-state.js'
import { configurationsReading, matrixReading } from '../src/court-reading.js'

// NEWBIT scoresheet (anonymized fixture), one possible setter marked per team
const match = () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  const m = parseItems(fx.items, fx.width, fx.height)
  return { ...m, roster: m.roster.map(p => ({ ...p, isSetter: p.number === 12 })), opponentRoster: m.opponentRoster.map(p => ({ ...p, isSetter: p.number === 11 })) }
}
const JUDGEMENT = /\b(migliore|peggiore|migliori|peggiori|rende|causa(to|ta)? da|grazie a|efficac)/i

test('readings: descriptive only, every percentage with its rallies, no judgement words', () => {
  const m = match()
  const states = matchRallyStates(m)
  for (const phase of ['all', 'BP', 'CP']) {
    for (const sentences of [matrixReading(states, { team: m.team, opponent: m.opponent, phase }), configurationsReading(states, { team: m.team, phase })]) {
      assert.ok(sentences.length >= 3)
      for (const sentence of sentences) {
        assert.ok(!JUDGEMENT.test(sentence.replace('non indicano la causa del risultato né una combinazione migliore di un’altra', '')), sentence)
        // a percentage is always next to counts ("x su n" or "n rally")
        if (/\d%/.test(sentence)) assert.match(sentence, /\d+ (vint[oi] )?su \d+|\d+ rally/, sentence)
      }
    }
  }
})

test('readings: totals agree with the matrix and comparisons need 10 rallies on both sides', () => {
  const m = match()
  const states = matchRallyStates(m)
  const [total] = matrixReading(states, { team: m.team, opponent: m.opponent })
  const won = states.filter(s => s.teams.own.P && s.teams.other.P && s.winner === 'own').length
  const all = states.filter(s => s.teams.own.P && s.teams.other.P).length
  assert.match(total, new RegExp(`Nei ${all} rally .* ne ha vinti ${won} `))
  for (const sentence of matrixReading(states, { team: m.team, opponent: m.opponent })) {
    const ranges = [...sentence.matchAll(/\((\d+) su (\d+)\)/g)]
    if (/va dal|va dall/.test(sentence)) for (const [, , n] of ranges) assert.ok(Number(n) >= 10, sentence)
  }
})

test('readings: no P determined, few rallies, Italian articles', () => {
  const m = match()
  m.roster = m.roster.map(p => ({ ...p, isSetter: false }))
  const states = matchRallyStates(m)
  assert.match(matrixReading(states, { team: m.team, opponent: m.opponent })[0], /^Nessun rally con entrambe le P determinate/)
  // a single set: few rallies per P, no comparison
  const first = matchRallyStates(match()).filter(s => s.set === 1).slice(0, 12)
  assert.ok(matrixReading(first, { team: 'A', opponent: 'B' }).some(s => /non vengono confrontate/.test(s)))
  const configs = configurationsReading(first, { team: 'A' })
  assert.ok(configs.some(s => /non vengono confrontate/.test(s)))
  assert.ok(configs.every(s => !/ dei (8|11|8\d) rally/.test(s)))
})

import { filterSet, rotationMatrix } from '../src/court-stats.js'

test('per set: the matrices of the single sets add up to the whole match, readings name the set', () => {
  const m = match()
  const states = matchRallyStates(m)
  for (const phase of ['all', 'BP', 'CP']) {
    const whole = rotationMatrix(states, phase)
    const bySet = m.sets.map((_, i) => rotationMatrix(filterSet(states, i + 1), phase))
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        assert.equal(bySet.reduce((t, x) => t + x.cells[r][c].rallies, 0), whole.cells[r][c].rallies)
        assert.equal(bySet.reduce((t, x) => t + x.cells[r][c].won, 0), whole.cells[r][c].won)
      }
    }
    assert.equal(bySet.reduce((t, x) => t + x.excluded, 0), whole.excluded)
  }
  assert.equal(filterSet(states, 'all'), states)
  assert.ok(filterSet(states, 2).every(s => s.set === 2))
  assert.match(matrixReading(filterSet(states, 2), { team: m.team, opponent: m.opponent, set: 2 })[0], /^Nei \d+ rally del set 2 con entrambe le P determinate/)
  assert.match(matrixReading(filterSet(states, 5), { team: m.team, opponent: m.opponent, set: 5, phase: 'BP' })[0], /del set 5 in fase BP/)
})

import { cellDetail } from '../src/court-stats.js'
import { cellSentence, matrixGuide } from '../src/court-reading.js'

test('cell explained in words, guide example from the most observed cell, rallies behind a cell', () => {
  const m = match()
  const states = matchRallyStates(m)
  const ctx = { team: 'A', opponent: 'B' }
  assert.equal(cellSentence({ rallies: 6, won: 5, lost: 1, percent: 500 / 6 }, 0, 0, ctx),
    'In 6 rally A era in P1 mentre B era in P1: A ne ha vinti 5 e persi 1 (83,3%).')
  assert.equal(cellSentence({ rallies: 0, won: 0, lost: 0, percent: null }, 5, 2, { ...ctx, set: 2, phase: 'BP' }),
    'Nessun rally nel set 2 in fase BP in cui A era in P6 mentre B era in P3.')
  assert.match(cellSentence({ rallies: 10, won: 4, lost: 6, percent: 40 }, 1, 6, ctx), /A era in P2 \(qualunque fosse la P di B\)/)
  assert.match(cellSentence({ rallies: 10, won: 4, lost: 6, percent: 40 }, 6, 6, ctx), /le P di entrambe le squadre erano determinate/)
  // guide: the example is the cell with most rallies, and its numbers are those of the matrix
  const matrix = rotationMatrix(states)
  const cells = matrix.cells.slice(0, 6).flatMap((row, r) => row.slice(0, 6).map((cell, c) => ({ ...cell, r, c })))
  const top = cells.reduce((best, cell) => (cell.rallies > best.rallies ? cell : best))
  const guide = matrixGuide(states, ctx)
  assert.match(guide.example, new RegExp(`cella P${top.r + 1} contro P${top.c + 1} .*${top.won}/${top.rallies}`))
  // rallies behind the cell: one entry per rally, all with those P, wins as counted
  const detail = cellDetail(states, top.r, top.c)
  assert.equal(detail.list.length, top.rallies)
  assert.ok(detail.list.every(r => r.ownP === top.r + 1 && r.otherP === top.c + 1))
  assert.equal(detail.list.filter(r => r.winner === 'own').length, top.won)
  for (const r of detail.list) {
    const s = states.find(x => x.set === r.set && x.rally === r.rally)
    assert.deepEqual([r.after, r.phase, r.server], [s.score, s.phase, s.teams[s.servingTeam].server])
  }
})
