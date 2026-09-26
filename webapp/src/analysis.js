import { athleteStats } from './athletes.js'
import { receptionStats, servicePoints } from './reception.js'

export const sum = a => a.reduce((s, v) => s + v, 0)

/**
 * Calcola i punti vinti in battuta (Break Point) e i turni per ciascuna delle 6 colonne
 * della griglia dei set (6 righe x 6 colonne di turni servizio).
 */
function calculateGridPoints(grid) {
  const points = [0, 0, 0, 0, 0, 0]
  const turns = [0, 0, 0, 0, 0, 0]

  if (!Array.isArray(grid)) return { turns, points }

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const idx = r * 6 + c
      const val = grid[idx]

      if (val === '' || val === null || val === undefined) continue
      // 'X' nella prima casella indica che la squadra avversaria ha servito per prima nel set
      if (r === 0 && c === 0 && (val === 'X' || val === 'x')) continue

      let prevVal = 0
      if (idx > 0) {
        const prev = grid[idx - 1]
        prevVal = (prev === 'X' || prev === 'x' || prev === '' || prev == null) ? 0 : Number(prev)
      }

      const numVal = Number(val)
      if (!Number.isFinite(numVal)) continue

      const isFirstTurnOfMatch = (r === 0 && c === 0)
      // Se è il primo turno del set, tutti i punti sono di battuta.
      // Nei turni successivi, il primo punto è il cambio palla (sideout) ottenuto in ricezione,
      // quindi i punti break realizzati in battuta sono (progressivo attuale - progressivo precedente - 1).
      const pts = isFirstTurnOfMatch ? numVal : (numVal - prevVal - 1)

      if (pts >= 0) {
        turns[c] += 1
        points[c] += pts
      }
    }
  }

  return { turns, points }
}

/**
 * Motore di calcolo statistiche completamente nativo JavaScript (senza emulatore di formule Excel).
 * Calcola esattamente:
 * - Le 6 rotazioni (P1-P6): turni totali (TT), punti vinti (BP), media punti per turno, quota %,
 *   turni in ricezione (CP), punti subiti e media subita.
 * - Statistiche cambio palla (CP) e ricezione
 * - Atleti coinvolti, punti fatti, punti subiti, vittorie
 */
export function analyze(matches) {
  const rotTurns = [0, 0, 0, 0, 0, 0]
  const rotPoints = [0, 0, 0, 0, 0, 0]
  const rotConcededTurns = [0, 0, 0, 0, 0, 0]
  const rotConceded = [0, 0, 0, 0, 0, 0]

  for (const m of matches) {
    for (const s of (m.sets || []).slice(0, 5)) {
      const startRot = Number(s.rotation) || 1
      const ownRes = calculateGridPoints(s.own || [])
      const otherRes = calculateGridPoints(s.other || [])

      for (let c = 0; c < 6; c++) {
        // La rotazione P1..P6 per la colonna c in base alla rotazione iniziale startRot
        const rot = (startRot - c - 1 + 12) % 6 // indice 0..5 per P1..P6
        rotTurns[rot] += ownRes.turns[c]
        rotPoints[rot] += ownRes.points[c]
        rotConcededTurns[rot] += otherRes.turns[c]
        rotConceded[rot] += otherRes.points[c]
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
    opponentBreakPoints,
    scored: sum(matches.flatMap(m => m.sets.map(s => s.scoreOwn))),
    conceded: sum(matches.flatMap(m => m.sets.map(s => s.scoreOther))),
    wins: matches.filter(m => m.sets.filter(s => s.scoreOwn > s.scoreOther).length > m.sets.filter(s => s.scoreOther > s.scoreOwn).length).length,
  }
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
