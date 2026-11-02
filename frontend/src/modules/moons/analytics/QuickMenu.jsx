import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { MODULE_GROUPS, MODULES } from './analytics-modules'

export function QuickMenu({ open, modules, onClose, openModule }) {
  const root = useRef(null)
  const panel = useRef(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    const siblings = [...document.body.children].filter(el => el !== root.current)
    const inert = siblings.map(el => el.inert)
    siblings.forEach(el => { el.inert = true })
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('button')?.focus()
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key !== 'Tab') return
      const controls = [...panel.current.querySelectorAll('button:not(:disabled),a[href]')]
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      siblings.forEach((el, index) => { el.inert = inert[index] })
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  const groups = MODULE_GROUPS.map(group => ({ ...group, panels: group.panels.map(id => modules.find(module => module.id === id)).filter(Boolean) })).filter(group => group.panels.length)
  return createPortal(<div className="analytics-module-overlay" ref={root}>
    <div className="amo-backdrop" onClick={onClose} aria-hidden="true" />
    <section className="amo-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="analytics-modules-title">
      <header><div><span>Workspace navigation</span><h2 id="analytics-modules-title">Navigate Modules</h2></div><button type="button" onClick={onClose} aria-label="Close modules"><X size={21} /></button></header>
      <p className="amo-intro">Switch to another workspace module.</p>
      <nav aria-label="Workspace modules">{groups.map(group => <section key={group.title}><h3>{group.title}</h3>{group.panels.map(module => <button type="button" key={module.id} onClick={() => { onClose(); openModule(module) }}><span className="amo-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">{MODULES.find(item => item.id === module.id)?.icon}</svg></span><span><strong>{module.label}</strong>{module.desc && <small>{module.desc}</small>}</span></button>)}</section>)}</nav>
      {!groups.length && <p className="amo-intro">No workspace modules are available yet.</p>}
    </section>
  </div>, document.body)
}
