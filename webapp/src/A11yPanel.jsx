// "Accessibilità" button of the header and its panel: theme, colors for color vision deficiencies, text
// size, font, spacing, links and motion. Every change applies at once and stays on this device
// (a11y-settings.js); nothing about the matches is involved.
import { useId, useRef } from 'react'
import { useA11y } from './a11y.jsx'
import { FONTS, FONT_STACKS, PALETTES, TEXT_SCALES, THEMES, isDefault } from './a11y-settings.js'
import { themeColors } from './theme.js'
import './a11y.css'

const percent = scale => `${Math.round(scale * 100)}%`

// Universal access symbol (person in a circle)
function AccessIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="6.6" r="1.6" fill="currentColor" />
      <path d="M6.5 9.3c1.8.5 3.6.8 5.5.8s3.7-.3 5.5-.8M12 10.1v3.6m0 0-2.3 5m2.3-5 2.3 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The data colors of a palette, so the choice is made by looking at them
function Swatches({ palette, theme }) {
  const c = themeColors({ palette, theme: theme === 'dark' ? 'dark' : 'light' })
  const items = [
    [c.PHASE.BP, 'BP'], [c.PHASE.CP, 'CP'], [c.TREND.positive, '+'], [c.TREND.negative, '−'],
    ...Object.entries(c.ROTATION).map(([P, r]) => [r.fill, `P${P}`, r.text]),
  ]
  return (
    <span className="vs-a11y-swatches" aria-hidden="true">
      {items.map(([color, label, text]) => <i key={label} style={{ background: color, color: text || 'transparent' }}>{text ? label.slice(1) : ''}</i>)}
    </span>
  )
}

function Choice({ name, legend, options, value, onChange, render = null, hint = null }) {
  return (
    <fieldset className="vs-a11y-group">
      <legend>{legend}</legend>
      {hint && <p className="vs-a11y-hint">{hint}</p>}
      <div className="vs-a11y-options">
        {options.map(([key, label]) => (
          <label key={key} className={value === key ? 'selected' : undefined}>
            <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} />
            <span className="vs-a11y-label">{render ? render(key, label) : label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function A11yPanel() {
  const { settings, update, reset, theme } = useA11y()
  const dialogRef = useRef(null)
  const titleId = useId()
  const sizeId = useId()
  const index = TEXT_SCALES.indexOf(settings.textScale)
  const open = () => dialogRef.current?.showModal?.()
  const close = () => dialogRef.current?.close?.()
  const setScale = next => update({ textScale: TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, next))] })

  return (
    <>
      <button type="button" className="vs-a11y-button" onClick={open} aria-haspopup="dialog" title="Accessibilità: tema, colori, testo">
        <AccessIcon />
        <span>Accessibilità</span>
      </button>
      <dialog ref={dialogRef} className="vs-a11y-dialog" aria-labelledby={titleId}
        onClick={event => { if (event.target === dialogRef.current) close() }}>
        <div className="vs-a11y-panel">
          <div className="vs-a11y-head">
            <h2 id={titleId}>Accessibilità</h2>
            <button type="button" className="vs-a11y-close" onClick={close} aria-label="Chiudi il pannello Accessibilità">×</button>
          </div>
          <p className="vs-a11y-intro">Le modifiche si applicano subito e restano su questo dispositivo. Non riguardano i dati delle gare.</p>

          <Choice name="a11y-theme" legend="Tema" options={THEMES} value={settings.theme} onChange={value => update({ theme: value })}
            hint="“Come il dispositivo” segue la modalità chiara o scura e l’alto contrasto impostati nel sistema." />

          <Choice name="a11y-palette" legend="Colori dei dati" options={PALETTES} value={settings.palette} onChange={value => update({ palette: value })}
            hint="Colori di BP e CP, delle P, di positivo e negativo nei grafici e nelle tabelle, scelti per restare distinguibili con il tipo di daltonismo indicato."
            render={(key, label) => <><span>{label}</span><Swatches palette={key} theme={theme} /></>} />

          <fieldset className="vs-a11y-group">
            <legend>Dimensione del testo</legend>
            <div className="vs-a11y-size">
              <button type="button" onClick={() => setScale(index - 1)} disabled={index <= 0} aria-label="Riduci il testo">A−</button>
              <input id={sizeId} type="range" min="0" max={TEXT_SCALES.length - 1} step="1" value={index}
                onChange={event => setScale(Number(event.target.value))} aria-valuetext={percent(settings.textScale)} aria-label="Dimensione del testo" />
              <button type="button" onClick={() => setScale(index + 1)} disabled={index >= TEXT_SCALES.length - 1} aria-label="Ingrandisci il testo">A+</button>
              <output htmlFor={sizeId}>{percent(settings.textScale)}</output>
            </div>
          </fieldset>

          <Choice name="a11y-font" legend="Carattere" options={FONTS} value={settings.font} onChange={value => update({ font: value })}
            render={(key, label) => <span style={{ fontFamily: FONT_STACKS[key] }}>{label}</span>} />

          <fieldset className="vs-a11y-group">
            <legend>Lettura</legend>
            <label className="vs-a11y-check">
              <input type="checkbox" checked={settings.spacing} onChange={event => update({ spacing: event.target.checked })} />
              Spaziatura ampia tra lettere, parole e righe
            </label>
            <label className="vs-a11y-check">
              <input type="checkbox" checked={settings.underlineLinks} onChange={event => update({ underlineLinks: event.target.checked })} />
              Sottolinea sempre i collegamenti
            </label>
            <label className="vs-a11y-check">
              <input type="checkbox" checked={settings.motion === 'reduce'} onChange={event => update({ motion: event.target.checked ? 'reduce' : 'system' })} />
              Riduci animazioni e scorrimenti
            </label>
          </fieldset>

          <p className="vs-a11y-hint">Il report PDF usa sempre il tema chiaro e la dimensione standard del testo, con i colori dei dati e il carattere scelti.</p>
          <div className="vs-a11y-actions">
            <button type="button" className="vs-btn vs-btn-secondary" onClick={reset} disabled={isDefault(settings)}>Ripristina le impostazioni predefinite</button>
            <button type="button" className="vs-btn vs-btn-primary" onClick={close}>Chiudi</button>
          </div>
        </div>
      </dialog>
    </>
  )
}
