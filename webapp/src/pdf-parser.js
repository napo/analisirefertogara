// Scoresheet software whose PDF format can be imported; add new importers here
export const SUPPORTED_SOFTWARE = ['NEWBIT', 'SNUG', 'TieBreakTech']

// "NEWBIT e SNUG", "NEWBIT, SNUG e X" ("o" instead of "e" with type 'disjunction')
export const supportedSoftwareList = (type = 'conjunction') =>
  new Intl.ListFormat('it', { style: 'long', type }).format(SUPPORTED_SOFTWARE)

// Substitutions are stored per position I–VI, as on the scoresheet: who entered for the starter of that
// position and the score when they entered / when the starter came back. Time-outs: up to two per set.
// Scores are written like the scoresheet box: points of the team owning the box first ("15:11").
export const emptySubstitutions = () => Array.from({ length: 6 }, () => ({ in: '', scoreIn: '', scoreOut: '' }))
export const emptyTimeouts = () => ['', '']
export const normalizeScore = text => {
  const match = String(text ?? '').match(/^\s*(\d+)\s*[:\s.-]\s*(\d+)\s*$/)
  return match ? `${Number(match[1])}:${Number(match[2])}` : ''
}
// Merge the fifth-set court-change copy into the main panel: same value = same event, empty = new
// event, different value = conflict (kept as in the main panel and reported through onConflict).
function mergeCourtChange(main, extra, onConflict) {
  const merged = main.map(value => (typeof value === 'object' ? { ...value } : value))
  extra.forEach((value, index) => {
    if (typeof value === 'object') {
      for (const field of Object.keys(value)) {
        if (!value[field]) continue
        if (!merged[index][field]) merged[index][field] = value[field]
        else if (merged[index][field] !== value[field]) onConflict(index, field, merged[index][field], value[field])
      }
    } else if (value) {
      if (!merged[index]) merged[index] = value
      else if (merged[index] !== value) onConflict(index, null, merged[index], value)
    }
  })
  return merged
}

// Free text of the "OSSERVAZIONI" box, line by line (words on the same baseline joined by spaces).
// SNUG redraws text repeatedly: identical lines are kept once.
function readNotes(words, { xMin, xMax, yMin, yMax }) {
  const lines = []
  for (const word of words
    .filter(w => w.x >= xMin && w.x < xMax && w.y > yMin && w.y < yMax && !/^OSSERVAZIONI$/i.test(w.text))
    .sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find(entry => Math.abs(entry.y - word.y) <= 2)
    if (line) line.words.push(word)
    else lines.push({ y: word.y, words: [word] })
  }
  return [...new Set(lines.map(line => line.words.sort((a, b) => a.x - b.x).map(w => w.text).join(' ').replace(/\s+/g, ' ').trim()))]
    .filter(Boolean)
    .join('\n')
}

function cleanJerseyNumber(text) {
  if (!text) return null
  const code = String(text).charCodeAt(0)
  if (code >= 0x2460 && code <= 0x2473) return code - 0x2460 + 1
  if (code >= 0x24ea && code <= 0x24ff) return code - 0x24ea
  const digits = String(text).replace(/[^0-9]/g, '')
  if (digits && digits.length <= 2) return Number(digits)
  return null
}

export const emptyLibero = () => ({
  onCourt: Array(6).fill(''),
  entered: Array(6).fill(''),
  otherEntered: Array(6).fill(''),
})

export const liberoFields = replacements => {
  const fields = emptyLibero()
  for (const entry of replacements || []) {
    const row = entry.row - 1
    if (row < 0 || row >= 6) continue
    if (entry.step === 1) {
      fields.onCourt[row] = String(entry.player)
      fields.entered[row] = String(entry.libero)
    } else {
      fields.otherEntered[row] = String(entry.libero)
    }
  }
  return fields
}

// SNUG electronic scoresheet, reference geometry normalized to A3 landscape.
// Values are located by geometry AND font size to exclude printed turn counters.
// options.debug: attach intermediate structures (e.g. the reconstructed fifth set) as match.debug
export function parseItems(items, width, height, operatorList = null, options = {}) {
  const sx = 1190.55 / width, sy = 841.89 / height

  const words = items
    .filter(t => t.str?.trim())
    .map(t => ({
      text: t.str.trim(),
      x: t.transform[4] * sx,
      y: (height - t.transform[5]) * sy,
      size: Math.abs(t.transform[0]) * sx,
    }))

  const pick = (x, y, dx = 3, dy = 2, size = null) =>
    words.filter(
      w =>
        Math.abs(w.x - x) <= dx &&
        Math.abs(w.y - y) <= dy &&
        (size === null || Math.abs(w.size - size) < 0.2),
    )

  const textAt = (x, y, dx = 3) =>
    pick(x, y, dx)
      .sort((a, b) => a.x - b.x)
      .map(v => v.text)
      .join(' ')

  // FIPAV grid printed by NEWBIT; older exports (e.g. 2022, iText) lack the NEWBIT footer but carry the
  // "GaraConCambioCampo=" field and use the same layout
  if (words.some(w => /NEWBIT|Referto Elettronico|GaraConCambioCampo=/i.test(w.text))) {
    return parseFipav(words, width, height, operatorList, options)
  }

  if (
    !words.some(w => w.text.includes('SNUG')) ||
    !words.some(w => w.text.includes('RISULTATO'))
  ) {
    throw Error(
      `Formato non riconosciuto. Attualmente sono supportati i formati dei software di ${supportedSoftwareList()}.`,
    )
  }

  const teams = [
    textAt(683.15, 583.26, 2),
    textAt(824.88, 584.1, 2),
  ]

  if (teams.some(t => !t)) {
    throw Error('Impossibile identificare le squadre nel riepilogo del PDF.')
  }

  const dateText = words.find(
    w => /^\d{2}\/\d{2}\/\d{4}$/.test(w.text) && w.y < 130,
  )?.text

  if (!dateText) {
    throw Error('Data gara non riconosciuta.')
  }

  const date = dateText.split('/').reverse().join('-')

  const sets = []
  // Extract players from both printed roster columns (normalized geometry x: 900..1180, y: 445..640)
  // Left column: x ~ 905..1030. Right column: x ~ 1030..1180.
  // The circled numbers in the scoresheet denote the captains; cleanJerseyNumber extracts the jersey number.
  const colBounds = [
    { left: 905, right: 1030, numMaxX: 928, nameMinX: 928 },
    { left: 1030, right: 1180, numMaxX: 1052, nameMinX: 1052 },
  ]
  const extractedColumns = colBounds.map(col => {
    const numberWords = words.filter(w =>
      w.x >= col.left && w.x < col.numMaxX && w.y >= 445 && w.y <= 638 &&
      cleanJerseyNumber(w.text) !== null,
    )
    const players = numberWords.map(nw => {
      const num = cleanJerseyNumber(nw.text)
      const name = words.filter(n =>
        n.x >= col.nameMinX && n.x < col.right &&
        Math.abs(n.y - nw.y) <= 3.2 &&
        !/^(LIBERO|N°|Cognome e Nome)$/i.test(n.text) &&
        !/^\d+$/.test(n.text),
      ).sort((a, b) => a.x - b.x).map(n => n.text).join(' ').trim()
      return { number: num, name }
    }).filter(p => p.number !== null)
    return new Map(players.map(p => [p.number, p]))
  })

  // Determine which column corresponds to teams[0] and teams[1].
  // Check header letters (A or B) near y=425 in each column.
  const leftHeaderWords = words.filter(w => w.x >= 905 && w.x < 1030 && Math.abs(w.y - 425.4) <= 6)
  const leftHasB = leftHeaderWords.some(w => w.text === 'B' && w.size >= 8)
  const leftHasA = leftHeaderWords.some(w => w.text === 'A' && w.size >= 8)

  let team0Column = 0
  let team1Column = 1
  if (leftHasB) {
    team0Column = 1
    team1Column = 0
  } else if (leftHasA) {
    team0Column = 0
    team1Column = 1
  } else {
    const leftText = leftHeaderWords.map(w => w.text).join(' ')
    if (teams[1] && leftText.includes(teams[1])) {
      team0Column = 1
      team1Column = 0
    }
  }

  const rosters = [
    new Map(extractedColumns[team0Column] || []),
    new Map(extractedColumns[team1Column] || []),
  ]

  for (let i = 0; i < 5; i++) {
    const summaryY = 620.95 + i * 18.99

    const scores = [725.67, 822.05].map(
      x =>
        pick(x, summaryY, 2, 2, 10)
          .find(w => /^\d+$/.test(w.text))
          ?.text,
    )

    if (scores.every(v => v === undefined)) continue

    if (scores.some(v => v === undefined)) {
      throw Error(`Set ${i + 1}: punteggio incompleto.`)
    }

    const offsetX = i % 2 === 1 ? 538.58 : 0
    const offsetY = Math.floor(i / 2) * 139.75

    const sides = [0, 255.12].map((offset, side) => {
      const base = 109.13 + offsetX + offset

      const name = textAt(
        178.02 + offsetX + (side ? 226.2 : 0),
        146.15 + offsetY,
        2,
      )

      const lineup = Array.from(
        { length: 6 },
        (_, c) =>
          textAt(
            111.4 + offsetX + offset + c * 28.346,
            174.5 + offsetY,
            2,
          ),
      )

      const rosterStartX = 111.4 + offsetX + offset
      const lineupNumbers = words
        .filter(
          w =>
            [174.5 + offsetY, 187.5 + offsetY].some(y => Math.abs(w.y - y) <= 3) &&
            Array.from({ length: 6 }, (_, column) => rosterStartX + column * 28.346)
              .some(x => Math.abs(w.x - x) <= 2) &&
            /^\d{1,2}$/.test(w.text),
        )
        .map(w => Number(w.text))
      const teamIndex = teams.indexOf(name)
      if (teamIndex >= 0) {
        for (const number of lineupNumbers) {
          if (!rosters[teamIndex].has(number)) rosters[teamIndex].set(number, { number, name: '' })
        }
      }

      // One record per physical row: SNUG redraws struck-out text repeatedly.
      const liberoReplacements = []
      const columns = [306.99 + offsetX + offset]
      if (i === 4 && side === 0) columns.push(columns[0] + 538.58)
      for (const [section, x] of columns.entries()) {
        const rows = new Map()
        for (const word of words.filter(w => Math.abs(w.x - x) <= 3 &&
          w.y >= 155 + offsetY && w.y < 275 + offsetY && /\d+\s*[-–/]\s*\d+/.test(w.text))) {
          const row = Math.round((word.y - 161.14 - offsetY) / 12.755)
          const previous = rows.get(row)
          if (!previous || word.text.length > previous.length) rows.set(row, word.text)
        }
        for (const [row, raw] of [...rows].sort((a, b) => a[0] - b[0])) {
          const numbers = raw.match(/\d+/g).map(Number)
          for (let step = 1; step < numbers.length; step++) {
            const player = numbers[step - 1], libero = numbers[step]
            const isLibero = number => /\bL[12]\b/i.test(rosters[teamIndex]?.get(number)?.name || '')
            liberoReplacements.push({
              row: row + 1, section, step, raw, player, libero,
              isLiberoChange: isLibero(player) && isLibero(libero),
            })
          }
        }
      }

      const grid = Array.from({ length: 48 }, (_, j) => {
        const found = pick(
          base +
            (j % 6) * 28.346 +
            Math.floor(j / 24) * 14.17,
          225.2 +
            offsetY +
            (Math.floor(j / 6) % 4) * 12.755,
          1.6,
          1.2,
          8,
        ).filter(w => /^\d+$/.test(w.text))

        if (found.length > 1) {
          throw Error(`Set ${i + 1}: turno ambiguo.`)
        }

        let value = found.length
          ? Number(found[0].text)
          : ''

        if (i === 4 && side === 0) {
          const continued = pick(
            base +
              538.58 +
              (j % 6) * 28.346 +
              Math.floor(j / 24) * 14.17,
            225.2 +
              offsetY +
              (Math.floor(j / 6) % 4) * 12.755,
            1.6,
            1.2,
            8,
          ).filter(w => /^\d+$/.test(w.text))

          if (continued.length > 1) {
            throw Error(
              'Quinto set: progressivo ambiguo dopo il cambio campo.',
            )
          }

          if (continued.length) {
            value =
              value === ''
                ? Number(continued[0].text)
                : Math.max(
                    value,
                    Number(continued[0].text),
                  )
          }
        }

        return value
      })

      if (grid.slice(36).some(v => v !== '')) {
        throw Error(
          'Il referto supera i sei giri gestiti dal modello Excel. Nessun dato è stato troncato.',
        )
      }

      grid.length = 36

      if (
        grid[0] === '' &&
        typeof grid[1] === 'number'
      ) {
        grid[0] = 'X'
      }

      // Substitutions: entrant in the "Riserve" row, scores in/out below it ("3 11": SNUG draws the
      // colon separately), in the column of the position. Time-outs: "T" box right of the grid.
      // SNUG redraws struck-out text repeatedly: the first reading of each box is kept.
      const panelSubstitutions = shift => {
        const start = 111.4 + offsetX + offset + shift
        const cells = emptySubstitutions()
        const columnOf = x => Math.round((x - start) / 28.346)
        for (const w of words.filter(w => Math.abs(w.y - (187.4 + offsetY)) <= 2.5 && w.size >= 9 && /^\d{1,2}$/.test(w.text))) {
          const column = columnOf(w.x + 2.8)
          if (column >= 0 && column < 6 && !cells[column].in) cells[column].in = w.text
        }
        for (const [field, y] of [['scoreIn', 200 + offsetY], ['scoreOut', 212.5 + offsetY]]) {
          for (const w of words.filter(w => Math.abs(w.y - y) <= 2.5 && w.size >= 9 && /^\d+\s+\d+$/.test(w.text))) {
            const column = columnOf(w.x)
            if (column >= 0 && column < 6 && !cells[column][field]) cells[column][field] = normalizeScore(w.text)
          }
        }
        return cells
      }
      const panelTimeouts = shift => [0, 1].map(row => normalizeScore(words.find(w =>
        Math.abs(w.x - (281.9 + offsetX + offset + shift)) <= 8 &&
        Math.abs(w.y - (250.4 + offsetY + row * 12.4)) <= 2.5 && /^\d+\s*:\s*\d+$/.test(w.text))?.text))
      let substitutions = panelSubstitutions(0)
      let timeouts = panelTimeouts(0)
      if (i === 4 && side === 0) {
        // Fifth set: the court-change panel continues this team (same rules as the turns above)
        const conflict = () => { throw Error('Quinto set: sostituzione o time-out ambiguo dopo il cambio campo.') }
        substitutions = mergeCourtChange(substitutions, panelSubstitutions(538.58), conflict)
        timeouts = mergeCourtChange(timeouts, panelTimeouts(538.58), conflict)
      }

      return {
        name,
        lineup,
        liberoReplacements,
        grid,
        substitutions,
        timeouts,
      }
    })

    const own = sides.find(
      s => s.name === teams[0],
    )

    const other = sides.find(
      s => s.name === teams[1],
    )

    if (!own || !other) {
      throw Error(
        `Set ${i + 1}: squadre non coerenti con il riepilogo.`,
      )
    }

    // SNUG prints elapsed minutes in the central summary column, not HH:MM.
    const durationText = pick(788.03, summaryY + 2.27, 3, 2, 10)
      .find(w => /^\d+$/.test(w.text))?.text
    const durationMinutes = Number(durationText) > 0 ? Number(durationText) : ''

    sets.push({
      number: i + 1,
      rotation: '',

      own: own.grid,
      other: other.grid,

      lineup: own.lineup,
      opponentLineup: other.lineup,
      libero: liberoFields(own.liberoReplacements),
      opponentLibero: liberoFields(other.liberoReplacements),
      liberoReplacements: own.liberoReplacements,
      opponentLiberoReplacements: other.liberoReplacements,
      substitutions: own.substitutions,
      opponentSubstitutions: other.substitutions,
      substituteNumbers: own.substitutions.map(cell => cell.in).filter(Boolean),
      opponentSubstituteNumbers: other.substitutions.map(cell => cell.in).filter(Boolean),
      timeouts: own.timeouts,
      opponentTimeouts: other.timeouts,

      scoreOwn: +scores[0],
      scoreOther: +scores[1],

      durationMinutes,
    })
  }

  if (!sets.length) {
    throw Error(
      'Nessun set leggibile. Le scansioni non contengono il testo necessario all’importazione.',
    )
  }

  // Estrazione arbitri e ufficiali di gara
  const ref1 = words
    .filter(
      w =>
        Math.abs(w.y - 694.9) <= 5 &&
        w.x >= 225 &&
        w.x < 390,
    )
    .sort((a, b) => a.x - b.x)
    .map(w => w.text)
    .join(' ')
    .trim()

  const ref2 = words
    .filter(
      w =>
        Math.abs(w.y - 707.5) <= 5 &&
        w.x >= 225 &&
        w.x < 390,
    )
    .sort((a, b) => a.x - b.x)
    .map(w => w.text)
    .join(' ')
    .trim()

  const scorer = words
    .filter(
      w =>
        Math.abs(w.y - 720.4) <= 5 &&
        w.x >= 225 &&
        w.x < 390,
    )
    .sort((a, b) => a.x - b.x)
    .map(w => w.text)
    .join(' ')
    .trim()

  const ref1City = words
    .filter(
      w =>
        Math.abs(w.y - 694.9) <= 5 &&
        w.x >= 400 &&
        w.x < 550,
    )
    .sort((a, b) => a.x - b.x)
    .map(w => w.text)
    .join(' ')
    .trim()

  const scorerCity = words
    .filter(
      w =>
        Math.abs(w.y - 720.4) <= 5 &&
        w.x >= 400 &&
        w.x < 550,
    )
    .sort((a, b) => a.x - b.x)
    .map(w => w.text)
    .join(' ')
    .trim()

  // Estrazione luogo e impianto di gioco
  const location = words
    .filter(
      w =>
        Math.abs(w.y - 105.0) <= 4 &&
        w.x >= 70 &&
        w.x < 225,
    )
    .sort((a, b) => a.x - b.x)
    .map(w => w.text)
    .join(' ')
    .trim()

  const venue = words
    .filter(
      w =>
        Math.abs(w.y - 103.9) <= 4 &&
        w.x >= 250 &&
        w.x < 420,
    )
    .sort((a, b) => a.x - b.x)
    .map(w => w.text)
    .join(' ')
    .trim()

  const durationPart = x => pick(x, 739.44, 3, 2, 10)
    .find(w => /^\d+$/.test(w.text))?.text
  const hours = durationPart(836.79)
  const minutes = durationPart(853.23)
  const durationMinutes = hours !== undefined && minutes !== undefined && Number(minutes) < 60
    ? Number(hours) * 60 + Number(minutes) : ''

  return {
    durationMinutes,
    championship: textAt(121.89, 79.54, 3),
    event: textAt(412.44, 79.54, 3),
    gender: pick(206.65, 92.54, 3).some(w => /x/i.test(w.text)) ? 'Femminile'
      : pick(136.9, 92.54, 3).some(w => /x/i.test(w.text)) ? 'Maschile' : '',
    team: teams[0],
    opponent: teams[1],
    date,

    location: location || '',
    venue: venue || '',

    number: textAt(
      272.13,
      79.54,
      2,
    ),

    sets,

    referees: {
      first: ref1 || '',
      firstCity: ref1City || '',

      second: ref2 || '',

      scorer: scorer || '',
      scorerCity: scorerCity || '',
    },

    notes: readNotes(words, { xMin: 195, xMax: 660, yMin: 566, yMax: 662 }),
    roster: [...rosters[0].values()].sort((a, b) => a.number - b.number),
    opponentRoster: [...rosters[1].values()].sort((a, b) => a.number - b.number),
  }
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

function parseFipav(words, width, height, operatorList, { debug = false } = {}) {
  const text = (x, y, dx = 3, dy = 4) => words
    .filter(w => Math.abs(w.x - x) <= dx && Math.abs(w.y - y) <= dy)
    .sort((a, b) => a.x - b.x)
    .map(w => w.text)
    .join(' ')
    .trim()

  const around = (x, y, dx = 3, dy = 4) => words.filter(w =>
    Math.abs(w.x - x) <= dx && Math.abs(w.y - y) <= dy)

  const headerLine = words.filter(w => w.y > 45 && w.y < 105)
  const dateText = headerLine.find(w => /^\d{2}\/\d{2}\/\d{4}$/.test(w.text))?.text
  const teams = [
    words.filter(w => w.y > 86 && w.y < 100 && w.x > 80 && w.x < 300)
      .map(w => w.text).join(' ').replace(/\s+/g, ' ').trim(),
    words.filter(w => w.y > 86 && w.y < 100 && w.x > 350 && w.x < 560)
      .map(w => w.text).join(' ').replace(/\s+/g, ' ').trim(),
  ]

  if (!dateText || teams.some(team => !team)) {
    throw Error('Formato FIPAV non riconosciuto: intestazione incompleta.')
  }

  const teamLetters = [around(34, 94, 5, 3), around(597, 94, 5, 3)]
    .map(list => list.find(w => /^[AB]$/.test(w.text))?.text)
  if (!teamLetters[0] || !teamLetters[1] || teamLetters[0] === teamLetters[1]) {
    throw Error('Associazione squadre A/B FIPAV non riconosciuta.')
  }
  const roster = [[], []]
  const rosterWords = words.filter(w => w.y > 450 && w.y < 665 && w.x > 900)
  // Team of each roster column: the circled A/B letter; when it is missing (e.g. covered by a long team
  // name in an edited PDF) the team name printed in the same header, which is data of the scoresheet too
  const rosterNotes = []
  const squash = text => text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const rosterSideByName = column => {
    const header = squash(words.filter(w => Math.abs(w.y - 428) <= 4 && (column ? w.x > 1060 && w.x < 1190 : w.x > 935 && w.x < 1025))
      .sort((a, b) => a.x - b.x).map(w => w.text).join(' '))
    if (header.length < 3) return -1
    const matches = teams.map(team => squash(team)).map(team => team.startsWith(header) || header.startsWith(team))
    return matches.filter(Boolean).length === 1 ? matches.indexOf(true) : -1
  }
  for (const [column, bounds] of [{numberX: 926, nameX: 942.8, right: 1046}, {numberX: 1051, nameX: 1068.3, right: 1180}].entries()) {
    const letter = around(column ? 1156.8 : 924.5, 429.4, 5, 3).find(w => /^[AB]$/.test(w.text))?.text
    let side = teamLetters.indexOf(letter)
    if (side < 0) {
      side = rosterSideByName(column)
      if (side >= 0) rosterNotes.push({ column, team: teams[side] })
    }
    if (side < 0) throw Error('Squadra della rosa FIPAV non riconosciuta.')
    for (const word of rosterWords.filter(w => Math.abs(w.x - bounds.numberX) < 5 && /^\d{1,2}$/.test(w.text))) {
      const number = Number(word.text)
      // Rows are 14pt apart: a name within 5.5pt of the number belongs to that row (edited PDFs may write
      // the name slightly higher and smaller than the original)
      const row = rosterWords.filter(w => Math.abs(w.y - word.y) <= 5.5 && w.x >= bounds.nameX - 2 && w.x < bounds.right)
      const name = row.filter(w => !/^L[12]?$/.test(w.text)).sort((a,b) => a.x-b.x).map(w => w.text).join(' ').trim()
      const libero = row.find(w => /^L[12]?$/.test(w.text))?.text
      if (name) roster[side].push({ number, name: libero ? `${name} - ${libero}` : name })
    }
  }
  const summaryLetter = around(676.9, 606.2, 5, 3).find(w => /^[AB]$/.test(w.text))?.text
  if (!teamLetters.includes(summaryLetter)) throw Error('Squadra del risultato FIPAV non riconosciuta.')
  const summaryReversed = summaryLetter !== teamLetters[0]

  const summaryRows = [648.3, 669.3, 690.3, 711.4, 732.4]
  const scores = summaryRows.map(y => {
    const own = around(648.3, y, 3, 2).find(w => /^\d+$/.test(w.text))
    const other = around(723.9, y, 3, 2).find(w => /^\d+$/.test(w.text))
    const duration = around(699, y, 3, 2).find(w => /^\d+$/.test(w.text))
    return own && other ? { own: Number(summaryReversed ? other.text : own.text), other: Number(summaryReversed ? own.text : other.text), durationMinutes: duration ? Number(duration.text) : '' } : null
  }).filter(Boolean)
  if (!scores.length) throw Error('Risultato finale FIPAV non riconosciuto.')

  const scaleX = 1190.55 / width
  const scaleY = 841.89 / height
  const divisionMarks = operatorList?.fnArray.flatMap((fn, index) => {
    if (fn !== 91 || operatorList.argsArray[index][1][0].length !== 7) return []
    const bounds = operatorList.argsArray[index][2]
    if (bounds[1] < 780 || bounds[1] > 800 || bounds[0] < 40 || bounds[2] > 230 || bounds[2] - bounds[0] < 5 || bounds[3] - bounds[1] < 5) return []
    return [{
      x: ((bounds[0] + bounds[2]) / 2) * scaleX,
      y: (height - (bounds[1] + bounds[3]) / 2) * scaleY,
    }]
  }) || []
  const gender = divisionMarks.some(w => w.x < 140)
    ? 'Maschile'
    : divisionMarks.some(w => w.x >= 140 && w.x < 230)
      ? 'Femminile'
      : ''

  const panelRows = [
    { y: 151.5, pair: 0 }, { y: 151.5, pair: 1 },
    { y: 305.9, pair: 0 }, { y: 305.9, pair: 1 },
    { y: 460.2, pair: 0 },
  ].map((panel, index) => {
    if (index >= scores.length) return { ...panel, ownSide: 0 }
    const letter = around(panel.pair ? 800.2 : 249.8, panel.y - 30.8, 5, 3)
      .find(w => /^[AB]$/.test(w.text))?.text
    if (!teamLetters.includes(letter)) throw Error('Squadra del set FIPAV non riconosciuta.')
    return { ...panel, ownSide: letter === teamLetters[0] ? 0 : 1 }
  })
  const lineupStarts = [[108.5, 369.1], [658.7, 922.2]]
  const readLineup = (y, start) => Array.from({ length: 6 }, (_, index) => {
    const expectedX = start + index * 29
    return words.find(w =>
      Math.abs(w.x - expectedX) <= 5 && Math.abs(w.y - y) <= 3 &&
      /^\d+$/.test(w.text) && w.size >= 9 && w.size <= 11,
    )?.text || ''
  })
  const lineups = panelRows.map(({ y, pair, ownSide }) => {
    const sides = [
      readLineup(y, lineupStarts[pair][0]),
      readLineup(y, lineupStarts[pair][1]),
    ]
    return { own: sides[ownSide], other: sides[1 - ownSide] }
  })
  const substitutes = panelRows.map(({ y, pair, ownSide }) => {
    const sides = lineupStarts[pair].map(start => readLineup(y + 14, start).filter(Boolean))
    return { own: sides[ownSide], other: sides[1 - ownSide] }
  })
  // Substitutions: entrant in the "Riserve" row (y+14), scores in and out below it (y+26.7, y+40.7),
  // in the column of the position. Time-outs: "T" box right of the grid (y+82.8, y+96.9).
  const scoreWords = words.filter(w => /^\d+\s*:\s*\d+$/.test(w.text))
  const readSubstitutions = (panelY, start) => {
    const entrants = readLineup(panelY + 14, start)
    const cells = entrants.map(number => ({ in: number, scoreIn: '', scoreOut: '' }))
    for (const [field, dy] of [['scoreIn', 26.7], ['scoreOut', 40.7]]) {
      for (const w of scoreWords.filter(w => Math.abs(w.y - (panelY + dy)) <= 3 && w.x >= start - 9.5 && w.x < start - 9.5 + 174)) {
        cells[Math.floor((w.x - (start - 9.5)) / 29)][field] = normalizeScore(w.text)
      }
    }
    return cells
  }
  const readTimeouts = (panelY, start) => [0, 1].map(row => normalizeScore(scoreWords.find(w =>
    Math.abs(w.y - (panelY + 82.8 + row * 14.05)) <= 3 && w.x >= start + 158 && w.x < start + 182)?.text))
  const substitutions = panelRows.map(({ y, pair, ownSide }) => {
    const sides = lineupStarts[pair].map(start => readSubstitutions(y, start))
    return { own: sides[ownSide], other: sides[1 - ownSide] }
  })
  const timeouts = panelRows.map(({ y, pair, ownSide }) => {
    const sides = lineupStarts[pair].map(start => readTimeouts(y, start))
    return { own: sides[ownSide], other: sides[1 - ownSide] }
  })
  const liberoStarts = [[305.7, 566.3], [855.9, 1116.5]]
  const liberoSequences = panelRows.map(({ y, pair, ownSide }) => {
    const fields = [
      { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
      { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
    ]
    for (const side of [0, 1]) {
      const start = liberoStarts[pair][side]
      for (const word of words.filter(w =>
        Math.abs(w.x - start) <= 4 && w.y >= y - 18 && w.y < y + 55 && /^\d+(?:\s*[-–/]\s*\d+)*$/.test(w.text),
      )) {
        const row = Math.round((word.y - (y - 15.4)) / 14.2)
        if (row < 0 || row >= 6) continue
        const numbers = word.text.match(/\d+/g) || []
        fields[side].onCourt[row] = numbers[0] || ''
        // NEWBIT may record only the replaced player when the team has one libero.
        // With multiple liberos the annotation is ambiguous: never guess who entered.
        const teamIndex = side === ownSide ? 0 : 1
        const liberos = roster[teamIndex].filter(player => /\bL[12]?\b/.test(player.name))
        fields[side].entered[row] = numbers[1] || (liberos.length === 1 ? String(liberos[0].number) : '')
        fields[side].otherEntered[row] = numbers[2] || ''
      }
    }
    return { own: fields[ownSide], other: fields[1 - ownSide] }
  })
  // Service-turn grids. Each column I–VI is 29pt wide and split in two halves (rounds 1–4 left,
  // rounds 5–8 right, 14.5pt apart); rows are 14pt apart. Values are placed by position, never by
  // reading order, so the two halves of the fifth set can be merged cell by cell.
  const progressionStarts = [[102.5, 365.4], [652.8, 913.4]]
  const warnings = []
  for (const note of rosterNotes) {
    warnings.push({
      set: null, team: note.team, expected: 'lettera A/B cerchiata', found: 'lettera assente',
      zone: `Elenco atleti · intestazione colonna ${note.column ? 'destra' : 'sinistra'} (x≈${note.column ? 1156.8 : 924.5}, y≈429.4)`,
      message: `Squadra della colonna associata dal nome scritto nell'intestazione (${note.team}).`,
    })
  }
  const warn = (set, team, expected, found, zone, message) =>
    warnings.push({ set, team, expected, found, zone, message })
  const teamOfSide = (panel, side) => teams[side === panel.ownSide ? 0 : 1]
  const readTurnGrid = (panelY, startX) => {
    const cells = Array(36).fill('')
    const zones = Array(36).fill(null)
    const overflow = []
    for (const w of words.filter(w =>
      w.x > startX - 15 && w.x < startX + 165 &&
      w.y > panelY + 45 && w.y < panelY + 145 &&
      w.size >= 7.5 && w.size <= 8.2 && /^\d+$/.test(w.text),
    )) {
      const slot = Math.max(0, Math.round((w.x - startX) / 14.475))
      const column = Math.min(5, Math.floor(slot / 2))
      const round = Math.round((w.y - (panelY + 56.2)) / 14) + 1 + (slot % 2) * 4
      const zone = { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 }
      const cell = (round - 1) * 6 + column
      if (round < 1 || cell >= 36) { overflow.push({ value: Number(w.text), zone }); continue }
      cells[cell] = Number(w.text)
      zones[cell] = zone
    }
    return { cells, zones, overflow }
  }
  const grids = panelRows.slice(0, scores.length).map(panel =>
    progressionStarts[panel.pair].map(startX => readTurnGrid(panel.y, startX)))

  // Fifth set court change ("CAMBIO CAMPO" panel, right of set 5): the team named in its header keeps
  // serving in that grid after the change. Its values continue the same set: merge, never duplicate.
  let fifthSet = null
  if (scores.length >= 5) {
    const panel = panelRows[4]
    const changeLetter = around(663.3, 429.4, 5, 3).find(w => /^[AB]$/.test(w.text))?.text
    const changeZone = { x: 663.3, y: 429.4 }
    const pointsWord = around(803.7, 428.7, 5, 3).find(w => /^\d+$/.test(w.text))
    const pointsAtChange = pointsWord ? Number(pointsWord.text) : null
    const continuation = readTurnGrid(panel.y, progressionStarts[1][0])
    const hasContinuation = continuation.cells.some(v => v !== '')
    const changingSide = changeLetter ? (changeLetter === teamLetters[panel.ownSide] ? 0 : changeLetter === teamLetters[1 - panel.ownSide] ? 1 : -1) : -1
    const changingTeam = changingSide >= 0 ? teamOfSide(panel, changingSide) : ''
    if (hasContinuation && changingSide < 0) {
      warn(5, '', 'lettera A/B della squadra che cambia campo', changeLetter || 'nessuna', `Set 5 · riquadro CAMBIO CAMPO · intestazione (x≈${changeZone.x}, y≈${changeZone.y})`,
        'Turni presenti nel riquadro del cambio campo, ma la squadra non è riconoscibile: non vengono uniti al set 5.')
    }
    if (hasContinuation && pointsAtChange === null) {
      warn(5, changingTeam, 'punti al cambio', 'nessun valore', 'Set 5 · riquadro CAMBIO CAMPO · PUNTI AL CAMBIO (x≈803.7, y≈428.7)',
        'Punteggio al cambio campo non leggibile: i controlli di continuità sono parziali.')
    }
    if (changingSide >= 0 && hasContinuation) {
      const before = grids[4][changingSide]
      const lastBefore = before.cells.findLastIndex(v => v !== '')
      const firstAfter = continuation.cells.findIndex(v => v !== '')
      for (const [cell, value] of continuation.cells.entries()) {
        if (value === '') continue
        const where = `Set 5 · CAMBIO CAMPO · turni, giro ${Math.floor(cell / 6) + 1} pos. ${ROMAN[cell % 6]} (x≈${continuation.zones[cell].x}, y≈${continuation.zones[cell].y})`
        if (before.cells[cell] !== '') {
          warn(5, changingTeam, 'casella vuota prima del cambio campo', before.cells[cell], where,
            `Il turno ${value} dopo il cambio campo occupa una casella già usata prima del cambio: valore non unito.`)
          continue
        }
        before.cells[cell] = value
        before.zones[cell] = { ...continuation.zones[cell], afterCourtChange: true }
      }
      // The court-change panel repeats the starting lineup (not a new formation) and may record
      // substitutions made after the change: keep the set-5 lineup, add those entrants once.
      const key = changingSide === panel.ownSide ? 'own' : 'other'
      const repeatedLineup = readLineup(panel.y, lineupStarts[1][0])
      if (repeatedLineup.some(Boolean) && repeatedLineup.join(' ') !== lineups[4][key].join(' ')) {
        warn(5, changingTeam, lineups[4][key].join(' '), repeatedLineup.join(' '), `Set 5 · CAMBIO CAMPO · giocatori titolari (x≈${lineupStarts[1][0]}, y≈${panel.y})`,
          'La formazione riportata nel riquadro del cambio campo è diversa da quella di inizio set: vale quella di inizio set.')
      }
      for (const number of readLineup(panel.y + 14, lineupStarts[1][0]).filter(Boolean)) {
        if (!substitutes[4][key].includes(number)) substitutes[4][key].push(number)
      }
      // NEWBIT copies earlier substitutions/time-outs into the court-change panel and adds new ones
      const fields = { in: 'numero entrato', scoreIn: 'punteggio entrata', scoreOut: 'punteggio rientro' }
      substitutions[4][key] = mergeCourtChange(substitutions[4][key], readSubstitutions(panel.y, lineupStarts[1][0]),
        (column, field, kept, found) => warn(5, changingTeam, kept, found, `Set 5 · CAMBIO CAMPO · sostituzioni, pos. ${ROMAN[column]}`,
          `Sostituzione (${fields[field]}) diversa da quella del pannello del set: vale quella del pannello del set.`))
      timeouts[4][key] = mergeCourtChange(timeouts[4][key], readTimeouts(panel.y, lineupStarts[1][0]),
        (row, _field, kept, found) => warn(5, changingTeam, kept, found, `Set 5 · CAMBIO CAMPO · time-out, riga ${row + 1}`,
          'Time-out diverso da quello del pannello del set: vale quello del pannello del set.'))
      if (lastBefore >= 0 && firstAfter >= 0 && firstAfter <= lastBefore) {
        warn(5, changingTeam, `primo turno dopo il cambio oltre giro ${Math.floor(lastBefore / 6) + 1} pos. ${ROMAN[lastBefore % 6]}`,
          `giro ${Math.floor(firstAfter / 6) + 1} pos. ${ROMAN[firstAfter % 6]}`, 'Set 5 · CAMBIO CAMPO · turni',
          'La prosecuzione dopo il cambio campo non segue l\'ultimo turno prima del cambio.')
      }
      if (pointsAtChange !== null && lastBefore >= 0 && Number(before.cells[lastBefore]) > pointsAtChange) {
        warn(5, changingTeam, `≤ ${pointsAtChange} (punti al cambio)`, before.cells[lastBefore], 'Set 5 · turni prima del cambio campo',
          'Un turno prima del cambio campo supera i punti al cambio.')
      }
      if (pointsAtChange !== null && firstAfter >= 0 && continuation.cells[firstAfter] < pointsAtChange) {
        warn(5, changingTeam, `≥ ${pointsAtChange} (punti al cambio)`, continuation.cells[firstAfter], 'Set 5 · CAMBIO CAMPO · primo turno',
          'Il primo turno dopo il cambio campo è inferiore ai punti al cambio.')
      }
    }
    fifthSet = { panel, changingSide, changingTeam, changeLetter, pointsAtChange, hasContinuation }
  }

  // A receiving team's first service slot is crossed out ("X"), not a zero turn.
  const progressions = grids.map((sides, index) => {
    const panel = panelRows[index]
    return sides.map(({ cells }) => {
      const out = [...cells]
      if (out[0] === '' && out.some(v => v !== '')) out[0] = 'X'
      return out
    }).reduce((acc, cells, side) => ({ ...acc, [side === panel.ownSide ? 'own' : 'other']: cells }), {})
  })

  // Consistency checks on the reconstructed sequences: report, never repair.
  progressions.forEach((sides, index) => {
    const panel = panelRows[index]
    for (const side of [0, 1]) {
      const key = side === panel.ownSide ? 'own' : 'other'
      const cells = sides[key]
      const team = teamOfSide(panel, side)
      const final = key === 'own' ? scores[index].own : scores[index].other
      const zone = `Set ${index + 1} · turni di servizio ${team}`
      const last = cells.findLastIndex(v => v !== '')
      for (const { value, zone: z } of grids[index][side].overflow) {
        warn(index + 1, team, 'massimo 6 giri di servizio', value, `${zone} (x≈${z.x}, y≈${z.y})`, 'Turno oltre il 6° giro: non importato.')
      }
      let previous = -1
      for (let cell = 0; cell <= last; cell++) {
        const value = cells[cell]
        if (value === 'X' && cell === 0) continue
        if (value === '') {
          warn(index + 1, team, 'turno compilato', 'casella vuota', `${zone}, giro ${Math.floor(cell / 6) + 1} pos. ${ROMAN[cell % 6]}`,
            'Casella vuota in mezzo alla sequenza dei turni.')
          continue
        }
        if (value <= previous) {
          warn(index + 1, team, `> ${previous}`, value, `${zone}, giro ${Math.floor(cell / 6) + 1} pos. ${ROMAN[cell % 6]}`,
            'I progressivi dei turni devono crescere.')
        }
        previous = value
      }
      if (last >= 0 && cells[last] !== final) {
        warn(index + 1, team, final, cells[last], `${zone}, ultimo turno · confronto con RISULTATO FINALE`,
          'L\'ultimo progressivo non coincide con il punteggio del set.')
      }
    }
    const servers = [0, 1].filter(side => (sides[side === panel.ownSide ? 'own' : 'other'])[0] !== 'X')
    if (servers.length !== 1) {
      warn(index + 1, '', 'una sola squadra al servizio per prima (una sola "X")', servers.length === 2 ? 'nessuna X' : 'due X',
        `Set ${index + 1} · prima casella dei turni`, 'Squadra al servizio a inizio set non determinabile.')
    }
  })

  const sets = scores.map((score, index) => {
    const own = progressions[index]?.own || Array(36).fill('')
    const other = progressions[index]?.other || Array(36).fill('')
    return {
      number: index + 1,
      rotation: '',
      own,
      other,
      substituteNumbers: substitutes[index]?.own || [],
      opponentSubstituteNumbers: substitutes[index]?.other || [],
      substitutions: substitutions[index]?.own || emptySubstitutions(),
      opponentSubstitutions: substitutions[index]?.other || emptySubstitutions(),
      timeouts: timeouts[index]?.own || emptyTimeouts(),
      opponentTimeouts: timeouts[index]?.other || emptyTimeouts(),
      lineup: lineups[index]?.own || ['', '', '', '', '', ''],
      opponentLineup: lineups[index]?.other || ['', '', '', '', '', ''],
      libero: liberoSequences[index]?.own || { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
      opponentLibero: liberoSequences[index]?.other || { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
      liberoReplacements: [],
      opponentLiberoReplacements: [],
      scoreOwn: score.own,
      scoreOther: score.other,
      durationMinutes: score.durationMinutes,
    }
  })

  return {
    parserVersion: 3,
    sourceFormat: 'FIPAV',
    progressionsImported: true,
    durationMinutes: scores.reduce((total, score) => total + score.durationMinutes, 0),
    championship: text(115.8, 50.5, 70),
    event: '',
    gender,
    team: teams[0],
    opponent: teams[1],
    date: dateText.split('/').reverse().join('-'),
    location: (text(64.4, 78.6, 30) || '').toLocaleLowerCase('it-IT').replace(/^./, value => value.toUpperCase()),
    venue: text(273.5, 78.6, 30),
    number: text(284.9, 50.5, 35),
    sets,
    referees: { first: '', firstCity: '', second: '', scorer: '', scorerCity: '' },
    notes: readNotes(words, { xMin: 195, xMax: 560, yMin: 585, yMax: 695 }),
    roster: roster[0].sort((a, b) => a.number - b.number),
    opponentRoster: roster[1].sort((a, b) => a.number - b.number),
    importWarnings: warnings,
    ...(debug && fifthSet ? { debug: { fifthSet: fifthSetDebug(fifthSet, sets[4], teams, teamLetters, grids[4]) } } : {}),
  }
}

// Readable intermediate structure of the fifth set, for debugging and tests.
// Chronological order follows the scoresheet rule: the serving team's turn k precedes the
// receiving team's turn k+1 ("X" marks the receiving team's first box).
function fifthSetDebug(fifth, set, teams, teamLetters, grids) {
  const byLetter = letter => teams[teamLetters.indexOf(letter)]
  const lineupOf = name => name === teams[0] ? set.lineup : set.opponentLineup
  const cellsOf = name => name === teams[0] ? set.own : set.other
  const serverName = [teams[0], teams[1]].find(name => cellsOf(name)[0] !== 'X') || ''
  const turns = []
  for (const name of teams) {
    const side = name === teams[0] ? fifth.panel.ownSide : 1 - fifth.panel.ownSide
    for (const [cell, value] of cellsOf(name).entries()) {
      if (value === '' || value === 'X') continue
      const zone = grids[side].zones[cell]
      turns.push({
        team: name,
        round: Math.floor(cell / 6) + 1,
        position: ROMAN[cell % 6],
        cell,
        score: value,
        afterCourtChange: Boolean(zone?.afterCourtChange),
        order: name === serverName ? cell * 2 : cell * 2 - 1,
      })
    }
  }
  return {
    set: 5,
    teamA: byLetter('A'),
    teamB: byLetter('B'),
    startingServer: serverName,
    lineupA: lineupOf(byLetter('A')),
    lineupB: lineupOf(byLetter('B')),
    courtChange: fifth.hasContinuation ? { team: fifth.changingTeam, letter: fifth.changeLetter } : null,
    // Only the value printed on the scoresheet ("PUNTI AL CAMBIO") for the team that changes court
    scoreAtCourtChange: fifth.pointsAtChange !== null && fifth.changingTeam ? { [fifth.changingTeam]: fifth.pointsAtChange } : {},
    serviceTurns: turns.sort((a, b) => a.order - b.order),
    finalScore: { [teams[0]]: set.scoreOwn, [teams[1]]: set.scoreOther },
  }
}

// Jersey numbers supplied by the user;
// unknown lineups remain explicitly unset.
export function applySetter(match) {
  const jersey =
    /anguill/i.test(match.team)
      ? '7'
      : /life/i.test(match.team)
        ? '4'
        : null

  return {
    ...match,

    setter: jersey || '',

    sets: match.sets.map(s => {
      const index = jersey
        ? s.lineup.indexOf(jersey)
        : -1

      return {
        ...s,

        rotation:
          index >= 0
            ? index + 1
            : '',
      }
    }),
  }
}

// Reimporting enriches the roster while retaining reviewed match data and names.
export function refreshImportedMatch(existing, parsed) {
  const reversed = existing.team === parsed.opponent
  const repairParticipation = parsed.sourceFormat === 'FIPAV' && (existing.parserVersion || 0) < 3
  const repairTeams = parsed.sourceFormat === 'FIPAV' && (existing.parserVersion || 0) < 2
  const merge = (incoming, saved = []) => incoming.map(player => {
    const previous = saved.find(entry => Number(typeof entry === 'object' ? entry.number : entry) === player.number)
    return {
      ...player,
      name: !repairTeams && previous?.name?.trim() ? previous.name : player.name,
      setterRole: previous?.setterRole || player.setterRole || '',
      isSetter: previous?.isSetter ?? player.isSetter ?? false,
    }
  })
  return {
    ...existing,
    parserVersion: parsed.parserVersion,
    sourceFormat: parsed.sourceFormat,
    durationMinutes: Number(existing.durationMinutes) > 0 ? existing.durationMinutes : parsed.durationMinutes,
    championship: existing.championship || parsed.championship,
    event: existing.event || parsed.event,
    gender: existing.gender || parsed.gender,
    number: existing.number || parsed.number,
    sets: existing.sets.map((set, index) => ({
      ...set,
      ...(repairTeams && parsed.sets[index] ? {
        ...parsed.sets[index],
        rotation: '',
        own: reversed ? parsed.sets[index].other : parsed.sets[index].own,
        other: reversed ? parsed.sets[index].own : parsed.sets[index].other,
        scoreOwn: reversed ? parsed.sets[index].scoreOther : parsed.sets[index].scoreOwn,
        scoreOther: reversed ? parsed.sets[index].scoreOwn : parsed.sets[index].scoreOther,
      } : {}),
      substituteNumbers: (repairParticipation ? null : set.substituteNumbers) ?? (reversed ? parsed.sets[index]?.opponentSubstituteNumbers : parsed.sets[index]?.substituteNumbers) ?? [],
      opponentSubstituteNumbers: (repairParticipation ? null : set.opponentSubstituteNumbers) ?? (reversed ? parsed.sets[index]?.substituteNumbers : parsed.sets[index]?.opponentSubstituteNumbers) ?? [],
      lineup: !repairTeams && set.lineup?.some(Boolean) ? set.lineup : (reversed ? parsed.sets[index]?.opponentLineup : parsed.sets[index]?.lineup) ?? set.lineup,
      opponentLineup: !repairTeams && set.opponentLineup?.some(Boolean) ? set.opponentLineup : (reversed ? parsed.sets[index]?.lineup : parsed.sets[index]?.opponentLineup) ?? set.opponentLineup,
      libero: (!repairParticipation && set.libero) || (reversed ? parsed.sets[index]?.opponentLibero : parsed.sets[index]?.libero) || { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
      opponentLibero: (!repairParticipation && set.opponentLibero) || (reversed ? parsed.sets[index]?.libero : parsed.sets[index]?.opponentLibero) || { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
      durationMinutes: Number(set.durationMinutes) > 0 ? set.durationMinutes : parsed.sets[index]?.durationMinutes ?? '',
      substitutions: set.substitutions?.some(cell => cell.in || cell.scoreIn || cell.scoreOut) ? set.substitutions : (reversed ? parsed.sets[index]?.opponentSubstitutions : parsed.sets[index]?.substitutions) ?? emptySubstitutions(),
      opponentSubstitutions: set.opponentSubstitutions?.some(cell => cell.in || cell.scoreIn || cell.scoreOut) ? set.opponentSubstitutions : (reversed ? parsed.sets[index]?.substitutions : parsed.sets[index]?.opponentSubstitutions) ?? emptySubstitutions(),
      timeouts: set.timeouts?.some(Boolean) ? set.timeouts : (reversed ? parsed.sets[index]?.opponentTimeouts : parsed.sets[index]?.timeouts) ?? emptyTimeouts(),
      opponentTimeouts: set.opponentTimeouts?.some(Boolean) ? set.opponentTimeouts : (reversed ? parsed.sets[index]?.timeouts : parsed.sets[index]?.opponentTimeouts) ?? emptyTimeouts(),
      liberoReplacements: (repairTeams ? null : set.liberoReplacements) ?? (reversed ? parsed.sets[index]?.opponentLiberoReplacements : parsed.sets[index]?.liberoReplacements) ?? [],
      opponentLiberoReplacements: (repairTeams ? null : set.opponentLiberoReplacements) ?? (reversed ? parsed.sets[index]?.liberoReplacements : parsed.sets[index]?.opponentLiberoReplacements) ?? [],
    })),
    roster: merge(reversed ? parsed.opponentRoster : parsed.roster, existing.roster),
    opponentRoster: merge(reversed ? parsed.roster : parsed.opponentRoster, existing.opponentRoster),
    importWarnings: parsed.importWarnings || [],
    notes: existing.notes?.trim() ? existing.notes : parsed.notes || '',
  }
}
