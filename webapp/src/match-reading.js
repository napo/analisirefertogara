// Deterministic, descriptive readings of a set and of a match, built only from match-flow indicators.
// No external service, no causal claims: sentences report scores, sequences and counts.
// Terminology: "Differenza", "Al servizio: #12 Nome". Gendered words follow `female` (default masculine).

const ordinal = n => `${n}°`
const score = point => `${point.own}-${point.other}`
// Italian articulated prepositions before a number: "sul 16-16" but "sull'8-4", "all'11-9", "dall'80%"
const elided = n => n === 1 || n === 8 || n === 11 || (n >= 80 && n < 90)
const prep = (base, n) => (elided(n) ? `${base}l'` : `${base} `)
const sul = point => `${prep('sul', point.own)}${score(point)}`
const al = point => `${prep('al', point.own)}${score(point)}`
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const percentValue = (won, total) => (total ? Math.round((won / total) * 100) : null)
const percent = (won, total) => (total ? `${percentValue(won, total)}%` : '–')
const list = items => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`
const finalThreshold = setNumber => (setNumber === 5 ? 10 : 20)

// "P2 (3 punti) e P5 (2)" from a {rotation: count} map
const rotationSummary = counts => {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1] || a[0] - b[0])
  return list(entries.slice(0, 2).map(([rotation, count], i) => `P${rotation} (${i === 0 ? plural(count, 'punto', 'punti') : count})`))
}

// "P3 e P4" (most points first), for compact lists
const rotationNames = counts => list(Object.entries(counts || {}).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([rotation]) => `P${rotation}`))

const runText = (run, withRotation) => {
  const base = `${plural(run.length, 'punto consecutivo', 'punti consecutivi')}, da ${run.from.own}-${run.from.other} a ${run.to.own}-${run.to.other}`
  return withRotation && Object.keys(run.rotations).length ? `${base}, in ${rotationSummary(run.rotations)}` : base
}

// Score after `count` rallies following an event (or at set end)
const scoreAfter = (flow, after, count = 5) => {
  const target = Math.min(flow.points.length, after + count)
  return target > after ? flow.points[target - 1] : null
}

// Short label of an event for tooltips and notes: "Time-out", "Time-out avversario",
// "Doppio cambio: #3 in I, #15 in IV", "Sostituzione avversaria (rientro): #5 in IV"
const eventLabel = event => {
  const opponent = event.team === 'other'
  if (event.type === 'timeout') return opponent ? 'Time-out avversario' : 'Time-out'
  if (event.type === 'courtChange') return 'Cambio campo'
  const changes = event.changes.map(change => `#${change.in?.number ?? '?'} in ${change.position}`).join(', ')
  const kind = event.type === 'doubleChange'
    ? `Doppio cambio${opponent ? ' avversario' : ''}`
    : `Sostituzione${opponent ? ' avversaria' : ''}`
  return `${kind}${event.returning ? ' (rientro)' : ''}: ${changes}`
}
export { eventLabel }

// Final phase of a set: from the moment one team reaches 20 points (10 in the tie-break)
function finalPhase(flow) {
  const threshold = finalThreshold(flow.set)
  const index = flow.points.findIndex(point => Math.max(point.own, point.other) >= threshold)
  if (index < 0) return null
  const at = flow.points[index]
  const last = flow.points.at(-1)
  return { at, threshold, partial: { own: last.own - at.own, other: last.other - at.other } }
}

// compact: only the first part (result, levels, largest lead/deficit, longest runs), same sentences
export function describeSet(indicators, flow, context = {}, { compact = false } = {}) {
  const i = indicators
  const sentences = []
  sentences.push(`${ordinal(i.set)} set ${i.won ? 'vinto' : 'perso'} ${i.final.own}-${i.final.other}.`)
  if (!flow.complete) {
    sentences.push('La sequenza dei punti ricostruita dal referto è incompleta: la lettura riguarda solo la parte disponibile.')
  }

  if (i.lastTie && i.ties > 1) {
    const changes = i.leadChanges ? `, vantaggio cambiato di mano ${plural(i.leadChanges, 'volta', 'volte')}` : ''
    sentences.push(`Ultima parità ${sul(i.lastTie)} (${plural(i.ties, 'parità', 'parità')} nel set${changes}).`)
  } else if (i.ties === 1) {
    sentences.push(`Una sola parità, ${sul(i.lastTie)}.`)
  } else if (flow.points.length) {
    sentences.push(`Nessuna parità dopo lo 0-0: ${flow.points[0].winner === 'own' ? 'la squadra è rimasta sempre avanti' : 'la squadra è rimasta sempre dietro'}.`)
  }

  if (i.maxLead) {
    let text = `Vantaggio massimo di ${plural(i.maxLead.diff, 'punto', 'punti')} ${sul(i.maxLead)}`
    if (i.leadLost) {
      const cancelled = flow.points.slice(i.leadLost.index).find(point => point.diff <= 0)
      text += `, annullato ${sul(cancelled)}`
    }
    sentences.push(`${text}.`)
  }
  if (i.maxDeficit) {
    let text = `Svantaggio massimo di ${plural(-i.maxDeficit.diff, 'punto', 'punti')} ${sul(i.maxDeficit)}`
    if (i.deficitRecovered) {
      const levelled = flow.points.slice(i.deficitRecovered.index).find(point => point.diff >= 0)
      text += `, recuperato fino ${al(levelled)}`
    }
    sentences.push(`${text}.`)
  }

  const withRotation = flow.rotationKnown
  for (const [sign, longest, label] of [[1, i.longestPositive, 'positiva'], [-1, i.longestNegative, 'negativa']]) {
    if (!longest) continue
    const same = flow.runs.filter(run => run.sign === sign && run.length === longest.length)
    sentences.push(same.length === 1
      ? `Serie ${label} più lunga: ${runText(longest, withRotation)}.`
      : `${same.length} serie ${label === 'positiva' ? 'positive' : 'negative'} di ${plural(longest.length, 'punto', 'punti')}: ${same.map(run => `da ${run.from.own}-${run.from.other} a ${run.to.own}-${run.to.other}${withRotation && Object.keys(run.rotations).length ? ` in ${rotationNames(run.rotations)}` : ''}`).join('; ')}.`)
  }

  if (compact) return sentences.join(' ')

  sentences.push(`In fase BP ${plural(i.bp.won, 'punto', 'punti')} su ${plural(i.bp.rallies, 'scambio', 'scambi')} (${percent(i.bp.won, i.bp.rallies)}), in fase CP ${i.cp.won} su ${i.cp.rallies} (${percent(i.cp.won, i.cp.rallies)}).`)

  const final = finalPhase(flow)
  if (final && flow.points.length > flow.points.indexOf(final.at) + 1) {
    sentences.push(`Quando una squadra ha raggiunto ${final.threshold} punti il punteggio era ${score(final.at)}; da lì il parziale è stato ${final.partial.own}-${final.partial.other}.`)
  }

  // Own time-outs and double changes: position in the sequence and what followed (no causal link)
  for (const event of flow.events.filter(e => e.team === 'own' && (e.type === 'timeout' || e.type === 'doubleChange'))) {
    const next = scoreAfter(flow, event.after)
    const label = event.type === 'timeout' ? 'Time-out richiesto' : `Doppio cambio (${event.changes.map(c => `#${c.in?.number ?? '?'} in ${c.position}`).join(', ')})`
    sentences.push(next
      ? `${label} ${sul(event.score)}; nei punti successivi il punteggio è arrivato a ${score(next)}.`
      : `${label} ${sul(event.score)}.`)
  }
  const opponentTimeouts = flow.events.filter(e => e.team === 'other' && e.type === 'timeout')
  if (opponentTimeouts.length) {
    sentences.push(`Time-out di ${context.opponent || 'squadra avversaria'} ${list(opponentTimeouts.map(e => sul(e.score)))}.`)
  }
  if (!flow.rotationKnown) sentences.push('Le P non sono indicate: segna il palleggiatore nell\'elenco atleti per vederle.')
  return sentences.join(' ')
}

export function describeMatch(indicatorsList, flows, context = {}) {
  if (!indicatorsList.length) return ''
  const sentences = []
  const won = indicatorsList.filter(i => i.won).length
  const lost = indicatorsList.length - won
  sentences.push(`${context.team ? `${context.team}: gara` : 'Gara'} ${won > lost ? 'vinta' : 'persa'} ${won}-${lost} (${indicatorsList.map(i => `${i.final.own}-${i.final.other}`).join(', ')}).`)

  if (indicatorsList.length > 1) {
    const balanced = [...indicatorsList].sort((a, b) => a.margin - b.margin || b.ties - a.ties)[0]
    const widest = [...indicatorsList].sort((a, b) => b.margin - a.margin || a.ties - b.ties)[0]
    if (balanced.set !== widest.set) {
      sentences.push(`Il set più equilibrato è il ${ordinal(balanced.set)} (${balanced.final.own}-${balanced.final.other}, ${plural(balanced.ties, 'parità', 'parità')}); il più netto il ${ordinal(widest.set)} (${widest.final.own}-${widest.final.other}).`)
    }
  }

  const leadsLost = indicatorsList.filter(i => i.leadLost)
  if (leadsLost.length) {
    sentences.push(`Vantaggi di almeno 3 punti poi annullati: ${list(leadsLost.map(i => `${ordinal(i.set)} set (+${i.leadLost.diff} ${sul(i.leadLost)}${i.won ? ', set vinto' : ', set perso'})`))}.`)
  }
  const recovered = indicatorsList.filter(i => i.deficitRecovered)
  if (recovered.length) {
    sentences.push(`Svantaggi di almeno 3 punti recuperati: ${list(recovered.map(i => `${ordinal(i.set)} set (svantaggio di ${-i.deficitRecovered.diff} ${sul(i.deficitRecovered)}${i.won ? ', set vinto' : ', set perso'})`))}.`)
  }

  const allRuns = flows.flatMap(flow => flow.runs.map(run => ({ ...run, set: flow.set })))
  const best = sign => allRuns.filter(run => run.sign === sign).sort((a, b) => b.length - a.length || a.set - b.set)[0]
  const bestPositive = best(1)
  const bestNegative = best(-1)
  if (bestPositive) sentences.push(`Serie positiva più lunga della gara: ${plural(bestPositive.length, 'punto', 'punti')} nel ${ordinal(bestPositive.set)} set (da ${bestPositive.from.own}-${bestPositive.from.other} a ${bestPositive.to.own}-${bestPositive.to.other}).`)
  if (bestNegative) sentences.push(`Serie negativa più lunga: ${plural(bestNegative.length, 'punto', 'punti')} nel ${ordinal(bestNegative.set)} set (da ${bestNegative.from.own}-${bestNegative.from.other} a ${bestNegative.to.own}-${bestNegative.to.other}).`)

  const bp = indicatorsList.reduce((acc, i) => ({ won: acc.won + i.bp.won, rallies: acc.rallies + i.bp.rallies }), { won: 0, rallies: 0 })
  const cp = indicatorsList.reduce((acc, i) => ({ won: acc.won + i.cp.won, rallies: acc.rallies + i.cp.rallies }), { won: 0, rallies: 0 })
  let phaseText = `Nella gara: in fase BP ${bp.won} punti su ${bp.rallies} scambi (${percent(bp.won, bp.rallies)}), in fase CP ${cp.won} su ${cp.rallies} (${percent(cp.won, cp.rallies)}).`
  if (indicatorsList.length > 1) {
    const cpRate = i => (i.cp.rallies ? i.cp.won / i.cp.rallies : 0)
    const sorted = [...indicatorsList].sort((a, b) => cpRate(b) - cpRate(a))
    if (cpRate(sorted[0]) !== cpRate(sorted.at(-1))) {
      const low = percentValue(sorted.at(-1).cp.won, sorted.at(-1).cp.rallies)
      const high = percentValue(sorted[0].cp.won, sorted[0].cp.rallies)
      phaseText += ` La percentuale in CP va ${prep('dal', low)}${low}% del ${ordinal(sorted.at(-1).set)} set ${prep('al', high)}${high}% del ${ordinal(sorted[0].set)}.`
    }
  }
  sentences.push(phaseText)

  // P where runs concentrate (only sets whose P is known)
  const knownFlows = flows.filter(flow => flow.rotationKnown)
  if (knownFlows.length) {
    const sum = sign => knownFlows.flatMap(flow => flow.runs.filter(run => run.sign === sign))
      .reduce((acc, run) => {
        for (const [rotation, count] of Object.entries(run.rotations)) acc[rotation] = (acc[rotation] || 0) + count
        return acc
      }, {})
    const positive = sum(1)
    const negative = sum(-1)
    const scope = knownFlows.length < flows.length ? ` (set con P indicate: ${knownFlows.map(f => f.set).join(', ')})` : ''
    if (Object.keys(positive).length) sentences.push(`I punti delle serie positive si concentrano in ${rotationSummary(positive)}${scope}.`)
    if (Object.keys(negative).length) sentences.push(`I punti delle serie negative si concentrano in ${rotationSummary(negative)}${scope}.`)
  } else {
    sentences.push('Le P non sono indicate: segna il palleggiatore nell\'elenco atleti per vedere dove si concentrano le serie.')
  }

  // Where negative runs start, and how the final phases went
  const negativeRuns = flows.flatMap(flow => flow.runs.filter(run => run.sign === -1).map(run => ({ run, flow })))
  if (negativeRuns.length) {
    const inFinal = negativeRuns.filter(({ run, flow }) => Math.max(run.from.own, run.from.other) >= finalThreshold(flow.set)).length
    sentences.push(`${inFinal} ${inFinal === 1 ? 'serie negativa su' : 'serie negative su'} ${negativeRuns.length} ${inFinal === 1 ? 'è iniziata' : 'sono iniziate'} nel finale di set (da 20 punti, 10 nel tie-break).`)
  }
  const finals = flows.map(finalPhase).filter(Boolean).filter(final => final.partial.own + final.partial.other > 0)
  if (finals.length > 1) {
    const favourable = finals.filter(final => final.partial.own > final.partial.other).length
    sentences.push(`Nel finale di set il parziale è stato favorevole in ${favourable} set su ${finals.length}.`)
  }
  return sentences.join(' ')
}
