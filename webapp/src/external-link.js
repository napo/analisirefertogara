// External links (GitHub, licence, PayPal). On the web they are normal links opened in a new tab; in the
// installed apps the webview would not open them, so the click is handed to the system browser through
// the opener plugin already used for updates. Nothing is requested before the user clicks.
import { isTauriApp, openInSystemBrowser } from './updates.js'

// true when the click has been handled by the system browser (default navigation prevented)
export function followExternalLink(event, url, { app = isTauriApp(), open = openInSystemBrowser } = {}) {
  if (!app || !url) return false
  event.preventDefault()
  Promise.resolve(open(url)).catch(() => {})
  return true
}
