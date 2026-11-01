// "Informazioni" page: who makes Referto Volley, source code and licence, origins, data handling and the
// voluntary support. Links come from config.js; the PayPal button appears only when a link is configured
// and is a plain link with the PayPal wordmark stored in the app (no PayPal script, widget or remote image:
// nothing is requested from PayPal until the user opens it).
import { useEffect, useState } from 'react'
import ContactEmail from './ContactEmail.jsx'
import ExternalLink from './ExternalLink.jsx'
import { fetchLatestDownloads } from './downloads.js'
import { isTauriApp } from './updates.js'
import paypalLogo from './assets/paypal.svg'
import {
  AUTHOR_NAME, AUTHOR_URL, LICENSE_NAME, LICENSE_SPDX, LICENSE_URL, PAYPAL_DONATION_URL, PRIVACY_URL, SOURCE_REPOSITORY_URL, WEB_APP_URL,
  externalUrl, releaseUrl,
} from './config.js'
import { APP_VERSION } from './version.js'

// Download section: the packages of the latest GitHub release as one card per platform, read when the page
// opens (only the release list is requested; nothing about the matches is sent).
export function DownloadSection({ webUrl = WEB_APP_URL, releasesUrl = `${SOURCE_REPOSITORY_URL}/releases/latest` }) {
  const [latest, setLatest] = useState(null)
  useEffect(() => {
    let active = true
    // offline or GitHub not reachable: only the link to the releases page is shown
    fetchLatestDownloads().then(found => { if (active) setLatest(found) }).catch(() => {})
    return () => { active = false }
  }, [])
  const groups = latest?.groups || []
  const date = latest?.date && new Date(latest.date).toLocaleDateString('it-IT')
  return (
    <div className="vs-card vs-download" id="download">
      <h2 className="vs-card-title">Scarica</h2>
      {latest && <p className="vs-card-subtitle">Ultima release: v{latest.version}{date ? ` (${date})` : ''}</p>}
      <div className="vs-download-actions">
        {isTauriApp() && <ExternalLink href={webUrl} className="vs-btn vs-btn-primary">Apri la versione web</ExternalLink>}
        <ExternalLink href={releasesUrl} className={`vs-btn ${isTauriApp() ? 'vs-btn-secondary' : 'vs-btn-primary'}`}>Tutte le release su GitHub</ExternalLink>
      </div>
      {groups.length > 0 && (
        <div className="vs-download-grid">
          {groups.map(group => (
            <div className="vs-download-card" key={group.platform}>
              <h3>{group.platform}</h3>
              <p>{group.note}</p>
              <div className="vs-download-chips">
                {group.files.map(file => (
                  <ExternalLink key={file.name} href={file.url} className="vs-download-chip" title={file.name}>{file.label}</ExternalLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="vs-card-subtitle">
        Le build sono prodotte da GitHub Actions a partire dal codice sorgente pubblico. Le build per Windows e macOS non sono
        firmate da uno sviluppatore registrato: al primo avvio il sistema può mostrare un avviso. Su Android consenti
        l’installazione dal browser o dal file manager.
      </p>
    </div>
  )
}

export function AboutProject({ version = APP_VERSION }) {
  return (
    <div className="vs-card vs-about">
      <h1 className="vs-card-title">Referto Volley</h1>
      <p>
        Referto Volley è un progetto di {AUTHOR_NAME} per ricavare e analizzare le informazioni contenute nei referti
        delle partite di pallavolo: il rendimento della squadra nelle diverse rotazioni e nelle fasi break point e cambio palla.
      </p>
      <p>
        Referto Volley è software open source distribuito secondo i termini della GNU Affero General Public License v3.0
        o successive: chiunque può usarlo, studiarne il codice, modificarlo e ridistribuirlo alle stesse condizioni.
      </p>
      <dl className="vs-about-facts">
        <dt>Progetto</dt>
        <dd><ExternalLink href={AUTHOR_URL}>{AUTHOR_NAME}</ExternalLink></dd>
        <dt>Contatti</dt>
        <dd><ContactEmail /></dd>
        <dt>Codice sorgente</dt>
        <dd><ExternalLink href={SOURCE_REPOSITORY_URL}>{SOURCE_REPOSITORY_URL.replace(/^https:\/\//, '')}</ExternalLink></dd>
        <dt>Licenza</dt>
        <dd>
          <ExternalLink href={LICENSE_URL}>{LICENSE_NAME}</ExternalLink>
          <span className="vs-about-spdx">SPDX: <code>{LICENSE_SPDX}</code></span>
        </dd>
        <dt>Versione</dt>
        <dd><ExternalLink href={releaseUrl(version)}>{version}</ExternalLink></dd>
      </dl>
      <h2 className="vs-about-heading">Origini</h2>
      <p>
        Referto Volley riprende e sviluppa l’idea del foglio Excel realizzato da Andrea Fortunati per analizzare
        le rotazioni a partire dai dati del referto di gara. La lettura dei PDF, l’interfaccia, l’archivio e le altre
        funzioni dell’applicazione sono sviluppate nel progetto Referto Volley.
      </p>
    </div>
  )
}

export function SyncInfoCard() {
  return (
    <div className="vs-card">
      <h2 className="vs-card-title">Sincronizzazione con Google Drive, Dropbox e OneDrive</h2>
      <p>
        È facoltativa e serve a ritrovare le stesse gare su più dispositivi: la attivi da «Referti di gara», nel riquadro dei referti salvati,
        collegando lo stesso account su ogni dispositivo.
      </p>
      <ul className="vs-about-list">
        <li><strong>Cosa viene copiato</strong>: i dati delle gare e i PDF originali, in file nel tuo spazio cloud.</li>
        <li><strong>Quando</strong>: da sola, all’avvio, pochi secondi dopo ogni modifica e ogni 5 minuti con l’app aperta. Senza rete riprende quando la rete torna.</li>
        <li><strong>Modifiche su due dispositivi</strong>: se la stessa gara cambia su entrambi vince la modifica più recente, e l’altra versione resta come copia della gara.</li>
        <li><strong>Eliminare una gara</strong>: la cancellazione arriva anche agli altri dispositivi collegati. Per conservarla, esporta prima un archivio .zrv.</li>
        <li><strong>Scollegare</strong>: quando vuoi. Le gare restano sul dispositivo e, se lo chiedi, i file nel cloud vanno nel cestino.</li>
        <li><strong>Dove è disponibile</strong>: nella versione web e nelle app per Windows, macOS e Linux con tutti e tre i servizi; nell’app Android solo con Google Drive; su iPhone e iPad non è disponibile. Ogni dispositivo usa un servizio alla volta. Sul web, con Google Drive, l’accesso scade dopo un’ora e basta un tocco per rinnovarlo.</li>
      </ul>
    </div>
  )
}

export function PrivacyCard() {
  return (
    <div className="vs-card">
      <h2 className="vs-card-title">Privacy e dati</h2>
      <ul className="vs-about-list">
        <li>
          Il progetto non ha un server che riceva i referti: la lettura dei PDF avviene sul dispositivo, compreso il riconoscimento ottico
          dei caratteri (OCR) dei referti TieBreakTech, con motore e modelli inclusi nell’applicazione.
        </li>
        <li>
          Gare e PDF restano nell’archivio locale del browser o dell’applicazione, separati tra loro. Lasciano il dispositivo solo per una tua scelta:
          quando esporti un archivio, colleghi un servizio cloud o invii un file all’autore. Cancellare i dati del sito o del browser può far perdere
          le gare, se non le hai esportate o sincronizzate.
        </li>
        <li>
          Se colleghi Google Drive, Dropbox o OneDrive, dati e PDF vanno direttamente dal dispositivo al tuo spazio, senza passare dal progetto, e l’app accede solo
          ai propri file o alla propria cartella. Finché non colleghi un servizio, l’app non lo contatta.
        </li>
        <li>
          I referti inviati volontariamente via email contengono nomi di atlete e atleti, anche minorenni: inviali solo se puoi condividerli.
          Sono conservati sul computer dell’autore e usati solo per migliorare il progetto; sono cancellati quando non servono più
          o su richiesta, scrivendo a <ContactEmail subject="Cancellazione di un referto inviato" />. Nei test del progetto, che sono pubblici,
          finiscono solo letture anonimizzate: senza nomi, luogo, numero gara e data, ma con i numeri di maglia e i punteggi originali.
        </li>
        <li>
          Nessun sistema di analytics, tracking, pubblicità o telemetria; il codice non imposta cookie.
          Font, script e risorse sono distribuiti con l’applicazione, non caricati da servizi esterni.
        </li>
        <li>
          Le applicazioni installate chiedono a GitHub solo il numero dell’ultima versione pubblicata (disattivabile qui sopra),
          e la pagina Informazioni legge da GitHub l’elenco dei file da scaricare: questi controlli non trasmettono dati delle gare.
        </li>
        <li>Il testo completo è nell’<ExternalLink href={PRIVACY_URL}>informativa sulla privacy</ExternalLink>.</li>
      </ul>
    </div>
  )
}

export function SupportCard({ paypalUrl = PAYPAL_DONATION_URL }) {
  const url = externalUrl(paypalUrl)
  return (
    <div className="vs-card" id="sostieni">
      <h2 className="vs-card-title">Sostieni lo sviluppo</h2>
      <p>Referto Volley è sviluppato e mantenuto come progetto open source.</p>
      {url ? (
        <>
          <p>
            Se lo trovi utile e vuoi contribuire alle spese e al tempo necessario per continuare a svilupparlo,
            puoi fare una donazione volontaria tramite PayPal.
          </p>
          <p>
            <ExternalLink href={url} className="vs-btn vs-support-button">
              <img src={paypalLogo} alt="" width="64" height="16" />
              <span>Sostieni Referto Volley con PayPal</span>
            </ExternalLink>
          </p>
          <p className="vs-card-subtitle">
            La donazione è completamente facoltativa e non sblocca funzionalità aggiuntive.
            Il link apre il sito di PayPal: finché non lo scegli, questa pagina non contatta PayPal.
          </p>
        </>
      ) : (
        <p>
          Puoi contribuire segnalando problemi o proponendo miglioramenti nel{' '}
          <ExternalLink href={SOURCE_REPOSITORY_URL}>repository del codice sorgente</ExternalLink>.
        </p>
      )}
    </div>
  )
}

// Shown when a TieBreakTech scoresheet is imported: real files are what improves its recognition
export function TbtImportNotice() {
  return (
    <div style={{ margin: '1rem 0', padding: '0.85rem 1rem', background: '#FFF8E1', border: '1px solid #FFB300', borderRadius: '0.5rem', color: '#6D4C00', fontSize: '0.85rem' }}>
      I PDF di TieBreakTech sono difficili da interpretare: confronta i dati con il file e correggili a mano (il contorno arancione indica i valori incerti). Se trovi errori, invia il file via email all’<ContactEmail subject="Referto TieBreakTech da migliorare" body="Allego il PDF del referto: gli errori che ho trovato sono questi:">autore</ContactEmail>: sarà usato solo per migliorare il progetto, non sarà pubblicato né condiviso con altri e sarà cancellato quando non serve più o su richiesta.
    </div>
  )
}
