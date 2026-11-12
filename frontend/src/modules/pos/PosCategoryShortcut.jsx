import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export default function PosCategoryShortcut({ label, Icon, selected, choose }) {
  const [anchor, setAnchor] = useState(null)
  const timeout = useRef(null)
  const tooltipId = useId()
  const cancelHide = () => clearTimeout(timeout.current)
  const hide = () => { cancelHide(); setAnchor(null) }
  const scheduleHide = () => { cancelHide(); timeout.current = setTimeout(() => setAnchor(null), 120) }
  function show(event) {
    cancelHide()
    const rect = event.currentTarget.getBoundingClientRect()
    setAnchor({ left: rect.right + 10, top: Math.max(24, Math.min(innerHeight - 24, rect.top + rect.height / 2)) })
  }
  useEffect(() => () => clearTimeout(timeout.current), [])
  useEffect(() => {
    if (!anchor) return
    const dismiss = event => { if (event.type !== 'keydown' || event.key === 'Escape') setAnchor(null) }
    window.addEventListener('keydown', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('keydown', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [anchor])
  return <>
    <button type="button" aria-label={label} aria-describedby={anchor ? tooltipId : undefined} aria-pressed={selected} className={selected ? 'active' : ''} onMouseEnter={show} onMouseLeave={scheduleHide} onFocus={show} onBlur={hide} onClick={() => { hide(); choose() }}><Icon size={18}/></button>
    {anchor && createPortal(<span id={tooltipId} role="tooltip" className="pos-category-tooltip" style={{ left: anchor.left, top: anchor.top, maxWidth: Math.max(80, Math.min(240, innerWidth - anchor.left - 12)) }} onMouseEnter={cancelHide} onMouseLeave={scheduleHide}>{label}</span>, document.body)}
  </>
}
