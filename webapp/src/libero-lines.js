// Libero exchanges as the scoresheet writes them, one per row: "73-70-76" (the player who leaves, then the
// liberos who enter in turn). Rows of text for the form, and the exchanges used by the statistics.
import { liberoFields } from './pdf-parser.js'

const KEYS = { own: ['liberoReplacements', 'libero'], other: ['opponentLiberoReplacements', 'opponentLibero'] }

// Rows of a team in a set; unread rows of an import stay empty, in their place
export function liberoLines(set, side) {
  const [replacementsKey, boxKey] = KEYS[side]
  const replacements = set[replacementsKey] || []
  if (replacements.length) {
    const lines = []
    let current = -1
    for (const entry of replacements) {
      if (Number(entry.step) === 1 || current < 0) {
        const wanted = Number(entry.row) - 1
        current = wanted >= 0 && !lines[wanted] ? wanted : lines.length
        lines[current] = `${entry.player}-${entry.libero}`
      } else lines[current] += `-${entry.libero}`
    }
    return Array.from(lines, line => line || '')
  }
  const box = set[boxKey] || {}
  const values = key => (Array.isArray(box[key]) ? box[key] : [box[key]])
  const onCourt = values('onCourt'), entered = values('entered'), other = values('otherEntered')
  const lines = onCourt.map((player, row) => [player, entered[row], other[row]].filter(Boolean).join('-'))
  while (lines.length && !lines.at(-1)) lines.pop()
  return lines
}

export const validLiberoLine = text => /^\s*\d+(\s*-\s*\d+)+\s*$/.test(text)

// Exchanges from the rows of text; rows empty or not complete yet give none
export function liberoReplacementsOf(lines) {
  return lines.flatMap((text, row) => {
    if (!validLiberoLine(text)) return []
    const numbers = text.match(/\d+/g).map(Number)
    const raw = numbers.join('-')
    return numbers.slice(1).map((libero, i) => ({ row: row + 1, section: 0, step: i + 1, raw, player: numbers[i], libero, isLiberoChange: i > 0 }))
  })
}

// Patch of a set for new rows of a team (the libero box follows, for the matches read from it)
export function liberoLinesPatch(side, lines) {
  const [replacementsKey, boxKey] = KEYS[side]
  const replacements = liberoReplacementsOf(lines)
  return { [replacementsKey]: replacements, [boxKey]: liberoFields(replacements) }
}
