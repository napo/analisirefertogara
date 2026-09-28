import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setStates, positionOf, playerAt, frontRow, chooseSetter } from '../src/rally-state.js'
import { onCourt } from '../src/on-court.js'

export const sample = () => ({ id: 'sample', roster: [{ number: 4, isSetter: true }, { number: 12, isSetter: true }],
  opponentRoster: [{ number: 9, isSetter: true }], sets: [{
    own: [2, 5, 6], other: ['X', 3, 4], scoreOwn: 6, scoreOther: 4,
    lineup: ['1', '2', '3', '4', '5', '6'], opponentLineup: ['7', '8', '9', '10', '11', '13'],
  }] })

test('independent rotations: BP, CP losses, side-out and CP offset when serving first', () => {
  const { states, complete } = setStates(sample(), 0)
  assert.equal(complete, true)
  assert.deepEqual(states.map(s => [s.phase, s.teams.own.column, s.teams.other.column]), [
    ['BP',0,0], ['BP',0,0], ['BP',0,0], ['CP',0,1], ['CP',0,1], ['CP',0,1],
    ['BP',1,1], ['BP',1,1], ['BP',1,1], ['CP',1,2],
  ])
  assert.deepEqual(states.map(s => s.teams.own.P), [4,4,4,4,4,4,3,3,3,3])
  assert.deepEqual(states[6].scoreBefore, { own: 3, other: 3 })
  assert.equal(states[5].winner, 'own')
})

test('positions 1–6, front row and server share existing onCourt reconstruction', () => {
  const m = sample(), states = setStates(m, 0).states
  assert.deepEqual(states[0].teams.own.positions, ['1','2','3','4','5','6'])
  assert.deepEqual(frontRow(states[6], 'own'), ['3','4','5'])
  for (const state of states) for (const team of ['own','other']) {
    for (let p=1;p<=6;p++) assert.equal(positionOf(state, team, playerAt(state, team, p)), p)
    if (state.servingTeam === team) assert.equal(state.teams[team].server, onCourt(m.sets[0], team).server[state.rally-1])
  }
  assert.equal(playerAt(states[0], 'own', 7), null)
})

test('double change replaces setter P4 → P1 without rotation, then re-entry', () => {
  const m = sample()
  m.sets[0].substitutions = [{ in: '12', scoreIn: '1:0', scoreOut: '2:0' }, {}, {}, { in: '14', scoreIn: '1:0', scoreOut: '2:0' }]
  const s = setStates(m,0).states
  assert.deepEqual(s.slice(0,3).map(s => s.teams.own.P), [4,1,4])
  assert.deepEqual(s.slice(0,3).map(s => s.teams.own.server), ['1','12','1'])
  assert.deepEqual(frontRow(s[1], 'own'), ['2','3','14'])
})

test('multiple marked setters: ambiguous continuous stretch, choice, unknown and automatic expiry', () => {
  let m = sample()
  m.sets[0].substitutions = [{ in: '12', scoreIn: '1:0', scoreOut: '3:3' }]
  const built = setStates(m,0), stretch = built.ambiguities[0]
  assert.deepEqual([stretch.from, stretch.to, stretch.candidates], [2,6,['4','12']])
  assert.equal(built.states[1].teams.own.setter.status, 'ambiguous')
  m = chooseSetter(m, stretch, '12')
  const s = setStates(m,0).states
  assert.equal(s[1].teams.own.setter.status, 'choice')
  assert.equal(s[1].teams.own.P, 1)
  assert.equal(s[6].teams.own.setter.status, 'auto')
  assert.equal(s[6].teams.own.P, 3)
  const unknown = setStates(chooseSetter(m, stretch, null),0)
  assert.equal(unknown.states[1].teams.own.P, null)
  assert.equal(unknown.ambiguities[0].choice, null)
  m.sets[0].substitutions[0].scoreIn = '2:0'
  assert.equal(setStates(m,0).states[2].teams.own.setter.status, 'ambiguous')
})

test('unmarked and absent setters never fall back to legacy rotation', () => {
  const m = sample()
  m.sets[0].rotation = 5
  m.roster = []
  assert.equal(setStates(m,0).states[0].teams.own.setter.status, 'unmarked')
  assert.equal(setStates(m,0).states[0].teams.own.P, null)
  m.roster = [{ number: 12, isSetter: true }]
  assert.equal(setStates(m,0).states[0].teams.own.setter.status, 'none')
})

test('fifth set court change does not reset rotation', () => {
  const m = sample()
  m.sets = Array.from({length:5}, () => ({...m.sets[0], own:[2,9,15], other:['X',3,9],scoreOwn:15,scoreOther:9}))
  const s = setStates(m,4).states
  const at8 = s.findIndex(s => s.score.own === 8)
  assert.equal(s[at8].teams.own.column,1)
  assert.equal(s[at8+1].teams.own.column,1)
  assert.equal(s.at(-1).teams.own.column,2)
})

// The worked example agreed before implementation: we serve first; setters #12 and #9;
// double change at 3:1 (#15 for #12 in III, #9 for #19 in VI)
const example = () => {
  const none = { in: '', scoreIn: '', scoreOut: '' }
  return {
    id: 'example',
    roster: [{ number: 12, isSetter: true }, { number: 9, isSetter: true }],
    opponentRoster: [{ number: 4, isSetter: true }],
    sets: [{
      own: [1, 3, 5], other: ['X', 1, 3], scoreOwn: 5, scoreOther: 3,
      lineup: ['20', '28', '12', '6', '11', '19'], opponentLineup: ['3', '4', '11', '18', '7', '10'],
      substitutions: [none, none, { in: '15', scoreIn: '3:1', scoreOut: '' }, none, none, { in: '9', scoreIn: '3:1', scoreOut: '' }],
      opponentSubstitutions: [none, none, none, none, none, none],
    }],
  }
}

test('worked example: CP offset fixed, rotation on side-out, double change P2 → P5, scores unchanged', () => {
  const { states } = setStates(example(), 0)
  assert.deepEqual(states.map(s => `${s.score.own}-${s.score.other}`), ['1-0', '1-1', '2-1', '3-1', '3-2', '3-3', '4-3', '5-3'])
  assert.deepEqual(states.map(s => s.phase), ['BP', 'BP', 'CP', 'BP', 'BP', 'CP', 'CP', 'BP'])
  // rally 3 (CP): still P3, the old logic said P2; rally 5: P5 after the double change, no rotation
  assert.deepEqual(states.map(s => s.teams.own.P), [3, 3, 3, 2, 5, 5, 5, 4])
  assert.deepEqual(states.map(s => s.teams.own.setter.number), ['12', '12', '12', '12', '9', '9', '9', '9'])
  assert.deepEqual(states.map(s => s.teams.other.P), [2, 2, 1, 1, 1, 6, 6, 6])
  assert.deepEqual(states.map(s => frontRow(s, 'own').join(' ')), ['28 12 6', '28 12 6', '28 12 6', '12 6 11', '15 6 11', '15 6 11', '15 6 11', '6 11 9'])
  assert.deepEqual(states.map(s => s.teams[s.servingTeam].server), ['20', '20', '4', '28', '28', '11', '11', '15'])
  assert.equal(positionOf(states[7], 'own', '9'), 4)
  assert.equal(playerAt(states[7], 'own', 3), '11')
  assert.equal(positionOf(states[7], 'own', '12'), null) // not on court
})

test('substitution of a front-row player changes the front row, not the P', () => {
  const m = example()
  m.sets[0].substitutions = [{}, { in: '17', scoreIn: '1:1', scoreOut: '' }, {}, {}, {}, {}]
  const { states } = setStates(m, 0)
  assert.deepEqual(frontRow(states[1], 'own'), ['28', '12', '6'])
  assert.deepEqual(frontRow(states[2], 'own'), ['17', '12', '6'])
  assert.deepEqual(states.slice(0, 4).map(s => s.teams.own.P), [3, 3, 3, 2])
})

test('opponent with two possible setters: automatic when one is on court, ambiguous when both are', () => {
  const m = example()
  m.opponentRoster = [{ number: 4, isSetter: true }, { number: 21, isSetter: true }]
  let states = setStates(m, 0).states
  assert.ok(states.every(s => s.teams.other.setter.status === 'auto' && s.teams.other.setter.number === '4'))
  // #21 replaces #4: automatic switch to the second setter
  m.sets[0].opponentSubstitutions = [{}, { in: '21', scoreIn: '1:2', scoreOut: '' }, {}, {}, {}, {}]
  states = setStates(m, 0).states
  assert.equal(states[3].teams.other.setter.number, '21')
  // #21 enters for #11 instead: two setters on court → ambiguous, P not guessed
  m.sets[0].opponentSubstitutions = [{}, {}, { in: '21', scoreIn: '1:2', scoreOut: '' }, {}, {}, {}]
  const built = setStates(m, 0)
  assert.equal(built.states[3].teams.other.setter.status, 'ambiguous')
  assert.equal(built.states[3].teams.other.P, null)
  assert.deepEqual(built.ambiguities.map(a => [a.team, a.from, a.to, a.candidates]), [['other', 4, 8, ['4', '21']]])
})

import { readFileSync } from 'node:fs'
import { parseItems } from '../src/pdf-parser.js'
import { liberoChains, backRow } from '../src/rally-state.js'
import { presenceByPlayer, exclusionReasons } from '../src/court-stats.js'

// NEWBIT scoresheet (anonymized fixture of the official sample, 5 sets, a libero for each team)
const newbit = () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  return parseItems(fx.items, fx.width, fx.height)
}

test('libero placed in the back-row stretches of the listed players, every exchange matched (NEWBIT)', () => {
  const m = newbit()
  for (const [index] of m.sets.entries()) {
    const built = setStates(m, index)
    for (const team of ['own', 'other']) {
      assert.deepEqual(built.liberoChecks[team], { unmatchedStretches: 0, unmatchedChains: 0 }, `set ${index + 1} ${team}`)
      // stretches of the libero = rows of the scoresheet, in the same order
      const stretches = []
      built.states.forEach(s => { const l = s.teams[team].libero; if (l && stretches.at(-1)?.to !== s.rally - 1) stretches.push({ replaced: l.replaced, to: s.rally }); else if (l) stretches.at(-1).to = s.rally })
      assert.deepEqual(stretches.map(s => s.replaced), liberoChains(m.sets[index], team).map(c => c.player))
    }
  }
})

test('libero rules: never in the front row, never serving; the server stays on court until the side-out is lost', () => {
  const m = newbit()
  const { states } = setStates(m, 0)
  for (const s of states) {
    for (const team of ['own', 'other']) {
      const side = s.teams[team]
      if (!side.libero) continue
      assert.ok(!frontRow(s, team).includes(side.libero.number))
      assert.ok([1, 5, 6].includes(positionOf(s, team, side.libero.number)))
      if (s.servingTeam === team) assert.notEqual(side.server, side.libero.number)
      if (s.servingTeam === team) assert.notEqual(positionOf(s, team, side.libero.number), 1)
    }
  }
  // set 1: #18 serves rally 13 from position 1, the libero takes her place when the team receives (rally 14)
  assert.equal(states[12].teams.own.server, '18')
  assert.equal(states[12].teams.own.libero, null)
  assert.deepEqual([states[13].phase, states[13].teams.own.libero.replaced, states[13].teams.own.libero.number], ['CP', '18', '6'])
  assert.equal(positionOf(states[13], 'own', '18'), null) // off court while the libero plays
  assert.deepEqual(backRow(states[13], 'own'), ['6', '12', '17'])
})

test('libero: missing exchange → uncertain stretch; libero-for-libero changes at each change of phase', () => {
  const m = example()
  // #11 (column V) is in position 5, back row, from the first rally
  m.sets[0].liberoReplacements = [{ row: 1, step: 1, player: 11, libero: 7 }]
  let built = setStates(m, 0)
  const withLibero = built.states.filter(s => s.teams.own.libero)
  assert.ok(withLibero.length > 0)
  assert.ok(withLibero.every(s => s.teams.own.libero.replaced === '11'))
  assert.deepEqual(built.liberoChecks.own, { unmatchedStretches: 0, unmatchedChains: 0 })
  // no row for #11: nothing placed, the libero is never guessed
  m.sets[0].liberoReplacements = []
  built = setStates(m, 0)
  assert.ok(built.states.every(s => s.teams.own.libero === null))
  // chain 11-7-8: libero 7 in the first phase of the stretch, libero 8 after the change of phase
  m.sets[0].liberoReplacements = [{ row: 1, step: 1, player: 11, libero: 7 }, { row: 1, step: 2, player: 7, libero: 8 }]
  built = setStates(m, 0)
  const phases = built.states.filter(s => s.teams.own.libero).map(s => `${s.phase}:${s.teams.own.libero.number ?? '?'}`)
  const firstPhase = phases[0].split(':')[0]
  for (const entry of phases) assert.equal(entry.split(':')[1], entry.startsWith(firstPhase) ? '7' : '8')
})

test('libero rows fewer than back-row stretches: the extra stretch is uncertain, the player is not claimed on court', () => {
  const m = newbit()
  const rows = m.sets[0].libero
  // drop the last exchange of the analyzed team in set 1
  const last = rows.onCourt.findLastIndex(Boolean)
  m.sets[0].libero = { ...rows, onCourt: rows.onCourt.map((v, i) => (i === last ? '' : v)), entered: rows.entered.map((v, i) => (i === last ? '' : v)) }
  const built = setStates(m, 0)
  assert.equal(built.liberoChecks.own.unmatchedStretches, 1)
  const uncertain = built.states.filter(s => s.teams.own.libero && !s.teams.own.libero.certain)
  assert.ok(uncertain.length > 0)
  for (const s of uncertain) assert.equal(positionOf(s, 'own', s.teams.own.libero.replaced), null)
  // presence: where uncertain, the replaced player is counted (as the scoresheet lineup says)
  const presence = presenceByPlayer(built.states, 'own')
  const replaced = uncertain[0].teams.own.libero.replaced
  assert.ok(presence.get(replaced).rallies >= uncertain.length)
})

test('presence per player: libero and replaced player share the rallies of the set', () => {
  const m = newbit()
  const { states } = setStates(m, 0)
  const presence = presenceByPlayer(states, 'own')
  const liberoRallies = states.filter(s => s.teams.own.libero?.number === '6').length
  assert.equal(presence.get('6').rallies, liberoRallies)
  // every rally has exactly six players counted
  const total = [...presence.values()].reduce((t, p) => t + p.rallies, 0)
  assert.equal(total, states.length * 6)
})

test('exclusion reasons: per team, reason and sets', () => {
  const m = example()
  m.opponentRoster = []
  const { states } = setStates(m, 0)
  assert.deepEqual(exclusionReasons(states).map(r => [r.team, r.reason, r.rallies, r.sets]), [['other', 'unmarked', 8, [1]]])
  m.opponentRoster = [{ number: 4, isSetter: true }]
  m.sets[0].opponentSubstitutions = [{}, { in: '21', scoreIn: '1:2', scoreOut: '' }, {}, {}, {}, {}]
  const reasons = exclusionReasons(setStates(m, 0).states)
  assert.deepEqual(reasons.map(r => [r.team, r.reason, r.rallies]), [['other', 'none', 5]])
})

import { backRowSlots } from '../src/rally-state.js'
import { backRowLabels, courtConfigurations } from '../src/court-stats.js'

test('second line: libero written as L#libero⇒#replaced, uncertain exchange as L?⇒#replaced', () => {
  const m = newbit()
  const { states } = setStates(m, 0)
  // rally 14: libero #6 in position 1 in place of #18 (who served rally 13)
  assert.deepEqual(backRowLabels(states[13], 'own'), ['L#6⇒#18', '#12', '#17'])
  assert.deepEqual(backRowSlots(states[13], 'own')[0], { position: 1, number: '6', libero: true, replaced: '18', certain: true })
  assert.deepEqual(backRowLabels(states[12], 'own'), ['#18', '#12', '#17'])
  // configurations carry the second line, one row per distinct second line
  const rows = courtConfigurations(states)
  assert.ok(rows.some(row => row.backRow.includes('L#6⇒#18')))
  assert.equal(rows.reduce((t, r) => t + r.rallies, 0), states.length)
  // without the scoresheet row the stretch is uncertain
  const rowsBox = m.sets[0].libero
  const last = rowsBox.onCourt.findLastIndex(Boolean)
  m.sets[0].libero = { ...rowsBox, onCourt: rowsBox.onCourt.map((v, i) => (i === last ? '' : v)), entered: rowsBox.entered.map((v, i) => (i === last ? '' : v)) }
  const uncertain = setStates(m, 0).states.find(s => s.teams.own.libero && !s.teams.own.libero.certain)
  assert.ok(backRowLabels(uncertain, 'own').some(label => /^L\?⇒#\d+$/.test(label)))
})

import { setterVerification } from '../src/rally-state.js'

test('setter verification: open until every team has a possible setter and every ambiguity has an answer', () => {
  const m = example()
  m.roster = []
  m.opponentRoster = []
  assert.deepEqual(setterVerification(m).unmarked, ['own', 'other'])
  assert.equal(setterVerification(m).open, true)
  m.roster = [{ number: 12, isSetter: true }]
  assert.deepEqual(setterVerification(m).unmarked, ['other'])
  m.opponentRoster = [{ number: 4, isSetter: true }]
  assert.equal(setterVerification(m).open, false)
  // #12 and #9 both possible setters and both on court (no double change): ambiguity without answer
  m.roster = [{ number: 12, isSetter: true }, { number: 9, isSetter: true }]
  m.sets[0].substitutions = [{}, {}, {}, {}, {}, { in: '9', scoreIn: '3:1', scoreOut: '' }]
  const pending = setterVerification(m)
  assert.equal(pending.open, true)
  assert.equal(pending.pending.length, 1)
  // an answer closes it, "Non so" included
  assert.equal(setterVerification(chooseSetter(m, pending.pending[0], '12')).open, false)
  assert.equal(setterVerification(chooseSetter(m, pending.pending[0], null)).open, false)
  // data changed: the stretch moves, the old answer no longer applies and the check is open again
  const answered = chooseSetter(m, pending.pending[0], '12')
  answered.sets[0].substitutions[5].scoreIn = '1:1'
  assert.equal(setterVerification(answered).open, true)
})
