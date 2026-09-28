// "Informazioni" page: who makes Referto Volley, source code and licence, origins, data handling and the
// voluntary support. Links come from config.js; the PayPal button appears only when a link is configured
// and is a plain link with the PayPal wordmark stored in the app (no PayPal script, widget or remote image:
// nothing is requested from PayPal until the user opens it).
import ExternalLink from './ExternalLink.jsx'
import paypalLogo from './assets/paypal.svg'
import {
  AUTHOR_NAME, AUTHOR_URL, LICENSE_NAME, LICENSE_SPDX, LICENSE_URL, PAYPAL_DONATION_URL, SOURCE_REPOSITORY_URL,
  externalUrl, releaseUrl,
} from './config.js'
import { APP_VERSION } from './version.js'

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

export function PrivacyCard() {
  return (
    <div className="vs-card">
      <h2 className="vs-card-title">Privacy e dati</h2>
      <ul className="vs-about-list">
        <li>I referti vengono elaborati sul dispositivo: i PDF non vengono inviati a un server per essere analizzati.</li>
        <li>
          I referti TieBreakTech, stampati come immagini, sono letti con il riconoscimento ottico dei caratteri (OCR)
          eseguito anch’esso sul dispositivo, con motore e modello inclusi nell’applicazione. I valori corretti automaticamente
          sono segnalati e vanno verificati prima di salvare.
        </li>
        <li>
          Gare e PDF restano nell’archivio locale (IndexedDB) del browser o dell’applicazione, separati tra loro. Per trasferirli o metterli al sicuro
          usa l’archivio .zrv (Esporta archivio / Importa archivio): cancellare i dati del sito o del browser senza averlo esportato
          può far perdere l’archivio.
        </li>
        <li>
          Nessun sistema di analytics, tracking, pubblicità o telemetria; il codice non imposta cookie.
          Font, script e risorse sono distribuiti con l’applicazione, non caricati da servizi esterni.
        </li>
        <li>
          Le applicazioni installate chiedono a GitHub solo il numero dell’ultima versione pubblicata (disattivabile qui sopra):
          nessun dato delle gare lascia il dispositivo.
        </li>
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
