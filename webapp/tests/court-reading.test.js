import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parseItems } from '../src/pdf-parser.js'
import { matchRallyStates } from '../src/rally-state.js'
import { configurationsReading } from '../src/court-reading.js'

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
    for (const sentences of [configurationsReading(states, { team: m.team, phase })]) {
      assert.ok(sentences.length >= 3)
      for (const sentence of sentences) {
        assert.ok(!JUDGEMENT.test(sentence.replace('non indicano la causa del risultato né una combinazione migliore di un’altra', '')), sentence)
        // a percentage is always next to counts ("x su n" or "n rally")
        if (/\d%/.test(sentence)) assert.match(sentence, /\d+ (vint[oi] )?su \d+|\d+ rally/, sentence)
      }
    }
  }
})

test('readings: few rallies, Italian articles', () => {
  const m = match()
  // a single set: few rallies per configuration, no comparison
  const first = matchRallyStates(m).filter(s => s.set === 1).slice(0, 12)
  const configs = configurationsReading(first, { team: 'A' })
  assert.ok(configs.some(s => /non vengono confrontate/.test(s)))
  assert.ok(configs.every(s => !/ dei (8|11|8\d) rally/.test(s)))
})
