import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EllipsisVertical } from 'lucide-react';

export function SalesActionsMenu({ billNumber, children }) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector('button')?.focus();
    const dismiss = event => {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    };
    const close = () => setPosition(null);
    const scroll = event => { if (!menu.current?.contains(event.target)) close(); };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [position]);

  function open() {
    const rect = trigger.current.getBoundingClientRect();
    const above = window.innerHeight - rect.bottom < 300 && rect.top > window.innerHeight - rect.bottom;
    setPosition({
      top: above ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)),
      maxHeight: Math.max(80, Math.min(320, (above ? rect.top : window.innerHeight - rect.bottom) - 14)),
      transform: above ? 'translateY(-100%)' : undefined,
    });
  }

  function keyboard(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
      trigger.current?.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...menu.current.querySelectorAll('button:not(:disabled)')];
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }

  return <>
    <button ref={trigger} type="button" className="sales-actions-trigger"
      aria-label={`Actions for bill #${billNumber}`} aria-expanded={Boolean(position)} aria-controls={position ? id : undefined}
      onClick={() => position ? setPosition(null) : open()}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); open(); } }}>
      <EllipsisVertical size={20} aria-hidden="true" />
    </button>
    {position && createPortal(<div id={id} ref={menu} className="sales-action-menu" role="group"
      aria-label={`Bill #${billNumber} actions`} style={position} onKeyDown={keyboard}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !trigger.current?.contains(event.relatedTarget)) setPosition(null); }}
      onClick={event => { if (event.target.closest('button')) setPosition(null); }}>
      {children}
    </div>, document.body)}
  </>;
}
