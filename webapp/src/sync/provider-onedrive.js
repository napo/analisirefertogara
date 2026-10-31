/** OneDrive of personal Microsoft accounts: PKCE sign-in on the web and on the desktop, the files in src/sync/onedrive.js. */
import { ONEDRIVE_OAUTH } from '../config.js'
import { ONEDRIVE_SCOPE, OneDriveClient } from './onedrive.js'
import { syncFetch } from './platform.js'
// No revocation: Microsoft has no endpoint for it in the documented flow, so the app only forgets the token.
const ENDPOINTS = {
  authorize: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
  scope: ONEDRIVE_SCOPE,
  storageKey: 'referto-volley.onedrive.refresh-token'
}
async function createAuth(platform) {
  const [{ PkceAuth }, fetchFn] = await Promise.all([import('./auth-pkce.js'), syncFetch()])
  const common = {
    endpoints: ENDPOINTS,
    clientId: ONEDRIVE_OAUTH.clientId,
    fetch: fetchFn
  }
  if (platform === 'web') {
    const { popupSignIn } = await import('./auth-popup.js')
    return new PkceAuth({
      ...common,
      ...popupSignIn()
    })
  }
  const [{ invoke }, { openUrl }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/plugin-opener')])
  return new PkceAuth({
    ...common,
    // Microsoft refuses an Origin outside single-page apps; an empty one makes tauri-plugin-http drop it.
    tokenHeaders: { Origin: '' },
    openBrowser: (url) => openUrl(url),
    redirect: async () => {
      // Microsoft ignores the port of a localhost address when matching it.
      const port = await invoke('oauth_listen', {})
      return {
        uri: `http://localhost:${port}`,
        wait: () => invoke('oauth_wait', { port })
      }
    }
  })
}
export const onedrive = {
  id: 'onedrive',
  // Android and iOS: the way back to the app is still to be built, as for Dropbox.
  available: (platform) => (platform === 'web' || platform === 'desktop') && ONEDRIVE_OAUTH.clientId !== '',
  createAuth,
  storage: (accessToken, fetchFn) => new OneDriveClient(accessToken, fetchFn),
  async prepare(platform) {
    if (platform === 'web') await Promise.all([import('./auth-pkce.js'), import('./auth-popup.js')])
  }
}
