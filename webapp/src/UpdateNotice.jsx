// Notice of a new version in the installed apps: the user decides whether to update.
import { useEffect, useState } from 'react'
import { APP_VERSION } from './version.js'
import { checkForUpdate, installUpdate, isTauriApp, openDownload, setUpdateChecksEnabled, updateChecksEnabled } from './updates.js'

export default function UpdateNotice() {
  const [update, setUpdate] = useState(null)
  const [state, setState] = useState('idle') // idle | installing | error
  const [progress, setProgress] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!updateChecksEnabled()) return
    let active = true
    // offline or GitHub not reachable: silently nothing
    checkForUpdate(APP_VERSION).then(found => { if (active) setUpdate(found) }).catch(() => {})
    return () => { active = false }
  }, [])

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
        <strong>È disponibile Referto Volley {update.version}</strong> (versione installata: {APP_VERSION}).
        {state === 'installing' && <span> {progress === null ? 'Scaricamento in corso…' : progress < 1 ? `Scaricamento ${Math.round(progress * 100)}%…` : 'Installazione: l’app si riavvierà.'}</span>}
        {state === 'error' && <span> Aggiornamento non riuscito: riprova più tardi o scarica la nuova versione dalla pagina delle release.</span>}
        {update.kind === 'mobile' && state !== 'error' && <span> Si apre il download: conferma l’installazione sul dispositivo.</span>}
      </div>
      <div className="vs-update-actions">
        <button type="button" className="vs-btn vs-btn-sm vs-btn-primary" disabled={state === 'installing'} onClick={install}>
          {update.kind === 'mobile' ? 'Scarica la nuova versione' : 'Aggiorna ora'}
        </button>
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
      <h2 className="vs-card-title">Aggiornamenti delle applicazioni</h2>
      <p>
        Le applicazioni per Windows, macOS, Linux, Android e iPhone controllano all’avvio se è uscita una nuova versione.
        Viene chiesto a GitHub solo il numero dell’ultima versione pubblicata: nessun dato delle gare lascia il dispositivo.
        Se c’è una novità compare un avviso e sei tu a decidere se aggiornare.
      </p>
      <p>
        Su Windows, macOS e Linux l’aggiornamento viene scaricato, verificato con la firma del progetto e installato, poi l’app si riavvia.
        Su Android e iPhone l’avviso apre il download della nuova versione, da installare come la prima volta. La versione web è sempre aggiornata.
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
