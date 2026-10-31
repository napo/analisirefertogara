// The local archive (storage.js) as the synchronisation engine sees it
import { getMeta, listRawMatches, onArchiveChange, putSyncedMatches, rawPdfBytes, setMeta, setMatchPdf, DELETIONS_META } from '../storage.js'
import { DELETION_KEPT_DAYS } from './merge.js'

const withoutLocalData = ({ pdf: _pdf, analysis: _analysis, ...match }) => match

export const localArchive = {
  getMeta,
  setMeta,
  onChange: onArchiveChange,
  async snapshot() {
    const oldest = new Date(Date.now() - DELETION_KEPT_DAYS * 86_400_000).toISOString()
    const deletions = ((await getMeta(DELETIONS_META)) || []).filter(d => d.deletedAt >= oldest)
    return { matches: (await listRawMatches()).map(withoutLocalData), deletions }
  },
  // Changes made on this device during the round (the time no longer matches `stamps`) are left alone
  applySync: (puts, deletions, stamps) => putSyncedMatches(puts.map(e => e.record), deletions, stamps),
  pdfState: async () => (await listRawMatches()).map(({ id, pdfSource, pdf }) => ({ id, pdfSource, hasPdf: Boolean(pdf) })),
  pdfBytes: rawPdfBytes,
  setPdf: setMatchPdf,
}
