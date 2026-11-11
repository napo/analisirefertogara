// One inversion path for drafts, saved reports and manual team selection: every field of the analyzed
// team is exchanged with the opponent's, including the setter choices (team 'own' <-> 'other').
import { swapWarningSides } from './import-flags.js'
import { emptySubstitutions, emptyTimeouts } from './pdf-parser.js'

const emptyLibero = () => ({ onCourt: '', entered: '', otherEntered: '' })

// [own field, opponent field, value when missing]
const PAIRS = [
  ['own', 'other', () => []],
  ['scoreOwn', 'scoreOther', () => 0],
  ['lineup', 'opponentLineup', () => ['', '', '', '', '', '']],
  ['substituteNumbers', 'opponentSubstituteNumbers', () => []],
  ['libero', 'opponentLibero', emptyLibero],
  ['liberoReplacements', 'opponentLiberoReplacements', () => []],
  ['substitutions', 'opponentSubstitutions', emptySubstitutions],
  ['timeouts', 'opponentTimeouts', emptyTimeouts],
]

export function swapTeams(match) {
  const next = {
    ...match,
    team: match.opponent,
    opponent: match.team,
    roster: match.opponentRoster || [],
    opponentRoster: match.roster || [],
    sets: (match.sets || []).map(set => {
      const swapped = { ...set }
      for (const [a, b, empty] of PAIRS) {
        swapped[a] = set[b] ?? empty()
        swapped[b] = set[a] ?? empty()
      }
      if (set.opponentOnLeft !== undefined) swapped.opponentOnLeft = !set.opponentOnLeft
      return swapped
    }),
  }
  if (match.setterChoices) next.setterChoices = match.setterChoices.map(choice => ({ ...choice, team: choice.team === 'own' ? 'other' : 'own' }))
  if (match.selectedSide) next.selectedSide = match.selectedSide === 'A' ? 'B' : 'A'
  if (match.sheetTeams) next.sheetTeams = { own: match.sheetTeams.other, other: match.sheetTeams.own }
  if (match.importWarnings) next.importWarnings = swapWarningSides(match.importWarnings)
  delete next.analysis
  return next
}

// The team that plays all these matches, analyzed or as the opponent; '' when there is none. When two teams
// do (the same two met more than once), the one analyzed in more matches, then the one of the first match.
export function commonTeam(matches) {
  const [first, ...rest] = matches
  if (!first) return ''
  const candidates = [first.team, first.opponent].filter(name => name && rest.every(m => m.team === name || m.opponent === name))
  const analyzed = name => matches.filter(m => m.team === name).length
  return candidates.sort((a, b) => analyzed(b) - analyzed(a))[0] || ''
}

// The match from the point of view of a team: as saved, or swapped (a view marked invertedView, never
// persisted) when the team is the opponent; null when the team did not play it
export function viewAs(match, team) {
  if (match.team === team) return match
  return match.opponent === team ? { ...swapTeams(match), invertedView: true } : null
}
