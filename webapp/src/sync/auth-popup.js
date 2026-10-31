/**
 * The way back of a PKCE sign-in in the web version: the page of the service
 * opens in a window, which comes back to public/oauth-callback.html; that page
 * hands over its address on a channel of this origin. The window is opened
 * before anything else, as browsers block it when it is far from the user's tap.
 */
import { SignInError } from './auth-pkce.js'
const CHANNEL = 'referto-volley-oauth'
const TIMEOUT_MS = 5 * 6e4
export function popupSignIn() {
  let popup = null
  return {
    async redirect() {
      popup = window.open('about:blank', 'referto-volley-oauth', 'popup,width=520,height=720')
      if (!popup) throw new SignInError('popup blocked')
      return {
        uri: `${location.origin}${import.meta.env.BASE_URL}oauth-callback.html`,
        wait: () => new Promise((resolve, reject) => {
          const channel = new BroadcastChannel(CHANNEL)
          const timer = setTimeout(() => {
            channel.close()
            reject(new SignInError('timeout'))
          }, TIMEOUT_MS)
          channel.onmessage = (event) => {
            clearTimeout(timer)
            channel.close()
            resolve(String(event.data))
          }
        })
      }
    },
    async openBrowser(url) {
      popup.location.href = url
    }
  }
}
