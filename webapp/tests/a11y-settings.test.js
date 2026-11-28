import assert from 'node:assert/strict'
import { test } from 'node:test'
import { A11Y_DEFAULTS, A11Y_KEY, FONT_STACKS, FONTS, applySettings, isDefault, loadSettings, normalizeSettings, resolvedTheme, saveSettings } from '../src/a11y-settings.js'

const memory = () => { const store = new Map(); return { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), store } }

test('accessibility settings: defaults, invalid values ignored, saved and restored per browser', () => {
  assert.deepEqual(normalizeSettings(null), A11Y_DEFAULTS)
  assert.deepEqual(normalizeSettings({ theme: 'neon', textScale: 3, palette: 'mono', extra: 1 }), { ...A11Y_DEFAULTS, palette: 'mono' })
  const storage = memory()
  saveSettings({ ...A11Y_DEFAULTS, theme: 'dark', font: 'dyslexia', textScale: 1.25, spacing: true }, storage)
  assert.deepEqual(loadSettings(storage), { ...A11Y_DEFAULTS, theme: 'dark', font: 'dyslexia', textScale: 1.25, spacing: true })
  storage.setItem(A11Y_KEY, '{broken')
  assert.deepEqual(loadSettings(storage), A11Y_DEFAULTS)
  const blocked = { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('blocked') } }
  assert.deepEqual(loadSettings(blocked), A11Y_DEFAULTS)
  assert.doesNotThrow(() => saveSettings(A11Y_DEFAULTS, blocked))
  assert.ok(isDefault(A11Y_DEFAULTS))
  assert.ok(!isDefault({ ...A11Y_DEFAULTS, underlineLinks: true }))
  assert.ok(FONTS.every(([key]) => FONT_STACKS[key]))
})

test('accessibility settings: "come il dispositivo" follows dark mode and high contrast', () => {
  assert.equal(resolvedTheme(A11Y_DEFAULTS), 'light')
  assert.equal(resolvedTheme(A11Y_DEFAULTS, { prefersDark: true }), 'dark')
  assert.equal(resolvedTheme(A11Y_DEFAULTS, { prefersDark: true, prefersContrast: true }), 'contrast')
  assert.equal(resolvedTheme({ ...A11Y_DEFAULTS, theme: 'light' }, { prefersDark: true }), 'light')
})

test('accessibility settings: written on <html> as data attributes and root font size', () => {
  const root = { dataset: {}, style: {} }
  applySettings({ ...A11Y_DEFAULTS, theme: 'system', palette: 'red-green', font: 'legible', textScale: 1.5, underlineLinks: true }, root, { prefersDark: true, prefersReducedMotion: true })
  assert.deepEqual(root.dataset, { theme: 'dark', palette: 'red-green', font: 'legible', spacing: 'normal', underline: 'on', motion: 'reduce', textflow: 'wrap', textsize: 'large' })
  assert.equal(root.style.fontSize, '150%')
  assert.equal(root.style.colorScheme, 'dark')
  applySettings(A11Y_DEFAULTS, root)
  assert.equal(root.style.fontSize, '')
  assert.equal(root.dataset.motion, 'full')
  assert.equal(root.dataset.textflow, 'normal')
  assert.equal(root.dataset.textsize, 'normal')
})
