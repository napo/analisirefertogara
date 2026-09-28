// One inversion path for drafts, saved reports and manual team selection: every field of the analyzed
// team is exchanged with the opponent's, including the setter choices (team 'own' <-> 'other').
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
      return swapped
    }),
  }
  if (match.setterChoices) next.setterChoices = match.setterChoices.map(choice => ({ ...choice, team: choice.team === 'own' ? 'other' : 'own' }))
  if (match.selectedSide) next.selectedSide = match.selectedSide === 'A' ? 'B' : 'A'
  delete next.analysis
  return next
}
