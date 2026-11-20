import { usePaymentOptions } from './usePaymentOptions'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pencil, Printer, RefreshCw, Eye, CreditCard, Check, Truck, Plus, Coins, Table2, ShoppingBag, Utensils, Store, Search, Layers, Activity, ChevronDown, ChevronLeft, ChevronRight, Clock, Bookmark, ChefHat, CircleCheck, CircleX, Zap, PackageOpen, AlertCircle, LoaderCircle, X } from 'lucide-react'
import { api } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'
import PosPaymentModal from './PosPaymentModal'
import PosOrderDetails from './PosOrderDetails'
import PosPrintOptions from './PosPrintOptions'
import PosRecordTip from './PosRecordTip'
import { can, canServe, completionPath, isRetailCompletion, filterOrders, orderStatusLabel, relativeOrderTime, serviceLabel } from './orders.logic'

import './pos.orders.css'

const TYPES=['dine_in','takeaway','delivery','walk_in']

export default function PosOrdersView({user,back,notify,printReceipt,onEdit,onNew,printTip,retail,onOrderConfirmed}) {
  usePaymentOptions(user)
  const [orders,setOrders]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[type,setType]=useState(''),[view,setView]=useState(()=>window.matchMedia('(min-width:1280px)').matches?'table':'cards')
  const [details,setDetails]=useState(null),[payment,setPayment]=useState(null),[printing,setPrinting]=useState(null),[tip,setTip]=useState(false),[busy,setBusy]=useState(false)
  const [busyMessage,setBusyMessage]=useState('Loading order...')
  const [realtime,setRealtime]=useState('reconnecting')
  const [status,setStatus]=useState('active'),[table,setTable]=useState(''),[page,setPage]=useState(1),[selectedId,setSelectedId]=useState(null)
  const searchRef=useRef(null)
  const loaded=useRef(false),mutating=useRef(false),loadingRequest=useRef(null)
  useEffect(()=>{
    const desktop=window.matchMedia('(min-width:1280px)')
    const update=()=>setView(desktop.matches?'table':'cards')
    desktop.addEventListener('change',update)
    return()=>desktop.removeEventListener('change',update)
  },[])
  const load=useCallback(()=>{
    if(loadingRequest.current)return loadingRequest.current
    loadingRequest.current=(async()=>{
      try{setLoading(true);setError('');const rows=await api('/api/sales');setOrders(Array.isArray(rows)?rows:[])}
      catch(requestError){setError(requestError.message)}
      finally{setLoading(false);loadingRequest.current=null}
    })()
    return loadingRequest.current
  },[])
  useEffect(()=>{
    let active=true,refreshTimer=null,staleWhileHidden=false,socket=null
    const scheduleRefresh=()=>{if(document.hidden){staleWhileHidden=true;return}clearTimeout(refreshTimer);refreshTimer=setTimeout(load,250)}
    const statusLive=()=>setRealtime('live')
    const statusDisconnect=reason=>setRealtime(reason==='io server disconnect'?'offline':'reconnecting')
    const statusError=event=>setRealtime(event?.data?.code==='UNAUTHORIZED'?'offline':'reconnecting')
    const subscribe=instance=>{if(!active)return;socket=instance;socket.on('connect',statusLive);socket.on('realtime:ready',scheduleRefresh);socket.on('order:changed',scheduleRefresh);socket.on('disconnect',statusDisconnect);socket.on('connect_error',statusError);setRealtime(socket.connected?'live':'reconnecting')}
    const getSocket=()=>new Promise((resolve,reject)=>{
      if(window.orderRealtimeSocket)return resolve(window.orderRealtimeSocket)
      const connect=()=>{if(typeof window.io!=='function')return reject(new Error('Realtime client unavailable'));if(!window.orderRealtimeSocket)window.orderRealtimeSocket=window.io({path:'/socket.io',withCredentials:true});resolve(window.orderRealtimeSocket)}
      if(typeof window.io==='function')return connect()
      const existing=document.querySelector('script[data-order-realtime-client]')
      if(existing){existing.addEventListener('load',connect,{once:true});existing.addEventListener('error',reject,{once:true});return}
      const script=document.createElement('script');script.src='/socket.io/socket.io.js';script.dataset.orderRealtimeClient='true';script.onload=connect;script.onerror=reject;document.head.appendChild(script)
    })
    const initial=setTimeout(()=>{if(!loaded.current){loaded.current=true;load()}},0)
    const fallback=setInterval(()=>{if(!document.hidden&&!socket?.connected)load()},300000)
    const visible=()=>{if(!document.hidden&&staleWhileHidden){staleWhileHidden=false;scheduleRefresh()}}
    document.addEventListener('visibilitychange',visible)
    getSocket().then(subscribe).catch(()=>{if(active)setRealtime('offline')})
    return()=>{active=false;clearTimeout(initial);clearTimeout(refreshTimer);clearInterval(fallback);document.removeEventListener('visibilitychange',visible);if(socket){socket.off('connect',statusLive);socket.off('realtime:ready',scheduleRefresh);socket.off('order:changed',scheduleRefresh);socket.off('disconnect',statusDisconnect);socket.off('connect_error',statusError)}}
  },[load])

  useEffect(()=>{const shortcut=event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();searchRef.current?.focus()}};document.addEventListener('keydown',shortcut);return()=>document.removeEventListener('keydown',shortcut)},[])
  const filtered=filterOrders(orders,type,search,{status,table,savedShop:retail})
  const pageSize=5,totalPages=Math.max(1,Math.ceil(filtered.length/pageSize)),currentPage=Math.min(page,totalPages)
  const visible=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize)
  const tableOptions=[...new Map(orders.filter(order=>order.table_id&&(order.order_status!=='completed'||status==='completed_active_shifts'&&order.order_shift_status==='open')).map(order=>[String(order.table_id),order.table_number||order.table_id])).entries()]
  const pageNumbers=[...new Set([1,currentPage-1,currentPage,currentPage+1,totalPages])].filter(value=>value>0&&value<=totalPages).sort((a,b)=>a-b)
  function changeFilter(setter,value){setter(value);setPage(1);setSelectedId(null)}
  const finished=order=>['completed','cancelled'].includes(order.order_status)
  const canPay=can(user,'orders.take_payment')&&can(user,'orders.complete')
  const context=order=>order.order_type==='dine_in'?`Table ${order.table_number||'N/A'}`:order.order_type==='delivery'?order.customer_name||order.delivery_address||'Delivery customer':order.customer_name||'Counter order'
  const hasFilters=Boolean(search.trim()||type||table||status!=='active')
  async function showDetails(id){
    if(mutating.current)return
    mutating.current=true;setBusyMessage('Loading order details...')
    try{setBusy(true);const bill=await api('/api/sales/'+id+'/bill');if(!bill?.sale)throw new Error('Order not found');setDetails(bill)}catch(error){notify(error.message,'error')}finally{mutating.current=false;setBusy(false)}
  }
  async function edit(id){
    if(!can(user,'orders.update'))return notify('You do not have permission to edit orders.','error')
    if(mutating.current)return
    mutating.current=true;setBusyMessage('Opening order in POS...')
    try{setBusy(true);const bill=await api('/api/sales/'+id+'/bill');if(!bill?.sale)throw new Error('Order details not found');setDetails(null);await onEdit(id,bill)}catch(error){notify(error.message,'error')}finally{mutating.current=false;setBusy(false)}
  }
  async function complete(order){
    if(!can(user,'orders.complete'))return notify('You do not have permission to complete orders.','error')
    if(mutating.current||!confirm('Are you sure you want to complete this order and move it to sales history?'))return
    mutating.current=true;setBusyMessage('Completing order...');setBusy(true)
    try{const retailCompletion=isRetailCompletion(user,order);await api(completionPath(user,order),{method:retailCompletion?'POST':'PATCH',body:retailCompletion?{}:{status:'completed'}});window.dispatchEvent(new Event('pos:tables-changed'));onOrderConfirmed?.({id:order.id,number:order.order_number||order.id,total:order.total,status:'completed'});await load()}catch(error){notify(error.message,'error')}finally{mutating.current=false;setBusy(false)}
  }
  async function served(order){
    if(!canServe(user,order)||mutating.current)return
    if(!confirm(order.order_type==='takeaway'?'Confirm that this takeaway order has been handed to the customer?':'Confirm that this order has been handed to the guest?'))return
    mutating.current=true;setBusyMessage('Updating order status...');setBusy(true)
    try{await api('/api/kds/'+order.id+'/status',{method:'PATCH',body:{status:'served'}});notify(order.order_type==='takeaway'?'Takeaway order marked as handed over.':'Order marked as served.');await load()}catch(error){notify(error.message,'error')}finally{mutating.current=false;setBusy(false)}
  }
  function primaryAction(order,table=false){
    if(finished(order))return null
    if(canServe(user,order))return <button className="orders-action-primary" disabled={busy} onClick={()=>served(order)}><Check size={15}/>{order.order_type==='takeaway'?'Mark Handed Over':'Mark Served'}</button>
    if(!retail&&order.order_type==='delivery'&&order.order_status!=='ready')return <button disabled={busy} onClick={()=>showDetails(order.id)}><Truck size={15}/>Out</button>
    if(canPay)return <button className="orders-action-primary" disabled={busy} onClick={()=>setPayment(order)}><CreditCard size={15}/>Complete Payment</button>
    if(can(user,'orders.complete'))return <button className="orders-action-primary" disabled={busy} onClick={()=>complete(order)}><Check size={15}/>Complete</button>
    return null
  }
  function typeBadge(order){const Icon=({dine_in:Utensils,takeaway:ShoppingBag,delivery:Truck,walk_in:Store})[order.order_type]||ShoppingBag;return <span className="pos-type-badge" data-order-type={order.order_type}><Icon size={17}/>{serviceLabel(order.order_type)}</span>}
  function statusBadge(order){const status=retail&&!finished(order)?'payment_pending':order.order_status||'pending',Icon=({payment_pending:Bookmark,pending:Clock,preparing:Zap,ready:ChefHat,served:CircleCheck,completed:CircleCheck,cancelled:CircleX})[status]||Clock;return <em data-status={status}><Icon size={17}/>{status==='payment_pending'?'Saved':status==='preparing'?'In Progress':orderStatusLabel(order,retail)}</em>}
  function actions(order,tableView=false){return <div className="pos-order-actions">{can(user,'orders.view')&&<button disabled={busy} onClick={()=>showDetails(order.id)}><Eye size={16}/>{tableView?'View':'Order Details'}</button>}{!finished(order)&&can(user,'orders.update')&&<button disabled={busy} onClick={()=>edit(order.id)}><Pencil size={16}/>Edit</button>}{can(user,'orders.view')&&<button disabled={busy} onClick={()=>['waiter','order_taker'].includes(String(user?.role||'').toLowerCase())?printReceipt(order.id,'unpaid'):setPrinting(order)}><Printer size={16}/>{['waiter','order_taker'].includes(String(user?.role||'').toLowerCase())?'Unpaid Bill':'Print'}</button>}{primaryAction(order,tableView)}</div>}
  return <main className="pos-orders pos-orders-redesign" aria-busy={busy}>
    <header className="orders-page-header"><button className="orders-back" onClick={back}><ArrowLeft size={19}/>Back</button><div className="orders-heading"><div><h1>Orders</h1><small data-realtime-status={realtime}><span className="orders-live-dot"/>{realtime==='live'?'Live':realtime==='offline'?'Offline':'Reconnecting'}</small></div></div><div className="orders-header-actions">{can(user,'orders.create')&&<button className="orders-new" onClick={onNew}><Plus size={20}/>New Order</button>}{can(user,'orders.take_payment')&&<button onClick={()=>setTip(true)}><Coins size={20}/>Record Tip</button>}<button disabled={loading} aria-busy={loading} onClick={load}><RefreshCw className={loading?'pos-spin':''} size={20}/>{loading?'Refreshing...':'Refresh'}</button></div></header>
    <nav className="orders-filter-bar" aria-label="Order filters"><div className="orders-search"><Search size={21}/><input ref={searchRef} aria-label="Search orders" value={search} onChange={event=>changeFilter(setSearch,event.target.value)} placeholder="Search by Order ID, table or customer..."/>{search?<button aria-label="Clear order search" onClick={()=>{changeFilter(setSearch,'');searchRef.current?.focus()}}><X size={16}/></button>:<kbd>Ctrl + K</kbd>}</div><label className="orders-filter"><Layers size={20}/><select aria-label="Order type filter" value={type} onChange={event=>changeFilter(setType,event.target.value)}><option value="">All Types</option>{TYPES.map(value=><option value={value} key={value}>{serviceLabel(value)}</option>)}</select><ChevronDown size={17}/></label><label className="orders-filter"><Activity size={20}/><select aria-label="Order status filter" value={status} onChange={event=>changeFilter(setStatus,event.target.value)}><option value="active">Active</option><option value="all">All Statuses</option>{retail?<option value="payment_pending">Saved</option>:<><option value="pending">Pending</option><option value="preparing">In Progress</option><option value="ready">Ready</option><option value="served">Served</option></>}<option value="completed_active_shifts">Completed ? Active Shifts</option><option value="cancelled">Cancelled</option></select><ChevronDown size={17}/></label><label className="orders-filter"><Table2 size={20}/><select aria-label="Table filter" value={table} onChange={event=>changeFilter(setTable,event.target.value)}><option value="">All Tables</option>{tableOptions.map(([id,name])=><option key={id} value={id}>Table {name}</option>)}</select><ChevronDown size={17}/></label></nav>
    {error&&<div className="pos-error orders-load-error" role="alert"><AlertCircle size={19}/><span>Failed to load orders: {error}</span><button onClick={load}>Retry</button></div>}
    {busy&&<div className="pos-orders-busy" role="status"><LoaderCircle className="pos-spin" size={20}/>{busyMessage}</div>}
    {loading&&!orders.length?<div className="orders-skeleton" role="status" aria-label="Loading active orders">{Array.from({length:5},(_,index)=><div key={index}><span/><span/><span/><span/></div>)}</div>:!filtered.length?<div className="orders-empty"><PackageOpen size={52}/><h2>{hasFilters?'No matching orders':'No orders to complete'}</h2><p>{hasFilters?'Try a different search or clear the filters.':'Orders waiting to be completed will appear here.'}</p>{hasFilters?<button onClick={()=>{setSearch('');setType('');setStatus('active');setTable('');setPage(1)}}>Clear filters</button>:can(user,'orders.create')&&<button className="orders-new" onClick={onNew}><Plus size={18}/>New Order</button>}</div>:view==='cards'?<section className="order-cards">{visible.map(order=><article key={order.id} data-selected={selectedId===order.id} onClick={()=>setSelectedId(order.id)}><header><span><small>Order #{order.order_number||order.id}</small><b>{context(order)}</b>{order.order_type==='delivery'&&<span className="pos-card-delivery"><small>{order.customer_phone||'No phone'}</small>{order.delivery_address&&<small>{order.delivery_address}</small>}</span>}</span>{statusBadge(order)}</header><dl><div><dt>Placed</dt><dd>{relativeOrderTime(order.created_at)}<small className="pos-order-clock"><Clock size={13}/>{new Date(order.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</small></dd></div><div><dt>Service</dt><dd>{typeBadge(order)}</dd></div><div><dt>Waiter</dt><dd>{order.waiter_name||'\u2014'}</dd></div><div><dt>Total</dt><dd>{money(order.total)}</dd></div></dl><footer>{actions(order)}</footer></article>)}</section>:<div className="orders-table"><table><thead><tr><th>Order ID</th><th>Type</th><th>Table / Details</th><th>Waiter</th><th>Status</th><th>Total</th><th>Time</th><th>Actions</th></tr></thead><tbody>{visible.map(order=><tr key={order.id} data-selected={selectedId===order.id} tabIndex={0} onClick={()=>setSelectedId(order.id)} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();setSelectedId(order.id)}}}><td><strong>#{order.order_number||order.id}</strong></td><td>{typeBadge(order)}</td><td>{order.order_type==='dine_in'?'Table '+(order.table_number||'N/A'):order.order_type==='delivery'?<span className="pos-table-delivery">{order.customer_name||'Delivery customer'}<small>{order.customer_phone||'No phone'}</small>{order.delivery_address&&<small title={order.delivery_address}>{order.delivery_address}</small>}</span>:order.customer_name||'Walk-in'}</td><td>{order.waiter_name||'\u2014'}</td><td>{statusBadge(order)}</td><td className={order.order_status==='cancelled'?'orders-cancelled-total':''}>{money(order.total)}</td><td><span className="orders-time"><Clock size={17}/>{new Date(order.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></td><td>{actions(order,true)}</td></tr>)}</tbody></table></div>}
    {!loading&&filtered.length>0&&<footer className="orders-pagination"><span>Showing {(currentPage-1)*pageSize+1}&ndash;{Math.min(currentPage*pageSize,filtered.length)} of {filtered.length} orders</span><nav aria-label="Orders pagination"><button aria-label="Previous orders page" disabled={currentPage===1} onClick={()=>{setPage(currentPage-1);setSelectedId(null)}}><ChevronLeft size={20}/></button>{pageNumbers.map((number,index)=><span key={number}>{index>0&&number-pageNumbers[index-1]>1&&<span className="orders-page-gap">&hellip;</span>}<button aria-label={'Page '+number} aria-current={number===currentPage?'page':undefined} onClick={()=>{setPage(number);setSelectedId(null)}}>{number}</button></span>)}<button aria-label="Next orders page" disabled={currentPage===totalPages} onClick={()=>{setPage(currentPage+1);setSelectedId(null)}}><ChevronRight size={20}/></button></nav></footer>}
    {details&&<PosOrderDetails user={user} bill={details} close={()=>setDetails(null)} notify={notify} onDone={()=>{setDetails(null);load()}}/>}
    {printing&&<PosPrintOptions user={user} retail={retail} order={printing} close={()=>setPrinting(null)} notify={notify} printReceipt={printReceipt} onDone={load}/>}
    {payment&&<PosPaymentModal user={user} retail={retail} order={payment} close={()=>setPayment(null)} notify={notify} onDone={result=>{if(result)onOrderConfirmed?.(result);load()}} printReceipt={printReceipt}/>}
    {tip&&<PosRecordTip user={user} close={()=>setTip(false)} notify={notify} onDone={load} printTip={printTip}/>}
  </main>
}
