import { useEffect, useState } from 'react'
import FileUpload from '../../components/files/FileUpload'
import { api } from '../../api/client'
import './shop-logo.css'
export default function ShopLogo() {
  const [rows, setRows] = useState([])
  const [legacy, setLegacy] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (window.parent === window) return
    try {
      const parentRoot = window.parent.document.documentElement
      const syncTheme = () => document.documentElement.classList.toggle('dark', parentRoot.classList.contains('dark'))
      syncTheme()
      const observer = new MutationObserver(syncTheme)
      observer.observe(parentRoot, { attributes: true, attributeFilter: ['class'] })
      return () => observer.disconnect()
    } catch { /* A standalone page still uses the normal saved theme. */ }
  }, [])
  useEffect(() => {
    let active = true
    api('/api/shop-settings/logo').then(data => {
      if (active) { setRows(data.file ? [data.file] : []); setLegacy(data.legacy_url) }
    }).catch(e => { if (active) { setError(e.message); setLoadFailed(true) } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    function warn(event) { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  async function save() {
    setSaving(true); setError(''); setMessage('')
    try {
      const data = await api('/api/shop-settings/logo', { method: 'PUT', body: { file_id: rows[0]?.id || null } })
      setRows(data.file ? [data.file] : []); setLegacy(data.legacy_url); setDirty(false)
      setMessage('Shop logo saved. Receipts will use this logo.')
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }
  const busy = rows.some(row => row.status !== 'ready')
  return <main className="shop-logo-panel">
    <h2>Shop logo</h2><p>This logo belongs to your shop. Adjust its printed size in Receipt Settings.</p>
    {loading ? <p role="status">Loading shop logo...</p> : <>
      {legacy && <div className="shop-logo-existing"><img src={legacy} alt="Current shop logo" /><p>Your existing logo stays in use until you save a replacement.</p><button type="button" disabled={saving} onClick={() => { setLegacy(null); setDirty(true) }}>Remove existing logo</button></div>}
      <FileUpload purpose="company.logo" label="Shop logo image" value={rows} disabled={saving || loadFailed} showDownload={false} onChange={value => { setRows(value); setDirty(true); setMessage('') }} />
      <button className="shop-logo-save" type="button" disabled={saving || busy || !dirty} onClick={save}>{saving ? 'Saving...' : 'Save shop logo'}</button>
    </>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </main>
}
