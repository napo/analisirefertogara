/**
 * OneDrive through Microsoft Graph, only what synchronisation needs. The app
 * asks for the Files.ReadWrite.AppFolder scope: it sees only its own folder,
 * visible in the 'Apps' folder of the user's OneDrive, and the archive is found
 * by its path, so the file must stay there: moved or renamed, it counts as
 * deleted and the app writes a new one.
 */
import { SYNC_FILE_NAME } from './file.js'
import { PDF_ID } from './pdfs.js'
import { StorageError } from './storage.js'
const ROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot'
const ITEM = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILE_NAME}`
const CONTENT = `${ITEM}:/content`
export const ONEDRIVE_SCOPE = 'Files.ReadWrite.AppFolder offline_access'
export class OneDriveClient {
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
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({}))
      throw new StorageError(response.status, error?.code)
    }
    return response
  }
  async item() {
    try {
      return await (await this.request(ITEM)).json()
    } catch (e) {
      if (e instanceof StorageError && e.status === 404) return null
      throw e
    }
  }
  async upload(url, bytes, headers = {}) {
    const response = await this.request(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...headers
      },
      body: new Blob([bytes])
    })
    return {
      id: SYNC_FILE_NAME,
      version: (await response.json()).eTag
    }
  }
  async findArchive() {
    const version = await this.version()
    return version ? {
      id: SYNC_FILE_NAME,
      version
    } : null
  }
  async version() {
    return (await this.item())?.eTag ?? null
  }
  /** From the short-lived address Graph gives: it needs no token, and browsers cannot follow the redirect of /content. */
  async download() {
    const item = await this.item()
    if (!item) throw new StorageError(404)
    const response = await this.fetchFn(item['@microsoft.graph.downloadUrl'])
    if (!response.ok) throw new StorageError(response.status)
    return new Uint8Array(await response.arrayBuffer())
  }
  create(bytes) {
    return this.upload(`${CONTENT}?${new URLSearchParams({ '@microsoft.graph.conflictBehavior': 'fail' })}`, bytes)
  }
  async update(_id, bytes, expected) {
    try {
      return await this.upload(CONTENT, bytes, { 'If-Match': expected })
    } catch (e) {
      if (e instanceof StorageError && (e.status === 412 || e.status === 404)) return null
      throw e
    }
  }
  /** The file goes to the recycle bin of the user's OneDrive. */
  async trash() {
    await this.request(ITEM, { method: 'DELETE' })
  }
  /** The PDFs: one file each in the folder "pdf" of the app folder. */
  async listPdfs() {
    const names = []
    try {
      let url = `${ROOT}:/pdf:/children?$select=name&$top=200`
      while (url) {
        const page = await (await this.request(url)).json()
        names.push(...(page.value ?? []).map(item => item.name))
        url = page['@odata.nextLink']
      }
    } catch (e) {
      if (!(e instanceof StorageError && e.status === 404)) throw e
    }
    return names.map(name => name.replace(/\.pdf$/, '')).filter(id => PDF_ID.test(id))
  }
  async uploadPdf(id, bytes) {
    await this.request(`${ROOT}:/pdf/${id}.pdf:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: new Blob([bytes]) })
  }
  async downloadPdf(id) {
    const item = await (await this.request(`${ROOT}:/pdf/${id}.pdf`)).json()
    const response = await this.fetchFn(item['@microsoft.graph.downloadUrl'])
    if (!response.ok) throw new StorageError(response.status)
    return new Uint8Array(await response.arrayBuffer())
  }
  async deletePdf(id) {
    await this.request(`${ROOT}:/pdf/${id}.pdf`, { method: 'DELETE' })
  }
}
