// Identifier of an imported PDF: SHA-256 of its bytes (64 hex characters). Without crypto.subtle (pages
// served over plain HTTP, e.g. the dev server opened from another device) a non-cryptographic fallback with
// the same length is used, so the id is still accepted by the archive import.
export function fallbackHash(bytes) {
  const seeds = [2166136261, 2246822519, 3266489917, 668265263, 374761393, 2654435761, 2870177450, 1540483477]
  const state = seeds.slice()
  for (const byte of bytes) {
    for (let k = 0; k < state.length; k++) state[k] = Math.imul(state[k] ^ byte, 16777619 + 2 * k)
  }
  state[state.length - 1] ^= bytes.length
  return state.map(value => (value >>> 0).toString(16).padStart(8, '0')).join('')
}

export async function hashBuffer(buffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  }
  return fallbackHash(new Uint8Array(buffer))
}
