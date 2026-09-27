// Builds a match from the OCR readings of a TieBreakTech scoresheet (tbt-reader.js). Every numeric cell has
// several candidate readings: the values are chosen so that the scoresheet rules hold (service-turn
// progressions strictly increasing and ending with the set points, jersey numbers present in the rosters,
// libero exchanges made of a player and the liberos of the team). Every correction becomes an import warning.
import { emptySubstitutions, emptyTimeouts, liberoFields } from './pdf-parser.js'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
// Digits the OCR engine confuses with each other on this print
const CONFUSION = { 0: '869', 1: '74', 2: '73', 3: '8592', 4: '19', 5: '6389', 6: '5809', 7: '12', 8: '36905', 9: '8305' }
const UNREADABLE = 8

const texts = cell => (!cell || cell.empty ? [] : (cell.candidates || []).map(c => c.text))
const topNumber = cell => {
  const text = texts(cell).find(t => /^\d+$/.test(t))
  return text === undefined ? '' : Number(text)
}

// Cost of reading `value` in a cell whose OCR candidates are `readings` (best first)
export function valueCost(readings, value) {
  const target = String(value)
  let best = UNREADABLE
  readings.forEach((text, rank) => {
    if (!/^\d+$/.test(text)) return
    if (Number(text) === value) best = Math.min(best, rank === 0 ? 0 : 1)
    else if (text.length === target.length) {
      const diff = [...target].map((digit, i) => (digit === text[i] ? -1 : i)).filter(i => i >= 0)
      if (diff.length === 1 && CONFUSION[text[diff[0]]].includes(target[diff[0]])) best = Math.min(best, 3)
    } else if (target.includes(text) || text.includes(target)) best = Math.min(best, 4) // digit lost or added
  })
  return best
}

// Strictly increasing sequence of values in [0, max] (last = `last` when given), one per cell, of minimum
// total cost. cells: arrays of readings. Returns { values, costs } or null.
export function chooseIncreasing(cells, { max, last = null }) {
  const n = cells.length
  if (!n) return { values: [], costs: [] }
  const costs = cells.map(readings => Array.from({ length: max + 1 }, (_, v) => valueCost(readings, v)))
  const dp = costs.map(() => Array(max + 1).fill(Infinity)), from = costs.map(() => Array(max + 1).fill(-1))
  for (let v = 0; v <= max; v++) dp[0][v] = costs[0][v]
  for (let i = 1; i < n; i++) {
    let best = Infinity, arg = -1
    for (let v = 0; v <= max; v++) {
      if (v > 0 && dp[i - 1][v - 1] < best) { best = dp[i - 1][v - 1]; arg = v - 1 }
      if (arg >= 0) { dp[i][v] = best + costs[i][v]; from[i][v] = arg }
    }
  }
  let end = last ?? dp[n - 1].indexOf(Math.min(...dp[n - 1]))
  if (end > max || !Number.isFinite(dp[n - 1][end])) return null
  const values = Array(n)
  for (let i = n - 1; i >= 0; i--) { values[i] = end; end = from[i][end] }
  return { values, costs: values.map((v, i) => costs[i][v]) }
}

// Winner of a set reaches 25 (15 in the fifth set) with two points of margin
const validScore = (a, b, set) => {
  const target = set === 5 ? 15 : 25, high = Math.max(a, b), low = Math.min(a, b)
  return high >= target && high - low >= 2 && (high === target || high - low === 2)
}

// "a-b-c" of the libero page: the player who leaves, then the liberos who enter in turn. Each reading
// (text, votes: how many OCR variants gave it) is split so that every number belongs to the team, the
// printed dashes breaking ties; the split supported by most votes wins.
// width: { extent, digit, dash } (px) when known: splits whose printed length does not match the width of
// the text lose (a lost or doubled digit such as "2-7-11" for "27-7-11").
export function decodeLiberoEntry(readings, players, liberos, width = null) {
  const splits = new Map()
  for (const [rank, reading] of readings.entries()) {
    const { text, votes = 1 } = typeof reading === 'string' ? { text: reading } : reading
    const digits = text.replace(/\D/g, '')
    const dashes = new Set()
    let count = 0
    for (const char of text) { if (char === '-') dashes.add(count); else if (/\d/.test(char)) count++ }
    let best = null
    // completed: the first digit of the player was lost ("7-11" for "27-11"), a weaker hypothesis
    const search = (at, tokens, completed) => {
      if (at === digits.length) {
        if (tokens.length < 2) return
        let agree = 0, boundary = completed ? -1 : 0
        for (const token of tokens.slice(0, -1)) { boundary += String(token).length; if (dashes.has(boundary)) agree++ }
        const score = agree - (tokens.length - 1 - agree) * 2
        if (!best || score > best.score) best = { tokens, score, completed }
        return
      }
      for (const size of [1, 2]) {
        const piece = digits.slice(at, at + size)
        if (piece.length !== size || (size === 2 && piece[0] === '0')) continue
        const number = Number(piece)
        if (tokens.length === 0) {
          if (players.includes(number)) search(at + size, [number], false)
          else if (size === 1) for (const player of players.filter(n => n >= 10 && String(n).endsWith(piece))) search(at + size, [player], true)
        } else if (liberos.includes(number) && number !== tokens.at(-1)) search(at + size, [...tokens, number], completed)
      }
    }
    search(0, [], false)
    if (!best) continue
    const key = best.tokens.join('-')
    const entry = splits.get(key) || { tokens: best.tokens, support: 0, agree: -Infinity, rank, text }
    entry.support += best.completed ? votes / 2 : votes
    entry.agree = Math.max(entry.agree, best.score)
    splits.set(key, entry)
  }
  // mismatch between the printed length of a split and the width of the text, in digits
  const mismatch = entry => {
    if (!width?.extent || !width.digit) return 0
    const key = entry.tokens.join('-'), digits = key.replace(/-/g, '').length
    return Math.abs(width.extent - digits * width.digit - (key.length - digits) * width.dash) / width.digit
  }
  for (const entry of splits.values()) entry.fit = entry.support - 3 * mismatch(entry)
  const best = [...splits.values()].sort((x, y) => y.fit - x.fit || y.agree - x.agree || x.rank - y.rank)[0]
  // a split much shorter or longer than the text lost or invented numbers: not imported
  return best && mismatch(best) <= 1.2 ? best : null
}

// Width of a digit and of a dash on the libero page, fitted (least squares) on the rows read with near
// unanimity: extent ≈ digits·digit + dashes·dash
function printWidths(rows) {
  let dd = 0, dh = 0, hh = 0, de = 0, he = 0
  for (const { key, extent } of rows) {
    const d = key.replace(/-/g, '').length, h = key.length - d
    dd += d * d; dh += d * h; hh += h * h; de += d * extent; he += h * extent
  }
  const det = dd * hh - dh * dh
  if (rows.length < 3 || Math.abs(det) < 1e-9) return null
  const digit = (de * hh - he * dh) / det, dash = (dd * he - dh * de) / det
  return digit > 0 && dash > 0 ? { digit, dash } : null
}

export function parseTbt({ page1, page2 = null }) {
  const warnings = [{
    set: null, team: '', expected: '', found: '', zone: 'Intero referto',
    message: 'Referto TieBreakTech letto con il riconoscimento ottico dei caratteri (OCR): controlla i dati importati.',
  }]
  const warn = (set, team, expected, found, zone, message) => warnings.push({ set, team, expected, found, zone, message })

  // Team names: page 2 has them in full, page 1 only the abbreviations of the result table
  const resultLetters = fillLetters(page1.result.letters)
  const abbreviation = letter => page1.result.abbreviations[resultLetters.indexOf(letter)]?.text || ''
  const names = {
    A: cleanName(page2?.teams?.A?.text) || abbreviation('A') || 'Squadra A',
    B: cleanName(page2?.teams?.B?.text) || abbreviation('B') || 'Squadra B',
  }

  // Final result: the pair of readings that is a valid set score
  const scores = []
  for (const [index, row] of page1.result.rows.entries()) {
    if (row.left.empty || row.right.empty) break
    const pairs = []
    texts(row.left).forEach((l, i) => texts(row.right).forEach((r, j) => {
      if (/^\d+$/.test(l) && /^\d+$/.test(r)) pairs.push({ left: Number(l), right: Number(r), cost: i + j - (validScore(Number(l), Number(r), index + 1) ? 10 : 0) })
    }))
    if (!pairs.length) break
    const { left, right, cost } = pairs.sort((a, b) => a.cost - b.cost)[0]
    if (cost >= 0) warn(index + 1, '', 'punteggio valido', `${left}-${right}`, `Risultato finale · set ${index + 1}`, 'Punteggio del set non regolare: verificalo.')
    const [a, b] = resultLetters[0] === 'A' ? [left, right] : [right, left]
    scores.push({ A: a, B: b, durationMinutes: topNumber(row.minutes) })
  }
  if (!scores.length) throw Error('Referto TieBreakTech: risultato finale non leggibile.')

  // Rosters: the column of each team is the one containing its starting players
  const lineupReadings = { A: new Set(), B: new Set() }
  for (const set of page1.sets.filter(s => s.played)) {
    const letters = fillLetters(set.letters, set.set)
    set.sides.forEach((side, i) => side.lineup.forEach(cell => { const n = topNumber(cell); if (n !== '') lineupReadings[letters[i]].add(n) }))
  }
  const columnScore = (column, letter) => page1.roster.teams[column].filter(p => texts(p.number).some(t => lineupReadings[letter].has(Number(t)))).length
  const rosterLetters = page1.roster.letters.every(Boolean) && page1.roster.letters[0] !== page1.roster.letters[1]
    ? page1.roster.letters
    : columnScore(0, 'A') + columnScore(1, 'B') >= columnScore(0, 'B') + columnScore(1, 'A') ? ['A', 'B'] : ['B', 'A']
  const rosters = {}
  for (const [column, letter] of rosterLetters.entries()) rosters[letter] = readRoster(page1.roster.teams[column], letter, page2?.liberos?.[letter], names[letter], warn)
  const playersOf = letter => rosters[letter].map(p => p.number)
  const liberosOf = letter => rosters[letter].filter(p => p.libero).map(p => p.number)

  // Libero page: entries { candidates, extent }; print widths from the rows read with near unanimity
  const entryOf = entry => (Array.isArray(entry) ? { candidates: entry, extent: 0 } : entry)
  const strongRows = []
  for (const [index, columns] of (page2?.sets || []).entries()) {
    const panel = page1.sets[index]
    if (!panel?.played) continue
    const columnLetters = fillLetters(columns.map(c => c.letter), panel.set, fillLetters(panel.letters, panel.set))
    columns.forEach((column, c) => {
      const letter = columnLetters[c]
      const players = playersOf(letter).filter(n => !liberosOf(letter).includes(n))
      for (const { candidates, extent } of column.entries.map(entryOf)) {
        const decoded = extent && decodeLiberoEntry(candidates, players, liberosOf(letter))
        const votes = candidates.reduce((total, r) => total + (r.votes || 1), 0)
        if (decoded && decoded.support >= votes * 0.8) strongRows.push({ key: decoded.tokens.join('-'), extent })
      }
    })
  }
  const widths = printWidths(strongRows)

  // Sets
  const sets = []
  for (const [index, score] of scores.entries()) {
    const panel = page1.sets[index]
    if (!panel?.played) { warn(index + 1, '', 'set compilato', 'set vuoto', `Set ${index + 1}`, 'Set presente nel risultato ma non nel referto.'); continue }
    const letters = fillLetters(panel.letters, panel.set)
    const sides = { [letters[0]]: panel.sides[0], [letters[1]]: panel.sides[1] }
    if (panel.courtChange) {
      const letter = panel.courtChange.letter || letters[0]
      sides[letter] = mergeCourtChange(sides[letter], panel.courtChange.side, (what, kept, found) =>
        warn(5, names[letter], kept, found, `Set 5 · CAMBIO CAMPO · ${what}`, 'Valore diverso nella copia dopo il cambio campo: tenuto quello del riquadro principale.'))
    }
    const team = {}
    for (const letter of ['A', 'B']) {
      team[letter] = readTeamSet(sides[letter], {
        set: index + 1, team: names[letter], final: score[letter], other: score[letter === 'A' ? 'B' : 'A'],
        players: playersOf(letter).filter(n => !liberosOf(letter).includes(n)), warn,
      })
    }
    if ((team.A.turns[0] === 'X') === (team.B.turns[0] === 'X')) {
      warn(index + 1, '', 'una sola squadra al servizio per prima (una sola "X")', team.A.turns[0] === 'X' ? 'due X' : 'nessuna X',
        `Set ${index + 1} · prima casella dei turni`, 'Squadra al servizio a inizio set non determinabile.')
    }
    const liberos = { A: [], B: [] }
    const columns = (page2?.sets?.[index] || []).map(column => ({ ...column, entries: column.entries.map(entryOf) }))
    const columnLetters = fillLetters(columns.map(c => c.letter), panel.set, letters)
    columns.forEach((column, c) => {
      const letter = columnLetters[c]
      // the player replaced by a libero is on court in this set: a starter or a substitute who entered
      const onCourt = [...team[letter].lineup, ...team[letter].substitutions.map(sub => sub.in)].filter(Boolean).map(Number)
      const players = (onCourt.length ? onCourt : playersOf(letter)).filter(n => !liberosOf(letter).includes(n))
      column.entries.forEach(({ candidates: readings, extent }, row) => {
        const decoded = decodeLiberoEntry(readings, players, liberosOf(letter), widths && { extent, ...widths })
        if (!decoded) {
          warn(index + 1, names[letter], 'giocatore-libero', readings[0]?.text || '', `Referto aggiuntivo · set ${index + 1} · riga ${row + 1}`,
            'Ingresso del libero non leggibile: non importato.')
          return
        }
        if (decoded.text !== readings[0].text) {
          warn(index + 1, names[letter], decoded.tokens.join('-'), readings[0].text, `Referto aggiuntivo · set ${index + 1} · riga ${row + 1}`, 'Lettura corretta con i numeri dei liberi.')
        }
        const raw = decoded.tokens.join('-')
        for (let step = 1; step < decoded.tokens.length; step++) {
          const player = decoded.tokens[step - 1], libero = decoded.tokens[step]
          liberos[letter].push({ row: row + 1, section: 0, step, raw, player, libero, isLiberoChange: liberosOf(letter).includes(player) && liberosOf(letter).includes(libero) })
        }
      })
    })
    sets.push({
      number: index + 1,
      rotation: '',
      own: team.A.turns,
      other: team.B.turns,
      substituteNumbers: team.A.substitutions.map(s => s.in).filter(Boolean),
      opponentSubstituteNumbers: team.B.substitutions.map(s => s.in).filter(Boolean),
      substitutions: team.A.substitutions,
      opponentSubstitutions: team.B.substitutions,
      timeouts: team.A.timeouts,
      opponentTimeouts: team.B.timeouts,
      lineup: team.A.lineup,
      opponentLineup: team.B.lineup,
      libero: liberoFields(liberos.A),
      opponentLibero: liberoFields(liberos.B),
      liberoReplacements: liberos.A,
      opponentLiberoReplacements: liberos.B,
      scoreOwn: score.A,
      scoreOther: score.B,
      durationMinutes: score.durationMinutes,
    })
  }

  const header = page1.header
  const date = [header.year?.text, header.month?.text, header.day?.text]
  const rosterOut = letter => rosters[letter].map(p => ({ number: p.number, name: p.libero ? `${p.name} - ${p.libero}` : p.name }))
  return {
    parserVersion: 1,
    sourceFormat: 'TBT',
    progressionsImported: true,
    durationMinutes: scores.reduce((total, s) => total + (Number(s.durationMinutes) || 0), 0),
    championship: header.competition?.text || '',
    event: '',
    gender: header.gender || '',
    team: names.A,
    opponent: names.B,
    date: date.every(part => /^\d+$/.test(part || '')) ? `${date[0]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}` : '',
    location: capitalize(header.city?.text),
    venue: header.venue?.text || '',
    number: header.number?.text || '',
    sets,
    referees: { first: '', firstCity: '', second: '', scorer: '', scorerCity: '' },
    notes: '',
    roster: rosterOut('A'),
    opponentRoster: rosterOut('B'),
    importWarnings: warnings,
  }
}

const capitalize = text => (text || '').toLocaleLowerCase('it-IT').replace(/(^|\s)\S/g, value => value.toUpperCase())
const cleanName = text => (text || '').replace(/[^\p{L}\d '.-]/gu, ' ').replace(/\s+/g, ' ').trim()

// Circled letters of a pair of columns: one missing is the other one; both missing: A on the left in the
// odd sets (the teams change side every set), or the letters of the matching page 1 panel
function fillLetters(letters, set = 1, fallback = null) {
  const [left, right] = letters
  const other = letter => (letter === 'A' ? 'B' : 'A')
  if (left && right && left !== right) return [left, right]
  if (left) return [left, other(left)]
  if (right) return [other(right), right]
  return fallback || (set % 2 ? ['A', 'B'] : ['B', 'A'])
}

// Fifth set: the team that changes court continues its panel in the "cambio campo" box (same cells)
function mergeCourtChange(main, extra, onConflict) {
  const pick = (a, b, what) => {
    if (!b || b.empty || (b.value === null && !b.candidates)) return a
    if (!a || a.empty) return b
    const va = a.value ?? texts(a)[0], vb = b.value ?? texts(b)[0]
    if (va !== vb && what) onConflict(what, va, vb)
    return a
  }
  return {
    ...main,
    entrants: main.entrants.map((cell, i) => pick(cell, extra.entrants[i], `riserva pos. ${ROMAN[i]}`)),
    scoreIn: main.scoreIn.map((cell, i) => pick(cell, extra.scoreIn[i], `punteggio di entrata pos. ${ROMAN[i]}`)),
    scoreOut: main.scoreOut.map((cell, i) => pick(cell, extra.scoreOut[i], `punteggio di uscita pos. ${ROMAN[i]}`)),
    timeouts: main.timeouts.map((cell, i) => pick(cell, extra.timeouts[i], `time-out ${i + 1}`)),
    turns: main.turns.map((cell, i) => pick(cell, extra.turns[i], null)),
  }
}

function readRoster(entries, letter, page2Liberos, teamName, warn) {
  const players = entries.filter(p => !p.libero)
  const chosen = chooseIncreasing(players.map(p => texts(p.number)), { max: 99 })
  const roster = players.map((p, i) => {
    const number = chosen ? chosen.values[i] : topNumber(p.number)
    if (chosen && chosen.costs[i] > 0) {
      warn(null, teamName, number, texts(p.number)[0] ?? '', `Elenco atleti · squadra ${letter} · riga ${i + 1}`, 'Numero di maglia corretto con l\'ordine crescente dell\'elenco.')
    }
    return { number, name: cleanName(p.name.text) }
  })
  for (const p of entries.filter(e => e.libero)) {
    const role = Number(p.libero.slice(1)) - 1
    const fromPage2 = page2Liberos?.[role]
    const page2Number = fromPage2?.number?.find(c => /^\d{1,2}$/.test(c.text))?.text
    const number = page2Number !== undefined ? Number(page2Number) : topNumber(p.number)
    if (number === '' || roster.some(r => r.number === number)) continue
    const name = cleanName(p.name.text) || cleanName(fromPage2?.name?.text)
    roster.push({ number, name: cleanName(fromPage2?.name?.text) || name, libero: p.libero })
  }
  return roster
}

function readTeamSet(side, { set, team, final, other, players, warn }) {
  const zone = `Set ${set} · ${team}`
  // Service turns
  const turns = Array(36).fill('')
  const filled = side.turns.map((cell, i) => (cell && !cell.empty ? i : -1)).filter(i => i >= 0)
  let cells = filled
  if (filled[0] === 0 && texts(side.turns[0]).includes('X')) { turns[0] = 'X'; cells = filled.slice(1) }
  const last = filled.at(-1)
  for (let i = 0; i < (last ?? -1); i++) {
    if (!filled.includes(i)) warn(set, team, 'turno compilato', 'casella vuota', `${zone} · turni, giro ${Math.floor(i / 6) + 1} pos. ${ROMAN[i % 6]}`, 'Casella vuota in mezzo alla sequenza dei turni.')
  }
  const readings = cells.map(i => texts(side.turns[i]).filter(t => t !== 'X'))
  const chosen = chooseIncreasing(readings, { max: final, last: final })
  if (!chosen && cells.length) {
    warn(set, team, final, readings.at(-1)?.[0] ?? '', `${zone} · turni`, 'Progressivi dei turni non ricostruibili: controlla il set.')
  }
  cells.forEach((cell, k) => {
    const value = chosen ? chosen.values[k] : topNumber(side.turns[cell])
    turns[cell] = value
    const read = readings[k][0] ?? ''
    if (chosen && String(value) !== read) {
      warn(set, team, value, read || 'illeggibile', `${zone} · turni, giro ${Math.floor(cell / 6) + 1} pos. ${ROMAN[cell % 6]}`,
        chosen.costs[k] >= UNREADABLE ? 'Valore illeggibile: ricavato dalla sequenza dei turni.' : 'Lettura corretta con la sequenza dei turni e il punteggio finale.')
    }
  })

  // Starting players and substitutes: jersey numbers of the roster
  const used = new Set()
  const jersey = (cell, what) => {
    const list = texts(cell).filter(t => /^\d+$/.test(t)).map(Number)
    const number = list.find(n => players.includes(n) && !used.has(n)) ?? list[0]
    if (number === undefined) {
      if (!cell?.empty) warn(set, team, 'numero di maglia', 'illeggibile', `${zone} · ${what}`, 'Numero non leggibile: non importato.')
      return ''
    }
    if (!players.includes(number)) warn(set, team, 'numero dell\'elenco atleti', number, `${zone} · ${what}`, 'Numero non presente nell\'elenco atleti.')
    used.add(number)
    return String(number)
  }
  const lineup = side.lineup.map((cell, i) => jersey(cell, `titolare pos. ${ROMAN[i]}`))
  const pair = (cell, what, max) => {
    if (!cell || cell.empty) return ''
    if (!cell.value) { warn(set, team, 'punteggio a:b', 'illeggibile', `${zone} · ${what}`, 'Punteggio non leggibile: non importato.'); return '' }
    const [a, b] = cell.value.split(':').map(Number)
    if (a > max[0] || b > max[1]) warn(set, team, `≤ ${max[0]}:${max[1]}`, cell.value, `${zone} · ${what}`, 'Punteggio oltre il risultato del set.')
    return cell.value
  }
  const substitutions = emptySubstitutions().map((empty, i) => ({
    in: side.entrants[i]?.empty ? '' : jersey(side.entrants[i], `sostituzione pos. ${ROMAN[i]}`),
    scoreIn: pair(side.scoreIn[i], `punteggio di entrata pos. ${ROMAN[i]}`, [final, other]),
    scoreOut: pair(side.scoreOut[i], `punteggio di uscita pos. ${ROMAN[i]}`, [final, other]),
  }))
  const timeouts = emptyTimeouts().map((empty, i) => pair(side.timeouts[i], `time-out ${i + 1}`, [final, other]))
  return { turns, lineup, substitutions, timeouts }
}
