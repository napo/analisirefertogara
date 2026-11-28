// Accessibility and appearance settings ("Accessibilità" panel): theme, colors for color vision
// deficiencies, text size, font, text spacing, link underline, motion.
// Pure logic, no React: the panel (A11yPanel.jsx) edits them, apply() writes them on <html> as data
// attributes and the CSS (index.css) reads them. Saved per browser (localStorage): a convenience, never
// match data; without storage the defaults apply.

export const A11Y_KEY = 'referto-volley.accessibility'

export const THEMES = [
  ['system', 'Come il dispositivo'],
  ['light', 'Chiaro'],
  ['dark', 'Scuro'],
  ['contrast', 'Alto contrasto'],
]
// Colors of the data (BP / CP, P1–P6, positive / negative, events): see theme.js
export const PALETTES = [
  ['standard', 'Standard'],
  ['red-green', 'Rosso-verde (deuteranopia, protanopia)'],
  ['blue-yellow', 'Blu-giallo (tritanopia)'],
  ['mono', 'Senza colori (acromatopsia)'],
]
export const FONTS = [
  ['default', 'Standard (Roboto)'],
  ['legible', 'Alta leggibilità (Atkinson Hyperlegible)'],
  ['dyslexia', 'Per la dislessia (OpenDyslexic)'],
]
// Font stacks: the CSS (index.css) and the charts (canvas, which cannot read CSS variables)
export const FONT_STACKS = {
  default: "Roboto, 'Segoe UI', Arial, sans-serif",
  legible: "'Atkinson Hyperlegible Next', Roboto, Arial, sans-serif",
  dyslexia: "OpenDyslexic, 'Atkinson Hyperlegible Next', Arial, sans-serif",
}
// Text size as a share of the browser's size (rem): every size of the interface follows it
export const TEXT_SCALES = [0.875, 1, 1.125, 1.25, 1.375, 1.5, 1.75]
export const MOTION = [
  ['system', 'Come il dispositivo'],
  ['reduce', 'Ridotte'],
]

export const A11Y_DEFAULTS = Object.freeze({
  theme: 'system',
  palette: 'standard',
  font: 'default',
  textScale: 1,
  spacing: false,
  underlineLinks: false,
  motion: 'system',
})

const allowed = list => new Set(list.map(([value]) => value))
const CHECKS = {
  theme: value => allowed(THEMES).has(value),
  palette: value => allowed(PALETTES).has(value),
  font: value => allowed(FONTS).has(value),
  textScale: value => TEXT_SCALES.includes(value),
  spacing: value => typeof value === 'boolean',
  underlineLinks: value => typeof value === 'boolean',
  motion: value => allowed(MOTION).has(value),
}

// Unknown keys and invalid values fall back to the defaults
export function normalizeSettings(input) {
  const settings = { ...A11Y_DEFAULTS }
  if (input && typeof input === 'object') {
    for (const [key, valid] of Object.entries(CHECKS)) if (valid(input[key])) settings[key] = input[key]
  }
  return settings
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    return normalizeSettings(JSON.parse(storage?.getItem(A11Y_KEY) || '{}'))
  } catch {
    return { ...A11Y_DEFAULTS }
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem(A11Y_KEY, JSON.stringify(normalizeSettings(settings)))
  } catch {
    // not saved (private mode, blocked site data): the choice applies to this visit only
  }
}

// Theme actually shown: "system" follows the device (prefers-color-scheme, and forced high contrast)
export function resolvedTheme(settings, { prefersDark = false, prefersContrast = false } = {}) {
  if (settings.theme !== 'system') return settings.theme
  if (prefersContrast) return 'contrast'
  return prefersDark ? 'dark' : 'light'
}

export const isDefault = settings => Object.entries(A11Y_DEFAULTS).every(([key, value]) => settings[key] === value)

// Writes the settings on <html>: data-theme, data-palette, data-font, data-spacing, data-underline,
// data-motion, data-textflow and the root font size (every rem follows it)
export function applySettings(settings, root = globalThis.document?.documentElement, media = {}) {
  if (!root) return
  const theme = resolvedTheme(settings, media)
  root.dataset.theme = theme
  root.dataset.palette = settings.palette
  root.dataset.font = settings.font
  root.dataset.spacing = settings.spacing ? 'wide' : 'normal'
  root.dataset.underline = settings.underlineLinks ? 'on' : 'off'
  root.dataset.motion = settings.motion === 'reduce' || media.prefersReducedMotion ? 'reduce' : 'full'
  root.style.fontSize = settings.textScale === 1 ? '' : `${settings.textScale * 100}%`
  // larger or wider text: buttons and menus may wrap instead of overflowing (index.css)
  root.dataset.textflow = settings.textScale > 1 || settings.font !== 'default' || settings.spacing ? 'wrap' : 'normal'
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
}
