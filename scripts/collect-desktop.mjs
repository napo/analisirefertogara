// Collects the desktop packages of one target into desktop-dist/, with release-friendly names (no spaces:
// GitHub turns them into dots anyway) and the updater files: signatures (.sig) and the macOS update
// archive, whose name gets the architecture (Apple Silicon and Intel would otherwise collide).
// Usage: node scripts/collect-desktop.mjs <rust target>
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const target = process.argv[2]
if (!target) throw Error('usage: collect-desktop.mjs <rust target>')
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version
const bundle = join('src-tauri/target', target, 'release/bundle')
const out = 'desktop-dist'
mkdirSync(out, { recursive: true })
const arch = target.startsWith('aarch64') ? 'aarch64' : 'x64'
const clean = name => name.replace(/ /g, '.')

const walk = dir => (existsSync(dir) ? readdirSync(dir).flatMap(name => {
  const path = join(dir, name)
  return statSync(path).isDirectory() && !name.endsWith('.app') ? walk(path) : [path]
}) : [])

let copied = 0
for (const path of walk(bundle)) {
  const name = path.split('/').pop()
  let destination = null
  if (/(\.exe|\.msi|\.dmg|\.deb|\.AppImage)(\.sig)?$/.test(name)) destination = clean(name)
  else if (/\.app\.tar\.gz(\.sig)?$/.test(name)) destination = clean(`Referto Volley_${version}_${arch}.app.tar.gz${name.endsWith('.sig') ? '.sig' : ''}`)
  if (!destination) continue
  copyFileSync(path, join(out, destination))
  console.log(`${path} -> ${out}/${destination}`)
  copied++
}
if (!copied) throw Error(`no package found in ${bundle}`)
