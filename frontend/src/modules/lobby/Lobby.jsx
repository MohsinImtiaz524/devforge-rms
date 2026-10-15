import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Bell, ChevronDown, ChevronRight, Download, LogOut, Moon, Search, Sun } from 'lucide-react'
import { api, legacyUrl } from '../../api/client'
import './lobby.css'

const GROUPS = [
  { key: 'operations', title: 'Operations', description: 'Daily restaurant operations and frontline tools.', ids: ['dashboard', 'pos', 'delivery', 'tables', 'kds', 'register'] },
  { key: 'business', title: 'Business', description: 'Manage your restaurant business and data.', ids: ['products', 'brands', 'sales-history', 'analytics', 'reports', 'expenses', 'raw-stock', 'waste-management', 'customers'] },
  { key: 'administration', title: 'Administration', description: 'People, settings and system management.', ids: ['notifications', 'notification-inbox', 'users', 'settings', 'logs', 'hierarchy', 'subscriptions'] },
]

function ModuleIcon({ module, compact = false }) {
  return <span className={`module-icon ${compact ? 'compact' : ''}`}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: module.icon }} /></span>
}

function Lobby() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [dark, setDark] = useState(() => {
    const sharedTheme = document.cookie.match(/(?:^|; )rms_theme=(dark|light)(?:;|$)/)?.[1] || localStorage.getItem('theme')
    return sharedTheme === 'dark' || (!sharedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })
  const [profileOpen, setProfileOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const profileRef = useRef(null)
  const installPrompt = useRef(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
    document.cookie = `rms_theme=${dark ? 'dark' : 'light'}; Path=/; Max-Age=31536000; SameSite=Lax`
  }, [dark])

  useEffect(() => {
    api('/api/lobby').then((lobby) => {
      if (lobby.user?.role === 'superadmin') {
        window.location.replace(legacyUrl('/admin/store-monitoring'))
        return
      }
      setData(lobby)
    }).catch((requestError) => {
      if (requestError.status === 401) window.location.replace(legacyUrl('/'))
      else setError(requestError.message)
    })
  }, [])

  useEffect(() => {
    function captureInstallPrompt(event) { event.preventDefault(); installPrompt.current = event }
    function closeProfile(event) { if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false) }
    function closeOnEscape(event) { if (event.key === 'Escape') setProfileOpen(false) }
    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('click', closeProfile)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('click', closeProfile)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    if (!data?.modules.some((module) => module.id === 'notifications')) return
    api('/api/notifications/unread-count').then((result) => setUnreadCount(Number(result.count || 0))).catch(() => {})
  }, [data])

  function openModule(module) {
    if (module.frontend === 'react') {
      window.location.assign(module.target)
      return
    }
    sessionStorage.setItem('lobby_selected', 'true')
    sessionStorage.setItem('react_lobby_owner', 'true')
    localStorage.setItem('pos_page', module.id)
    window.location.assign(legacyUrl(module.target))
  }

  async function logout() {
    if (data.register?.active) {
      const manage = window.confirm('You have an active register shift. Select OK to manage it before logging out, or Cancel to continue.')
      if (manage) {
        openModule({ id: 'register', frontend: 'legacy', target: '/dashboard#register' })
        return
      }
      if (!window.confirm('Log out without closing the register shift? Drawer totals will remain pending.')) return
    }
    await api('/api/auth/logout', { method: 'POST' })
    localStorage.clear()
    sessionStorage.clear()
    window.location.replace(legacyUrl('/'))
  }

  async function installApp() {
    setProfileOpen(false)
    if (installPrompt.current) {
      await installPrompt.current.prompt()
      await installPrompt.current.userChoice
      installPrompt.current = null
      return
    }
    window.alert('On iPhone: Share → Add to Home Screen. On Android: browser menu → Install app.')
  }

  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4)
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
    return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0))
  }

  async function enableNotifications() {
    setProfileOpen(false)
    try {
      if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('Notifications require HTTPS and a supported browser.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notification permission was not granted.')
      const registration = await navigator.serviceWorker.ready
      const { publicKey } = await api('/api/notifications/push/public-key')
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
      await api('/api/notifications/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), device_name: navigator.userAgent } })
      window.alert('Notifications enabled for this device.')
    } catch (notificationError) { window.alert(notificationError.message) }
  }

  const filteredModules = useMemo(() => {
    if (!data) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return data.modules
    return data.modules.filter((module) => `${module.label} ${module.desc}`.toLowerCase().includes(needle))
  }, [data, query])

  if (error) return <main className="lobby-state"><h1>Could not load modules</h1><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></main>
  if (!data) return <main className="lobby-state"><div className="lobby-spinner" /><p>Loading your workspace…</p></main>

  const { user, modules } = data
  const byId = new Map(filteredModules.map((module) => [module.id, module]))
  const featured = ['pos', 'kds', 'delivery'].map((id) => modules.find((module) => module.id === id)).filter(Boolean)
  const primaryFeature = featured[0]
  const secondaryFeatures = featured.slice(1)
  const grouped = GROUPS.map((group) => ({ ...group, modules: group.ids.map((id) => byId.get(id)).filter(Boolean) })).filter((group) => group.modules.length)
  const firstName = String(user.name || user.username || 'there').split(' ')[0]
  const notificationModule = modules.find((module) => module.id === 'notifications')

  return (
    <main className="react-lobby">
      <header className="lobby-topbar">
        <a className="lobby-brand" href="/app/lobby" aria-label="DevForge RMS home">
          <span className="lobby-brand-logo"><img className="theme-logo-light" src="/icons/logo-light.png" alt="" /><img className="theme-logo-dark" src="/icons/logo-dark.png" alt="" /></span>
          <strong>{user.shop_name || 'DevForge RMS'}</strong>
        </a>
        <label className="lobby-search"><Search size={20} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules..." aria-label="Search modules" /><kbd>Ctrl K</kbd></label>
        <div className="lobby-controls">
          {notificationModule && <button className="header-icon-button notification-button" title="Notifications" onClick={() => openModule(notificationModule)}><Bell size={22} aria-hidden="true" />{unreadCount > 0 && <span>{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>}
          <div className="lobby-user-copy"><strong>{user.name || user.username}</strong><span>{user.role}</span></div>
          <div className="profile-wrap" ref={profileRef}>
            <button className="profile-trigger" onClick={(event) => { event.stopPropagation(); setProfileOpen((value) => !value) }} aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={profileOpen}><span className="profile-avatar">{String(user.name || user.username).charAt(0).toUpperCase()}</span><ChevronDown size={17} aria-hidden="true" /></button>
            <div className={`profile-dropdown ${profileOpen ? 'active' : ''}`} role="menu" aria-label="Profile options">
              <div className="profile-mobile-user"><strong>{user.name || user.username}</strong><span>{user.role}</span></div>
              <button type="button" role="menuitem" className="dropdown-item" onClick={() => { setDark((value) => !value); setProfileOpen(false) }}>{dark ? <Sun size={19} /> : <Moon size={19} />}<span>{dark ? 'Switch to light mode' : 'Switch to dark mode'}</span></button>
              <button type="button" role="menuitem" className="dropdown-item" onClick={installApp}><Download size={19} /><span>Download app</span></button>
              <button type="button" role="menuitem" className="dropdown-item" onClick={enableNotifications}><Bell size={19} /><span>Device notifications</span></button>
              <div className="dropdown-separator"><button type="button" role="menuitem" className="dropdown-item sign-out" onClick={logout}><LogOut size={19} /><span>Sign out</span></button></div>
            </div>
          </div>
        </div>
      </header>

      <section className="lobby-content">
        <header className="workspace-heading"><span>Welcome back, {firstName}</span><h1>Your workspace</h1><p>Quickly access your restaurant operations, from daily tasks to business management.</p></header>

        {!query && primaryFeature && <section className="featured-strip" aria-label="Quick access modules">
          <div className="featured-primary"><ModuleIcon module={primaryFeature} /><div className="featured-copy"><span>{primaryFeature.label}</span><h2>Open {primaryFeature.label === 'POS Terminal' ? 'Point of Sale' : primaryFeature.label}</h2><p>{primaryFeature.desc}</p></div><button onClick={() => openModule(primaryFeature)}>{primaryFeature.id === 'pos' ? 'Open POS' : `Open ${primaryFeature.label}`} <ArrowRight size={20} /></button></div>
          {secondaryFeatures.map((module) => <button className="featured-secondary" key={module.id} onClick={() => openModule(module)}><ModuleIcon module={module} compact /><span><strong>{module.label}</strong><small>{module.desc}</small></span><ChevronRight size={22} /></button>)}
        </section>}

        {grouped.length ? <section className="module-groups" aria-label="Available modules">
          {grouped.map((group) => <article className="module-group" key={group.key}><header><span className={`group-mark ${group.key}`} aria-hidden="true" /><div><h2>{group.title}</h2><p>{group.description}</p></div></header><div className="group-list">{group.modules.map((module) => <button className="module-row" key={module.id} onClick={() => openModule(module)}><ModuleIcon module={module} compact /><span className="module-copy"><strong>{module.label}</strong><small>{module.desc}</small></span><ChevronRight className="module-chevron" size={21} /></button>)}</div></article>)}
        </section> : <div className="lobby-empty"><Search size={24} /><strong>No matching modules</strong><span>Try another search term.</span></div>}
      </section>
    </main>
  )
}

export default Lobby
