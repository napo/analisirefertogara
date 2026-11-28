import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrast, deltaE, simulate } from '../src/color-math.js'
import { PHASE_COLORS, ROTATION_COLORS, themeColors, themeCssVars } from '../src/theme.js'

// Which vision each palette must serve (besides normal vision)
const SERVES = {
  standard: ['normal'],
  'red-green': ['normal', 'protan', 'deutan'],
  'blue-yellow': ['normal', 'tritan'],
  mono: ['normal', 'achromat'],
}
const THEMES = ['light', 'dark', 'contrast']
const SURFACE = { light: '#FFFFFF', dark: '#14222E', contrast: '#FFFFFF' }
const diff = (x, y, kind) => (kind === 'normal' ? deltaE(x, y) : deltaE(simulate(x, kind), simulate(y, kind)))
const worst = (pairs, kinds) => Math.min(...pairs.flatMap(([x, y]) => kinds.map(kind => diff(x, y, kind))))

test('palettes: BP / CP and positive / negative stay apart for the vision each palette serves', () => {
  for (const [palette, kinds] of Object.entries(SERVES)) {
    for (const theme of THEMES) {
      const c = themeColors({ palette, theme })
      assert.ok(worst([[c.PHASE.BP, c.PHASE.CP]], kinds) >= 15, `${palette} ${theme} BP/CP`)
      assert.ok(worst([[c.TREND.positive, c.TREND.negative]], kinds) >= 15, `${palette} ${theme} positivo/negativo`)
    }
  }
})

test('palettes: neighbouring P and events distinguishable (P always carry their label)', () => {
  for (const [palette, kinds] of Object.entries(SERVES)) {
    for (const theme of THEMES) {
      const c = themeColors({ palette, theme })
      const P = Object.values(c.ROTATION).map(r => r.fill)
      assert.ok(worst(P.map((fill, i) => [fill, P[(i + 1) % 6]]), kinds) >= 8, `${palette} ${theme} P vicine`)
      const events = Object.values(c.EVENT)
      if (palette !== 'mono') assert.ok(worst(events.flatMap((x, i) => events.slice(i + 1).map(y => [x, y])), kinds) >= 8, `${palette} ${theme} eventi`)
      // the label on every P segment is readable (AA large / bold text)
      for (const r of Object.values(c.ROTATION)) assert.ok(contrast(r.fill, r.text) >= 3, `${palette} ${theme} etichetta su ${r.fill}`)
    }
  }
})

test('palettes: data colors stand out from the surface; text colors readable', () => {
  for (const palette of Object.keys(SERVES)) {
    for (const theme of THEMES) {
      const c = themeColors({ palette, theme })
      for (const color of [c.PHASE.BP, c.PHASE.CP, c.TREND.positive, c.TREND.negative]) assert.ok(contrast(color, SURFACE[theme]) >= (palette === 'mono' ? 2.6 : 3), `${palette} ${theme} ${color}`)
      for (const color of [...Object.values(c.PHASE_TEXT), ...Object.values(c.TREND_TEXT)]) assert.ok(contrast(color, SURFACE[theme]) >= (theme === 'contrast' ? 7 : 4.5), `${palette} ${theme} testo ${color}`)
    }
  }
})

test('palettes: the standard light theme is the one of the PDF and of the constants', () => {
  const c = themeColors()
  assert.equal(c.PHASE.BP, PHASE_COLORS.BP)
  assert.equal(c.ROTATION[2].fill, ROTATION_COLORS[2].fill)
  const vars = themeCssVars(c)
  assert.equal(vars['--vs-cp'], PHASE_COLORS.CP)
  assert.ok(['--vs-p1', '--vs-p6-text', '--vs-best', '--vs-dc'].every(name => name in vars))
})
