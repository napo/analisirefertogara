import { matchStates } from './rally-state.js'
import { athleteStats } from './athletes.js'
import { receptionStats, servicePoints } from './reception.js'

export const sum = a => a.reduce((s, v) => s + v, 0)

export function analyze(matches) {
  const rotTurns = [0, 0, 0, 0, 0, 0]
  const rotPoints = [0, 0, 0, 0, 0, 0]
  const rotConcededTurns = [0, 0, 0, 0, 0, 0]
  const rotConceded = [0, 0, 0, 0, 0, 0]

  let excludedRallies = 0
  let excludedBreakPoints = 0
  let excludedConceded = 0
  for (const match of matches) {
    for (const { states } of matchStates(match)) {
      // Split a service turn only when the effective P changes. Each contiguous portion is one
      // observed turn segment, so points and denominators always refer to the same configuration.
      let previous = null
      for (const state of states) {
        const P = state.teams.own.P
        const key = `${state.servingTeam}:${state.cell}:${P}`
        if (P === null) {
          excludedRallies++
          if (state.phase === 'BP' && state.winner === 'own') excludedBreakPoints++
          if (state.phase === 'CP' && state.winner === 'other') excludedConceded++
        } else {
          const i = P - 1
          if (state.phase === 'BP') {
            if (key !== previous) rotTurns[i]++
            if (state.winner === 'own') rotPoints[i]++
          } else {
            if (key !== previous) rotConcededTurns[i]++
            if (state.winner === 'other') rotConceded[i]++
          }
        }
        previous = key
      }
    }
  }

  const totalBreakPoints = sum(rotPoints)
  const opponentBreakPoints = sum(rotConceded)

  const rows = Array.from({ length: 6 }, (_, i) => {
    const turns = rotTurns[i]
    const points = rotPoints[i]
    const concededTurns = rotConcededTurns[i]
    const conceded = rotConceded[i]
    return {
      rotation: i + 1,
      turns,
      points,
      mean: turns === 0 ? 0 : points / turns,
      share: totalBreakPoints === 0 ? 0 : (points / totalBreakPoints) * 100,
      concededTurns,
      conceded,
      concededMean: concededTurns === 0 ? 0 : conceded / concededTurns,
    }
  })

  const athletesInvolved = athleteStats(matches).filter(player => player.entered).length
  const breakPoints = matches.reduce((total, match) => total + match.sets.reduce((acc, set) => acc + servicePoints(set.own), 0), 0)

  return {
    rows,
    reception: receptionStats(matches),
    athletesInvolved,
    breakPoints,
    opponentBreakPoints: opponentBreakPoints + excludedConceded,
    excludedRallies,
    excludedBreakPoints,
    excludedConceded,
    scored: sum(matches.flatMap(m => m.sets.map(s => s.scoreOwn))),
    conceded: sum(matches.flatMap(m => m.sets.map(s => s.scoreOther))),
    wins: matches.filter(m => m.sets.filter(s => s.scoreOwn > s.scoreOther).length > m.sets.filter(s => s.scoreOther > s.scoreOwn).length).length,
  }
}

// Jersey numbers repeated within one team's starting lineup (I–VI)
export function duplicateLineupNumbers(lineup) {
  const seen = new Set(), duplicates = new Set()
  for (const value of lineup || []) {
    const text = String(value ?? '').trim()
    if (!/^\d+$/.test(text)) continue
    const number = String(Number(text))
    if (seen.has(number)) duplicates.add(number)
    seen.add(number)
  }
  return duplicates
}

// "12:16" -> [12, 16]; null when malformed
const scorePair = text => {
  const match = String(text ?? '').match(/^\s*(\d+)\s*:\s*(\d+)\s*$/)
  return match ? [Number(match[1]), Number(match[2])] : null
}

// Substitutions and time-outs of one team in one set. Scores are written like the scoresheet box:
// points of that team first. Returns readable errors.
function substitutionIssues(prefix, team, { lineup, substitutions, timeouts, own, other }) {
  const errors = []
  const fits = pair => pair[0] <= own && pair[1] <= other
  ;(substitutions || []).forEach((cell, column) => {
    if (!cell) return
    const position = ['I', 'II', 'III', 'IV', 'V', 'VI'][column]
    const scores = [['scoreIn', 'entrata'], ['scoreOut', 'rientro']].map(([field, label]) => {
      if (!String(cell[field] ?? '').trim()) return null
      const pair = scorePair(cell[field])
      if (!pair) errors.push(`${prefix}: punteggio di ${label} non valido in posizione ${position} (${team}), usa il formato 12:16.`)
      else if (!fits(pair)) errors.push(`${prefix}: punteggio di ${label} ${cell[field]} oltre il risultato del set in posizione ${position} (${team}).`)
      return pair
    })
    if ((scores[0] || scores[1]) && !String(cell.in ?? '').trim()) errors.push(`${prefix}: indica il numero della riserva entrata in posizione ${position} (${team}).`)
    if (scores[1] && !scores[0]) errors.push(`${prefix}: rientro senza punteggio di entrata in posizione ${position} (${team}).`)
    if (scores[0] && scores[1] && (scores[1][0] < scores[0][0] || scores[1][1] < scores[0][1])) errors.push(`${prefix}: il rientro in posizione ${position} precede l'entrata (${team}).`)
    const number = String(cell.in ?? '').trim()
    if (number && (lineup || []).some(starter => String(starter).trim() !== '' && Number(starter) === Number(number))) {
      errors.push(`${prefix}: il numero ${number} è tra i titolari e non può entrare come riserva in posizione ${position} (${team}).`)
    }
  })
  ;(timeouts || []).forEach((value, i) => {
    if (!String(value ?? '').trim()) return
    const pair = scorePair(value)
    if (!pair) errors.push(`${prefix}: punteggio del ${i + 1}° time-out non valido (${team}), usa il formato 12:16.`)
    else if (!fits(pair)) errors.push(`${prefix}: ${i + 1}° time-out ${value} oltre il risultato del set (${team}).`)
  })
  return errors
}

// strict: lineup, substitution and time-out checks. Disabled when restoring backups, so matches saved
// before these checks existed still load.
export function validateMatch(m, { strict = true } = {}) {
  const errors = []
  if (!m.team?.trim() || !m.opponent?.trim() || m.team === m.opponent) errors.push('Indica due squadre diverse.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date || '') || Number.isNaN(Date.parse(m.date))) errors.push('Data gara non valida.')
  if (!Array.isArray(m.sets) || !m.sets.length || m.sets.length > 6) return [...errors, 'Numero di set non valido (da 1 a 6 set).']
  m.sets.forEach((s, i) => {
    const prefix = i === 5 ? 'Set 6 (Golden Set)' : `Set ${i + 1}`
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
    for (const [key, team] of strict ? [['lineup', m.team], ['opponentLineup', m.opponent]] : []) {
      for (const number of duplicateLineupNumbers(s[key])) errors.push(`${prefix}: il numero ${number} è ripetuto tra i titolari (${team}).`)
    }
    if (strict) {
      errors.push(...substitutionIssues(prefix, m.team || 'squadra analizzata', { lineup: s.lineup, substitutions: s.substitutions, timeouts: s.timeouts, own: s.scoreOwn, other: s.scoreOther }))
      errors.push(...substitutionIssues(prefix, m.opponent || 'squadra avversaria', { lineup: s.opponentLineup, substitutions: s.opponentSubstitutions, timeouts: s.opponentTimeouts, own: s.scoreOther, other: s.scoreOwn }))
    }
    if (s.scoreOwn === s.scoreOther || Math.max(s.scoreOwn, s.scoreOther) < (i >= 4 ? 15 : 25) || Math.abs(s.scoreOwn - s.scoreOther) < 2) errors.push(`${prefix}: risultato non concluso.`)
  })
  return [...new Set(errors)]
}
