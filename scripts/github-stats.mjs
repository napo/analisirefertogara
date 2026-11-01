// Numbers about the project from GitHub, with nothing added to the app: downloads of each release, visits,
// clones and where visitors come from. GitHub keeps visits and clones for 14 days only, so each run merges
// them into a history. Every week an Action keeps it on the "stats" branch (.github/workflows/github-stats.yml);
// npm run stats does the same on this computer, in stats/github-stats.json, outside the repository.
// Needs the gh command. Visits and clones need a token with access to the traffic: without it they are skipped
// and the history keeps what it has.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPOSITORY = 'napo/analisirefertogara'
const FILE = process.env.STATS_FILE ? resolve(process.env.STATS_FILE) : resolve(dirname(fileURLToPath(import.meta.url)), '../stats/github-stats.json')
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

const PLATFORM_NAMES = PLATFORMS.map(([name]) => name)
const italianDate = day => day.split('-').reverse().join('/')
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`, ...rows.map(row => `| ${row.join(' | ')} |`)].join('\n')
const barChart = (title, labels, values) => ['```mermaid', 'xychart-beta', `  title "${title}"`, `  x-axis [${labels.map(label => `"${label}"`).join(', ')}]`, `  y-axis "Numero" 0 --> ${Math.max(1, ...values)}`, `  bar [${values.join(', ')}]`, '```'].join('\n')

// A week still in progress counts less than the others: it is left out of the comparison and of the charts
const completeWeeks = (daily, now) => Object.entries(byWeek(daily)).filter(([week]) => Date.parse(`${week}T00:00:00Z`) + 7 * DAY <= now)

// The page shown on the "stats" branch: what matters first, in words, then tables and charts
export function markdownReport({ traffic, snapshots }, now = Date.now()) {
  const dates = Object.keys(snapshots).sort()
  const latest = snapshots[dates.at(-1)]
  const rows = releaseRows(latest.releases, now)
  // versions replaced within a day: their numbers are only the background noise
  const lasting = rows.filter((row, i) => row.days >= 1 || i === rows.length - 1).slice(-10)
  const weeks = completeWeeks(traffic.views, now).slice(-12)
  const clones = completeWeeks(traffic.clones, now).slice(-12)
  const [lastWeek, weekBefore] = [weeks.at(-1), weeks.at(-2)]
  const rated = rows.filter(row => row.checksPerDay !== null)
  const lastRate = rated.at(-1)
  const sum = list => list.reduce((total, value) => total + value, 0)
  const sections = [
    '# Statistiche di Referto Volley',
    `Aggiornate il ${italianDate(dates.at(-1))}, ogni lunedì in automatico. I dati vengono da GitHub: l'app non invia nulla. Lo storico è in \`github-stats.json\`.`,
    '## In breve',
    [
      lastRate && `- **Uso delle app desktop:** ${lastRate.checksPerDay.toFixed(1).replace('.', ',')} controlli di aggiornamento al giorno con la ${lastRate.tag}.`,
      lastWeek && `- **Visite al repository:** ${lastWeek[1].count} nella settimana del ${italianDate(lastWeek[0])}${weekBefore ? `, contro ${weekBefore[1].count} della precedente` : ''}.`,
      `- **Repository:** ${latest.stars} stelle, ${latest.forks} fork.`,
    ].filter(Boolean).join('\n'),
    '## Uso delle app, versione per versione',
    'Ogni app desktop legge `latest.json` all\'avvio, se il controllo aggiornamenti è attivo: i **controlli** sono avvii, non persone. Conta soprattutto il valore **al giorno**. Non comprendono la versione web e le app Android. Le versioni rimaste le più recenti per meno di un giorno non sono elencate, salvo l\'ultima.',
    table(['Versione', 'Uscita', 'Giorni come ultima', 'Controlli', 'Al giorno', ...PLATFORM_NAMES], lasting.map(row => [
      row.tag, italianDate(row.publishedAt.slice(0, 10)), row.days.toFixed(1).replace('.', ','), row.updateChecks,
      row.checksPerDay === null ? '–' : row.checksPerDay.toFixed(1).replace('.', ','), ...PLATFORM_NAMES.map(name => row.platforms[name] || 0),
    ])),
    'Le colonne per piattaforma sono i download dei pacchetti di installazione. Anche una versione appena uscita ne ha qualcuno per piattaforma, per prove o bot: conta ciò che supera quella soglia.',
  ]
  const ratedLasting = lasting.filter(row => row.checksPerDay !== null)
  if (ratedLasting.length > 1) sections.push(barChart('Controlli di aggiornamento al giorno', ratedLasting.map(row => row.tag), ratedLasting.map(row => Number(row.checksPerDay.toFixed(1)))))
  sections.push('## Visite al repository')
  if (weeks.length) {
    sections.push(barChart('Visite per settimana', weeks.map(([week]) => italianDate(week).slice(0, 5)), weeks.map(([, week]) => week.count)))
    sections.push(table(['Settimana dal', 'Visite', 'Persone*'], weeks.map(([week, { count, dailyUniques }]) => [italianDate(week), count, dailyUniques])))
    sections.push('\\* Somma delle persone diverse di ogni giorno: chi torna in due giorni conta due volte.')
  } else sections.push('Ancora nessuna settimana completa.')
  if (latest.referrers.length) sections.push('## Da dove arrivano\nUltimi 14 giorni.', table(['Provenienza', 'Visite', 'Persone'], latest.referrers.map(r => [r.referrer, r.count, r.uniques])))
  if (latest.paths.length) sections.push('## Pagine più viste\nUltimi 14 giorni.', table(['Pagina', 'Visite', 'Persone'], latest.paths.slice(0, 5).map(p => [`\`${p.path.replace(`/${REPOSITORY}`, '') || '/'}\``, p.count, p.uniques])))
  if (clones.length) sections.push('## Clonazioni', `Copie del codice: ${sum(clones.map(([, week]) => week.count))} in ${clones.length} settimane. Sono in gran parte automatismi, quindi non indicano quante persone usano l'app.`)
  return `${sections.join('\n\n')}\n`
}

function main() {
  const api = path => JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${REPOSITORY}${path}`], { encoding: 'utf8', maxBuffer: 1e8 })).flat()
  const one = path => api(path)[0]
  // the traffic needs more access than the rest
  const traffic = (path, fallback) => {
    try {
      return api(path)
    } catch {
      console.error(`Traffico non disponibile con questo token: ${path}`)
      return fallback
    }
  }
  const stored = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { traffic: { views: {}, clones: {} }, snapshots: {} }
  const info = one('')
  const data = {
    traffic: {
      views: mergeDaily(stored.traffic.views, traffic('/traffic/views', [{}])[0].views),
      clones: mergeDaily(stored.traffic.clones, traffic('/traffic/clones', [{}])[0].clones),
    },
    snapshots: {
      ...stored.snapshots,
      [new Date().toISOString().slice(0, 10)]: {
        stars: info.stargazers_count,
        forks: info.forks_count,
        watchers: info.subscribers_count,
        releases: api('/releases?per_page=100').filter(release => !release.draft).map(releaseSummary),
        referrers: traffic('/traffic/popular/referrers', []),
        paths: traffic('/traffic/popular/paths', []),
      },
    },
  }
  mkdirSync(dirname(FILE), { recursive: true })
  writeFileSync(FILE, `${JSON.stringify(data, null, 1)}\n`)
  console.log(markdownReport(data))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
