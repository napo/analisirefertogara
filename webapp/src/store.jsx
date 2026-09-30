import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { listMatches, saveMatch as dbSaveMatch, deleteMatch as dbDeleteMatch, saveMany as dbSaveMany } from './storage'
import { ARCHIVE_MIME, archiveFileName, buildArchive, importSummary, planImport } from './archive.js'
import { APP_VERSION } from './version.js'
import { analyze, validateMatch } from './analysis'
import { importPdf } from './pdf'
import { emptySubstitutions, emptyTimeouts, refreshImportedMatch } from './pdf-parser'
import { emptyFilters, filterMatches } from './match-filters'
import { swapTeams } from './match-teams.js'

export function createBlankSet(number) {
  return {
    number,
    rotation: '',
    scoreOwn: 0,
    scoreOther: 0,
    durationMinutes: '',
    lineup: ['', '', '', '', '', ''],
    opponentLineup: ['', '', '', '', '', ''],
    substituteNumbers: [],
    opponentSubstituteNumbers: [],
    substitutions: emptySubstitutions(),
    opponentSubstitutions: emptySubstitutions(),
    timeouts: emptyTimeouts(),
    opponentTimeouts: emptyTimeouts(),
    libero: { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
    opponentLibero: { onCourt: Array(6).fill(''), entered: Array(6).fill(''), otherEntered: Array(6).fill('') },
    own: Array(36).fill(''),
    other: Array(36).fill(''),
  }
}

// Today's date (local time) as YYYY-MM-DD
const today = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function createBlankMatch() {
  const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
  return {
    id: hash,
    team: '',
    opponent: '',
    date: today(),
    location: '',
    venue: '',
    number: '',
    championship: '',
    event: '',
    gender: '',
    roster: [],
    opponentRoster: [],
    notes: '',
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
  const [progress, setProgress] = useState('') // phase of a long import (OCR)
  const [error, setError] = useState('')

  const [latestMatchId, setLatestMatchId] = useState(null)
  const [selectedMatchIds, setSelectedMatchIds] = useState([])
  // "Inverti": id of the saved match shown from the opponent's point of view. Only a view: the archive
  // keeps the match as saved; any other selection closes it.
  const [invertedId, setInvertedId] = useState(null)

  const selectTeam = useCallback(team => {
    setInvertedId(null)
    setSelectedTeam(team)
  }, [])
  const selectMatch = useCallback(id => {
    setInvertedId(null)
    setSelectedMatchId(id)
  }, [])

  const updateFilters = useCallback(next => {
    setInvertedId(null)
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

  // The inverted view of a saved match, with its own analysis (never persisted)
  const invertedView = useMemo(() => {
    const original = invertedId && matches.find(m => m.id === invertedId)
    if (!original) return null
    const view = swapTeams(original)
    let analysis = null
    try {
      analysis = analyze([view])
    } catch (e) {
      console.warn('Errore calcolo analisi invertita per gara:', view.id, e)
    }
    return { ...view, analysis, invertedView: true }
  }, [invertedId, matches])

  const activeTeam = useMemo(() => {
    if (invertedView) return invertedView.team
    if (teams.includes(selectedTeam)) return selectedTeam
    return teams[0] || ''
  }, [teams, selectedTeam, invertedView])

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
    if (invertedView) return [invertedView]
    if (selectedMatchId === 'all') {
      return teamMatches
    }
    if (selectedMatchId === 'custom') {
      const filtered = teamMatches.filter(m => selectedMatchIds.includes(m.id))
      return filtered
    }
    return teamMatches.filter(m => m.id === selectedMatchId)
  }, [teamMatches, selectedMatchId, selectedMatchIds, invertedView])

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
    setInvertedId(null)
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
    setInvertedId(null)
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

  // Show the analysis of a saved match from the opponent's point of view, without changing the archive
  const viewInverted = useCallback(match => {
    if (!match) return
    const id = match.invertedView ? null : match.id
    if (!id) {
      // already inverted: back to the match as saved
      const original = matches.find(m => m.id === match.id)
      setInvertedId(null)
      if (original) {
        setSelectedTeam(original.team)
        setSelectedMatchId(original.id)
      }
    } else {
      setSelectedTeam(match.team)
      setSelectedMatchId(id)
      setInvertedId(id)
    }
    setActiveTab('analysis')
  }, [matches])
  const closeInvertedView = useCallback(() => setInvertedId(null), [])

  // The match as saved in the archive (for the inverted view: the original, not the swapped copy)
  const savedMatch = useCallback(match => (match?.invertedView ? matches.find(m => m.id === match.id) || null : match), [matches])

  // Read a new PDF scoresheet file
  const readPdfFile = useCallback(async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const parsed = await importPdf(file, { onProgress: setProgress })
      const existing = matches.find(m => m.id === parsed.id)
      const prepared = existing ? refreshImportedMatch(existing, parsed) : parsed
      if (existing) setMessage(parsed.sourceFormat === 'FIPAV' && (existing.parserVersion || 0) < 2
        ? 'Corrette le associazioni delle squadre: rose, formazioni, liberi, punteggi e turni sono stati riletti dal PDF. Verifica i dati e reimposta le rotazioni del palleggiatore prima di salvare.'
        : parsed.sourceFormat === 'FIPAV' && (existing.parserVersion || 0) < 3
          ? 'Aggiornati gli ingressi del libero e le sostituzioni dal PDF. Verifica e salva per correggere il numero di atleti coinvolti.'
          : 'Referto già presente: verifica i nomi e salva per aggiornare la gara esistente.')
      setDraft(prepared)
      setLatestMatchId(prepared.id)
      setActiveTab('reports')
    } catch (e) {
      setError(e.message || 'Errore durante la lettura del PDF.')
    } finally {
      setBusy(false)
      setProgress('')
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
  const saveDraft = useCallback(async (inputDraft = draft) => {
    if (!inputDraft) return false
    // Manual entry may leave athlete rows without a jersey number: drop them
    const customDraft = inputDraft.roster
      ? { ...inputDraft, roster: inputDraft.roster.filter(player => String(typeof player === 'object' ? player.number : player ?? '').trim() !== '') }
      : inputDraft
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
      setInvertedId(null)
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

  // Update existing match. From the inverted view (setters, setter choices) the change is saved on the
  // match as stored, with the teams swapped back: the archive never takes the inverted perspective.
  const updateMatch = useCallback(async (input) => {
    let match = input
    if (input?.invertedView) {
      match = swapTeams(input)
      delete match.invertedView
    }
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
      setInvertedId(current => (current === id ? null : current))
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

  // Export the archive (all matches, or the selected ones) as a .zrv file (ZIP: documented JSON, CSV
  // tables, original PDFs)
  const exportBackup = useCallback(async (selected = matches) => {
    const chosen = Array.isArray(selected) && selected.length ? selected : matches
    try {
      const bytes = await buildArchive(chosen, { appVersion: APP_VERSION })
      const blob = new Blob([bytes], { type: ARCHIVE_MIME })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = archiveFileName()
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage(`Archivio esportato: ${chosen.length} ${chosen.length === 1 ? 'gara' : 'gare'}.`)
    } catch (e) {
      setError(`Errore durante l’esportazione: ${e.message}`)
    }
  }, [matches])

  // Import an archive (.zrv) or an older JSON backup, also to restore one. Atomic: the whole file is read
  // and checked first (planImport); the local archive changes only if there is no problem at all, and the
  // new matches are written in a single IndexedDB transaction (saveMany). Matches already present (same id)
  // are left as they are.
  const importArchive = useCallback(async (file) => {
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    setProgress('Importazione archivio…')
    try {
      if (file.size > 300 * 1024 * 1024) throw Error('Il file supera il limite di 300 MB.')
      const plan = planImport(new Uint8Array(await file.arrayBuffer()), matches.map(m => m.id))
      const summary = importSummary(plan)
      if (!plan.ok) {
        setError([summary.title, ...summary.lines].join('\n'))
        return
      }
      if (plan.toImport.length) {
        await dbSaveMany(plan.toImport)
        await refresh()
      }
      setMessage([summary.title, ...summary.lines].join('\n'))
    } catch (e) {
      setError(`Importazione non riuscita.\n${e.message}`)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }, [matches, refresh])

  const contextValue = useMemo(() => ({
    matches, filteredMatches, filters, updateFilters,
    teams,
    activeTeam,
    selectedTeam,
    setSelectedTeam: selectTeam,
    selectedMatchId,
    setSelectedMatchId: selectMatch,
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
    progress,
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
    importArchive,
    invertedView,
    viewInverted,
    closeInvertedView,
    savedMatch,
  }), [
    matches, filteredMatches, filters, updateFilters,
    teams,
    activeTeam,
    selectedTeam,
    selectTeam,
    selectedMatchId,
    selectMatch,
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
    progress,
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
    importArchive,
    invertedView,
    viewInverted,
    closeInvertedView,
    savedMatch,
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
