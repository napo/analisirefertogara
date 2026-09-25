import source from './data/workbook.json' with { type: 'json' }
import { column, workbookEngine } from './formulas.js'
import { receptionStats, servicePoints } from './reception.js'
export const template = source.Gara_1
export const sum = a => a.reduce((s, v) => s + v, 0)
export function matchSheet(match) {
  const sheet = { ...template, A1: `${match.team} - ${match.opponent}`, D7: match.team, L7: match.opponent }
  match.sets.slice(0, 5).forEach((s, i) => {
    sheet[`B${8 + i * 12}`] = Number(s.rotation) || ''
    for (const [side, start] of [['own', 4], ['other', 12]]) {
      for (let j = 0; j < 36; j++) sheet[`${column(start + j % 6)}${9 + i * 12 + Math.floor(j / 6)}`] = s[side][j] ?? ''
    }
  })
  return sheet
}

function involvedNumbers(match) {
  const numbers = new Set()
  for (const set of match.sets || []) {
    for (const number of set.lineup || []) {
      if (number !== '' && number !== null && number !== undefined) numbers.add(String(number))
    }
    for (const entry of set.liberoReplacements || []) {
      numbers.add(String(entry.player))
      numbers.add(String(entry.libero))
    }
    for (const key of ['onCourt', 'entered', 'otherEntered']) {
      const list = Array.isArray(set.libero?.[key]) ? set.libero[key] : [set.libero?.[key]]
      for (const number of list) {
        if (number !== '' && number !== null && number !== undefined) numbers.add(String(number))
      }
    }
  }
  return numbers
}

export function analyze(matches) {
  const sheets = Object.fromEntries(matches.map((m, i) => [`Gara_${i + 1}`, matchSheet(m)]))
  for (let i = matches.length + 1; i <= 15; i++) sheets['Gara_' + i] = { ...template }
  const count = Math.max(1, matches.length)
  sheets.Totali = Object.fromEntries(Object.entries(source.Totali).map(([key, value]) => [key,
    typeof value === 'string' && value.startsWith('=') ? value.replace(/Gara_1!([A-Z]+\d+)(?:\+Gara_\d+![A-Z]+\d+){14}/g,
      (_, ref) => Array.from({ length: count }, (_, i) => `Gara_${i + 1}!${ref}`).join('+')) : value]))
  const engine = workbookEngine(sheets)
  const get = ref => engine.cell('Totali', ref)
  const rows = Array.from({ length: 6 }, (_, i) => ({
    rotation: i + 1, turns: get(`${column(2 + i)}7`), points: get(`${column(2 + i)}8`), mean: get(`${column(2 + i)}9`),
    share: get(`${column(2 + i)}10`), concededTurns: get(`${column(17 + i)}7`), conceded: get(`${column(17 + i)}8`), concededMean: get(`${column(17 + i)}9`),
  }))
  const athletesInvolved = new Set(matches.flatMap(match => [...involvedNumbers(match)]))
  const breakPoints = matches.reduce((total, match) => total + match.sets.reduce((sum, set) => sum + servicePoints(set.own), 0), 0)
  return { rows, engine, sheets, reception: receptionStats(matches), athletesInvolved: athletesInvolved.size, breakPoints, opponentBreakPoints: get('R5'),
    scored: sum(matches.flatMap(m => m.sets.map(s => s.scoreOwn))), conceded: sum(matches.flatMap(m => m.sets.map(s => s.scoreOther))),
    wins: matches.filter(m => m.sets.filter(s => s.scoreOwn > s.scoreOther).length > m.sets.filter(s => s.scoreOther > s.scoreOwn).length).length }
}
export function validateMatch(m, requireRotations = false) {
  const errors = []
  if (!m.team?.trim() || !m.opponent?.trim() || m.team === m.opponent) errors.push('Indica due squadre diverse.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date || '') || Number.isNaN(Date.parse(m.date))) errors.push('Data gara non valida.')
  if (!Array.isArray(m.sets) || !m.sets.length || m.sets.length > 6) return [...errors, 'Numero di set non valido (da 1 a 6 set).']
  m.sets.forEach((s, i) => {
    const prefix = i === 5 ? 'Set 6 (Golden Set)' : `Set ${i + 1}`
    if (requireRotations && !(Number.isInteger(+s.rotation) && +s.rotation >= 1 && +s.rotation <= 6)) errors.push(`${prefix}: scegli la posizione iniziale P.`)
    for (const [side, score] of [['own', s.scoreOwn], ['other', s.scoreOther]]) {
      if (!Number.isInteger(score) || score < 0) errors.push(`${prefix}: punteggio non valido.`)
      if (!Array.isArray(s[side]) || s[side].length > 36) { errors.push(`${prefix}: griglia turni non valida.`); continue }
      const cells = s[side], last = cells.findLastIndex(v => v !== '' && v !== null)
      if (last < 0) { errors.push(`${prefix}: turni mancanti.`); continue }
      for (let j = 0; j <= last; j++) {
        const v = cells[j]
        if (j === 0 && v === 'X') continue
        if (!Number.isInteger(v) || v < 0 || v > score) { errors.push(`${prefix}: controlla il turno ${j + 1} (${side === 'own' ? m.team : m.opponent}).`); break }
        if (j > 0 && v <= (cells[j - 1] === 'X' ? 0 : cells[j - 1])) { errors.push(`${prefix}: i progressivi devono crescere.`); break }
      }
      if (cells[last] !== score) errors.push(`${prefix}: ultimo progressivo diverso dal punteggio finale (${side === 'own' ? m.team : m.opponent}).`)
    }
    if (s.scoreOwn === s.scoreOther || Math.max(s.scoreOwn, s.scoreOther) < (i >= 4 ? 15 : 25) || Math.abs(s.scoreOwn - s.scoreOther) < 2) errors.push(`${prefix}: risultato non concluso.`)
  })
  return [...new Set(errors)]
}
