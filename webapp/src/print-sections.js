// Blocks of the analysis page that can be left out of the PDF report ("Includi nel PDF").
// Every block is included by default. The choice is a per-browser convenience (localStorage): if the
// storage is not available the defaults apply.
export const PRINT_SECTIONS = [
  { id: 'summary', label: 'Riepilogo' },
  { id: 'charts', label: 'Grafici' },
  { id: 'rotations', label: 'Le sei rotazioni a confronto' },
  { id: 'flow', label: 'Andamento della gara' },
  { id: 'athletes', label: 'Atleti entrati' },
  { id: 'matchup', label: 'Confronto delle rotazioni' },
  { id: 'matchup-sets', label: 'Confronto delle rotazioni set per set' },
  { id: 'configurations', label: 'Configurazioni in campo' },
  { id: 'glossary', label: 'Glossario' },
]

const KEY = 'referto-volley.print-sections'
export const defaultPrintSections = () => Object.fromEntries(PRINT_SECTIONS.map(section => [section.id, true]))

export function loadPrintSections() {
  const defaults = defaultPrintSections()
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}')
    for (const id of Object.keys(defaults)) if (typeof saved[id] === 'boolean') defaults[id] = saved[id]
  } catch {
    // storage not available (private mode, blocked site data): defaults
  }
  return defaults
}

export function savePrintSections(sections) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(sections))
  } catch {
    // not persisted: the choice still applies to this session
  }
}
