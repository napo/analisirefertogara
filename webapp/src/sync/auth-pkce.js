/**
 * Sign-in of the installed apps (RFC 8252): the page of the service opens in
 * the system browser, never inside the app (Google refuses embedded web views)
 * the browser comes back to the app with a code, exchanged with PKCE for an
 * access token and a refresh token, kept on the device to renew the access
 * without asking again. The way back depends on the platform:
 * 127.0.0.1 on the desktop (src-tauri/src/oauth.rs), the app's URL scheme on iOS.
 */
import { TokenCache } from './auth.js'
/** Sign-in refused or cancelled by the user, or a code the service did not accept. */
export class SignInError extends Error {}
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const random = (length) => base64url(crypto.getRandomValues(new Uint8Array(length)))
export async function pkcePair() {
  const verifier = random(48)
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  return {
    verifier,
    challenge
  }
}
export class PkceAuth {
  options
  cache = new TokenCache()
  storage
  constructor(options) {
    this.options = options
    this.storage = options.storage ?? localStorage
  }
  get refreshKey() {
    return this.options.endpoints.storageKey
  }
  async token(interactive) {
    const cached = this.cache.get()
    if (cached) return cached
    if (this.storage.getItem(this.refreshKey) && await this.refresh()) return this.cache.get()
    return interactive ? this.signIn() : null
  }
  invalidate() {
    this.cache.clear()
  }
  async signOut() {
    const token = this.storage.getItem(this.refreshKey)
    const { revoke, revokeWithAccessToken } = this.options.endpoints
    const access = revokeWithAccessToken && token ? this.cache.get() ?? (await this.refresh().catch(() => false) ? this.cache.get() : null) : null
    this.storage.removeItem(this.refreshKey)
    this.cache.clear()
    if (!token || !revoke) return
    const request = revokeWithAccessToken ? access && this.options.fetch(revoke, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}` }
    }) : this.options.fetch(`${revoke}?${new URLSearchParams({ token })}`, { method: 'POST' })
    await Promise.resolve(request).catch(() => undefined)
  }
  async tokenRequest(fields) {
    const { clientId, clientSecret } = this.options
    const body = new URLSearchParams({
      client_id: clientId,
      ...clientSecret && { client_secret: clientSecret },
      ...fields
    })
    const response = await this.options.fetch(this.options.endpoints.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...this.options.tokenHeaders
      },
      body: body.toString()
    })
    const json = await response.json()
    return {
      ok: response.ok && Boolean(json.access_token),
      ...json
    }
  }
  /** A new access token from the refresh token; false when the service no longer accepts it (access revoked). */
  async refresh() {
    const result = await this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: this.storage.getItem(this.refreshKey)
    })
    if (!result.ok) {
      if (result.error === 'invalid_grant') this.storage.removeItem(this.refreshKey)
      return false
    }
    // Some services hand out a new refresh token at every renewal.
    if (result.refresh_token) this.storage.setItem(this.refreshKey, result.refresh_token)
    this.cache.set(result.access_token, result.expires_in ?? 3600)
    return true
  }
  async signIn() {
    const redirect = await this.options.redirect()
    const { verifier, challenge } = await pkcePair()
    const state = random(16)
    const { authorize, scope, extraParams } = this.options.endpoints
    const url = `${authorize}?${new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: redirect.uri,
      response_type: 'code',
      scope,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      ...extraParams
    })}`
    const back = redirect.wait()
    await this.options.openBrowser(url)
    const query = new URL(await back, redirect.uri).searchParams
    if (query.get('state') !== state || !query.get('code')) throw new SignInError(query.get('error') ?? 'no code')
    const result = await this.tokenRequest({
      grant_type: 'authorization_code',
      code: query.get('code'),
      code_verifier: verifier,
      redirect_uri: redirect.uri
    })
    if (!result.ok) throw new SignInError(result.error ?? 'token')
    if (result.refresh_token) this.storage.setItem(this.refreshKey, result.refresh_token)
    this.cache.set(result.access_token, result.expires_in ?? 3600)
    return result.access_token
  }
}
