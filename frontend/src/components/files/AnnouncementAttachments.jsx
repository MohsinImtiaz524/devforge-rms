import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { downloadFile } from './client'
export default function AnnouncementAttachments({ announcementId }) {
  const [items, setItems] = useState([]), [error, setError] = useState('')
  useEffect(() => { let live = true; api(`/api/announcements/${announcementId}/attachments`).then(result => { if(live)setItems(result.items) }).catch(e => { if(live)setError(e.message) }); return () => { live = false } }, [announcementId])
  if (!items.length && !error) return null
  return <section className="announcement-attachments" aria-label="Announcement attachments"><h3>Attachments</h3>{error && <p role="alert">{error}</p>}<ul>{items.map(item => <li key={item.id}><button type="button" onClick={() => downloadFile(item.id).catch(e=>setError(e.message))}>{item.name}</button></li>)}</ul></section>
}
