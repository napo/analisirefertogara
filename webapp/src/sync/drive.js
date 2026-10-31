/**
 * Google Drive REST API (v3), only what synchronisation needs. The app asks
 * for the drive.file scope: it sees only the files it created, a
 * 'Referto Volley' folder and the archive file inside it, both visible in the
 * user's Drive. They are found by a property of the app (appProperties), so
 * the user may rename or move them.
 */
import { SYNC_FILE_NAME } from './file.js'
import { PDF_ID } from './pdfs.js'
import { StorageError } from './storage.js'
const API = 'https://www.googleapis.com/drive/v3/files'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const PROPERTY = 'refertovolley'
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export class DriveClient {
  accessToken
  fetchFn
  constructor(accessToken, fetchFn = (input, init) => fetch(input, init)) {
    this.accessToken = accessToken
    this.fetchFn = fetchFn
  }
  async request(url, init = {}) {
    const response = await this.fetchFn(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.accessToken}`
      }
    })
    if (!response.ok) throw new StorageError(response.status)
    return response
  }
  async find(value, extra = '') {
    const q = `appProperties has { key='${PROPERTY}' and value='${value}' } and trashed=false${extra}`
    const response = await this.request(`${API}?${new URLSearchParams({
      q,
      spaces: 'drive',
      fields: 'files(id,version)',
      orderBy: 'modifiedTime desc'
    })}`)
    const { files } = await response.json()
    return files?.[0] ?? null
  }
  findArchive() {
    return this.find('archive')
  }
  async version(id) {
    try {
      const response = await this.request(`${API}/${id}?fields=version,trashed`)
      const file = await response.json()
      return file.trashed ? null : file.version
    } catch (e) {
      if (e instanceof StorageError && e.status === 404) return null
      throw e
    }
  }
  async download(id) {
    return new Uint8Array(await (await this.request(`${API}/${id}?alt=media`)).arrayBuffer())
  }
  async folder() {
    const found = await this.find('folder', ` and mimeType='${FOLDER_MIME}'`)
    if (found) return found.id
    const response = await this.request(`${API}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Referto Volley',
        mimeType: FOLDER_MIME,
        appProperties: { [PROPERTY]: 'folder' }
      })
    })
    return (await response.json()).id
  }
  async create(bytes) {
    const metadata = {
      name: SYNC_FILE_NAME,
      parents: [await this.folder()],
      mimeType: 'application/zip',
      appProperties: { [PROPERTY]: 'archive' }
    }
    const boundary = `refertovolley${Math.random().toString(36).slice(2)}`
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`
    ])
    const response = await this.request(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    })
    return await response.json()
  }
  /** Moves the file to the bin of the user's Drive, where it can still be restored for 30 days. */
  async trash(id) {
    await this.request(`${API}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    })
  }
  /** Drive has no conditional write: the version is checked just before writing. */
  async update(id, bytes, expected) {
    if (await this.version(id) !== expected) return null
    const response = await this.request(`${UPLOAD}/${id}?uploadType=media&fields=id,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/zip' },
      body: new Blob([bytes])
    })
    return await response.json()
  }
  /** The PDFs: files of the app in the same folder, found by their property. */
  async pdfFiles() {
    const files = new Map()
    let pageToken = ''
    do {
      const q = `appProperties has { key='${PROPERTY}' and value='pdf' } and trashed=false`
      const response = await this.request(`${API}?${new URLSearchParams({ q, spaces: 'drive', pageSize: '1000', fields: 'nextPageToken,files(id,appProperties)', ...(pageToken ? { pageToken } : {}) })}`)
      const page = await response.json()
      for (const file of page.files ?? []) if (PDF_ID.test(file.appProperties?.pdfId ?? '')) files.set(file.appProperties.pdfId, file.id)
      pageToken = page.nextPageToken ?? ''
    } while (pageToken)
    return files
  }
  async listPdfs() {
    return [...(await this.pdfFiles()).keys()]
  }
  async uploadPdf(id, bytes) {
    const metadata = { name: `${id}.pdf`, parents: [await this.folder()], mimeType: 'application/pdf', appProperties: { [PROPERTY]: 'pdf', pdfId: id } }
    const boundary = `refertovolley${Math.random().toString(36).slice(2)}`
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ])
    await this.request(`${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })
  }
  async downloadPdf(id) {
    return this.download((await this.pdfFiles()).get(id))
  }
  /** To the bin of the user's Drive, like the archive file. */
  async deletePdf(id) {
    await this.trash((await this.pdfFiles()).get(id))
  }
}
