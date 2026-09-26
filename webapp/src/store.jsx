import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { listMatches, saveMatch as dbSaveMatch, deleteMatch as dbDeleteMatch, saveMany as dbSaveMany, backup as dbBackup } from './storage'
import { analyze, validateMatch } from './analysis'
import { importPdf } from './pdf'
import { applySetter, refreshImportedMatch } from './pdf-parser'
import { emptyFilters, filterMatches } from './match-filters'

export function createBlankSet(number) {
  return {
    number,
    rotation: '',
    scoreOwn: 0,
    scoreOther: 0,
    durationMinutes: '',
    lineup: ['', '', '', '', '', ''],
    opponentLineup: ['', '', '', '', '', ''],
    libero: { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
    opponentLibero: { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
    own: Array(36).fill(''),
    other: Array(36).fill(''),
  }
}

export function createBlankMatch() {
  const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
  return {
    id: hash,
    team: '',
    opponent: '',
    date: '2027-02-20',
    location: '',
    venue: '',
    number: '',
    championship: '',
    event: '',
    gender: '',
    roster: [],
    opponentRoster: [],
    fileName: 'Compilazione manuale',
    isManual: true,
    referees: {
      first: '',
      firstCity: '',
      second: '',
      scorer: '',
      scorerCity: '',
    },
    sets: [
      createBlankSet(1),
    ],
  }
}

const MatchStoreContext = createContext(null)

export function MatchStoreProvider({ children }) {
  const [matches, setMatches] = useState([])
  const [filters, setFilters] = useState(emptyFilters)
  const filteredMatches = useMemo(() => filterMatches(matches, filters), [matches, filters])
  const [selectedMatchId, setSelectedMatchId] = useState('all')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [activeTab, setActiveTab] = useState('reports') // 'reports' = "Referti di gara", 'analysis' = "Analisi referto", 'history' = "Storico gare"
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [latestMatchId, setLatestMatchId] = useState(null)
  const [selectedMatchIds, setSelectedMatchIds] = useState([])

  const updateFilters = useCallback(next => {
    setFilters(next)
    setSelectedMatchId('all')
    setSelectedMatchIds([])
  }, [])

  // Load matches from IndexedDB and enrich with calculated analysis in React state
  const refresh = useCallback(async () => {
    try {
      const data = await listMatches()
      const enriched = data.map(m => {
        let singleAnalysis = null
        try {
          singleAnalysis = analyze([m])
        } catch (e) {
          console.warn('Errore calcolo analisi per gara:', m.id, e)
        }
        return {
          ...m,
          analysis: singleAnalysis,
        }
      }).sort((a, b) => a.date.localeCompare(b.date))
      setMatches(enriched)
    } catch (e) {
      setError(`Archivio locale non disponibile: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Unique teams
  const teams = useMemo(() => {
    return [...new Set(filteredMatches.map(m => m.team).filter(Boolean))]
  }, [filteredMatches])

  const activeTeam = useMemo(() => {
    if (teams.includes(selectedTeam)) return selectedTeam
    return teams[0] || ''
  }, [teams, selectedTeam])

  const teamMatches = useMemo(() => {
    return filteredMatches.filter(m => m.team === activeTeam)
  }, [filteredMatches, activeTeam])

  // In dropdown and listings, present the latest/most recently loaded match first!
  const sortedTeamMatches = useMemo(() => {
    const list = [...teamMatches]
    if (latestMatchId) {
      list.sort((a, b) => {
        if (a.id === latestMatchId) return -1
        if (b.id === latestMatchId) return 1
        return b.date.localeCompare(a.date)
      })
    } else {
      list.sort((a, b) => b.date.localeCompare(a.date))
    }
    return list
  }, [teamMatches, latestMatchId])

  const visibleMatches = useMemo(() => {
    if (selectedMatchId === 'all') {
      return teamMatches
    }
    if (selectedMatchId === 'custom') {
      const filtered = teamMatches.filter(m => selectedMatchIds.includes(m.id))
      return filtered
    }
    return teamMatches.filter(m => m.id === selectedMatchId)
  }, [teamMatches, selectedMatchId, selectedMatchIds])

  // Aggregated analysis for visible matches
  const aggregatedAnalysis = useMemo(() => {
    if (!visibleMatches.length) return null
    try {
      return analyze(visibleMatches)
    } catch (e) {
      return { error: e.message }
    }
  }, [visibleMatches])

  // Select a subset of matches for aggregated analysis and jump to analysis tab
  const selectMatchesForAnalysis = useCallback((ids) => {
    if (!ids || ids.length === 0) {
      setSelectedMatchIds([])
      setSelectedMatchId('all')
    } else if (ids.length === 1) {
      setSelectedMatchIds(ids)
      setSelectedMatchId(ids[0])
    } else {
      setSelectedMatchIds(ids)
      setSelectedMatchId('custom')
    }
    setActiveTab('analysis')
  }, [])

  // Toggle selection of a specific match
  const toggleMatchSelection = useCallback((id) => {
    setSelectedMatchIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      if (next.length === 0) {
        setSelectedMatchId('all')
      } else if (next.length === 1) {
        setSelectedMatchId(next[0])
      } else {
        setSelectedMatchId('custom')
      }
      return next
    })
  }, [])

  // Read a new PDF scoresheet file
  const readPdfFile = useCallback(async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const parsed = await importPdf(file)
      const existing = matches.find(m => m.id === parsed.id)
      const prepared = existing ? refreshImportedMatch(existing, parsed) : applySetter(parsed)
      if (existing) setMessage('Referto già presente: verifica i nomi e salva per aggiornare la gara esistente.')
      setDraft(prepared)
      setLatestMatchId(prepared.id)
      setActiveTab('reports')
    } catch (e) {
      setError(e.message || 'Errore durante la lettura del PDF.')
    } finally {
      setBusy(false)
    }
  }, [matches])

  // Start a new manual match entry
  const startManualEntry = useCallback(() => {
    setError('')
    setMessage('')
    const blank = createBlankMatch()
    setDraft(blank)
    setActiveTab('reports')
  }, [])

  // Add an extra set to draft (up to 6 sets for Golden Set)
  const addSetToDraft = useCallback(() => {
    setDraft(d => {
      if (!d || d.sets.length >= 6) return d
      const nextNum = d.sets.length + 1
      return {
        ...d,
        sets: [...d.sets, createBlankSet(nextNum)],
      }
    })
  }, [])

  // Remove the last set from draft (minimum 1 set)
  const removeLastSetFromDraft = useCallback(() => {
    setDraft(d => {
      if (!d || d.sets.length <= 1) return d
      return {
        ...d,
        sets: d.sets.slice(0, -1),
      }
    })
  }, [])

  // Save the verified draft into IndexedDB and local React store
  const saveDraft = useCallback(async (customDraft = draft) => {
    if (!customDraft) return false
    const issues = validateMatch(customDraft)
    if (issues.length) {
      setError(issues.join(' '))
      return false
    }
    setBusy(true)
    setError('')
    try {
      let singleAnalysis = null
      try {
        singleAnalysis = analyze([customDraft])
      } catch (calcErr) {
        console.warn('Avviso calcolo analisi per gara:', calcErr)
      }
      const persistedMatch = { ...customDraft }
      delete persistedMatch.analysis
      await dbSaveMatch(persistedMatch)
      const savedMatch = { ...persistedMatch, analysis: singleAnalysis }
      setMatches(prev => {
        const filtered = prev.filter(m => m.id !== persistedMatch.id)
        return [...filtered, savedMatch].sort((a, b) => a.date.localeCompare(b.date))
      })
      setLatestMatchId(customDraft.id)
      setFilters(emptyFilters)
      setSelectedTeam(customDraft.team)
      setSelectedMatchId(customDraft.id)
      setDraft(null)
      setActiveTab('analysis')
      setMessage(`Gara ${customDraft.team} vs ${customDraft.opponent} salvata nell’archivio locale del browser.`)
      return true
    } catch (e) {
      console.error(e)
      setError(`Salvataggio non riuscito: ${e.message}`)
      return false
    } finally {
      setBusy(false)
    }
  }, [draft])

  // Update existing match
  const updateMatch = useCallback(async (match) => {
    const issues = validateMatch(match)
    if (issues.length) {
      setError(issues.join(' '))
      return false
    }
    setBusy(true)
    setError('')
    try {
      const singleAnalysis = analyze([match])
      const persistedMatch = { ...match }
      delete persistedMatch.analysis
      await dbSaveMatch(persistedMatch)
      const updated = { ...persistedMatch, analysis: singleAnalysis }
      setMatches(prev => prev.map(m => m.id === match.id ? updated : m))
      setMessage('Gara aggiornata con successo.')
      return true
    } catch (e) {
      setError(`Modifica non riuscita: ${e.message}`)
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  // Delete a match
  const deleteMatch = useCallback(async (id) => {
    setBusy(true)
    setError('')
    try {
      await dbDeleteMatch(id)
      setMatches(prev => prev.filter(m => m.id !== id))
      if (selectedMatchId === id) setSelectedMatchId('all')
      setMessage('Referto e analisi rimossi dall’archivio locale.')
      return true
    } catch (e) {
      setError(`Eliminazione non riuscita: ${e.message}`)
      return false
    } finally {
      setBusy(false)
    }
  }, [selectedMatchId])

  // Export JSON backup with embedded PDFs
  const exportBackup = useCallback(async () => {
    try {
      const json = await dbBackup(matches)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `referto-volley-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setError(`Errore durante l’esportazione: ${e.message}`)
    }
  }, [matches])

  // Restore backup from JSON file
  const restoreBackup = useCallback(async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (file.size > 100 * 1024 * 1024) throw Error('File di backup troppo grande (massimo 100 MB).')
      const text = await file.text()
      const b = JSON.parse(text)
      if (b.version !== 1 || !Array.isArray(b.matches) || b.matches.length > 1000) {
        throw Error('Formato backup non valido.')
      }
      const incoming = []
      for (const m of b.matches) {
        if (!m || typeof m.id !== 'string' || !/^[a-f0-9]{64}$/.test(m.id) || validateMatch(m).length) {
          throw Error('Il backup contiene gare non valide.')
        }
        analyze([m])
        if (m.pdf && !/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(m.pdf)) {
          throw Error('PDF del backup non valido.')
        }
        const pdf = m.pdf ? new Blob([Uint8Array.from(atob(m.pdf.split(',')[1]), c => c.charCodeAt(0))], { type: 'application/pdf' }) : null
        if (!matches.some(x => x.id === m.id)) {
          incoming.push({ ...m, pdf })
        }
      }
      await dbSaveMany(incoming)
      await refresh()
      setMessage(`${incoming.length} gare ripristinate nell’archivio locale.`)
    } catch (e) {
      setError(`Ripristino non riuscito: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }, [matches, refresh])

  const contextValue = useMemo(() => ({
    matches, filteredMatches, filters, updateFilters,
    teams,
    activeTeam,
    selectedTeam,
    setSelectedTeam,
    selectedMatchId,
    setSelectedMatchId,
    latestMatchId,
    setLatestMatchId,
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
    updateMatch,
    deleteMatch,
    exportBackup,
    restoreBackup,
  }), [
    matches, filteredMatches, filters, updateFilters,
    teams,
    activeTeam,
    selectedTeam,
    selectedMatchId,
    latestMatchId,
    selectedMatchIds,
    sortedTeamMatches,
    selectMatchesForAnalysis,
    toggleMatchSelection,
    teamMatches,
    visibleMatches,
    aggregatedAnalysis,
    activeTab,
    draft,
    loading,
    busy,
    message,
    error,
    readPdfFile,
    startManualEntry,
    addSetToDraft,
    removeLastSetFromDraft,
    saveDraft,
    updateMatch,
    deleteMatch,
    exportBackup,
    restoreBackup,
  ])

  return (
    <MatchStoreContext.Provider value={contextValue}>
      {children}
    </MatchStoreContext.Provider>
  )
}

export function useMatchStore() {
  const context = useContext(MatchStoreContext)
  if (!context) {
    throw new Error('useMatchStore deve essere utilizzato all’interno di un MatchStoreProvider')
  }
  return context
}
