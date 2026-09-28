// Single source of the app's vocabulary: Informazioni page, collapsible glossary in Analisi, contextual
// tooltips and the table at the end of the PDF report all read from here. No definition is repeated
// elsewhere in the code.
//
// Vocabulary: RALLY = chronological unit of play; PUNTO = outcome of a rally, assigned to a team;
// PUNTEGGIO = cumulative score of the two teams. Presence data describe what happened to the team while
// an athlete was on court, never what the athlete did individually.
//
// Fields:
//   id, term, abbr         name shown (abbr for BP, CP...)
//   short                  compact definition (PDF table, Analisi glossary)
//   full                   extended definition (Informazioni); defaults to short
//   tooltip                contextual help (ⓘ); defaults to short
//   pdf                    part of the compact glossary at the end of the PDF report
//   analysis               part of the collapsible glossary in Analisi
//   available              false when the app does not compute that datum yet: never shown

export const GLOSSARY = [
  {
    id: 'rally',
    term: 'Rally',
    short: 'Sequenza di gioco dal servizio all\'assegnazione del punto.',
    full: 'Unità cronologica di gioco: inizia con il servizio e termina con l\'assegnazione di un punto a una delle due squadre. Nel grafico "Andamento della gara" i numeri sull\'asse orizzontale sono i rally del set, in ordine.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'punto',
    term: 'Punto',
    short: 'Esito di un rally: il punto assegnato a una delle due squadre.',
    pdf: false,
    analysis: true,
  },
  {
    id: 'punteggio',
    term: 'Punteggio',
    short: 'Situazione cumulativa dei punti delle due squadre, per esempio 17-15.',
    pdf: false,
    analysis: true,
  },
  {
    id: 'bp',
    term: 'BP',
    abbr: 'Break Point',
    short: 'Break Point: fase in cui la squadra analizzata è al servizio.',
    full: 'Break Point: fase in cui la squadra analizzata è al servizio. I punti in fase BP sono i punti conquistati dalla squadra mentre serve.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'cp',
    term: 'CP',
    abbr: 'Cambio Palla',
    short: 'Cambio Palla: fase in cui la squadra analizzata è in ricezione.',
    full: 'Cambio Palla: fase in cui la squadra analizzata è in ricezione. Il punto che riconquista il servizio appartiene a questa fase ed è escluso dai punti in fase BP.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'p1-p6',
    term: 'P1-P6',
    short: 'Posizione del palleggiatore effettivo nel rally; può cambiare anche per sostituzioni o doppi cambi.',
    full: 'Posizione del palleggiatore effettivo nel rally, ricostruita da formazione, rotazioni, sostituzioni e rientri. Può cambiare anche per un doppio cambio senza normale rotazione. Con più palleggiatori marcati in campo serve una scelta per quel tratto; senza una scelta la P resta non determinata.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'differenza',
    term: 'Differenza',
    short: 'Punteggio della squadra analizzata meno quello dell\'avversaria: positivo in vantaggio, negativo in svantaggio, 0 parità.',
    full: 'Differenza tra il punteggio della squadra analizzata e quello dell\'avversaria. Un valore positivo indica vantaggio, un valore negativo svantaggio, 0 parità.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'turno-servizio',
    term: 'Turno di servizio',
    short: 'Sequenza di rally durante la quale una squadra mantiene il servizio.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'tt',
    term: 'TT',
    abbr: 'Turni totali',
    short: 'Turni totali: tratti continui di servizio (BP) o ricezione (CP) con la stessa P effettiva. Un cambio di P divide il turno; i turni senza rally osservati sono esclusi.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'mp',
    term: 'MP',
    abbr: 'Media punti',
    short: 'Media punti per turno: punti conquistati per turno in BP, punti subiti per turno in CP.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'differenza-mp',
    term: 'Differenza MP',
    short: 'MP BP meno MP CP: confronta le medie delle due fasi. Non è la Differenza di punteggio.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'al-servizio',
    term: 'Al servizio',
    short: 'Atleta che effettua il servizio nel rally considerato.',
    full: 'Atleta che effettua il servizio nel rally considerato. L\'app lo ricava dai turni di servizio e da chi occupava quella posizione in quel momento: le sostituzioni del referto (uscite e rientri) sono applicate. I cambi del libero non hanno il punteggio sul referto e non sono considerati.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'serie',
    term: 'Serie di punti',
    short: 'Punti consecutivi conquistati dalla stessa squadra (evidenziata da 3 punti in su).',
    pdf: true,
    analysis: true,
  },
  {
    id: 'rally-set-presenza',
    term: 'Rally nei set di presenza',
    short: 'Tutti i rally dei set in cui l\'atleta risulta in campo, anche solo per una parte del set.',
    tooltip: 'Tutti i rally dei set in cui l\'atleta risulta in campo, anche solo per una parte del set: non i soli rally giocati dall\'atleta.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'servizi-stimati',
    term: 'Servizi stimati',
    short: 'Servizi effettuati dall\'atleta, stimati dai turni di servizio della squadra e da chi era in campo in quella posizione (sostituzioni comprese).',
    pdf: true,
    analysis: true,
  },
  {
    id: 'media-servizi',
    term: 'Media servizi consecutivi',
    short: 'Servizi stimati divisi per i turni di servizio dell\'atleta.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'mp-bp-atleta',
    term: 'MP BP al servizio',
    short: 'Punti conquistati dalla squadra in fase BP per turno, con l\'atleta al servizio. Sono punti della squadra.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'eventi',
    term: 'TO · S · DC · CC',
    short: 'Eventi del set: time-out, sostituzione, doppio cambio (due sostituzioni allo stesso punteggio), cambio campo nel 5° set.',
    pdf: true,
    analysis: true,
  },
  // Presence on court, rally by rally: substitutions of the scoresheet (exit and re-entry) applied
  {
    id: 'rally-in-campo',
    term: 'Rally in campo',
    short: 'Rally disputati mentre l\'atleta era presente in campo.',
    full: 'Rally disputati mentre l\'atleta era presente in campo, ricostruiti rally per rally con le sostituzioni del referto (uscite e rientri). I cambi del libero non hanno il punteggio sul referto: non sono considerati, e per il libero il dato non è disponibile.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'rally-vinti',
    term: 'Rally vinti',
    short: 'Rally vinti dalla squadra mentre l\'atleta era presente in campo. Non indica punti realizzati dall\'atleta.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'rally-persi',
    term: 'Rally persi',
    short: 'Rally persi dalla squadra mentre l\'atleta era presente in campo. Non indica errori o punti subiti dall\'atleta.',
    pdf: true,
    analysis: true,
  },
  {
    id: 'perc-rally-vinti',
    term: '% rally vinti',
    short: 'Rally vinti dalla squadra diviso rally in campo dell\'atleta. Confrontata tra atleti solo da 10 rally in campo.',
    pdf: true,
    analysis: true,
  },
  { id: 'prima-linea', term: 'Prima linea', short: 'Atleti che in quel rally occupano i posti 2, 3 e 4.', pdf: true, analysis: true },
  { id: 'seconda-linea', term: 'Seconda linea', short: 'Atleti che in quel rally occupano i posti 1, 6 e 5. "L#5⇒#11" indica il libero #5 in campo al posto di #11; "L?⇒#11" una presenza del libero non determinabile con certezza: ricostruita dal referto e dalle regole di gioco, ma non collocabile rally per rally.', pdf: true, analysis: true },
  { id: 'p-avversaria', term: 'P avversaria', short: 'Posizione del palleggiatore effettivo della squadra avversaria.', pdf: true, analysis: true },
  { id: 'configurazione-in-campo', term: 'Configurazione in campo', short: 'Combinazione degli atleti e delle rispettive posizioni presenti in campo in un determinato rally.', pdf: true, analysis: true },
  { id: 'confronto-rotazioni', term: 'Confronto delle rotazioni', short: 'Confronto tra la posizione del palleggiatore della squadra analizzata e quella del palleggiatore avversario nei rally osservati.', pdf: true, analysis: true },

]

const available = entry => entry.available !== false

// Entries for a place: 'info' (all available), 'analysis', 'pdf'
export function glossaryEntries(place = 'info') {
  return GLOSSARY.filter(entry => available(entry) && (place === 'info' || entry[place]))
}

export function glossaryEntry(id) {
  const entry = GLOSSARY.find(item => item.id === id)
  if (!entry) throw Error(`Voce di glossario sconosciuta: ${id}`)
  return entry
}

export const glossaryTerm = entry => (entry.abbr ? `${entry.term} · ${entry.abbr}` : entry.term)
export const glossaryTooltip = id => glossaryEntry(id).tooltip || glossaryEntry(id).short
export const glossaryFull = entry => entry.full || entry.short
