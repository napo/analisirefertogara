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
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error || Error('Salvataggio interrotto'))
    })
  } finally { db.close() }
}
export const listMatches = () => transact('readonly', store => store.getAll())
export const saveMatch = match => transact('readwrite', store => store.put(match))
export const deleteMatch = id => transact('readwrite', store => store.delete(id))
export const saveMany = matches => transact('readwrite', store => { matches.forEach(m => store.put(m)) })
export async function backup(matches) {
  return JSON.stringify({ version: 1, matches: await Promise.all(matches.map(async m => ({ ...m, pdf: m.pdf ? await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(m.pdf) }) : null }))) }, null, 2)
}
