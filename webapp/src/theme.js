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
