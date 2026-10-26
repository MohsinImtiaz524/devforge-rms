import { useEffect, useState } from 'react'
import { useFileUpload } from './useFileUpload'
import { downloadFile } from './client'
import './files.css'
export default function FileUpload({ purpose, value, onChange, disabled = false, onBusyChange, label = 'Attachments', description = '', showDownload = true }) {
  const { policy, error, add, remove, retry } = useFileUpload({ purpose, value, onChange })
  const [downloadError, setDownloadError] = useState('')
  const busy = value.some(f => f.status !== 'ready')
  useEffect(() => { onBusyChange?.(busy) }, [busy, onBusyChange])
  return <section className="file-upload" aria-label={label}>
    <div className="file-upload-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!disabled) add(event.dataTransfer.files) }}>
      <label>{label}<input type="file" multiple={policy?.maxCount !== 1} accept={policy?.types.join(',')} disabled={disabled || !policy} onChange={event => { add(event.target.files); event.target.value = '' }} /></label>
      <small>{description && <>{description} </>}{policy ? `Drop images here or use the picker. Up to ${policy.maxCount} ${policy.maxCount === 1 ? 'image' : 'images'}, ${policy.maxBytes / 1048576} MB each. ${policy.autoResize ? 'Large images resize automatically, preserving their proportions without cropping. ' : ''}Formats: ${policy.types.map(type => type.replace('image/', '').toUpperCase()).join(', ')}. Uploads require connectivity.` : 'Loading upload rules...'}</small>
    </div>
    {(error || downloadError) && <p role="alert">{error || downloadError}</p>}
    <ul>{value.map(row => <li key={row.key || row.id}>
      {(row.preview || row.preview_url) && <img src={row.preview || row.preview_url} alt="" />}<div><span>{row.name}</span><small role="status">{row.status === 'uploading' ? `Uploading ${row.progress}%` : row.status}</small>{['queued', 'uploading', 'verifying'].includes(row.status) && <progress value={row.progress || 0} max="100" aria-label={`Upload progress for ${row.name}`} />} {row.error && <small role="alert">{row.error}</small>}</div>
      {showDownload && row.status === 'ready' && <button type="button" onClick={() => downloadFile(row.id).catch(e => setDownloadError(e.message))}>Download</button>}
      {row.status === 'error' && <button type="button" disabled={disabled} onClick={() => retry(row)}>Retry</button>}
      <button type="button" disabled={disabled} aria-label={`Remove ${row.name}`} onClick={() => remove(row)}>Remove</button>
    </li>)}</ul>
  </section>
}
