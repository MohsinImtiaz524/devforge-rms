import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {MoreVertical} from 'lucide-react'

export default function ActionMenu({items=[],label='Open actions'}){
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0})
 const triggerRef=useRef(null),menuRef=useRef(null)
 useLayoutEffect(()=>{if(!open||!triggerRef.current)return;const rect=triggerRef.current.getBoundingClientRect(),width=196,height=Math.max(48,items.length*40+12),top=rect.bottom+6+height>window.innerHeight?Math.max(8,rect.top-height-6):rect.bottom+6,left=Math.min(window.innerWidth-width-8,Math.max(8,rect.right-width));setPosition({top,left})},[open,items.length])
 useEffect(()=>{if(!open)return;const close=event=>{if(event.key==='Escape'){setOpen(false);triggerRef.current?.focus()}},reposition=()=>setOpen(false);document.addEventListener('keydown',close);window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);requestAnimationFrame(()=>menuRef.current?.querySelector('[role="menuitem"]')?.focus());return()=>{document.removeEventListener('keydown',close);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true)}},[open])
 const choose=item=>{setOpen(false);if(item.onClick)item.onClick()}
 const menu=open&&createPortal(<><button className="expense-action-menu-backdrop" aria-label="Close actions" onClick={()=>setOpen(false)}/><div ref={menuRef} className="expense-action-menu-popover" role="menu" aria-label={label} style={position}>{items.length?items.map((item,index)=>{const Icon=item.icon;return item.href?<a key={item.label+index} role="menuitem" href={item.href} target={item.target} rel={item.target==='_blank'?'noreferrer':undefined} className={item.danger?'danger':''} onClick={()=>setOpen(false)}>{Icon&&<Icon/>}<span>{item.label}</span></a>:<button key={item.label+index} type="button" role="menuitem" className={item.danger?'danger':''} onClick={()=>choose(item)}>{Icon&&<Icon/>}<span>{item.label}</span></button>}):<span className="expense-action-menu-empty">No actions available</span>}</div></>,document.body)
 return <><button ref={triggerRef} type="button" className="expense-action-menu-trigger" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(value=>!value)}><MoreVertical/></button>{menu}</>
}