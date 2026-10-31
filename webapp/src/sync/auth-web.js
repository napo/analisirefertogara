/**
 * Google sign-in of the web version: Google Identity Services, token model.
 * There is no server, so there is no refresh token: an access token lasts an
 * hour and a new one needs a tap of the user (browsers block the Google
 * window opened without one). The token is kept for its hour in the browser,
 * so that reloading the page does not ask again. Google's script is loaded
 * only once the user chose to connect Drive.
 */
import { DRIVE_SCOPE } from './drive.js'
import { TokenCache } from './auth.js'
const SCRIPT = 'https://accounts.google.com/gsi/client'
const STORED = 'referto-volley.google.web-token'
/** The user already gave consent: later requests show no consent page, only a quick Google window. */
const CONSENTED = 'referto-volley.google.consented'
let loading = null
/** Google's script, loaded once; called before the user's tap so that Google's window opens at once. */
export function loadGoogle() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : reject(new Error('gsi'))
    script.onerror = () => {
      loading = null
      reject(new Error('gsi'))
    }
    document.head.append(script)
  })
  return loading
}
export class WebGoogleAuth {
  clientId
  cache = new TokenCache()
  constructor(clientId) {
    this.clientId = clientId
    try {
      const stored = JSON.parse(localStorage.getItem(STORED) ?? 'null')
      if (stored) this.cache.set(stored.token, (stored.expires - Date.now()) / 1e3)
    } catch {}
  }
  async token(interactive) {
    const cached = this.cache.get()
    if (cached || !interactive) return cached
    const oauth2 = await loadGoogle()
    const response = await new Promise((resolve) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: DRIVE_SCOPE,
        callback: resolve,
        error_callback: (error) => resolve({ error: error.type })
      })
      client.requestAccessToken({ prompt: localStorage.getItem(CONSENTED) ? '' : 'consent' })
    })
    if (!response.access_token) return null
    const expiresIn = response.expires_in ?? 3600
    this.cache.set(response.access_token, expiresIn)
    try {
      localStorage.setItem(CONSENTED, '1')
      localStorage.setItem(STORED, JSON.stringify({
        token: response.access_token,
        expires: Date.now() + expiresIn * 1e3
      }))
    } catch {}
    return response.access_token
  }
  invalidate() {
    this.cache.clear()
    localStorage.removeItem(STORED)
  }
  async signOut() {
    const token = this.cache.get()
    this.invalidate()
    localStorage.removeItem(CONSENTED)
    if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token)
  }
}
