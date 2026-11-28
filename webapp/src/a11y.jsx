// Accessibility settings in React: keeps them, follows the device (dark mode, high contrast, reduced
// motion), writes them on <html> (a11y-settings.js) together with the data colors of the chosen
// palette (theme.js), and gives the charts the colors to draw with (useThemeColors).
// While the PDF report is captured (printMode) the page uses the light theme, the standard text size
// and spacing, keeping the chosen palette and font: the report stays readable and fits the page.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { A11Y_DEFAULTS, FONT_STACKS, applySettings, loadSettings, resolvedTheme, saveSettings } from './a11y-settings.js'
import { themeColors, themeCssVars } from './theme.js'

const A11yContext = createContext(null)

const query = text => globalThis.matchMedia?.(text)
function useMedia(text) {
  const [matches, setMatches] = useState(() => Boolean(query(text)?.matches))
  useEffect(() => {
    const list = query(text)
    if (!list) return undefined
    const update = () => setMatches(list.matches)
    list.addEventListener?.('change', update)
    return () => list.removeEventListener?.('change', update)
  }, [text])
  return matches
}

export function A11yProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings)
  const [printMode, setPrintMode] = useState(false)
  const prefersDark = useMedia('(prefers-color-scheme: dark)')
  const prefersMore = useMedia('(prefers-contrast: more)')
  const forcedColors = useMedia('(forced-colors: active)')
  const prefersReducedMotion = useMedia('(prefers-reduced-motion: reduce)')
  const media = useMemo(() => ({ prefersDark, prefersContrast: prefersMore || forcedColors, prefersReducedMotion }),
    [prefersDark, prefersMore, forcedColors, prefersReducedMotion])
  const effective = useMemo(() => (printMode ? { ...settings, theme: 'light', textScale: 1, spacing: false } : settings), [settings, printMode])
  const theme = resolvedTheme(effective, media)
  const colors = useMemo(() => themeColors({ palette: effective.palette, theme }), [effective.palette, theme])

  useEffect(() => {
    const root = document.documentElement
    applySettings(effective, root, media)
    for (const [name, value] of Object.entries(themeCssVars(colors))) root.style.setProperty(name, value)
  }, [effective, colors, media])

  const update = useCallback(change => setSettings(current => {
    const next = { ...current, ...change }
    saveSettings(next)
    return next
  }), [])
  const reset = useCallback(() => {
    saveSettings(A11Y_DEFAULTS)
    setSettings({ ...A11Y_DEFAULTS })
  }, [])

  const fontFamily = FONT_STACKS[effective.font]
  const value = useMemo(() => ({ settings, update, reset, theme, colors, fontFamily, setPrintMode }), [settings, update, reset, theme, colors, fontFamily])
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>
}

// Outside the provider (tests, isolated renders) the standard light colors apply
const FALLBACK = { settings: A11Y_DEFAULTS, update: () => {}, reset: () => {}, theme: 'light', colors: themeColors(), fontFamily: FONT_STACKS.default, setPrintMode: () => {} }
export const useA11y = () => useContext(A11yContext) || FALLBACK
export const useThemeColors = () => useA11y().colors
