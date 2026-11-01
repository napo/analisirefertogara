// Where a value of a TBT import is printed: the warnings of the values to check carry a small picture of
// that place of the scoresheet, shown beside the value in the review form.
import { LIBERO_PAGE, PAGE2_WIDTH } from './tbt-layout.js'

const OPPONENT_KEY = /^(other|opponent)/
const SUB_ROWS = { in: 'entrant', scoreIn: 'scoreIn', scoreOut: 'scoreOut' }
const ROWS_PER_LIBERO_COLUMN = 9

// { page: 0 | 1, rect: [x0, y0, x1, y1] } in the reference of the page; null when the place is not known
// (fifth set with a court change: the value may come from either panel)
export function fieldRegion(layout, set, { key, index, part }, { courtChange = false } = {}) {
  const panel = layout.setPanels[set.number - 1]
  if (!panel || courtChange) return null
  const opponent = OPPONENT_KEY.test(key)
  const sideIndex = opponent === Boolean(set.opponentOnLeft) ? 0 : 1
  const side = panel.sides[sideIndex]
  const { top } = panel
  const { rows, turns, timeouts } = layout.cellRows(panel.rounds || 4)
  const cell = (column, [a, b]) => ({ page: 0, rect: [side.cols[column], top + a, side.cols[column + 1], top + b] })
  if (/iberoReplacements$/.test(key)) {
    if (!layout.liberoRows) {
      const cols = LIBERO_PAGE.sets[set.number - 1], row = LIBERO_PAGE.rows[index]
      return row ? { page: 1, rect: [cols[sideIndex], row[0], cols[sideIndex + 1], row[1]] } : null
    }
    const column = Math.floor(index / ROWS_PER_LIBERO_COLUMN), row = index % ROWS_PER_LIBERO_COLUMN
    if (column > 1) return null
    return { page: 0, rect: [side.libero[column], top + layout.liberoRows[row], side.libero[column + 1], top + layout.liberoRows[row + 1]] }
  }
  if (/ineup$/.test(key)) return cell(index, rows.lineup)
  if (/ubstitutions$/.test(key)) return cell(index, rows[SUB_ROWS[part]])
  if (/imeouts$/.test(key)) return timeouts[index] ? { page: 0, rect: [side.t[0], top + timeouts[index][0], side.t[1], top + timeouts[index][1]] } : null
  if (key === 'own' || key === 'other') {
    const round = Math.floor(index / 6), half = round >= turns.length ? 1 : 0, row = turns[round - half * turns.length]
    return row ? cell(index % 6, row) : null
  }
  return null
}

export const regionScale = (layout, region, image) => image.width / (region.page ? PAGE2_WIDTH : layout.width)

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

// Where to look on the sheet, in words: "Set 2, riquadro di destra (SQUADRA), turni di servizio, giro 2, colonna III".
// names: { own, other }. region: the place on the sheet, when known (page 1 = the added sheet of the liberos).
export function fieldLocation(set, { key, index, part }, names, region = null) {
  const opponent = OPPONENT_KEY.test(key)
  const side = opponent === Boolean(set.opponentOnLeft) ? 'sinistra' : 'destra'
  const name = names[opponent ? 'other' : 'own']
  const panel = `Set ${set.number}, riquadro di ${side} (${name})`
  if (/iberoReplacements$/.test(key)) {
    return region?.page ? `Foglio 2 (referto aggiuntivo), ${set.number}° set, colonna di ${side} (${name}), riga ${index + 1}` : `${panel}, colonna LIBERO / UNDER, riga ${index + 1}`
  }
  if (/ineup$/.test(key)) return `${panel}, giocatori titolari, colonna ${ROMAN[index]}`
  if (/imeouts$/.test(key)) return `${panel}, riquadro "T", time-out ${index + 1}`
  if (/ubstitutions$/.test(key)) return `${panel}, ${{ in: 'riserve', scoreIn: 'punteggio di entrata', scoreOut: 'punteggio di uscita' }[part]}, colonna ${ROMAN[index]}`
  return `${panel}, turni di servizio, giro ${Math.floor(index / 6) + 1}, colonna ${ROMAN[index % 6]}`
}
