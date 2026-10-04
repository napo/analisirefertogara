// Update check of the installed apps (Tauri). Never in the web version, which is always the latest.
// - Windows, macOS, Linux: Tauri updater (signed packages listed in latest.json of the latest GitHub
//   release); the user confirms, the app downloads, installs and restarts.
// - Android, iPhone/iPad: the updater does not exist on mobile; the latest GitHub release is read and,
//   if newer, the notice opens its download (APK) or its page (iPhone) in the browser.
// Only the version is requested from GitHub: no data about the matches leaves the device.
import { SOURCE_REPOSITORY_URL } from './config.js'

export const RELEASES_API = SOURCE_REPOSITORY_URL.replace('https://github.com/', 'https://api.github.com/repos/') + '/releases/latest'
const SETTING = 'referto-volley.update-checks'

export const isTauriApp = () => Boolean(globalThis.__TAURI_INTERNALS__)
export function mobilePlatform(userAgent = globalThis.navigator?.userAgent || '') {
  if (/Android/i.test(userAgent)) return 'android'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  return null
}

// "v0.15" > "0.14.0": numeric comparison of dotted versions (missing parts = 0)
export function compareVersions(a, b) {
  const parts = value => String(value || '').replace(/^v/i, '').split(/[.-]/).map(part => Number.parseInt(part, 10) || 0)
  const x = parts(a), y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1
  }
  return 0
}

// Mobile: what to open for a release (the signed APK; the release page otherwise). The debug APK is never
// offered: it is signed with another key and cannot be installed over the app.
export function mobileDownload(release, platform) {
  if (platform === 'android') {
    const assets = release.assets || []
    const apk = assets.find(a => /android-universal\.apk$/.test(a.name))
    if (apk) return apk.browser_download_url
  }
  return release.html_url
}

export function updateChecksEnabled() {
  try {
    return globalThis.localStorage?.getItem(SETTING) !== 'off'
  } catch {
    return true
  }
}
export function setUpdateChecksEnabled(enabled) {
  try {
    globalThis.localStorage?.setItem(SETTING, enabled ? 'on' : 'off')
  } catch {
    // not persisted: default (enabled) at the next start
  }
}

// { kind: 'desktop' | 'mobile', version, notes, url?, update? } or null (no update, web version, offline)
export async function checkForUpdate(currentVersion, { fetchImpl = globalThis.fetch, app = isTauriApp(), platform = mobilePlatform() } = {}) {
  if (!app) return null
  if (!platform) {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    return update ? { kind: 'desktop', version: update.version, notes: update.body || '', update } : null
  }
  const response = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) return null
  const release = await response.json()
  if (compareVersions(release.tag_name, currentVersion) <= 0) return null
  return { kind: 'mobile', version: String(release.tag_name).replace(/^v/i, ''), notes: '', url: mobileDownload(release, platform) }
}

// Version of the last start: when the app starts with a newer version, it has just been updated
const LAST_VERSION_SETTING = 'referto-volley.last-version'
// Returns the version of the previous start (null the first time) and stores the current one
export function swapLastVersion(currentVersion) {
  try {
    const previous = globalThis.localStorage?.getItem(LAST_VERSION_SETTING) || null
    globalThis.localStorage?.setItem(LAST_VERSION_SETTING, String(currentVersion))
    return previous
  } catch {
    return null
  }
}

// Desktop: download, install (the user already confirmed) and restart. onProgress(0..1 or null)
export async function installUpdate(info, onProgress = () => {}) {
  let total = 0, received = 0
  await info.update.downloadAndInstall(event => {
    if (event.event === 'Started') total = event.data.contentLength || 0
    if (event.event === 'Progress') { received += event.data.chunkLength; onProgress(total ? received / total : null) }
    if (event.event === 'Finished') onProgress(1)
  })
  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
}

// Installed apps: open a URL in the system browser (download of a new version, external links)
export async function openInSystemBrowser(url) {
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(url)
}
export const openDownload = openInSystemBrowser
