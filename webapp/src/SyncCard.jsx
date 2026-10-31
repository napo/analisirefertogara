// Synchronisation with a cloud service chosen by the user: what it does, the explicit consent before connecting,
// then its state and the way to disconnect. Hidden where the project has no client for the platform.
import { useState } from 'react'
import dropboxIcon from './assets/services/dropbox.svg'
import googleDriveIcon from './assets/services/google-drive.svg'
import onedriveIcon from './assets/services/onedrive.svg'
import { useMatchStore } from './store'
import { syncPlatform } from './sync/platform.js'
import { DEFAULT_PROVIDER, PROVIDERS, prepareSignIn } from './sync/providers.js'

const COMMON_POINTS = account => [
  'I dati vanno direttamente dal dispositivo al tuo spazio: nessun server del progetto li riceve.',
  'Vengono copiati i dati delle gare e i PDF originali, che contengono nomi di atlete e atleti, anche minorenni. Occupano spazio del tuo account: ogni PDF pesa fino a qualche megabyte. Su un nuovo dispositivo collegato arrivano tutti.',
  `Collega lo stesso account ${account} su ogni dispositivo: all’avvio e dopo ogni modifica l’app tiene allineati i dati. I dispositivi collegati a un altro servizio restano separati.`,
  'Se modifichi la stessa gara su due dispositivi, l’app tiene entrambe le versioni. Una gara eliminata sparisce anche dagli altri dispositivi collegati.',
]

const SERVICES = {
  'google-drive': {
    name: 'Google Drive', account: 'Google', icon: googleDriveIcon,
    points: [
      'L’app crea nel tuo Drive la cartella «Referto Volley» con il file «RefertoVolley.zrv» e i PDF nella cartella «pdf»: li vedi e puoi scaricarli; il file si importa anche a mano, senza i PDF.',
      'L’app vede solo i file che crea lei, non il resto del tuo Drive.',
      ...COMMON_POINTS('Google'),
    ],
    deleteRemote: 'Sposta anche il file «RefertoVolley.zrv» e i PDF nel cestino di Drive (gli altri dispositivi collegati li ricreano alla prossima sincronizzazione)',
  },
  dropbox: {
    name: 'Dropbox', account: 'Dropbox', icon: dropboxIcon,
    points: [
      'L’app crea nel tuo Dropbox una cartella riservata, tra le cartelle delle app, con il file «RefertoVolley.zrv» e i PDF nella cartella «pdf»: li vedi e puoi scaricarli; il file si importa anche a mano, senza i PDF. Lasciali lì: se li sposti, l’app li crea di nuovo.',
      'L’app vede solo la propria cartella, non il resto del tuo Dropbox.',
      ...COMMON_POINTS('Dropbox'),
    ],
    deleteRemote: 'Elimina anche il file «RefertoVolley.zrv» e i PDF da Dropbox, che li conserva per un periodo tra i file eliminati (gli altri dispositivi collegati li ricreano alla prossima sincronizzazione)',
  },
  onedrive: {
    name: 'OneDrive', account: 'Microsoft', icon: onedriveIcon,
    points: [
      'L’app crea nel tuo OneDrive una cartella riservata, dentro la cartella delle app, con il file «RefertoVolley.zrv»: lo vedi e puoi scaricarlo e importarlo a mano. Lasciali lì: se li sposti, l’app li crea di nuovo.',
      'L’app vede solo la propria cartella, non il resto del tuo OneDrive.',
      ...COMMON_POINTS('Microsoft personale'),
      'Nella versione web l’accesso dura al massimo 24 ore: poi basta un tocco su «Sincronizza ora».',
    ],
    deleteRemote: 'Sposta anche il file «RefertoVolley.zrv» e i PDF nel cestino di OneDrive (gli altri dispositivi collegati li ricreano alla prossima sincronizzazione)',
  },
}
const EXCLUSIVE = 'Su ogni dispositivo puoi usare un solo servizio alla volta: Google Drive, Dropbox oppure OneDrive. Per cambiare, scollega quello attuale e collega il nuovo: la copia sul vecchio resta dov’è e non si aggiorna più.'

const problemText = ({ name, account }, problem) => ({
  offline: 'Nessuna connessione: l’app riprova appena la rete torna.',
  storage: `${name} non ha accettato la richiesta: riprova più tardi.`,
  file: `Il file su ${name} non è leggibile da questa versione dell’app: aggiornala per sincronizzare. Il file non viene toccato.`,
  'sign-in': `Accesso a ${account} scaduto: tocca «Sincronizza ora» per riprendere.`,
}[problem])

export default function SyncCard() {
  const { sync, syncStatus: status } = useMatchStore()
  const [step, setStep] = useState('idle')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [chosen, setChosen] = useState(DEFAULT_PROVIDER)
  if (!sync || !status) return null

  const run = async action => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }
  const connect = () => run(async () => {
    const ok = await sync.connect(chosen)
    setFailed(!ok)
    if (ok) setStep('idle')
  })
  const disconnect = () => run(async () => {
    await sync.disconnect(deleteRemote).catch(() => undefined)
    setStep('idle')
    setDeleteRemote(false)
  })

  if (status.state === 'off') {
    const service = SERVICES[chosen.id]
    return (
      <section className="vs-card vs-sync">
        <h2 className="vs-card-title">Sincronizza i dati</h2>
        <p>Una copia delle gare e dei referti PDF nel tuo spazio cloud, sempre aggiornata: se cambi dispositivo o ne usi più di uno, ritrovi gli stessi dati.</p>
        <p>{EXCLUSIVE}</p>
        {step === 'confirm' ? (
          <div className="vs-sync-confirm">
            <h3>Prima di collegare {service.name}</h3>
            <ul>{service.points.map(point => <li key={point}>{point}</li>)}</ul>
            {failed && <p className="vs-sync-warning" role="alert">Accesso a {service.account} non riuscito o annullato. Puoi riprovare.</p>}
            <div className="vs-sync-actions">
              <button type="button" className="vs-btn vs-btn-primary" onClick={connect} disabled={busy}>Continua con {service.account}</button>
              <button type="button" className="vs-btn vs-btn-secondary" onClick={() => setStep('idle')} disabled={busy}>Annulla</button>
            </div>
          </div>
        ) : (
          <div className="vs-sync-actions">
            {PROVIDERS.filter(provider => provider.available(syncPlatform())).map(provider => (
              <button
                key={provider.id}
                type="button"
                className="vs-btn vs-btn-secondary"
                onClick={() => {
                  setChosen(provider)
                  setFailed(false)
                  setStep('confirm')
                  prepareSignIn()
                }}
              >
                <img src={SERVICES[provider.id].icon} alt="" width="18" height="18" />
                Collega {SERVICES[provider.id].name}
              </button>
            ))}
          </div>
        )}
      </section>
    )
  }

  const service = SERVICES[status.provider]
  const problem = status.state === 'paused' ? problemText(service, 'sign-in') : status.state === 'error' && status.problem ? problemText(service, status.problem) : null
  const when = new Date(status.lastSyncedAt || 0).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <section className="vs-card vs-sync">
      <h2 className="vs-card-title">Sincronizza i dati</h2>
      <p className="vs-sync-status" aria-live="polite">
        <span className={`vs-sync-dot ${status.state}`} aria-hidden="true" />
        <strong>Collegato a {service.name}</strong>
        <span>{status.state === 'syncing' ? 'Sincronizzazione in corso…' : status.lastSyncedAt ? `Ultima sincronizzazione: ${when}` : 'Non ancora sincronizzato'}</span>
      </p>
      {problem && <p className="vs-sync-warning" role="alert">{problem}{status.detail && ` (${status.detail})`}</p>}
      {status.conflicts > 0 && (
        <p>{status.conflicts === 1 ? 'Una gara era stata modificata su due dispositivi: trovi entrambe le versioni nell’elenco.' : `${status.conflicts} gare erano state modificate su due dispositivi: trovi entrambe le versioni nell’elenco.`}</p>
      )}
      {step === 'disconnect' ? (
        <div className="vs-sync-confirm">
          <h3>Scollegare {service.name}?</h3>
          <p>Su questo dispositivo i dati restano tutti; smettono solo di essere copiati su {service.name}.</p>
          <label className="vs-sync-check">
            <input type="checkbox" checked={deleteRemote} onChange={e => setDeleteRemote(e.target.checked)} />
            <span>{service.deleteRemote}</span>
          </label>
          <div className="vs-sync-actions">
            <button type="button" className="vs-btn vs-btn-danger" onClick={disconnect} disabled={busy}>Scollega</button>
            <button type="button" className="vs-btn vs-btn-secondary" onClick={() => setStep('idle')} disabled={busy}>Annulla</button>
          </div>
        </div>
      ) : (
        <div className="vs-sync-actions">
          <button type="button" className="vs-btn vs-btn-primary vs-btn-sm" onClick={() => run(() => sync.syncNow(true))} disabled={busy || status.state === 'syncing'}>Sincronizza ora</button>
          <button type="button" className="vs-btn vs-btn-secondary vs-btn-sm" onClick={() => setStep('disconnect')} disabled={busy}>Scollega</button>
        </div>
      )}
    </section>
  )
}
