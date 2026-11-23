import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import useOrderWorkload from './useOrderWorkload'
import PosDeliveryCustomer from './PosDeliveryCustomer'

export default function PosDeliveryEditor({sale,canEdit,notify,onDone}) {
  const [form,setForm]=useState({customer_name:sale.customer_name||'',customer_phone:sale.customer_phone||'',delivery_address:sale.delivery_address||'',rider_id:String(sale.rider_id||'')}),[staff,setStaff]=useState([]),[saving,setSaving]=useState(false)
  const workload=useOrderWorkload(canEdit)
  const [customerOpen,setCustomerOpen]=useState(false)
  const [customerDraft,setCustomerDraft]=useState(null)
  const submitting=useRef(false)
  const foodpanda=sale.order_type==='foodpanda'
  const editable=canEdit&&!['ready','completed'].includes(sale.order_status)
  useEffect(()=>{
    let active=true
    api('/api/users/assignable').then(rows=>{if(active)setStaff(Array.isArray(rows)?rows:[])}).catch(()=>{if(active)setStaff([])})
    return()=>{active=false}
  },[])
  const riders=Number(sale.rider_id)&&!staff.some(person=>Number(person.id)===Number(sale.rider_id))?[...staff,{id:sale.rider_id,name:sale.rider_name||'Rider #'+sale.rider_id,role:'assigned'}]:staff
  const field=(name,value)=>setForm(current=>({...current,[name]:value}))
  async function save(markOut=false){
    if(!editable||submitting.current)return
    if(markOut&&!foodpanda&&!form.customer_name.trim())return notify('Customer name is required','error')
    if(markOut&&!foodpanda&&!form.customer_phone.trim())return notify('Phone number is required','error')
    if(markOut&&!foodpanda&&!form.delivery_address.trim())return notify('Delivery address is required','error')
    if(markOut&&!foodpanda&&!form.rider_id)return notify('Select a rider before marking out for delivery','error')
    submitting.current=true;setSaving(true)
    try{await api('/api/sales/'+sale.id+'/details',{method:'PATCH',body:{rider_id:foodpanda?null:Number(form.rider_id)||null}});if(markOut)await api('/api/kds/'+sale.id+'/status',{method:'PATCH',body:{status:'ready'}});workload.refresh(true);notify(markOut?(foodpanda?'Ready for Foodpanda pickup':'Order marked out for delivery'):'Rider updated');onDone()}catch(error){notify(error.message,'error')}finally{submitting.current=false;setSaving(false)}
  }
  async function saveCustomer(details){
    if(!editable||submitting.current)return
    setCustomerDraft(details);submitting.current=true;setSaving(true)
    try{await api('/api/sales/'+sale.id+'/details',{method:'PATCH',body:{customer_id:details.customer_id||null,customer_name:details.customer_name,customer_phone:details.customer_phone,delivery_address:details.delivery_address}});setForm(current=>({...current,...details}));setCustomerOpen(false);notify('Customer details updated')}catch(error){notify(error.message,'error')}finally{submitting.current=false;setSaving(false)}
  }
  const paid=Number(sale.amount_received||0)>=Number(sale.total||0)-.01
  return <div className="delivery-editor"><header><h4>{foodpanda?'Foodpanda':'Delivery confirmation'}</h4><span>{paid?'Paid':'Unpaid'} · {sale.order_status||'pending'}</span></header><p>{foodpanda?'Customer details, delivery charges and riders are handled by Foodpanda.':'Confirm customer details and the assigned rider before dispatch.'}</p>{!foodpanda&&<dl className="pos-service-summary"><div><dt>Customer</dt><dd>{form.customer_name||'Not provided'}</dd></div><div><dt>Phone</dt><dd>{form.customer_phone||'Not provided'}</dd></div><div><dt>Address</dt><dd>{form.delivery_address||'Not provided'}</dd></div></dl>}{editable&&!foodpanda&&<button type="button" disabled={saving} onClick={()=>{setCustomerDraft({...form});setCustomerOpen(true)}}>Customer details</button>}{foodpanda?<p>Rider: Foodpanda</p>:editable?<label>Rider<select aria-label="Rider" disabled={saving} onFocus={()=>workload.refresh()} value={form.rider_id} onChange={event=>field('rider_id',event.target.value)}><option value="">Select rider</option>{riders.map(rider=><option value={rider.id} key={rider.id}>{rider.name}{rider.role?' ('+rider.role+')':''} - {workload.label(rider.id,true)}</option>)}</select></label>:<div>{sale.rider_name||'No rider assigned'}</div>}{editable?<footer><button disabled={saving} onClick={()=>save(true)}>{saving?'Confirming delivery...':foodpanda?'Ready for Foodpanda pickup':'Mark Out for Delivery'}</button></footer>:<p>Delivery info is locked after the order is out for delivery.</p>}{customerOpen&&<PosDeliveryCustomer busy={saving} value={customerDraft||form} close={()=>{if(!saving)setCustomerOpen(false)}} save={saveCustomer}/>}</div>
}
