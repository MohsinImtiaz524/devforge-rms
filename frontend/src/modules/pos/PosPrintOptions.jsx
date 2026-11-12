import { Printer, ChefHat, Receipt, LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'
import PosDialog from './PosDialog'
import PosCustomerFields from './PosCustomerFields'
import { can } from './orders.logic'

export default function PosPrintOptions({user,order,close,notify,printReceipt,onDone}) {
  const [inquiry,setInquiry]=useState(null),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false)
  const submitting=useRef(false)
  async function unpaid(){
    if(!can(user,'orders.view'))return
    setLoading(true)
    try{
      const [bill,discounts,taxes]=await Promise.all([api('/api/sales/'+order.id+'/bill'),api('/api/shop-settings/discounts'),api('/api/shop-settings/taxes')])
      if(!bill.sale)throw new Error('Order not found')
      setInquiry({bill,discounts,taxes})
    }catch(error){notify('Error loading print options: '+error.message,'error')}finally{setLoading(false)}
  }
  async function save(form){
    if(submitting.current||!can(user,'orders.view'))return
    submitting.current=true;setSaving(true)
    try{
      await api('/api/sales/'+order.id+'/inquiry-bill',{method:'PATCH',body:{customer_name:form.customer_name.trim(),payment_method:form.payment_method||'cash',discount:Math.max(Number(form.discount)||0,0),tax_percentage:Math.max(Number(form.tax_percentage)||0,0)}})
      await printReceipt(order.id,'unpaid');close();onDone();notify('Unpaid bill printed. No payment was recorded.')
    }catch(error){notify(error.message||'Could not print unpaid bill','error')}finally{submitting.current=false;setSaving(false)}
  }
  async function print(format){if(submitting.current||!can(user,'orders.view'))return;submitting.current=true;setSaving(true);try{await printReceipt(order.id,format);close()}finally{submitting.current=false;setSaving(false)}}
  return <PosDialog title={inquiry?'Unpaid Bill Options':'Print Receipt'} close={close} busy={saving}>{inquiry?<InquiryForm key={order.id} data={inquiry} save={save} saving={saving}/>:<div className="payment-form pos-print-menu"><button disabled={loading||saving} onClick={()=>print('kitchen')}><ChefHat size={20}/><b>Kitchen Print</b><small>Preparation ticket with quantities, notes, table/token, and no prices.</small></button><button disabled={loading||saving} onClick={unpaid}><Receipt size={20}/><b>Unpaid Print</b><small>Pending-payment copy with editable tax/discount before printing.</small></button><button disabled={loading||saving} onClick={()=>print('customer')}><Printer size={20}/><b>Paid Print</b><small>Customer copy with items, totals, received amount, due, and change.</small></button>{loading&&<p role="status"><LoaderCircle className="pos-spin" size={16}/> Loading bill and print options...</p>}</div>}</PosDialog>
}

function InquiryForm({data,save,saving}) {
  const {bill,discounts,taxes}=data,{sale}=bill
  const method=sale.payment_method||'cash',linked=taxes.find(tax=>tax.linked_payment_method===method)
  const [form,setForm]=useState({customer_name:sale.customer_name||'',customer_phone:sale.customer_phone||'',customer_id:sale.customer_id||null,payment_method:method,discount:String(sale.discount||0),tax_percentage:String(linked?.percentage??sale.tax_percentage??0)})
  const subtotal=(bill.items||[]).reduce((sum,item)=>sum+Number(item.quantity)*Number(item.price_at_sale),0)
  const discount=Number(form.discount)||0,percentage=Number(form.tax_percentage)||0,tax=(subtotal-discount)*percentage/100,total=(Math.round((subtotal-discount+tax)*100)+Math.round(Number(sale.delivery_service_charge||0)*100))/100
  const field=(name,value)=>setForm(current=>({...current,[name]:value}))
  function preset(value){if(value==='')return;const item=discounts[Number(value)];if(!item)return;field('discount',item.type==='percentage'?(subtotal*Number(item.value)/100).toFixed(2):String(Number(item.value)))}
  function payment(value){const taxPreset=taxes.find(tax=>tax.linked_payment_method===value);setForm(current=>({...current,payment_method:value,...(taxPreset?{tax_percentage:String(taxPreset.percentage)}:{})}))}
  return <div className="payment-form"><PosCustomerFields form={form} setForm={setForm} nameOnly/><div className="pair"><label>Payment Method<select aria-label="Payment Method" value={form.payment_method} onChange={event=>payment(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online Transfer</option></select></label><label>Tax (%)<input type="number" step="0.01" value={form.tax_percentage} onChange={event=>field('tax_percentage',event.target.value)}/></label></div><label>Discount<select aria-label="Discount preset" defaultValue="" onChange={event=>preset(event.target.value)}><option value="">Presets</option>{discounts.map((item,index)=><option key={item.id||index} value={index}>{item.name} ({item.type==='percentage'?item.value+'%':money(item.value)})</option>)}</select><input type="number" step="0.01" value={form.discount} onChange={event=>field('discount',event.target.value)}/></label><dl><div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div><dt>Discount</dt><dd>- {money(discount)}</dd></div><div><dt>Tax</dt><dd>{money(tax)}</dd></div>{Number(sale.delivery_service_charge)>0&&<div><dt>Delivery service charge</dt><dd>{money(sale.delivery_service_charge)}</dd></div>}<div><dt>Grand Total</dt><dd>{money(total)}</dd></div><div className="due"><dt>Remaining Due</dt><dd>{money(Math.max(total,0))}</dd></div></dl><button disabled={saving} className="primary" onClick={()=>save(form)}>{saving?<><LoaderCircle className="pos-spin" size={16}/> Updating unpaid bill and preparing print...</>:'Update & Print Unpaid Bill'}</button></div>
}
