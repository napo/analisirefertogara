// Automatic, descriptive reading of "Configurazioni in campo".
// Built only from the counts of court-stats.js; no React, no external service.
// Rules: every percentage comes with its rallies ("8 dei 11 rally"); percentages are compared only where
// both sides have at least MIN_RALLIES_FOR_SHARE rallies (the same threshold of the athletes table);
// "più alta / più bassa" describe numbers, never "migliore / peggiore"; no causal claims.
import { MIN_RALLIES_FOR_SHARE } from './athlete-indicators.js'
import { backRowLabels, courtConfigurations, filterPhase, groupRallies } from './court-stats.js'
import { frontRow } from './rally-state.js'

const pct = value => `${value.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`
// Italian article before a number read with an initial vowel: "degli 11 rally", "degli 8 rally"
const vowel = n => { const i = Math.floor(n); return i === 8 || i === 11 || (i >= 80 && i < 90) || (i >= 800 && i < 900) }
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
