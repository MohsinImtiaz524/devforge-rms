import { useEffect, useState } from 'react'
import { api } from '../../api/client'

export default function FoodpandaIntegration() {
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    api('/api/integrations/foodpanda').then(value => { if (active) setSettings(value) }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [])
  async function toggle() {
    if (busy || !settings) return
    setBusy(true); setError('')
    try {
      const value = await api('/api/integrations/foodpanda', { method: 'PUT', body: { enabled: !settings.enabled } })
      setSettings(current => ({ ...current, ...value }))
      if (value.enabled) location.assign('/app/integrations/foodpanda')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  return <div className="market-dialog-body"><p>Enable Foodpanda as a separate order type in your POS. Foodpanda supplies its own riders.</p><p>Orders placed as Foodpanda always keep their Foodpanda order type. Orders are entered manually in POS.</p>{error && <p role="alert">{error}</p>}{settings ? <>{settings.activated && <a className="market-outline" href="/app/integrations/foodpanda">Open Foodpanda</a>}<p role="status">{settings.enabled ? 'Enabled' : 'Disabled'}</p>{settings.can_manage ? <button className="market-primary" type="button" disabled={busy} onClick={toggle}>{busy ? 'Saving...' : settings.enabled ? 'Stop Foodpanda orders' : 'Enable Foodpanda'}</button> : <p>Ask your restaurant administrator to manage this integration.</p>}</> : !error && <p>Loading integration settings...</p>}</div>
}
