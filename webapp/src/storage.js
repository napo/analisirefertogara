const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('referto-volley', 2)
  request.onupgradeneeded = () => {
    const db = request.result
    if (!db.objectStoreNames.contains('matches')) db.createObjectStore('matches', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta') // state of the synchronisation
  }
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
async function transact(mode, action, store = 'matches') {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode), request = action(tx.objectStore(store))
      tx.oncomplete = () => resolve(request?.result)
      // WebKit fires onerror with tx.error still null: the real error is on the failing request
      tx.onerror = event => reject(event.target?.error || request?.error || tx.error || Error('Operazione sull’archivio locale non riuscita'))
      tx.onabort = event => reject(event.target?.error || tx.error || Error('Salvataggio interrotto'))
    })
  } finally { db.close() }
}
// The original PDF is stored as bytes, not as a Blob: WebKit (Safari, every iPhone browser) cannot store
// Blobs in IndexedDB in ephemeral sessions such as Private Browsing ("Error preparing Blob/File data to be
// stored in object store"). Matches saved earlier as Blob are still read.
const encode = async match => (match?.pdf instanceof Blob
  ? { ...match, pdf: { type: match.pdf.type || 'application/pdf', bytes: await match.pdf.arrayBuffer() } }
  : match)
const decode = match => (match?.pdf && !(match.pdf instanceof Blob) && match.pdf.bytes
  ? { ...match, pdf: new Blob([match.pdf.bytes], { type: match.pdf.type || 'application/pdf' }) }
  : match)

export const listMatches = async () => ((await transact('readonly', store => store.getAll())) || []).map(decode)

// Listeners of the changes: origin 'local' (the user) or 'sync' (written by a synchronisation)
const listeners = new Set()
const changed = origin => listeners.forEach(listener => listener(origin))
export function onArchiveChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getMeta = key => transact('readonly', store => store.get(key), 'meta')
export const setMeta = (key, value) => transact('readwrite', store => store.put(value, key), 'meta')

// Deleted matches with their time: the deletion reaches the other synchronised devices
export const DELETIONS_META = 'sync.deletions'
const remember = async list => setMeta(DELETIONS_META, [...((await getMeta(DELETIONS_META)) || []).filter(old => !list.some(d => d.id === old.id)), ...list])

// Every change of the user carries its time (sync/merge.js)
const stamped = match => ({ ...match, updatedAt: new Date().toISOString() })

export const saveMatch = async match => {
  const stored = await encode(stamped(match)) // before the transaction: it must not wait inside it
  const result = await transact('readwrite', store => store.put(stored))
  changed('local')
  return result
}
export const deleteMatch = async id => {
  await transact('readwrite', store => store.delete(id))
  await remember([{ id, deletedAt: new Date().toISOString() }])
  changed('local')
}
export const saveMany = async matches => {
  const stored = await Promise.all(matches.map(match => encode(stamped(match))))
  await transact('readwrite', store => { stored.forEach(m => store.put(m)) })
  changed('local')
}

// Matches as stored, without turning the PDFs into Blobs
export const listRawMatches = async () => (await transact('readonly', store => store.getAll())) || []

// Writes what a synchronisation received. The PDF of a match stays on this device; a match changed here during
// the round (its time differs from `stamps`) is not touched. Returns how many changes were written.
export async function putSyncedMatches(records, deletions, stamps) {
  const current = new Map((await listRawMatches()).map(match => [match.id, match]))
  const untouched = id => (current.get(id)?.updatedAt ?? '') === (stamps.get(id) ?? '') || !current.has(id)
  const puts = records.filter(record => untouched(record.id)).map(record => ({ ...record, ...(current.get(record.id)?.pdf ? { pdf: current.get(record.id).pdf } : {}) }))
  const gone = deletions.filter(({ id }) => untouched(id))
  await transact('readwrite', store => {
    puts.forEach(match => store.put(match))
    gone.forEach(({ id }) => store.delete(id))
  })
  if (gone.length) await remember(gone)
  if (puts.length || gone.length) changed('sync')
  return puts.length + gone.length
}

export async function rawPdfBytes(id) {
  const match = (await listRawMatches()).find(m => m.id === id)
  return new Uint8Array(match.pdf instanceof Blob ? await match.pdf.arrayBuffer() : match.pdf.bytes)
}

// The PDF of a match received from the cloud service: not a change of the match
export async function setMatchPdf(id, bytes) {
  const match = (await listRawMatches()).find(m => m.id === id)
  if (!match || match.pdf) return
  await transact('readwrite', store => store.put({ ...match, pdf: { type: 'application/pdf', bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } }))
  changed('sync')
}

