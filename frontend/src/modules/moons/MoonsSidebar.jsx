import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Moon, X } from 'lucide-react'
import './marketplace.css'
import './moons-sidebar.css'

export function MoonsSidebar({ user, label = 'Moons workspace', navLabel = 'Moons navigation', items, activeId, drawerOpen, onClose, children, footer }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('rms_moons_sidebar_collapsed') === 'true')
  const sidebar = useRef(null)
  useEffect(() => { localStorage.setItem('rms_moons_sidebar_collapsed', String(collapsed)) }, [collapsed])
  useEffect(() => {
    if (!drawerOpen) return
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sidebar.current?.querySelector('a,button')?.focus()
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const controls = [...sidebar.current.querySelectorAll('a[href],button:not(:disabled)')].filter(el => el.getClientRects().length)
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [drawerOpen, onClose])
  return <>
    {drawerOpen && <button className="market-sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
    <aside ref={sidebar} className={`market-sidebar moons-shared-sidebar ${collapsed ? 'is-collapsed' : ''} ${drawerOpen ? 'is-open' : ''}`} aria-label="Workspace sidebar">
      <div className="moons-sidebar-heading"><a className="market-brand" href="/app/lobby" aria-label="OrbitOS workspace"><span className="moons-brand-full">Orbit<span>OS</span></span><Moon className="moons-brand-mark" size={24} /></a><button className="moons-collapse-toggle" type="button" aria-label={collapsed ? 'Expand Moons sidebar' : 'Collapse Moons sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</button><button className="moons-drawer-close" type="button" aria-label="Close navigation" onClick={onClose}><X size={20} /></button></div>
      <div className="market-shop" title={label}><Moon size={22} /><span><strong>{label}</strong><small>{user?.shop_name || 'My shop'}</small></span></div>
      <p className="market-nav-label">{navLabel === 'Moons navigation' ? 'Your Moons' : navLabel}</p>
      <nav className="market-navigation" aria-label={navLabel}>{items.map((item, index) => <Fragment key={item.key}>{item.group && item.group !== items[index - 1]?.group && <p className="moons-nav-group">{item.group}</p>}<button type="button" title={item.label} aria-label={item.label} aria-current={activeId === item.key ? 'page' : undefined} className={activeId === item.key ? 'is-active' : ''} onClick={() => { item.onClick(); onClose() }}>{item.icon}<span className="moons-nav-copy">{item.label}</span>{item.count !== undefined && <span className="market-nav-count">{item.count}</span>}</button></Fragment>)}</nav>
      <div className="market-sidebar-bottom">{footer}<a href="/app/lobby" title="Back to workspace"><ArrowLeft size={20} /><span className="moons-nav-copy">Back to workspace</span></a></div>
      {children}
    </aside>
  </>
}
