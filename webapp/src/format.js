export function formatDuration(minutes) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return '–'
  const hours = Math.floor(value / 60)
  const mins = Math.round(value % 60)
  const parts = []
  if (hours) parts.push(`${hours} ${hours === 1 ? 'ora' : 'ore'}`)
  if (mins) parts.push(`${mins} ${mins === 1 ? 'minuto' : 'minuti'}`)
  return parts.join(' e ')
}

export function formatWins(wins, matches) {
  return `${wins} ${wins === 1 ? 'vittoria' : 'vittorie'} su ${matches === 1 ? 'una gara giocata' : `${matches} gare`}`
}

export function matchDuration(match) {
  if (Number(match.durationMinutes) > 0) return Number(match.durationMinutes)
  // Never present a partial sum as the duration of the entire match.
  const durations = match.sets.map(set => Number(set.durationMinutes))
  return durations.length && durations.every(value => Number.isFinite(value) && value > 0)
    ? durations.reduce((total, value) => total + value, 0) : null
}
