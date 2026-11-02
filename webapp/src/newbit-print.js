// Import of NEWBIT scoresheets printed with a virtual PDF printer ("Microsoft: Print To PDF"): the printer
// redraws every character as a filled shape, so the PDF has no text, and turns the A3 sheet to portrait.
// The shapes are still vectors: each one is rasterized on a small grid and compared with the templates of
// the NEWBIT fonts (data/newbit-glyphs.json, read from a printed scoresheet and labeled by hand), then the
// characters are joined into words placed on the geometry of the original PDF and read by the FIPAV parser.
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import templateData from './data/newbit-glyphs.json' with { type: 'json' }
import { parseFipav } from './pdf-parser.js'

const [GW, GH] = templateData.grid
const templates = templateData.glyphs.map(([label, w, h, cells]) => ({
  label: label || null, w, h, cells: Float32Array.from(cells, digit => Number(digit) / 9),
}))

// Path data of pdf.js (DrawOPS): moveTo 0, lineTo 1, curveTo 2, quadraticCurveTo 3, closePath 4.
// Returns the closed polygons in page coordinates, curves flattened.
function polygons(data, m) {
  const polys = []
  let current = null, px = 0, py = 0
  const add = (x, y) => {
    current.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
    px = x
    py = y
  }
  for (let i = 0; i < data.length;) {
    const op = data[i++]
    if (op === 0) {
      current = []
      polys.push(current)
      add(data[i++], data[i++])
    } else if (op === 1) {
      add(data[i++], data[i++])
    } else if (op === 2) {
      const [x1, y1, x2, y2, x3, y3] = data.slice(i, i + 6), x0 = px, y0 = py
      i += 6
      for (let t = 1; t <= 6; t++) {
        const s = t / 6, u = 1 - s
        add(u * u * u * x0 + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3,
          u * u * u * y0 + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3)
      }
    } else if (op === 3) {
      const [x1, y1, x2, y2] = data.slice(i, i + 4), x0 = px, y0 = py
      i += 4
      for (let t = 1; t <= 4; t++) {
        const s = t / 4, u = 1 - s
        add(u * u * x0 + 2 * u * s * x1 + s * s * x2, u * u * y0 + 2 * u * s * y1 + s * s * y2)
      }
    }
  }
  return polys.filter(poly => poly.length > 2)
}

const multiply = (a, b) => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]

// Filled shapes of the page with their color, in page coordinates
export function filledShapes(operatorList) {
  const shapes = []
  const stack = []
  let matrix = [1, 0, 0, 1, 0, 0], color = null
  operatorList.fnArray.forEach((fn, index) => {
    const args = operatorList.argsArray[index]
    if (fn === OPS.save) stack.push({ matrix, color })
    else if (fn === OPS.restore) ({ matrix, color } = stack.pop() || { matrix, color })
    else if (fn === OPS.transform) matrix = multiply(matrix, args)
    else if (fn === OPS.setFillRGBColor) color = args[0]
    else if (fn === OPS.constructPath && (args[0] === OPS.fill || args[0] === OPS.eoFill)) {
      shapes.push({ polys: polygons(args[1][0], matrix), color, evenOdd: args[0] === OPS.eoFill })
    }
  })
  return shapes
}

// The four ways the sheet can lie on the page: page coordinates (y up) to sheet coordinates (y down)
const ORIENTATIONS = [
  ([x, y]) => [x, -y],
  ([x, y]) => [y, x],
  ([x, y]) => [-x, y],
  ([x, y]) => [-y, -x],
]

function bounds(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const poly of polys) {
    for (const [x, y] of poly) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
  }
  return { x0, y0, x1, y1 }
}

// The printer may draw simple characters together in one shape (e.g. "ll" or "l." as rectangles): pieces
// that overlap horizontally belong to the same character (the dot of an "i", the holes of a "B")
function splitCharacters(polys) {
  const groups = []
  for (const piece of polys.map(poly => ({ poly, box: bounds([poly]) })).sort((a, b) => a.box.x0 - b.box.x0)) {
    const group = groups.find(g => piece.box.x0 < g.box.x1 - 0.04 && piece.box.x1 > g.box.x0 + 0.04)
    if (group) {
      group.polys.push(piece.poly)
      group.box = bounds(group.polys)
    } else groups.push({ polys: [piece.poly], box: piece.box })
  }
  return groups
}

const inside = (polys, x, y, evenOdd) => {
  let winding = 0
  for (const poly of polys) {
    for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
      const [x1, y1] = poly[k], [x2, y2] = poly[j]
      if ((y1 <= y) !== (y2 <= y) && x1 + (y - y1) * (x2 - x1) / (y2 - y1) > x) winding += y2 > y1 ? 1 : -1
    }
  }
  return evenOdd ? winding % 2 !== 0 : winding !== 0
}

// Coverage of each cell of a GW×GH grid laid over the character (3×3 samples per cell): along each row
// of samples the edges crossed are found once, then the winding number is summed from the right
function raster(polys, box, evenOdd) {
  const w = Math.max(box.x1 - box.x0, 1e-3), h = Math.max(box.y1 - box.y0, 1e-3)
  const cells = new Float32Array(GW * GH)
  for (let row = 0; row < GH * 3; row++) {
    const y = box.y0 + (row + 0.5) / (GH * 3) * h
    const crossings = []
    for (const poly of polys) {
      for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
        const [x1, y1] = poly[k], [x2, y2] = poly[j]
        if ((y1 <= y) !== (y2 <= y)) crossings.push([x1 + (y - y1) * (x2 - x1) / (y2 - y1), y2 > y1 ? 1 : -1])
      }
    }
    crossings.sort((a, b) => b[0] - a[0])
    let winding = 0, next = 0
    for (let column = GW * 3 - 1; column >= 0; column--) {
      const x = box.x0 + (column + 0.5) / (GW * 3) * w
      while (next < crossings.length && crossings[next][0] > x) winding += crossings[next++][1]
      if (evenOdd ? winding % 2 !== 0 : winding !== 0) cells[Math.floor(row / 3) * GW + Math.floor(column / 3)] += 1 / 9
    }
  }
  return { cells, w, h }
}

// Difference of proportions, then of shape (mean coverage difference)
const proportion = shape => Math.log((shape.w + 0.22) / (shape.h + 0.22))
for (const template of templates) template.proportion = proportion(template)

function classify(shape) {
  const ratio = proportion(shape), limit = shape.cells.length
  let best = null, bestDistance = Infinity
  for (const template of templates) {
    const proportions = Math.abs(ratio - template.proportion)
    if (proportions >= bestDistance) continue
    // stop adding up the cells as soon as this template cannot be the closest
    const budget = (bestDistance - proportions) * limit
    let sum = 0
    for (let i = 0; i < limit && sum < budget; i++) sum += Math.abs(shape.cells[i] - template.cells[i])
    const d = sum / limit + proportions
    if (d < bestDistance) {
      bestDistance = d
      best = template
    }
  }
  return { label: best.label, distance: bestDistance }
}

// Characters of the sheet: shapes small enough to be a character, turned upright and classified.
// Shapes that are not characters (strike-outs, circles, crosses in the boxes) are kept as marks.
function readCharacters(shapes, orient) {
  const characters = []
  shapes.forEach((shape, index) => {
    const upright = shape.polys.map(poly => poly.map(orient))
    for (const { polys, box } of splitCharacters(upright)) {
      const w = box.x1 - box.x0, h = box.y1 - box.y0
      if (Math.max(w, h) >= 10.5 || Math.min(w, h) <= 0.34) continue
      characters.push({ polys, box, color: shape.color, evenOdd: shape.evenOdd, shape: index })
    }
  })
  return characters
}

// Orientation of the sheet: the one whose characters look most like the templates (sample of the shapes)
function findOrientation(shapes) {
  const sample = shapes.filter((_, index) => index % Math.max(1, Math.floor(shapes.length / 300)) === 0)
  let best = ORIENTATIONS[0], bestScore = Infinity
  for (const orient of ORIENTATIONS) {
    const characters = readCharacters(sample, orient).slice(0, 150)
    if (!characters.length) continue
    const score = characters.reduce((total, c) => total + classify(raster(c.polys, c.box, c.evenOdd)).distance, 0) / characters.length
    if (score < bestScore) {
      bestScore = score
      best = orient
    }
  }
  return best
}

const DESCENDERS = /[gpqy;,]/
const PUNCTUATION = /[.,:;'"°]/
const DIGIT_LIKE = /[0-9:/]/
// Letters drawn with the same shape in upper and lower case: the height decides
const SAME_SHAPE = /[cosuvwxzCOSUVWXZ]/

// Join characters into words: same color, same baseline, gaps smaller than 0.7 of the height (1.3 at colons)
function joinWords(characters) {
  const words = []
  for (const c of characters.sort((a, b) => a.box.x0 - b.box.x0)) {
    const h = c.box.y1 - c.box.y0
    const base = DESCENDERS.test(c.label) ? null : c.box.y1
    const small = PUNCTUATION.test(c.label)
    // scores are written with wide spaces around the colon ("11 : 12")
    const reach = w => (c.label === ':' || w.characters.at(-1).label === ':' ? 1.3 : 0.7) * w.h
    const word = words.find(w => w.color === c.color && c.box.x0 - w.x1 < reach(w) && c.box.x0 > w.x1 - 0.3 * w.h &&
      (base === null ? c.box.y0 >= w.top - 0.4 * w.h && c.box.y0 < w.base : Math.abs(base - w.base) < 0.2 * w.h) &&
      h < w.h * 1.6 && (small || h > w.h * 0.3))
    if (word) {
      word.characters.push(c)
      word.x1 = c.box.x1
      word.top = Math.min(word.top, c.box.y0)
      if (base !== null && !small && h > word.h) word.h = h
    } else {
      words.push({ x0: c.box.x0, x1: c.box.x1, base: base ?? c.box.y1, top: c.box.y0, h, color: c.color, characters: [c] })
    }
  }
  return words.map(word => ({ ...word, text: wordText(markSpaces(word)) }))
}

// Spaces: gaps between letters wider than 0.17 of the height and than twice the usual gap of the word
// (fonts with wide letter spacing). Never between digits, colons and slashes: "1" leaves wide gaps at its
// sides ("11:12"), and separate numbers are in separate cells, too far apart to be one word.
function markSpaces(word) {
  const gaps = word.characters.map((c, i) => (i ? (c.box.x0 - word.characters[i - 1].box.x1) / word.h : 0))
  const letterGaps = gaps.filter((gap, i) => i && /[A-Za-z]/.test(word.characters[i].label) && /[A-Za-z]/.test(word.characters[i - 1].label))
    .sort((a, b) => a - b)
  const usual = letterGaps.length ? letterGaps[Math.floor(letterGaps.length / 2)] : 0
  word.characters.forEach((c, i) => {
    const digits = i && DIGIT_LIKE.test(c.label) && DIGIT_LIKE.test(word.characters[i - 1].label)
    c.space = i > 0 && !digits && gaps[i] > Math.max(0.17, usual * 2)
  })
  return word
}

// Text of a word, with the choices the shape alone cannot make: upper or lower case of same-shape letters,
// "l" or "I" (both a bar), "O" or "0" (decided by the other characters of the token)
function wordText(word) {
  const tallest = Math.max(...word.characters.filter(c => !PUNCTUATION.test(c.label)).map(c => c.box.y1 - c.box.y0))
  const letters = word.characters.map(c => {
    if (!SAME_SHAPE.test(c.label)) return c.label
    return (c.box.y1 - c.box.y0) >= 0.85 * tallest ? c.label.toUpperCase() : c.label.toLowerCase()
  })
  const isLower = letter => /[a-zà-ù]/.test(letter || '')
  for (let i = 0; i < letters.length; i++) {
    if (letters[i] !== 'I') continue
    const previous = word.characters[i].space ? '' : letters[i - 1], next = word.characters[i + 1]?.space ? '' : letters[i + 1]
    if (isLower(previous) || (next && isLower(next) && /[A-Za-zà-ù]/.test(previous || ''))) letters[i] = 'l'
  }
  const text = letters.map((letter, i) => (word.characters[i].space ? ' ' : '') + letter).join('')
  return text.split(' ').map(token => {
    if (/^[0-9O:/.]+$/.test(token) && /[0-9]/.test(token)) return token.replace(/O/g, '0')
    if (/[A-NP-Z]/i.test(token.replace(/0/g, ''))) return token.replace(/0/g, 'O')
    return token
  }).join(' ')
}

// Labels of the printed form, with their place on the original sheet (normalized like parseItems, from
// the NEWBIT text PDFs): the printed copy is placed on the original geometry by matching them
const ANCHORS = [
  ['CAMPIONATOSERIE', 32.2, 50.5],
  ['OSSERVAZIONI', 364.7, 580.2],
  ['APPROVAZIONE', 363.1, 700.9],
  ['RISULTATOFINALE', 661.4, 584.4],
  ['TESSERATIAMMESSIINPANCHINA', 989.3, 670.0],
  ['FIRME', 1035.4, 754.2],
]
// Points per unit of font size on the normalized sheet: the NEWBIT page is 1048.82pt wide, normalized to A3
const NEWBIT_SCALE = 1190.55 / 1048.82
// Height of digits and capitals as a fraction of the font size (NEWBIT fonts)
const CAP_HEIGHT = 0.716
// Font sizes of the data in NEWBIT scoresheets: the size measured on the shapes is rounded to one of them,
// so the parser can tell the service turns (7pt) from the lineups (9pt)
const FONT_SIZES = [3.5, 5, 7, 9, 11, 13, 16]

// Least squares line through the points [from, to]
function fitLine(points) {
  const n = points.length
  const mx = points.reduce((s, [x]) => s + x, 0) / n, my = points.reduce((s, [, y]) => s + y, 0) / n
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0)
  const slope = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx
  return { slope, offset: my - slope * mx }
}

function placeOnSheet(words) {
  const squash = text => text.toUpperCase().replace(/[^A-Z]/g, '')
  const matches = ANCHORS.flatMap(([text, x, y]) => {
    const found = words.filter(w => squash(w.text) === text)
    return found.length === 1 ? [{ word: found[0], x, y }] : []
  })
  if (matches.length < 3) return null
  const fx = fitLine(matches.map(m => [m.word.x0, m.x])), fy = fitLine(matches.map(m => [m.word.base, m.y]))
  if (!(fx.slope > 0) || !(fy.slope > 0)) return null
  return { x: v => fx.slope * v + fx.offset, y: v => fy.slope * v + fy.offset, scale: fx.slope }
}

// Words of the printed scoresheet as parseFipav reads them: { text, x, y (baseline), size, shapes (indexes
// of the shapes drawing it) }, plus the marks (shapes that are not characters: strokes, circles, boxes)
export function readPrintedSheet(shapes) {
  const orient = findOrientation(shapes)
  const characters = readCharacters(shapes, orient).map(c => ({ ...c, ...classify(raster(c.polys, c.box, c.evenOdd)) }))
  const words = joinWords(characters.filter(c => c.label))
  const sheet = placeOnSheet(words)
  if (!sheet) return null
  const sizeOf = word => {
    const heights = word.characters.filter(c => /[0-9A-Z]/.test(c.label)).map(c => c.box.y1 - c.box.y0).sort((a, b) => a - b)
    const height = heights.length ? heights[Math.floor(heights.length / 2)] : word.h
    const points = height * sheet.scale / NEWBIT_SCALE / CAP_HEIGHT
    return FONT_SIZES.reduce((best, size) => (Math.abs(size - points) < Math.abs(best - points) ? size : best)) * NEWBIT_SCALE
  }
  return {
    words: words.map(word => ({
      text: word.text, x: sheet.x(word.x0), y: sheet.y(word.base), size: sizeOf(word), shapes: [...new Set(word.characters.map(c => c.shape))],
    })),
    marks: characters.filter(c => !c.label).map(c => {
      const cx = (c.box.x0 + c.box.x1) / 2, cy = (c.box.y0 + c.box.y1) / 2
      // a stroke of a cross passes through its center, the outline of a box does not
      return { x: sheet.x(cx), y: sheet.y(cy), throughCenter: inside(c.polys, cx, cy, c.evenOdd) }
    }),
  }
}

export const PRINTED_WARNING = {
  set: null, team: '', expected: 'PDF originale di NEWBIT', found: 'stampa in PDF', zone: 'Intero referto',
  message: 'Il PDF è una «stampa in PDF», non il file originale di NEWBIT: i caratteri sono stati riconosciuti dalla loro forma. Verifica i valori o, meglio, importa il file originale.',
}

// Match from the filled shapes of a printed NEWBIT scoresheet; null when the page is not one
export function parsePrintedShapes(shapes) {
  const sheet = readPrintedSheet(shapes)
  if (!sheet) return null
  // DIVISIONE: the cross in the MASCHILE (x < 140) or FEMMINILE (140–230) box of the header
  const cross = sheet.marks.filter(m => m.throughCenter && m.y > 52 && m.y < 70 && m.x > 100 && m.x < 230)
  const gender = cross.some(m => m.x < 140) ? 'Maschile' : cross.length ? 'Femminile' : ''
  const match = parseFipav(sheet.words, 1190.55, 841.89, null, { gender })
  return { ...match, importWarnings: [PRINTED_WARNING, ...match.importWarnings] }
}

export const parsePrintedNewbit = operatorList => parsePrintedShapes(filledShapes(operatorList))
