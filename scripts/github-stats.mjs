// Numbers about the project from GitHub, with nothing added to the app: downloads of each release, visits,
// clones and where visitors come from. GitHub keeps visits and clones for 14 days only, so each run merges
// them into a local history (stats/github-stats.json, not in the repository: these numbers are not public).
// Run at least every two weeks: npm run stats. Needs the gh command, logged in with access to the repository.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPOSITORY = 'napo/analisirefertogara'
const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../stats/github-stats.json')
const DAY = 24 * 60 * 60 * 1000

const PLATFORMS = [
  ['Windows', /(setup\.exe|\.msi)$/],
  ['macOS', /\.dmg$/],
  ['Linux', /\.(AppImage|deb|rpm)$/],
  ['Android', /\.(apk|aab)$/],
  ['iOS', /\.ipa$/],
]

// One release: checks of the desktop apps (latest.json, read at each start by those who have the check on)
// and installers by platform; signatures and update archives are not installations
export function releaseSummary(release) {
  const platforms = {}
  for (const asset of release.assets || []) {
    const platform = PLATFORMS.find(([, pattern]) => pattern.test(asset.name))?.[0]
    if (platform) platforms[platform] = (platforms[platform] || 0) + asset.download_count
  }
  const updateChecks = (release.assets || []).find(asset => asset.name === 'latest.json')?.download_count || 0
  return { tag: release.tag_name, publishedAt: release.published_at, updateChecks, platforms }
}

// Daily visits or clones added to the history. The last days may still grow: the newest reading wins
export function mergeDaily(history = {}, days = []) {
  const merged = { ...history }
  for (const { timestamp, count, uniques } of days) merged[timestamp.slice(0, 10)] = { count, uniques }
  return merged
}

// Monday of the week of a day (YYYY-MM-DD)
export function weekOf(day) {
  const date = new Date(`${day}T00:00:00Z`)
  return new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10)
}

// Daily values by week: visits add up; the same person on two days counts twice, as unique only per day
export function byWeek(daily) {
  const weeks = {}
  for (const [day, { count, uniques }] of Object.entries(daily).sort()) {
    const week = weeks[weekOf(day)] ||= { count: 0, dailyUniques: 0 }
    week.count += count
    week.dailyUniques += uniques
  }
  return weeks
}

// Releases from the oldest, with the days each one was the latest and its checks per day. A version out for
// less than a day says nothing about the rate
export function releaseRows(releases, now = Date.now()) {
  const ordered = [...releases].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
  return ordered.map((release, i) => {
    const end = i + 1 < ordered.length ? Date.parse(ordered[i + 1].publishedAt) : now
    const days = (end - Date.parse(release.publishedAt)) / DAY
    return { ...release, days, checksPerDay: days >= 1 ? release.updateChecks / days : null }
  })
}

function report({ traffic, snapshots }) {
  const dates = Object.keys(snapshots).sort()
  const latest = snapshots[dates.at(-1)]
  const previous = snapshots[dates.at(-2)]
  const change = (now, before) => (before === undefined ? '' : ` (${now - before >= 0 ? '+' : ''}${now - before} dal ${dates.at(-2)})`)
  console.log(`Repository: ${latest.stars} stelle${change(latest.stars, previous?.stars)}, ${latest.forks} fork${change(latest.forks, previous?.forks)}`)
  console.log('\nVersioni (controlli = avvii di app desktop con il controllo aggiornamenti attivo)')
  for (const row of releaseRows(latest.releases).slice(-12)) {
    const platforms = Object.entries(row.platforms).map(([name, count]) => `${name} ${count}`).join(', ')
    console.log(`  ${row.tag.padEnd(7)} ${row.publishedAt.slice(0, 10)}  ultima per ${row.days.toFixed(1).padStart(5)} gg  controlli ${String(row.updateChecks).padStart(4)}  al giorno ${row.checksPerDay === null ? '   -' : row.checksPerDay.toFixed(1).padStart(4)}  ${platforms}`)
  }
  for (const [title, daily] of [['Visite al repository', traffic.views], ['Clonazioni', traffic.clones]]) {
    console.log(`\n${title}, per settimana (dal lunedì; persone = somma delle persone diverse di ogni giorno)`)
    for (const [week, { count, dailyUniques }] of Object.entries(byWeek(daily)).slice(-8)) console.log(`  ${week}  ${String(count).padStart(5)}  persone ${dailyUniques}`)
  }
  console.log('\nDa dove arrivano (ultimi 14 giorni)')
  for (const { referrer, count, uniques } of latest.referrers) console.log(`  ${referrer}: ${count} visite, ${uniques} persone`)
  console.log('\nPagine più viste (ultimi 14 giorni)')
  for (const { path, count, uniques } of latest.paths.slice(0, 5)) console.log(`  ${path}: ${count} visite, ${uniques} persone`)
  console.log(`\nStorico: ${FILE}`)
}

function main() {
  const api = path => JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${REPOSITORY}${path}`], { encoding: 'utf8', maxBuffer: 1e8 })).flat()
  const one = path => api(path)[0]
  const stored = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { traffic: { views: {}, clones: {} }, snapshots: {} }
  const info = one('')
  const data = {
    traffic: {
      views: mergeDaily(stored.traffic.views, one('/traffic/views').views),
      clones: mergeDaily(stored.traffic.clones, one('/traffic/clones').clones),
    },
    snapshots: {
      ...stored.snapshots,
      [new Date().toISOString().slice(0, 10)]: {
        stars: info.stargazers_count,
        forks: info.forks_count,
        watchers: info.subscribers_count,
        releases: api('/releases?per_page=100').filter(release => !release.draft).map(releaseSummary),
        referrers: api('/traffic/popular/referrers'),
        paths: api('/traffic/popular/paths'),
      },
    },
  }
  mkdirSync(dirname(FILE), { recursive: true })
  writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`)
  report(data)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
