// Project links and identity: the single place for URLs shown in the app (Informazioni page, footer,
// PDF report). Components import them from here and never repeat them.
export const AUTHOR_NAME = 'Maurizio Napolitano'
export const AUTHOR_URL = 'https://github.com/napo'
export const SOURCE_REPOSITORY_URL = 'https://github.com/napo/analisirefertogara'
// Web version (GitHub Pages with a custom domain, see .github/workflows/deploy-pages.yml)
export const WEB_APP_URL = 'https://refertogara.volleyserve.it/'
export const LICENSE_URL = `${SOURCE_REPOSITORY_URL}/blob/main/LICENSE`
export const LICENSE_NAME = 'GNU Affero General Public License v3.0 or later'
export const LICENSE_SPDX = 'AGPL-3.0-or-later'
export const releaseUrl = version => `${SOURCE_REPOSITORY_URL}/releases/tag/v${version}`

// Voluntary donation link (for example https://www.paypal.com/donate/?hosted_button_id=… or
// https://paypal.me/…). Empty: the "Sostieni lo sviluppo" section shows no PayPal button.
// Only a plain link: PayPal is contacted only when the user opens it.
export const PAYPAL_DONATION_URL = 'https://paypal.me/MNapolitano570'

// Contact address of the author, not written in clear in the code and in the published files (spam harvesters
// read them): reversed and in base64, decoded only when shown
const AUTHOR_EMAIL_ENCODED = 'bW9jLmxpYW1nQG9uYXRpbG9wYW4ub2l6aXJ1YW0='
export const authorEmail = () => [...atob(AUTHOR_EMAIL_ENCODED)].reverse().join('')

// Privacy policy (public/privacy.html), required by the sign-in of the cloud services
export const PRIVACY_URL = `${WEB_APP_URL}privacy.html`

// OAuth clients of the project for the synchronisation with the user's cloud service (docs/sincronizzazione.md).
// None of these is a secret: an installed app cannot keep one (RFC 8252). An empty id hides that service on that
// platform; with all of them empty the synchronisation is not offered and nothing contacts the services.
export const GOOGLE_OAUTH = {
  web: '',
  // The desktop "secret" is public for Google but stays out of the repository (secret scanning): build time only
  desktop: { clientId: '', clientSecret: import.meta.env?.VITE_GOOGLE_DESKTOP_CLIENT_SECRET ?? '' },
  android: '', // found by Play services from package and certificate: only tells that the client exists
  ios: '',
}
export const DROPBOX_OAUTH = { appKey: '' }
export const ONEDRIVE_OAUTH = { clientId: '' }

// A configured external link: http(s) only, otherwise null (no broken button)
export function externalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
