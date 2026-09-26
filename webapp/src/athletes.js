const rosterPlayer = player => typeof player === 'object' ? player : { number: player, name: '', setterRole: '' }
const isSetter = player => Boolean(player.isSetter || player.setterRole === 'P1' || player.setterRole === 'P2')
const liberoValues = (libero, key) => Array.isArray(libero?.[key])
  ? [...libero[key], '', '', '', '', '', ''].slice(0, 6)
  : Array(6).fill(libero?.[key] || '')

const matchAthleteStats = matches => {
  const stats = new Map()
  const norm = n => String(n ?? '').trim().replace(/^0+/, '') || '0'

  for (const match of matches) {
    // Raccoglie tutti i nomi presenti nei roster (anche avversari se invertiti)
    const names = new Map()
    const settersSet = new Set()
    for (const player of (match.roster || []).map(rosterPlayer)) {
      const k = norm(player.number)
      if (player.name && player.name.trim()) names.set(k, player.name.trim())
      if (isSetter(player)) settersSet.add(k)
    }

    // Include tutti i giocatori del roster per avere l'elenco completo
    for (const player of (match.roster || []).map(rosterPlayer)) {
      const k = norm(player.number)
      if (!stats.has(k)) {
        stats.set(k, {
          number: player.number,
          cleanNumber: k,
          name: player.name?.trim() || '',
          pointsPlayed: 0,
          services: 0,
          serviceTurns: 0,
          consecutive: 0,
          pointsAtServe: 0,
          isSetter: isSetter(player),
          entered: false,
        })
      } else {
        const existing = stats.get(k)
        if (!existing.name && player.name) existing.name = player.name.trim()
        if (isSetter(player)) existing.isSetter = true
      }
    }

    for (const set of match.sets || []) {
      const active = new Set([...(set.lineup || []), ...(set.substituteNumbers || [])].filter(Boolean).map(norm))
      for (const entry of set.liberoReplacements || []) {
        if (entry.player) active.add(norm(entry.player))
        if (entry.libero) active.add(norm(entry.libero))
      }
      for (const key of ['onCourt', 'entered', 'otherEntered']) {
        for (const number of liberoValues(set.libero, key).filter(Boolean)) {
          active.add(norm(number))
        }
      }

      const pointsPlayed = Number(set.scoreOwn || 0) + Number(set.scoreOther || 0)
      for (const number of active) {
        if (!stats.has(number)) {
          stats.set(number, {
            number,
            cleanNumber: number,
            name: names.get(number) || '',
            pointsPlayed: 0,
            services: 0,
            serviceTurns: 0,
            consecutive: 0,
            pointsAtServe: 0,
            isSetter: settersSet.has(number),
            entered: true,
          })
        }
        const record = stats.get(number)
        record.pointsPlayed += pointsPlayed
        record.entered = true
        if (!record.name && names.has(number)) record.name = names.get(number)
        if (settersSet.has(number)) record.isSetter = true
      }

      let previous = 0
      for (const [index, value] of (set.own || []).entries()) {
        if (value === '' || value === null || value === undefined) continue
        if (value === 'X' || value === 'x') { previous = 0; continue }
        if (!Number.isInteger(value)) continue
        const playerNumber = set.lineup?.[index % 6]
        if (playerNumber === '' || playerNumber === undefined) { previous = value; continue }
        const number = norm(playerNumber)
        if (!stats.has(number)) {
          stats.set(number, {
            number: playerNumber,
            cleanNumber: number,
            name: names.get(number) || '',
            pointsPlayed: 0,
            services: 0,
            serviceTurns: 0,
            consecutive: 0,
            pointsAtServe: 0,
            isSetter: settersSet.has(number),
            entered: true,
          })
        }
        const points = Math.max(0, value - previous - 1)
        const player = stats.get(number)
        player.services += points + 1
        player.serviceTurns += 1
        player.consecutive += points + 1
        player.pointsAtServe += points
        player.entered = true
        if (!player.name && names.has(number)) player.name = names.get(number)
        previous = value
      }
    }
  }

  return [...stats.values()]
    .map(player => ({
      ...player,
      averageConsecutive: player.serviceTurns ? player.consecutive / player.serviceTurns : 0,
      averagePointsAtServe: player.serviceTurns ? player.pointsAtServe / player.serviceTurns : 0,
    }))
    .sort((a, b) => Number(a.number) - Number(b.number))
}

// Jersey numbers identify players only within one team's match roster.
export function athleteStats(matches) {
  const totals = new Map()
  const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()
  matches.forEach((match, index) => {
    for (const player of matchAthleteStats([match])) {
      const name = normalize(player.name).replace(/\s*-\s*L[12]?$/, '')
      const id = JSON.stringify([normalize(match.team), name || ['unknown', match.id || index, player.cleanNumber]])
      if (!totals.has(id)) totals.set(id, { ...player, id, numbers: new Set([player.number]) })
      else {
        const total = totals.get(id)
        for (const field of ['pointsPlayed', 'services', 'serviceTurns', 'consecutive', 'pointsAtServe']) total[field] += player[field]
        total.numbers.add(player.number)
        total.entered ||= player.entered
        total.isSetter ||= player.isSetter
      }
    }
  })
  return [...totals.values()].map(player => ({
    ...player,
    number: [...player.numbers].join(' / #'),
    averageConsecutive: player.serviceTurns ? player.consecutive / player.serviceTurns : 0,
    averagePointsAtServe: player.serviceTurns ? player.pointsAtServe / player.serviceTurns : 0,
  }))
}
