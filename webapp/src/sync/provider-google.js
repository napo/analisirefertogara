/** Google Drive: one way to sign in per platform (src/sync/auth-*.js), the files in src/sync/drive.js. */
import { GOOGLE_OAUTH } from '../config.js'
import { DRIVE_SCOPE, DriveClient } from './drive.js'
import { syncFetch } from './platform.js'
const ENDPOINTS = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  scope: DRIVE_SCOPE,
  // A refresh token, so that the access is renewed without the browser.
  extraParams: {
    access_type: 'offline',
    prompt: 'consent'
  },
  storageKey: 'referto-volley.google.refresh-token'
}
const clientId = (platform) => platform === 'desktop' ? GOOGLE_OAUTH.desktop.clientId : GOOGLE_OAUTH[platform]
async function createAuth(platform) {
  if (platform === 'web') {
    const { WebGoogleAuth } = await import('./auth-web.js')
    return new WebGoogleAuth(GOOGLE_OAUTH.web)
  }
  if (platform === 'android') {
    // Play services finds the 'Android' client by package and signing certificate: its id is not passed.
    const [{ AndroidGoogleAuth }, fetchFn] = await Promise.all([import('./auth-android.js'), syncFetch()])
    return new AndroidGoogleAuth(fetchFn)
  }
  const [{ PkceAuth }, { invoke }, { openUrl }, fetchFn] = await Promise.all([
    import('./auth-pkce.js'),
    import('@tauri-apps/api/core'),
    import('@tauri-apps/plugin-opener'),
    syncFetch()
  ])
  return new PkceAuth({
    endpoints: ENDPOINTS,
    clientId: GOOGLE_OAUTH.desktop.clientId,
    clientSecret: GOOGLE_OAUTH.desktop.clientSecret,
    fetch: fetchFn,
    openBrowser: (url) => openUrl(url),
    redirect: async () => {
      const port = await invoke('oauth_listen')
      return {
        uri: `http://127.0.0.1:${port}`,
        wait: () => invoke('oauth_wait', { port })
      }
    }
  })
}
export const googleDrive = {
  id: 'google-drive',
  available(platform) {
    if (platform === 'desktop') return clientId(platform) !== '' && GOOGLE_OAUTH.desktop.clientSecret !== ''
    // iOS: the sign-in through the client's URL scheme is still to be built.
    return platform !== 'ios' && clientId(platform) !== ''
  },
  createAuth,
  storage: (accessToken, fetchFn) => new DriveClient(accessToken, fetchFn),
  async prepare(platform) {
    if (platform !== 'web') return
    const { loadGoogle } = await import('./auth-web.js')
    await loadGoogle().catch(() => undefined)
  }
}
