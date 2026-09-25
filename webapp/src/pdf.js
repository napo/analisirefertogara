import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseItems } from './pdf-parser.js'
GlobalWorkerOptions.workerSrc = workerUrl

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

export async function importPdf(file) {
  if (file.size > 20 * 1024 * 1024) throw Error('Il PDF supera il limite di 20 MB.')
  const buffer = await file.arrayBuffer()
  const hash = await hashBuffer(buffer)
  const task = getDocument({ data: new Uint8Array(buffer.slice(0)), standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`, isEvalSupported: false })
  try {
    const pdf = await task.promise
    if (pdf.numPages !== 1) throw Error('Il modello supportato contiene una pagina. Carica un singolo referto SNUG.')
    const page = await pdf.getPage(1), content = await page.getTextContent(), viewport = page.getViewport({ scale: 1 })
    const operatorList = await page.getOperatorList()
    const match = parseItems(content.items, viewport.width, viewport.height, operatorList)
    return { ...match, id: hash, fileName: file.name, pdf: new Blob([buffer], { type: 'application/pdf' }), importedAt: new Date().toISOString() }
  } finally { await task.destroy() }
}
