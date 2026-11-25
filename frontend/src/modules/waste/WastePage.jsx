import {useCallback, useEffect, useState} from 'react'
import {Menu, ClipboardList, Package, Wheat, CookingPot, Layers, Receipt, RotateCcw, Plus, ArrowRight, X} from 'lucide-react'
import {api, legacyUrl} from '../../api/client'
import {formatShopCurrency} from '../../currency'
import {MoonsSidebar} from '../moons/MoonsSidebar'
import WasteForm from './WasteForm'
import MenuDialog from '../menu/MenuDialog'
import {wasteSourceLabel, sources} from './waste-options'
import '../menu/menu.css'
import './waste.css'

const sourceIcons={product:Package,raw_ingredient:Wheat,recipe_product:CookingPot,prepared_batch:Layers,order:Receipt,return:RotateCcw}
function WasteSourceIcon({type}){const Icon=sourceIcons[type];return <Icon size={20} aria-hidden="true"/>}
const phrase=value=>String(value||'').replaceAll('_',' ')
const sourceName=r=>r.product_name||r.raw_stock_name||r.recipe_name||(r.sale_id?'Sale #'+(r.order_number||r.sale_id):r.return_id?'Return #'+r.return_id:'Waste #'+r.id)
export default function WastePage(){
  const [session,setSession]=useState(null),[rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
  const [revision,setRevision]=useState(0),[source,setSource]=useState(null),[notice,setNotice]=useState(''),[drawer,setDrawer]=useState(false)
  const [choosing,setChoosing]=useState(false)
  const closeDrawer=useCallback(()=>setDrawer(false),[])
  const allowed=session?.lobby.modules.some(m=>m.id==='waste-management')
  const has=p=>session?.user.role==='superadmin'||session?.user.permissions?.includes(p)
  const canView=allowed&&has('waste.view'),canCreate=allowed&&has('waste.create')
  useEffect(()=>{
    let active=true
    Promise.all([api('/api/auth/me'),api('/api/lobby')]).then(([auth,lobby])=>{if(active)setSession({user:auth.user,lobby})}).catch(e=>{if(e.status===401)location.replace(legacyUrl('/'));else if(active){setError(e.message);setLoading(false)}})
    return()=>{active=false}
  },[])
  useEffect(()=>{
    if(!session)return
    if(!canView)return
    let active=true
    api('/api/waste?limit=150').then(data=>{if(active){setRows(Array.isArray(data)?data:[]);setError('')}}).catch(e=>{if(e.status===401)location.replace(legacyUrl('/'));else if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[session,canView,revision])
  const today=new Date().toISOString().slice(0,10)
  const stats=[['Today',rows.filter(r=>String(r.created_at||'').slice(0,10)===today).length],['Total Cost',formatShopCurrency(rows.reduce((sum,r)=>sum+Number(r.cost_amount||0),0))],['Stock Deductions',rows.filter(r=>r.stock_action==='deduct').length],['Recoverable',rows.filter(r=>r.recovery_status==='recoverable').length]]
  return <div className="marketplace menu-workspace"><MoonsSidebar user={session?.user} label="Waste Management" navLabel="Navigation" activeId="waste" drawerOpen={drawer} onClose={closeDrawer} items={[{key:'waste',label:'Waste Management',icon:<ClipboardList size={20}/>,onClick:closeDrawer}]}/>
    <main className="market-main waste-page">
      <button className="menu-mobile-toggle" aria-label="Open navigation" aria-expanded={drawer} onClick={()=>setDrawer(true)}><Menu size={20}/></button>
      <header className="waste-header"><div><span className="waste-eyebrow">Inventory / Waste</span><h1>Waste Management</h1><p>Track losses, understand costs, and keep stock accurate.</p></div>{canCreate&&<button className="waste-primary menu-primary" onClick={()=>setChoosing(true)}><Plus size={18}/>Record waste</button>}</header>
      {error&&<div role="alert" className="waste-error">{error}{session&&<button onClick={()=>{setLoading(true);setRevision(n=>n+1)}}>Try again</button>}</div>}
      {notice&&<p role="status">{notice}<button onClick={()=>setNotice('')}>Dismiss</button></p>}
      {session&&!allowed?<p role="alert">You do not have permission to access Waste Management.</p>:session&&!canView?<p role="status">You do not have permission to view waste records.</p>:<>
      <section className="waste-stats">{stats.map(([label,value])=><article key={label}>{label}<strong>{loading?'…':value}</strong></article>)}</section>
      <section className="waste-records"><header><div><h2>Recent Waste Records</h2><p>Last {rows.length} records</p></div><button disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh</button></header>
      <div className="menu-table-wrap" aria-busy={loading}><table><thead><tr>{['Time','Source','Type','Quantity','Cost','Reason','Staff'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>
      {loading?[1,2,3,4,5].map(i=><tr className="menu-skeleton" key={i}>{[1,2,3,4,5,6,7].map(j=><td key={j}><span/></td>)}</tr>):rows.map(r=><tr key={r.id}><td>{r.created_at&&!Number.isNaN(new Date(r.created_at).getTime())?new Date(r.created_at).toLocaleString():'Unknown'}</td><td><strong>{sourceName(r)}</strong><small>{phrase(r.stock_action||'recorded')}</small></td><td>{wasteSourceLabel(r.source_type||'product')}</td><td>{Number(Number(r.quantity||0).toFixed(3))} {r.unit}</td><td>{Number(r.cost_amount)>0?formatShopCurrency(r.cost_amount):'-'}</td><td>{r.reason||r.reason_code||'No reason recorded'}</td><td>{r.user_name||r.user_username||'Unknown'}</td></tr>)}
      {!loading&&!rows.length&&<tr><td colSpan="7" className="menu-empty">No waste records yet.</td></tr>}</tbody></table></div></section></>}
      {choosing&&canCreate&&<MenuDialog label="Choose waste type" onClose={()=>setChoosing(false)}><div className="waste-chooser"><header><div><span className="waste-eyebrow">Record waste</span><h2>What are you recording?</h2><p>Choose a source to continue with its waste details.</p></div><button className="waste-close" aria-label="Close waste chooser" onClick={()=>setChoosing(false)}><X size={20}/></button></header><div className="waste-choice-grid">{sources.map(type=><button key={type} className="waste-choice" onClick={()=>{setChoosing(false);setSource(type)}}><span className="waste-choice-icon"><WasteSourceIcon type={type}/></span><span><strong>{wasteSourceLabel(type)}</strong><small>{({product:"Finished goods removed from inventory.",raw_ingredient:"Ingredients lost to spoilage or damage.",recipe_product:"Menu items with linked recipes.",prepared_batch:"A batch prepared from a recipe.",order:"Waste associated with a sale or order.",return:"Damaged items from a customer return."})[type]}</small></span><ArrowRight size={16}/></button>)}</div><footer><button onClick={()=>setChoosing(false)}>Cancel</button></footer></div></MenuDialog>}
      {source&&canCreate&&<WasteForm source={source} onClose={()=>setSource(null)} onSaved={()=>{setSource(null);setNotice('Waste recorded!');setLoading(true);setRevision(n=>n+1)}}/>}
    </main>
  </div>
}
