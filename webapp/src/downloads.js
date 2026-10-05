// Download section of the "Informazioni" page: the packages of the latest GitHub release, read from the
// GitHub API (nothing is listed by hand, so the page follows each new release by itself).
import { RELEASES_API } from './updates.js'

// Order, card text and chip labels of the platforms; the first matching rule wins
const RULES = [
  { platform: 'Windows', note: 'Installer (.exe / .msi)', test: /\.(exe|msi)$/i, label: name => (/\.msi$/i.test(name) ? 'msi' : 'exe') },
  { platform: 'macOS', note: 'Immagine disco (.dmg)', test: /_aarch64\.dmg$/i, label: () => 'Apple Silicon' },
  { platform: 'macOS', note: 'Immagine disco (.dmg)', test: /_x64\.dmg$/i, label: () => 'Intel' },
  { platform: 'Linux', note: 'AppImage, .deb', test: /\.AppImage$/i, label: () => 'AppImage' },
  { platform: 'Linux', note: 'AppImage, .deb', test: /\.deb$/i, label: () => 'deb' },
  { platform: 'Android', note: 'Pacchetto APK', test: /android-universal(-debug)?\.apk$/i, label: () => 'apk' },
  { platform: 'iPhone e iPad', note: 'IPA non firmato (sideloading)', test: /iOS-unsigned\.ipa$/i, label: () => 'ipa' },
]

// [{ platform, note, files: [{ name, label, url }] }] in display order; unknown assets (signatures, manifests, …) are skipped
export function groupDownloads(release) {
  const groups = []
  for (const asset of release?.assets || []) {
    const index = RULES.findIndex(candidate => candidate.test.test(asset.name))
    if (index < 0) continue
    const rule = RULES[index]
    let group = groups.find(item => item.platform === rule.platform)
    if (!group) groups.push(group = { platform: rule.platform, note: rule.note, order: index, files: [] })
    group.files.push({ name: asset.name, label: rule.label(asset.name), url: asset.browser_download_url, order: index })
  }
  groups.sort((a, b) => a.order - b.order)
  for (const group of groups) group.files.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  return groups.map(({ platform, note, files }) => ({ platform, note, files: files.map(({ order, ...file }) => file) }))
}

// { version, groups } of the latest release, or null (offline, rate limit, no release yet)
export async function fetchLatestDownloads({ fetchImpl = globalThis.fetch } = {}) {
  const response = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) return null
  const release = await response.json()
  return { version: String(release.tag_name).replace(/^v/i, ''), groups: groupDownloads(release), url: release.html_url, date: release.published_at || null }
}
