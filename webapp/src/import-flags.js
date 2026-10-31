// Values of an import that the parser deduced or could not read: their warnings name the field of the set
// ({ key, index, part? }) and the value given to it, and the form outlines the field while it still holds
// that value. Nothing is stored about the review: changing the value removes the outline.

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
