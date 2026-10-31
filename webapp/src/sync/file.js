// The archive file on the cloud service: a .zrv file like the exported ones (archive.js), so the user can also
// download it and import it by hand. The PDFs are separate files next to it (pdfs.js): they weigh megabytes and
// this file travels whole at every change. Inside it, what only synchronisation needs: the deletions. Reading
// never trusts the file.
import { strFromU8, strToU8, unzipSync } from 'fflate'
import { ArchiveError, buildArchive, inspectArchive } from '../archive.js'

export const SYNC_FILE_NAME = 'RefertoVolley.zrv'
const DELETIONS = 'sincronizzazione.json'

export const writeSyncFile = (snapshot, appVersion, now = new Date()) => buildArchive(snapshot.matches, {
  appVersion,
  exportedAt: now.toISOString(),
  extraFiles: { [DELETIONS]: strToU8(JSON.stringify({ deletions: snapshot.deletions })) },
})

function readDeletions(bytes) {
  try {
    const { [DELETIONS]: file } = unzipSync(bytes, { filter: entry => entry.name === DELETIONS })
    const list = file ? JSON.parse(strFromU8(file)).deletions : []
    return Array.isArray(list) ? list.filter(d => typeof d?.id === 'string' && typeof d?.deletedAt === 'string' && !Number.isNaN(Date.parse(d.deletedAt))) : []
  } catch {
    return []
  }
}

// The archive held by the file. Throws ArchiveError when this version cannot read the file at all (it is then not
// overwritten). A single match that does not pass the checks is left out, not fatal: it would block the
// synchronisation for good; a local copy stays where it is and goes on being written to the file.
export function readSyncFile(bytes) {
  const { total, matches, problems } = inspectArchive(bytes)
  if (!total && problems.length) throw new ArchiveError(problems)
  return { matches: matches.map(({ pdf: _pdf, ...match }) => match), deletions: readDeletions(bytes) }
}
