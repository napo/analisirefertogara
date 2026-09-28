import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { strFromU8, unzipSync } from 'fflate'
import { parseItems } from '../src/pdf-parser.js'
import { backRowSlots, positionOf, setStates, frontRow } from '../src/rally-state.js'
import { backRowLabels, presenceByPlayer } from '../src/court-stats.js'
import { configurationsReading } from '../src/court-reading.js'
import { athleteRows, indicatorValue, ATHLETE_INDICATORS } from '../src/athlete-indicators.js'
import { buildArchive } from '../src/archive.js'

// NEWBIT scoresheet (anonymized fixture): LAGARIS libero #6 for #9 and #18 in every set
const newbit = () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/fipav-tiebreak-items.json', import.meta.url)))
  return { ...parseItems(fx.items, fx.width, fx.height), id: 'e'.repeat(64) }
}
const setBox = (match, index, change) => {
  const box = match.sets[index].libero
  match.sets[index].libero = change({ onCourt: [...box.onCourt], entered: [...box.entered], otherEntered: [...box.otherEntered] })
}
const dropLastRow = (match, index) => setBox(match, index, box => {
  const last = box.onCourt.findLastIndex(Boolean)
  box.onCourt[last] = box.entered[last] = box.otherEntered[last] = ''
  return box
})
const presenceRallies = (states, number) => presenceByPlayer(states, 'own').get(number) || { rallies: 0, uncertain: 0 }

test('certain: the scoresheet exchange placed in the back-row stretch is shown normally', () => {
  const { states } = setStates(newbit(), 0)
  const libero = states[13].teams.own.libero
  assert.deepEqual([libero.number, libero.replaced, libero.certain, libero.reason], ['6', '18', true, null])
  assert.equal(positionOf(states[13], 'own', '6'), 1)
  assert.equal(positionOf(states[13], 'own', '18'), null)
  assert.equal(backRowLabels(states[13], 'own')[0], 'L#6⇒#18')
  assert.ok(states.every(s => !s.teams.own.libero || s.teams.own.libero.certain))
  assert.equal(presenceRallies(states, '18').uncertain, 0)
})

test('not determinable: a stretch without a row is L?, the listed player is counted only as inferred presence', () => {
  const m = newbit()
  dropLastRow(m, 0)
  const { states } = setStates(m, 0)
  const uncertain = states.filter(s => s.teams.own.libero && !s.teams.own.libero.certain)
  assert.ok(uncertain.length > 0)
  const replaced = uncertain[0].teams.own.libero.replaced
  for (const s of uncertain) {
    assert.equal(s.teams.own.libero.reason, 'unmatched')
    assert.equal(positionOf(s, 'own', replaced), null) // not shown as surely on court
    assert.equal(positionOf(s, 'own', '6'), null) // neither is the libero
    assert.ok(backRowLabels(s, 'own').includes(`L?⇒#${replaced}`))
    const slot = backRowSlots(s, 'own').find(x => x.libero)
    assert.deepEqual([slot.number, slot.certain], [null, false])
  }
  const presence = presenceRallies(states, replaced)
  assert.equal(presence.uncertain, uncertain.length)
  assert.ok(presence.rallies >= presence.uncertain)
  // the libero is never credited with the uncertain rallies
  const liberoCertain = states.filter(s => s.teams.own.libero?.certain && s.teams.own.libero.number === '6').length
  assert.equal(presenceRallies(states, '6').rallies, liberoCertain)
  assert.equal(presenceRallies(states, '6').uncertain, 0)
})

test('identity not determinable: the player surely left, the libero is not attributed', () => {
  const m = newbit()
  // a libero-for-libero chain whose changes do not match the phases of the stretch
  setBox(m, 0, box => { box.otherEntered[0] = '7'; return box })
  m.roster = [...m.roster, { number: 7, name: 'LIBERO DUE - L2' }]
  const { states } = setStates(m, 0)
  const unknown = states.filter(s => s.teams.own.libero?.reason === 'identity')
  assert.ok(unknown.length > 0)
  for (const s of unknown) {
    assert.equal(s.teams.own.libero.certain, false)
    assert.equal(positionOf(s, 'own', s.teams.own.libero.replaced), null)
  }
  const replaced = unknown[0].teams.own.libero.replaced
  const counted = states.filter(s => presenceByPlayer([s], 'own').has(replaced))
  assert.ok(counted.every(s => s.teams.own.libero?.reason !== 'identity'))
})

test('no libero: nothing placed, presence exactly the lineup and substitutions', () => {
  const m = newbit()
  m.sets[0].libero = { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') }
  const { states } = setStates(m, 0)
  assert.ok(states.every(s => s.teams.own.libero === null))
  assert.ok([...presenceByPlayer(states, 'own').values()].every(p => p.uncertain === 0))
  assert.equal([...presenceByPlayer(states, 'own').values()].reduce((t, p) => t + p.rallies, 0), states.length * 6)
})

test('two liberos (L1/L2) for two different players are kept apart', () => {
  const m = newbit()
  setBox(m, 0, box => { box.onCourt.forEach((player, i) => { if (player === '18') box.entered[i] = '8' }); return box })
  const { states } = setStates(m, 0)
  const pairs = new Set(states.map(s => s.teams.own.libero).filter(Boolean).map(l => `${l.replaced}>${l.number}`))
  assert.deepEqual([...pairs].sort(), ['18>8', '9>6'])
})

test('fifth set with court change: exchanges placed across the change, front row never includes the libero', () => {
  const m = newbit()
  const built = setStates(m, 4)
  assert.deepEqual(built.liberoChecks.own, { unmatchedStretches: 0, unmatchedChains: 0 })
  const change = built.states.findIndex(s => Math.max(s.scoreBefore.own, s.scoreBefore.other) === 8)
  assert.ok(change > 0)
  for (const s of built.states) {
    const libero = s.teams.own.libero
    if (libero?.number) assert.ok(!frontRow(s, 'own').includes(libero.number))
  }
})

test('athlete statistics report inferred presence instead of presenting it as observed', () => {
  const m = newbit()
  dropLastRow(m, 0)
  const rows = athleteRows([m])
  const rally = ATHLETE_INDICATORS.find(i => i.key === 'rallyOnCourt')
  const withUncertain = rows.filter(row => row.total.rallyOnCourtUncertain > 0)
  assert.equal(withUncertain.length, 1)
  const entry = indicatorValue(withUncertain[0], rally, 'total')
  assert.ok(entry.uncertain > 0 && entry.value >= entry.uncertain)
  assert.equal(indicatorValue(withUncertain[0], ATHLETE_INDICATORS.find(i => i.key === 'services'), 'total').uncertain, 0)
  // the complete scoresheet has no inferred presence at all
  assert.ok(athleteRows([newbit()]).every(row => !row.total.rallyOnCourtUncertain))
})

test('readings and export never turn an uncertain libero into a presence', async () => {
  const m = newbit()
  dropLastRow(m, 0)
  const states = setStates(m, 0).states
  const sentences = configurationsReading(states, { team: 'A' })
  const certain = states.filter(s => s.teams.own.libero?.certain).length
  assert.ok(sentences.some(s => s.includes(`il libero #6 era in campo in ${certain} rally`)))
  assert.ok(sentences.some(s => /presenza del libero non è determinabile con certezza \(L\?\)/.test(s)))
  // rally.csv: position empty and libero_squadra_certo = no where the exchange is not placeable
  const files = unzipSync(await buildArchive([{ ...m, pdf: null }]))
  const lines = strFromU8(files['csv/rally.csv']).replace(/^﻿/, '').trim().split('\r\n').map(line => line.split(';'))
  const col = name => lines[0].indexOf(name)
  const uncertainRows = lines.slice(1).filter(row => row[col('set')] === '1' && row[col('libero_squadra_certo')] === 'no')
  assert.ok(uncertainRows.length > 0)
  for (const row of uncertainRows) {
    assert.equal(row[col('libero_squadra')], '')
    const replaced = row[col('libero_squadra_al_posto_di')]
    assert.ok(![1, 2, 3, 4, 5, 6].some(p => row[col(`squadra_posto${p}`)] === replaced))
  }
})
