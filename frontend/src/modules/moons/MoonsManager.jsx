import { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Pencil, History, RefreshCw, X, Check, Archive } from 'lucide-react';
import { api, legacyUrl } from '../../api/client';
import FileUpload from '../../components/files/FileUpload';
import NotificationTopbar from '../notifications/components/NotificationTopbar';
import '../notifications/notifications.css';
import './moons.css';

const priceLabel = price => !price ? 'Price not set' : Number(price.monthly_amount_minor) === 0 ? 'Free' : price.currency + ' ' + (Number(price.monthly_amount_minor) / 100).toLocaleString(undefined, {minimumFractionDigits:2}) + ' / month';

function Editor({ moon, filesEnabled, onSaved, onClose }) {
  const [form, setForm] = useState({name:moon.name,summary:moon.summary,description:moon.description,category:moon.category,sort_order:moon.sort_order});
  const [artwork, setArtwork] = useState(Object.fromEntries(['icon','cover','screenshot'].map(slot => [slot,moon.artwork.filter(file => file.slot === slot)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef(null);
  const first = useRef(null);
  const uploadBusy = Object.values(artwork).flat().some(file => file.status !== 'ready');
  useEffect(() => {
    const previous = document.activeElement;
    first.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const escape = event => { if (event.key === 'Escape' && !busy && !uploadBusy) { event.preventDefault(); onClose(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [busy, uploadBusy, onClose]);
  function dismiss() { if (!busy && !uploadBusy) onClose(); }
  function keydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea, select')];
      const firstControl = controls[0], lastControl = controls.at(-1);
      if (event.shiftKey && document.activeElement === firstControl) { event.preventDefault(); lastControl?.focus(); }
      else if (!event.shiftKey && document.activeElement === lastControl) { event.preventDefault(); firstControl?.focus(); }
    }
  }
  async function save(event) {
    event.preventDefault(); if (busy || uploadBusy) return;
    setBusy(true); setError('');
    try {
      const payload = {...form, sort_order:Number(form.sort_order), version:moon.version};
      if (filesEnabled) for (const slot of ['icon','cover','screenshot']) payload[slot === 'screenshot' ? 'screenshot_ids' : slot + '_ids'] = artwork[slot].map(file => file.id);
      const updated = await api('/api/moons/admin/' + moon.key, {method:'PATCH', body:payload});
      onSaved(updated); onClose();
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  const field = key => ({value:form[key],onChange:event=>setForm({...form,[key]:event.target.value})});
  return <div className="moons-backdrop" onMouseDown={event=>{if(event.target === event.currentTarget)dismiss();}}>
    <section className="moons-editor" role="dialog" aria-modal="true" aria-labelledby="moon-editor-title" ref={panel} onKeyDown={keydown}>
      <header><div><small>{moon.key}</small><h2 id="moon-editor-title">Edit Moon details</h2></div><button type="button" aria-label="Close editor" disabled={busy || uploadBusy} onClick={dismiss}><X size={20}/></button></header>
      <form onSubmit={save} aria-busy={busy}>
        {error && <p className="moons-error" role="alert">{error} {error.includes('Reload') && 'Close this editor and refresh the catalog.'}</p>}
        <label>Name<input ref={first} required minLength={2} maxLength={100} {...field('name')} disabled={busy}/></label>
        <label>Short summary<input required minLength={5} maxLength={240} {...field('summary')} disabled={busy}/></label>
        <label>Full details<textarea rows={5} maxLength={10000} {...field('description')} disabled={busy}/></label>
        <div className="moons-form-row"><label>Category<select {...field('category')} disabled={busy}>{['people','insights','web','other'].map(value=><option key={value} value={value}>{value}</option>)}</select></label><label>Display order<input type="number" min="0" max="10000" step="1" required {...field('sort_order')} disabled={busy}/></label></div>
        {filesEnabled ? ['icon','cover','screenshot'].map(slot=><FileUpload key={slot} purpose={'moon.'+slot} label={slot === 'screenshot' ? 'Screenshots' : slot === 'icon' ? 'Moon icon' : 'Cover image'} value={artwork[slot]} onChange={value=>setArtwork(previous=>({...previous,[slot]:value}))} disabled={busy} showDownload={false}/>) : <p className="moons-note">Artwork uploads are unavailable. Details can still be saved.</p>}
        <footer><button type="button" disabled={busy || uploadBusy} onClick={dismiss}>Cancel</button><button className="moons-primary" disabled={busy || uploadBusy}>{busy ? 'Saving...' : uploadBusy ? 'Waiting for images...' : 'Save details'}</button></footer>
      </form>
    </section>
  </div>;
}

function PriceEditor({ moon, onSaved }) {
  const [currency, setCurrency] = useState(moon.price?.currency || 'PKR');
  const [amount, setAmount] = useState(moon.price ? String(Number(moon.price.monthly_amount_minor)/100) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) { setError('Enter a nonnegative price with up to two decimal places.'); return; }
    const [whole, fraction=''] = amount.split('.');
    const minor = Number(whole)*100 + Number(fraction.padEnd(2,'0'));
    if (!Number.isSafeInteger(minor) || minor > 100000000) { setError('The maximum monthly price is 1,000,000.00.'); return; }
    setBusy(true); setError('');
    try { onSaved(await api('/api/moons/admin/'+moon.key+'/prices',{method:'POST',body:{version:moon.version,currency,monthly_amount_minor:minor}})); }
    catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  return <form className="moons-price-form" onSubmit={submit}>
    <div className="moons-form-row"><label>Currency<select aria-label={'Currency for '+moon.name} value={currency} onChange={event=>setCurrency(event.target.value)} disabled={busy}>{['PKR','USD','EUR','GBP','AED','SAR'].map(value=><option key={value}>{value}</option>)}</select></label><label>Monthly price<input aria-label={'Monthly price for '+moon.name} type="text" inputMode="decimal" placeholder="0.00" required value={amount} onChange={event=>setAmount(event.target.value)} disabled={busy}/></label></div>
    <button disabled={busy}>{busy ? 'Saving price...' : 'Save offered price'}</button><small>Use 0 for free. Saving a price does not charge shops.</small>
    {error && <p className="moons-error" role="alert">{error}</p>}
  </form>;
}

export default function MoonsManager({ embedded = false }) {
  const [user, setUser] = useState(null), [items, setItems] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [filesEnabled, setFilesEnabled] = useState(false);
  const [editing, setEditing] = useState(null), [pending, setPending] = useState(null), [history, setHistory] = useState(null);
  const load = useCallback(async () => {
    try {
      const result = await api('/api/auth/me'); const actor=result.user || result;
      setError('');
      setUser(actor);
      if(actor.role !== 'superadmin') throw new Error('Only the Super Admin can manage the Moons catalog.');
      const catalog=await api('/api/moons/admin');setItems(catalog.items);setFilesEnabled(catalog.files_enabled);
    } catch (requestError) { if(requestError.status === 401) location.replace(legacyUrl('/')); else setError(requestError.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(()=>{ let active=true; Promise.resolve().then(()=>{if(active)void load();}); return ()=>{active=false;}; },[load]);
  function saved(moon) { setItems(previous=>previous.map(item=>item.key === moon.key ? moon : item)); setMessage(moon.name+' saved.'); setHistory(null); }
  async function changeStatus(moon,status) {
    if(pending)return;
    setPending(moon.key);setError('');setMessage('');
    try { saved(await api('/api/moons/admin/'+moon.key+'/status',{method:'POST',body:{status,version:moon.version}})); }
    catch(requestError){setError(requestError.message);}finally{setPending(null);}
  }
  async function showHistory(moon) {
    setPending(moon.key);setError('');
    try { const result=await api('/api/moons/admin/'+moon.key+'/history');setHistory({name:moon.name,...result}); }
    catch(requestError){setError(requestError.message);}finally{setPending(null);}
  }
  return <main className="moons-page">
    {!embedded && <NotificationTopbar user={user} unread={0} channel="platform"/>}
    <div className="moons-shell"><header className="moons-heading"><div><small>Platform modules</small><h1>Moons Catalog</h1><p>Shape each Moon's details, artwork and offered price.</p>{!embedded && <a href="/app/moons">View Moons directory</a>}</div><button onClick={()=>{setLoading(true);void load();}} disabled={loading || Boolean(editing) || Boolean(pending)}><RefreshCw size={16}/> Refresh</button></header>
      <div className="moons-banner"><Moon size={22}/><span><strong>Catalog foundation</strong>Subscriptions and billing are not enabled here. Existing Staff and Analytics access continues.</span></div>
      {message && <p className="moons-success" role="status">{message}</p>}
      {error && <div className="moons-error" role="alert"><p>{error}</p><button onClick={()=>{setLoading(true);void load();}}>Retry</button></div>}
      {loading ? <div className="moons-grid" aria-busy="true" aria-label="Loading Moons catalog">{[1,2,3].map(id=><article className="moons-card moons-skeleton" key={id}><div/><div/><div/></article>)}</div> : user?.role === 'superadmin' && <div className="moons-grid">{items.map(moon=>{
        const icon=moon.artwork.find(file=>file.slot === 'icon'),cover=moon.artwork.find(file=>file.slot === 'cover');
        return <article className="moons-card" key={moon.key}>
          {cover && <img className="moons-cover" src={cover.preview_url} alt=""/>}
          <div className="moons-card-body"><header><span className="moons-icon">{icon ? <img src={icon.preview_url} alt=""/> : <Moon size={24}/>}</span><span className={'moons-status '+moon.status}>{!moon.implemented ? 'Coming soon' : !moon.launch_ready ? 'Preparing' : moon.status}</span></header>
            <h2>{moon.name}</h2><p>{moon.summary}</p><strong className="moons-price">{priceLabel(moon.price)}</strong>
            <p className="moons-description">{moon.description || 'Add details to explain this Moon to shops.'}</p>
            <ul className="moons-features">{moon.features.map(feature=><li key={feature}><Check size={13}/>{feature}</li>)}</ul>
            <div className="moons-card-actions"><button onClick={()=>{setMessage('');setEditing(moon);}} disabled={Boolean(pending)}><Pencil size={15}/> Edit details</button><button onClick={()=>showHistory(moon)} disabled={Boolean(pending)}><History size={15}/> History</button></div>
            <PriceEditor key={moon.version} moon={moon} onSaved={saved}/>
            <div className="moons-publish"><label>Status<select aria-label={'Status for '+moon.name} value={moon.status} onChange={event=>changeStatus(moon,event.target.value)} disabled={Boolean(pending)}><option value="draft">Draft</option><option value="published" disabled={!moon.launch_ready}>Published</option><option value="archived">Archived</option></select></label>{moon.status === 'archived' && <Archive size={16}/>}</div>
          </div>
        </article>;
      })}</div>}
      {!loading && !error && !items.length && <p>No implemented catalog entries are available.</p>}
      {history && <section className="moons-history" aria-label="Moon audit history"><header><h2>{history.name}: history</h2><button onClick={()=>setHistory(null)}>Close history</button></header>{!history.events.length ? <p>No catalog changes yet.</p> : <ul>{history.events.map(event=><li key={event.id}>Version {event.version}: {event.action} <time>{new Date(event.created_at).toLocaleString()}</time></li>)}</ul>}<h3>Offered prices</h3><ul>{history.prices.map(price=><li key={price.id}>{priceLabel(price)} <time>{new Date(price.created_at).toLocaleString()}</time></li>)}</ul></section>}
    </div>
    {editing && <Editor moon={editing} filesEnabled={filesEnabled} onSaved={saved} onClose={()=>setEditing(null)}/>}
  </main>;
}
