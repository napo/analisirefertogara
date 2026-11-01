import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byWeek, mergeDaily, releaseRows, releaseSummary, weekOf } from '../../scripts/github-stats.mjs'

test('GitHub numbers: installers by platform, signatures left out', () => {
  const asset = (name, download_count) => ({ name, download_count })
  const summary = releaseSummary({ tag_name: 'v1', published_at: '2026-01-01T00:00:00Z', assets: [asset('latest.json', 7), asset('a_x64-setup.exe', 3), asset('a_x64-setup.exe.sig', 9), asset('a.msi', 1), asset('a.apk', 2), asset('a.AppImage', 4), asset('a.deb', 1), asset('a.app.tar.gz', 5)] })
  assert.equal(summary.updateChecks, 7)
  assert.deepEqual(summary.platforms, { Windows: 4, Android: 2, Linux: 5 })
})

test('GitHub numbers: the history outlives the 14 days and takes the newest reading', () => {
  const first = mergeDaily({}, [{ timestamp: '2026-01-01T00:00:00Z', count: 2, uniques: 1 }, { timestamp: '2026-01-02T00:00:00Z', count: 1, uniques: 1 }])
  const second = mergeDaily(first, [{ timestamp: '2026-01-02T00:00:00Z', count: 5, uniques: 2 }])
  assert.deepEqual(second, { '2026-01-01': { count: 2, uniques: 1 }, '2026-01-02': { count: 5, uniques: 2 } })
})

test('GitHub numbers: weeks from Monday, rate only after a whole day', () => {
  assert.equal(weekOf('2026-11-01'), '2026-10-26') // a Sunday
  assert.equal(weekOf('2026-11-02'), '2026-11-02')
  assert.deepEqual(byWeek({ '2026-11-01': { count: 2, uniques: 1 }, '2026-10-26': { count: 3, uniques: 2 } }), { '2026-10-26': { count: 5, dailyUniques: 3 } })
  const rows = releaseRows([
    { tag: 'v2', publishedAt: '2026-01-11T00:00:00Z', updateChecks: 1 },
    { tag: 'v1', publishedAt: '2026-01-01T00:00:00Z', updateChecks: 20 },
  ], Date.parse('2026-01-11T12:00:00Z'))
  assert.equal(rows[0].tag, 'v1')
  assert.equal(rows[0].days, 10)
  assert.equal(rows[0].checksPerDay, 2)
  assert.equal(rows[1].checksPerDay, null)
})
