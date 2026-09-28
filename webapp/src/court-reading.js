// Automatic, descriptive readings of "Confronto delle rotazioni" and "Configurazioni in campo".
// Built only from the counts of court-stats.js; no React, no external service.
// Rules: every percentage comes with its rallies ("8 dei 11 rally"); percentages are compared only where
// both sides have at least MIN_RALLIES_FOR_SHARE rallies (the same threshold of the athletes table);
// "più alta / più bassa" describe numbers, never "migliore / peggiore"; no causal claims.
import { MIN_RALLIES_FOR_SHARE } from './athlete-indicators.js'
import { backRowLabels, courtConfigurations, filterPhase, groupRallies, rotationMatrix } from './court-stats.js'
import { frontRow } from './rally-state.js'

const pct = value => `${value.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
// Italian article before a number read with an initial vowel: "degli 11 rally", "dall'80%", "all'8%"
const vowel = n => { const i = Math.floor(n); return i === 8 || i === 11 || (i >= 80 && i < 90) || (i >= 800 && i < 900) }
const dal = n => (vowel(n) ? `dall’${pct(n)}` : `dal ${pct(n)}`)
const al = n => (vowel(n) ? `all’${pct(n)}` : `al ${pct(n)}`)
const dei = n => (vowel(n) ? `degli ${n}` : `dei ${n}`)
const share = ({ won, rallies, percent }) => `${won} ${won === 1 ? 'vinto' : 'vinti'} su ${rallies} (${pct(percent)})`
const rallyCount = n => `${n} rally`
const list = items => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`)
const numbers = players => list(players.map(n => (n ? `#${n}` : '—')))
const phaseText = phase => (phase === 'all' ? '' : ` in fase ${phase}`)

// Lowest and highest percentage among groups with enough rallies (null when fewer than two, or all equal)
function range(groups) {
  const comparable = groups.filter(group => group.rallies >= MIN_RALLIES_FOR_SHARE)
  if (comparable.length < 2) return null
  const sorted = [...comparable].sort((a, b) => a.percent - b.percent || b.rallies - a.rallies)
  const low = sorted[0], high = sorted.at(-1)
  return low.percent === high.percent ? null : { low, high }
}

// "Confronto delle rotazioni": sentences for the matrix of the chosen phase
// set: set number (the states are already limited to it) or 'all', only for the wording
export function matrixReading(states, { phase = 'all', set = 'all', team = 'la squadra', opponent = 'l’avversaria' } = {}) {
  const where = `${set === 'all' ? '' : ` del set ${set}`}${phaseText(phase)}`
  const matrix = rotationMatrix(states, phase)
  const total = matrix.cells[6][6]
  const sentences = []
  if (!total.rallies) {
    sentences.push(`Nessun rally${where} con entrambe le P determinate: segna i palleggiatori delle due squadre per leggere il confronto.`)
    return sentences
  }
  sentences.push(`Nei ${rallyCount(total.rallies)}${where} con entrambe le P determinate, ${team} ne ha vinti ${total.won} (${pct(total.percent)}).`)
  if (phase === 'all') {
    const bp = rotationMatrix(states, 'BP').cells[6][6], cp = rotationMatrix(states, 'CP').cells[6][6]
    if (bp.rallies && cp.rallies) sentences.push(`In fase BP: ${share(bp)}; in fase CP: ${share(cp)}.`)
  }
  // most observed combination(s)
  const cells = matrix.cells.slice(0, 6).flatMap((row, r) => row.slice(0, 6).map((cell, c) => ({ ...cell, own: r + 1, other: c + 1 })))
  const observed = cells.filter(cell => cell.rallies)
  const most = Math.max(...observed.map(cell => cell.rallies))
  const top = observed.filter(cell => cell.rallies === most).slice(0, 2)
  sentences.push(`${top.length > 1 ? 'Le combinazioni osservate più spesso sono' : 'La combinazione osservata più spesso è'} ${list(top.map(cell => `P${cell.own} contro P${cell.other}`))}: ${list(top.map(share))}.`)
  // our P and opponent P, only where there are enough rallies
  const ownRows = matrix.cells.slice(0, 6).map((row, r) => ({ ...row[6], label: `P${r + 1}` }))
  const otherColumns = matrix.cells[6].slice(0, 6).map((cell, c) => ({ ...cell, label: `P${c + 1}` }))
  for (const [groups, text] of [[ownRows, `Tra le P di ${team}`], [otherColumns, `Contro le P di ${opponent}`]]) {
    const spread = range(groups)
    if (spread) sentences.push(`${text} con almeno ${MIN_RALLIES_FOR_SHARE} rally, la percentuale di rally vinti va ${dal(spread.low.percent)} di ${spread.low.label} (${spread.low.won} su ${spread.low.rallies}) ${al(spread.high.percent)} di ${spread.high.label} (${spread.high.won} su ${spread.high.rallies}).`)
  }
  if (!range(ownRows) && !range(otherColumns)) {
    sentences.push(`Le singole rotazioni hanno meno di ${MIN_RALLIES_FOR_SHARE} rally o percentuali uguali: le differenze tra rotazioni non vengono confrontate.`)
  }
  const unseen = cells.length - observed.length
  if (unseen) sentences.push(`${unseen} delle 36 combinazioni non sono state osservate.`)
  sentences.push('Le percentuali descrivono i rally osservati: non indicano la causa del risultato né una combinazione migliore di un’altra.')
  return sentences
}

// Description of a configuration in words: "con #18 al servizio e #5, #10 e #9 in prima linea, in P6"
const configurationText = row => {
  const front = `${numbers(row.frontRow)} in prima linea`
  const p = row.P ? `, in P${row.P}` : ''
  return row.server ? `con #${row.server} al servizio e ${front}${p}` : `con ${front}${p}`
}

// "Configurazioni in campo": sentences for the chosen phase
export function configurationsReading(states, { phase = 'all', team = 'la squadra' } = {}) {
  const rows = courtConfigurations(states, phase)
  const considered = filterPhase(states, phase).filter(s => s.teams.own.reliable !== false)
  const sentences = []
  if (!rows.length) return ['Nessun rally osservato per questo filtro.']
  sentences.push(`${rows.length} ${rows.length === 1 ? 'configurazione' : 'configurazioni diverse'} in ${rallyCount(considered.length)}${phaseText(phase)}.`)
  const first = rows[0]
  sentences.push(`Configurazione più frequente${phase === 'all' ? ` (fase ${first.phase})` : ''}: ${configurationText(first)}, ${team} ha vinto ${first.won} ${dei(first.rallies)} rally osservati.`)
  const spread = range(rows.map(row => ({ ...row, label: configurationText(row) })))
  if (spread) {
    sentences.push(`Tra le configurazioni con almeno ${MIN_RALLIES_FOR_SHARE} rally, la percentuale più alta è ${spread.high.label}${phase === 'all' ? ` (fase ${spread.high.phase})` : ''}: ${spread.high.won} su ${spread.high.rallies} (${pct(spread.high.percent)}); la più bassa ${spread.low.label}${phase === 'all' ? ` (fase ${spread.low.phase})` : ''}: ${spread.low.won} su ${spread.low.rallies} (${pct(spread.low.percent)}).`)
  } else {
    sentences.push(`Meno di due configurazioni hanno almeno ${MIN_RALLIES_FOR_SHARE} rally: le percentuali non vengono confrontate.`)
  }
  // who served (BP rallies)
  const bp = considered.filter(s => s.phase === 'BP')
  if (bp.length) {
    const servers = groupRallies(bp, s => ({ number: s.teams.own.server })).filter(g => g.number).slice(0, 3)
    sentences.push(`Al servizio in fase BP: ${list(servers.map(g => `#${g.number} in ${rallyCount(g.rallies)} (${g.won} ${g.won === 1 ? 'vinto' : 'vinti'})`))}.`)
  }
  // front row regardless of server and P
  const fronts = groupRallies(considered, s => ({ players: frontRow(s, 'own') }))
  if (fronts.length) sentences.push(`La prima linea più frequente è ${numbers(fronts[0].players)}: ${share(fronts[0])}.`)
  // libero in the second line
  const withLibero = groupRallies(considered.filter(s => s.teams.own.libero?.certain), s => ({ number: s.teams.own.libero.number }))
  if (withLibero.length) sentences.push(`In seconda linea, ${list(withLibero.map(g => `il libero #${g.number} era in campo in ${rallyCount(g.rallies)} (${g.won} ${g.won === 1 ? 'vinto' : 'vinti'})`))}.`)
  const uncertain = considered.filter(s => backRowLabels(s, 'own').some(label => label.startsWith('L?'))).length
  if (uncertain) sentences.push(`In ${rallyCount(uncertain)} la presenza del libero non è determinabile con certezza (L?): il referto non permette di collocare il cambio rally per rally.`)
  sentences.push('I rally vinti e persi sono della squadra mentre quella configurazione era in campo, non punti dei singoli atleti.')
  return sentences
}


// What a cell of the matrix counts, in words (tooltips, detail, guide). row/col: 0..5 = P1..P6, 6 = TUTTE
export function cellSentence(cell, row, col, { team = 'la squadra', opponent = 'l’avversaria', phase = 'all', set = 'all' } = {}) {
  const where = `${set === 'all' ? '' : ` nel set ${set}`}${phase === 'all' ? '' : ` in fase ${phase}`}`
  const own = row === 6 ? null : `${team} era in P${row + 1}`
  const other = col === 6 ? null : `${opponent} era in P${col + 1}`
  const situation = own && other ? `${own} mentre ${other}`
    : own ? `${own} (qualunque fosse la P di ${opponent})`
      : other ? `${other} (qualunque fosse la P di ${team})`
        : `le P di entrambe le squadre erano determinate`
  if (!cell.rallies) return `Nessun rally${where} in cui ${situation}.`
  return `In ${rallyCount(cell.rallies)}${where} ${situation}: ${team} ne ha vinti ${cell.won} e persi ${cell.lost} (${pct(cell.percent)}).`
}

// "Come si legge": an example taken from the most observed cell of the current matrix
export function matrixGuide(states, { team = 'la squadra', opponent = 'l’avversaria', phase = 'all', set = 'all' } = {}) {
  const matrix = rotationMatrix(states, phase)
  let best = null
  matrix.cells.slice(0, 6).forEach((row, r) => row.slice(0, 6).forEach((cell, c) => {
    if (cell.rallies && (!best || cell.rallies > best.cell.rallies)) best = { cell, r, c }
  }))
  return {
    rows: `Ogni riga è una rotazione di ${team}, ogni colonna una rotazione di ${opponent}.`,
    p: 'P1–P6 indica il posto in cui si trova il palleggiatore in quel rally: P1 = palleggiatore al posto 1 (al servizio o in difesa a destra), P2 = al posto 2 (a rete a destra), e così via.',
    cell: `Una cella conta i rally giocati mentre le due squadre erano in quelle due rotazioni e quanti ne ha vinti ${team}. La riga e la colonna TUTTE sommano i rally di una sola rotazione, qualunque fosse quella dell’altra squadra.`,
    example: best ? `Esempio: la cella P${best.r + 1} contro P${best.c + 1} (${pct(best.cell.percent)} · ${best.cell.won}/${best.cell.rallies}) vuol dire: ${cellSentence(best.cell, best.r, best.c, { team, opponent, phase, set }).replace(/^In /, 'in ')}` : null,
  }
}
