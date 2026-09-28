// Table that scrolls horizontally, with a discreet arrow on the right edge of the visible part of every
// row while more columns are hidden on the right: "Vedi altre informazioni", a click scrolls the table to
// the right. Recomputed on scroll and whenever the table or the window changes size.
import { useEffect, useRef, useState } from 'react'

export default function ScrollableTable({ children, className = 'vs-table-wrap' }) {
  const ref = useRef(null)
  const [rows, setRows] = useState([]) // { top, height } of the body rows, relative to the frame

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const update = () => {
      const more = element.scrollLeft + element.clientWidth < element.scrollWidth - 4
      const frameTop = element.parentElement.getBoundingClientRect().top
      setRows(more
        ? [...element.querySelectorAll('tbody tr')].map(row => {
          const box = row.getBoundingClientRect()
          return { top: box.top - frameTop, height: box.height }
        })
        : [])
    }
    const frame = requestAnimationFrame(update)
    element.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [])

  const scrollRight = () => {
    const element = ref.current
    element?.scrollBy({ left: Math.max(160, element.clientWidth * 0.6), behavior: 'smooth' })
  }

  return (
    <div className="vs-scroll-frame">
      <div ref={ref} className={className}>{children}</div>
      {rows.map((row, index) => (
        <button
          type="button"
          key={index}
          className="vs-scroll-more"
          style={{ top: row.top, height: row.height }}
          title="Vedi altre informazioni"
          aria-label="Vedi altre informazioni"
          onClick={scrollRight}
        >
          <span aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  )
}
