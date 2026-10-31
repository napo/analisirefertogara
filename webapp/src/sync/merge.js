/**
 * Merging the local archive with the copy on the cloud service.
 *
 * Every match carries the time of its last change (updatedAt); a deleted match leaves a deletion with its
 * time, so that the deletion reaches the other devices instead of the match coming back. The base is the time
 * of every match at the last synchronisation: a side whose time differs from the base has changed since.
 * - Changed on one side only: that side wins.
 * - Changed on both sides: the latest change wins, and the older version stays as a copy with a new id.
 * The original PDFs are not part of the snapshot: they travel as separate files (pdfs.js).
 */
export const EMPTY_SNAPSHOT = { matches: [], deletions: [] }

// Deletions older than this are forgotten: a device offline for longer may bring the match back
export const DELETION_KEPT_DAYS = 400

// Same shape as the id of an imported match (SHA-256 of the PDF)
export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')

function entries(snapshot) {
  const map = new Map()
  for (const record of snapshot.matches) map.set(record.id, { id: record.id, record, stamp: record.updatedAt ?? '' })
  // A deletion hides a match of the same snapshot only when it is later (a match imported again stays)
  for (const { id, deletedAt } of snapshot.deletions) {
    const present = map.get(id)
    if (!present || present.stamp < deletedAt) map.set(id, { id, record: null, stamp: deletedAt })
  }
  return map
}

const same = (a, b) => (a.record === null) === (b.record === null) && (a.record === null || JSON.stringify(a.record) === JSON.stringify(b.record))

// The latest of two entries; on the same time a deletion wins, then the local one
const latest = (local, remote) => (remote.stamp > local.stamp || (remote.stamp === local.stamp && remote.record === null && local.record !== null) ? remote : local)

export function mergeSnapshots(local, remote, base, createId = newId, now = new Date()) {
  const l = entries(local), r = entries(remote), out = new Map()
  let conflicts = 0
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const a = l.get(id), b = r.get(id)
    if (!a || !b) { out.set(id, a ?? b); continue }
    if (same(a, b)) { out.set(id, a); continue }
    const localChanged = a.stamp !== base[id], remoteChanged = b.stamp !== base[id]
    if (localChanged !== remoteChanged) { out.set(id, localChanged ? a : b); continue }
    const winner = latest(a, b), loser = winner === a ? b : a
    out.set(id, winner)
    if (winner.record && loser.record) {
      const copy = createId()
      out.set(copy, { id: copy, record: { ...loser.record, id: copy, pdfSource: loser.record.pdfSource || loser.id }, stamp: loser.stamp })
      conflicts++
    }
  }
  const oldest = new Date(now.getTime() - DELETION_KEPT_DAYS * 86_400_000).toISOString()
  const kept = [...out.values()].filter(e => e.record !== null || e.stamp >= oldest)
  return {
    merged: {
      matches: kept.filter(e => e.record).map(e => e.record),
      deletions: kept.filter(e => e.record === null).map(e => ({ id: e.id, deletedAt: e.stamp })),
    },
    base: Object.fromEntries(kept.map(e => [e.id, e.stamp])),
    conflicts,
  }
}

// Matches to write and to delete to turn `from` into `to`
export function snapshotChanges(from, to) {
  const before = entries(from), after = entries(to), puts = [], deletions = []
  for (const [id, entry] of after) {
    const old = before.get(id)
    if (old && same(old, entry) && old.stamp === entry.stamp) continue
    if (entry.record) puts.push(entry)
    else deletions.push({ id, deletedAt: entry.stamp })
  }
  return { puts, deletions, changed: puts.length > 0 || deletions.length > 0 }
}

// Time of every match and deletion of a snapshot: what the local archive held when it was read
export const snapshotStamps = snapshot => new Map([...entries(snapshot)].map(([id, e]) => [id, e.stamp]))
