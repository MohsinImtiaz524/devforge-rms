import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../../api/client'
import InventoryModal from './InventoryModal'
import ArchiveForm from './ArchiveForm'
import { money, number } from '../inventory.utils'
import { getShopCurrency } from '../../../currency'
import './inventory-archive.css'

export default function InventoryArchive({ has, notify, onChanged }) {
  const [kind,setKind] = useState(() => new URLSearchParams(window.location.search).get('archive_kind') === 'quantity' ? 'quantity' : 'item'), [status,setStatus] = useState('active'), [page,setPage] = useState(1)
  const [result,setResult] = useState({ items:[],pages:1,total:0 }), [loading,setLoading] = useState(false), [error,setError] = useState('')
  const [dialog,setDialog] = useState(null)
  const [reason,setReason] = useState(''), [busy,setBusy] = useState(false)
  const loadId = useRef(0)
  const cancelLoads = useCallback(() => {loadId.current++},[])
  const canView = has('inventory_archive.view')
  const load = useCallback(async () => {
    if (!canView) return
    const id = ++loadId.current
    setLoading(true)
    try { const rows = await api(`/api/inventory-archives?${new URLSearchParams({kind,status,page})}`); if (id === loadId.current) setResult(rows) }
    catch (e) { if (id === loadId.current) setError(e.message) }
    finally { if (id === loadId.current) setLoading(false) }
  },[kind,status,page,canView])
  useEffect(() => { const timer = setTimeout(load,0); return () => {clearTimeout(timer);cancelLoads()} },[load,cancelLoads])
  function open(value) {
    setError(''); setReason('');setDialog(value)
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await api(`/api/inventory-archives/${dialog.id}/restore`,{method:'POST',body:{reason}})
      setDialog(null); notify('Restored with audit record')
      await load(); onChanged()
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <section className="inventory-archive">
    <header className="inventory-heading"><div><h1>Inventory Archive</h1><p>Keep items and stock aside with a permanent record of who, when, and why.</p></div>{has('inventory_archive.archive') && <button className="inventory-primary" onClick={() => open('archive')}>Archive {kind === 'item' ? 'an item' : 'a quantity'}</button>}</header>
    <div className="archive-controls"><div role="group" aria-label="Archive type"><button aria-pressed={kind === 'item'} onClick={() => {setKind('item');setPage(1)}}>Archived items</button><button aria-pressed={kind === 'quantity'} onClick={() => {setKind('quantity');setPage(1)}}>Archived stock</button></div><label>Status <select value={status} onChange={e => {setStatus(e.target.value);setPage(1)}}><option value="active">Archived</option><option value="restored">Restored</option><option value="all">All history</option></select></label></div>
    {error && !dialog && <p className="inventory-page-error" role="alert">{error}</p>}
    {!canView ? <p>Viewing archive history requires Inventory Archive / View permission.</p> : loading ? <p role="status">Loading archives...</p> : <>
      <p>{result.total} record{result.total === 1 ? '' : 's'}</p>{!result.items.length && <p className="inventory-empty">No records in this view.</p>}
      <div className="archive-records">{result.items.map(item => <article className="archive-record" key={item.id}>
        <header><div><h2>{item.name}</h2><span>{item.entity} · {item.kind === 'quantity' ? `${number(item.quantity)} ${item.unit} held aside` : 'Whole item'} · {item.restored_at ? 'Restored' : 'Archived'}</span></div>{!item.restored_at && has('inventory_archive.restore') && <button className="inventory-product-button" onClick={() => open(item)}>Restore</button>}</header>
        <p><strong>Reason:</strong> {item.reason}</p><p>Archived by {item.actor_name} · {new Date(item.created_at).toLocaleString()}</p>
        {item.restored_at && <p><strong>Restored:</strong> {item.restore_reason} — {item.restored_by} · {new Date(item.restored_at).toLocaleString()}</p>}
        <details><summary>Audit details and original costs</summary><p>Archive #{item.id} · Account #{item.actor_id} · Quantity {number(item.quantity)} {item.unit}</p>
          {item.allocations.map((a,index) => <p key={index}>{a.source} #{a.id}: {number(a.quantity)} {item.unit} at {getShopCurrency()} {money(a.unitCost)} per {item.unit}</p>)}
          <p>Available before: {number(item.snapshot.before.current_stock ?? item.snapshot.before.stock)} · After: {number(item.snapshot.after.current_stock ?? item.snapshot.after.stock)}</p>
          {item.restored_at && <p>Restore available before: {number(item.restore_before.current_stock ?? item.restore_before.stock)} · After: {number(item.restore_after.current_stock ?? item.restore_after.stock)}</p>}
          <details><summary>Complete recorded state</summary><pre style={{maxHeight:300,overflow:'auto',whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify({archive:item.snapshot,...(item.restored_at ? {restore:{actor_id:item.restored_actor_id,before:item.restore_before,after:item.restore_after}} : {})},null,2)}</pre></details>
        </details>
      </article>)}</div>
      <div className="archive-controls"><button disabled={page <= 1} onClick={() => setPage(page-1)}>Previous</button><span>Page {page} of {result.pages}</span><button disabled={page >= result.pages} onClick={() => setPage(page+1)}>Next</button></div>
    </>}
    {dialog === 'archive' && <ArchiveForm initialKind={kind} onClose={() => setDialog(null)} onSaved={(entry) => {
      setDialog(null);setKind(entry.kind);setStatus('active');setPage(1);
      notify('Archived successfully. Audit record saved.');onChanged();
      if (entry.kind === kind && status === 'active' && page === 1) load();
    }} />}
    {dialog && dialog !== 'archive' && <InventoryModal label="Restore inventory" onClose={() => {if (!busy) setDialog(null)}}>
      <form className="archive-form" onSubmit={submit}><h2>Restore {dialog.name}</h2>
        {error && <p className="inventory-page-error" role="alert">{error}</p>}
        <p>{dialog.kind === 'quantity' ? `Return all ${number(dialog.quantity)} ${dialog.unit} to the original batches or variants. Restore is one-time.` : 'Make this item available again. An individually restored variant stays off the menu until explicitly published.'}</p>
        <label>Reason (required)<textarea required minLength={3} maxLength={1000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <footer><button type="button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className="inventory-primary" disabled={busy || reason.trim().length < 3}>{busy ? 'Saving...' : 'Confirm restore'}</button></footer>
      </form>
    </InventoryModal>}
  </section>
}
