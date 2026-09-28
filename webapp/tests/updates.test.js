import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { RELEASES_API, checkForUpdate, compareVersions, mobileDownload, mobilePlatform } from '../src/updates.js'

test('versions: tags and app versions compare numerically', () => {
  assert.equal(compareVersions('v0.15', '0.14'), 1)
  assert.equal(compareVersions('0.14.0', 'v0.14'), 0)
  assert.equal(compareVersions('0.9', '0.10'), -1)
  assert.equal(compareVersions('1.0', '0.99'), 1)
})

test('platform and download of the mobile apps', () => {
  assert.equal(mobilePlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'android')
  assert.equal(mobilePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'ios')
  assert.equal(mobilePlatform('Mozilla/5.0 (X11; Linux x86_64)'), null)
  const release = {
    html_url: 'https://github.com/napo/analisirefertogara/releases/tag/v0.15',
    assets: [
      { name: 'Referto.Volley_0.15.0_android-universal-debug.apk', browser_download_url: 'https://x/debug.apk' },
      { name: 'Referto.Volley_0.15.0_android-universal.apk', browser_download_url: 'https://x/signed.apk' },
    ],
  }
  assert.equal(mobileDownload(release, 'android'), 'https://x/signed.apk')
  assert.equal(mobileDownload({ ...release, assets: release.assets.slice(0, 1) }, 'android'), 'https://x/debug.apk')
  assert.equal(mobileDownload(release, 'ios'), release.html_url)
})

test('update check: nothing in the web version; mobile compares with the latest GitHub release', async () => {
  assert.equal(await checkForUpdate('0.14', { app: false }), null)
  const calls = []
  const fetchImpl = tag => async (url, options) => {
    calls.push([url, options.headers.Accept])
    return { ok: true, json: async () => ({ tag_name: tag, html_url: 'https://github.com/r', assets: [{ name: 'Referto.Volley_0.15.0_android-universal.apk', browser_download_url: 'https://x/a.apk' }] }) }
  }
  assert.deepEqual(await checkForUpdate('0.14', { app: true, platform: 'android', fetchImpl: fetchImpl('v0.15') }),
    { kind: 'mobile', version: '0.15', notes: '', url: 'https://x/a.apk' })
  assert.equal(await checkForUpdate('0.15', { app: true, platform: 'android', fetchImpl: fetchImpl('v0.15') }), null)
  assert.equal(await checkForUpdate('0.14', { app: true, platform: 'ios', fetchImpl: async () => ({ ok: false }) }), null)
  assert.equal(calls[0][0], RELEASES_API)
})

test('release scripts: latest.json lists only signed packages, with the platform keys of the updater', () => {
  const root = new URL('../../', import.meta.url).pathname
  const dir = mkdtempSync(join(tmpdir(), 'release-'))
  const files = {
    'Referto.Volley_0.15.0_x64-setup.exe': 'exe', 'Referto.Volley_0.15.0_x64-setup.exe.sig': 'SIG-NSIS\n',
    'Referto.Volley_0.15.0_x64_en-US.msi': 'msi', 'Referto.Volley_0.15.0_x64_en-US.msi.sig': 'SIG-MSI',
    'Referto.Volley_0.15.0_aarch64.app.tar.gz': 'mac', 'Referto.Volley_0.15.0_aarch64.app.tar.gz.sig': 'SIG-ARM',
    'Referto.Volley_0.15.0_x64.app.tar.gz': 'mac', 'Referto.Volley_0.15.0_x64.app.tar.gz.sig': 'SIG-INTEL',
    'Referto.Volley_0.15.0_amd64.AppImage': 'appimage', 'Referto.Volley_0.15.0_amd64.AppImage.sig': 'SIG-APPIMAGE',
    'Referto.Volley_0.15.0_amd64.deb': 'deb', 'Referto.Volley_0.15.0_amd64.deb.sig': 'SIG-DEB',
    'Referto.Volley_0.15.0_aarch64.dmg': 'dmg', // no signature: not an update package
    'Referto.Volley_0.15.0_android-universal.apk': 'apk',
  }
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  execFileSync('node', ['scripts/updater-manifest.mjs', dir, 'v0.15'], { cwd: root })
  const manifest = JSON.parse(readFileSync(join(dir, 'latest.json'), 'utf8'))
  const version = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')).version
  assert.equal(manifest.version, version)
  assert.deepEqual(Object.keys(manifest.platforms).sort(), ['darwin-aarch64', 'darwin-aarch64-app', 'darwin-x86_64', 'darwin-x86_64-app',
    'linux-x86_64', 'linux-x86_64-appimage', 'linux-x86_64-deb', 'windows-x86_64', 'windows-x86_64-msi', 'windows-x86_64-nsis'])
  assert.deepEqual(manifest.platforms['windows-x86_64-nsis'], { signature: 'SIG-NSIS', url: 'https://github.com/napo/analisirefertogara/releases/download/v0.15/Referto.Volley_0.15.0_x64-setup.exe' })
  assert.equal(manifest.platforms['darwin-x86_64-app'].signature, 'SIG-INTEL')
  assert.equal(manifest.platforms['linux-x86_64'].signature, 'SIG-APPIMAGE')
})
