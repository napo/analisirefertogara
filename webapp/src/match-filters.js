export const emptyFilters = { query: '', championship: '', team: '' }
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function filterMatches(matches, filters) {
  const terms = normalize(filters.query).trim().split(/\s+/).filter(Boolean)
  return matches.filter(match => {
    if (filters.championship && normalize(match.championship) !== normalize(filters.championship)) return false
    if (filters.team && match.team !== filters.team && match.opponent !== filters.team) return false
    const text = normalize([match.team, match.opponent, match.championship, match.event, match.gender, match.number, match.date, match.fileName].join(' '))
    return terms.every(term => text.includes(term))
  })
}
export function matchHeading(match) {
  return [match.championship, match.event, match.gender, match.number ? `Gara n. ${match.number}` : ''].filter(Boolean).join(' · ')
}

// Championships of the archive: the same name written in capitals or not is one choice
export function championshipOptions(matches) {
  const names = new Map()
  for (const { championship } of matches) if (championship && !names.has(normalize(championship))) names.set(normalize(championship), championship)
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))
}

// Both teams of every match
export const teamOptions = matches => [...new Set(matches.flatMap(m => [m.team, m.opponent]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }))

export const hasActiveFilters = filters => Object.values(filters).some(Boolean)

const SORT_VALUES = {
  date: m => m.date || '',
  match: m => normalize(`${m.team} ${m.opponent}`),
  championship: m => normalize(m.championship),
  // sets won minus sets lost by the team named first
  result: m => (m.sets || []).reduce((total, s) => total + (s.scoreOwn > s.scoreOther ? 1 : s.scoreOther > s.scoreOwn ? -1 : 0), 0),
}
// What a first click on a column means: the latest and the best first, names from A to Z
export const defaultSortDirection = key => (key === 'date' || key === 'result' ? 'desc' : 'asc')
export const DEFAULT_SORT = { key: 'date', direction: 'desc' }

// New sorted list; equal values: the most recent first
export function sortMatches(matches, { key, direction } = DEFAULT_SORT) {
  const value = SORT_VALUES[key]
  const sign = direction === 'asc' ? 1 : -1
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  return [...matches].sort((a, b) => sign * compare(value(a), value(b)) || compare(b.date || '', a.date || ''))
}
