import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { queuedUpload, putFile } from './client'
const pause = (ms, signal) => new Promise((resolve, reject) => {
  if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'))
  const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
  signal.addEventListener('abort', abort, { once: true })
})
export function useFileUpload({ purpose, value, onChange }) {
  const [policy, setPolicy] = useState(null), [error, setError] = useState('')
  const values = useRef(value), callback = useRef(onChange), transfers = useRef(new Map()), mounted = useRef(true)
  useEffect(() => { values.current = value; callback.current = onChange }, [value, onChange])
  useEffect(() => { let live = true; api(`/api/files/policies/${purpose}`).then(p => { if (live) setPolicy(p) }).catch(e => { if (live) setError(e.message) }); return () => { live = false } }, [purpose])
  useEffect(() => { mounted.current = true; const current = transfers.current; return () => { mounted.current = false; current.forEach(t => { t.controller.abort(); if (t.sessionId) api(`/api/files/upload-sessions/${t.sessionId}`, { method: 'DELETE' }).catch(() => {}); if (t.preview) URL.revokeObjectURL(t.preview) }); current.clear() } }, [])
  const publish = useCallback(next => { values.current = next; if (mounted.current) callback.current(next) }, [])
  const patch = useCallback((key, update) => publish(values.current.map(v => v.key === key ? { ...v, ...update } : v)), [publish])
  const start = useCallback(async (key, transfer) => {
    const { file, controller } = transfer, signal = controller.signal
    try {
      await queuedUpload(async () => {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
        patch(key, { status: 'uploading', error: '' })
        const session = await api('/api/files/upload-sessions', { method: 'POST', body: { purpose, filename: file.name, contentType: file.type, size: file.size, idempotencyKey: crypto.randomUUID() } })
        transfer.sessionId = session.sessionId
        if (signal.aborted) { await api(`/api/files/upload-sessions/${session.sessionId}`, { method: 'DELETE' }); throw new DOMException('Cancelled', 'AbortError') }
        await putFile(session.url, session.headers, file, signal, progress => patch(key, { progress }))
        patch(key, { id: session.fileId, status: 'verifying', progress: 100 })
        await api(`/api/files/upload-sessions/${session.sessionId}/complete`, { method: 'POST' })
      })
      const deadline = Date.now() + 300000
      while (Date.now() < deadline) {
        await pause(1500, signal)
        const current = values.current.find(v => v.key === key)
        if (!current) return
        const result = await api(`/api/files/${current.id}`)
        if (result.status === 'ready') { transfer.sessionId = null; patch(key, { ...result, status: 'ready' }); return }
        if (['rejected', 'expired', 'deleting', 'deleted'].includes(result.status)) throw new Error('File verification failed. Remove this file or retry.')
      }
      throw new Error('Verification is taking too long. Please retry.')
    } catch (e) { if (!signal.aborted) patch(key, { status: 'error', error: e.message }) }
  }, [purpose, patch])
  function add(files) {
    if (!policy) return
    setError('')
    const selected = Array.from(files)
    if (!selected.length) return
    const replacing = policy.maxCount === 1 && selected.length === 1
    if ((!replacing && values.current.length + selected.length > policy.maxCount) || selected.length > policy.maxCount) { setError(`Select at most ${policy.maxCount} files.`); return }
    if ((replacing ? 0 : values.current.reduce((n, f) => n + f.size, 0)) + selected.reduce((n, f) => n + f.size, 0) > policy.maxTotalBytes) { setError('Total attachment size exceeds the limit.'); return }
    if (selected.some(f => !policy.types.includes(f.type) || f.size === 0 || f.size > policy.maxBytes)) { setError(`Choose a supported file up to ${policy.maxBytes / 1048576} MB.`); return }
    const rows = selected.map(file => {
      const key = crypto.randomUUID(), preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      const transfer = { file, preview, controller: new AbortController() }; transfers.current.set(key, transfer)
      return { key, name: file.name, size: file.size, mime: file.type, status: 'queued', progress: 0, preview }
    })
    if (replacing) { transfers.current.forEach((t,key) => { if(rows.some(row=>row.key===key))return; t.controller.abort(); if(t.sessionId) api(`/api/files/upload-sessions/${t.sessionId}`,{method:'DELETE'}).catch(()=>{}); if(t.preview) URL.revokeObjectURL(t.preview) }); transfers.current.clear(); rows.forEach(row => { const file=selected[0]; transfers.current.set(row.key,{file,preview:row.preview,controller:new AbortController()}) }) }
    publish([...(replacing ? [] : values.current), ...rows]); rows.forEach(row => { void start(row.key, transfers.current.get(row.key)) })
  }
  function remove(row) {
    const transfer = transfers.current.get(row.key)
    if (transfer) { transfer.controller.abort(); if (transfer.sessionId) api(`/api/files/upload-sessions/${transfer.sessionId}`, { method: 'DELETE' }).catch(() => {}); if (transfer.preview) URL.revokeObjectURL(transfer.preview); transfers.current.delete(row.key) }
    publish(values.current.filter(v => v !== row))
  }
  async function retry(row) {
    const transfer = transfers.current.get(row.key); if (!transfer) return
    transfer.controller.abort()
    if (transfer.sessionId) await api(`/api/files/upload-sessions/${transfer.sessionId}`, { method: 'DELETE' }).catch(() => {})
    transfer.controller = new AbortController(); transfer.sessionId = null; patch(row.key, { status: 'queued', progress: 0, error: '' }); void start(row.key, transfer)
  }
  return { policy, error, add, remove, retry }
}
