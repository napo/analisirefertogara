const emptyLibero = () => ({
  onCourt: Array(6).fill(''),
  entered: Array(6).fill(''),
  otherEntered: Array(6).fill(''),
})

const liberoFields = replacements => {
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
export function parseItems(items, width, height, operatorList = null) {
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

  if (words.some(w => /NEWBIT|Referto Elettronico/i.test(w.text))) {
    return parseFipav(words, width, height, operatorList)
  }

  if (
    !words.some(w => w.text.includes('SNUG')) ||
    !words.some(w => w.text.includes('RISULTATO'))
  ) {
    throw Error(
      'Formato non riconosciuto. È supportato il referto elettronico SNUG come il PDF di esempio; scansioni e altri modelli richiedono un importatore dedicato.',
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
  // The printed roster columns can have the opposite order to the result table.
  const rosters = teams.map(team => {
    const header = words.find(w => w.text === team && Math.abs(w.y - 425.36) <= 3 && w.x > 930)
    if (!header) return new Map()
    const left = header.x < 1030 ? 908 : 1032
    const right = left + 123
    const players = words.filter(w =>
      w.x >= left && w.x < left + 18 && w.y > 445 && w.y < 638 && /^\d{1,2}$/.test(w.text),
    ).map(w => ({
      number: Number(w.text),
      name: words.filter(n => n.x >= left + 20 && n.x < right && Math.abs(n.y - w.y) <= 2)
        .sort((a, b) => a.x - b.x).map(n => n.text).join(' ').trim(),
    }))
    return new Map(players.map(player => [player.number, player]))
  })

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

      return {
        name,
        lineup,
        liberoReplacements,
        grid,
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

    roster: [...rosters[0].values()].sort((a, b) => a.number - b.number),
    opponentRoster: [...rosters[1].values()].sort((a, b) => a.number - b.number),
  }
}

function parseFipav(words, width, height, operatorList) {
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

  const roster = [[], []]
  const rosterWords = words.filter(w => w.y > 450 && w.y < 665 && w.x > 900)
  for (const word of rosterWords) {
    const side = word.x < 1030 ? 0 : 1
    const number = word.text.match(/^\d+$/)?.[0]
    if (!number) continue
    const nameWords = rosterWords.filter(n =>
      Math.abs(n.y - word.y) <= 2 &&
      n.x > word.x + 8 && n.x < (side ? 1190 : 1030) &&
      !/^\d+$/.test(n.text) && !/^[LM]\d?$/.test(n.text),
    )
    const name = nameWords.sort((a, b) => a.x - b.x).map(n => n.text).join(' ').trim()
    const libero = rosterWords.find(n => Math.abs(n.y - word.y) <= 2 && /^L[12]?$/.test(n.text))?.text
    if (name && !roster[side].some(player => player.number === Number(number))) {
      roster[side].push({ number: Number(number), name: libero ? `${name} - ${libero}` : name })
    }
  }

  const summaryRows = [648.3, 669.3, 690.3, 711.4, 732.4]
  const scores = summaryRows.map(y => {
    const own = around(648.3, y, 3, 2).find(w => /^\d+$/.test(w.text))
    const other = around(723.9, y, 3, 2).find(w => /^\d+$/.test(w.text))
    const duration = around(699, y, 3, 2).find(w => /^\d+$/.test(w.text))
    return own && other ? { own: Number(own.text), other: Number(other.text), durationMinutes: duration ? Number(duration.text) : '' } : null
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

  const graphicXs = operatorList?.fnArray.flatMap((fn, index) => {
    if (fn !== 91 || operatorList.argsArray[index][1][0].length !== 7) return []
    const bounds = operatorList.argsArray[index][2]
    const width = bounds[2] - bounds[0]
    const boxHeight = bounds[3] - bounds[1]
    if (width < 5 || boxHeight < 5 || Math.abs(width - boxHeight) >= 3) return []
    return [{
      x: ((bounds[0] + bounds[2]) / 2) * scaleX,
      y: (height - (bounds[1] + bounds[3]) / 2) * scaleY,
    }]
  }) || []

  const panelRows = [
    { y: 151.5, pair: 0, ownSide: 0 },
    { y: 151.5, pair: 1, ownSide: 1 },
    { y: 305.9, pair: 0, ownSide: 0 },
    { y: 305.9, pair: 1, ownSide: 1 },
    { y: 460.2, pair: 0, ownSide: 1 },
  ]
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
  const liberoStarts = [[305.7, 566.3], [855.9, 1116.5]]
  const liberoSequences = panelRows.map(({ y, pair, ownSide }) => {
    const fields = [
      { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
      { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
    ]
    for (const side of [0, 1]) {
      const start = liberoStarts[pair][side]
      for (const word of words.filter(w =>
        Math.abs(w.x - start) <= 4 && w.y >= y - 18 && w.y < y + 55 && /\d+\s*[-–/]\s*\d+/.test(w.text),
      )) {
        const row = Math.round((word.y - (y - 15.4)) / 14.2)
        if (row < 0 || row >= 6) continue
        const numbers = word.text.match(/\d+/g) || []
        fields[side].onCourt[row] = numbers[0] || ''
        fields[side].entered[row] = numbers[1] || ''
        fields[side].otherEntered[row] = numbers[2] || ''
      }
    }
    return { own: fields[ownSide], other: fields[1 - ownSide] }
  })
  const progressionStarts = [[102.5, 365.4], [652.8, 913.4]]
  const progressions = panelRows.map(({ y, pair, ownSide }) => {
    const sides = progressionStarts[pair].map(start => words
      .filter(w =>
        w.x > start - 15 && w.x < start + 165 &&
        w.y > y + 45 && w.y < y + 145 &&
        w.size >= 7.5 && w.size <= 8.2 && /^\d+$/.test(w.text),
      )
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map(w => Number(w.text)))
    return { own: sides[ownSide], other: sides[1 - ownSide] }
  })
  const fifthSetContinuation = words
    .filter(w =>
      w.x > progressionStarts[1][0] - 15 && w.x < progressionStarts[1][0] + 165 &&
      w.y > panelRows[4].y + 45 && w.y < panelRows[4].y + 145 &&
      w.size >= 7.5 && w.size <= 8.2 && /^\d+$/.test(w.text),
    )
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(w => Number(w.text))
  progressions[4].other.push(...fifthSetContinuation)

  const sets = scores.map((score, index) => {
    const own = Array(36).fill('')
    const other = Array(36).fill('')
    for (const [target, values] of [[own, progressions[index]?.own], [other, progressions[index]?.other]]) {
      for (const [cell, value] of (values || []).slice(0, 36).entries()) target[cell] = value
    }
    const expectedX = index % 2 === 0 ? 360 : 910
    const expectedY = 208 + Math.floor(index / 2) * 154
    if (graphicXs.some(mark => Math.abs(mark.x - expectedX) < 15 && Math.abs(mark.y - expectedY) < 15)) other[0] = 'X'
    return {
      number: index + 1,
      rotation: '',
      own,
      other,
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
    roster: roster[0].sort((a, b) => a.number - b.number),
    opponentRoster: roster[1].sort((a, b) => a.number - b.number),
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
  const merge = (incoming, saved = []) => incoming.map(player => {
    const previous = saved.find(entry => Number(typeof entry === 'object' ? entry.number : entry) === player.number)
    return {
      ...player,
      name: previous?.name?.trim() ? previous.name : player.name,
      setterRole: previous?.setterRole || player.setterRole || '',
      isSetter: previous?.isSetter ?? player.isSetter ?? false,
    }
  })
  return {
    ...existing,
    durationMinutes: Number(existing.durationMinutes) > 0 ? existing.durationMinutes : parsed.durationMinutes,
    championship: existing.championship || parsed.championship,
    event: existing.event || parsed.event,
    gender: existing.gender || parsed.gender,
    number: existing.number || parsed.number,
    sets: existing.sets.map((set, index) => ({
      ...set,
      lineup: set.lineup?.some(Boolean) ? set.lineup : parsed.sets[index]?.lineup ?? set.lineup,
      opponentLineup: set.opponentLineup?.some(Boolean) ? set.opponentLineup : parsed.sets[index]?.opponentLineup ?? set.opponentLineup,
      libero: set.libero || parsed.sets[index]?.libero || { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
      opponentLibero: set.opponentLibero || parsed.sets[index]?.opponentLibero || { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
      durationMinutes: Number(set.durationMinutes) > 0 ? set.durationMinutes : parsed.sets[index]?.durationMinutes ?? '',
      liberoReplacements: set.liberoReplacements ?? (reversed ? parsed.sets[index]?.opponentLiberoReplacements : parsed.sets[index]?.liberoReplacements) ?? [],
      opponentLiberoReplacements: set.opponentLiberoReplacements ?? (reversed ? parsed.sets[index]?.liberoReplacements : parsed.sets[index]?.opponentLiberoReplacements) ?? [],
    })),
    roster: merge(reversed ? parsed.opponentRoster : parsed.roster, existing.roster),
    opponentRoster: merge(reversed ? parsed.roster : parsed.opponentRoster, existing.opponentRoster),
  }
}
