/**
 * Dropbox API (v2), only what synchronisation needs. The app has the "App
 * folder" permission: it sees only its own folder, visible in the user's
 * Dropbox, and the archive is found by its path, so the file must stay there:
 * moved or renamed, it counts as deleted and the app writes a new one.
 */
import { SYNC_FILE_NAME } from './file.js'
import { PDF_ID } from './pdfs.js'
import { StorageError } from './storage.js'
const API = 'https://api.dropboxapi.com/2/files'
const CONTENT = 'https://content.dropboxapi.com/2/files'
const PATH = `/${SYNC_FILE_NAME}`
export const DROPBOX_SCOPE = 'files.content.read files.content.write files.metadata.read'
/** A refused request, with what Dropbox says of it ('path/not_found/…', 'path/conflict/file/…'). */
class DropboxError extends StorageError {
  summary
  constructor(status, summary) {
    super(status, summary)
    this.summary = summary
  }
}
export class DropboxClient {
  accessToken
  fetchFn
  constructor(accessToken, fetchFn = (input, init) => fetch(input, init)) {
    this.accessToken = accessToken
    this.fetchFn = fetchFn
  }
  async request(url, init) {
    const response = await this.fetchFn(url, {
      method: 'POST',
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.accessToken}`
      }
    })
    if (response.ok) return response
    const { error_summary: summary = '' } = await response.json().catch(() => ({}))
    throw new DropboxError(response.status, summary)
  }
  rpc(name, args) {
    return this.request(`${API}/${name}`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    })
  }
  async upload(bytes, mode) {
    const response = await this.request(`${CONTENT}/upload`, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: PATH,
          mode,
          autorename: false,
          mute: true,
          strict_conflict: true
        })
      },
      body: new Blob([bytes])
    })
    return {
      id: PATH,
      version: (await response.json()).rev
    }
  }
  async findArchive() {
    const version = await this.version()
    return version ? {
      id: PATH,
      version
    } : null
  }
  async version() {
    try {
      return (await (await this.rpc('get_metadata', { path: PATH })).json()).rev
    } catch (e) {
      if (e instanceof DropboxError && e.status === 409 && e.summary.includes('not_found')) return null
      throw e
    }
  }
  async download() {
    const response = await this.request(`${CONTENT}/download`, { headers: { 'Dropbox-API-Arg': JSON.stringify({ path: PATH }) } })
    return new Uint8Array(await response.arrayBuffer())
  }
  create(bytes) {
    return this.upload(bytes, 'add')
  }
  async update(_id, bytes, expected) {
    try {
      return await this.upload(bytes, {
        '.tag': 'update',
        update: expected
      })
    } catch (e) {
      if (e instanceof DropboxError && e.status === 409 && e.summary.includes('conflict')) return null
      throw e
    }
  }
  /** Dropbox keeps deleted files for a while, and the user can restore them. */
  async trash() {
    await this.rpc('delete_v2', { path: PATH })
  }
  /** The PDFs: one file each in the folder "pdf" of the app folder. */
  async listPdfs() {
    const names = []
    try {
      let page = await (await this.rpc('list_folder', { path: '/pdf', limit: 1000 })).json()
      names.push(...page.entries.map(entry => entry.name))
      while (page.has_more) {
        page = await (await this.rpc('list_folder/continue', { cursor: page.cursor })).json()
        names.push(...page.entries.map(entry => entry.name))
      }
    } catch (e) {
      if (!(e instanceof DropboxError && e.status === 409 && e.summary.includes('not_found'))) throw e
    }
    return names.map(name => name.replace(/\.pdf$/, '')).filter(id => PDF_ID.test(id))
  }
  async uploadPdf(id, bytes) {
    await this.request(`${CONTENT}/upload`, {
      headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: `/pdf/${id}.pdf`, mode: 'overwrite', autorename: false, mute: true }) },
      body: new Blob([bytes]),
    })
  }
  async downloadPdf(id) {
    const response = await this.request(`${CONTENT}/download`, { headers: { 'Dropbox-API-Arg': JSON.stringify({ path: `/pdf/${id}.pdf` }) } })
    return new Uint8Array(await response.arrayBuffer())
  }
  async deletePdf(id) {
    await this.rpc('delete_v2', { path: `/pdf/${id}.pdf` })
  }
}
