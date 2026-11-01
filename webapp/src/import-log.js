// Steps of a long import, as a short chronology: each step with the time it started and ended, counted from
// the beginning of the import. The last step has no end yet: it is the one in progress.

// New log with `text` as the step in progress; the same text again changes nothing
export function advanceLog(log, text, now) {
  const last = log.at(-1)
  if (last?.text === text) return log
  const started = log.length ? log[0].start : now
  return [...log.slice(0, -1), ...(last ? [{ ...last, end: now }] : []), { text, start: now, end: null, origin: started }]
}

// The steps to show: the last one finished and the one in progress
export const visibleSteps = log => log.slice(-2)

// Milliseconds as mm:ss
export function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
