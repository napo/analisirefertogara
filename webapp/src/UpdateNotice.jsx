// Notice of a new version in the installed apps: the user decides whether to update.
import { useEffect, useState } from 'react'
import { APP_VERSION } from './version.js'
import ExternalLink from './ExternalLink.jsx'
import { PAYPAL_DONATION_URL } from './config.js'
import { checkForUpdate, compareVersions, installUpdate, isTauriApp, openDownload, setUpdateChecksEnabled, swapLastVersion, updateChecksEnabled } from './updates.js'

export default function UpdateNotice() {
  const [update, setUpdate] = useState(null)
  const [state, setState] = useState('idle') // idle | installing | error
  const [progress, setProgress] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  // first start after an update (installed apps only): thank the user once
  const [thanks, setThanks] = useState(() => {
    const previous = swapLastVersion(APP_VERSION)
    return isTauriApp() && Boolean(previous) && compareVersions(APP_VERSION, previous) > 0
  })

  useEffect(() => {
    if (!updateChecksEnabled()) return
    let active = true
    // offline or GitHub not reachable: silently nothing
    checkForUpdate(APP_VERSION).then(found => { if (active) setUpdate(found) }).catch(() => {})
    return () => { active = false }
  }, [])

  const donation = PAYPAL_DONATION_URL && (
    <ExternalLink href={PAYPAL_DONATION_URL} className="vs-btn vs-btn-sm vs-btn-secondary">Fai una donazione</ExternalLink>
  )
  if (thanks) return (
    <div className="vs-update-notice" role="status" aria-live="polite">
      <div>
        <strong>La nuova versione di Referto Volley è stata aggiornata.</strong> Se il progetto ti piace e vuoi sostenerlo fai una donazione.
      </div>
      <div className="vs-update-actions">
        {donation}
        <button type="button" className="vs-btn vs-btn-sm vs-btn-secondary" onClick={() => setThanks(false)}>Chiudi</button>
      </div>
    </div>
  )
  if (!update || dismissed) return null
  const install = async () => {
    if (update.kind === 'mobile') {
      await openDownload(update.url).catch(() => setState('error'))
      return
    }
    setState('installing')
    try {
      await installUpdate(update, setProgress)
    } catch {
      setState('error')
    }
  }
  return (
    <div className="vs-update-notice" role="status" aria-live="polite">
      <div>
        <strong>Hai una nuova versione ({update.version}). Vuoi aggiornarla?</strong> Versione installata: {APP_VERSION}.
        {state === 'installing' && <span> {progress === null ? 'Scaricamento in corso…' : progress < 1 ? `Scaricamento ${Math.round(progress * 100)}%…` : 'Installazione: l’app si riavvierà.'}</span>}
        {state === 'error' && <span> Aggiornamento non riuscito: riprova più tardi o scarica la nuova versione dalla pagina delle release.</span>}
        {update.kind === 'mobile' && state !== 'error' && <span> Si apre il download: conferma l’installazione sul dispositivo.</span>}
      </div>
      <div className="vs-update-actions">
        <button type="button" className="vs-btn vs-btn-sm vs-btn-primary" disabled={state === 'installing'} onClick={install}>
          {update.kind === 'mobile' ? 'Scarica la nuova versione' : 'Aggiorna ora'}
        </button>
        {donation}
        <button type="button" className="vs-btn vs-btn-sm vs-btn-secondary" disabled={state === 'installing'} onClick={() => setDismissed(true)}>
          Più tardi
        </button>
      </div>
    </div>
  )
}

// "Informazioni" page: how updates work and the option to turn the check off (installed apps only)
export function UpdateSettings() {
  const [enabled, setEnabled] = useState(updateChecksEnabled)
  const app = isTauriApp()
  return (
    <div className="vs-card">
      <h2 className="vs-card-title">Aggiornamenti</h2>
      <p>
        Le app installate controllano all’avvio se c’è una nuova versione e ti avvisano: decidi tu se aggiornare.
        Viene letto da GitHub solo il numero dell’ultima versione, nessun dato delle gare lascia il dispositivo.
      </p>
      {app ? (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
          <input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setUpdateChecksEnabled(event.target.checked) }} />
          Controlla gli aggiornamenti all’avvio
        </label>
      ) : (
        <p className="vs-card-subtitle">Stai usando la versione web: non serve alcun aggiornamento.</p>
      )}
    </div>
  )
}
