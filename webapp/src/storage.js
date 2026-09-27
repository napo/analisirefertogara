const database = () => new Promise((resolve, reject) => {
  const request = indexedDB.open('referto-volley', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('matches', { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
async function transact(mode, action) {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('matches', mode), request = action(tx.objectStore('matches'))
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
export const saveMatch = async match => {
  const stored = await encode(match) // before the transaction: it must not wait inside it
  return transact('readwrite', store => store.put(stored))
}
export const deleteMatch = id => transact('readwrite', store => store.delete(id))
export const saveMany = async matches => {
  const stored = await Promise.all(matches.map(encode))
  return transact('readwrite', store => { stored.forEach(m => store.put(m)) })
}
export async function backup(matches) {
  return JSON.stringify({ version: 1, matches: await Promise.all(matches.map(async m => ({ ...m, pdf: m.pdf ? await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(m.pdf) }) : null }))) }, null, 2)
}
