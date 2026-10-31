/** A request refused by the service; status 401 means the access token is no longer valid. */
export class StorageError extends Error {
  status
  code
  constructor(status, code = '') {
    super(`storage: ${status} ${code}`)
    this.status = status
    this.code = code
  }
}
