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
import { formatDuration, formatWins, matchDuration } from './format'
import { emptyFilters, matchHeading } from './match-filters'
import { VolleyScoresheetLogo } from './Logo'
import './App.css'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, CanvasRenderer])

const fmt = n => Number(n).toLocaleString('it-IT', { maximumFractionDigits: 2, minimumFractionDigits: 0 })
const rosterPlayer = player => typeof player === 'object' ? player : { number: player, name: '', setterRole: '' }
const isSetter = player => Boolean(player.isSetter || player.setterRole === 'P1' || player.setterRole === 'P2')
const liberoValues = (libero, key) => Array.isArray(libero?.[key])
  ? [...libero[key], '', '', '', '', '', ''].slice(0, 6)
  : Array(6).fill(libero?.[key] || '')
const resultStr = m => `${m.sets.filter(s => s.scoreOwn > s.scoreOther).length} – ${m.sets.filter(s => s.scoreOther > s.scoreOwn).length}`
const updateSetterRotations = match => {
  const setters = (match.roster || []).map(rosterPlayer)
    .filter(isSetter)
  return {
    ...match,
    sets: (match.sets || []).map(set => {
      const setter = setters.find(player => set.lineup?.some(number => String(number) === String(player.number)))
      const position = setter ? set.lineup.findIndex(number => String(number) === String(setter.number)) + 1 : ''
      return { ...set, rotation: position || '' }
    }),
  }
}
const athleteStats = matches => {
  const stats = new Map()
  for (const match of matches) {
    const names = new Map((match.roster || []).map(rosterPlayer).map(player => [String(player.number), player.name || '']))
    for (const set of match.sets || []) {
      const active = new Set((set.lineup || []).filter(Boolean).map(String))
      for (const entry of set.liberoReplacements || []) {
        active.add(String(entry.player))
        active.add(String(entry.libero))
      }
      for (const key of ['onCourt', 'entered', 'otherEntered']) {
        for (const number of liberoValues(set.libero, key).filter(Boolean)) active.add(String(number))
      }
      const pointsPlayed = Number(set.scoreOwn || 0) + Number(set.scoreOther || 0)
      for (const number of active) {
        if (!stats.has(number)) stats.set(number, { number, name: names.get(number) || '', pointsPlayed: 0, services: 0, serviceTurns: 0, consecutive: 0, pointsAtServe: 0 })
        stats.get(number).pointsPlayed += pointsPlayed
      }

      let previous = 0
      for (const [index, value] of (set.own || []).entries()) {
        if (value === '' || value === null || value === undefined) continue
        if (value === 'X') { previous = 0; continue }
        if (!Number.isInteger(value)) continue
        const playerNumber = set.lineup?.[index % 6]
        if (playerNumber === '' || playerNumber === undefined) { previous = value; continue }
        const number = String(playerNumber)
        if (!stats.has(number)) stats.set(number, { number, name: names.get(number) || '', pointsPlayed: 0, services: 0, serviceTurns: 0, consecutive: 0, pointsAtServe: 0 })
        const points = Math.max(0, value - previous - 1)
        const player = stats.get(number)
        player.services += points + 1
        player.serviceTurns += 1
        player.consecutive += points + 1
        player.pointsAtServe += points
        previous = value
      }
    }
  }
  return [...stats.values()]
    .map(player => ({ ...player, averageConsecutive: player.serviceTurns ? player.consecutive / player.serviceTurns : 0, averagePointsAtServe: player.serviceTurns ? player.pointsAtServe / player.serviceTurns : 0 }))
    .sort((a, b) => Number(a.number) - Number(b.number))
}

function MainApp() {
  const {
    matches,
    filteredMatches,
    filters,
    updateFilters,
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
  const [searchMenuOpen, setSearchMenuOpen] = useState(false)
  const searchFieldRef = useRef(null)

  const searchResults = useMemo(() => {
    const source = filters.query ? filteredMatches : matches
    return source.slice(0, 10)
  }, [filters.query, filteredMatches, matches])

  useEffect(() => {
    const handlePointerDown = event => {
      if (searchFieldRef.current && !searchFieldRef.current.contains(event.target)) {
        setSearchMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

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
      const footerSpace = 8
      const availableHeight = pageHeight - margin * 2 - footerSpace
      const scale = Math.min(printWidth / canvas.width, availableHeight / canvas.height)
      const renderWidth = canvas.width * scale
      const renderHeight = canvas.height * scale
      const positionX = (pageWidth - renderWidth) / 2
      const positionY = margin + (availableHeight - renderHeight) / 2

      pdf.addImage(imgData, 'PNG', positionX, positionY, renderWidth, renderHeight)

      pdf.setFontSize(8)
      pdf.setTextColor(100, 100, 100)
      pdf.text('Referto Volley - Maurizio Napolitano - modello Excel delle rotazioni di Andrea Fortunati', pageWidth / 2, pageHeight - 5, { align: 'center' })

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
          name: 'Punti subiti in fase cambio palla (CP)',
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
    return matchDuration(visibleMatches[0])
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
                  Informazioni
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
        {/* Introduzione solo nella home; intestazione compatta durante la verifica. */}
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
        ) : activeTab === 'reports' ? (
          <section className="vs-hero">
            <div className="vs-eyebrow">Analisi del referto di gara</div>
            <h1 className="vs-hero-title">Il rendimento della squadra attraverso il referto di gara</h1>
            <p className="vs-hero-lead">
              Referto Volley permette di analizzare i dati contenuti nel referto di gara della pallavolo e di osservare il rendimento della squadra nelle diverse rotazioni e nelle fasi break point e cambio palla.
            </p>
            <div className="vs-metadata-line">
              <span>Archivio locale attivo</span>
              <span aria-hidden="true">·</span>
              <span>{matches.length} {matches.length === 1 ? 'gara salvata' : 'gare salvate'}</span>
              <span aria-hidden="true">·</span>
              <span>Archivio nel browser tramite IndexedDB</span>
            </div>
          </section>
        ) : null}

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

        {activeTab !== 'info' && !draft && matches.length > 0 && (
          <section className="vs-card" aria-label="Ricerca e filtri gare">
            <div className="vs-review-grid">
              <div className="vs-field vs-search-field" ref={searchFieldRef}>
                <span>Cerca gare</span>
                <input
                  type="search"
                  placeholder="Squadra, numero gara, campionato…"
                  value={filters.query}
                  onFocus={() => setSearchMenuOpen(true)}
                  onChange={e => {
                    updateFilters({ ...filters, query: e.target.value })
                    setSelectedHistoryIds([])
                    setSearchMenuOpen(true)
                  }}
                />
                {searchMenuOpen && (
                  <div className="vs-search-dropdown" role="listbox" aria-label="Risultati ricerca gare">
                    {searchResults.length ? (
                      searchResults.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          className="vs-search-option"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            const value = [m.team, m.opponent, matchHeading(m), m.date].filter(Boolean).join(' ')
                            updateFilters({ ...filters, query: value })
                            setSelectedHistoryIds([])
                            setSearchMenuOpen(false)
                          }}
                        >
                          <span className="vs-search-option-title">{m.team} vs {m.opponent}</span>
                          <span className="vs-search-option-meta">{m.date} · {matchHeading(m)}</span>
                        </button>
                      ))
                    ) : (
                      <div className="vs-search-empty">Nessuna gara trovata</div>
                    )}
                  </div>
                )}
              </div>
              {[['championship', 'Campionato'], ['gender', 'Divisione']].map(([key, label]) => (
                <label className="vs-field" key={key}>
                  <span>{label}</span>
                  <select value={filters[key]} onChange={e => { updateFilters({ ...filters, [key]: e.target.value }); setSelectedHistoryIds([]) }}>
                    <option value="">Tutti</option>
                    {[...new Set(matches.map(m => m[key]).filter(Boolean))].sort().map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="vs-metadata-line">
              <span>{filteredMatches.length} gare trovate su {matches.length}. L’analisi aggregata usa le gare filtrate della squadra scelta.</span>
              <button type="button" className="vs-btn vs-btn-sm vs-btn-secondary" onClick={() => { updateFilters(emptyFilters); setSelectedHistoryIds([]); setSearchMenuOpen(false) }}>Azzera filtri</button>
            </div>
            {!filteredMatches.length && <p>Nessuna gara corrisponde ai filtri.</p>}
          </section>
        )}

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
                  <span>Sono supportati i modelli PDF dei software prodotti da SNUG e NEWBIT</span>
                </div>
              </div>
            )}

            {/* List of uploaded PDF reports */}
            <div className="vs-card">
              <div className="vs-card-header">
                <div>
                  <h2 className="vs-card-title">Referti salvati nell’archivio locale</h2>
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
                      {filteredMatches.map((m) => {
                        const day = m.date.slice(8)
                        const month = m.date.slice(5, 7)
                        const year = m.date.slice(0, 4)
                        return (
                          <tr key={m.id}>
                            <td className="tabular-nums" style={{ fontWeight: 600 }}>{`${day}/${month}/${year}`}</td>
                            <td>
                              <strong style={{ color: 'var(--vs-heading)' }}>{m.team}</strong> vs {m.opponent}
                              <div className="vs-metric-detail">{matchHeading(m)}</div>
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
                                        libero: s.opponentLibero || { onCourt: '', entered: '', otherEntered: '' },
                                        opponentLibero: s.libero || { onCourt: '', entered: '', otherEntered: '' },
                                        liberoReplacements: s.opponentLiberoReplacements || [],
                                        opponentLiberoReplacements: s.liberoReplacements || [],
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
                            ★ Ultima gara: {latest.date} vs {latest.opponent} ({resultStr(latest)}) · {matchHeading(latest)}
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
                            {m.date} vs {m.opponent} ({resultStr(m)}) · {matchHeading(m)}
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
                          <small style={{ display: 'block' }}>{matchHeading(m)}</small>
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
                      Analisi Referto Volley
                    </span>
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
                      <span>{matchHeading(visibleMatches[0])}</span>
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
                              libero: s.opponentLibero || { onCourt: '', entered: '', otherEntered: '' },
                              opponentLibero: s.libero || { onCourt: '', entered: '', otherEntered: '' },
                              liberoReplacements: s.opponentLiberoReplacements || [],
                              opponentLiberoReplacements: s.liberoReplacements || [],
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
                      <div className="vs-metric-detail">{[...new Set(visibleMatches.map(matchHeading).filter(Boolean))].join(' / ')}</div>
                      <span style={{ color: 'var(--vs-muted)' }}>
                        {visibleMatches.length} gare analizzate · {visibleMatches.reduce((acc, m) => acc + m.sets.length, 0)} set complessivi
                      </span>
                    </div>
                    <span className="tabular-nums" style={{ fontWeight: 800, color: 'var(--vs-orange)', fontSize: '1.05rem' }}>
                      {formatWins(aggregatedAnalysis.wins, visibleMatches.length)}
                    </span>
                  </div>
                )}

                {/* Metric Cards */}
                <div className="vs-metrics-grid">
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
                    <span className="vs-metric-label">Numero {visibleMatches[0].gender === 'Femminile' ? 'atlete' : 'atleti'} coinvolti</span>
                    <strong className="vs-metric-value">{aggregatedAnalysis.athletesInvolved}</strong>
                    <span className="vs-metric-detail">ingressi in campo univoci</span>
                  </div>

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

                  <div className="vs-metric-card accent-neutral">
                    <span className="vs-metric-label">Fatti-Subiti</span>
                    <strong
                      className="vs-metric-value"
                      style={{
                        color: (aggregatedAnalysis.scored - aggregatedAnalysis.conceded) >= 0 ? 'var(--vs-heading)' : '#D32F2F',
                      }}
                    >
                      {(aggregatedAnalysis.scored - aggregatedAnalysis.conceded) > 0 ? '+' : ''}
                      {aggregatedAnalysis.scored - aggregatedAnalysis.conceded}
                    </strong>
                    <span className="vs-metric-detail">indica la differenza fra i punti fatti e quelli subiti</span>
                  </div>

                  <div className="vs-metric-card accent-orange">
                    <span className="vs-metric-label">Punti in fase break point (BP)</span>
                    <strong className="vs-metric-value">{aggregatedAnalysis.breakPoints ?? '–'}</strong>
                    <span className="vs-metric-detail">punti conquistati dalla squadra mentre è al servizio</span>
                  </div>

                  <div className="vs-metric-card accent-teal">
                    <span className="vs-metric-label">Punti conquistati in fase cambio palla (CP)</span>
                    <strong className="vs-metric-value">{aggregatedAnalysis.reception.pointsInReception}</strong>
                    <span className="vs-metric-detail">punti conquistati dalla squadra mentre è in ricezione</span>
                  </div>

                  <div className="vs-metric-card accent-teal">
                    <span className="vs-metric-label">Scambi in ricezione per cambio palla</span>
                    <strong className="vs-metric-value">
                      {aggregatedAnalysis.reception.meanRallies === null ? '–' : fmt(aggregatedAnalysis.reception.meanRallies)}
                    </strong>
                    <span className="vs-metric-detail">
                      media degli scambi, incluso il punto che riconquista il servizio
                    </span>
                    <span className="vs-metric-detail">
                      {aggregatedAnalysis.reception.meanLost === null ? '–' : fmt(aggregatedAnalysis.reception.meanLost)} punti subiti in media in fase cambio palla prima di riconquistare il servizio
                      {' · '}{aggregatedAnalysis.reception.completed} cambi palla ottenuti
                    </span>
                    <span className="vs-metric-detail">
                      Escluse le fasi terminate senza cambio palla a fine set
                    </span>
                  </div>
                </div>

                {/* Charts Grid */}
                <div className="vs-charts-grid">
                  <Chart
                    title="Rendimento per rotazione (P1–P6)"
                    subtitle="Punti in fase break point vs punti subiti in fase cambio palla"
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
                        BP = fase break point (squadra al servizio) · CP = fase cambio palla (squadra in ricezione).
                        TT = turni totali · MP = media punti per turno: conquistati in BP, subiti in CP.
                        % punti BP = quota dei punti in fase break point della rotazione sul totale in fase break point.
                      </p>
                    </div>
                  </div>

                  <div className="vs-table-wrap">
                    <table className="vs-table">
                      <thead>
                        <tr>
                          <th>Rotazione</th>
                          <th className="num-cell-header" title="Turni totali in fase break point">TT BP</th>
                          <th className="num-cell-header" title="Punti conquistati dalla squadra mentre è al servizio">Punti BP</th>
                          <th className="num-cell-header" title="Media punti conquistati per turno in fase break point">MP BP</th>
                          <th className="num-cell-header" title="Quota dei punti in fase break point della rotazione sul totale in fase break point">% punti BP</th>
                          <th className="num-cell-header" title="Turni totali in fase cambio palla">TT CP</th>
                          <th className="num-cell-header" title="Punti subiti in fase cambio palla: punti dell’avversario mentre la squadra è in ricezione">Punti subiti CP</th>
                          <th className="num-cell-header" title="Media punti subiti per turno in fase cambio palla">MP CP</th>
                          <th className="num-cell-header" title="MP BP meno MP CP: differenza tra le medie delle due fasi">Differenza MP</th>
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
                    Il punto che riconquista il servizio appartiene alla fase cambio palla e viene escluso dai punti in fase break point.
                    <strong>P1–P6</strong> identifica la rotazione dalla posizione del palleggiatore.
                    La differenza MP è la media punti conquistati in BP meno la media punti subiti in CP; non misura l’efficienza dei singoli fondamentali.
                  </p>
                </div>

                <div className="vs-card">
                  <div className="vs-card-header">
                    <div>
                      <h2 className="vs-card-title">{visibleMatches[0].gender === 'Femminile' ? 'Atlete entrate' : 'Atleti entrati'}</h2>
                      <p className="vs-card-subtitle">Dati ricavati dalle formazioni e dai turni registrati: i punti in fase break point sono della squadra, non del singolo atleta. I punti nei set sono il totale dei punti delle due squadre nei set in cui l’atleta risulta coinvolto, non i soli scambi da lui giocati. I servizi sono stimati dai progressivi dei turni.</p>
                    </div>
                  </div>
                  <div className="vs-table-wrap">
                    <table className="vs-table">
                      <thead>
                        <tr>
                          <th>Atleta</th>
                          <th className="num-cell-header">Punti nei set di presenza</th>
                          <th className="num-cell-header">Servizi stimati</th>
                          <th className="num-cell-header">Media servizi consecutivi stimati</th>
                          <th className="num-cell-header" title="Media punti della squadra per turno in fase break point con l’atleta al servizio">MP BP con atleta al servizio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {athleteStats(visibleMatches).map(player => (
                          <tr key={player.number}>
                            <td><strong>{player.number}</strong>{player.name ? ` · ${player.name}` : ''}</td>
                            <td className="num-cell">{player.pointsPlayed}</td>
                            <td className="num-cell">{player.services}</td>
                            <td className="num-cell">{fmt(player.averageConsecutive)}</td>
                            <td className="num-cell">{fmt(player.averagePointsAtServe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                    Le gare salvate in questo browser su questo dispositivo. Esporta un backup JSON per conservarle o trasferirle.
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
                            const selected = filteredMatches.filter(m => selectedHistoryIds.includes(m.id))
                            if (new Set(selected.map(m => m.team)).size > 1) {
                              setError('Per confrontare le rotazioni, seleziona gare della stessa squadra analizzata.')
                              return
                            }
                            const first = selected[0]
                            if (first) setSelectedTeam(first.team)
                            selectMatchesForAnalysis(selected.map(m => m.id))
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
                              checked={filteredMatches.length > 0 && filteredMatches.every(m => selectedHistoryIds.includes(m.id))}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedHistoryIds(filteredMatches.map(m => m.id))
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
                        {[...filteredMatches].reverse().map((m) => {
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
                                <div className="vs-metric-detail">{matchHeading(m)}</div>
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
                                          libero: s.opponentLibero || { onCourt: '', entered: '', otherEntered: '' },
                                          opponentLibero: s.libero || { onCourt: '', entered: '', otherEntered: '' },
                                          liberoReplacements: s.opponentLiberoReplacements || [],
                                          opponentLiberoReplacements: s.liberoReplacements || [],
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
                I PDF caricati non vengono inviati a un server per essere analizzati. I referti salvati e i dati estratti rimangono sul dispositivo,
                nell’archivio locale del browser tramite IndexedDB. L’archivio è associato al browser e al dispositivo utilizzati.
                Con &quot;Esporta backup&quot; puoi salvare un file JSON con le gare e i PDF e ripristinarlo su un altro dispositivo.
                La cancellazione dei dati del sito o del browser può comportare la perdita dell’archivio se non hai esportato un backup.
                Font, script e risorse sono inclusi nell’applicazione: l’elaborazione non dipende da servizi esterni.
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

        {/* TAB 4: INFORMAZIONI */}
        {activeTab === 'info' && (
          <section>
            <div className="vs-card">
              <h1 className="vs-card-title">Cos’è Referto Volley</h1>
              <p>
                Referto Volley permette di analizzare i dati contenuti nel referto di gara della pallavolo e di osservare il rendimento della squadra nelle diverse rotazioni e nelle fasi break point e cambio palla.
              </p>
            </div>

            <div className="vs-card">
              <h2 className="vs-card-title">Come funziona l’analisi</h2>
              <p>
                Carica un referto PDF compatibile oppure compila una gara manualmente. Prima di salvare, verifica squadre,
                atleti, palleggiatore, punteggi e turni registrati. Dai progressivi del referto l’applicazione ricava i punti
                nelle due fasi e li raggruppa per rotazione. Puoi consultare tabelle e grafici ed esportare il report in PDF.
              </p>
              <p>
                Il referto non indica quale fondamentale abbia prodotto ogni punto. Questi dati descrivono il rendimento
                della squadra nelle fasi di gioco e non misurano l’efficienza di attacco, ricezione, muro o altri fondamentali.
              </p>
            </div>

            <div className="vs-card">
              <h2 className="vs-card-title">Fase break point e fase cambio palla</h2>
              <p>
                <strong>Fase break point (BP)</strong>: la squadra è al servizio. I punti in fase break point sono
                i punti conquistati dalla squadra mentre è al servizio, qualunque sia il fondamentale che li ha prodotti.
              </p>
              <p>
                <strong>Fase cambio palla (CP)</strong>: la squadra è in ricezione. I punti subiti in fase cambio palla
                sono i punti conquistati dall’avversario mentre la squadra è in ricezione prima che riconquisti il servizio.
                Il punto che riconquista il servizio è invece un punto conquistato in fase cambio palla e non rientra nei punti in fase break point.
              </p>
              <ul>
                <li><strong>TT — turni totali</strong>: turni conteggiati nella fase indicata, BP o CP.</li>
                <li><strong>MP — media punti per turno</strong>: punti conquistati divisi per i turni in BP; punti subiti divisi per i turni in CP.</li>
                <li><strong>% punti BP</strong>: quota dei punti in fase break point della rotazione sul totale in fase break point.</li>
                <li><strong>Differenza MP</strong>: MP BP meno MP CP. Confronta le medie delle due fasi, non i punti totali della gara.</li>
              </ul>
              <p>
                La media degli scambi in ricezione per cambio palla include il punto che riconquista il servizio.
                Questo indicatore esclude le fasi terminate a fine set senza riconquistare il servizio.
              </p>
            </div>

            <div className="vs-card">
              <h2 className="vs-card-title">Rotazioni P1–P6</h2>
              <p>
                P1–P6 identifica ciascuna rotazione dalla posizione del palleggiatore: P1 in zona 1, P2 in zona 2,
                fino a P6 in zona 6. La posizione iniziale del palleggiatore nel set permette di associare i turni
                alle rotazioni successive. Verifica chi gioca al palleggio prima di salvare il referto.
              </p>
              <p>
                Tabelle e grafici confrontano i punti in fase break point e i punti subiti in fase cambio palla per ciascuna rotazione.
              </p>
            </div>

            <div className="vs-card">
              <h2 className="vs-card-title">Analisi di più gare</h2>
              <p>
                Nella scheda Analisi referto puoi scegliere una gara, tutte le gare della squadra o una selezione.
                Puoi anche selezionare più gare della stessa squadra nello Storico. L’analisi aggregata somma punti e turni
                per rotazione e calcola le medie sui totali: non è la media semplice delle medie delle singole gare.
              </p>
            </div>

            <div className="vs-card">
              <h2 className="vs-card-title">Dati, privacy e funzionamento locale</h2>
              <p>
                Referto Volley è progettato per elaborare i referti localmente nel browser. I PDF caricati non vengono inviati
                a un server per essere analizzati. I dati estratti rimangono sul dispositivo dell’utente.
                Le gare salvate e i PDF vengono conservati localmente nel browser tramite IndexedDB.
              </p>
              <p>
                L’archivio rimane associato al browser e al dispositivo utilizzati. Dallo Storico puoi esportare un backup JSON
                con gare e PDF e ripristinarlo anche su un altro dispositivo. La cancellazione dei dati del sito o del browser
                può comportare la perdita dell’archivio locale se non hai esportato un backup.
              </p>
              <p>
                Referto Volley non utilizza cookie di profilazione, analytics o pubblicitari e non utilizza cookie per memorizzare i dati delle gare.
                L’archivio dell’applicazione viene conservato localmente nel browser tramite IndexedDB.
                Il codice applicativo non imposta cookie e non integra servizi di analytics, tracking, pubblicità o telemetria.
              </p>
              <p>
                Font, script e risorse sono distribuiti con l’applicazione e non vengono caricati da servizi esterni.
                La versione web richiede una connessione per caricare il sito; le applicazioni Tauri includono le risorse per l’uso locale.
                L’archivio di ogni applicazione è separato da quello del browser: usa il backup JSON per trasferire le gare.
              </p>
            </div>

            <div className="vs-card">
              <h2 className="vs-card-title">Progetto, autori e licenza</h2>
              <p>
                Referto Volley è un progetto di <a href="https://github.com/napo" target="_blank" rel="noopener noreferrer">Maurizio Napolitano</a>,
                basato sul modello di analisi delle rotazioni sviluppato da Andrea Fortunati in un foglio di calcolo Excel.
              </p>
              <p>
                Il credito ad Andrea Fortunati riguarda il modello di analisi delle rotazioni nel foglio Excel.
                L’importazione PDF, l’interfaccia, l’archivio locale e le altre funzionalità dell’applicazione sono sviluppi del progetto software.
              </p>
              <p>Il software è distribuito con licenza <a href="https://github.com/napo/analisirefertogara/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">WTFPL — Do What The Fuck You Want To Public License, Version 2</a>.</p>
            </div>
          </section>
        )}

        {/* FOOTER */}
        <footer className="vs-footer">
          <div>
            <strong>Referto Volley</strong> — Analisi e lettura referti di gara della pallavolo
            <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--vs-muted)', marginTop: '0.2rem' }}>
              Progetto di Maurizio Napolitano, basato sul modello di analisi delle rotazioni sviluppato da Andrea Fortunati in un foglio di calcolo Excel.
            </span>
          </div>
          <div>
            <span>Analisi dei PDF nel browser · Archivio locale tramite IndexedDB</span>
            <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.2rem' }}>
              <a href="https://github.com/napo/analisirefertogara/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">WTFPL — Do What The Fuck You Want To Public License, Version 2</a>
            </span>
          </div>
        </footer>
      </main>
    </div>
  )
}

// Subcomponent: Verification & Review Card for imported PDF or manual entry
function DraftReviewCard({ draft, setDraft, onCancel, onSave, onAddSet, onRemoveSet, busy }) {
  const [sourceUrl, setSourceUrl] = useState('')
  const sideA = draft.sideA || (draft.selectedSide === 'B' ? draft.opponent : draft.team)
  const sideB = draft.sideB || (draft.selectedSide === 'B' ? draft.team : draft.opponent)

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
            Inserisci o verifica i dati delle squadre, i punteggi, i turni di battuta e il libero per ogni set.
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
                        libero: s.opponentLibero || { onCourt: '', entered: '', otherEntered: '' },
                        opponentLibero: s.libero || { onCourt: '', entered: '', otherEntered: '' },
                        liberoReplacements: s.opponentLiberoReplacements || [],
                        opponentLiberoReplacements: s.liberoReplacements || [],
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
              value={draft.selectedSide || 'A'}
              onChange={(event) => {
                if (event.target.value === (draft.selectedSide || 'A')) return
                setDraft(d => applySetter({
                  ...d,
                  selectedSide: event.target.value,
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
                    libero: s.opponentLibero || { onCourt: '', entered: '', otherEntered: '' },
                    opponentLibero: s.libero || { onCourt: '', entered: '', otherEntered: '' },
                    liberoReplacements: s.opponentLiberoReplacements || [],
                    opponentLiberoReplacements: s.liberoReplacements || [],
                    rotation: '',
                  })),
                }))
              }}
            >
              <option value="A">{sideA} (squadra A)</option>
              <option value="B">{sideB} (squadra B)</option>
            </select>
          </div>
        )}

        {[['championship', 'Campionato / serie'], ['number', 'Numero gara']].map(([key, label]) => (
          <label className="vs-field" key={key}>
            <span>{label}</span>
            <input value={draft[key] || ''} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />
          </label>
        ))}
        <label className="vs-field">
          <span>Divisione</span>
          <select value={draft.gender || ''} onChange={e => setDraft({ ...draft, gender: e.target.value })}>
            <option value="">Non indicata</option>
            <option>Maschile</option><option>Femminile</option>
          </select>
        </label>

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

      {draft.roster?.length > 0 && (
        <div
          style={{
            display: 'block',
            marginBottom: '1.25rem',
          }}
        >
          {(() => {
            const name = draft.team || 'Squadra analizzata'
            const roster = draft.roster || []
            const rosterKey = 'roster'
            return (
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
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '3.5rem minmax(0, 1fr) 2.4rem',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--vs-muted)',
                    fontSize: '0.75rem',
                    textAlign: 'center',
                  }}
                >
                  <span />
                  <span style={{ textAlign: 'left' }}>Atleta</span>
                  <strong title="Imposta chi gioca al palleggio">p</strong>
                </div>
                {roster.map((entry, index) => {
                  const player = rosterPlayer(entry)
                  return (
                  <div
                    key={`${player.number}-${index}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '3.5rem minmax(0, 1fr) 2.4rem',
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
                    <input
                      type="checkbox"
                      checked={isSetter(player)}
                      disabled={!isSetter(player) && roster.map(rosterPlayer).filter(isSetter).length >= 3}
                      aria-label={`Imposta chi gioca al palleggio: ${player.name || `maglia ${player.number}`}`}
                      title="Imposta chi gioca al palleggio"
                      onChange={event => setDraft(draftValue => {
                        const nextRoster = (draftValue[rosterKey] || []).map((current, currentIndex) => {
                          const currentPlayer = rosterPlayer(current)
                          return currentIndex === index
                            ? { ...currentPlayer, isSetter: event.target.checked, setterRole: '' }
                            : currentPlayer
                        })
                        const nextDraft = { ...draftValue, [rosterKey]: nextRoster }
                        return rosterKey === 'roster' ? updateSetterRotations(nextDraft) : nextDraft
                      })}
                    />
                  </div>
                  )
                })}
              </div>
            </div>
            )
          })()}
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
          I dati e il referto saranno salvati nell’archivio locale del browser tramite IndexedDB. Esporta un backup dallo Storico per conservarne una copia.
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

        <div className="vs-set-data-layout">
          <div className="vs-turn-grid">
            {[
              { key: 'own', liberoKey: 'libero', name: team },
              { key: 'other', liberoKey: 'opponentLibero', name: opponent },
            ].map(({ key, liberoKey, name }) => {
              const libero = s[liberoKey] || {}
              const liberoFields = {
                onCourt: liberoValues(libero, 'onCourt'),
                entered: liberoValues(libero, 'entered'),
                otherEntered: liberoValues(libero, 'otherEntered'),
              }
              return (
                <div key={key}>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: '0.35rem', color: 'var(--vs-heading)' }}>
                    {name}
                  </h4>
                  <div className="vs-table-wrap">
                <table className="vs-grid-table">
                  <thead>
                    <tr>
                      <th>Giro</th>
                      {['I', 'II', 'III', 'IV', 'V', 'VI'].map(v => <th key={v}>{v}</th>)}
                      <th colSpan="3">Libero</th>
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
                        {Object.entries(liberoFields).map(([field, values]) => (
                          <td key={field}>
                            <input
                              aria-label={`Set ${index + 1}, ${name}, giro ${r + 1}, libero ${field}`}
                              value={values[r]}
                              maxLength={3}
                              onChange={event => {
                                const values = liberoValues(libero, field)
                                values[r] = event.target.value
                                update({ [liberoKey]: { ...libero, [field]: values } })
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
                </div>
              )
            })}
          </div>
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

