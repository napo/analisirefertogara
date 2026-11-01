// SPDX-FileCopyrightText: 2026 Maurizio Napolitano <maurizio.napolitano@gmail.com>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Frequent questions by topic: one closed answer per question, with the links that answer needs
import ContactEmail from './ContactEmail.jsx'
import ExternalLink from './ExternalLink.jsx'
import { PAYPAL_DONATION_URL, PRIVACY_URL, SOURCE_REPOSITORY_URL, WEB_APP_URL, externalUrl } from './config.js'

const RELEASES_URL = `${SOURCE_REPOSITORY_URL}/releases/latest`

export const FAQ_GROUPS = [
  {
    title: 'Per iniziare',
    items: [
      { id: 'what', q: 'A cosa serve Referto Volley?', a: ['Legge il PDF del referto di gara e ne ricava l’analisi: il rendimento della squadra nelle diverse rotazioni, nelle fasi di break point e di cambio palla, l’andamento della gara e le statistiche delle atlete e degli atleti.'] },
      { id: 'cost', q: 'Quanto costa?', a: ['Niente. Referto Volley è software libero e i sorgenti sono pubblici. Se vuoi aiutare lo sviluppo puoi fare una donazione: è facoltativa e non sblocca funzioni.'] },
      { id: 'download', q: 'Dove si scarica?', a: ['Non serve installare nulla: la versione web si apre dal browser. Ci sono anche le app per Windows, macOS, Linux e Android. Ogni versione ha il proprio archivio: per avere gli stessi dati altrove esporta un archivio o usa la sincronizzazione.'] },
      { id: 'ai', q: 'Il progetto è sviluppato con l’intelligenza artificiale?', a: ['Sì, il progetto è sviluppato facendo uso di agenti AI. Questo non vuol dire che non ci sia impegno: idee, scelte, prove sul campo e guida del lavoro restano umane.', 'L’intelligenza artificiale serve a scrivere il codice, non è dentro l’app: i referti sono letti sul dispositivo e non vengono inviati a servizi di questo tipo.'] },
      { id: 'warning', q: 'Perché Windows, Apple o Android dicono che il software è pericoloso?', a: ['Perché l’autore non è registrato come sviluppatore riconosciuto presso di loro. L’avviso dice che l’app non è firmata da quei produttori, non che sia stato trovato qualcosa di dannoso. Le versioni sono prodotte da GitHub Actions a partire dal codice pubblico, che chiunque può controllare.'] },
    ],
  },
  {
    title: 'Referti',
    items: [
      { id: 'formats', q: 'Quali referti posso importare?', a: ['I PDF prodotti dai software NEWBIT (FIPAV), SNUG e TieBreakTech. Se il tuo referto è di carta o hai un altro formato, puoi compilare la gara a mano con la stessa griglia.'] },
      { id: 'tbt', q: 'Perché i referti TieBreakTech vanno controllati?', a: ['Perché sono stampati come immagini: il testo si ricava con il riconoscimento ottico dei caratteri (OCR), che può sbagliare. L’app controlla i numeri con le regole del referto e segnala con un contorno arancione i valori incerti, ma alcuni errori non si possono riconoscere: confronta sempre i dati con il PDF prima di salvare.'] },
      { id: 'correct', q: 'Ho trovato un errore: come lo correggo?', a: ['Prima di salvare, nella pagina di verifica: la griglia di ogni set ha la stessa forma del foglio, così confronti i numeri cella per cella. Il contorno arancione sparisce quando cambi il valore. Gli scambi del libero si scrivono come sul referto, ad esempio 73-70-76.'] },
      { id: 'send', q: 'Il referto è letto male: posso segnalarlo?', a: ['Sì: invialo via email all’autore. Il file è usato solo per migliorare il progetto, non è pubblicato né condiviso con altri ed è cancellato quando non serve più o su richiesta. Contiene nomi di atlete e atleti, anche minorenni: invialo solo se puoi condividerlo.'] },
      { id: 'teams', q: 'Perché le squadre cambiano lato da un set all’altro?', a: ['Perché lo fanno sul foglio: a ogni set le squadre si scambiano il campo. La griglia segue il referto per rendere più rapido il confronto; l’analisi non cambia. La scelta della squadra da analizzare si fa in alto nella pagina di verifica.'] },
    ],
  },
  {
    title: 'Come leggere il report',
    items: [
      { id: 'read-start', q: 'Da dove comincio a leggere il report?', a: ['Dal riepilogo, per il quadro della gara. Poi «Le sei rotazioni a confronto» dice in quali rotazioni la squadra rende di più o di meno, e «Andamento della gara» quando sono avvenuti i momenti decisivi. Le altre sezioni approfondiscono: atleti, incrocio con le rotazioni avversarie, formazioni in campo. In fondo c’è il glossario, e nella pagina Informazioni trovi le definizioni complete.'] },
      { id: 'read-limits', q: 'Cosa mi dice il report e cosa no?', a: ['Dice come ha reso la squadra nelle fasi di gioco e nelle rotazioni. Non dice perché: il referto registra chi ha vinto il punto, non con quale fondamentale, quindi non misura attacco, ricezione, muro o errori. Le frasi di lettura automatica descrivono punteggi e sequenze, non le cause.'] },
      { id: 'read-phases', q: 'Che differenza c’è tra BP e CP?', a: ['BP (break point) è la fase in cui la squadra è al servizio: i punti in BP sono quelli conquistati mentre serve. CP (cambio palla) è la fase in cui è in ricezione: i punti subiti in CP sono quelli che l’avversaria fa prima che la squadra riconquisti il servizio. Il punto che riconquista il servizio è un punto conquistato in CP, quindi non conta tra i punti in BP.'] },
      { id: 'read-rotations', q: 'Come leggo la tabella delle sei rotazioni?', a: ['Ogni riga è una rotazione: P1–P6 è il posto in cui si trova il palleggiatore. TT sono i turni giocati in quella fase. MP è la media di punti per turno: in BP è meglio se è alta, perché sono punti conquistati; in CP è meglio se è bassa, perché sono punti subiti. La differenza MP è MP BP meno MP CP: più è alta, meglio rende la rotazione. La % punti BP dice quanta parte dei punti al servizio viene da quella rotazione.', 'Guarda anche TT: una media calcolata su pochi turni può cambiare molto con un solo punto.'] },
      { id: 'read-flow', q: 'Come leggo l’andamento della gara?', a: ['Il grafico segue un set rally per rally: sull’asse orizzontale ci sono i rally in ordine, in verticale la differenza di punteggio. Sopra lo zero la squadra analizzata è in vantaggio, sotto è in svantaggio. Una salita lunga è una serie di punti, cioè punti consecutivi della stessa squadra. Sul grafico sono segnati anche gli eventi del set: time-out (TO), sostituzioni (S), doppi cambi (DC) e cambio campo (CC).'] },
      { id: 'read-athletes', q: 'I dati degli atleti misurano quanto ha giocato bene ciascuno?', a: ['No. Rally vinti, rally persi e % rally vinti descrivono cosa ha fatto la squadra mentre l’atleta era in campo, non cosa ha fatto l’atleta: un rally perso non è un suo errore. Anche la MP BP al servizio conta i punti della squadra con quell’atleta al servizio. I servizi sono stimati dai turni del referto. La % rally vinti si confronta tra atleti solo da 10 rally in campo in su.'] },
      { id: 'read-matchup', q: 'Come leggo il confronto delle rotazioni?', a: ['È una griglia: ogni riga è una P della squadra analizzata, ogni colonna una P avversaria. In ogni incrocio la barra sopra è la fase BP e quella sotto la fase CP: verso destra il valore è positivo, verso sinistra negativo. Sono evidenziate la P più redditizia e quella più in difficoltà. Una cella chiara ha meno di 4 rally, quindi dice poco; il trattino indica un incrocio non giocato. Puoi leggerla in due modi: «Vinti − persi» è il saldo dei rally; «Rispetto alla media» confronta i rally vinti con quelli attesi in quella fase e toglie lo svantaggio naturale di chi serve, così BP e CP si confrontano sulla stessa scala.'] },
      { id: 'read-configurations', q: 'Cosa sono le configurazioni in campo?', a: ['Sono le combinazioni di atleti nelle rispettive posizioni, ordinate per numero di rally giocati. Servono a vedere quali assetti sono stati usati di più e come sono andati. Su pochi rally il risultato dice poco. I rally di cui non si può ricostruire la formazione con certezza sono esclusi.'] },
      { id: 'read-libero', q: 'Cosa significa L#5⇒#11, oppure L?⇒#11?', a: ['L#5⇒#11 vuol dire che il libero numero 5 è in campo al posto del numero 11. L?⇒#11 vuol dire che il referto non basta a stabilire la presenza del libero in quel momento: è una ricostruzione, non un dato osservato.'] },
      { id: 'read-undetermined', q: 'Perché alcuni rally non sono conteggiati in una rotazione?', a: ['Perché la P di quel tratto non è determinata: per esempio ci sono due possibili palleggiatori in campo e il referto non dice chi palleggiava. Segna i palleggiatori nell’elenco atleti (colonna «p») e indica chi palleggiava in quel tratto quando l’app lo chiede: i rally vengono attribuiti alla rotazione.'] },
      { id: 'read-many', q: 'Come si leggono i dati di più gare insieme?', a: ['L’analisi aggregata somma punti e turni di tutte le gare scelte per rotazione e calcola le medie sui totali: non è la media delle medie. Le gare con più turni pesano quindi di più. Se è attivo un filtro, entrano solo le gare filtrate della squadra scelta.'] },
    ],
  },
  {
    title: 'Dati e dispositivi',
    items: [
      { id: 'data', q: 'Dove finiscono i dati?', a: ['Restano sul dispositivo: anche la versione web gira tutta nel browser, compreso l’OCR, e il progetto non ha un server che riceva i referti. Lasciano il dispositivo solo per tua scelta: quando esporti un archivio, colleghi un servizio cloud o mandi un file all’autore.', 'Attenzione: i dati stanno in quel browser su quel dispositivo. Se cancelli i dati del sito o cambi browser non li ritrovi, a meno di averli esportati o sincronizzati.'] },
      { id: 'exchange', q: 'Come passo i dati su un altro dispositivo?', a: ['Ci sono due modi. Il primo è esportare: da «Storico gare» ottieni un file .zrv, che apri con «Importa archivio» su qualsiasi versione dell’app, PDF compresi. Il secondo è la sincronizzazione con Google Drive, Dropbox o OneDrive, da «Referti di gara», nel riquadro dei referti salvati: collegando lo stesso account su più dispositivi dati e PDF restano allineati da soli.'] },
      { id: 'sync', q: 'Il progetto può leggere i dati che sincronizzo?', a: ['No. Dati e PDF vanno direttamente dal dispositivo al tuo spazio cloud, e l’app vede solo i propri file o la propria cartella. Puoi scollegare il servizio quando vuoi: i dati restano sul dispositivo.'] },
      { id: 'delete', q: 'Se elimino una gara posso recuperarla?', a: ['Dal dispositivo no, a meno di averla esportata. Se sincronizzi, la cancellazione arriva anche agli altri dispositivi collegati: per conservarla, esporta prima un archivio.'] },
    ],
  },
  {
    title: 'Contatti',
    items: [
      { id: 'request', q: 'Posso contattare l’autore?', a: ['Sì, e ti invito a farlo: per proporre nuove funzionalità, togliere una curiosità o segnalare un errore da correggere. Ogni messaggio aiuta a migliorare il progetto. Puoi scrivere su GitHub, dove il messaggio resta pubblico, oppure via email, soprattutto se contiene dati personali.'] },
    ],
  },
]

export default function Faq() {
  const donation = externalUrl(PAYPAL_DONATION_URL)
  const actions = {
    cost: <>{donation && <ExternalLink href={donation}>Fai una donazione</ExternalLink>}<ExternalLink href={SOURCE_REPOSITORY_URL}>Codice sorgente</ExternalLink></>,
    download: <><ExternalLink href={WEB_APP_URL}>Apri la versione web</ExternalLink><ExternalLink href={RELEASES_URL}>Scarica le app</ExternalLink></>,
    send: <ContactEmail subject="Referto letto male" body="Allego il PDF del referto: gli errori che ho trovato sono questi:" />,
    sync: <ExternalLink href={PRIVACY_URL}>Informativa sulla privacy</ExternalLink>,
    request: <><ExternalLink href={`${SOURCE_REPOSITORY_URL}/issues`}>Scrivi su GitHub</ExternalLink><ContactEmail /></>,
  }
  return (
    <div className="vs-card vs-faq-page">
      <h1 className="vs-card-title">Domande frequenti</h1>
      {FAQ_GROUPS.map(group => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          {group.items.map(({ id, q, a }) => (
            <details key={id} className="vs-faq">
              <summary>{q}</summary>
              {a.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
              {actions[id] && <div className="vs-faq-actions">{actions[id]}</div>}
            </details>
          ))}
        </section>
      ))}
    </div>
  )
}
