// Values of an import that the parser deduced or could not read: their warnings name the field of the set
// ({ key, index, part? }) and the value given to it, and the form outlines the field while it still holds
// that value. Nothing is stored about the review: changing the value removes the outline.

import { liberoLines, liberoLinesPatch } from './libero-lines.js'

const OPPONENT_KEYS = { own: 'other', other: 'own', lineup: 'opponentLineup', opponentLineup: 'lineup', substitutions: 'opponentSubstitutions', opponentSubstitutions: 'substitutions', timeouts: 'opponentTimeouts', opponentTimeouts: 'timeouts', liberoReplacements: 'opponentLiberoReplacements', opponentLiberoReplacements: 'liberoReplacements' }

export const fieldId = (key, index, part = '') => `${key}.${index}${part ? `.${part}` : ''}`

// Value of a field in a set, as text
export function fieldValue(set, { key, index, part }) {
  // libero exchanges: index = row of the exchange
  if (/iberoReplacements$/.test(key)) return String(set?.[key]?.find(entry => entry.row === index + 1)?.raw ?? '')
  const cell = set?.[key]?.[index]
  return String((part ? cell?.[part] : cell) ?? '')
}

// Warnings of a set with the value of each field filled in
export const withFieldValues = (warnings, number, set) => warnings.map(warning =>
  (warning.field && warning.set === number ? { ...warning, value: fieldValue(set, warning.field) } : warning))

// The same warnings seen from the other team
export const swapWarningSides = warnings => warnings?.map(warning =>
  (warning.field ? { ...warning, field: { ...warning.field, key: OPPONENT_KEYS[warning.field.key] } } : warning))

// Fields of set `number` still holding the imported value: Map fieldId -> message
export function flaggedFields(warnings, number, set) {
  const flags = new Map()
  for (const warning of warnings || []) {
    if (!warning.field || warning.set !== number || fieldValue(set, warning.field) !== warning.value) continue
    const { key, index, part } = warning.field
    flags.set(fieldId(key, index, part), warning.message)
  }
  return flags
}

// Patch of a set giving a field a new value (text, as typed in the form)
export function fieldPatch(set, { key, index, part }, value) {
  if (/iberoReplacements$/.test(key)) {
    const side = key === 'liberoReplacements' ? 'own' : 'other'
    const lines = liberoLines(set, side)
    while (lines.length <= index) lines.push('')
    lines[index] = value
    return liberoLinesPatch(side, lines)
  }
  if (part) {
    const list = Array.from({ length: Math.max(6, set[key]?.length || 0) }, (_, i) => ({ in: '', scoreIn: '', scoreOut: '', ...(set[key]?.[i] || {}) }))
    list[index] = { ...list[index], [part]: value }
    if (part !== 'in') return { [key]: list }
    // the participation list used by the statistics follows the "Riserve" row
    const numbersKey = key === 'substitutions' ? 'substituteNumbers' : 'opponentSubstituteNumbers'
    const previous = set[key]?.[index]?.in
    const numbers = (set[numbersKey] || []).filter(number => number !== previous || list.some(cell => cell.in === previous))
    return { [key]: list, [numbersKey]: value && !numbers.includes(value) ? [...numbers, value] : numbers }
  }
  const list = [...(set[key] || [])]
  while (list.length <= index) list.push('')
  // service turns are numbers, or "X"
  list[index] = (key === 'own' || key === 'other') && /^\d+$/.test(value) ? Number(value) : value
  return { [key]: list }
}

// What can be typed in a field while the value is being written
export function validFieldInput({ key, part }, value) {
  if (/iberoReplacements$/.test(key)) return /^[\d-]*$/.test(value)
  if (key === 'own' || key === 'other') return /^(\d*|X)$/.test(value)
  if (part === 'in' || /ineup$/.test(key)) return /^\d*$/.test(value)
  return /^\d{0,2}:?\d{0,2}$/.test(value)
}
