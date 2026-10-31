/**
 * One synchronisation of the local archive with the file on the cloud service:
 * download the file, merge (src/sync/merge.js), write the changes to the
 * archive, upload the merged archive when it differs from the file. When the
 * file changed on the service meanwhile (another device synchronised), the whole
 * round starts again, so nothing written by the other device is lost.
 */
import { readSyncFile, writeSyncFile } from './file.js'
import { EMPTY_SNAPSHOT, newId, mergeSnapshots, snapshotChanges, snapshotStamps } from './merge.js'
import { syncPdfs } from './pdfs.js'
import { StorageError } from './storage.js'
export const META = {
  base: 'sync.base',
  fileId: 'sync.fileId',
  lastSyncedAt: 'sync.lastSyncedAt',
  provider: 'sync.provider'
}
/** Rounds tried when another device keeps changing the file. */
const ATTEMPTS = 3
export async function synchronise(deps, interactive = false) {
  const { archive, auth, appVersion, storage } = deps
  const now = deps.now ?? (() => new Date())
  for (let retryAuth = true;; retryAuth = false) {
    const token = await auth.token(interactive)
    if (!token) return {
      done: false,
      received: 0,
      uploaded: false,
      conflicts: 0
    }
    try {
      return await round(storage(token))
    } catch (e) {
      // An access token refused before its expiry: get a new one, once.
      if (e instanceof StorageError && e.status === 401 && retryAuth) {
        auth.invalidate()
        continue
      }
      throw e
    }
  }
  async function round(client) {
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const knownId = await archive.getMeta(META.fileId)
      const knownVersion = knownId ? await client.version(knownId) : null
      let file = knownId && knownVersion ? {
        id: knownId,
        version: knownVersion
      } : await client.findArchive()
      const remote = file ? readSyncFile(await client.download(file.id)) : EMPTY_SNAPSHOT
      const local = await archive.snapshot()
      const base = await archive.getMeta(META.base) ?? {}
      const at = now()
      const { merged, base: nextBase, conflicts } = mergeSnapshots(local, remote, base, newId, at)
      const toLocal = snapshotChanges(local, merged)
      const received = toLocal.changed ? await archive.applySync(toLocal.puts, toLocal.deletions, snapshotStamps(local)) : 0
      const upload = !file || snapshotChanges(remote, merged).changed
      if (upload) {
        const bytes = await writeSyncFile(merged, appVersion, at)
        if (file) {
          // Another device wrote the file after it was read: merge again with its version.
          const updated = await client.update(file.id, bytes, file.version)
          if (!updated) continue
          file = updated
        } else {
          file = await client.create(bytes)
        }
      }
      await archive.setMeta(META.fileId, file.id)
      await archive.setMeta(META.base, nextBase)
      await archive.setMeta(META.lastSyncedAt, at.toISOString())
      // The data are safe by now: a PDF that fails is sent at the next round
      const pdfs = await syncPdfs(client, archive, merged.deletions)
      return {
        done: true,
        received,
        uploaded: upload,
        conflicts,
        pdfs
      }
    }
    throw new Error('sync: the remote file keeps changing')
  }
}
/** Forgets the file and the base: the next synchronisation starts from the file found on the service, if any. */
export async function forgetSync(archive) {
  await archive.setMeta(META.fileId, null)
  await archive.setMeta(META.base, {})
  await archive.setMeta(META.lastSyncedAt, null)
  await archive.setMeta(META.provider, null)
}
