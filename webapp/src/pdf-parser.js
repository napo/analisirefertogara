// SNUG electronic scoresheet, reference geometry normalized to A3 landscape.
// Values are located by geometry AND font size to exclude printed turn counters.
export function parseItems(items, width, height) {
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

  const timeToMinutes = value => {
    const [h, m] = value.split(':').map(Number)
    return h * 60 + m
  }

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

    /*
     * Durata del set.
     *
     * Cerca eventuali orari HH:MM presenti
     * sulla stessa riga del riepilogo del set.
     *
     * Se trova almeno due orari:
     *   primo = inizio set
     *   secondo = fine set
     *
     * Se non riesce a riconoscerli,
     * durationMinutes resta vuoto.
     */
    const summaryWords = words
      .filter(
        w =>
          Math.abs(w.y - summaryY) <= 3,
      )
      .sort((a, b) => a.x - b.x)

    const timeValues = summaryWords
      .map(w => w.text)
      .filter(
        value =>
          /^\d{1,2}:\d{2}$/.test(value),
      )

    let durationMinutes = ''

    if (timeValues.length >= 2) {
      const start =
        timeToMinutes(timeValues[0])

      let end =
        timeToMinutes(timeValues[1])

      // eventuale passaggio della mezzanotte
      if (end < start) {
        end += 24 * 60
      }

      const duration = end - start

      // protezione da valori chiaramente errati
      if (
        duration > 0 &&
        duration < 180
      ) {
        durationMinutes = duration
      }
    }

    sets.push({
      number: i + 1,
      rotation: '',

      own: own.grid,
      other: other.grid,

      lineup: own.lineup,
      opponentLineup: other.lineup,

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

  return {
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
