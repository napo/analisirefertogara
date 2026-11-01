// Chronology of the import in progress: the last step finished, faded, and the current one with its time running
import { useEffect, useState } from 'react'
import { formatElapsed, visibleSteps } from './import-log.js'

export default function ImportLog({ log }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  return (
    <ol className="vs-import-log">
      {visibleSteps(log).map(step => {
        const running = step.end === null
        return (
          <li key={step.start + step.text} className={running ? 'vs-import-log-current' : 'vs-import-log-done'}>
            {/* the running time is not announced: a screen reader would read it every second */}
            <span className="vs-import-log-time" aria-hidden="true">
              {formatElapsed(step.start - step.origin)} → {formatElapsed((running ? Math.max(now, step.start) : step.end) - step.origin)}
            </span>
            <span role={running ? 'status' : undefined} aria-live={running ? 'polite' : undefined}>{step.text}</span>
          </li>
        )
      })}
    </ol>
  )
}
