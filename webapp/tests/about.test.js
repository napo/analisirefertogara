// Informazioni page: author, open source, licence, origins, privacy and the optional PayPal link.
// The components are JSX: rolldown (already used by Vite) bundles them into node_modules/.cache and
// react-dom/server renders them to static markup.
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { rolldown } from 'rolldown'
import {
  AUTHOR_NAME, LICENSE_NAME, LICENSE_SPDX, LICENSE_URL, PAYPAL_DONATION_URL, SOURCE_REPOSITORY_URL, externalUrl,
} from '../src/config.js'
import { followExternalLink } from '../src/external-link.js'
import { RELEASES_API } from '../src/updates.js'

const TEST_PAYPAL = 'https://www.paypal.com/donate/?hosted_button_id=TEST'

async function loadAbout() {
  const dir = fileURLToPath(new URL('../../node_modules/.cache/referto-volley-tests/', import.meta.url))
  mkdirSync(dir, { recursive: true })
  const file = `${dir}about-${process.pid}.mjs`
  const bundle = await rolldown({
    input: fileURLToPath(new URL('../src/AboutProject.jsx', import.meta.url)),
    external: [/^react/, /^@tauri-apps\//],
    platform: 'node',
    moduleTypes: { '.svg': 'dataurl' },
    logLevel: 'silent',
  })
  await bundle.write({ file, format: 'esm', codeSplitting: false })
  await bundle.close()
  return import(pathToFileURL(file).href)
}
const about = await loadAbout()
const page = (paypalUrl = PAYPAL_DONATION_URL) => [
  renderToStaticMarkup(createElement(about.AboutProject)),
  renderToStaticMarkup(createElement(about.PrivacyCard)),
  renderToStaticMarkup(createElement(about.SupportCard, { paypalUrl })),
].join('\n')
const hrefs = html => [...html.matchAll(/href="([^"]*)"/g)].map(match => match[1].replaceAll('&amp;', '&'))

test('configuration: repository, licence and SPDX identifier of the project', () => {
  assert.equal(SOURCE_REPOSITORY_URL, 'https://github.com/napo/analisirefertogara')
  assert.equal(LICENSE_URL, `${SOURCE_REPOSITORY_URL}/blob/main/LICENSE`)
  assert.equal(LICENSE_NAME, 'GNU Affero General Public License v3.0 or later')
  assert.equal(LICENSE_SPDX, 'AGPL-3.0-or-later')
  assert.equal(RELEASES_API, 'https://api.github.com/repos/napo/analisirefertogara/releases/latest')
  assert.equal(externalUrl(''), null)
  assert.equal(externalUrl(null), null)
  assert.equal(externalUrl(undefined), null)
  assert.equal(externalUrl('javascript:alert(1)'), null)
  assert.equal(externalUrl('non un link'), null)
  assert.equal(externalUrl(TEST_PAYPAL), TEST_PAYPAL)
})

test('Informazioni: author, open source, repository, licence, origins, version, privacy', () => {
  const html = page('')
  assert.match(html, new RegExp(`Referto Volley è un progetto di ${AUTHOR_NAME}`))
  assert.match(html, /Maurizio Napolitano/)
  assert.match(html, /software open source/)
  assert.match(html, /GNU Affero General Public License v3\.0 or later/)
  assert.match(html, /AGPL-3\.0-or-later/)
  assert.ok(hrefs(html).includes(SOURCE_REPOSITORY_URL))
  assert.ok(hrefs(html).includes(LICENSE_URL))
  assert.match(html, /Andrea Fortunati/)
  assert.match(html, /foglio Excel/)
  assert.match(html, /Versione/)
  assert.match(html, /Privacy e dati/)
  assert.match(html, /non vengono inviati a un server/)
  assert.match(html, /OCR/)
  assert.doesNotMatch(html, /\bGPL\b(?!-)/, 'the licence is named in full, never as plain "GPL"')
  for (const link of hrefs(html)) assert.match(link, /^https:\/\//)
  assert.equal((html.match(/target="_blank"/g) || []).length, hrefs(html).length)
  assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, hrefs(html).length)
})

test('Sostieni lo sviluppo: PayPal button only with a configured link, never PayPal code', () => {
  const without = page('')
  assert.match(without, /Sostieni lo sviluppo/)
  assert.doesNotMatch(without, /Sostieni Referto Volley con PayPal/)
  assert.ok(!hrefs(without).some(link => /paypal/i.test(link)))
  // (undefined would mean "use the configuration": externalUrl(undefined) is checked above)
  for (const empty of [null, '   ', 'javascript:void(0)']) {
    assert.doesNotMatch(page(empty), /con PayPal/)
  }
  // default: the link from config.js, when configured
  const configured = externalUrl(PAYPAL_DONATION_URL)
  assert.equal(hrefs(page()).includes(configured), Boolean(configured))

  const html = page(TEST_PAYPAL)
  assert.match(html, /Sostieni Referto Volley con PayPal/)
  // the wordmark is decorative (alt=""): the button is named by its text
  assert.match(html, /<img[^>]*src="data:image\/svg\+xml[^"]*"[^>]*alt=""/)
  assert.doesNotMatch(without, /<img/)
  assert.match(html, /completamente facoltativa e non sblocca funzionalità aggiuntive/)
  assert.deepEqual(hrefs(html).filter(link => /paypal/i.test(link)), [TEST_PAYPAL])
  for (const markup of [html, without]) {
    assert.doesNotMatch(markup, /<iframe|<script|<link|<object|<embed/i)
    // the only image is the wordmark stored in the app, never a remote one
    for (const [, src] of markup.matchAll(/<img[^>]*src="([^"]*)"/g)) assert.doesNotMatch(src, /^(https?:)?\/\//)
    assert.doesNotMatch(markup, /paypalobjects|paypal\.com\/sdk|data-paypal/i)
    assert.doesNotMatch(markup, /(Donate|Support us) now|Premium|\bPro\b|Compra/)
  }
})

test('no component loads PayPal code: the link is used only when opened', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const src = fileURLToPath(new URL('../src/', import.meta.url))
  // config.js is where the link is set; everywhere else PayPal must not appear at all
  for (const name of readdirSync(src).filter(file => /\.(jsx?|css)$/.test(file) && file !== 'config.js')) {
    const code = readFileSync(`${src}${name}`, 'utf8')
    assert.doesNotMatch(code, /paypal\.com|paypalobjects|paypal-js|paypal\.me/i, name)
  }
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')
  assert.doesNotMatch(html, /paypal/i)
})

test('external links: system browser in the installed apps, normal link on the web', async () => {
  const opened = []
  let prevented = 0
  const event = { preventDefault: () => { prevented++ } }
  const open = url => { opened.push(url) }
  assert.equal(followExternalLink(event, LICENSE_URL, { app: false, open }), false)
  assert.deepEqual([opened, prevented], [[], 0])
  assert.equal(followExternalLink(event, LICENSE_URL, { app: true, open }), true)
  assert.deepEqual([opened, prevented], [[LICENSE_URL], 1])
  // a failed opener does not throw into the click handler
  assert.equal(followExternalLink(event, SOURCE_REPOSITORY_URL, { app: true, open: () => Promise.reject(new Error('x')) }), true)
})
