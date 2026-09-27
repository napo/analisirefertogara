// Browser gaps that break PDF import. Loaded before anything else, in the page (main.jsx) and in the
// pdf.js worker (pdf-worker.js). Must not use window/document.
//
// Safari (WebKit, also every browser on iPhone/iPad) before 2025 cannot iterate a ReadableStream with
// `for await`: pdf.js getTextContent() does, and the import failed with
// "undefined is not a function (near '...e of t...')".
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  const values = async function* values({ preventCancel = false } = {}) {
    const reader = this.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      if (!preventCancel) await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
  Object.defineProperty(ReadableStream.prototype, 'values', { value: values, writable: true, configurable: true })
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, { value: values, writable: true, configurable: true })
}

// Safari before 17.4 (iOS 16 and early iOS 17): used by pdf.js in the page and in its worker
if (typeof Promise.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    value: function withResolvers() {
      let resolve
      let reject
      const promise = new this((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    },
    writable: true,
    configurable: true,
  })
}
