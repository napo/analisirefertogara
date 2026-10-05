// Writes latest.json for the Tauri updater from the files of a release (and their .sig signatures).
// The app reads https://github.com/<repo>/releases/latest/download/latest.json and looks for
// "<os>-<arch>-<installer>" (then "<os>-<arch>"). Only packages with a signature are listed.
// Usage: node scripts/updater-manifest.mjs <release files dir> <tag> [repository]
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir, tag, repository = 'napo/analisirefertogara'] = process.argv.slice(2)
if (!dir || !tag) throw Error('usage: updater-manifest.mjs <dir> <tag> [repository]')
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version

// file pattern -> platform keys (the first key of each list is the specific one)
const RULES = [
  [/-setup\.exe$/, ['windows-x86_64-nsis', 'windows-x86_64']],
  [/\.msi$/, ['windows-x86_64-msi']],
  [/_aarch64\.app\.tar\.gz$/, ['darwin-aarch64-app', 'darwin-aarch64']],
  [/_x64\.app\.tar\.gz$/, ['darwin-x86_64-app', 'darwin-x86_64']],
  [/\.AppImage$/, ['linux-x86_64-appimage', 'linux-x86_64']],
  [/\.deb$/, ['linux-x86_64-deb']],
  [/\.rpm$/, ['linux-x86_64-rpm']],
]

const platforms = {}
for (const file of readdirSync(dir).sort()) {
  const rule = RULES.find(([pattern]) => pattern.test(file))
  const signature = join(dir, `${file}.sig`)
  if (!rule || !existsSync(signature)) continue
  const entry = { signature: readFileSync(signature, 'utf8').trim(), url: `https://github.com/${repository}/releases/download/${tag}/${file}` }
  for (const key of rule[1]) if (!platforms[key]) platforms[key] = entry
}
if (!Object.keys(platforms).length) throw Error(`no signed package in ${dir}`)
const manifest = {
  version,
  notes: `Referto Volley ${tag}: https://github.com/${repository}/releases/tag/${tag}`,
  pub_date: new Date().toISOString(),
  platforms,
}
writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`latest.json ${version}: ${Object.keys(platforms).join(', ')}`)
