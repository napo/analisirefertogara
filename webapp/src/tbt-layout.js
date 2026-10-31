// Geometry of the TieBreakTech (TBT ScoreSheet) scoresheet, printed as images. Two versions of page 1 are
// known; the reader picks the one whose grid lines are where expected (detectLayout in tbt-reader.js).
// All coordinates of a layout are in its reference width and are scaled to the rendered width.
//
// Version 1: A3 landscape, reference width 3309 px (the embedded image, ~211 dpi), libero exchanges on
// page 2 ("Referto aggiuntivo", reference width 1080 px). Measured on two real scoresheets: the grid lines
// coincide to the pixel, the template is fixed.
// Version 2 ("ver: 26.10.x"): a single page, smaller cells, a "LIBERO / UNDER" column in every team panel
// with the libero exchanges, full team names in the header, a different result table. Measured on two
// scoresheets (3076 px image).

export const PAGE2_WIDTH = 1080

// Row offsets from the top of the "Giocatori titolari" row
const ROWS = { lineup: [0, 40], entrant: [40, 81], scoreIn: [81, 122], scoreOut: [122, 162] }
const TURNS_4 = [[162, 202], [202, 242], [242, 282], [282, 322]] // rounds 1/5, 2/6, 3/7, 4/8
const TURNS_3 = [[162, 202], [202, 242], [242, 284]] // fifth set: rounds 1/4, 2/5, 3/6
const TIMEOUTS_4 = [[242, 282], [282, 322]]
const TIMEOUTS_3 = [[202, 242], [242, 284]]

// Circled team letter (A/B) in the header of each panel: [x0, y0, x1, y1]
const letterBox = (x, y, rx = 38, ry = 34) => [x - rx, y - ry, x + rx, y + ry]

// Columns I..VI (7 boundaries) and the "T" (time-out) box of each team panel
const PANELS_V1 = {
  p1L: { cols: [524, 607, 693, 779, 865, 950, 1035], t: [1035, 1164] },
  p1R: { cols: [1164, 1248, 1334, 1420, 1505, 1591, 1676], t: [1676, 1806] },
  p2L: { cols: [1888, 1972, 2058, 2144, 2230, 2315, 2400], t: [2400, 2529] },
  p2R: { cols: [2529, 2613, 2699, 2784, 2870, 2956, 3041], t: [3041, 3171] },
  p5L: { cols: [559, 642, 728, 814, 900, 986, 1071], t: [1071, 1162] },
  p5R: { cols: [1162, 1248, 1333, 1419, 1505, 1591, 1676], t: [1676, 1802] },
  p5C: { cols: [1886, 1974, 2059, 2146, 2232, 2318, 2403], t: [2403, 2526] }, // court change (fifth set)
}

const V1 = {
  version: 1,
  // substitutes, score at the change and time-outs: height of the digits, thin marks to remove
  substitutionPrint: { charHeight: 24, open: true },
  width: 3309,
  ratio: 2339 / 3309,
  // Horizontal lines that identify the template (checked before reading anything), over the x range
  signature: { x: [530, 1030], rows: [458, 498, 539, 580, 620, 660, 700, 740, 780, 903, 943, 984, 1024, 1064, 1104, 1144, 1184, 1225] },
  cellRows: rounds => ({ rows: ROWS, turns: rounds === 3 ? TURNS_3 : TURNS_4, timeouts: rounds === 3 ? TIMEOUTS_3 : TIMEOUTS_4 }),
  setPanels: [
    { set: 1, top: 458, sides: [{ ...PANELS_V1.p1L, letter: letterBox(972, 370) }, { ...PANELS_V1.p1R, letter: letterBox(1225, 370) }] },
    { set: 2, top: 458, sides: [{ ...PANELS_V1.p2L, letter: letterBox(2360, 368) }, { ...PANELS_V1.p2R, letter: letterBox(2587, 368) }] },
    { set: 3, top: 903, sides: [{ ...PANELS_V1.p1L, letter: letterBox(972, 815) }, { ...PANELS_V1.p1R, letter: letterBox(1225, 815) }] },
    { set: 4, top: 903, sides: [{ ...PANELS_V1.p2L, letter: letterBox(2360, 813) }, { ...PANELS_V1.p2R, letter: letterBox(2587, 813) }] },
    {
      set: 5,
      top: 1352,
      rounds: 3,
      sides: [{ ...PANELS_V1.p5L, letter: letterBox(996, 1260) }, { ...PANELS_V1.p5R, letter: letterBox(1214, 1260) }],
      courtChange: { ...PANELS_V1.p5C, letter: letterBox(2025, 1260), points: [2290, 1232, 2372, 1290] },
    },
  ],
  // "Risultato finale": one row per set; points of the left and right team of the table, duration
  result: {
    letters: [letterBox(2190, 1738), letterBox(2265, 1738)],
    rows: [1856, 1912, 1968, 2024, 2076].map(y => ({
      left: [2076, y - 26, 2140, y + 24],
      right: [2310, y - 26, 2380, y + 24],
      minutes: [2218, y - 26, 2292, y + 24],
    })),
    abbreviations: [[2012, 1712, 2142, 1765], [2302, 1712, 2432, 1765]],
  },
  header: {
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
  },
  // Roster table (bottom right): columns of jersey numbers and names for the two teams
  roster: {
    letters: [letterBox(2595, 1265), letterBox(3125, 1265)],
    area: [1340, 1870], // y range of the athletes rows (row lines are detected); a 13th athlete sits beside the libero title of the other team
    lineX: [2610, 2840], // x range where the row lines are looked for
    columns: [{ number: [2548, 2588], name: [2584, 2858] }, { number: [2862, 2900], name: [2898, 3170] }],
    liberoRows: [[1866, 1900], [1900, 1936]],
    liberoNameTrim: 70, // the libero rows end with other fields
  },
}

// Version 2 is measured in pixels of its 3076 px image and stored ×1.15: the cells then have the size of
// the version 1 cells, and the offsets of the reader inside a cell (half cells of the service turns, glyph
// heights) apply unchanged
const V2_SCALE = 1.15
const scaled = value => (Array.isArray(value) ? value.map(scaled) : typeof value === 'number' ? value * V2_SCALE
  : Object.fromEntries(Object.entries(value).map(([key, v]) => [key, scaled(v)])))

const PANELS_V2 = {
  left: { cols: [269, 344, 419, 493.5, 568, 643, 717.5], t: [717.5, 792], libero: [792, 867, 941.5] },
  right: { cols: [941.5, 1016, 1091, 1165.5, 1240, 1315, 1389.5], t: [1389.5, 1464], libero: [1464, 1539, 1613.5] },
  left2: { cols: [1688, 1763, 1837.5, 1912, 1987, 2061.5, 2136], t: [2136, 2211], libero: [2211, 2285.5, 2360] },
  right2: { cols: [2360, 2435, 2509.5, 2584, 2659, 2733.5, 2808], t: [2808, 2883], libero: [2883, 2957.5, 3032] },
}
const ROWS_V2 = scaled({ lineup: [0, 34.5], entrant: [34.5, 69], scoreIn: [69, 104], scoreOut: [104, 138.5] })
const TURNS_V2 = scaled([[138.5, 173], [173, 208], [208, 242.5], [242.5, 277]])
const TIMEOUTS_V2 = scaled([[208, 242.5], [242.5, 277]])
const panelV2 = (side, x, y) => ({ ...scaled(side), letter: letterBox(...scaled([x, y])) })

const V2 = {
  version: 2,
  // thin digits, smaller than those of the service turns: opening would break them
  substitutionPrint: { charHeight: 18, open: false },
  width: 3076 * V2_SCALE,
  ratio: 2174 / 3076,
  signature: scaled({ x: [280, 700], rows: [361, 396, 430.5, 465, 500, 534.5, 569, 604, 638.5, 673, 742.5, 777, 812, 846.5, 881, 916, 950.5, 985, 1020, 1054.5] }),
  // the fifth set has four rows of service turns too
  cellRows: () => ({ rows: ROWS_V2, turns: TURNS_V2, timeouts: TIMEOUTS_V2 }),
  // "LIBERO / UNDER": two columns of rows (the left one first), from the row of the column numbers to the
  // bottom of the panel; offsets from the top of the "Giocatori titolari" row
  liberoRows: scaled([-35, 0, 34.5, 69, 104, 138.5, 173, 208, 242.5, 277]),
  setPanels: [
    { set: 1, top: 396 * V2_SCALE, sides: [panelV2(PANELS_V2.left, 668, 335), panelV2(PANELS_V2.right, 990, 335)] },
    { set: 2, top: 396 * V2_SCALE, sides: [panelV2(PANELS_V2.left2, 2087, 335), panelV2(PANELS_V2.right2, 2410, 335)] },
    { set: 3, top: 777 * V2_SCALE, sides: [panelV2(PANELS_V2.left, 668, 716), panelV2(PANELS_V2.right, 990, 716)] },
    { set: 4, top: 777 * V2_SCALE, sides: [panelV2(PANELS_V2.left2, 2087, 716), panelV2(PANELS_V2.right2, 2410, 716)] },
    {
      set: 5,
      top: 1158.5 * V2_SCALE,
      sides: [panelV2(PANELS_V2.left, 668, 1097), panelV2(PANELS_V2.right, 990, 1097)],
      courtChange: { ...panelV2(PANELS_V2.left2, 1737, 1097), points: scaled([2062, 1075, 2108, 1120]) },
    },
  ],
  result: {
    // the two circles touch: smaller boxes
    letters: [letterBox(...scaled([2018, 1532, 22, 22])), letterBox(...scaled([2067, 1532, 22, 22]))],
    rows: [1609, 1661, 1713, 1765, 1817].map(y => scaled({
      left: [1897, y + 3, 1946, y + 49],
      right: [2139, y + 3, 2189, y + 49],
      minutes: [2062, y + 3, 2122, y + 49], // between the printed brackets
    })),
    abbreviations: scaled([[1775, 1510, 1950, 1555], [2150, 1510, 2330, 1555]]),
  },
  header: scaled({
    competition: [305, 138, 568, 172],
    city: [178, 206, 568, 242],
    venue: [700, 206, 1072, 242],
    date: [1185, 206, 1372, 242], // "dd/mm/yyyy"
    number: [695, 138, 830, 172],
    genderMale: [343, 177, 367, 201],
    genderFemale: [528, 177, 552, 201],
    teamLeft: [140, 244, 755, 271], // above the underline of the field
    teamRight: [905, 244, 1520, 271],
  }),
  // circled letters beside the team names: either team can be on the left
  headerLetters: [letterBox(...scaled([105, 265, 26, 24])), letterBox(...scaled([1555, 265, 26, 24]))],
  roster: {
    letters: [letterBox(...scaled([2406, 1096])), letterBox(...scaled([3004, 1096]))],
    ...scaled({
      area: [1150, 1580],
      lineX: [2450, 2690],
      columns: [{ number: [2379, 2435], name: [2435, 2705.5] }, { number: [2705.5, 2761.5], name: [2761.5, 3032] }],
      liberoRows: [[1609, 1644], [1644, 1679]],
    }),
    liberoNameTrim: 4,
  },
}

export const LAYOUTS = [V1, V2]

// Page 2 (version 1): libero exchanges, one table per set (two columns, team letter in the header row)
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
