// Geometry of the TieBreakTech (TBT ScoreSheet) scoresheet, printed as images.
// Page 1: A3 landscape, reference width 3309 px (the embedded image, ~211 dpi): all coordinates below are
// in that reference and are scaled to the rendered width. Page 2 ("Referto aggiuntivo", libero
// exchanges): reference width 1080 px. Measured on two real scoresheets: the grid lines coincide to the
// pixel, the template is fixed.

export const PAGE1_WIDTH = 3309
export const PAGE2_WIDTH = 1080

// Horizontal lines that identify the template (checked before reading anything)
export const SIGNATURE_ROWS = [458, 498, 539, 580, 620, 660, 700, 740, 780, 903, 943, 984, 1024, 1064, 1104, 1144, 1184, 1225]

// Columns I..VI (7 boundaries) and the "T" (time-out) box of each team panel
const PANELS = {
  p1L: { cols: [524, 607, 693, 779, 865, 950, 1035], t: [1035, 1164] },
  p1R: { cols: [1164, 1248, 1334, 1420, 1505, 1591, 1676], t: [1676, 1806] },
  p2L: { cols: [1888, 1972, 2058, 2144, 2230, 2315, 2400], t: [2400, 2529] },
  p2R: { cols: [2529, 2613, 2699, 2784, 2870, 2956, 3041], t: [3041, 3171] },
  p5L: { cols: [559, 642, 728, 814, 900, 986, 1071], t: [1071, 1162] },
  p5R: { cols: [1162, 1248, 1333, 1419, 1505, 1591, 1676], t: [1676, 1802] },
  p5C: { cols: [1886, 1974, 2059, 2146, 2232, 2318, 2403], t: [2403, 2526] }, // court change (fifth set)
}

// Row offsets from the top of the "Giocatori titolari" row
const ROWS = { lineup: [0, 40], entrant: [40, 81], scoreIn: [81, 122], scoreOut: [122, 162] }
const TURNS_4 = [[162, 202], [202, 242], [242, 282], [282, 322]] // rounds 1/5, 2/6, 3/7, 4/8
const TURNS_3 = [[162, 202], [202, 242], [242, 284]] // fifth set: rounds 1/4, 2/5, 3/6
const TIMEOUTS_4 = [[242, 282], [282, 322]]
const TIMEOUTS_3 = [[202, 242], [242, 284]]

// Circled team letter (A/B) in the header of each panel: [x0, y0, x1, y1]
const letterBox = (x, y) => [x - 38, y - 34, x + 38, y + 34]

export const SET_PANELS = [
  { set: 1, top: 458, sides: [{ ...PANELS.p1L, letter: letterBox(972, 370) }, { ...PANELS.p1R, letter: letterBox(1225, 370) }] },
  { set: 2, top: 458, sides: [{ ...PANELS.p2L, letter: letterBox(2360, 368) }, { ...PANELS.p2R, letter: letterBox(2587, 368) }] },
  { set: 3, top: 903, sides: [{ ...PANELS.p1L, letter: letterBox(972, 815) }, { ...PANELS.p1R, letter: letterBox(1225, 815) }] },
  { set: 4, top: 903, sides: [{ ...PANELS.p2L, letter: letterBox(2360, 813) }, { ...PANELS.p2R, letter: letterBox(2587, 813) }] },
  {
    set: 5,
    top: 1352,
    rounds: 3,
    sides: [{ ...PANELS.p5L, letter: letterBox(996, 1260) }, { ...PANELS.p5R, letter: letterBox(1214, 1260) }],
    courtChange: { ...PANELS.p5C, letter: letterBox(2025, 1260), points: [2290, 1232, 2372, 1290] },
  },
]

export const cellRows = rounds => ({ rows: ROWS, turns: rounds === 3 ? TURNS_3 : TURNS_4, timeouts: rounds === 3 ? TIMEOUTS_3 : TIMEOUTS_4 })

// "Risultato finale": one row per set; points of the left and right team of the table, duration
export const RESULT = {
  letters: [letterBox(2190, 1738), letterBox(2265, 1738)],
  rows: [1856, 1912, 1968, 2024, 2076].map(y => ({
    left: [2076, y - 26, 2140, y + 24],
    right: [2310, y - 26, 2380, y + 24],
    minutes: [2218, y - 26, 2292, y + 24],
  })),
  abbreviations: [[2012, 1712, 2142, 1765], [2302, 1712, 2432, 1765]],
}

// Header fields of page 1
export const HEADER = {
  competition: [470, 128, 1500, 168],
  city: [228, 180, 830, 222],
  venue: [228, 228, 660, 270],
  day: [1352, 180, 1412, 222],
  month: [1432, 180, 1490, 222],
  year: [1512, 180, 1592, 222],
  number: [1140, 228, 1222, 270],
  genderMale: [322, 284, 368, 330],
  genderFemale: [492, 284, 538, 330],
  category: [712, 280, 1000, 326],
}

// Roster table (bottom right): columns of jersey numbers and names for the two teams
export const ROSTER = {
  letters: [letterBox(2595, 1265), letterBox(3125, 1265)],
  area: [1340, 1845], // y range of the athletes rows (row lines are detected)
  columns: [{ number: [2548, 2588], name: [2584, 2858] }, { number: [2862, 2900], name: [2898, 3170] }],
  liberoRows: [[1866, 1900], [1900, 1936]],
}

// Page 2: libero exchanges, one table per set (two columns, team letter in the header row)
export const LIBERO_PAGE = {
  sets: [[52, 132, 211], [243, 322, 402], [435, 514, 594], [632, 712, 791], [824, 904, 983]],
  letterRow: [238, 255],
  rows: Array.from({ length: 23 }, (_, i) => [255 + i * 17.05, 272 + i * 17.05]),
  // inside the boxes (the borders are left out)
  teams: { A: [143, 140, 368, 157], B: [143, 168, 368, 185] },
  liberos: {
    A: [{ name: [438, 140, 561, 157], number: [637, 140, 696, 157] }, { name: [763, 140, 886, 157], number: [962, 140, 1021, 157] }],
    B: [{ name: [438, 168, 561, 185], number: [637, 168, 696, 185] }, { name: [763, 168, 886, 185], number: [962, 168, 1021, 185] }],
  },
}
