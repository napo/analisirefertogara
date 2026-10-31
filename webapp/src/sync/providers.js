import { syncPlatform } from './platform.js'
import { dropbox } from './provider-dropbox.js'
import { googleDrive } from './provider-google.js'
import { onedrive } from './provider-onedrive.js'
export const PROVIDERS = [
  googleDrive,
  dropbox,
  onedrive
]
/** Devices connected before the choice of a service existed use Google Drive. */
export const DEFAULT_PROVIDER = googleDrive
export function providerById(id) {
  return PROVIDERS.find((p) => p.id === id) ?? DEFAULT_PROVIDER
}
/** Synchronisation is offered only where the project has a client for at least one service. */
export function syncAvailable(platform = syncPlatform()) {
  return PROVIDERS.some((p) => p.available(platform))
}
export function createAuth(provider, platform = syncPlatform()) {
  return provider.available(platform) ? provider.createAuth(platform) : Promise.resolve(null)
}
/** Gets the sign-in ready before the user's tap (on the web, what the window of the service needs). */
export async function prepareSignIn(platform = syncPlatform()) {
  await Promise.all(PROVIDERS.filter((p) => p.available(platform)).map((p) => p.prepare?.(platform)))
}
