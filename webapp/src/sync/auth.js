/** An access token with its expiry, kept in memory. */
export class TokenCache {
  clock
  value = null
  constructor(clock = () => Date.now()) {
    this.clock = clock
  }
  get() {
    // A minute of margin: a token about to expire would fail during the upload.
    return this.value && this.value.expires - 6e4 > this.clock() ? this.value.token : null
  }
  set(token, expiresInSeconds) {
    this.value = {
      token,
      expires: this.clock() + expiresInSeconds * 1e3
    }
  }
  clear() {
    this.value = null
  }
}
