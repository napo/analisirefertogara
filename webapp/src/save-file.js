// Saving a file made by the app (PDF report, .zrv archive).
// - Installed apps (Tauri): the system "Save as" dialog, so the user chooses (and knows) where the file goes.
//   A webview download would land silently in the Downloads folder, without telling where.
// - Web version, or if the dialog is not available: browser download (the browser decides the folder).
import { isTauriApp } from './updates.js'

// The message to show once the file is saved
export function savedMessage(label, result) {
  if (result.path) return `${label} salvato in: ${result.path}`
  return `${label} scaricato: ${result.fileName} (nella cartella dei download del browser).`
}

function browserDownload(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Dialog opened in the Downloads folder (desktop); just the name where the folder is not known (mobile)
async function defaultPath(fileName) {
  try {
    const { downloadDir, join } = await import('@tauri-apps/api/path')
    return await join(await downloadDir(), fileName)
  } catch {
    return fileName
  }
}

// { fileName, path } once saved (path only in the installed apps); null if the user cancels the dialog.
// filters: [{ name, extensions: ['pdf'] }]
export async function saveFile(blob, fileName, { filters, app = isTauriApp() } = {}) {
  if (app) {
    let path
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      path = await save({ defaultPath: await defaultPath(fileName), filters })
    } catch (err) {
      console.warn('Finestra di salvataggio non disponibile, uso il download:', err)
      browserDownload(blob, fileName)
      return { fileName }
    }
    if (!path) return null
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
    return { fileName, path }
  }
  browserDownload(blob, fileName)
  return { fileName }
}
