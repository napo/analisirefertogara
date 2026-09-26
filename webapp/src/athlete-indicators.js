// Athletes table: indicators, per-set breakdown and best/worst values.
// Pure logic, no React. Values come only from athleteStats (the same function, applied to one set at a
// time for the breakdown): no new formula.
import { athleteStats } from './athletes.js'

// Single place for the meaning of each indicator.
// direction: 'higher' = a higher value is better; null = volume/exposure, never judged best/worst.
// applicable: when the value means something for that athlete in that scope (otherwise "–").
export const ATHLETE_INDICATORS = [
  {
    key: 'pointsPlayed',
    label: 'Punti nei set di presenza',
    short: 'Punti nei set',
    direction: null,
    decimals: 0,
    applicable: () => true,
  },
  {
    key: 'services',
    label: 'Servizi stimati',
    short: 'Servizi',
    direction: null,
    decimals: 0,
    applicable: () => true,
  },
  {
    key: 'averageConsecutive',
    label: 'Media servizi consecutivi stimati',
    short: 'Media serv. consecutivi',
    direction: 'higher',
    decimals: 2,
    applicable: stat => stat.serviceTurns > 0,
  },
  {
    key: 'averagePointsAtServe',
    label: 'MP BP con atleta al servizio',
    short: 'MP BP al servizio',
    direction: 'higher',
    decimals: 2,
    applicable: stat => stat.serviceTurns > 0,
  },
]

// Indicator shown as a per-set mini chart in the table
export const TREND_INDICATOR = 'averagePointsAtServe'

// Rows of the table: total of the match(es) and, for a single match, one entry per played set.
// A set entry is null when the athlete was not on court in that set.
export function athleteRows(matches) {
  const totals = athleteStats(matches).filter(player => player.entered)
  const single = matches.length === 1 ? matches[0] : null
  const perSet = single ? single.sets.map(set => athleteStats([{ ...single, sets: [set] }])) : []
  return totals.map(total => ({
    id: total.id,
    number: total.number,
    name: total.name,
    isSetter: total.isSetter,
    total,
    sets: perSet.map(list => {
      const stat = list.find(entry => entry.id === total.id)
      return stat && stat.entered ? stat : null
    }),
  }))
}

// Value of an indicator in a scope ('total' or a set index): { value, state }
// state: 'value' | 'not-applicable' (e.g. no service turn) | 'absent' (not on court in that set)
export function indicatorValue(row, indicator, scope) {
  const stat = scope === 'total' ? row.total : row.sets[scope]
  if (!stat) return { value: null, state: 'absent' }
  if (!indicator.applicable(stat)) return { value: null, state: 'not-applicable' }
  return { value: stat[indicator.key], state: 'value' }
}

// Best and worst ids for one indicator in one scope. Only comparable values count (on court, applicable);
// nothing is marked with fewer than two comparable athletes, when all values are equal, or for indicators
// without a direction. Ties are all marked.
export function extremes(rows, indicator, scope) {
  const none = { best: new Set(), worst: new Set() }
  if (!indicator.direction) return none
  const comparable = rows
    .map(row => ({ id: row.id, ...indicatorValue(row, indicator, scope) }))
    .filter(entry => entry.state === 'value')
  if (comparable.length < 2) return none
  const round = value => Number(value.toFixed(indicator.decimals))
  const values = comparable.map(entry => round(entry.value))
  const max = Math.max(...values)
  const min = Math.min(...values)
  if (max === min) return none
  const pick = target => new Set(comparable.filter(entry => round(entry.value) === target).map(entry => entry.id))
  return indicator.direction === 'higher'
    ? { best: pick(max), worst: pick(min) }
    : { best: pick(min), worst: pick(max) }
}
