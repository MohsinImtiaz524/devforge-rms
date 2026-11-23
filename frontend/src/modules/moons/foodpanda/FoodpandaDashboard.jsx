import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Bike, Check, ChevronLeft, ChevronRight, ClipboardList, LayoutGrid, Menu, Pause, Play, RefreshCw, Search, Sun, Moon } from 'lucide-react'
import { api } from '../../../api/client'
import { formatShopCurrency as money } from '../../../currency'
import { MoonsSidebar } from '../MoonsSidebar'
import FoodpandaIcon from '../../pos/FoodpandaIcon'
import './foodpanda.css'

const statuses = ['all','pending','preparing','ready','served','completed','cancelled']
const statusLabel = value => ({ all:'All statuses', preparing:'In progress', ready:'Out for delivery', served:'Delivered' })[value] || value.charAt(0).toUpperCase() + value.slice(1)

export default function FoodpandaDashboard() {
  const [user, setUser] = useState(null)
  const [settings, setSettings] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const closeDrawer = useCallback(() => setDrawer(false), [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    document.cookie = 'rms_theme=' + (dark ? 'dark' : 'light') + '; Path=/; Max-Age=31536000; SameSite=Lax'
  }, [dark])
  useEffect(() => {
    let active = true
    Promise.all([api('/api/auth/me'), api('/api/integrations/foodpanda')]).then(([session, value]) => {
      if (active) { setUser(session.user || session); setSettings(value) }
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [])
  const load = useCallback(async signal => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: String(page), search, status })
      const result = await api('/api/integrations/foodpanda/orders?' + params, { signal })
      setData(result)
    } catch (error) { if (error.name !== 'AbortError') setError(error.message) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [page, search, status])
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => { void load(controller.signal) }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [load])
  async function toggleOrdering() {
    if (busy || !settings) return
    setBusy(true); setError('')
    try {
      const value = await api('/api/integrations/foodpanda', { method:'PUT', body:{ enabled:!settings.enabled } })
      setSettings(current => ({ ...current, ...value }))
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  const summary = data?.summary
  const nav = [
    { key:'orders', label:'Foodpanda orders', icon:<ClipboardList size={21}/>, onClick:() => document.getElementById('foodpanda-orders')?.scrollIntoView({ behavior:'smooth' }) },
    { key:'pos', label:'POS terminal', icon:<Bike size={21}/>, onClick:() => location.assign('/app/pos') },
    { key:'integrations', label:'Integrations', icon:<LayoutGrid size={21}/>, onClick:() => location.assign('/app/moons?tab=integrations') },
  ]
  return <div className="marketplace foodpanda-workspace">
    <MoonsSidebar user={user} label="Foodpanda" navLabel="Foodpanda workspace" items={nav} activeId="orders" drawerOpen={drawer} onClose={closeDrawer}/>
    <main className="market-main">
      <header className="market-topbar"><div><button className="market-icon-button market-menu-toggle" aria-label="Open navigation" onClick={() => setDrawer(true)}><Menu size={21}/></button><a href="/app/moons?tab=integrations">Integrations</a><ChevronRight size={14}/><h1>Foodpanda</h1></div><div><button className="market-icon-button" aria-label={dark?'Use light theme':'Use dark theme'} onClick={() => setDark(value => !value)}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button><button className="market-outline" disabled={loading} onClick={() => load()}><RefreshCw size={15}/>Refresh</button></div></header>
      <div className="foodpanda-content">
        <section className="foodpanda-heading"><div><p className="market-eyebrow">YOUR DELIVERY PARTNER</p><h2><FoodpandaIcon size={32}/>Foodpanda orders</h2><p>Your Foodpanda orders, with their own history and totals.</p></div><a className="market-outline" href="/app/pos">Open POS<ArrowRight size={16}/></a></section>
        <section className={'foodpanda-ordering '+(settings?.enabled?'is-enabled':'')} aria-label="Foodpanda ordering"><span className="foodpanda-state-icon">{settings?.enabled?<Check size={20}/>:<Pause size={20}/>}</span><div><strong>{settings ? settings.enabled?'Accepting Foodpanda orders':'Foodpanda ordering stopped' : 'Loading integration...'}</strong><p>Foodpanda provides the riders. Your saved orders and history are always available.</p></div>{settings?.can_manage&&<button className="market-outline" disabled={busy} onClick={toggleOrdering}>{settings.enabled?<Pause size={16}/>:<Play size={16}/>} {busy?'Saving...':settings.enabled?'Stop new orders':'Enable ordering'}</button>}</section>
        {error&&<div role="alert" className="foodpanda-error">{error}</div>}
        <section className="foodpanda-metrics" aria-label="Foodpanda totals for all time">{[
          ['Total orders', summary?.total_orders], ['Active orders', summary?.active_orders], ['Completed orders', summary?.completed_orders], ['Completed sales', summary?money(summary.completed_sales):null],
        ].map(([label,value])=><article key={label}><span>{label}</span>{summary?<strong>{value}</strong>:<div className="foodpanda-skeleton"/>}<small>Foodpanda · All time</small></article>)}</section>
        <section id="foodpanda-orders" className="foodpanda-orders"><header><div><h3>Order history</h3><p>Foodpanda orders only</p></div><span>{summary?.cancelled_orders || 0} cancelled</span></header>
          <div className="foodpanda-filters"><label><Search size={18}/><input aria-label="Search Foodpanda orders" placeholder="Search order number or customer" value={search} onChange={event=>{setSearch(event.target.value);setPage(1)}}/></label><select aria-label="Foodpanda order status" value={status} onChange={event=>{setStatus(event.target.value);setPage(1)}}>{statuses.map(value=><option key={value} value={value}>{statusLabel(value)}</option>)}</select></div>
          <div className="foodpanda-table" aria-busy={loading}><table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Total</th><th>Placed</th></tr></thead><tbody>{loading?Array.from({length:5},(_,index)=><tr key={index}>{Array.from({length:5},(_,cell)=><td key={cell}><div className="foodpanda-skeleton"/></td>)}</tr>):data?.orders.map(order=><tr key={order.id}><td><strong>#{order.order_number || order.id}</strong><small>Foodpanda</small></td><td>{order.customer_name || 'Not provided'}</td><td><span className="foodpanda-status" data-status={order.order_status}>{statusLabel(order.order_status)}</span></td><td>{money(order.total)}</td><td>{new Date(order.created_at).toLocaleString()}</td></tr>)}</tbody></table>{!loading&&!error&&!data?.orders.length&&<div className="foodpanda-empty"><ClipboardList size={30}/><h3>No Foodpanda orders found</h3><p>{search||status!=='all'?'Try another search or status.':'Orders marked Foodpanda in POS will appear here.'}</p></div>}</div>
          <footer><span>{data?.pagination.total || 0} orders</span><div><button className="market-icon-button" aria-label="Previous page" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><span>Page {page} of {data?.pagination.total_pages || 1}</span><button className="market-icon-button" aria-label="Next page" disabled={loading||page>=(data?.pagination.total_pages || 1)} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button></div></footer>
        </section><a className="foodpanda-back" href="/app/moons?tab=integrations"><ArrowLeft size={16}/>Back to Integrations</a>
      </div>
    </main>
  </div>
}
