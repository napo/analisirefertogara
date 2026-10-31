// The original PDFs on the cloud service: one file each next to the archive file, named by the id of the match.
// A PDF never changes, so each one travels once, instead of the whole archive at every change.
// Nothing downloaded is trusted: the bytes must be a PDF with the fingerprint of its id.
import { fallbackHash } from '../hash.js'

export const PDF_ID = /^(?:[a-f0-9]{64}|[a-f0-9]{32})$/

// Where the PDF of a match is on the service: a copy made by a conflict keeps the PDF of its original
export const pdfKey = match => match.pdfSource || match.id

const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')

export async function validPdf(key, bytes) {
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') return false
  if (key.length === 32) return true // ids of old versions: not a fingerprint
  const digest = globalThis.crypto?.subtle ? hex(await crypto.subtle.digest('SHA-256', bytes)) : ''
  return key === digest || key === fallbackHash(bytes)
}

// archive: pdfState() -> [{ id, pdfSource, hasPdf }], pdfBytes(id), setPdf(id, bytes). deletions: of the merged archive
export async function syncPdfs(client, archive, deletions) {
  const remote = new Set(await client.listPdfs())
  const state = await archive.pdfState()
  const counts = { uploaded: 0, downloaded: 0, rejected: 0, deleted: 0 }
  // Uploads first: a copy without its PDF on this device finds it among the ones just sent
  for (const match of state.filter(m => m.hasPdf && !remote.has(pdfKey(m)))) {
    await client.uploadPdf(pdfKey(match), await archive.pdfBytes(match.id))
    remote.add(pdfKey(match))
    counts.uploaded++
  }
  for (const match of state.filter(m => !m.hasPdf && remote.has(pdfKey(m)))) {
    const bytes = await client.downloadPdf(pdfKey(match))
    if (await validPdf(pdfKey(match), bytes)) {
      await archive.setPdf(match.id, bytes)
      counts.downloaded++
    } else counts.rejected++
  }
  const used = new Set(state.map(pdfKey))
  for (const { id } of deletions) {
    if (remote.has(id) && !used.has(id)) {
      await client.deletePdf(id)
      counts.deleted++
    }
  }
  return counts
}
