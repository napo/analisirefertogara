import './polyfills'
// Legacy build of pdf.js: it adds the recent APIs missing in older Safari/iOS (Uint8Array.fromBase64,
// URL.parse, ...), in the page and in the worker
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseItems, supportedSoftwareList } from './pdf-parser.js'
// Worker created by the app (pdf-worker.js loads the polyfills, then pdf.js); one for the whole session
GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf-worker.js', import.meta.url), { type: 'module' })

function fallbackHash(bytes) {
  let first = 2166136261
  let second = 2246822519
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 16777619)
    second = Math.imul(second ^ byte, 2246822519)
  }
  return [first, second, bytes.length, first ^ second]
    .map(value => (value >>> 0).toString(16).padStart(8, '0'))
    .join('')
}

async function hashBuffer(buffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return fallbackHash(new Uint8Array(buffer))
}

// Scoresheets without text (pages printed as images): the TieBreakTech template is read with OCR,
// loaded only when needed
async function importImagePdf(pdf, bytes, onProgress) {
  const { importTbt } = await import('./tbt-ocr.js')
  return importTbt(pdf, bytes, onProgress)
}

export async function importPdf(file, { onProgress = () => {} } = {}) {
  if (file.size > 20 * 1024 * 1024) throw Error('Il PDF supera il limite di 20 MB.')
  const buffer = await file.arrayBuffer()
  const hash = await hashBuffer(buffer)
  const task = getDocument({ data: new Uint8Array(buffer.slice(0)), standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`, isEvalSupported: false })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1), content = await page.getTextContent(), viewport = page.getViewport({ scale: 1 })
    let match = null
    if (!content.items.some(item => item.str?.trim())) {
      if (pdf.numPages <= 2) match = await importImagePdf(pdf, new Uint8Array(buffer), onProgress)
      if (!match) throw Error(`Formato non riconosciuto: il PDF non contiene testo. Attualmente sono supportati i formati dei software di ${supportedSoftwareList()}.`)
    } else {
      if (pdf.numPages !== 1) throw Error(`I referti supportati contengono una sola pagina. Carica un singolo referto ${supportedSoftwareList('disjunction')}.`)
      const operatorList = await page.getOperatorList()
      match = parseItems(content.items, viewport.width, viewport.height, operatorList)
    }
    return { ...match, id: hash, fileName: file.name, pdf: new Blob([buffer], { type: 'application/pdf' }), importedAt: new Date().toISOString() }
  } finally { await task.destroy() }
}
