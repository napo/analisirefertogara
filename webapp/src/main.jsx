import './polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { A11yProvider } from './a11y.jsx'
import { applySettings, loadSettings, resolvedTheme } from './a11y-settings.js'
import { themeColors, themeCssVars } from './theme.js'

// Saved accessibility settings applied before the first paint (no flash of the default theme)
const matches = text => Boolean(globalThis.matchMedia?.(text).matches)
const media = { prefersDark: matches('(prefers-color-scheme: dark)'), prefersContrast: matches('(prefers-contrast: more)') || matches('(forced-colors: active)'), prefersReducedMotion: matches('(prefers-reduced-motion: reduce)') }
const saved = loadSettings()
applySettings(saved, document.documentElement, media)
for (const [name, value] of Object.entries(themeCssVars(themeColors({ palette: saved.palette, theme: resolvedTheme(saved, media) })))) document.documentElement.style.setProperty(name, value)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <A11yProvider>
      <App />
    </A11yProvider>
  </StrictMode>,
)
