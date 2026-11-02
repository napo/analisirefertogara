import './polyfills'
// Legacy build of pdf.js: it adds the recent APIs missing in older Safari/iOS (Uint8Array.fromBase64,
// URL.parse, ...), in the page and in the worker
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { isPrintedPdf, parseItems, PRINTED_PDF_NOTICE, printedPdfMessage, supportedSoftwareList } from './pdf-parser.js'
import { hashBuffer } from './hash.js'
// Worker created by the app (pdf-worker.js loads the polyfills, then pdf.js); one for the whole session
GlobalWorkerOptions.workerPort = new Worker(new URL('./pdf-worker.js', import.meta.url), { type: 'module' })

// Scoresheets without text (pages printed as images): the TieBreakTech template is read with OCR,
// loaded only when needed
async function importImagePdf(pdf, bytes, onProgress, onNotice) {
  const { importTbt } = await import('./tbt-ocr.js')
  return importTbt(pdf, bytes, onProgress, onNotice)
}

// NEWBIT scoresheets printed with a virtual PDF printer: characters recognized from their shapes, loaded
// only when needed. known: the PDF says it was printed (error if it cannot be read); otherwise null.
async function importPrintedPdf(page, known, onProgress, onNotice) {
  if (known) onNotice(PRINTED_PDF_NOTICE)
  onProgress('Riconoscimento dei caratteri dalla loro forma…')
  try {
    const { parsePrintedNewbit } = await import('./newbit-print.js')
    const match = parsePrintedNewbit(await page.getOperatorList())
    if (match || !known) return match
    throw Error('')
  } catch (error) {
    if (!known) return null
    throw Error(printedPdfMessage(error.message))
  }
}

// Pictures of the sheets of a TBT scoresheet, made once for each PDF
const previews = new WeakMap()
export function sheetPages(blob) {
  if (!previews.has(blob)) previews.set(blob, readSheetPages(blob))
  return previews.get(blob)
}

async function readSheetPages(blob) {
  const buffer = await blob.arrayBuffer()
  const task = getDocument({ data: new Uint8Array(buffer.slice(0)), standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`, isEvalSupported: false, isOffscreenCanvasSupported: false })
  try {
    const { sheetPreviews } = await import('./tbt-ocr.js')
    return await sheetPreviews(await task.promise, new Uint8Array(buffer))
  } finally { await task.destroy() }
}

export async function importPdf(file, { onProgress = () => {}, onNotice = () => {} } = {}) {
  if (file.size > 20 * 1024 * 1024) throw Error('Il PDF supera il limite di 20 MB.')
  onProgress('Apertura del PDF…')
  const buffer = await file.arrayBuffer()
  const hash = await hashBuffer(buffer)
  // no offscreen canvas: images come as pixels, not as bitmaps that WebKit draws blank (TBT gray images)
  const task = getDocument({ data: new Uint8Array(buffer.slice(0)), standardFontDataUrl: `${import.meta.env.BASE_URL}standard_fonts/`, isEvalSupported: false, isOffscreenCanvasSupported: false })
  try {
    const pdf = await task.promise
    onProgress('Riconoscimento del formato del referto…')
    const page = await pdf.getPage(1), content = await page.getTextContent(), viewport = page.getViewport({ scale: 1 })
    let match = null
    if (!content.items.some(item => item.str?.trim())) {
      const { info } = await pdf.getMetadata().catch(() => ({ info: {} }))
      const printed = isPrintedPdf(info?.Producer)
      if (printed) match = await importPrintedPdf(page, true, onProgress, onNotice)
      if (!match && pdf.numPages <= 2) match = await importImagePdf(pdf, new Uint8Array(buffer), onProgress, onNotice)
      // other virtual printers, not named in the PDF
      if (!match && !printed) match = await importPrintedPdf(page, false, onProgress, onNotice)
      if (!match) throw Error(`Formato non riconosciuto: il PDF non contiene testo. Attualmente sono supportati i formati dei software di ${supportedSoftwareList()}.`)
    } else {
      if (pdf.numPages !== 1) throw Error(`I referti supportati contengono una sola pagina. Carica un singolo referto ${supportedSoftwareList('disjunction')}.`)
      onProgress('Lettura dei dati del referto…')
      const operatorList = await page.getOperatorList()
      match = parseItems(content.items, viewport.width, viewport.height, operatorList)
    }
    return { ...match, id: hash, fileName: file.name, pdf: new Blob([buffer], { type: 'application/pdf' }), importedAt: new Date().toISOString() }
  } finally { await task.destroy() }
}
