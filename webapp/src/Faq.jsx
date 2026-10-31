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
    title: 'Dati e dispositivi',
    items: [
      { id: 'data', q: 'Dove finiscono i dati?', a: ['Restano sul dispositivo: anche la versione web gira tutta nel browser, compreso l’OCR, e il progetto non ha un server che riceva i referti. Lasciano il dispositivo solo per tua scelta: quando esporti un archivio, colleghi un servizio cloud o mandi un file all’autore.', 'Attenzione: i dati stanno in quel browser su quel dispositivo. Se cancelli i dati del sito o cambi browser non li ritrovi, a meno di averli esportati o sincronizzati.'] },
      { id: 'exchange', q: 'Come passo i dati su un altro dispositivo?', a: ['Ci sono due modi. Il primo è esportare: da «Storico gare» ottieni un file .zrv, che apri con «Importa archivio» su qualsiasi versione dell’app, PDF compresi. Il secondo è la sincronizzazione con Google Drive, Dropbox o OneDrive, sempre da «Storico gare»: collegando lo stesso account su più dispositivi dati e PDF restano allineati da soli.'] },
      { id: 'sync', q: 'Il progetto può leggere i dati che sincronizzo?', a: ['No. Dati e PDF vanno direttamente dal dispositivo al tuo spazio cloud, e l’app vede solo i propri file o la propria cartella. Puoi scollegare il servizio quando vuoi: i dati restano sul dispositivo.'] },
      { id: 'delete', q: 'Se elimino una gara posso recuperarla?', a: ['Dal dispositivo no, a meno di averla esportata. Se sincronizzi, la cancellazione arriva anche agli altri dispositivi collegati: per conservarla, esporta prima un archivio.'] },
    ],
  },
  {
    title: 'Contatti',
    items: [
      { id: 'request', q: 'Come chiedo una funzione o segnalo un problema?', a: ['Scrivi su GitHub, dove la segnalazione resta pubblica, oppure via email se contiene dati personali.'] },
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
