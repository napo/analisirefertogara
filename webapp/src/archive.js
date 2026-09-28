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

// Reads a .zrv archive (or the older JSON backup, version 1). Returns matches with the PDF as Blob;
// the caller validates them as any match.
export function readArchive(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const isZip = data[0] === 0x50 && data[1] === 0x4b
  if (!isZip) return readLegacyBackup(strFromU8(data))
  let files
  try {
    files = unzipSync(data)
  } catch {
    throw Error('Archivio non leggibile: il file è danneggiato o non è un archivio di Referto Volley.')
  }
  if (!files['archivio.json']) throw Error('Archivio non valido: manca archivio.json.')
  const archive = JSON.parse(strFromU8(files['archivio.json']))
  if (archive.format !== ARCHIVE_FORMAT) throw Error('Archivio non valido: formato non riconosciuto.')
  if (!Number.isInteger(archive.version) || archive.version > ARCHIVE_VERSION) {
    throw Error('Archivio creato da una versione più recente di Referto Volley: aggiorna l’applicazione.')
  }
  if (!Array.isArray(archive.matches) || archive.matches.length > 1000) throw Error('Archivio non valido: elenco delle gare mancante o troppo lungo.')
  return archive.matches.map(record => {
    const { pdfFile, ...match } = record
    const pdfBytes = pdfFile ? files[pdfFile] : null
    if (pdfFile && !pdfBytes) throw Error(`Archivio incompleto: manca ${pdfFile}.`)
    if (pdfBytes && strFromU8(pdfBytes.subarray(0, 5)) !== '%PDF-') throw Error(`Archivio non valido: ${pdfFile} non è un PDF.`)
    return { ...match, pdf: pdfBytes ? new Blob([pdfBytes], { type: 'application/pdf' }) : null }
  })
}

function readLegacyBackup(text) {
  const backup = JSON.parse(text)
  if (backup.version !== 1 || !Array.isArray(backup.matches) || backup.matches.length > 1000) throw Error('Formato backup non valido.')
  return backup.matches.map(match => {
    if (match?.pdf && !/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(match.pdf)) throw Error('PDF del backup non valido.')
    const pdf = match?.pdf ? new Blob([Uint8Array.from(atob(match.pdf.split(',')[1]), c => c.charCodeAt(0))], { type: 'application/pdf' }) : null
    return { ...match, pdf }
  })
}


// ---- documentation shipped inside every archive ----
const README = `ARCHIVIO REFERTO VOLLEY (.${ARCHIVE_EXTENSION})
==================================

Questo file è un archivio ZIP: rinominandolo in .zip si apre con qualsiasi programma.
È stato creato da Referto Volley (https://refertogara.volleyserve.it) e può essere
reimportato nell'applicazione ("Ripristina archivio") oppure letto da altri programmi.

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
        id: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'SHA-256 del PDF originale (o identificativo della gara manuale)' },
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
