/** Which platform the synchronisation runs on, and the HTTP client it uses there. */
import { isTauriApp, mobilePlatform } from '../updates.js'
export function syncPlatform() {
  if (!isTauriApp()) return 'web'
  return mobilePlatform() ?? 'desktop'
}
/** In the installed apps the services are reached from Rust (tauri-plugin-http), with no CORS limits on the app's origin. */
export async function syncFetch() {
  if (!isTauriApp()) return (input, init) => fetch(input, init)
  const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
  return (input, init) => tauriFetch(input, init)
}
