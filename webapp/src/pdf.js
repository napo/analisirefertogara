import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseItems } from './pdf-parser.js'
GlobalWorkerOptions.workerSrc = worker
export async function importPdf(file) {
  if (file.size > 20 * 1024 * 1024) throw Error('Il PDF supera il limite di 20 MB.')
  const buffer = await file.arrayBuffer()
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(n => n.toString(16).padStart(2, '0')).join('')
  const task = getDocument({ data: new Uint8Array(buffer.slice(0)), standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`, isEvalSupported: false })
  try {
    const pdf = await task.promise
    if (pdf.numPages !== 1) throw Error('Il modello supportato contiene una pagina. Carica un singolo referto SNUG.')
    const page = await pdf.getPage(1), content = await page.getTextContent(), viewport = page.getViewport({ scale: 1 })
    const match = parseItems(content.items, viewport.width, viewport.height)
    return { ...match, id: hash, fileName: file.name, pdf: new Blob([buffer], { type: 'application/pdf' }), importedAt: new Date().toISOString() }
  } finally { await task.destroy() }
}
