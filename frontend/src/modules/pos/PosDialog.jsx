import { useEffect, useRef } from 'react'
import { X, LoaderCircle } from 'lucide-react'

export default function PosDialog({ title, close, children, busy=false, className='' }) {
  const dialog=useRef(null)
  useEffect(()=>{
    const previous=document.activeElement
    dialog.current?.focus()
    const handle=event=>{
      if([...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1)!==dialog.current)return
      if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();if(!busy)close()}
      if(event.key==='Tab'){
        const controls=[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(element=>element.getClientRects().length)
        const first=controls[0],last=controls.at(-1)
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus()}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
      }
    }
    document.addEventListener('keydown',handle)
    return()=>{document.removeEventListener('keydown',handle);if(previous?.isConnected)previous.focus()}
  },[close,busy])
  return <div className={'pos-modal-bg '+(className==='pos-table-dialog'?'pos-table-overlay':'')} onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)close()}}><section className={'pos-modal pos-orders-dialog '+className} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} ref={dialog} tabIndex={-1}><header><h3>{title}</h3><button aria-label="Close" disabled={busy} onClick={close}><X size={18}/></button></header>{children}</section>{busy&&<div className="pos-dialog-busy" role="status"><LoaderCircle className="pos-spin" size={28}/><b>Processing...</b></div>}</div>
}
