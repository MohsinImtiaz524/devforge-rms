import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
export default function MenuDialog({label,children,onClose}) {
 const ref=useRef(null),closeRef=useRef(onClose)
 useEffect(()=>{closeRef.current=onClose},[onClose])
 useEffect(()=>{const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';ref.current?.focus({preventScroll:true});function keydown(e){if(e.key==='Escape'){e.preventDefault();closeRef.current()}if(e.key==='Tab'){const nodes=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(n=>n.getClientRects().length);if(!nodes.length){e.preventDefault();return}if(e.shiftKey&&(document.activeElement===nodes[0]||document.activeElement===ref.current)){e.preventDefault();nodes[nodes.length-1].focus()}else if(!e.shiftKey&&(document.activeElement===nodes[nodes.length-1]||document.activeElement===ref.current)){e.preventDefault();nodes[0].focus()}}}document.addEventListener('keydown',keydown);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus({preventScroll:true})}},[])
 return createPortal(<div className="menu-dialog-backdrop" onClick={e=>{if(e.target===e.currentTarget)closeRef.current()}}><section className="menu-dialog" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>{children}</section></div>,document.body)
}
