// Download section of the "Informazioni" page: the packages of the latest GitHub release, read from the
// GitHub API (nothing is listed by hand, so the page follows each new release by itself).
import { RELEASES_API } from './updates.js'

// Order and labels of the platforms; the first matching rule wins
const RULES = [
  { id: 'windows', platform: 'Windows', test: /\.(exe|msi)$/i, label: name => (/\.msi$/i.test(name) ? 'Installer MSI' : 'Installer') },
  { id: 'mac-arm', platform: 'macOS', test: /_aarch64\.dmg$/i, label: () => 'Apple Silicon (M1 e successivi)' },
  { id: 'mac-intel', platform: 'macOS', test: /_x64\.dmg$/i, label: () => 'Intel' },
  { id: 'linux-deb', platform: 'Linux', test: /\.deb$/i, label: () => 'Pacchetto .deb (Debian, Ubuntu)' },
  { id: 'linux-appimage', platform: 'Linux', test: /\.AppImage$/i, label: () => 'AppImage (qualsiasi distribuzione)' },
  { id: 'android', platform: 'Android', test: /android-universal(-debug)?\.apk$/i, label: () => 'APK' },
  { id: 'ios', platform: 'iPhone e iPad', test: /iOS-unsigned\.ipa$/i, label: () => 'IPA non firmato (sideloading)' },
]

// [{ platform, files: [{ name, label, url }] }] in display order; unknown assets (signatures, manifests, …) are skipped
export function groupDownloads(release) {
  const groups = []
  for (const asset of release?.assets || []) {
    const rule = RULES.find(candidate => candidate.test.test(asset.name))
    if (!rule) continue
    let group = groups.find(item => item.platform === rule.platform)
    if (!group) groups.push(group = { platform: rule.platform, order: RULES.indexOf(rule), files: [] })
    group.files.push({ name: asset.name, label: rule.label(asset.name), url: asset.browser_download_url, order: RULES.indexOf(rule) })
  }
  groups.sort((a, b) => a.order - b.order)
  for (const group of groups) group.files.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  return groups.map(({ platform, files }) => ({ platform, files: files.map(({ order, ...file }) => file) }))
}

// { version, groups } of the latest release, or null (offline, rate limit, no release yet)
export async function fetchLatestDownloads({ fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) return null
  const release = await response.json()
  return { version: String(release.tag_name).replace(/^v/i, ''), groups: groupDownloads(release), url: release.html_url }
}
