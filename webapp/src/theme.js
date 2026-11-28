// Shared colors of the app, so that the same meaning always has the same color
// (bar charts, "Andamento della gara", filters, tooltips, legends, future history views).
// The CSS side mirrors these values as custom properties in index.css (--vs-bp, --vs-cp, --vs-p1...).

export const APP_COLORS = {
  navy: '#011627',
  orange: '#E65100',
  teal: '#028090',
}

// Phases: reserved meaning. BP = break point (analyzed team serving), CP = cambio palla (receiving).
// Same values used by the "Rendimento per rotazione" bar chart since the beginning.
export const PHASE_COLORS = {
  BP: APP_COLORS.navy,
  CP: APP_COLORS.orange,
}

// Phase names written in text: the orange gets darker to reach 4.5:1 on white (as --vs-orange-ink)
export const PHASE_TEXT_COLORS = {
  BP: APP_COLORS.navy,
  CP: '#BF4400',
}

// Trend of the score: above / below level. Only for the difference line.
export const TREND_COLORS = {
  positive: '#2E7D32',
  negative: '#C62828',
  level: APP_COLORS.navy,
}

// P1–P6: identity of a position, not a judgement. Six hues from the documented data-viz palette,
// excluding orange/red/green (they collapse with CP orange under protan/deutan simulation or carry a
// positive/negative meaning). Validated with the dataviz validator on the cyclic neighbours
// P1-P2-...-P6-P1 (the order in which P follow each other): worst CVD ΔE 11.3 (target >= 8), worst
// normal-vision ΔE 17.2 (floor 15). Three fills are below 3:1 on white: every segment always carries
// its "P1".."P6" label and a white border, so color is never the only cue.
export const ROTATION_COLORS = {
  1: { fill: '#2a78d6', text: '#FFFFFF' }, // blue      — white text 4.4:1
  2: { fill: '#eda100', text: '#011627' }, // yellow    — ink 8.5:1
  3: { fill: '#4a3aa7', text: '#FFFFFF' }, // violet    — white text 8.6:1
  4: { fill: '#1baf7a', text: '#011627' }, // aqua      — ink 6.5:1
  5: { fill: '#9085e9', text: '#011627' }, // lavender  — ink 5.9:1
  6: { fill: '#e87ba4', text: '#011627' }, // magenta   — ink 6.8:1
}

// Match events (TO, S, DC, CC): identity colors, all distinct from BP/CP
export const EVENT_COLORS = {
  timeout: '#6A1B9A',
  substitution: '#00796B',
  doubleChange: '#AD1457',
  courtChange: '#1565C0',
}

// ECharts default series order for the existing charts (unchanged rendering)
export const CHART_SERIES_COLORS = [PHASE_COLORS.BP, PHASE_COLORS.CP, APP_COLORS.teal]

// "Confronto delle rotazioni": border of the most profitable P and of the P most in difficulty (same
// positive / negative colors of the score trend); the selected cell uses a dark outline, never these colors.
export const COMPARISON_COLORS = {
  best: TREND_COLORS.positive,
  worst: TREND_COLORS.negative,
}

// ---- Palettes and themes of the "Accessibilità" panel ----
// The constants above are the standard palette on the light theme (the PDF report and the tests use
// them). themeColors() gives the same structure for every palette and theme; the app reads it through
// useThemeColors() (a11y.jsx) and writes the data colors as CSS variables (themeCssVars).
// Palettes chosen with the color vision simulation of color-math.js and checked by
// tests/palettes.test.js: BP / CP, positive / negative, neighbouring P and events stay apart (OKLab ΔE)
// for the deficiency each palette addresses.
import { contrast, oklabToRgb, remapLightness, rgbToHex, rgbToOklab, hexToRgb } from './color-math.js'

const STANDARD = {
  PHASE: PHASE_COLORS,
  PHASE_TEXT: PHASE_TEXT_COLORS,
  TREND: { positive: TREND_COLORS.positive, negative: TREND_COLORS.negative },
  TREND_TEXT: { positive: TREND_COLORS.positive, negative: TREND_COLORS.negative },
  ROTATION: Object.fromEntries(Object.entries(ROTATION_COLORS).map(([P, c]) => [P, c.fill])),
  EVENT: EVENT_COLORS,
}
const PALETTE_OVERRIDES = {
  standard: {},
  // deuteranopia / protanopia: green and red collapse; positive blue, negative vermilion (Okabe-Ito /
  // Paul Tol hues), events among indigo, teal, violet and vermilion
  'red-green': {
    TREND: { positive: '#1565C0', negative: '#CC3311' },
    TREND_TEXT: { positive: '#1565C0', negative: '#CC3311' },
    EVENT: { timeout: '#332288', substitution: '#00838F', doubleChange: '#785EF0', courtChange: '#CC3311' },
  },
  // tritanopia: blue-green and yellow-pink collapse; positive dark blue, negative magenta
  'blue-yellow': {
    TREND: { positive: '#004488', negative: '#DC267F' },
    TREND_TEXT: { positive: '#004488', negative: '#C2185B' },
    EVENT: { timeout: '#332288', substitution: '#0072B2', doubleChange: '#DC267F', courtChange: '#A6611A' },
  },
  // achromatopsia: lightness only; the meaning is also carried by labels, positions and dashed lines
  mono: {
    PHASE: { BP: '#1F1F1F', CP: '#9A9A9A' },
    PHASE_TEXT: { BP: '#1F1F1F', CP: '#5E5E5E' },
    TREND: { positive: '#1F1F1F', negative: '#8C8C8C' },
    TREND_TEXT: { positive: '#1F1F1F', negative: '#5E5E5E' },
    ROTATION: { 1: '#2B2B2B', 2: '#BDBDBD', 3: '#5C5C5C', 4: '#E3E3E3', 5: '#7A7A7A', 6: '#A6A6A6' },
    EVENT: { timeout: '#111111', substitution: '#3D3D3D', doubleChange: '#666666', courtChange: '#8C8C8C' },
  },
}

// Neutral inks of the charts (ECharts draws on canvas and cannot read CSS variables)
const CHART_INKS = {
  light: { surface: '#FFFFFF', text: '#505050', muted: '#6B6B6B', heading: '#383838', axis: '#CFD8DC', grid: '#E5E7EB', pointer: '#90A4AE', ink: '#011627', unknown: '#E0E0E0', unknownText: '#455A64', ownBlock: '#ECEFF1', otherBlock: '#FAFAFA', otherBlockText: '#757575', eventLine: '#B0BEC5', mixedEvent: '#455A64' },
  dark: { surface: '#14222E', text: '#C9D0D6', muted: '#9AA5B1', heading: '#EEF1F4', axis: '#4A5866', grid: '#26333F', pointer: '#7D8C99', ink: '#EEF1F4', unknown: '#3A4753', unknownText: '#C9D0D6', ownBlock: '#2A3846', otherBlock: '#1B2A37', otherBlockText: '#9AA5B1', eventLine: '#5F6E7B', mixedEvent: '#B0BEC5' },
  contrast: { surface: '#FFFFFF', text: '#000000', muted: '#1F1F1F', heading: '#000000', axis: '#000000', grid: '#8A8A8A', pointer: '#000000', ink: '#000000', unknown: '#D0D0D0', unknownText: '#000000', ownBlock: '#E6E6E6', otherBlock: '#FFFFFF', otherBlockText: '#333333', eventLine: '#555555', mixedEvent: '#000000' },
}

// Darker text color (OKLab lightness at most `max`): stronger contrast for the high contrast theme
const darken = (hex, max) => {
  const [L, a, b] = rgbToOklab(hexToRgb(hex))
  return L <= max ? hex : rgbToHex(oklabToRgb([max, a, b]))
}
// Label color on a fill: dark ink or white, whichever contrasts more
export const textOn = (fill, ink = '#011627') => (contrast(fill, ink) >= contrast(fill, '#FFFFFF') ? ink : '#FFFFFF')

export function themeColors({ palette = 'standard', theme = 'light' } = {}) {
  const base = { ...STANDARD, ...(PALETTE_OVERRIDES[palette] || {}) }
  const mode = theme === 'dark' ? 'dark' : theme === 'contrast' ? 'contrast' : 'light'
  // dark theme: lightness moved into a light band (order and differences kept) for the dark surface
  // (band chosen so that every pair checked by tests/palettes.test.js keeps its margin)
  const data = hex => (mode === 'dark' ? remapLightness(hex, 0.42, 0.98) : hex)
  const text = hex => (mode === 'dark' ? remapLightness(hex, 0.7, 0.98) : mode === 'contrast' ? darken(hex, 0.42) : hex)
  const map = (object, fn) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, fn(value)]))
  const PHASE = map(base.PHASE, data)
  const TREND = map(base.TREND, data)
  const ROTATION = map(base.ROTATION, fill => ({ fill: data(fill), text: textOn(data(fill)) }))
  const EVENT = map(base.EVENT, data)
  return {
    palette, theme: mode,
    PHASE, PHASE_TEXT: map(base.PHASE_TEXT, text), TREND: { ...TREND, level: CHART_INKS[mode].ink },
    ROTATION, EVENT,
    TREND_TEXT: map(base.TREND_TEXT, text),
    COMPARISON: { best: TREND.positive, worst: TREND.negative },
    CHART_SERIES: [PHASE.BP, PHASE.CP, data(APP_COLORS.teal)],
    CHART: CHART_INKS[mode],
  }
}

// Data colors for the CSS (index.css reads them): written on <html> by the Accessibilità settings
export function themeCssVars(colors) {
  return {
    '--vs-bp': colors.PHASE.BP,
    '--vs-cp': colors.PHASE.CP,
    '--vs-bp-text': colors.PHASE_TEXT.BP,
    '--vs-cp-text': colors.PHASE_TEXT.CP,
    '--vs-on-bp': textOn(colors.PHASE.BP),
    '--vs-on-cp': textOn(colors.PHASE.CP),
    '--vs-positive': colors.TREND.positive,
    '--vs-negative': colors.TREND.negative,
    '--vs-positive-text': colors.TREND_TEXT.positive,
    '--vs-negative-text': colors.TREND_TEXT.negative,
    '--vs-best': colors.COMPARISON.best,
    '--vs-worst': colors.COMPARISON.worst,
    '--vs-dc': colors.EVENT.doubleChange,
    ...Object.fromEntries(Object.entries(colors.EVENT).map(([type, color]) => [`--vs-ev-${type}`, color])),
    ...Object.fromEntries(Object.entries(colors.ROTATION).flatMap(([P, c]) => [[`--vs-p${P}`, c.fill], [`--vs-p${P}-text`, c.text]])),
  }
}
