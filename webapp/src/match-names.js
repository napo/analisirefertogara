// Names of teams and championships as the app shows them, whatever the scoresheet prints: every word with a
// capital initial. Applied when a match enters the app (import, archive), so that lists, analysis and reports
// agree and a team written in capitals or not is one team. Team codes and rosters stay as printed.

// Written in capitals: abbreviations of sports clubs and federations
const ACRONYMS = new Set(['ASD', 'A.S.D', 'A.S.D.', 'SSD', 'S.S.D', 'S.S.D.', 'APD', 'ADP', 'AD', 'AS', 'GS', 'GSD', 'PGS', 'PSG', 'SC', 'SS', 'SSDRL', 'SRL', 'US', 'USD', 'ASC', 'ASV', 'CSI', 'UISP', 'FIPAV', 'AICS', 'CUS', 'CSV', 'BVC', 'VBC', 'ASDPGS'])
// Lower case inside a name
const SMALL_WORDS = new Set(['di', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'e', 'ed'])
const ROMAN = /^[IVX]+$/

const capitalizeParts = word => word.replace(/(^|[.'’/()-])(\p{L})/gu, (_, before, letter) => before + letter.toLocaleUpperCase('it-IT'))

export function displayName(text) {
  const name = String(text ?? '').replace(/\s+/g, ' ').trim()
  return name.split(' ').map((word, index) => {
    const upper = word.toLocaleUpperCase('it-IT')
    if (ACRONYMS.has(upper) || (index > 0 && ROMAN.test(word))) return upper
    const lower = word.toLocaleLowerCase('it-IT')
    if (index > 0 && SMALL_WORDS.has(lower)) return lower
    // a word already in mixed case ("VolleyTeam") was written on purpose: only its initial is checked
    const mixed = word !== upper && word !== lower
    return capitalizeParts(mixed ? word : lower)
  }).join(' ')
}

// Match with its names in this form; the same object when there is nothing to change
export function withDisplayNames(match) {
  if (!match) return match
  const names = { team: displayName(match.team), opponent: displayName(match.opponent), championship: displayName(match.championship) }
  return Object.keys(names).every(key => (match[key] ?? '') === names[key]) ? match : { ...match, ...names }
}
