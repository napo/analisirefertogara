// Project links and identity: the single place for URLs shown in the app (Informazioni page, footer,
// PDF report). Components import them from here and never repeat them.
export const AUTHOR_NAME = 'Maurizio Napolitano'
export const AUTHOR_URL = 'https://github.com/napo'
export const SOURCE_REPOSITORY_URL = 'https://github.com/napo/analisirefertogara'
export const LICENSE_URL = `${SOURCE_REPOSITORY_URL}/blob/main/LICENSE`
export const LICENSE_NAME = 'GNU Affero General Public License v3.0 or later'
export const LICENSE_SPDX = 'AGPL-3.0-or-later'
export const releaseUrl = version => `${SOURCE_REPOSITORY_URL}/releases/tag/v${version}`

// Voluntary donation link (for example https://www.paypal.com/donate/?hosted_button_id=… or
// https://paypal.me/…). Empty: the "Sostieni lo sviluppo" section shows no PayPal button.
// Only a plain link: PayPal is contacted only when the user opens it.
export const PAYPAL_DONATION_URL = 'https://paypal.me/MNapolitano570'

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
