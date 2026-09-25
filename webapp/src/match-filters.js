export const emptyFilters = { query: '', championship: '', event: '', gender: '' }
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
export function filterMatches(matches, filters) {
  const terms = normalize(filters.query).trim().split(/\s+/).filter(Boolean)
  return matches.filter(match => {
    if (['championship', 'event', 'gender'].some(key => filters[key] && match[key] !== filters[key])) return false
    const text = normalize([match.team, match.opponent, match.championship, match.event, match.gender, match.number, match.date, match.fileName].join(' '))
    return terms.every(term => text.includes(term))
  })
}
export function matchHeading(match) {
  return [match.championship, match.event, match.gender, match.number ? `Gara n. ${match.number}` : ''].filter(Boolean).join(' · ')
}
