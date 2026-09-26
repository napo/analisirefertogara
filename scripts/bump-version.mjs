#!/usr/bin/env node
// Bump the app version (X.Z -> X.Z+1, stored as semver X.Z.0) and sync it across all manifests.
// Starts from the highest of package.json version and the latest vX.Z git tag.
// Usage: node scripts/bump-version.mjs [--major]   (--major: X+1.0)
// Prints the new version (X.Z) and the list of changed files.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = path => join(root, path)

// Latest vX.Z tag (remote tags fetched first when possible), so numbering continues from GitHub
const latestTag = () => {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  try { git(['fetch', '--tags', '--quiet']) } catch { /* offline: use local tags */ }
  try {
    return git(['tag', '-l', 'v*']).split('\n')
      .map(tag => tag.trim().match(/^v(\d+)\.(\d+)(?:\.\d+)?$/))
      .filter(Boolean)
      .map(match => [Number(match[1]), Number(match[2])])
      .sort((a, b) => b[0] - a[0] || b[1] - a[1])[0]
  } catch { return undefined }
}

const rootPackage = JSON.parse(readFileSync(file('package.json'), 'utf8'))
const current = (rootPackage.version || '0.1.0').split('.').map(Number)
const tagged = latestTag()
const [major, minor] = tagged && (tagged[0] > current[0] || (tagged[0] === current[0] && tagged[1] > current[1])) ? tagged : current
const next = process.argv.includes('--major') ? `${major + 1}.0.0` : `${major}.${minor + 1}.0`

const updateJson = (path, update) => {
  const data = JSON.parse(readFileSync(file(path), 'utf8'))
  update(data)
  writeFileSync(file(path), `${JSON.stringify(data, null, 2)}\n`)
}
const updateText = (path, pattern, replacement) => {
  const text = readFileSync(file(path), 'utf8')
  if (!pattern.test(text)) throw Error(`Versione non trovata in ${path}`)
  writeFileSync(file(path), text.replace(pattern, replacement))
}

updateJson('package.json', data => { data.version = next })
updateJson('webapp/package.json', data => { data.version = next })
updateJson('src-tauri/tauri.conf.json', data => { data.version = next })
updateJson('package-lock.json', data => {
  data.version = next
  data.packages[''].version = next
  if (data.packages.webapp) data.packages.webapp.version = next
})
updateText('src-tauri/Cargo.toml', /^version = ".*"$/m, `version = "${next}"`)
updateText('src-tauri/Cargo.lock', /(name = "referto-volley"\nversion = )".*"/, `$1"${next}"`)

console.log(next.split('.').slice(0, 2).join('.'))
