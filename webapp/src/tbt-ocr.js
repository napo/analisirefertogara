// Import of TieBreakTech scoresheets (pages printed as images): OCR in the browser with tesseract.js.
// Everything runs locally: the worker, the engine (WebAssembly) and the English model are files of the
// app, nothing is sent to other servers, and the import works offline and in the desktop/mobile apps.
// Loaded on demand (dynamic import) only when a PDF without text is imported.
import { createWorker } from 'tesseract.js'
import workerPath from 'tesseract.js/dist/worker.min.js?url'
import coreSimd from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'
import coreBase from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url'
import modelUrl from '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url'
import { createReader, isTbtPage } from './tbt-reader.js'
import { parseTbt } from './tbt-parser.js'
import { ImageKind, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

// WebAssembly SIMD support (same test as wasm-feature-detect): picks the faster engine build
const simdSupported = () => {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]))
  } catch {
    return false
  }
}

const grayOf = (rgba, i) => (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000

// Gray levels of a drawable (image, bitmap), copied in horizontal strips: WebKit draws a large image on a
// large canvas as all black
function grayPixels(source, width, height) {
  const data = new Uint8Array(width * height)
  const strip = 256
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = strip
  const context = canvas.getContext('2d', { willReadFrequently: true })
  for (let top = 0; top < height; top += strip) {
    const rows = Math.min(strip, height - top)
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, strip)
    context.drawImage(source, 0, top, width, rows, 0, 0, width, rows)
    const rgba = context.getImageData(0, 0, width, rows).data
    for (let i = 0; i < width * rows; i++) data[top * width + i] = grayOf(rgba, i)
  }
  canvas.width = canvas.height = 0 // release the memory at once (iOS limits canvas memory)
  return { data, width, height }
}

// JPEG images embedded in the PDF (TieBreakTech prints each page as one JPEG), largest first. They are
// decoded by the browser: pdf.js hands large images over as bitmaps that WebKit cannot draw.
function embeddedJpegs(bytes) {
  const text = new TextDecoder('latin1').decode(bytes)
  const images = []
  const streamStart = /stream\r?\n/g
  let match
  while ((match = streamStart.exec(text))) {
    const head = text.slice(Math.max(0, match.index - 600), match.index)
    const dictionary = head.slice(head.lastIndexOf('<<'))
    if (!/\/Subtype\s*\/Image/.test(dictionary) || !/\/DCTDecode/.test(dictionary)) continue
    const width = Number(dictionary.match(/\/Width\s+(\d+)/)?.[1]), height = Number(dictionary.match(/\/Height\s+(\d+)/)?.[1])
    const start = match.index + match[0].length
    const end = text.indexOf('endstream', start)
    if (!width || !height || end < 0) continue
    images.push({ width, height, bytes: bytes.subarray(start, end) })
    streamStart.lastIndex = end
  }
  return images.sort((a, b) => b.width * b.height - a.width * a.height)
}

async function decodeJpeg({ bytes, width, height }) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (image.naturalWidth !== width || image.naturalHeight !== height) return null
    return grayPixels(image, width, height)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Fallback: the largest image of a page as decoded by pdf.js
async function pdfjsImage(page) {
  const operators = await page.getOperatorList()
  let best = null
  operators.fnArray.forEach((fn, i) => {
    if (fn !== OPS.paintImageXObject) return
    const [id, width, height] = operators.argsArray[i]
    if (!best || width * height > best.width * best.height) best = { id, width, height }
  })
  if (!best) return null
  const store = best.id.startsWith('g_') ? page.commonObjs : page.objs
  const image = await new Promise(resolve => store.get(best.id, resolve))
  const { width, height } = image
  if (image.bitmap) return grayPixels(image.bitmap, width, height)
  if (image.kind !== ImageKind.RGB_24BPP && image.kind !== ImageKind.RGBA_32BPP) return null
  const step = image.kind === ImageKind.RGB_24BPP ? 3 : 4
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) data[i] = (image.data[i * step] * 299 + image.data[i * step + 1] * 587 + image.data[i * step + 2] * 114) / 1000
  return { data, width, height }
}

// Page images at their own resolution (the image is placed with a margin and scaled inside the page:
// reading it directly keeps the template coordinates exact)
async function pageImages(pdf, bytes) {
  const jpegs = embeddedJpegs(bytes)
  const page1 = (jpegs[0] && await decodeJpeg(jpegs[0])) || await pdfjsImage(await pdf.getPage(1))
  const page2 = pdf.numPages < 2 ? null : (jpegs[1] && await decodeJpeg(jpegs[1])) || await pdfjsImage(await pdf.getPage(2))
  return [page1, page2]
}

// Gray image → PNG blob for the OCR engine
async function toBlob(image) {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  const pixels = context.createImageData(image.width, image.height)
  for (let i = 0; i < image.data.length; i++) {
    const v = image.data[i]
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = v
    pixels.data[i * 4 + 3] = 255
  }
  context.putImageData(pixels, 0, 0)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  canvas.width = canvas.height = 0
  return blob
}

// pdf: pdf.js document, bytes: the PDF file. onProgress(text) reports the phase to the user.
export async function importTbt(pdf, bytes, onProgress = () => {}) {
  onProgress('Lettura del referto come immagine…')
  const [page1, page2] = await pageImages(pdf, bytes)
  if (!page1 || !isTbtPage(page1)) return null

  onProgress('Preparazione del riconoscimento dei caratteri…')
  // tesseract.js fetches "<langPath>/eng.traineddata.gz": the model keeps its name in the build (vite.config.js)
  const langPath = new URL('.', new URL(modelUrl, globalThis.location.href)).href
  const worker = await createWorker('eng', 1, {
    workerPath,
    corePath: simdSupported() ? coreSimd : coreBase,
    langPath,
    workerBlobURL: false,
    cacheMethod: 'none',
  })
  try {
    let current = {}
    const ocr = async (image, { whitelist = '', psm = 7 }) => {
      const parameters = { tessedit_char_whitelist: whitelist, tessedit_pageseg_mode: String(psm) }
      if (parameters.tessedit_char_whitelist !== current.tessedit_char_whitelist || parameters.tessedit_pageseg_mode !== current.tessedit_pageseg_mode) {
        await worker.setParameters(parameters)
        current = parameters
      }
      const { data } = await worker.recognize(await toBlob(image))
      return { text: data.text, confidence: data.confidence }
    }
    const reader = createReader(ocr)
    const read1 = await reader.readPage1(page1, phase => onProgress(`Riconoscimento dei caratteri: ${phase}…`))
    let read2 = null
    if (page2) {
      onProgress('Riconoscimento dei caratteri: referto aggiuntivo (libero)…')
      read2 = await reader.readPage2(page2)
    }
    return parseTbt({ page1: read1, page2: read2 })
  } finally {
    await worker.terminate()
  }
}
