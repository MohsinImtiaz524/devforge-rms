import AnnouncementAttachments from '../../components/files/AnnouncementAttachments'
import { useEffect, useState } from 'react'
import { api } from '../../api/client'

export default function AnnouncementCard({ item }) {
  const [preview, setPreview] = useState(false)
  const [viewed, setViewed] = useState(Boolean(item.viewed_at))

  useEffect(() => {
    if (!preview) return undefined
    const closeOnEscape = event => {
      if (event.key === 'Escape') setPreview(false)
    }
    addEventListener('keydown', closeOnEscape)
    return () => removeEventListener('keydown', closeOnEscape)
  }, [preview])

  async function reveal() {
    setPreview(true)
    if (!viewed) {
      await api(`/api/announcements/${item.id}/viewed`, { method: 'POST' }).catch(() => {})
      setViewed(true)
    }
  }

  async function action() {
    await api(`/api/announcements/${item.id}/cta`, { method: 'POST' }).catch(() => {})
    if (item.cta_path) location.assign(item.cta_path)
  }

  return <>
    <article className={`announcement-card ${viewed ? '' : 'unread'}`}>
      {item.media_url && <div className="announcement-media announcement-card-media"><img src={item.media_url} alt={item.media_alt || ''}/></div>}
      <div>
        <header><span>{item.type.replaceAll('_', ' ')}</span><time>{item.publish_at ? new Date(item.publish_at).toLocaleDateString() : ''}</time></header>
        <h3>{item.headline}</h3>
        <p>{item.summary}</p>
        <footer><button type="button" className="primary" onClick={reveal}>View announcement</button></footer>
      </div>
    </article>
    {preview && <div className="announcement-prompt-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPreview(false) }}>
      <section className="announcement-prompt announcement-history-preview announcement-artwork-popup" role="dialog" aria-modal="true" aria-label={item.headline}>
        <div>
          {item.media_url ? <div className="announcement-media announcement-prompt-media"><img src={item.media_url} alt={item.media_alt || item.headline}/><div className="announcement-embedded-actions"><button type="button" className="announcement-image-skip" onClick={() => setPreview(false)}>Skip</button>{item.cta_path && <button type="button" className="announcement-image-action cta" onClick={action}><span>{item.cta_label || 'Open announcement'}</span><span aria-hidden="true">→</span></button>}</div></div> : <div className="announcement-prompt-actions"><button type="button" onClick={() => setPreview(false)}>Skip</button>{item.cta_path && <button type="button" className="primary" onClick={action}>{item.cta_label || 'Open'} →</button>}</div>}
        </div>
        <AnnouncementAttachments announcementId={item.id}/>
      </section>
    </div>}
  </>
}