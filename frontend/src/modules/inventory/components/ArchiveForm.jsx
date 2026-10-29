import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, X } from 'lucide-react'
import { api } from '../../../api/client'
import InventoryModal from './InventoryModal'
import { number } from '../inventory.utils'
import './inventory-archive.css'

export default function ArchiveForm({ target, initialKind = 'item', onClose, onSaved }) {
  const [kind,setKind] = useState(initialKind)
  const [entity,setEntity] = useState(target?.entity || 'ingredient')
  const [search,setSearch] = useState('')
  const [items,setItems] = useState(target ? [target] : [])
  const [itemId,setItemId] = useState(target ? String(target.id) : '')
  const [quantity,setQuantity] = useState('')
  const [reason,setReason] = useState('')
  const [variantId,setVariantId] = useState('')
  const [loading,setLoading] = useState(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  const bodyRef = useRef(null)
  const errorRef = useRef(null)
  const selected = items.find(item => String(item.id) === itemId)
  const variant = target?.variants?.find(item => String(item.id) === variantId)
  const available = Number(variant ? variant.stock : selected?.available || 0)
  const validQuantity = Number(quantity) > 0 && Number(quantity) <= available && Math.abs(Number(quantity)*1000-Math.round(Number(quantity)*1000)) < 0.00001
  const close = useCallback(() => { if (!busy) onClose() },[busy,onClose])
  useEffect(() => {
    const previous = document.activeElement
    return () => { if (previous?.isConnected) previous.focus() }
  },[])
  useEffect(() => {
    if (!error) return
    const frame = requestAnimationFrame(() => {bodyRef.current?.scrollTo({top:0});errorRef.current?.focus({preventScroll:true})})
    return () => cancelAnimationFrame(frame)
  },[error])
  function trapFocus(event) {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')]
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus()}
    else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus()}
  }

  useEffect(() => {
    if (target) return
    let active = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const rows = await api(`/api/inventory-archives/targets?${new URLSearchParams({entity,search})}`)
        if (active) setItems(rows)
      } catch (e) { if (active) setError(e.message) }
      finally { if (active) setLoading(false) }
    },200)
    return () => {active=false;clearTimeout(timer)}
  },[entity,search,target])

  async function submit(event) {
    event.preventDefault()
    if (!selected || reason.trim().length < 3 || (kind === 'quantity' && !validQuantity) || busy) return
    setBusy(true);setError('')
    let entry
    try {
      entry = await api('/api/inventory-archives',{method:'POST',body:{entity:variant ? 'variant' : entity,entityId:Number(variant ? variant.id : itemId),kind,reason:reason.trim(),requestId,...(kind === 'quantity' ? {quantity:Number(quantity)} : {})}})
    } catch (e) {setError(e.message);setBusy(false);return}
    // The mutation has succeeded. Navigation/refresh errors must not invite a second archive.
    onSaved(entry)
  }

  return <InventoryModal label="Archive inventory" size="medium" onClose={close}>
    <form className="archive-editor" onSubmit={submit} onKeyDown={trapFocus} aria-busy={busy}>
      <header className="archive-editor-heading"><span className="archive-editor-icon"><Archive size={22} /></span><div><h2>Archive {target ? target.name : 'an item'}</h2></div><button type="button" className="archive-editor-close" disabled={busy} onClick={close} aria-label="Close archive form"><X size={20} /></button></header>
      <div className="archive-editor-body" ref={bodyRef}>
        {error && <div className="inventory-page-error" ref={errorRef} tabIndex={-1} role="alert">{error}</div>}
        {!target && <div className="archive-editor-picker"><label>Item type<select value={entity} disabled={busy} onChange={e=>{setEntity(e.target.value);setItemId('');setItems([])}}><option value="ingredient">Ingredient</option><option value="product">Stock product</option><option value="variant">Individual variant</option></select></label><label>Find an item<input value={search} disabled={busy} placeholder="Search by name" onChange={e=>{setSearch(e.target.value);setItemId('');setItems([])}} /></label><label>Item<select aria-label="Item" required value={itemId} disabled={busy || loading} onChange={e=>setItemId(e.target.value)}><option value="">{loading ? 'Loading items...' : 'Choose an item'}</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>}
        {target?.entity === 'product' && target.variants?.length > 0 && <label>Product or variant<select aria-label="Product or variant" value={variantId} disabled={busy} onChange={e=>{setVariantId(e.target.value);setQuantity('')}}><option value="">Whole product (all variants)</option>{target.variants.map(item=><option key={item.id} value={item.id}>{item.name} — {number(item.stock)} in stock</option>)}</select></label>}
        {selected && <p className="archive-stock-line">Available: <strong>{number(available)} {selected.unit}</strong></p>}
        <label>Archive<select aria-label="Archive scope" value={kind} disabled={busy} onChange={e=>{setKind(e.target.value);setQuantity('')}}><option value="item">{variant ? 'Entire variant' : 'Entire item'}</option><option value="quantity">A quantity of stock</option></select></label>
        {kind === 'quantity' && <div className="archive-quantity"><label>Quantity to archive ({selected?.unit || 'base units'})<input type="number" required min="0.001" step="0.001" max={available} disabled={busy || !selected} value={quantity} onChange={e=>setQuantity(e.target.value)} placeholder="0.000" /></label><div><span>Available after archive</span><strong>{number(Math.max(0,available-(Number(quantity)||0)))} {selected?.unit}</strong></div></div>}
        <label>Reason (required)<textarea required minLength={3} maxLength={1000} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why are you archiving this?" /></label>
        <p className="archive-simple-note">History is kept. You can restore this from Archive.</p>
      </div>
      <footer className="archive-editor-footer"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="archive-confirm" disabled={busy || !selected || reason.trim().length < 3 || (kind==='quantity' && !validQuantity)}>{busy ? 'Archiving...' : 'Archive'}</button></footer>
    </form>
  </InventoryModal>
}
