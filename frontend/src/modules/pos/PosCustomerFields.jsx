import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'

export default function PosCustomerFields({form,setForm,due=0,nameOnly=false}) {
  const [query,setQuery]=useState(''),[target,setTarget]=useState(''),[results,setResults]=useState([])
  const root=useRef(null),sequence=useRef(0)
  useEffect(()=>{
    const id=++sequence.current
    if(!query.trim())return
    const timer=setTimeout(async()=>{
      try{const rows=await api('/api/customers?status=active&search='+encodeURIComponent(query.trim()));if(id===sequence.current)setResults(Array.isArray(rows)?rows.slice(0,6):[])}
      catch{if(id===sequence.current)setResults([])}
    },250)
    return()=>clearTimeout(timer)
  },[query])
  useEffect(()=>{
    const dismiss=event=>{if(!root.current?.contains(event.target))setTarget('')}
    document.addEventListener('pointerdown',dismiss);document.addEventListener('focusin',dismiss)
    return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('focusin',dismiss)}
  },[])
  function change(name,value){sequence.current++;setForm(current=>({...current,[name]:value,customer_id:null}));setResults([]);setQuery(value);setTarget(name)}
  function choose(customer){sequence.current++;setForm(current=>({...current,customer_id:customer.id,customer_name:customer.name||'',customer_phone:customer.phone||''}));setQuery('');setResults([]);setTarget('')}
  return <div className="pos-customer" ref={root}><div className={nameOnly?'':'pair'}>{(nameOnly?['customer_name']:['customer_name','customer_phone']).map(name=><div className="pos-customer-field" key={name}><label>{name==='customer_name'?'Customer Name':'Phone Number'}<input autoComplete="off" type={name==='customer_phone'?'tel':'text'} value={form[name]} placeholder={due>0?'REQUIRED for Dues':name==='customer_name'?'Search or enter customer':'Search or enter phone'} aria-expanded={target===name&&results.length>0} onChange={event=>change(name,event.target.value)} onKeyDown={event=>{if(event.key==='Escape'&&target){event.stopPropagation();event.preventDefault();setTarget('')}}}/></label>{target===name&&results.length>0&&<div className="pos-suggestions">{results.map(customer=><button type="button" key={customer.id} onClick={()=>choose(customer)}><b>{customer.name}</b><small>{customer.phone||'No phone'} · Due: {money(customer.current_balance||0)}</small></button>)}</div>}</div>)}</div></div>
}
