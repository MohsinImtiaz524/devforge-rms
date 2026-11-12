import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'
import PosDialog from './PosDialog'
import { can, karachiToday, tipOrderContext, validTip } from './orders.logic'

export default function PosRecordTip({user,close,notify,onDone,printTip}) {
  const [filters,setFilters]=useState({search:'',table_id:'',period:'today',from:'',to:''})
  const [orders,setOrders]=useState([]),[tables,setTables]=useState([]),[selected,setSelected]=useState(null),[open,setOpen]=useState(false),[message,setMessage]=useState('Loading completed orders...')
  const [amount,setAmount]=useState(''),[method,setMethod]=useState('cash'),[saving,setSaving]=useState(false),[success,setSuccess]=useState(null)
  const dropdown=useRef(null),amountInput=useRef(null),submitting=useRef(false),sequence=useRef(0)
  const permitted=can(user,'orders.take_payment')
  useEffect(()=>{
    const id=++sequence.current
    const timer=setTimeout(async()=>{
      if(!permitted)return
      if(filters.period==='custom'&&(!filters.from||!filters.to||filters.from>filters.to)){setMessage('Choose a valid date range: From must be on or before To.');return}
      setMessage('Loading completed orders...')
      const params=new URLSearchParams({period:filters.period})
      if(filters.search.trim())params.set('search',filters.search.trim())
      if(filters.table_id)params.set('table_id',filters.table_id)
      if(filters.period==='custom'){params.set('from',filters.from);params.set('to',filters.to)}
      try{
        const result=await api('/api/tips/options?'+params)
        if(id!==sequence.current)return
        setOrders(Array.isArray(result.orders)?result.orders:[])
        setTables(current=>current.length?current:result.tables||[])
        setMessage('No eligible completed paid orders found for the selected dates.')
      }catch(error){if(id===sequence.current)setMessage(error.message)}
    },filters.search?250:0)
    return()=>{clearTimeout(timer)}
  },[filters,permitted])
  useEffect(()=>{
    const dismiss=event=>{if(!dropdown.current?.contains(event.target))setOpen(false)}
    document.addEventListener('pointerdown',dismiss);document.addEventListener('focusin',dismiss)
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('focusin',dismiss)}
  },[])
  function change(name,value){
    sequence.current++;setOrders([]);setSelected(null)
    if(name!=='search')setOpen(false)
    setFilters(current=>({...current,...(selected?{search:''}:{}),[name]:value,...(name==='period'&&value==='custom'?{from:current.from||karachiToday(),to:current.to||karachiToday()}: {})}))
  }
  async function submit(){
    if(submitting.current)return
    if(!permitted)return notify('Payment permission is required to record tips.','error')
    if(!selected)return notify('Select a completed paid order.','error')
    if(!validTip(Number(amount)))return notify('Enter a valid tip with at most two decimal places.','error')
    submitting.current=true;setSaving(true)
    try{
      const shift=await api('/api/shifts/active')
      if(!shift?.id&&!shift?.shift?.id)throw new Error('Open a register shift before receiving payment.')
      const result=await api('/api/tips/'+selected.id,{method:'POST',body:{amount:Number(amount),payment_method:method}})
      setSuccess({...result,order:selected});notify(`Tip of ${money(Number(amount))} recorded for order #${selected.order_number||selected.id}.`);onDone()
    }catch(error){notify(error.message||'Could not record the tip.','error')}finally{submitting.current=false;setSaving(false)}
  }
  return <PosDialog title="Record Tip" close={close} busy={saving}>{success?<div className="payment-form"><h4>Tip Recorded</h4><p>Order #{success.order.order_number||success.order.id} · {money(success.amount)}</p><p>Payment method: {success.payment_method}</p><p>{tipOrderContext(success.order)}</p><button className="primary" aria-label="Print tip receipt" onClick={()=>printTip(success.sale_id)}>Print Tip Slip</button><button onClick={close}>Done</button></div>:<div className="payment-form"><div className="pos-info-box"><b>Completed paid orders</b><p>Search completed paid orders without a tip within the selected dates.</p></div><div className="pair"><div className="pos-tip-dropdown" ref={dropdown}><label>Order, table, or customer<input type="search" autoComplete="off" placeholder="Search completed orders..." value={selected?`Order #${selected.order_number||selected.id} · ${selected.order_type==='dine_in'?`Table ${selected.table_number||'N/A'}`:selected.order_type}`:filters.search} onChange={event=>change('search',event.target.value)} onFocus={()=>setOpen(true)} onClick={()=>setOpen(true)} aria-expanded={open} aria-controls="tip-order-options" onKeyDown={event=>{if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false)}}}/></label>{open&&<div className="pos-tip-options" id="tip-order-options">{orders.length?orders.map(order=><button type="button" key={order.id} onClick={()=>{setSelected(order);setOpen(false);amountInput.current?.focus()}}><b>Order #{order.order_number||order.id}</b><strong>{money(order.total)}</strong><small>{tipOrderContext(order)}</small></button>):<p>{message}</p>}</div>}</div><label>Table<select aria-label="Table" value={filters.table_id} onChange={event=>change('table_id',event.target.value)}><option value="">All tables</option>{tables.map(table=><option key={table.id} value={table.id}>Table {table.table_number}</option>)}</select></label></div><label>Date<select aria-label="Date" value={filters.period} onChange={event=>change('period',event.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="2days">Today + Yesterday</option><option value="all">All Time</option><option value="custom">Custom Range</option></select></label>{filters.period==='custom'&&<div className="pair"><label>From<input type="date" value={filters.from} onChange={event=>change('from',event.target.value)}/></label><label>To<input type="date" value={filters.to} onChange={event=>change('to',event.target.value)}/></label></div>}<div className="pos-info-box">{selected?<><b>Order #{selected.order_number||selected.id} · {tipOrderContext(selected)}</b><p>Bill paid by {selected.payment_method||'cash'}</p><strong>Bill total: {money(selected.total)}</strong></>:'Select a completed paid order'}</div><div className="pair"><label>Tip received<input ref={amountInput} type="number" min="0.01" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)}/></label><label>Tip payment method<select aria-label="Tip payment method" value={method} onChange={event=>setMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online</option></select></label></div><button className="primary" disabled={saving||!selected||!validTip(Number(amount))} onClick={submit}>{saving?'Recording Tip...':'Confirm Record Tip'}</button></div>}</PosDialog>
}
