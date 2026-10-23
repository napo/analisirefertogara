// Reads every field of a TBT scoresheet page image. The OCR engine is injected:
//   ocr(image, { whitelist, psm }) -> Promise<{ text, confidence }>
// image = grayscale { data, width, height }. The same code runs in the browser (tesseract.js on a canvas)
// and in Node tests. Numeric cells keep all candidate readings: tbt-parser.js picks the ones that respect
// the rules of the scoresheet (increasing progressions, final points).
import { DARK, cleanCell, cleanText, cropGray, glyphImage, glyphShape, inkRatio, openInk, removeStrike, scaledImage, shapeSimilarity, smoothImage, splitPair, components } from './tbt-image.js'
import { LAYOUTS, LIBERO_PAGE, PAGE2_WIDTH } from './tbt-layout.js'

const DIGITS = '0123456789'
const PSM_LINE = 7
const PSM_WORD = 8
const PSM_CHAR = 10
// Readings of a libero exchange of page 2: plain, then stretched and darker to split touching bold digits
const ENTRY_VARIANTS = [
  [6, PSM_LINE], [8, PSM_LINE], [10, PSM_LINE],
  [12, PSM_LINE, { scaleY: 7, low: 0, high: 160 }], [10, PSM_LINE, { scaleY: 8, low: 0, high: 120 }], [14, PSM_LINE, { scaleY: 8, low: 30, high: 200 }],
]
const RESTORE = 2 // steps of ink given back after removing the thin strokes (more would regrow the "/" marks)

// Which version of the TBT page 1 template is this image (tbt-layout.js)? The horizontal grid lines must be
// where expected. null: not a TBT page.
export function detectLayout(image) {
  // mostly white paper (an image decoded as all black would match every line)
  let ink = 0
  for (let i = 0; i < image.data.length; i += 97) if (image.data[i] < DARK) ink++
  if (ink > image.data.length / 97 * 0.3) return null
  return LAYOUTS.find(layout => Math.abs(image.height / image.width - layout.ratio) <= 0.01 && signatureMatches(image, layout)) || null
}

export const isTbtPage = image => detectLayout(image) !== null

function signatureMatches(image, { width, signature }) {
  const s = image.width / width
  const x0 = Math.round(signature.x[0] * s), x1 = Math.round(signature.x[1] * s)
  const hits = signature.rows.filter(y => {
    const row = Math.round(y * s)
    for (let dy = -2; dy <= 2; dy++) {
      let dark = 0
      const base = (row + dy) * image.width
      for (let x = x0; x < x1; x++) if (image.data[base + x] < 110) dark++
      if (dark > (x1 - x0) * 0.8) return true
    }
    return false
  })
  return hits.length >= signature.rows.length - 2
}

// Holes of a glyph (white areas enclosed by ink): "A" has one, "B" two
function holes(image, glyph) {
  const w = glyph.w + 2, h = glyph.h + 2
  const ink = new Uint8Array(w * h)
  for (const i of glyph.pixels) {
    const x = (i % image.width) - glyph.minX + 1, y = ((i / image.width) | 0) - glyph.minY + 1
    ink[y * w + x] = 1
  }
  const seen = new Uint8Array(w * h)
  let count = 0
  for (let start = 0; start < w * h; start++) {
    if (ink[start] || seen[start]) continue
    const stack = [start]
    seen[start] = 1
    let border = false, size = 0
    while (stack.length) {
      const i = stack.pop(); size++
      const x = i % w, y = (i / w) | 0
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (!ink[j] && !seen[j]) { seen[j] = 1; stack.push(j) }
      }
    }
    if (!border && size > 6) count++
  }
  return count
}

export function createReader(ocr) {
  const box = (image, rect, scale) => cropGray(image, rect[0] * scale, rect[1] * scale, rect[2] * scale, rect[3] * scale)

  // Circled team letter: largest glyph inside the circle, classified by its holes (large letters in the
  // set panels 1-4, small ones in the fifth set and in the rosters)
  function readLetter(image, rect, scale) {
    const crop = box(image, rect, scale)
    const glyphs = components(crop).filter(c => c.h > crop.height * 0.18 && c.h < crop.height * 0.8 && c.w < crop.width * 0.8 &&
      c.minX > 0 && c.minY > 0 && c.maxX < crop.width - 1 && c.maxY < crop.height - 1)
    if (!glyphs.length) return null
    const glyph = glyphs.sort((a, b) => b.pixels.length - a.pixels.length)[0]
    const n = holes(crop, glyph)
    return n === 1 ? 'A' : n === 2 ? 'B' : null
  }

  async function ocrGlyphs(cleaned, glyphs, whitelist) {
    const result = await ocr(glyphImage(cleaned, glyphs), { whitelist, psm: PSM_WORD })
    return { text: result.text.replace(/\s+/g, ''), confidence: result.confidence }
  }

  // One character per glyph (fixed printed font): the most reliable reading of digits
  async function ocrEachGlyph(cleaned, whitelist) {
    let text = '', confidence = 100
    for (const glyph of cleaned.glyphs) {
      const read = await ocr(glyphImage(cleaned, [glyph], { pad: 8 }), { whitelist, psm: PSM_CHAR })
      const char = read.text.replace(/\s+/g, '')
      if (char.length !== 1) return null
      text += char
      confidence = Math.min(confidence, read.confidence)
    }
    return { text, confidence }
  }

  // A number (or "X") in a cell: candidates from single glyphs, the cleaned group and the raw lower part
  // open: remove thin strokes first (the "/" mark drawn over the values of the service turns);
  // accept(component, scale): which ink belongs to this cell
  async function readNumber(image, rect, scale, { allowX = false, ocrTop = 0, charHeight = 24, open = false, accept = () => true } = {}) {
    const crop = open ? openInk(box(image, rect, scale), Math.max(1, Math.round(scale)), RESTORE) : box(image, rect, scale)
    const cleaned = cleanCell(crop, { charHeight: charHeight * scale, accept: c => accept(c, scale) })
    if (!cleaned) return { empty: true }
    const whitelist = DIGITS + (allowX ? 'X' : '')
    const candidates = []
    const add = r => {
      const text = r.text.replace(/[^0-9X]/g, '')
      if (/^(X|\d{1,2})$/.test(text) && !candidates.some(c => c.text === text)) candidates.push({ text, confidence: r.confidence })
    }
    if (cleaned.glyphs.length <= 2) {
      const single = await ocrEachGlyph(cleaned, whitelist)
      if (single) add(single)
    }
    add(await ocrGlyphs(cleaned, cleaned.glyphs, whitelist))
    // second reading on the raw cell (below the small corner digits): digits touched by a "/" mark are
    // dropped by the glyph filter but read here
    const lower = cropGray(crop, 0, ocrTop * scale, crop.width, crop.height)
    add(await ocr(scaledImage(lower, { scale: 3 }), { whitelist, psm: PSM_WORD }))
    candidates.sort((a, b) => b.confidence - a.confidence)
    return { empty: false, ringed: cleaned.ringed, candidates }
  }

  // Digits of any length (date, match number)
  async function readDigits(image, rect, scale) {
    const cleaned = cleanCell(box(image, rect, scale), { charHeight: 24 * scale })
    if (!cleaned) return { text: '', confidence: 100 }
    const read = await ocrGlyphs(cleaned, cleaned.glyphs, DIGITS)
    return { text: read.text.replace(/\D/g, ''), confidence: read.confidence }
  }

  // Digits of one side of a pair: a single digit is read in single-character mode (word mode often
  // returns nothing for it)
  async function readGroup(cleaned, group) {
    const modes = group.length === 1 ? [PSM_CHAR, PSM_WORD] : [PSM_WORD, PSM_CHAR]
    let read = null
    for (const psm of modes) {
      if (psm === PSM_CHAR && group.length > 2) continue
      const result = await ocr(glyphImage(cleaned, group, { pad: psm === PSM_CHAR ? 8 : 12 }), { whitelist: DIGITS, psm })
      read = { text: result.text.replace(/\s+/g, ''), confidence: result.confidence }
      if (/^\d{1,2}$/.test(read.text) && read.text.length <= group.length) return read
    }
    return read
  }

  // "a : b" (substitution scores, time-outs): the two numbers are read separately
  async function readPair(image, rect, scale) {
    const crop = box(image, rect, scale)
    const cleaned = cleanCell(crop, { charHeight: 24 * scale })
    if (!cleaned) return { empty: true }
    const groups = splitPair(cleaned.glyphs)
    if (groups) {
      const [a, b] = await Promise.all(groups.map(group => readGroup(cleaned, group)))
      if (/^\d{1,2}$/.test(a.text) && /^\d{1,2}$/.test(b.text)) {
        return { empty: false, value: `${Number(a.text)}:${Number(b.text)}`, confidence: Math.min(a.confidence, b.confidence) }
      }
    }
    const whole = await ocr(scaledImage(crop, { scale: 3 }), { whitelist: `${DIGITS}:`, psm: PSM_LINE })
    const match = whole.text.replace(/\s+/g, '').match(/^(\d{1,2}):(\d{1,2})$/)
    return match ? { empty: false, value: `${Number(match[1])}:${Number(match[2])}`, confidence: whole.confidence } : { empty: false, value: null, confidence: 0 }
  }

  async function readText(image, rect, scale, { whitelist = '', psm = PSM_LINE, upscale = 2, charHeight = 22 } = {}) {
    const crop = cleanText(box(image, rect, scale), { charHeight: charHeight * scale })
    if (!crop || inkRatio(crop) < 0.004) return { text: '', confidence: 100 }
    const result = await ocr(scaledImage(crop, { scale: upscale }), { whitelist, psm })
    return { text: result.text.replace(/\s+/g, ' ').trim(), confidence: result.confidence }
  }

  async function readSide(image, scale, layout, side, top, rounds) {
    const { rows, turns, timeouts } = layout.cellRows(rounds)
    const cell = (c, [a, b], inset = 3) => [side.cols[c] + inset, top + a + inset, side.cols[c + 1] - 1, top + b - inset]
    const result = { lineup: [], entrants: [], scoreIn: [], scoreOut: [], turns: Array(36).fill(null), timeouts: [] }
    for (let c = 0; c < 6; c++) {
      // open: drop the thin ring drawn around a number (captain, player who cannot re-enter)
      result.lineup.push(await readNumber(image, cell(c, rows.lineup), scale, { open: true }))
      result.entrants.push(await readNumber(image, cell(c, rows.entrant), scale, { open: true }))
      result.scoreIn.push(await readPair(image, cell(c, rows.scoreIn), scale))
      result.scoreOut.push(await readPair(image, cell(c, rows.scoreOut), scale))
    }
    const halfRounds = turns.length // 4 (rounds 1-4 | 5-8) or 3 (1-3 | 4-6)
    for (const [row, [a, b]] of turns.entries()) {
      for (const half of [0, 1]) {
        const round = row + 1 + half * halfRounds
        if (round > 6) continue
        for (let c = 0; c < 6; c++) {
          // the values may overflow the half-cell line: crops overlap, a value belongs to the half where it starts
          const x0 = side.cols[c] + (half ? 44 : 3), x1 = side.cols[c] + (half ? 84 : 54)
          const accept = half ? (g => g.minX > 1) : ((g, s) => g.minX < 38 * s)
          result.turns[(round - 1) * 6 + c] = { ...(await readNumber(image, [x0, top + a + 2, x1, top + b - 2], scale, { allowX: round === 1 && c === 0, ocrTop: 9, open: true, accept })), round, column: c }
        }
      }
    }
    for (const [a, b] of timeouts) result.timeouts.push(await readPair(image, [side.t[0] + 6, top + a + 3, side.t[1] - 6, top + b - 3], scale))
    return result
  }

  async function readPage1(image, onProgress = () => {}) {
    const layout = detectLayout(image)
    if (!layout) throw Error('Referto TieBreakTech: modello del referto non riconosciuto.')
    const scale = image.width / layout.width
    const header = { version: layout.version }
    for (const [key, rect] of Object.entries(layout.header)) {
      if (key.startsWith('gender')) continue
      if (['day', 'month', 'year', 'number'].includes(key)) {
        const read = await readDigits(image, rect, scale)
        header[key] = { text: read.text, confidence: read.confidence }
      } else if (key === 'date') {
        // "dd/mm/yyyy" in one field (version 2): split into the fields of version 1
        const read = await readText(image, rect, scale, { whitelist: `${DIGITS}/` })
        const parts = read.text.replace(/\s/g, '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)?.slice(1) || ['', '', '']
        for (const [i, part] of ['day', 'month', 'year'].entries()) header[part] = { text: parts[i], confidence: read.confidence }
      } else if (key.startsWith('team')) header[key] = await rosterName(image, rect, scale)
      else header[key] = await readText(image, rect, scale)
    }
    const male = inkRatio(box(image, layout.header.genderMale, scale)), female = inkRatio(box(image, layout.header.genderFemale, scale))
    header.gender = Math.abs(male - female) > 0.03 ? (female > male ? 'Femminile' : 'Maschile') : ''
    onProgress('risultato')

    const result = {
      letters: layout.result.letters.map(rect => readLetter(image, rect, scale)),
      abbreviations: [],
      rows: [],
    }
    for (const rect of layout.result.abbreviations) result.abbreviations.push(await readText(image, rect, scale))
    for (const row of layout.result.rows) {
      result.rows.push({
        left: await readNumber(image, row.left, scale),
        right: await readNumber(image, row.right, scale),
        minutes: await readNumber(image, row.minutes, scale),
      })
    }

    const sets = []
    // version 2: libero exchanges of each set, as page 2 of version 1 gives them
    const liberos = layout.liberoRows ? [] : null
    for (const panel of layout.setPanels) {
      onProgress(`set ${panel.set}`)
      const letters = panel.sides.map(side => readLetter(image, side.letter, scale))
      const { rows, turns } = layout.cellRows(panel.rounds || 4)
      const lineupInk = panel.sides.some(side => inkRatio(box(image, [side.cols[0], panel.top, side.cols[6], panel.top + rows.lineup[1]], scale)) > 0.02)
      if (!lineupInk) {
        sets.push({ set: panel.set, played: false })
        liberos?.push(panel.sides.map(() => ({ letter: null, entries: [] })))
        continue
      }
      const sides = []
      for (const side of panel.sides) sides.push(await readSide(image, scale, layout, side, panel.top, panel.rounds || 4))
      const entry = { set: panel.set, played: true, letters, sides }
      const columns = []
      if (liberos) for (const [i, side] of panel.sides.entries()) columns.push({ letter: letters[i], entries: await readLiberoColumn(image, scale, layout, side, panel.top) })
      if (panel.courtChange) {
        const cc = panel.courtChange
        const used = inkRatio(box(image, [cc.cols[0], panel.top + turns[0][0], cc.cols[6], panel.top + turns.at(-1)[1]], scale)) > 0.02
        if (used) {
          entry.courtChange = {
            letter: readLetter(image, cc.letter, scale),
            points: await readNumber(image, cc.points, scale),
            side: await readSide(image, scale, layout, cc, panel.top, panel.rounds || 4),
          }
          // the exchanges after the court change continue those of the team
          const column = columns.find(c => c.letter && c.letter === entry.courtChange.letter)
          if (column) column.entries.push(...await readLiberoColumn(image, scale, layout, cc, panel.top))
        }
      }
      sets.push(entry)
      liberos?.push(columns)
    }

    onProgress('atleti')
    const { roster: table } = layout
    const roster = { letters: table.letters.map(rect => readLetter(image, rect, scale)), teams: [[], []] }
    const rows = rosterRows(image, scale, table)
    for (const [team, columns] of table.columns.entries()) {
      for (const [y0, y1] of rows) {
        const number = await rosterNumber(image, [columns.number[0] + 2, y0 + 3, columns.number[1] - 2, y1 - 3], scale)
        if (number.empty) continue
        const name = await rosterName(image, [columns.name[0] + 4, y0 + 4, columns.name[1] - 4, y1 - 4], scale)
        roster.teams[team].push({ number, name })
      }
      for (const [role, [y0, y1]] of table.liberoRows.entries()) {
        const number = await rosterNumber(image, [columns.number[0] + 2, y0 + 2, columns.number[1] - 2, y1 - 2], scale)
        if (number.empty) continue
        const name = await rosterName(image, [columns.name[0] + 4, y0 + 2, columns.name[1] - table.liberoNameTrim, y1 - 2], scale)
        roster.teams[team].push({ number, name, libero: `L${role + 1}` })
      }
    }
    rosterTemplates(roster.teams.flat())
    return liberos ? { header, result, sets, roster, liberos } : { header, result, sets, roster }
  }

  // "LIBERO / UNDER" column of a team panel (version 2): one exchange per row, the left column first.
  // Ended exchanges are struck through with a thin line, removed before reading.
  async function readLiberoColumn(image, scale, layout, side, top) {
    const entries = []
    for (let c = 0; c < 2; c++) {
      for (let r = 1; r < layout.liberoRows.length; r++) {
        const rect = [side.libero[c] + 3, top + layout.liberoRows[r - 1] + 3, side.libero[c + 1] - 3, top + layout.liberoRows[r] - 3]
        const candidates = await readSmall(image, rect, scale, { whitelist: `${DIGITS}-`, variants: ENTRY_VARIANTS, prepare: removeStrike })
        if (!candidates.length) return entries
        entries.push({ candidates, extent: inkExtent(box(image, rect, scale)) / scale })
      }
    }
    return entries
  }

  // Jersey numbers of the roster: small thin print. Readings of the glyphs and of smooth enlargements
  // (as on page 2) vote together
  async function rosterNumber(image, rect, scale) {
    const glyphs = await readNumber(image, rect, scale, { charHeight: 15 })
    if (glyphs.empty) return glyphs
    const votes = await readSmall(image, rect, scale, { whitelist: DIGITS, variants: [[3, PSM_LINE], [4, PSM_LINE], [5, PSM_LINE], [4, PSM_WORD]] })
    for (const read of glyphs.candidates) {
      const known = votes.find(c => c.text === read.text)
      if (known) known.votes++; else votes.push({ ...read, votes: 1 })
    }
    const candidates = votes.filter(c => /^\d{1,2}$/.test(c.text)).sort((a, b) => b.votes - a.votes || b.confidence - a.confidence)
    const cleaned = cleanCell(box(image, rect, scale), { charHeight: 15 * scale })
    const shapes = cleaned ? cleaned.glyphs.filter(g => !g.ring).map(g => glyphShape(g, cleaned.image.width)) : []
    return { empty: false, candidates, shapes }
  }

  // The roster uses one font: digits read with near unanimity become templates, and every number is also
  // read glyph by glyph against them (the OCR engine confuses some thin digits, e.g. 3/5, 8/5, always the
  // same way). The template reading adds votes; the shapes are then dropped.
  function rosterTemplates(entries) {
    const templates = []
    for (const { number } of entries) {
      const total = number.candidates.reduce((sum, c) => sum + c.votes, 0)
      const top = number.candidates[0]
      if (top && top.votes >= total * 0.75 && top.votes >= 5 && top.text.length === number.shapes.length) {
        number.shapes.forEach((shape, i) => templates.push({ digit: top.text[i], shape }))
      }
    }
    for (const { number } of entries) {
      const { shapes } = number
      delete number.shapes
      if (!shapes?.length || shapes.length > 2 || new Set(templates.map(t => t.digit)).size < 4) continue
      let text = '', worst = 1
      for (const shape of shapes) {
        const scores = new Map()
        for (const t of templates) scores.set(t.digit, Math.max(scores.get(t.digit) ?? -1, shapeSimilarity(shape, t.shape)))
        const [[digit, score], second = [null, -1]] = [...scores].sort((a, b) => b[1] - a[1])
        text += digit
        worst = Math.min(worst, score - second[1] > 0.04 ? score : 0)
      }
      if (worst < 0.8) continue
      const known = number.candidates.find(c => c.text === text)
      if (known) known.votes += 4; else number.candidates.push({ text, confidence: Math.round(worst * 100), votes: 4 })
      number.candidates.sort((a, b) => b.votes - a.votes || b.confidence - a.confidence)
    }
  }

  // Names: smooth enlargements read O and C apart much better than binarized pixels; the most confident wins
  async function rosterName(image, rect, scale) {
    const reads = await readSmall(image, rect, scale, { variants: [[2, PSM_LINE], [3, PSM_LINE]] })
    return reads.sort((a, b) => b.confidence - a.confidence)[0] || readText(image, rect, scale)
  }

  // Row lines of the roster table (detected: the rows are not evenly spaced)
  function rosterRows(image, scale, table) {
    const x0 = Math.round(table.lineX[0] * scale), x1 = Math.round(table.lineX[1] * scale)
    const lines = []
    for (let y = Math.round(table.area[0] * scale); y < Math.round(table.area[1] * scale); y++) {
      let dark = 0
      for (let x = x0; x < x1; x++) if (image.data[y * image.width + x] < 110) dark++
      if (dark > (x1 - x0) * 0.85 && (!lines.length || y - lines.at(-1) > 6 * scale)) lines.push(y)
    }
    const rows = []
    for (let i = 1; i < lines.length; i++) if (lines[i] - lines[i - 1] > 20 * scale) rows.push([lines[i - 1] / scale, lines[i] / scale])
    return rows
  }

  // Width of the written text in a cell (first to last column with ink; grid lines left out)
  function inkExtent(crop) {
    let first = -1, last = -1
    for (let x = 0; x < crop.width; x++) {
      let dark = 0
      for (let y = 0; y < crop.height; y++) if (crop.data[y * crop.width + x] < DARK) dark++
      if (dark > 0 && dark < crop.height * 0.8) { if (first < 0) first = x; last = x }
    }
    return first < 0 ? 0 : last - first + 1
  }

  // Page 2 is printed very small (~7 px characters): gray crops upscaled smoothly, read with several
  // scales/modes; candidates sorted by votes (the parser checks them against the rosters)
  // variants: [scale, psm, smoothImage options]; prepare: applied to the crop first
  async function readSmall(image, rect, scale, { whitelist = '', variants = [[6, PSM_LINE], [8, PSM_LINE], [10, PSM_LINE]], prepare = crop => crop } = {}) {
    const crop = prepare(box(image, rect, scale))
    if (crop.data.filter(v => v < DARK).length < 8) return []
    const candidates = []
    for (const [factor, psm, options = {}] of variants) {
      const read = await ocr(smoothImage(crop, { scale: factor, ...options }), { whitelist, psm })
      const text = read.text.replace(/\s+/g, ' ').trim()
      if (!text) continue
      const known = candidates.find(c => c.text === text)
      if (known) { known.votes++; known.confidence = Math.max(known.confidence, read.confidence) } else candidates.push({ text, confidence: read.confidence, votes: 1 })
    }
    return candidates.sort((x, y) => y.votes - x.votes || y.confidence - x.confidence)
  }

  async function readPage2(image) {
    const scale = image.width / PAGE2_WIDTH
    const best = list => list[0] || { text: '', confidence: 0 }
    const text = [[4, PSM_LINE], [6, PSM_LINE]]
    const teams = {}, liberos = { A: [], B: [] }
    for (const team of ['A', 'B']) {
      teams[team] = best(await readSmall(image, LIBERO_PAGE.teams[team], scale, { variants: text }))
      for (const libero of LIBERO_PAGE.liberos[team]) {
        liberos[team].push({
          name: best(await readSmall(image, libero.name, scale, { variants: text })),
          number: await readSmall(image, libero.number, scale, { whitelist: DIGITS, variants: [[4, PSM_LINE], [4, PSM_CHAR], [6, PSM_LINE], [8, PSM_LINE], [6, PSM_CHAR]] }),
        })
      }
    }
    const sets = []
    for (const cols of LIBERO_PAGE.sets) {
      const columns = []
      for (let c = 0; c < 2; c++) {
        const letterRect = [cols[c] + 2, LIBERO_PAGE.letterRow[0], cols[c + 1] - 2, LIBERO_PAGE.letterRow[1]]
        const letter = readLetter(image, letterRect, scale)
        const entries = []
        for (const [y0, y1] of LIBERO_PAGE.rows) {
          const candidates = await readSmall(image, [cols[c] + 1.5, y0 + 1.5, cols[c + 1] - 2, y1 - 1], scale, { whitelist: `${DIGITS}-`, variants: ENTRY_VARIANTS })
          if (!candidates.length) break
          entries.push({ candidates, extent: inkExtent(box(image, [cols[c] + 1.5, y0 + 1.5, cols[c + 1] - 2, y1 - 1], scale)) / scale })
        }
        columns.push({ letter, entries })
      }
      sets.push(columns)
    }
    return { teams, liberos, sets }
  }

  return { readPage1, readPage2, readNumber, readPair, readLetter }
}
