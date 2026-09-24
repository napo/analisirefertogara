import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, AriaComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { analyze, sum, validateMatch } from './analysis'
import { importPdf } from './pdf'
import { applySetter } from './pdf-parser'
import { backup, deleteMatch, listMatches, saveMany, saveMatch } from './storage'
import './App.css'
echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer])
const fmt = n => Number(n).toLocaleString('it-IT', { maximumFractionDigits: 2 })
function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a')
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const result = m => `${m.sets.filter(s => s.scoreOwn > s.scoreOther).length} – ${m.sets.filter(s => s.scoreOther > s.scoreOwn).length}`
function App() {
  const [matches, setMatches] = useState([]), [selected, setSelected] = useState('all'), [team, setTeam] = useState(''), [tab, setTab] = useState('analysis')
  const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [message, setMessage] = useState(''), [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState(null), [sourceUrl, setSourceUrl] = useState('')
  const upload = useRef(), restore = useRef()
  const refresh = async () => { const data = await listMatches(); setMatches(data.sort((a, b) => a.date.localeCompare(b.date))) }
  useEffect(() => { refresh().catch(e => setError(`Archivio non disponibile: ${e.message}`)).finally(() => setLoading(false)) }, [])
  useEffect(() => {
    if (!draft?.pdf) { setSourceUrl(''); return }
    const url = URL.createObjectURL(draft.pdf); setSourceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [draft?.pdf])
  const teams = [...new Set(matches.map(m => m.team))]
  const activeTeam = teams.includes(team) ? team : teams[0] || ''
  const teamMatches = matches.filter(m => m.team === activeTeam)
  const visible = useMemo(() => matches.filter(m => m.team === activeTeam && (selected === 'all' || m.id === selected)), [matches, activeTeam, selected])
  const computed = useMemo(() => { try { return { data: analyze(visible) } } catch (e) { return { error: e.message } } }, [visible])
  const data = computed.data
  async function readFile(file) {
    if (!file) return
    setBusy(true); setError(''); setMessage('')
    try {
      const m = await importPdf(file)
      if (matches.some(x => x.id === m.id)) throw Error('Questo PDF è già nello storico. Apri la gara per modificarla.')
      setDraft(applySetter(m))
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  async function persist() {
    const issues = validateMatch(draft)
    if (issues.length) { setError(issues.join(' ')); return }
    setBusy(true); setError('')
    try {
      analyze([draft]); await saveMatch(draft); await refresh(); setTeam(draft.team); setSelected(draft.id); setDraft(null); setTab('analysis'); setMessage('Gara salvata. Calcoli e storico aggiornati.')
    } catch (e) { setError(`Salvataggio non riuscito: ${e.message}`) } finally { setBusy(false) }
  }
  async function restoreBackup(file) {
    if (!file) return
    setBusy(true); setError('')
    try {
      if (file.size > 100 * 1024 * 1024) throw Error('Backup troppo grande (massimo 100 MB).')
      const b = JSON.parse(await file.text())
      if (b.version !== 1 || !Array.isArray(b.matches) || b.matches.length > 1000) throw Error('Formato backup non valido.')
      const incoming = []
      for (const m of b.matches) {
        if (!m || typeof m.id !== 'string' || !/^[a-f0-9]{64}$/.test(m.id) || validateMatch(m).length) throw Error('Il backup contiene gare non valide.')
        analyze([m])
        if (m.pdf && !/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(m.pdf)) throw Error('PDF del backup non valido.')
        const pdf = m.pdf ? new Blob([Uint8Array.from(atob(m.pdf.split(',')[1]), c => c.charCodeAt(0))], { type: 'application/pdf' }) : null
        if (!matches.some(x => x.id === m.id)) incoming.push({ ...m, pdf })
      }
      await saveMany(incoming); await refresh(); setMessage(`${incoming.length} gare ripristinate. Le gare già presenti sono state mantenute.`)
    } catch (e) { setError(`Ripristino non riuscito: ${e.message}`) } finally { setBusy(false) }
  }
  const baseChart = { color: ['#e96737', '#287882'], aria: { enabled: true }, tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { left: 48, right: 18, top: 24, bottom: 60 }, yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#eaf0eb' } } }, xAxis: { type: 'category', axisTick: { show: false }, axisLine: { lineStyle: { color: '#d4ded8' } } } }
  const rotationOption = data && { ...baseChart, xAxis: { ...baseChart.xAxis, data: data.rows.map(r => `P${r.rotation}`) }, series: [{ name: 'Punti al servizio', type: 'bar', barMaxWidth: 24, data: data.rows.map(r => r.points) }, { name: 'Subiti al servizio avversario', type: 'bar', barMaxWidth: 24, data: data.rows.map(r => r.conceded) }] }
  const single = visible.length === 1
  const trendEntries = single ? visible[0].sets.map((s, i) => ({ name: `Set ${i + 1}`, own: s.scoreOwn, other: s.scoreOther })) : visible.map(m => ({ name: `${m.date.slice(8)}/${m.date.slice(5, 7)} ${m.opponent}`, own: sum(m.sets.map(s => s.scoreOwn)), other: sum(m.sets.map(s => s.scoreOther)) }))
  const trendOption = { ...baseChart, xAxis: { ...baseChart.xAxis, data: trendEntries.map(e => e.name) }, series: [{ name: 'Punti fatti', type: single ? 'bar' : 'line', barMaxWidth: 28, data: trendEntries.map(e => e.own) }, { name: 'Punti subiti', type: single ? 'bar' : 'line', barMaxWidth: 28, data: trendEntries.map(e => e.other) }] }
  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">RV</span><div><span className="eyebrow">Il tuo archivio di gara</span><strong>Referto volley</strong></div></div><div className="top-actions"><span className="status-dot">Archivio locale · {matches.length} gare</span><button className="upload-button" disabled={busy || loading} onClick={() => upload.current.click()}>{busy ? 'Lettura in corso…' : '↑ Carica referto PDF'}</button></div></header>
    <input ref={upload} type="file" accept="application/pdf,.pdf" hidden onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }} />
    <input ref={restore} type="file" accept=".json,application/json" hidden onChange={e => { restoreBackup(e.target.files?.[0]); e.target.value = '' }} />
    <section className="hero"><div><p className="kicker">Dal referto alla lettura della partita</p><h1>Ogni rotazione.<br /><em>Una storia di punti.</em></h1><p className="hero-copy">Carica il PDF, ritrova i calcoli del modello di Andrea Fortunati e segui la tua squadra, gara dopo gara.</p></div><div className="hero-aside"><div className="hero-number">{data?.wins ?? '–'}<small> / {visible.length}</small></div><span>gare vinte nella selezione</span><div className="hero-line" /></div></section>
    <nav className="tabs" aria-label="Sezioni">{[['analysis', 'Analisi'], ['history', 'Storico gare'], ['model', 'Formule Excel']].map(([key, label]) => <button key={key} aria-current={tab === key ? 'page' : undefined} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {error && <div className="notice error" role="alert">{error}<button aria-label="Chiudi errore" onClick={() => setError('')}>×</button></div>}
    {message && <div className="notice" role="status">{message}</div>}
    {loading && <p>Caricamento archivio…</p>}
    {draft && <section className="review"><div className="section-heading"><div><p className="kicker">Verifica importazione</p><h2>{draft.fileName}</h2></div><button onClick={() => { setDraft(null); setError('') }}>Annulla</button></div>
      <p>I progressivi arrivano dal PDF. Indica la posizione iniziale del palleggiatore (P) in ogni set, oppure ricavala dal numero di maglia. Poi salva la gara.</p>
      <div className="review-fields"><label>Squadra analizzata<select value="own" onChange={() => setDraft(d => applySetter({ ...d, team: d.opponent, opponent: d.team, sets: d.sets.map(s => ({ ...s, own: s.other, other: s.own, scoreOwn: s.scoreOther, scoreOther: s.scoreOwn, lineup: s.opponentLineup, opponentLineup: s.lineup, rotation: '' })) }))}><option value="own">{draft.team}</option><option value="other">{draft.opponent}</option></select></label><label>Data<input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label><label>Maglia palleggiatore<input type="number" min="1" max="99" placeholder="Es. 6" onChange={e => { const jersey = e.target.value; setDraft(d => ({ ...d, sets: d.sets.map(s => { const index = s.lineup.findIndex(n => String(n) === jersey); return { ...s, rotation: index >= 0 ? index + 1 : '' } }) })) }} /></label>{sourceUrl && <a className="button-link" href={sourceUrl} target="_blank" rel="noreferrer">Apri PDF originale ↗</a>}</div>
      {draft.sets.map((s, index) => <SetEditor key={`${draft.team}-${index}`} set={s} index={index} team={draft.team} opponent={draft.opponent} update={patch => setDraft(d => ({ ...d, sets: d.sets.map((v, i) => i === index ? { ...v, ...patch } : v) }))} />)}
      {validateMatch(draft).length > 0 && <ul className="validation">{validateMatch(draft).map(v => <li key={v}>{v}</li>)}</ul>}
      <div className="review-footer"><span>I dati e il PDF saranno conservati in questo browser.</span><button className="upload-button" disabled={busy || validateMatch(draft).length > 0} onClick={persist}>Salva e calcola</button></div>
    </section>}
    {!matches.length && !draft && !loading && <section className="empty" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]) }}><span className="empty-icon">↑</span><h2>La prossima analisi inizia qui.</h2><p>Trascina un referto PDF SNUG oppure selezionalo dal computer.<br />Punteggi, formazioni e turni di servizio vengono letti automaticamente.</p><button className="upload-button" disabled={busy} onClick={() => upload.current.click()}>Scegli un PDF</button><button className="text-button" onClick={() => restore.current.click()}>Ripristina un archivio</button><small>Nessun dato dimostrativo. Il tuo archivio è ancora vuoto.</small></section>}
    {matches.length > 0 && <section className="toolbar"><label className="select-wrap">Squadra<select value={activeTeam} onChange={e => { setTeam(e.target.value); setSelected('all') }}>{teams.map(t => <option key={t}>{t}</option>)}</select></label><label className="select-wrap">Gara<select value={selected} onChange={e => setSelected(e.target.value)}><option value="all">Tutte le gare</option>{teamMatches.map(m => <option value={m.id} key={m.id}>{m.date} · {m.opponent}</option>)}</select></label><span className="source-note">{visible.length} gare nella selezione</span></section>}
    {computed.error && <p className="notice error">Il modello non può calcolare questi dati: {computed.error}</p>}
    {tab === 'analysis' && visible.length > 0 && data && <>
      <section className="metrics-grid"><Metric label="Punti fatti" value={data.scored} detail="tutti i punti del referto" accent="orange" /><Metric label="Punti subiti" value={data.conceded} detail="tutti i punti del referto" accent="teal" /><Metric label="Punti al servizio" value={data.breakPoints} detail="TPF del modello Excel" accent="ink" /><Metric label="Differenziale" value={`${data.scored - data.conceded > 0 ? '+' : ''}${data.scored - data.conceded}`} detail="punti fatti meno subiti" accent="sand" /></section>
      <section className="charts-grid"><Chart title="Rendimento per rotazione" subtitle="Punti al servizio e subiti al servizio avversario · formule Excel" option={rotationOption} /><Chart title={single ? 'Il risultato dei set' : 'Andamento delle gare'} subtitle="Punteggio completo del referto" option={trendOption} /></section>
      <section className="table-panel"><h2>Le sei rotazioni, a confronto</h2><p>TT = turni · TP = punti al servizio · MP = punti medi per turno.</p><div className="table-scroll"><table><thead><tr><th>Rotazione</th><th>TT fatti</th><th>TP fatti</th><th>MP fatti</th><th>% punti</th><th>TT subiti</th><th>TP subiti</th><th>MP subiti</th></tr></thead><tbody>{data.rows.map(r => <tr key={r.rotation}><th>P{r.rotation}</th>{[r.turns, r.points, r.mean, r.share, r.concededTurns, r.conceded, r.concededMean].map((v, i) => <td key={i}>{fmt(v)}{i === 3 ? '%' : ''}</td>)}</tr>)}</tbody></table></div><p className="footnote">L’Excel sottrae il punto di cambio palla dai progressivi: TPF e TPS non coincidono con il punteggio finale della partita.</p></section>
    </>}
    {tab === 'history' && <section className="table-panel"><div className="section-heading"><div><p className="kicker">Registro gare</p><h2>Il tuo storico</h2></div><div className="action-group"><button disabled={busy || !matches.length} onClick={async () => { try { download(await backup(matches), 'referto-volley-backup.json') } catch(e) { setError(e.message) } }}>Esporta backup</button><button disabled={busy} onClick={() => restore.current.click()}>Ripristina backup</button></div></div><p>Archivio salvato in questo browser. Il backup include i PDF originali e consente di trasferire le gare su un altro computer.</p><div className="table-scroll"><table><thead><tr><th>Data</th><th>Gara</th><th>Set</th><th>Punteggi</th><th>Azioni</th></tr></thead><tbody>{[...visible].reverse().map(m => <tr key={m.id}><td>{m.date.split('-').reverse().join('/')}</td><th>{m.team} – {m.opponent}</th><td>{result(m)}</td><td>{m.sets.map(s => `${s.scoreOwn}-${s.scoreOther}`).join(' / ')}</td><td><div className="action-group"><button onClick={() => { setSelected(m.id); setTab('analysis') }}>Analizza</button><button onClick={() => { setDraft(structuredClone(m)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Modifica</button>{deleteId === m.id ? <><button className="danger" onClick={async () => { try { await deleteMatch(m.id); await refresh(); setSelected('all'); setDeleteId(null) } catch(e) { setError(e.message) } }}>Conferma eliminazione</button><button onClick={() => setDeleteId(null)}>Annulla</button></> : <button onClick={() => setDeleteId(m.id)}>Elimina</button>}</div></td></tr>)}</tbody></table></div></section>}
    {tab === 'model' && <section className="table-panel"><p className="kicker">Modello di Andrea Fortunati</p><h2>Le formule originali, ricalcolate.</h2><p>Le 14.867 formule del file Excel sono conservate nel progetto. Ogni gara alimenta il modello originale con i progressivi estratti dal PDF. Lo storico estende le somme del foglio Totali oltre le 15 gare previste nel file.</p><div className="notice">Due particolarità dell’originale sono mantenute: le percentuali %PT subiti della singola gara dividono per TPF; le righe %=0, %&gt;0 e %&gt;1 contano i totali per set, non i singoli turni. Non vengono corrette implicitamente.</div><p>La P identifica la posizione iniziale del palleggiatore. Il referto riporta i numeri di maglia, ma non il ruolo: questa informazione va indicata al controllo della gara.</p>{data && <FormulaTable data={data} hasMatches={visible.length > 0} />}</section>}
    <footer>Referto volley · Modello di calcolo di Andrea Fortunati <span>Elaborazione locale · Nessun caricamento su server</span></footer>
  </main>
}
function SetEditor({ set: s, index, team, opponent, update }) {
  return <details className="set-editor" open><summary>Set {index + 1} <strong>{s.scoreOwn} – {s.scoreOther}</strong></summary><div className="review-fields"><label>Posizione iniziale P<select value={s.rotation} onChange={e => update({ rotation: e.target.value ? +e.target.value : '' })}><option value="">Da indicare</option>{[1, 2, 3, 4, 5, 6].map(p => <option key={p} value={p}>P{p} · maglia {s.lineup[p - 1] || '?'}</option>)}</select></label><label>Punti {team}<input type="number" min="0" value={s.scoreOwn} onChange={e => update({ scoreOwn: e.target.value === '' ? '' : +e.target.value })} /></label><label>Punti {opponent}<input type="number" min="0" value={s.scoreOther} onChange={e => update({ scoreOther: e.target.value === '' ? '' : +e.target.value })} /></label></div><div className="grids">{[['own', team], ['other', opponent]].map(([key, name]) => <div key={key}><h3>{name}</h3><p className="footnote">Progressivi a fine turno · X = primo turno in ricezione</p><div className="table-scroll"><table className="input-grid"><thead><tr><th>Giro</th>{['I', 'II', 'III', 'IV', 'V', 'VI'].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, r) => <tr key={r}><th>{r + 1}</th>{Array.from({ length: 6 }, (_, c) => <td key={c}><input aria-label={`Set ${index + 1}, ${name}, giro ${r + 1}, colonna ${c + 1}`} value={s[key][r * 6 + c] ?? ''} maxLength={3} onChange={e => { const text = e.target.value.toUpperCase(); if (text !== '' && text !== 'X' && !/^\d+$/.test(text)) return; const arr = [...s[key]]; arr[r * 6 + c] = text === '' || text === 'X' ? text : +text; update({ [key]: arr }) }} /></td>)}</tr>)}</tbody></table></div></div>)}</div></details>
}
function FormulaTable({ data, hasMatches }) {
  const [sheetName, setSheetName] = useState('Totali'), [query, setQuery] = useState('')
  const names = Object.keys(data.sheets), sheet = names.includes(sheetName) ? sheetName : 'Totali'
  const cells = Object.entries(data.sheets[sheet]).filter(([ref, raw]) => typeof raw === 'string' && raw.startsWith('=') && `${ref} ${raw}`.toLowerCase().includes(query.toLowerCase()))
  return <><div className="review-fields"><label>Foglio<select value={sheet} onChange={e => setSheetName(e.target.value)}>{names.map(n => <option key={n}>{n}</option>)}</select></label><label>Cerca cella o formula<input value={query} placeholder="Es. BA10, COUNTIF…" onChange={e => setQuery(e.target.value)} /></label><button onClick={() => download(JSON.stringify(data.sheets, null, 2), 'formule-e-dati.json')}>Esporta formule e dati</button></div><p>{cells.length} formule · {hasMatches ? 'valori ricalcolati dalla selezione' : 'modello vuoto'}</p><div className="table-scroll formula-scroll"><table><thead><tr><th>Cella</th><th>Formula</th><th>Risultato</th></tr></thead><tbody>{cells.map(([ref, formula]) => { let value; try { value = data.engine.cell(sheet, ref) } catch(e) { value = e.message } return <tr key={ref}><th>{ref}</th><td><code>{formula}</code></td><td>{typeof value === 'number' ? fmt(value) : String(value)}</td></tr> })}</tbody></table></div></>
}
function Metric({ label, value, accent, detail }) { return <article className={`metric-card ${accent}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article> }
function Chart({ title, subtitle, option }) {
  const ref = useRef()
  useEffect(() => { const chart = echarts.init(ref.current); chart.setOption(option); const observer = new ResizeObserver(() => chart.resize()); observer.observe(ref.current); return () => { observer.disconnect(); chart.dispose() } }, [option])
  return <article className="chart-card"><div className="card-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div><div ref={ref} style={{ height: 300, width: '100%' }} role="img" aria-label={title} /></article>
}
export default App
