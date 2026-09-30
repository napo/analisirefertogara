// Archive of the matches in a portable, documented format: a ".zrv" file, i.e. a ZIP containing
//   LEGGIMI.txt                 description of every file and field (Italian)
//   archivio.json               all matches (format "referto-volley-archivio", version 2)
//   schema/archivio.schema.json JSON Schema of archivio.json
//   csv/gare.csv, csv/set.csv, csv/atleti.csv, csv/rally.csv   tables for spreadsheets and data tools
//   pdf/<id>.pdf                original scoresheets
// Pure logic (no DOM): the same code runs in the app and in the tests. Rally data come from the canonical
// court states (rally-state.js), the same the app shows.
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { frontRow, liberoChains, matchStates, playerAt } from './rally-state.js'
import { isSetter, rosterPlayer } from './roster.js'
import { analyze as appAnalyze, validateMatch as appValidateMatch } from './analysis.js'

const APP_CHECKS = { validateMatch: appValidateMatch, analyze: appAnalyze }

export const ARCHIVE_FORMAT = 'referto-volley-archivio'
export const ARCHIVE_VERSION = 2
export const ARCHIVE_EXTENSION = 'zrv' // "zip referto volley"
export const ARCHIVE_MIME = 'application/vnd.referto-volley+zip'

// ---- CSV (semicolon separated, UTF-8 with BOM: opens directly in Excel / LibreOffice in Italian) ----
const cell = value => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
export const csv = (header, rows) => `﻿${[header, ...rows].map(row => row.map(cell).join(';')).join('\r\n')}\r\n`

const yes = value => (value ? 'si' : 'no')
const teamOf = side => (side === 'own' ? 'squadra' : 'avversaria')
const liberoRole = name => (String(name || '').match(/\bL([12])?\s*$/) ? `L${String(name).match(/\bL([12])?\s*$/)[1] || ''}` : '')
const cleanName = name => String(name || '').replace(/\s*-\s*L[12]?\s*$/, '').trim()
const pdfPath = match => `pdf/${match.id}.pdf`
const setsWon = match => match.sets.filter(s => s.scoreOwn > s.scoreOther).length
const setsLost = match => match.sets.filter(s => s.scoreOther > s.scoreOwn).length
const substitutionsText = list => (list || []).map((sub, i) => (sub?.in ? `${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}:${sub.in}@${sub.scoreIn || ''}>${sub.scoreOut || ''}` : '')).filter(Boolean).join(' ')

function gareCsv(matches) {
  return csv(
    ['gara_id', 'data', 'campionato', 'numero_gara', 'genere', 'squadra', 'avversaria', 'set_vinti', 'set_persi', 'punti_fatti', 'punti_subiti', 'durata_minuti', 'luogo', 'impianto', 'formato_origine', 'pdf'],
    matches.map(m => [m.id, m.date, m.championship, m.number, m.gender, m.team, m.opponent, setsWon(m), setsLost(m),
      m.sets.reduce((t, s) => t + (Number(s.scoreOwn) || 0), 0), m.sets.reduce((t, s) => t + (Number(s.scoreOther) || 0), 0),
      m.durationMinutes, m.location, m.venue, m.sourceFormat || (m.isManual ? 'manuale' : ''), m.pdf ? pdfPath(m) : '']),
  )
}

function setCsv(matches) {
  return csv(
    ['gara_id', 'set', 'punti_squadra', 'punti_avversaria', 'durata_minuti', 'formazione_squadra', 'formazione_avversaria',
      'timeout_squadra', 'timeout_avversaria', 'sostituzioni_squadra', 'sostituzioni_avversaria', 'libero_squadra', 'libero_avversaria'],
    matches.flatMap(m => m.sets.map((s, i) => [m.id, i + 1, s.scoreOwn, s.scoreOther, s.durationMinutes,
      (s.lineup || []).join(' '), (s.opponentLineup || []).join(' '),
      (s.timeouts || []).filter(Boolean).join(' '), (s.opponentTimeouts || []).filter(Boolean).join(' '),
      substitutionsText(s.substitutions), substitutionsText(s.opponentSubstitutions),
      liberoChains(s, 'own').map(c => [c.player, ...c.liberos].join('-')).join(' '),
      liberoChains(s, 'other').map(c => [c.player, ...c.liberos].join('-')).join(' ')])),
  )
}

function atletiCsv(matches) {
  return csv(
    ['gara_id', 'squadra', 'nome_squadra', 'numero', 'nome', 'possibile_palleggiatore', 'libero'],
    matches.flatMap(m => [['own', m.roster, m.team], ['other', m.opponentRoster, m.opponent]].flatMap(([side, roster, name]) =>
      (roster || []).map(rosterPlayer).map(p => [m.id, teamOf(side), name, p.number, cleanName(p.name), yes(isSetter(p)), liberoRole(p.name)]))),
  )
}

// One row per rally: who was physically in each position (libero included, empty where uncertain)
function rallyCsv(matches) {
  const positions = side => [1, 2, 3, 4, 5, 6].map(p => `${side}_posto${p}`)
  const header = ['gara_id', 'set', 'rally', 'punti_squadra_prima', 'punti_avversaria_prima', 'punti_squadra_dopo', 'punti_avversaria_dopo',
    'vinto_da', 'fase', 'al_servizio_squadra', 'al_servizio_numero', 'P_squadra', 'P_avversaria',
    'prima_linea_squadra', 'prima_linea_avversaria', ...positions('squadra'), ...positions('avversaria'),
    'libero_squadra', 'libero_squadra_al_posto_di', 'libero_squadra_certo', 'libero_avversaria', 'libero_avversaria_al_posto_di', 'libero_avversaria_certo',
    'palleggiatore_squadra', 'palleggiatore_avversaria', 'ricostruzione_affidabile']
  const rows = []
  for (const m of matches) {
    for (const set of matchStates(m)) {
      for (const s of set.states) {
        const libero = side => s.teams[side].libero
        rows.push([m.id, s.set, s.rally, s.scoreBefore.own, s.scoreBefore.other, s.score.own, s.score.other,
          teamOf(s.winner), s.phase, teamOf(s.servingTeam), s.teams[s.servingTeam].server, s.teams.own.P, s.teams.other.P,
          frontRow(s, 'own').filter(Boolean).join(' '), frontRow(s, 'other').filter(Boolean).join(' '),
          ...[1, 2, 3, 4, 5, 6].map(p => playerAt(s, 'own', p)), ...[1, 2, 3, 4, 5, 6].map(p => playerAt(s, 'other', p)),
          libero('own')?.number, libero('own')?.replaced, libero('own') ? yes(libero('own').certain) : '',
          libero('other')?.number, libero('other')?.replaced, libero('other') ? yes(libero('other').certain) : '',
          s.teams.own.setter.number, s.teams.other.setter.number, yes(s.reliable)])
      }
    }
  }
  return csv(header, rows)
}

// ---- JSON ----
// The match record is the app's own normalized model (the same for NEWBIT, SNUG, TieBreakTech and manual
// entry), without derived data; the PDF is a separate file.
const matchRecord = match => {
  const record = { ...match, pdfFile: match.pdf ? pdfPath(match) : null }
  delete record.pdf
  delete record.analysis
  return record
}

export async function buildArchive(matches, { appVersion = '', exportedAt = new Date().toISOString() } = {}) {
  const files = {
    'LEGGIMI.txt': strToU8(README),
    'archivio.json': strToU8(JSON.stringify({
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      app: { name: 'Referto Volley', version: appVersion, url: 'https://refertogara.volleyserve.it' },
      exportedAt,
      matches: matches.map(matchRecord),
    }, null, 2)),
    'schema/archivio.schema.json': strToU8(JSON.stringify(SCHEMA, null, 2)),
    'csv/gare.csv': strToU8(gareCsv(matches)),
    'csv/set.csv': strToU8(setCsv(matches)),
    'csv/atleti.csv': strToU8(atletiCsv(matches)),
    'csv/rally.csv': strToU8(rallyCsv(matches)),
  }
  for (const match of matches) {
    if (match.pdf) files[pdfPath(match)] = [new Uint8Array(await match.pdf.arrayBuffer()), { level: 0 }] // PDFs are already compressed
  }
  return zipSync(files, { level: 6 })
}

export const archiveFileName = (date = new Date()) => `referto-volley-archivio-${date.toISOString().slice(0, 10)}.${ARCHIVE_EXTENSION}`

// ---- import: the whole file is checked before anything is written ----
// inspectArchive() reads a .zrv archive (or an older JSON backup, version 1), checks the container, the
// canonical archivio.json, every match (with the same validateMatch() and analyze() of the app) and the
// PDFs, and collects every problem in plain Italian: nothing stops at the first error, so whoever produced
// the file can fix everything in one go. archivio.json is the only source of the matches: the CSV tables
// are for other programs. Files that the current version does not use are ignored (never extracted).

const MAX_MATCHES = 1000
const MAX_ENTRIES = 5000
const MAX_EXPANDED = 1024 * 1024 * 1024 // 1 GB once decompressed: beyond this the file is refused
const MAX_JSON = 64 * 1024 * 1024
const MAX_RATIO = 200 // compression ratio above which a large entry is treated as a decompression bomb
// 64 hex characters; 32 for matches imported by earlier versions without crypto.subtle (fallback hash)
const ID = /^(?:[a-f0-9]{64}|[a-f0-9]{32})$/
const PDF_PATH = /^pdf\/[A-Za-z0-9._-]+\.pdf$/

// Relative path inside the archive, without "..", absolute paths, drive letters or backslashes
export const safeArchivePath = name => typeof name === 'string' && name.length > 0 && name.length < 512 &&
  !name.startsWith('/') && !name.includes('\\') && !/^[A-Za-z]:/.test(name) && !name.includes('\0') &&
  !name.split('/').some(part => part === '..' || part === '.')

const matchLabel = (record, index) => {
  const team = typeof record?.team === 'string' && record.team.trim()
  const opponent = typeof record?.opponent === 'string' && record.opponent.trim()
  return team || opponent ? `'${team || '?'} - ${opponent || '?'}'` : `n. ${index + 1}`
}
// "Set 3: punteggio non valido." -> "La gara 'A - B', set 3: punteggio non valido."
const matchProblem = (label, message) => {
  const set = message.match(/^(Set \d+[^:]*): (.*)$/)
  return set ? `La gara ${label}, ${set[1].toLowerCase()}: ${set[2]}` : `La gara ${label}: ${message.charAt(0).toLowerCase()}${message.slice(1)}`
}

function checkSetterChoices(choices) {
  if (choices === undefined) return null
  if (!Array.isArray(choices)) return 'le scelte sui palleggiatori (setterChoices) non sono un elenco.'
  const valid = choice => choice && typeof choice === 'object' && Number.isInteger(choice.set) && ['own', 'other'].includes(choice.team) &&
    Number.isInteger(choice.from) && Array.isArray(choice.candidates) && choice.candidates.every(n => typeof n === 'string') &&
    (choice.number === null || typeof choice.number === 'string')
  return choices.every(valid) ? null : 'una scelta sui palleggiatori (setterChoices) non è completa.'
}

// One match record (archive or backup): returns the problems (with the match name) found in it
function checkMatch(record, label, validateMatch, analyze) {
  const problems = []
  if (!record || typeof record !== 'object' || Array.isArray(record)) return [`La gara ${label} non è descritta correttamente nell’archivio.`]
  if (record.id === undefined || record.id === null || record.id === '') problems.push(`La gara ${label} non può essere importata: manca l’identificativo.`)
  else if (typeof record.id !== 'string' || !ID.test(record.id)) problems.push(`La gara ${label} non può essere importata: identificativo non valido.`)
  for (const key of ['roster', 'opponentRoster']) {
    if (record[key] !== undefined && !Array.isArray(record[key])) problems.push(`La gara ${label}: l’elenco atleti (${key}) non è valido.`)
  }
  const setters = checkSetterChoices(record.setterChoices)
  if (setters) problems.push(`La gara ${label}: ${setters}`)
  let validation = []
  try {
    // the same checks of the app, in the tolerant mode used for saved matches
    validation = validateMatch(record, { strict: false })
  } catch {
    validation = ['dati della gara non leggibili.']
  }
  problems.push(...validation.map(message => matchProblem(label, message)))
  if (!validation.length) {
    try {
      analyze([record])
    } catch {
      problems.push(`La gara ${label}: i dati non permettono di ricostruire l’analisi.`)
    }
  }
  return problems
}

// The ZIP container: entries listed without extracting them, then only the wanted files are extracted
function listEntries(data) {
  const entries = []
  unzipSync(data, { filter: file => { entries.push({ name: file.name, size: file.size, originalSize: file.originalSize }); return false } })
  return entries
}

function readZip(data, problems) {
  let entries
  try {
    entries = listEntries(data)
  } catch {
    problems.push('Il file non è un archivio .zrv leggibile: il contenuto ZIP è danneggiato.')
    return null
  }
  if (entries.length > MAX_ENTRIES) problems.push(`L’archivio contiene troppi file (${entries.length}).`)
  const names = new Map()
  let expanded = 0
  for (const entry of entries) {
    if (!safeArchivePath(entry.name)) problems.push(`L’archivio contiene un percorso non consentito: "${String(entry.name).slice(0, 80)}".`)
    names.set(entry.name, (names.get(entry.name) || 0) + 1)
    expanded += entry.originalSize || 0
    if (entry.originalSize > 1024 * 1024 && entry.size > 0 && entry.originalSize / entry.size > MAX_RATIO) {
      problems.push(`Il file ${entry.name} ha un rapporto di compressione anomalo: l’archivio non viene aperto per sicurezza.`)
    }
  }
  if (expanded > MAX_EXPANDED) problems.push('Il contenuto dell’archivio, una volta decompresso, supera il limite di 1 GB.')
  for (const [name, count] of names) {
    if (count > 1 && (name === 'archivio.json' || name.startsWith('pdf/'))) problems.push(`Il file ${name} compare più volte nell’archivio.`)
  }
  if (problems.length) return null
  if (!names.has('archivio.json')) {
    problems.push('Archivio incompleto: manca archivio.json.')
    return null
  }
  const jsonEntry = entries.find(entry => entry.name === 'archivio.json')
  if (jsonEntry.originalSize > MAX_JSON) {
    problems.push('archivio.json è troppo grande.')
    return null
  }
  return { names, extract: wanted => unzipSync(data, { filter: file => wanted.has(file.name) }) }
}

function readArchiveJson(zip, problems) {
  let archive
  try {
    archive = JSON.parse(strFromU8(zip.extract(new Set(['archivio.json']))['archivio.json']))
  } catch {
    problems.push('archivio.json non contiene JSON valido.')
    return null
  }
  if (!archive || typeof archive !== 'object' || archive.format !== ARCHIVE_FORMAT) {
    problems.push('Formato archivio non riconosciuto: il file non è un archivio di Referto Volley.')
    return null
  }
  if (!Number.isInteger(archive.version) || archive.version < 2) {
    problems.push(`Versione archivio ${archive.version ?? 'mancante'} non supportata. Questa versione di Referto Volley supporta la versione ${ARCHIVE_VERSION}.`)
    return null
  }
  if (archive.version > ARCHIVE_VERSION) {
    problems.push(`Questo archivio è stato creato con un formato più recente di quello supportato da questa versione di Referto Volley (versione archivio ${archive.version}, massima supportata ${ARCHIVE_VERSION}). Aggiorna Referto Volley per importarlo.`)
    return null
  }
  if (!Array.isArray(archive.matches)) {
    problems.push('L’archivio non contiene l’elenco delle gare (matches).')
    return null
  }
  if (archive.matches.length > MAX_MATCHES) {
    problems.push(`L’archivio contiene ${archive.matches.length} gare: il massimo importabile è ${MAX_MATCHES}.`)
    return null
  }
  return archive
}

// PDF of a .zrv match: declared path, present, not empty, with a PDF signature
function zrvPdf(record, label, zip, pdfs, problems) {
  const path = record?.pdfFile
  if (path === undefined || path === null || path === '') return null
  if (typeof path !== 'string' || !PDF_PATH.test(path) || !safeArchivePath(path)) {
    problems.push(`La gara ${label} dichiara un PDF con un percorso non consentito.`)
    return null
  }
  if (!zip.names.has(path)) {
    problems.push(`Il PDF dichiarato per ${label} non è presente nell’archivio (${path}).`)
    return null
  }
  const bytes = pdfs[path]
  if (!bytes || !bytes.length) {
    problems.push(`Il file ${path} è vuoto.`)
    return null
  }
  if (bytes.length < 5 || strFromU8(bytes.subarray(0, 5)) !== '%PDF-') {
    problems.push(`Il file ${path} non sembra essere un PDF valido.`)
    return null
  }
  return new Blob([bytes], { type: 'application/pdf' })
}

// PDF of an older JSON backup: a data URL
function legacyPdf(record, label, problems) {
  if (!record?.pdf) return null
  if (typeof record.pdf !== 'string' || !/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(record.pdf)) {
    problems.push(`Il PDF della gara ${label} nel backup non è valido.`)
    return null
  }
  const bytes = Uint8Array.from(atob(record.pdf.split(',')[1]), c => c.charCodeAt(0))
  if (bytes.length < 5 || strFromU8(bytes.subarray(0, 5)) !== '%PDF-') {
    problems.push(`Il PDF della gara ${label} nel backup non sembra essere un PDF valido.`)
    return null
  }
  return new Blob([bytes], { type: 'application/pdf' })
}

// { kind: 'zrv' | 'json', total, matches: [match with pdf Blob], problems: [text] }
export function inspectArchive(bytes, { validateMatch, analyze } = APP_CHECKS) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const problems = []
  const isZip = data[0] === 0x50 && data[1] === 0x4b
  let records = null
  let pdfOf
  if (isZip) {
    const zip = readZip(data, problems)
    const archive = zip && readArchiveJson(zip, problems)
    if (!archive) return { kind: 'zrv', total: 0, matches: [], problems }
    records = archive.matches
    const wanted = new Set(records.map(r => r?.pdfFile).filter(path => typeof path === 'string' && PDF_PATH.test(path) && zip.names.has(path)))
    const pdfs = wanted.size ? zip.extract(wanted) : {}
    pdfOf = (record, label) => zrvPdf(record, label, zip, pdfs, problems)
  } else {
    let backup
    try {
      backup = JSON.parse(strFromU8(data))
    } catch {
      return { kind: 'json', total: 0, matches: [], problems: ['Il file non è un archivio .zrv né un backup JSON di Referto Volley.'] }
    }
    if (!backup || backup.version !== 1 || !Array.isArray(backup.matches)) {
      return { kind: 'json', total: 0, matches: [], problems: ['Backup JSON in un formato non riconosciuto.'] }
    }
    if (backup.matches.length > MAX_MATCHES) {
      return { kind: 'json', total: backup.matches.length, matches: [], problems: [`Il backup contiene ${backup.matches.length} gare: il massimo importabile è ${MAX_MATCHES}.`] }
    }
    records = backup.matches
    pdfOf = (record, label) => legacyPdf(record, label, problems)
  }
  const matches = []
  const seen = new Map()
  records.forEach((record, index) => {
    const label = matchLabel(record, index)
    const own = checkMatch(record, label, validateMatch, analyze)
    problems.push(...own)
    const pdf = pdfOf(record, label)
    if (typeof record?.id === 'string' && ID.test(record.id)) {
      if (seen.has(record.id)) problems.push(`La gara ${label} compare più volte nell’archivio (stesso identificativo della gara ${seen.get(record.id)}).`)
      else seen.set(record.id, label)
    }
    if (!own.length) {
      const match = { ...record, pdf }
      delete match.pdfFile
      matches.push(match)
    }
  })
  return { kind: isZip ? 'zrv' : 'json', total: records.length, matches, problems }
}

// What an import would do, without touching the local archive: every problem, or the matches to add and
// the ones already present (same id: kept as they are, never overwritten)
export function planImport(bytes, existingIds = [], checks = APP_CHECKS) {
  const inspection = inspectArchive(bytes, checks)
  if (inspection.problems.length) return { ok: false, total: inspection.total, problems: inspection.problems, toImport: [], duplicates: [] }
  const existing = new Set(existingIds)
  return {
    ok: true,
    total: inspection.total,
    problems: [],
    toImport: inspection.matches.filter(match => !existing.has(match.id)),
    duplicates: inspection.matches.filter(match => existing.has(match.id)),
  }
}

// Import messages for the interface
export function importSummary(plan) {
  if (!plan.ok) {
    const count = plan.problems.length
    return { ok: false, title: 'Importazione non riuscita.', lines: [count === 1 ? 'È stato trovato 1 problema:' : `Sono stati trovati ${count} problemi:`, ...plan.problems.map(problem => `• ${problem}`)] }
  }
  const read = plan.total, imported = plan.toImport.length, present = plan.duplicates.length
  const gare = n => `${n} ${n === 1 ? 'gara' : 'gare'}`
  if (!read) return { ok: true, title: 'Archivio letto correttamente.', lines: ['L’archivio non contiene gare.'] }
  if (!imported) {
    return { ok: true, title: 'Archivio letto correttamente.', lines: [read === 1 ? 'La gara è già presente nell’archivio locale.' : `Le ${read} gare sono già presenti nell’archivio locale.`] }
  }
  return { ok: true, title: 'Archivio importato correttamente.', lines: [`${gare(read)} ${read === 1 ? 'letta' : 'lette'}`, `${imported} ${imported === 1 ? 'importata' : 'importate'}`, `${present} già ${present === 1 ? 'presente' : 'presenti'}`] }
}

export class ArchiveError extends Error {
  constructor(problems) {
    super(problems.join(' '))
    this.problems = problems
  }
}

// Matches of an archive or backup (PDF as Blob); throws ArchiveError with every problem found
export function readArchive(bytes, checks = APP_CHECKS) {
  const inspection = inspectArchive(bytes, checks)
  if (inspection.problems.length) throw new ArchiveError(inspection.problems)
  return inspection.matches
}

// ---- documentation shipped inside every archive ----
const README = `ARCHIVIO REFERTO VOLLEY (.${ARCHIVE_EXTENSION})
==================================

Il file .${ARCHIVE_EXTENSION} è il formato portabile di Referto Volley (https://refertogara.volleyserve.it):
si esporta da un dispositivo e si importa su un altro con "Importa archivio", che serve
anche a ripristinare un archivio salvato. Referto Volley lo importa direttamente, senza
estrarlo: controlla tutto il contenuto e aggiunge le gare solo se l'archivio è valido.
Il file è anche un normale archivio ZIP: rinominandolo in .zip si apre con qualsiasi
programma per leggere i dati documentati qui sotto.
Per l'importazione Referto Volley usa solo archivio.json e i PDF: i CSV sono copie in
formato tabellare per altri programmi.

CONTENUTO
- archivio.json: tutte le gare, formato "${ARCHIVE_FORMAT}" versione ${ARCHIVE_VERSION}.
  È la fonte completa: i CSV sono ricavati da qui.
- schema/archivio.schema.json: descrizione formale (JSON Schema) di archivio.json.
- csv/*.csv: tabelle per fogli di calcolo e strumenti di analisi.
  Separatore punto e virgola, codifica UTF-8, prima riga con i nomi delle colonne.
- pdf/<id>.pdf: i referti originali (<id> = impronta SHA-256 del PDF, identifica la gara).

TERMINI
- squadra = squadra analizzata; avversaria = l'altra squadra della gara.
- BP (break point) = fase in cui la squadra analizzata è al servizio;
  CP (cambio palla) = fase in cui la squadra analizzata è in ricezione.
- P1-P6 = posto in cui si trova il palleggiatore effettivo nel rally (vuoto se non determinato).
- Posti: 1 = al servizio / difesa a destra, 2 = a rete a destra, 3 = a rete al centro,
  4 = a rete a sinistra, 5 = difesa a sinistra, 6 = difesa al centro.
- Punteggi "a:b" (sostituzioni, time-out): punti della squadra che ha chiesto il cambio
  o il time-out, poi quelli dell'altra squadra.

CSV
gare.csv    una riga per gara: data, squadre, set vinti/persi, punti, durata, luogo,
            formato del referto di origine (FIPAV = NEWBIT, SNUG, TBT = TieBreakTech,
            manuale) e percorso del PDF.
set.csv     una riga per set: punteggi, formazioni iniziali (posizioni I-VI),
            time-out, sostituzioni "posizione:entrato@punteggio_entrata>punteggio_rientro",
            ingressi del libero "giocatore-libero[-libero...]" nell'ordine del referto.
atleti.csv  elenchi atleti: numero, nome, possibile palleggiatore (si/no), libero (L1/L2).
rally.csv   una riga per rally, ricostruita dall'applicazione dai turni di servizio:
            punteggio prima e dopo, chi ha vinto, fase, chi era al servizio, P delle due
            squadre, prima linea (posti 2, 3, 4), chi era in ciascun posto 1-6
            (libero compreso), il libero in campo e chi sostituiva, palleggiatore effettivo.
            Il libero è collocato con la regola di gioco (sostituisce la giocatrice indicata
            sul referto mentre è in seconda linea, dal momento in cui la squadra riceve):
            dove non è collocabile con certezza il posto è vuoto e libero_*_certo = no.
            ricostruzione_affidabile = no se il referto ha incongruenze (punteggi di
            sostituzioni non ritrovati, set incompleti).

I dati descrivono i rally della squadra: non attribuiscono punti ai singoli atleti.
`

const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://refertogara.volleyserve.it/schema/archivio-2.schema.json',
  title: 'Archivio Referto Volley',
  description: 'Gare salvate da Referto Volley. "squadra" (own) è la squadra analizzata, "avversaria" (other) l’altra squadra.',
  type: 'object',
  required: ['format', 'version', 'matches'],
  properties: {
    format: { const: ARCHIVE_FORMAT },
    version: { const: ARCHIVE_VERSION },
    app: { type: 'object', properties: { name: { type: 'string' }, version: { type: 'string' }, url: { type: 'string' } } },
    exportedAt: { type: 'string', format: 'date-time' },
    matches: { type: 'array', items: { $ref: '#/$defs/match' } },
  },
  $defs: {
    number: { type: 'string', description: 'Numero di maglia come testo, vuoto se assente' },
    score: { type: 'string', description: 'Punteggio "a:b" (punti della squadra che ha richiesto, poi dell’altra), vuoto se assente', pattern: '^(\\d+:\\d+)?$' },
    player: {
      type: 'object',
      properties: {
        number: { type: ['integer', 'string'] },
        name: { type: 'string', description: 'Nome; i liberi terminano con " - L1" o " - L2"' },
        isSetter: { type: 'boolean', description: 'Possibile palleggiatore' },
      },
    },
    substitution: {
      type: 'object',
      properties: {
        in: { $ref: '#/$defs/number', description: 'Numero entrato in questa posizione' },
        scoreIn: { $ref: '#/$defs/score' },
        scoreOut: { $ref: '#/$defs/score', description: 'Punteggio del rientro del titolare' },
      },
    },
    turns: {
      type: 'array', maxItems: 36,
      description: 'Progressivi dei turni di servizio: 6 righe x 6 posizioni, cella = giro*6 + posizione. "X" nella prima cella = squadra in ricezione a inizio set; "" = cella vuota.',
      items: { anyOf: [{ type: 'integer' }, { const: 'X' }, { const: '' }] },
    },
    liberoExchange: {
      type: 'object',
      description: 'Un passaggio di un ingresso del libero: step 1 = player sostituito dal libero; step successivi = libero per libero.',
      properties: { row: { type: 'integer' }, step: { type: 'integer' }, player: { type: ['integer', 'string'] }, libero: { type: ['integer', 'string'] } },
    },
    set: {
      type: 'object',
      properties: {
        number: { type: 'integer' },
        scoreOwn: { type: 'integer' }, scoreOther: { type: 'integer' },
        durationMinutes: { type: ['integer', 'string'] },
        own: { $ref: '#/$defs/turns' }, other: { $ref: '#/$defs/turns' },
        lineup: { type: 'array', maxItems: 6, items: { $ref: '#/$defs/number' }, description: 'Formazione iniziale, posizioni I-VI' },
        opponentLineup: { type: 'array', maxItems: 6, items: { $ref: '#/$defs/number' } },
        substitutions: { type: 'array', maxItems: 6, items: { $ref: '#/$defs/substitution' }, description: 'Una voce per posizione I-VI' },
        opponentSubstitutions: { type: 'array', maxItems: 6, items: { $ref: '#/$defs/substitution' } },
        timeouts: { type: 'array', maxItems: 2, items: { $ref: '#/$defs/score' } },
        opponentTimeouts: { type: 'array', maxItems: 2, items: { $ref: '#/$defs/score' } },
        libero: { type: 'object', description: 'Riquadro libero (formato NEWBIT): righe onCourt (sostituito), entered (libero), otherEntered (secondo libero)' },
        opponentLibero: { type: 'object' },
        liberoReplacements: { type: 'array', items: { $ref: '#/$defs/liberoExchange' }, description: 'Ingressi del libero nell’ordine del referto (SNUG, TieBreakTech, manuale)' },
        opponentLiberoReplacements: { type: 'array', items: { $ref: '#/$defs/liberoExchange' } },
      },
    },
    match: {
      type: 'object',
      required: ['id', 'team', 'opponent', 'date', 'sets'],
      properties: {
        id: { type: 'string', pattern: '^([a-f0-9]{64}|[a-f0-9]{32})$', description: 'SHA-256 del PDF originale (o identificativo della gara manuale; 32 caratteri per gare importate da versioni precedenti senza SHA-256)' },
        sourceFormat: { type: 'string', description: 'FIPAV (NEWBIT), SNUG, TBT (TieBreakTech); assente per le gare manuali' },
        team: { type: 'string', description: 'Squadra analizzata' },
        opponent: { type: 'string' },
        date: { type: 'string', format: 'date' },
        championship: { type: 'string' }, number: { type: 'string' }, gender: { type: 'string' },
        location: { type: 'string' }, venue: { type: 'string' },
        durationMinutes: { type: ['integer', 'string'] },
        roster: { type: 'array', items: { $ref: '#/$defs/player' } },
        opponentRoster: { type: 'array', items: { $ref: '#/$defs/player' } },
        sets: { type: 'array', maxItems: 6, items: { $ref: '#/$defs/set' } },
        setterChoices: {
          type: 'array',
          description: 'Scelte dell’utente su chi palleggiava nei tratti con più palleggiatori in campo; number null = "Non so"',
          items: { type: 'object', properties: { set: { type: 'integer' }, team: { enum: ['own', 'other'] }, from: { type: 'integer' }, candidates: { type: 'array', items: { type: 'string' } }, number: { type: ['string', 'null'] } } },
        },
        notes: { type: 'string' },
        importWarnings: { type: 'array' },
        pdfFile: { type: ['string', 'null'], description: 'Percorso del PDF originale nell’archivio' },
      },
      additionalProperties: true,
    },
  },
}
