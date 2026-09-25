import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, AriaComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { MatchStoreProvider, useMatchStore } from './store'
import { applySetter } from './pdf-parser'
import { validateMatch } from './analysis'
import { VolleyScoresheetLogo } from './Logo'
import './App.css'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer])

const fmt = n => Number(n).toLocaleString('it-IT', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const rosterPlayer = player => typeof player === 'object' ? player : { number: player, name: '' }
const formatDuration = minutes => {
  if (minutes === '' || minutes === null || minutes === undefined) return '–'
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return '–'
  const hours = Math.floor(value / 60)
  const mins = value % 60
  if (!hours) return `${mins} min`
  if (!mins) return `${hours}h`
  return `${hours}h ${mins}m`
}
const resultStr = m => `${m.sets.filter(s => s.scoreOwn > s.scoreOther).length} – ${m.sets.filter(s => s.scoreOther > s.scoreOwn).length}`

function MainApp() {
  const {
    matches,
    teams,
    activeTeam,
    setSelectedTeam,
    selectedMatchId,
    setSelectedMatchId,
    latestMatchId,
    selectedMatchIds,
    setSelectedMatchIds,
    sortedTeamMatches,
    selectMatchesForAnalysis,
    toggleMatchSelection,
    teamMatches,
    visibleMatches,
    aggregatedAnalysis,
    activeTab,
    setActiveTab,
    draft,
    setDraft,
    loading,
    busy,
    message,
    setMessage,
    error,
    setError,
    readPdfFile,
    startManualEntry,
    addSetToDraft,
    removeLastSetFromDraft,
    saveDraft,
    deleteMatch,
    exportBackup,
    restoreBackup,
  } = useMatchStore()

  const fileInputRef = useRef(null)
  const backupInputRef = useRef(null)
  const reportExportRef = useRef(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [showMatchPicker, setShowMatchPicker] = useState(false)
  const [selectedHistoryIds, setSelectedHistoryIds] = useState([])

  // Export report area to PDF
  const exportToPdf = async () => {
    if (!reportExportRef.current) return
    setExportingPdf(true)
    try {
      const el = reportExportRef.current
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210
      const pageHeight = 297
      const margin = 10
      const printWidth = pageWidth - margin * 2
      const printHeight = (canvas.height * printWidth) / canvas.width

      let heightLeft = printHeight
      let position = margin

      pdf.addImage(imgData, 'PNG', margin, position, printWidth, printHeight)
      heightLeft -= (pageHeight - margin * 2)

      while (heightLeft > 0) {
        position = position - (pageHeight - margin * 2)
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', margin, position, printWidth, printHeight)
        heightLeft -= (pageHeight - margin * 2)
      }

      const matchLabel = visibleMatches.length === 1 && visibleMatches[0]
        ? `${visibleMatches[0].team}_vs_${visibleMatches[0].opponent}_${visibleMatches[0].date}`
        : `${activeTeam}_Aggregato_${visibleMatches.length}_Gare`
      const filename = `Report-Referto-Volley-${matchLabel.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`
      pdf.save(filename)
      setMessage(`Report PDF esportato con successo: ${filename}`)
    } catch (err) {
      console.error('Errore esportazione PDF:', err)
      setError(`Errore durante l'esportazione del PDF: ${err.message}`)
    } finally {
      setExportingPdf(false)
    }
  }

  // ECharts default styling for Referto Volley
  const baseChart = useMemo(() => ({
    color: ['#011627', '#E65100', '#028090'],
    aria: { enabled: true },
    tooltip: {
      trigger: 'axis',
      textStyle: { fontFamily: 'Roboto, sans-serif' },
    },
    legend: {
      bottom: 0,
      textStyle: { fontFamily: 'Rubik, sans-serif', color: '#505050' },
    },
    grid: { left: 45, right: 20, top: 25, bottom: 50 },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#E5E7EB' } },
      axisLabel: { color: '#7D7D7D', fontVariantNumeric: 'tabular-nums' },
    },
    xAxis: {
      type: 'category',
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#D1D5DB' } },
      axisLabel: { color: '#383838', fontFamily: 'Rubik, sans-serif' },
    },
  }), [])

  // Rotation Chart Option
  const rotationOption = useMemo(() => {
    if (!aggregatedAnalysis || !aggregatedAnalysis.rows) return null
    return {
      ...baseChart,
      xAxis: {
        ...baseChart.xAxis,
        data: aggregatedAnalysis.rows.map(r => `P${r.rotation}`),
      },
      series: [
        {
          name: 'Punti in fase break point (BP)',
          type: 'bar',
          barMaxWidth: 24,
          data: aggregatedAnalysis.rows.map(r => r.points),
        },
        {
          name: 'Punti subiti al serv. avv. (TPS)',
          type: 'bar',
          barMaxWidth: 24,
          data: aggregatedAnalysis.rows.map(r => r.conceded),
        },
      ],
    }
  }, [aggregatedAnalysis, baseChart])

  // Trend / Set Chart Option
  const isSingleMatch = visibleMatches.length === 1
  const totalDurationMinutes = useMemo(() => {
    if (!isSingleMatch || !visibleMatches[0]) return null
    const durations = visibleMatches[0].sets
      .map(set => Number(set.durationMinutes))
      .filter(value => Number.isFinite(value) && value > 0)
    if (!durations.length) return null
    return durations.reduce((total, value) => total + value, 0)
  }, [visibleMatches, isSingleMatch])
  const trendEntries = useMemo(() => {
    if (isSingleMatch) {
      return visibleMatches[0].sets.map((s, i) => ({
        name: `Set ${i + 1}`,
        own: s.scoreOwn,
        other: s.scoreOther,
      }))
    }
    return visibleMatches.map(m => {
      const day = m.date.slice(8)
      const month = m.date.slice(5, 7)
      const ownSum = m.sets.reduce((acc, s) => acc + s.scoreOwn, 0)
      const otherSum = m.sets.reduce((acc, s) => acc + s.scoreOther, 0)
      return {
        name: `${day}/${month} vs ${m.opponent.slice(0, 10)}`,
        own: ownSum,
        other: otherSum,
      }
    })
  }, [visibleMatches, isSingleMatch])

  const trendOption = useMemo(() => {
    if (!trendEntries.length) return null
    return {
      ...baseChart,
      xAxis: {
        ...baseChart.xAxis,
        data: trendEntries.map(e => e.name),
      },
      series: [
        {
          name: 'Punti fatti',
          type: isSingleMatch ? 'bar' : 'line',
          barMaxWidth: 26,
          data: trendEntries.map(e => e.own),
        },
        {
          name: 'Punti subiti',
          type: isSingleMatch ? 'bar' : 'line',
          barMaxWidth: 26,
          data: trendEntries.map(e => e.other),
        },
      ],
    }
  }, [baseChart, trendEntries, isSingleMatch])

  return (
    <div>
      {/* 1. TOP BAR CONTRACT */}
      <header className="vs-navbar">
        <div className="vs-navbar-inner">
          {/* Zone 1: Single element wordmark with custom volleyball and scoresheet logo */}
          <a href="/" className="vs-brand" onClick={(e) => { e.preventDefault(); setActiveTab('reports'); }}>
            <VolleyScoresheetLogo size={34} />
            <span>Referto Volley</span>
          </a>

          {/* Zone 2: Navigation Links / Tabs (Strictly named) */}
          <nav aria-label="Navigazione principale">
            <ul className="vs-nav-tabs">
              <li>
                <button
                  type="button"
                  className={`vs-nav-item ${activeTab === 'reports' ? 'active' : ''}`}
                  onClick={() => setActiveTab('reports')}
                >
                  Referti di gara
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`vs-nav-item ${activeTab === 'analysis' ? 'active' : ''}`}
                  onClick={() => setActiveTab('analysis')}
                >
                  Analisi referto
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`vs-nav-item ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => setActiveTab('history')}
                >
                  Storico gare
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`vs-nav-item ${activeTab === 'info' ? 'active' : ''}`}
                  onClick={() => setActiveTab('info')}
                >
                  Info
                </button>
              </li>
            </ul>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="vs-nav-actions">
            <button
              type="button"
              className="vs-btn vs-btn-primary"
              disabled={busy || loading}
              onClick={() => {
                setActiveTab('reports')
                if (fileInputRef.current) fileInputRef.current.click()
              }}
            >
              + Carica referto PDF
            </button>
          </div>
        </div>
      </header>

      {/* Hidden file pickers */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) readPdfFile(e.target.files[0])
          e.target.value = ''
        }}
      />
      <input
        ref={backupInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) restoreBackup(e.target.files[0])
          e.target.value = ''
        }}
      />

      <main className="vs-shell">
        {/* HERO / WELCOME AREA: si riduce quando si compila o verifica una gara */}
        {draft && activeTab === 'reports' ? (
          <section className="vs-hero-compact">
            <div className="vs-hero-compact-inner">
              <div>
                <div className="vs-eyebrow" style={{ marginBottom: '0.2rem' }}>Analisi del referto di gara</div>
                <h1 className="vs-hero-compact-title">
                  {draft.isManual ? 'Compilazione manuale della gara' : 'Verifica referto e rotazioni'}
                  {draft.team && draft.opponent && (
                    <span style={{ fontWeight: 500, color: 'var(--vs-muted)', marginLeft: '0.65rem', fontSize: '1.05rem' }}>
                      ({draft.team} vs {draft.opponent})
                    </span>
                  )}
                </h1>
              </div>
              <button
                type="button"
                className="vs-btn vs-btn-sm vs-btn-secondary"
                onClick={() => { setDraft(null); setError(''); }}
              >
                ← Annulla e torna alla selezione
              </button>
            </div>
          </section>
        ) : (
          <section className="vs-hero">
            <div className="vs-eyebrow">Analisi del referto di gara</div>
            <h1 className="vs-hero-title">La prestazione della squadra attraverso il referto di gara</h1>
            <p className="vs-hero-lead">
              Il referto di gara è la prima traccia di dati che ci permette di leggere una prestazione sportiva. Dietro ogni numero e turno di battuta del referto federale c&apos;è la storia reale del rendimento della squadra.
              Carica il PDF per analizzare l&apos;efficienza delle sei rotazioni, i punti conquistati al servizio, l&apos;andamento dei set ed altro ancora.
            </p>
            <div className="vs-metadata-line">
              <span>Archivio locale attivo</span>
              <span aria-hidden="true">·</span>
              <span>{matches.length} {matches.length === 1 ? 'gara salvata' : 'gare salvate'}</span>
              <span aria-hidden="true">·</span>
              <span>Salvataggio persistente in React Store (IndexedDB)</span>
            </div>
          </section>
        )}

        {/* NOTICES */}
        {error && (
          <div className="vs-notice vs-notice-error" role="alert">
            <span>{error}</span>
            <button type="button" className="vs-notice-close" onClick={() => setError('')} aria-label="Chiudi avviso">
              ×
            </button>
          </div>
        )}

        {message && (
          <div className="vs-notice" role="status">
            <span>{message}</span>
            <button type="button" className="vs-notice-close" onClick={() => setMessage('')} aria-label="Chiudi messaggio">
              ×
            </button>
          </div>
        )}

        {loading && <p>Caricamento archivio locale in corso…</p>}

        {/* TAB 1: REFERTI DI GARA */}
        {activeTab === 'reports' && (
          <section>
            {/* If there is a draft being reviewed, show the verification form */}
            {draft && (
              <DraftReviewCard
                draft={draft}
                setDraft={setDraft}
                onCancel={() => { setDraft(null); setError(''); }}
                onSave={saveDraft}
                onAddSet={addSetToDraft}
                onRemoveSet={removeLastSetFromDraft}
                busy={busy}
              />
            )}

            {/* Dropzone Uploader (nascosto se stiamo compilando un draft per mantenere il focus) */}
            {!draft && (
              <div
                className="vs-dropzone"
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                onDragLeave={(e) => { e.currentTarget.classList.remove('dragover'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('dragover');
                  if (e.dataTransfer.files?.[0]) readPdfFile(e.dataTransfer.files[0]);
                }}
                onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}
              >
                <div className="vs-dropzone-icon">↑</div>
                <h2 className="vs-dropzone-title">Carica un referto di gara (PDF)</h2>
                <p className="vs-dropzone-text">
                  Trascina qui il file PDF oppure clicca per selezionarlo dal tuo computer.
                </p>
                <div className="vs-dropzone-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="vs-btn vs-btn-primary"
                    disabled={busy}
                    onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}
                  >
                    {busy ? 'Lettura in corso…' : 'Seleziona file PDF'}
                  </button>
                  <button
                    type="button"
                    className="vs-btn vs-btn-secondary"
                    disabled={busy}
                    onClick={() => startManualEntry()}
                  >
                    Compila manualmente
                  </button>
                </div>
                <div style={{ marginTop: '1rem', fontSize: '0.82rem', color: 'var(--vs-muted)' }}>
                  <span>Modelli PDF supportati: SNUG</span>
                </div>
              </div>
            )}

            {/* List of uploaded PDF reports */}
            <div className="vs-card">
              <div className="vs-card-header">
                <div>
                  <h2 className="vs-card-title">Referti memorizzati nello store locale</h2>
                  <p className="vs-card-subtitle">
                    Tutti i file PDF originali e i dati estratti sono salvati direttamente nel tuo browser.
                  </p>
                </div>
                <span className="vs-btn vs-btn-sm vs-btn-secondary" style={{ cursor: 'default' }}>
                  {matches.length} referti archiviati
                </span>
              </div>

              {!matches.length ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--vs-muted)' }}>
                  <p style={{ margin: '0 0 1rem' }}>Nessun referto caricato al momento.</p>
                  <button
                    type="button"
                    className="vs-btn vs-btn-sm vs-btn-primary"
                    onClick={() => startManualEntry()}
                  >
                    Compila una gara manualmente
                  </button>
                </div>
              ) : (
                <div className="vs-table-wrap">
                  <table className="vs-table">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Gara</th>
                        <th>Risultato</th>
                        <th>File originale</th>
                        <th className="num-cell-header">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map((m) => {
                        const day = m.date.slice(8)
                        const month = m.date.slice(5, 7)
                        const year = m.date.slice(0, 4)
                        return (
                          <tr key={m.id}>
                            <td className="tabular-nums" style={{ fontWeight: 600 }}>{`${day}/${month}/${year}`}</td>
                            <td>
                              <strong style={{ color: 'var(--vs-heading)' }}>{m.team}</strong> vs {m.opponent}
                              {(m.location || m.venue) && (
                                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--vs-muted)' }}>
                                  📍 {[m.location, m.venue].filter(Boolean).join(' · ')}
                                </span>
                              )}
                              {m.referees?.first && (
                                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--vs-muted)' }}>
                                  1° Arb: {m.referees.first} {m.referees.scorer ? `· Segn: ${m.referees.scorer}` : ''}
                                </span>
                              )}
                            </td>
                            <td className="tabular-nums">
                              <span style={{ fontWeight: 700, color: 'var(--vs-heading)' }}>{resultStr(m)}</span>
                              <span style={{ color: 'var(--vs-muted)', marginLeft: '6px', fontSize: '0.8rem' }}>
                                ({m.sets.map(s => `${s.scoreOwn}-${s.scoreOther}`).join(', ')})
                              </span>
                            </td>
                            <td style={{ fontSize: '0.85rem', color: 'var(--vs-muted)' }}>
                              {m.fileName || 'referto.pdf'}
                            </td>
                            <td className="num-cell">
                              <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                <button
                                  type="button"
                                  className="vs-btn vs-btn-sm vs-btn-primary"
                                  onClick={() => {
                                    setSelectedTeam(m.team)
                                    setSelectedMatchId(m.id)
                                    setActiveTab('analysis')
                                  }}
                                >
                                  Analisi ↗
                                </button>
                                <button
                                  type="button"
                                  className="vs-btn vs-btn-sm vs-btn-secondary"
                                  title={`Inverti per analizzare ${m.opponent}`}
                                  onClick={() => {
                                    setDraft({
                                      ...m,
                                      team: m.opponent,
                                      opponent: m.team,
                                      roster: m.opponentRoster || [],
                                      opponentRoster: m.roster || [],
                                      sets: m.sets.map(s => ({
                                        ...s,
                                        own: s.other,
                                        other: s.own,
                                        scoreOwn: s.scoreOther,
                                        scoreOther: s.scoreOwn,
                                        lineup: s.opponentLineup,
                                        opponentLineup: s.lineup,
                                        rotation: '',
                                      })),
                                    })
                                    setActiveTab('reports')
                                  }}
                                >
                                  ⇄ Inverti
                                </button>
                                {m.pdf && (
                                  <button
                                    type="button"
                                    className="vs-btn vs-btn-sm vs-btn-secondary"
                                    onClick={() => {
                                      const url = URL.createObjectURL(m.pdf)
                                      window.open(url, '_blank')
                                      setTimeout(() => URL.revokeObjectURL(url), 10000)
                                    }}
                                  >
                                    Apri PDF
                                  </button>
                                )}
                                {deleteConfirmId === m.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="vs-btn vs-btn-sm vs-btn-danger"
                                      onClick={() => {
                                        deleteMatch(m.id)
                                        setDeleteConfirmId(null)
                                      }}
                                    >
                                      Conferma
                                    </button>
                                    <button
                                      type="button"
                                      className="vs-btn vs-btn-sm vs-btn-secondary"
                                      onClick={() => setDeleteConfirmId(null)}
                                    >
                                      Annulla
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="vs-btn vs-btn-sm vs-btn-secondary"
                                    onClick={() => setDeleteConfirmId(m.id)}
                                  >
                                    Elimina
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 2: ANALISI REFERTO */}
        {activeTab === 'analysis' && (
          <section>
            {/* Filter toolbar */}
            {matches.length > 0 && (
              <div className="vs-toolbar" style={{ flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="vs-toolbar-group" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
                  <label className="vs-select-wrap">
                    <span>Squadra analizzata:</span>
                    <select
                      value={activeTeam}
                      onChange={(e) => {
                        setSelectedTeam(e.target.value)
                        setSelectedMatchId('all')
                        setShowMatchPicker(false)
                      }}
                    >
                      {teams.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </label>

                  <label className="vs-select-wrap">
                    <span>Gara:</span>
                    <select
                      value={selectedMatchId}
                      onChange={(e) => {
                        setSelectedMatchId(e.target.value)
                        if (e.target.value !== 'custom') setShowMatchPicker(false)
                      }}
                    >
                      {/* Mostra prima l'ultima gara caricata o salvata */}
                      {(() => {
                        const latest = teamMatches.find(m => m.id === latestMatchId)
                        if (!latest) return null
                        return (
                          <option value={latest.id}>
                            ★ Ultima gara: {latest.date} vs {latest.opponent} ({resultStr(latest)})
                          </option>
                        )
                      })()}
                      <option value="all">Tutte le gare aggregate ({teamMatches.length})</option>
                      {selectedMatchIds.length > 1 && (
                        <option value="custom">Gare selezionate ({selectedMatchIds.length} gare)</option>
                      )}
                      {sortedTeamMatches.map(m => {
                        if (latestMatchId && m.id === latestMatchId) return null
                        return (
                          <option key={m.id} value={m.id}>
                            {m.date} vs {m.opponent} ({resultStr(m)})
                          </option>
                        )
                      })}
                    </select>
                  </label>

                  <button
                    type="button"
                    className={`vs-btn vs-btn-sm ${showMatchPicker || selectedMatchId === 'custom' ? 'vs-btn-primary' : 'vs-btn-secondary'}`}
                    onClick={() => setShowMatchPicker(!showMatchPicker)}
                    title="Seleziona e combina più gare da aggregare"
                  >
                    ☑ Scegli gare da aggregare {selectedMatchId === 'custom' && selectedMatchIds.length > 0 ? `(${selectedMatchIds.length})` : ''}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="vs-metadata-line">
                    <span>{visibleMatches.length} {visibleMatches.length === 1 ? 'gara nella selezione' : 'gare nella selezione'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{visibleMatches.reduce((acc, m) => acc + m.sets.length, 0)} set analizzati</span>
                  </div>

                  <button
                    type="button"
                    className="vs-btn vs-btn-primary"
                    disabled={exportingPdf || !aggregatedAnalysis?.rows}
                    onClick={exportToPdf}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                  >
                    {exportingPdf ? 'Esportazione in corso…' : '📄 Esporta report PDF'}
                  </button>
                </div>
              </div>
            )}

            {/* Pannello selezione multipla gare per aggregazione */}
            {showMatchPicker && matches.length > 0 && (
              <div
                style={{
                  background: 'var(--vs-surface)',
                  border: '1px solid var(--vs-border)',
                  borderRadius: 'var(--vs-radius)',
                  padding: '1rem 1.25rem',
                  marginBottom: '1.25rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--vs-heading)' }}>
                      Seleziona le gare di {activeTeam} da aggregare:
                    </strong>
                    <span style={{ fontSize: '0.82rem', color: 'var(--vs-muted)', marginLeft: '0.5rem' }}>
                      (le statistiche e i grafici si aggiornano sommando i turni delle gare scelte)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="vs-btn vs-btn-sm vs-btn-secondary"
                      onClick={() => {
                        setSelectedMatchIds(teamMatches.map(m => m.id))
                        setSelectedMatchId('all')
                      }}
                    >
                      Tutte
                    </button>
                    <button
                      type="button"
                      className="vs-btn vs-btn-sm vs-btn-secondary"
                      onClick={() => {
                        setSelectedMatchIds([])
                        if (teamMatches[0]) setSelectedMatchId(teamMatches[0].id)
                      }}
                    >
                      Reimposta
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.5rem' }}>
                  {teamMatches.map(m => {
                    const isChecked = selectedMatchId === 'all'
                      ? true
                      : selectedMatchId === 'custom'
                        ? selectedMatchIds.includes(m.id)
                        : selectedMatchId === m.id
                    return (
                      <label
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.86rem',
                          cursor: 'pointer',
                          padding: '0.4rem 0.6rem',
                          borderRadius: '0.4rem',
                          background: isChecked ? 'var(--vs-orange-soft)' : '#FAFAFA',
                          border: isChecked ? '1px solid rgba(230, 81, 0, 0.3)' : '1px solid var(--vs-border)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMatchSelection(m.id)}
                        />
                        <span style={{ fontWeight: isChecked ? 600 : 400, color: 'var(--vs-heading)' }}>
                          {m.date} vs {m.opponent}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--vs-muted)', marginLeft: 'auto' }}>
                          ({resultStr(m)})
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            {!matches.length ? (
              <div className="vs-card" style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
                <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Nessuna analisi disponibile</h2>
                <p style={{ color: 'var(--vs-muted)', maxWidth: '420px', margin: '0 auto 1.5rem' }}>
                  Carica un referto di gara in formato PDF per visualizzare l&apos;analisi automatica del rendimento per rotazione.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="vs-btn vs-btn-primary"
                    onClick={() => {
                      setActiveTab('reports')
                      if (fileInputRef.current) fileInputRef.current.click()
                    }}
                  >
                    Carica referto PDF
                  </button>
                  <button
                    type="button"
                    className="vs-btn vs-btn-secondary"
                    onClick={() => startManualEntry()}
                  >
                    Compila manualmente
                  </button>
                </div>
              </div>
            ) : aggregatedAnalysis && aggregatedAnalysis.rows ? (
              <div ref={reportExportRef} className="vs-report-export-container">
                {/* Header per esportazione PDF / Stampa */}
                <div className="vs-export-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                    <VolleyScoresheetLogo size={36} />
                    <span style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--vs-heading)', letterSpacing: '-0.02em' }}>
                      Referto Volley
                    </span>
                  </div>
                  <div style={{ fontSize: '0.92rem', color: 'var(--vs-muted)', fontWeight: 500 }}>
                    La prestazione della squadra attraverso il referto di gara
                  </div>
                </div>

                {/* Blocco Squadra analizzata / Info gara o aggregato */}
                {isSingleMatch && visibleMatches[0] ? (
                  <div
                    style={{
                      background: 'var(--vs-surface)',
                      border: '1px solid var(--vs-border)',
                      borderRadius: 'var(--vs-radius)',
                      padding: '0.85rem 1.25rem',
                      marginBottom: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      fontSize: '0.86rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--vs-heading)' }}>
                        {visibleMatches[0].team} vs {visibleMatches[0].opponent}
                      </span>
                      <span style={{ color: 'var(--vs-muted)' }}>
                        📅 {visibleMatches[0].date.slice(8)}/{visibleMatches[0].date.slice(5, 7)}/{visibleMatches[0].date.slice(0, 4)}
                      </span>
                      {(visibleMatches[0].location || visibleMatches[0].venue) && (
                        <span style={{ color: 'var(--vs-muted)' }}>
                          📍 {[visibleMatches[0].location, visibleMatches[0].venue].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {visibleMatches[0].referees?.first && (
                        <span style={{ color: 'var(--vs-muted)' }}>
                          👨‍⚖️ 1° Arb: {visibleMatches[0].referees.first} {visibleMatches[0].referees.scorer ? `(Segn: ${visibleMatches[0].referees.scorer})` : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <button
                        type="button"
                        className="vs-btn vs-btn-sm vs-btn-secondary"
                        title="Inverti l'analisi per analizzare la squadra avversaria"
                        onClick={() => {
                          const cur = visibleMatches[0]
                          const inverted = {
                            ...cur,
                            team: cur.opponent,
                            opponent: cur.team,
                            roster: cur.opponentRoster || [],
                            opponentRoster: cur.roster || [],
                            sets: cur.sets.map(s => ({
                              ...s,
                              own: s.other,
                              other: s.own,
                              scoreOwn: s.scoreOther,
                              scoreOther: s.scoreOwn,
                              lineup: s.opponentLineup,
                              opponentLineup: s.lineup,
                              rotation: '',
                            })),
                          }
                          setDraft(inverted)
                          setActiveTab('reports')
                        }}
                      >
                        ⇄ Analizza {visibleMatches[0].opponent}
                      </button>
                      <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--vs-orange)', fontSize: '0.95rem' }}>
                        Risultato: {resultStr(visibleMatches[0])} ({visibleMatches[0].sets.map(s => `${s.scoreOwn}-${s.scoreOther}`).join(', ')})
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'var(--vs-surface)',
                      border: '1px solid var(--vs-border)',
                      borderRadius: 'var(--vs-radius)',
                      padding: '0.85rem 1.25rem',
                      marginBottom: '1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                      flexWrap: 'wrap',
                      fontSize: '0.88rem',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--vs-heading)', display: 'block', marginBottom: '0.2rem' }}>
                        Analisi aggregata: {activeTeam}
                      </span>
                      <span style={{ color: 'var(--vs-muted)' }}>
                        {visibleMatches.length} gare analizzate · {visibleMatches.reduce((acc, m) => acc + m.sets.length, 0)} set complessivi
                      </span>
                    </div>
                    <span className="tabular-nums" style={{ fontWeight: 800, color: 'var(--vs-orange)', fontSize: '1.05rem' }}>
                      {aggregatedAnalysis.wins} {aggregatedAnalysis.wins === 1 ? 'vittoria' : 'vittorie'} su {visibleMatches.length} gare
                    </span>
                  </div>
                )}

                {/* Metric Cards */}
                <div className="vs-metrics-grid">
                  <div className="vs-metric-card accent-navy">
                    <span className="vs-metric-label">Punti fatti</span>
                    <strong className="vs-metric-value">{aggregatedAnalysis.scored}</strong>
                    <span className="vs-metric-detail">totale punti realizzati nei set</span>
                  </div>

                  <div className="vs-metric-card accent-teal">
                    <span className="vs-metric-label">Punti subiti</span>
                    <strong className="vs-metric-value">{aggregatedAnalysis.conceded}</strong>
                    <span className="vs-metric-detail">totale punti subiti dagli avversari</span>
                  </div>

                  <div className="vs-metric-card accent-orange">
                    <span className="vs-metric-label">Punti in fase break point (BP)</span>
                    <strong className="vs-metric-value">{aggregatedAnalysis.breakPoints ?? '–'}</strong>
                    <span className="vs-metric-detail">numero di punti conquistati in situazione di battuta</span>
                  </div>

                  {isSingleMatch && (
                    <div className="vs-metric-card accent-neutral">
                      <span className="vs-metric-label">Durata gara</span>
                      <strong className="vs-metric-value">{formatDuration(totalDurationMinutes)}</strong>
                      <span className="vs-metric-detail">
                        {visibleMatches[0].sets
                          .map((set, index) => `Set ${index + 1}: ${formatDuration(set.durationMinutes)}`)
                          .join(' · ')}
                      </span>
                    </div>
                  )}

                  <div className="vs-metric-card accent-neutral">
                    <span className="vs-metric-label">Differenziale</span>
                    <strong
                      className="vs-metric-value"
                      style={{
                        color: (aggregatedAnalysis.scored - aggregatedAnalysis.conceded) >= 0 ? 'var(--vs-heading)' : '#D32F2F',
                      }}
                    >
                      {(aggregatedAnalysis.scored - aggregatedAnalysis.conceded) > 0 ? '+' : ''}
                      {aggregatedAnalysis.scored - aggregatedAnalysis.conceded}
                    </strong>
                    <span className="vs-metric-detail">
                      {aggregatedAnalysis.wins} {aggregatedAnalysis.wins === 1 ? 'vittoria' : 'vittorie'} su {visibleMatches.length} gare
                    </span>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="vs-charts-grid">
                  <Chart
                    title="Rendimento per rotazione (P1 – P6)"
                    subtitle="Punti in fase break point vs punti subiti al servizio avversario"
                    option={rotationOption}
                  />
                  <Chart
                    title={isSingleMatch ? 'Punti per set' : 'Andamento gare'}
                    subtitle={isSingleMatch ? 'Punteggio parziale set per set' : 'Punti totali fatti e subiti per incontro'}
                    option={trendOption}
                  />
                </div>

                {/* Rotations Table */}
                <div className="vs-card">
                  <div className="vs-card-header">
                    <div>
                      <h2 className="vs-card-title">Le sei rotazioni a confronto</h2>
                      <p className="vs-card-subtitle">
                        TT = turni totali · TP = punti al servizio · MP = media punti a turno · % punti sul totale al servizio
                      </p>
                    </div>
                  </div>

                  <div className="vs-table-wrap">
                    <table className="vs-table">
                      <thead>
                        <tr>
                          <th>Rotazione</th>
                          <th className="num-cell-header">TT fatti</th>
                          <th className="num-cell-header">TP fatti</th>
                          <th className="num-cell-header">MP fatti</th>
                          <th className="num-cell-header">% punti</th>
                          <th className="num-cell-header">TT subiti</th>
                          <th className="num-cell-header">TP subiti</th>
                          <th className="num-cell-header">MP subiti</th>
                          <th className="num-cell-header">Differenziale MP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aggregatedAnalysis.rows.map((r) => {
                          const diff = (r.mean || 0) - (r.concededMean || 0)
                          return (
                            <tr key={r.rotation}>
                              <td>
                                <strong style={{ color: 'var(--vs-heading)' }}>P{r.rotation}</strong>
                              </td>
                              <td className="num-cell">{fmt(r.turns)}</td>
                              <td className="num-cell" style={{ fontWeight: 600 }}>{fmt(r.points)}</td>
                              <td className="num-cell">{fmt(r.mean)}</td>
                              <td className="num-cell">{fmt(r.share)}%</td>
                              <td className="num-cell">{fmt(r.concededTurns)}</td>
                              <td className="num-cell">{fmt(r.conceded)}</td>
                              <td className="num-cell">{fmt(r.concededMean)}</td>
                              <td
                                className="num-cell"
                                style={{
                                  fontWeight: 700,
                                  color: diff > 0 ? 'var(--vs-orange)' : diff < 0 ? '#C62828' : 'var(--vs-muted)',
                                }}
                              >
                                {diff > 0 ? '+' : ''}{fmt(diff)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p style={{ fontSize: '0.82rem', color: 'var(--vs-muted)', margin: '1rem 0 0' }}>
                    * Nota tecnica: il modello sottrae il punto di cambio palla dall&apos;inizio del turno di battuta.
                    La rotazione indicata con <strong>P</strong> corrisponde alla posizione in campo del palleggiatore all&apos;avvio della rotazione.
                  </p>
                </div>

                {/* Footer per esportazione PDF / Stampa */}
                <div className="vs-export-footer">
                  <hr style={{ border: 'none', borderTop: '1px solid var(--vs-border)', margin: '0 0 0.85rem 0' }} />
                  <span>basato su Referto Volley - un progetto di maurizio napolitano</span>
                </div>
              </div>
            ) : (
              <p>Errore nel calcolo dei dati della gara.</p>
            )}
          </section>
        )}

        {/* TAB 3: STORICO GARE */}
        {activeTab === 'history' && (
          <section>
            <div className="vs-card">
              <div className="vs-card-header">
                <div>
                  <h2 className="vs-card-title">Storico delle gare registrate</h2>
                  <p className="vs-card-subtitle">
                    Tutte le partite analizzate e archiviate in locale su questo dispositivo.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="vs-btn vs-btn-sm vs-btn-secondary"
                    disabled={!matches.length}
                    onClick={() => exportBackup()}
                  >
                    Esporta backup (.json)
                  </button>
                  <button
                    type="button"
                    className="vs-btn vs-btn-sm vs-btn-secondary"
                    onClick={() => {
                      if (backupInputRef.current) backupInputRef.current.click()
                    }}
                  >
                    Ripristina backup
                  </button>
                </div>
              </div>

              {!matches.length ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--vs-muted)' }}>
                  <p style={{ margin: '0 0 1rem' }}>Lo storico è attualmente vuoto.</p>
                  <button
                    type="button"
                    className="vs-btn vs-btn-sm vs-btn-primary"
                    onClick={() => startManualEntry()}
                  >
                    Compila una gara manualmente
                  </button>
                </div>
              ) : (
                <>
                  {selectedHistoryIds.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        background: '#E8F5E9',
                        border: '1px solid #C8E6C9',
                        borderRadius: 'var(--vs-radius)',
                        marginBottom: '1rem',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#1B5E20', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>✓ {selectedHistoryIds.length} {selectedHistoryIds.length === 1 ? 'gara selezionata' : 'gare selezionate'} per l&apos;analisi aggregata</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="vs-btn vs-btn-sm vs-btn-primary"
                          onClick={() => {
                            const first = matches.find(m => selectedHistoryIds.includes(m.id))
                            if (first) setSelectedTeam(first.team)
                            selectMatchesForAnalysis(selectedHistoryIds)
                          }}
                        >
                          📊 Analizza e aggrega {selectedHistoryIds.length} {selectedHistoryIds.length === 1 ? 'gara' : 'gare'}
                        </button>
                        <button
                          type="button"
                          className="vs-btn vs-btn-sm vs-btn-secondary"
                          onClick={() => setSelectedHistoryIds([])}
                        >
                          Deseleziona tutte
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="vs-table-wrap">
                    <table className="vs-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={matches.length > 0 && selectedHistoryIds.length === matches.length}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedHistoryIds(matches.map(m => m.id))
                                else setSelectedHistoryIds([])
                              }}
                              title="Seleziona tutte le gare per l'analisi"
                            />
                          </th>
                          <th>Data</th>
                          <th>Incontro</th>
                          <th>Risultato</th>
                          <th>Parziali per set</th>
                          <th className="num-cell-header">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...matches].reverse().map((m) => {
                          const day = m.date.slice(8)
                          const month = m.date.slice(5, 7)
                          const year = m.date.slice(0, 4)
                          const isChecked = selectedHistoryIds.includes(m.id)
                          return (
                            <tr key={m.id} style={{ background: isChecked ? 'rgba(230, 81, 0, 0.04)' : undefined }}>
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setSelectedHistoryIds(prev =>
                                      prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id]
                                    )
                                  }}
                                  title={`Seleziona gara ${m.team} vs ${m.opponent}`}
                                />
                              </td>
                              <td className="tabular-nums" style={{ fontWeight: 600 }}>{`${day}/${month}/${year}`}</td>
                              <td>
                                <strong style={{ color: 'var(--vs-heading)' }}>{m.team}</strong> – {m.opponent}
                                {(m.location || m.venue) && (
                                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--vs-muted)' }}>
                                    📍 {[m.location, m.venue].filter(Boolean).join(' · ')}
                                  </span>
                                )}
                                {m.referees?.first && (
                                  <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--vs-muted)' }}>
                                    👨‍⚖️ 1° Arb: {m.referees.first} {m.referees.scorer ? `· Segn: ${m.referees.scorer}` : ''}
                                  </span>
                                )}
                              </td>
                              <td className="tabular-nums" style={{ fontWeight: 700, color: 'var(--vs-heading)' }}>
                                {resultStr(m)}
                              </td>
                              <td className="tabular-nums" style={{ fontSize: '0.85rem' }}>
                                {m.sets.map(s => `${s.scoreOwn}-${s.scoreOther}`).join(' / ')}
                              </td>
                              <td className="num-cell">
                                <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                  <button
                                    type="button"
                                    className="vs-btn vs-btn-sm vs-btn-primary"
                                    onClick={() => {
                                      setSelectedTeam(m.team)
                                      setSelectedMatchId(m.id)
                                      setActiveTab('analysis')
                                    }}
                                  >
                                    Analizza
                                  </button>
                                  <button
                                    type="button"
                                    className="vs-btn vs-btn-sm vs-btn-secondary"
                                    title={`Inverti per analizzare ${m.opponent}`}
                                    onClick={() => {
                                      setDraft({
                                        ...m,
                                        team: m.opponent,
                                        opponent: m.team,
                                        roster: m.opponentRoster || [],
                                        opponentRoster: m.roster || [],
                                        sets: m.sets.map(s => ({
                                          ...s,
                                          own: s.other,
                                          other: s.own,
                                          scoreOwn: s.scoreOther,
                                          scoreOther: s.scoreOwn,
                                          lineup: s.opponentLineup,
                                          opponentLineup: s.lineup,
                                          rotation: '',
                                        })),
                                      })
                                      setActiveTab('reports')
                                      window.scrollTo({ top: 0, behavior: 'smooth' })
                                    }}
                                  >
                                    ⇄ Inverti
                                  </button>
                                  <button
                                    type="button"
                                    className="vs-btn vs-btn-sm vs-btn-secondary"
                                    onClick={() => {
                                      setDraft(structuredClone(m))
                                      setActiveTab('reports')
                                      window.scrollTo({ top: 0, behavior: 'smooth' })
                                    }}
                                  >
                                    Modifica
                                  </button>
                                  {deleteConfirmId === m.id ? (
                                    <>
                                      <button
                                        type="button"
                                        className="vs-btn vs-btn-sm vs-btn-danger"
                                        onClick={() => {
                                          deleteMatch(m.id)
                                          setDeleteConfirmId(null)
                                        }}
                                      >
                                        Conferma
                                      </button>
                                      <button
                                        type="button"
                                        className="vs-btn vs-btn-sm vs-btn-secondary"
                                        onClick={() => setDeleteConfirmId(null)}
                                      >
                                        Annulla
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="vs-btn vs-btn-sm vs-btn-secondary"
                                      onClick={() => setDeleteConfirmId(m.id)}
                                    >
                                      Elimina
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Local Storage info card */}
            <div className="vs-card">
              <h2 className="vs-card-title" style={{ marginBottom: '0.4rem' }}>Gestione archivio e privacy</h2>
              <p style={{ color: 'var(--vs-text)', fontSize: '0.92rem', margin: '0 0 1rem', maxWidth: '48rem' }}>
                Tutti i file PDF originali, le formazioni e i conteggi dei set sono memorizzati localmente nel browser
                tramite IndexedDB e gestiti nello store React. Nessun dato viene trasmesso a server esterni o cloud terzi.
                Con la funzione &quot;Esporta backup&quot; puoi salvare un unico file con tutti i PDF e le analisi per aprirli su un altro dispositivo.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="vs-btn vs-btn-sm vs-btn-secondary"
                  disabled={!matches.length}
                  onClick={() => exportBackup()}
                >
                  Esporta archivio in JSON
                </button>
                <button
                  type="button"
                  className="vs-btn vs-btn-sm vs-btn-secondary"
                  onClick={() => {
                    if (backupInputRef.current) backupInputRef.current.click()
                  }}
                >
                  Ripristina archivio da JSON
                </button>
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: INFO */}
        {activeTab === 'info' && (
          <section>
            {/* Project & Author Card */}
            <div className="vs-card" style={{ marginBottom: '1.5rem', background: '#FFFFFF' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <VolleyScoresheetLogo size={44} />
                <div>
                  <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--vs-heading)', letterSpacing: '-0.02em' }}>
                    Referto Volley
                  </h1>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.95rem', color: 'var(--vs-muted)' }}>
                    La prestazione della squadra attraverso il referto di gara
                  </p>
                </div>
              </div>

              <div
                style={{
                  padding: '1.1rem 1.35rem',
                  background: 'var(--vs-orange-soft)',
                  borderRadius: 'var(--vs-radius)',
                  border: '1px solid rgba(230, 81, 0, 0.25)',
                  marginBottom: '1.25rem',
                }}
              >
                <p style={{ margin: 0, fontSize: '1.05rem', color: 'var(--vs-heading)', fontWeight: 600 }}>
                  Progetto di <a href="https://github.com/napo" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--vs-orange)', textDecoration: 'underline', fontWeight: 700 }}>Maurizio Napolitano</a>
                </p>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.95rem', color: 'var(--vs-text)' }}>
                  basato sul lavoro del file Excel di <strong>Andrea Fortunati</strong>.
                </p>
              </div>

              <p style={{ margin: 0, color: 'var(--vs-text)', lineHeight: 1.65 }}>
                Referto Volley nasce per consentire a tecnici, atleti e appassionati di pallavolo di estrarre e visualizzare
                in modo immediato ed accurato le statistiche di rendimento di squadra a partire dal referto ufficiale di gara (modello federale SNUG).
                Tutti i dati risiedono localmente nel browser (IndexedDB), garantendo massima privacy e funzionamento anche offline.
              </p>
            </div>

            {/* Come funziona il modello di calcolo */}
            <div className="vs-card">
              <div className="vs-card-header">
                <div>
                  <h2 className="vs-card-title">Come funziona il modello di calcolo</h2>
                  <p className="vs-card-subtitle">
                    Spiegazione dell&apos;algoritmo di Andrea Fortunati per l&apos;analisi delle rotazioni da referto di gara.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ margin: '0 0 1.25rem', lineHeight: 1.65 }}>
                  Il modello traduce la griglia progressiva del referto federale (i turni di battuta da 1 a 6 registrati in sequenza circolare per ciascun set)
                  nel rendimento effettivo di ciascuna delle sei rotazioni (<strong>P1, P2, P3, P4, P5, P6</strong>, in base alla posizione iniziale del palleggiatore).
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{ padding: '1rem', background: '#FAFAFA', borderRadius: '0.5rem', border: '1px solid var(--vs-border)' }}>
                    <strong style={{ color: 'var(--vs-heading)', display: 'block', marginBottom: '0.35rem', fontSize: '0.98rem' }}>
                      1. TT (Turni Totali)
                    </strong>
                    <span style={{ fontSize: '0.86rem', color: 'var(--vs-muted)' }}>
                      Quante volte la squadra è andata in battuta in quella determinata rotazione durante il set o la partita.
                    </span>
                  </div>

                  <div style={{ padding: '1rem', background: '#FAFAFA', borderRadius: '0.5rem', border: '1px solid var(--vs-border)' }}>
                    <strong style={{ color: 'var(--vs-heading)', display: 'block', marginBottom: '0.35rem', fontSize: '0.98rem' }}>
                      2. TP / TPF (Punti al Servizio)
                    </strong>
                    <span style={{ fontSize: '0.86rem', color: 'var(--vs-muted)' }}>
                      Punti segnati mentre la squadra è al servizio (break point effettivi). Il punto di ingresso in battuta (cambio palla) viene sottratto dal progressivo.
                    </span>
                  </div>

                  <div style={{ padding: '1rem', background: '#FAFAFA', borderRadius: '0.5rem', border: '1px solid var(--vs-border)' }}>
                    <strong style={{ color: 'var(--vs-heading)', display: 'block', marginBottom: '0.35rem', fontSize: '0.98rem' }}>
                      3. TPS (Punti Subiti)
                    </strong>
                    <span style={{ fontSize: '0.86rem', color: 'var(--vs-muted)' }}>
                      Punti subiti durante il turno di battuta avversario prima di riuscire ad effettuare il cambio palla (misura della tenuta in ricezione).
                    </span>
                  </div>

                  <div style={{ padding: '1rem', background: '#FAFAFA', borderRadius: '0.5rem', border: '1px solid var(--vs-border)' }}>
                    <strong style={{ color: 'var(--vs-heading)', display: 'block', marginBottom: '0.35rem', fontSize: '0.98rem' }}>
                      4. MP (Media Punti per Turno)
                    </strong>
                    <span style={{ fontSize: '0.86rem', color: 'var(--vs-muted)' }}>
                      Rapporto TP / TT. Indica l&apos;efficienza offensiva di ogni rotazione in fase di battuta e contrattacco: un valore &gt; 1 significa che la squadra allunga il vantaggio.
                    </span>
                  </div>

                  <div style={{ padding: '1rem', background: '#FAFAFA', borderRadius: '0.5rem', border: '1px solid var(--vs-border)' }}>
                    <strong style={{ color: 'var(--vs-heading)', display: 'block', marginBottom: '0.35rem', fontSize: '0.98rem' }}>
                      5. Differenziale Netto (BP – TPS)
                    </strong>
                    <span style={{ fontSize: '0.86rem', color: 'var(--vs-muted)' }}>
                      Bilancio tra punti conquistati in fase break point e punti concessi all&apos;avversario. Evidenzia all&apos;istante le rotazioni in guadagno attivo e quelle deficitarie.
                    </span>
                  </div>

                  <div style={{ padding: '1rem', background: '#FAFAFA', borderRadius: '0.5rem', border: '1px solid var(--vs-border)' }}>
                    <strong style={{ color: 'var(--vs-heading)', display: 'block', marginBottom: '0.35rem', fontSize: '0.98rem' }}>
                      6. Posizione Palleggiatore (P1 – P6)
                    </strong>
                    <span style={{ fontSize: '0.86rem', color: 'var(--vs-muted)' }}>
                      La rotazione è convenzionalmente identificata dalla zona occupata dal palleggiatore all&apos;avvio del set:
                      P1 (zona 1), P6 (zona 6), P5 (zona 5), P4 (zona 4), P3 (zona 3), P2 (zona 2).
                    </span>
                  </div>
                </div>

                <div style={{ padding: '1.25rem', background: 'var(--vs-surface)', borderRadius: '0.5rem', border: '1px solid var(--vs-border)' }}>
                  <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem', color: 'var(--vs-heading)' }}>
                    Interpretazione tattica delle due fasi di gioco
                  </h3>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--vs-text)', lineHeight: 1.7 }}>
                    <li>
                      <strong>Fase Side-out (Cambio Palla)</strong>: ricezione del servizio avversario, alzata e attacco. Un valore contenuto di TPS indica un cambio palla rapido e sicuro al primo tentativo.
                    </li>
                    <li>
                      <strong>Fase Break Point (BP)</strong>: battuta, muro, difesa e contrattacco. Un valore elevato di BP indica una rotazione capace di creare serie di punti consecutivi sul proprio servizio.
                    </li>
                    <li>
                      <strong>Aggregazione multi-gara</strong>: selezionando più gare dallo storico o dal menu a discesa, il modello aggrega i turni e i punti di ciascuna rotazione, consentendo di valutare la costanza del rendimento nel corso del campionato.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* FOOTER */}
        <footer className="vs-footer">
          <div>
            <strong>Referto Volley</strong> — Analisi e lettura referti di gara della pallavolo
            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--vs-muted)', marginTop: '0.2rem' }}>
              Modello originale e calcolo delle rotazioni ideato da Andrea Fortunati
            </span>
          </div>
          <div>
            <span>Elaborazione 100% locale nel browser · Nessun caricamento su server</span>
          </div>
        </footer>
      </main>
    </div>
  )
}

// Subcomponent: Verification & Review Card for imported PDF or manual entry
function DraftReviewCard({ draft, setDraft, onCancel, onSave, onAddSet, onRemoveSet, busy }) {
  const [sourceUrl, setSourceUrl] = useState('')

  useEffect(() => {
    if (!draft?.pdf) return
    const url = URL.createObjectURL(draft.pdf)
    setSourceUrl(url)
    return () => {
      URL.revokeObjectURL(url)
      setSourceUrl('')
    }
  }, [draft?.pdf])

  const validationErrors = useMemo(() => validateMatch(draft), [draft])

  return (
    <div className="vs-card" style={{ borderColor: 'var(--vs-accent)' }}>
      <div className="vs-card-header">
        <div>
          <div className="vs-eyebrow">
            {draft.isManual ? 'Compilazione manuale della gara' : 'Verifica e conferma importazione'}
          </div>
          <h2 className="vs-card-title">{draft.fileName || 'Referto di gara'}</h2>
          <p className="vs-card-subtitle">
            {draft.isManual
              ? 'Inserisci i dati delle squadre, i punteggi dei set e i turni di battuta (supportati fino a 6 set con Golden Set).'
              : 'I dati sono stati letti dal referto. Verifica la squadra da analizzare e indica la posizione del palleggiatore (P) per ogni set.'}
          </p>
        </div>
        <button type="button" className="vs-btn vs-btn-sm vs-btn-secondary" onClick={onCancel}>
          Annulla
        </button>
      </div>

      <div className="vs-review-grid">
        {draft.isManual ? (
          <>
            <div className="vs-field">
              <label>Squadra analizzata (Casa / Principale)</label>
              <input
                type="text"
                placeholder="Es. Melodicy Spikers"
                value={draft.team}
                onChange={(e) => setDraft({ ...draft, team: e.target.value })}
              />
            </div>
            <div className="vs-field">
              <label>Squadra avversaria (Ospite)</label>
              <input
                type="text"
                placeholder="Es. Hollywood Blockers"
                value={draft.opponent}
                onChange={(e) => setDraft({ ...draft, opponent: e.target.value })}
              />
            </div>
            {draft.team && draft.opponent && (
              <div className="vs-field" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="vs-btn vs-btn-sm vs-btn-secondary"
                  title="Inverti quale delle due squadre analizzare"
                  onClick={() => {
                    setDraft(d => ({
                      ...d,
                      team: d.opponent,
                      opponent: d.team,
                      roster: d.opponentRoster || [],
                      opponentRoster: d.roster || [],
                      sets: d.sets.map(s => ({
                        ...s,
                        own: s.other,
                        other: s.own,
                        scoreOwn: s.scoreOther,
                        scoreOther: s.scoreOwn,
                        lineup: s.opponentLineup,
                        opponentLineup: s.lineup,
                        rotation: '',
                      })),
                    }))
                  }}
                >
                  ⇄ Inverti squadra analizzata
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="vs-field">
            <label>Squadra da analizzare</label>
            <select
              value="own"
              onChange={() => {
                setDraft(d => applySetter({
                  ...d,
                  team: d.opponent,
                  opponent: d.team,
                  roster: d.opponentRoster || [],
                  opponentRoster: d.roster || [],
                  sets: d.sets.map(s => ({
                    ...s,
                    own: s.other,
                    other: s.own,
                    scoreOwn: s.scoreOther,
                    scoreOther: s.scoreOwn,
                    lineup: s.opponentLineup,
                    opponentLineup: s.lineup,
                    rotation: '',
                  })),
                }))
              }}
            >
              <option value="own">{draft.team} (squadra attiva)</option>
              <option value="other">Inverti: {draft.opponent}</option>
            </select>
          </div>
        )}

        <div className="vs-field">
          <label>Data gara</label>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
          />
          {draft.isManual && (
            <span style={{ fontSize: '0.76rem', color: 'var(--vs-muted)', marginTop: '0.2rem' }}>
              Es. 20 / 02 / 2027
            </span>
          )}
        </div>

        <div className="vs-field">
          <label>Luogo / Città</label>
          <input
            type="text"
            placeholder="Es. Sanremo (IM)"
            value={draft.location || ''}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
        </div>

        <div className="vs-field">
          <label>Impianto / Palestra</label>
          <input
            type="text"
            placeholder="Es. Sanremo"
            value={draft.venue || ''}
            onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
          />
        </div>

        <div className="vs-field">
          <label>Maglia palleggiatore (auto-assegna P)</label>
          <input
            type="number"
            min="1"
            max="99"
            placeholder="Es. 7"
            onChange={(e) => {
              const jersey = e.target.value
              setDraft(d => ({
                ...d,
                sets: d.sets.map(s => {
                  const idx = s.lineup.findIndex(n => String(n) === jersey)
                  return { ...s, rotation: idx >= 0 ? idx + 1 : s.rotation }
                }),
              }))
            }}
          />
        </div>

        {sourceUrl && (
          <div className="vs-field" style={{ justifyContent: 'flex-end' }}>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="vs-btn vs-btn-secondary"
              style={{ fontSize: '0.85rem' }}
            >
              Apri PDF originale ↗
            </a>
          </div>
        )}
      </div>

      {(draft.roster?.length > 0 || draft.opponentRoster?.length > 0) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.25rem',
          }}
        >
          {[
            { name: draft.team || 'Squadra analizzata', roster: draft.roster || [] },
            { name: draft.opponent || 'Squadra avversaria', roster: draft.opponentRoster || [] },
          ].map(({ name, roster }) => (
            <div
              key={name}
              style={{
                padding: '0.85rem 1rem',
                background: '#FAFAFA',
                border: '1px solid var(--vs-border)',
                borderRadius: '0.5rem',
              }}
            >
              <strong style={{ display: 'block', color: 'var(--vs-heading)', marginBottom: '0.35rem' }}>
                Elenco atleti — {name}
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--vs-muted)' }}>
                Nomi e numeri letti dal referto. Puoi correggere o completare i nomi prima di salvare.
              </span>
              <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.65rem' }}>
                {roster.map((entry, index) => {
                  const player = rosterPlayer(entry)
                  const rosterKey = name === draft.team ? 'roster' : 'opponentRoster'
                  return (
                  <div
                    key={`${player.number}-${index}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '3.5rem minmax(0, 1fr)',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>#{player.number}</strong>
                    <input
                      type="text"
                      placeholder="Nome atleta"
                      aria-label={`Nome atleta maglia ${player.number}`}
                      value={player.name || ''}
                      onChange={event => setDraft(draftValue => ({
                        ...draftValue,
                        [rosterKey]: (draftValue[rosterKey] || []).map((current, currentIndex) =>
                          currentIndex === index
                            ? { ...rosterPlayer(current), name: event.target.value }
                            : current,
                        ),
                      }))}
                    />
                  </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sezione Arbitri e Ufficiali di Gara */}
      <details
        style={{
          background: '#FAFAFA',
          border: '1px solid var(--vs-border)',
          borderRadius: '0.5rem',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
        }}
        open={Boolean(draft.referees?.first || draft.referees?.scorer)}
      >
        <summary style={{ cursor: 'pointer', fontFamily: 'var(--vs-font-nav)', fontWeight: 600, fontSize: '0.88rem', color: 'var(--vs-heading)' }}>
          Arbitri e Ufficiali di Gara {draft.referees?.first ? `(1°: ${draft.referees.first})` : ''}
        </summary>
        <div className="vs-review-grid" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
          <div className="vs-field">
            <label>1° Arbitro</label>
            <input
              type="text"
              placeholder="Cognome e Nome 1° Arbitro"
              value={draft.referees?.first || ''}
              onChange={(e) => setDraft({
                ...draft,
                referees: { ...draft.referees, first: e.target.value },
              })}
            />
          </div>
          <div className="vs-field">
            <label>2° Arbitro</label>
            <input
              type="text"
              placeholder="Cognome e Nome 2° Arbitro"
              value={draft.referees?.second || ''}
              onChange={(e) => setDraft({
                ...draft,
                referees: { ...draft.referees, second: e.target.value },
              })}
            />
          </div>
          <div className="vs-field">
            <label>Segnapunti</label>
            <input
              type="text"
              placeholder="Cognome e Nome Segnapunti"
              value={draft.referees?.scorer || ''}
              onChange={(e) => setDraft({
                ...draft,
                referees: { ...draft.referees, scorer: e.target.value },
              })}
            />
          </div>
        </div>
      </details>

      {/* Set by set editor */}
      {draft.sets.map((setObj, index) => (
        <SetEditor
          key={`${draft.team}-${index}`}
          set={setObj}
          index={index}
          team={draft.team || 'Squadra analizzata'}
          opponent={draft.opponent || 'Squadra avversaria'}
          update={(patch) => {
            setDraft(d => ({
              ...d,
              sets: d.sets.map((s, i) => i === index ? { ...s, ...patch } : s),
            }))
          }}
        />
      ))}

      {/* Gestione aggiunta e rimozione set (fino a 6 con Golden Set) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '1.25rem 0', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {draft.sets.length < 6 && (
            <button
              type="button"
              className="vs-btn vs-btn-secondary"
              onClick={onAddSet}
            >
              + Aggiungi {draft.sets.length === 5 ? 'Set 6 (Golden Set)' : `Set ${draft.sets.length + 1}`}
            </button>
          )}
          {draft.sets.length > 1 && (
            <button
              type="button"
              className="vs-btn vs-btn-sm vs-btn-danger"
              onClick={onRemoveSet}
            >
              Rimuovi {draft.sets.length === 6 ? 'Golden Set' : `Set ${draft.sets.length}`}
            </button>
          )}
        </div>
        <span style={{ fontSize: '0.82rem', color: 'var(--vs-muted)' }}>
          {draft.sets.length} {draft.sets.length === 1 ? 'set impostato' : 'set impostati'} · Supportati fino a 6 set (compreso Golden Set)
        </span>
      </div>

      {validationErrors.length > 0 && (
        <div style={{ margin: '1rem 0', padding: '0.85rem 1rem', background: '#FFEBEE', borderRadius: '0.5rem', color: '#B71C1C', fontSize: '0.85rem' }}>
          <strong>Verifica i seguenti punti prima di salvare:</strong>
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem' }}>
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--vs-border)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--vs-muted)' }}>
          I dati e il file referto saranno memorizzati permanentemente nello store locale del browser.
        </span>
        <button
          type="button"
          className="vs-btn vs-btn-primary"
          disabled={busy || validationErrors.length > 0}
          onClick={() => onSave(draft)}
        >
          {busy ? 'Salvataggio…' : "Salva gara e procedi all'analisi"}
        </button>
      </div>
    </div>
  )
}

// Subcomponent: Set Details & 6x6 Turns Grid
function SetEditor({ set: s, index, team, opponent, update }) {
  const isGoldenSet = index === 5
  const isTieBreak = index === 4
  const setLabel = isGoldenSet ? 'Set 6 — Golden Set (a 15 punti)' : isTieBreak ? 'Set 5 — Tie-break (a 15 punti)' : `Set ${index + 1}`

  return (
    <details className="vs-set-details" open>
      <summary className="vs-set-summary">
        <span>{setLabel}</span>
        <span style={{ color: 'var(--vs-orange)', fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums' }}>
          {s.scoreOwn} – {s.scoreOther}
        </span>
      </summary>
      <div className="vs-set-body">
        <div className="vs-review-grid" style={{ marginBottom: '1rem' }}>
          <div className="vs-field">
            <label>Posizione iniziale Palleggiatore (P)</label>
            <select
              value={s.rotation}
              onChange={(e) => update({ rotation: e.target.value ? +e.target.value : '' })}
            >
              <option value="">Indica la posizione (P1 – P6)</option>
              {[1, 2, 3, 4, 5, 6].map(pos => (
                <option key={pos} value={pos}>
                  P{pos} {s.lineup?.[pos - 1] ? `· maglia #${s.lineup[pos - 1]}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="vs-field">
            <label>Punti {team}</label>
            <input
              type="number"
              min="0"
              value={s.scoreOwn}
              onChange={(e) => update({ scoreOwn: e.target.value === '' ? '' : +e.target.value })}
            />
          </div>
          <div className="vs-field">
            <label>Punti {opponent}</label>
            <input
              type="number"
              min="0"
              value={s.scoreOther}
              onChange={(e) => update({ scoreOther: e.target.value === '' ? '' : +e.target.value })}
            />
          </div>
          <div className="vs-field">
            <label>Durata set (minuti)</label>
            <input
              type="number"
              min="1"
              max="180"
              placeholder="Es. 24"
              value={s.durationMinutes ?? ''}
              onChange={(e) => update({
                durationMinutes: e.target.value === '' ? '' : Number(e.target.value),
              })}
            />
          </div>
        </div>

        <div className="vs-turn-grid">
          {[
            { key: 'own', name: team },
            { key: 'other', name: opponent },
          ].map(({ key, name }) => (
            <div key={key}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem', color: 'var(--vs-heading)' }}>
                {name} — Progressivi a fine turno
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--vs-muted)', margin: '0 0 0.5rem' }}>
                X = primo turno in ricezione · I numeri indicano il punteggio raggiunto
              </p>
              <div className="vs-table-wrap">
                <table className="vs-grid-table">
                  <thead>
                    <tr>
                      <th>Giro</th>
                      {['I', 'II', 'III', 'IV', 'V', 'VI'].map(v => <th key={v}>{v}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 6 }, (_, r) => (
                      <tr key={r}>
                        <th>{r + 1}</th>
                        {Array.from({ length: 6 }, (_, c) => {
                          const cellIdx = r * 6 + c
                          const cellVal = s[key][cellIdx] ?? ''
                          return (
                            <td key={c}>
                              <input
                                aria-label={`Set ${index + 1}, ${name}, giro ${r + 1}, colonna ${c + 1}`}
                                value={cellVal}
                                maxLength={3}
                                onChange={(e) => {
                                  const text = e.target.value.toUpperCase()
                                  if (text !== '' && text !== 'X' && !/^\d+$/.test(text)) return
                                  const arr = [...s[key]]
                                  arr[cellIdx] = text === '' || text === 'X' ? text : +text
                                  update({ [key]: arr })
                                }}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}

// Subcomponent: ECharts Wrapper
function Chart({ title, subtitle, option }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !option) return
    const chart = echarts.init(containerRef.current)
    chart.setOption(option)
    const handleResize = () => chart.resize()
    const observer = new ResizeObserver(handleResize)
    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      chart.dispose()
    }
  }, [option])

  return (
    <article className="vs-card">
      <div className="vs-card-header">
        <div>
          <h2 className="vs-card-title">{title}</h2>
          {subtitle && <p className="vs-card-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div ref={containerRef} className="vs-chart-container" role="img" aria-label={title} />
    </article>
  )
}

export default function App() {
  return (
    <MatchStoreProvider>
      <MainApp />
    </MatchStoreProvider>
  )
}
