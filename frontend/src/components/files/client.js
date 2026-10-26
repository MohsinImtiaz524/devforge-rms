import { api } from '../../api/client'
let active = 0
const waiting = []
function drain() { while (active < 3 && waiting.length) { active++; waiting.shift()() } }
export async function queuedUpload(task) {
  await new Promise(resolve => { waiting.push(resolve); drain() })
  try { return await task() } finally { active--; drain() }
}
export function putFile(url, headers, file, signal, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    xhr.open('PUT', url); xhr.timeout = 120000
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value))
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)) }
    const done = error => { signal.removeEventListener('abort', abort); error ? reject(error) : resolve() }
    xhr.onload = () => done(xhr.status >= 200 && xhr.status < 300 ? null : new Error(`Storage rejected the upload (HTTP ${xhr.status}). Check storage permissions and try again.`))
    xhr.onerror = () => done(new Error(`Upload could not reach storage. Check that the bucket CORS rules allow ${window.location.origin}, PUT, and Content-Type, or check your connection.`))
    xhr.ontimeout = () => done(new Error('Transfer timed out. Please retry.'))
    xhr.onabort = () => done(new DOMException('Cancelled', 'AbortError'))
    xhr.send(file)
  })
}
export async function downloadFile(id) { const result = await api(`/api/files/${id}/download-url`, { method: 'POST' }); location.assign(result.url) }
