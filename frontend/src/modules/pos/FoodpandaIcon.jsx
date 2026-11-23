import { useEffect, useState } from 'react'
import { Bike } from 'lucide-react'
import { api } from '../../api/client'
import { foodpandaIconUrl } from './foodpanda-icon'

export default function FoodpandaIcon({ size = 16, fallback = null }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let active = true
    const refresh = () => api('/api/platform-icons').then(rows => {
      if (active) setUrl(foodpandaIconUrl(rows))
    }).catch(error => console.warn('Foodpanda icon unavailable:', error.message))
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [])
  return url ? <img src={url} alt="" width={size} height={size} style={{ objectFit: 'contain' }} onError={() => setUrl(null)} /> : fallback || <Bike size={size} aria-hidden="true" style={{ color: '#e21b70' }} />
}
