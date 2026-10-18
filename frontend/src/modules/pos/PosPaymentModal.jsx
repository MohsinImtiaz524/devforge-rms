import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'
import PosCustomerFields from './PosCustomerFields'

const emptyCustomer={customer_id:null,customer_name:'',customer_phone:''}

export default function PosPaymentModal({order,close,notify,onDone,printReceipt}){
  const total=Number(order.total||0)
  const currentTax=Number(order.tax_percentage||0),currentDiscount=Number(order.discount||0)
  const taxableSubtotal=currentTax===-100?total:total/(1+(currentTax/100)),subtotal=taxableSubtotal+currentDiscount
  const [form,setForm]=useState({...emptyCustomer,customer_id:order.customer_id||null,customer_name:order.customer_name||'',customer_phone:order.customer_phone||'',discount:String(currentDiscount),tax_percentage:String(currentTax),amount_received:String(Number(order.amount_received||0)>.01?order.amount_received:total),tip_amount:String(order.tip_amount||0),tip_payment_method:order.tip_payment_method||order.payment_method||'cash',payment_method:order.payment_method||'cash'})
  const [discounts,setDiscounts]=useState([]),[taxes,setTaxes]=useState([])
  const [saving,setSaving]=useState(false)
  const discount=Number(form.discount||0),taxPercentage=Number(form.tax_percentage||0)
  const tax=(subtotal-discount)*(taxPercentage/100),finalTotal=subtotal-discount+tax
  const received=Math.max(0,Number(form.amount_received||0)),tip=Number(form.tip_amount||0),difference=received-finalTotal-tip
  useEffect(()=>{Promise.all([api('/api/shop-settings/discounts').catch(()=>[]),api('/api/shop-settings/taxes').catch(()=>[])]).then(([discountRows,taxRows])=>{setDiscounts(discountRows);setTaxes(taxRows)})},[])
  function paymentMethod(value){const linked=taxes.find(item=>item.linked_payment_method===value);setForm(current=>({...current,payment_method:value,...(linked?{tax_percentage:String(linked.percentage)}:{})}))}
  function discountPreset(value){const preset=discounts.find(item=>String(item.id)===value);if(!preset)return;const amount=preset.type==='percentage'?subtotal*Number(preset.value||0)/100:Number(preset.value||0);setForm(current=>({...current,discount:amount.toFixed(2)}))}
  async function submit(){
    if(!Number.isFinite(tip)||tip<0||Math.abs(tip*100-Math.round(tip*100))>.00001)return notify('Enter a valid tip with at most two decimal places.','error')
    if(received+.01<finalTotal+tip&&tip>0)return notify('Amount received must cover the bill and tip.','error')
    if(received<finalTotal-.01&&(!form.customer_name.trim()||!form.customer_phone.trim()))return notify('Customer name and phone are required when a balance remains unpaid.','error')
    try{
      setSaving(true)
      if(received>Number(order.amount_received||0)+.01||tip>Number(order.tip_amount||0)){const shift=await api('/api/shifts/active');if(!shift?.id&&!shift?.shift?.id)throw new Error('Open a register shift before receiving payment.')}
      const body={customer_id:form.customer_id||null,customer_name:form.customer_name.trim(),customer_phone:form.customer_phone.trim(),discount,tax_percentage:taxPercentage,tip_amount:tip,tip_payment_method:tip>0?form.tip_payment_method:undefined,payment_method:form.payment_method}
      if(Math.abs(received-Number(order.amount_received||0))>.01)body.amount_received=received
      await api('/api/sales/'+order.id+'/details',{method:'PATCH',body})
      if(order.order_type==='walk_in')await api('/api/sales/'+order.id+'/complete',{method:'POST',body:{}})
      else await api('/api/kds/'+order.id+'/status',{method:'PATCH',body:{status:'completed'}})
      await printReceipt(order.id,received>=finalTotal-.01?'customer':'unpaid')
      notify(received>=finalTotal-.01?'Payment complete and order completed.':'Order completed with remaining balance.')
      close();onDone()
    }catch(error){notify(error.message,'error')}finally{setSaving(false)}
  }
  return <div className="pos-modal-bg" onMouseDown={event=>event.target===event.currentTarget&&close()}><section className="pos-modal payment-modal" role="dialog" aria-modal="true"><header><h3>Collect Payment</h3><button onClick={close} aria-label="Close"><X size={18}/></button></header><div className="payment-form"><PosCustomerFields form={form} setForm={setForm} due={Math.max(0,finalTotal-received)}/><div className="pair"><label>Discount<select defaultValue="" onChange={event=>discountPreset(event.target.value)}><option value="">Presets</option>{discounts.map(item=><option key={item.id} value={item.id}>{item.name} ({item.type==='percentage'?item.value+'%':money(item.value)})</option>)}</select><input type="number" min="0" step=".01" value={form.discount} onChange={event=>setForm(current=>({...current,discount:event.target.value}))}/></label><label>Tax (%)<input type="number" step=".01" value={form.tax_percentage} onChange={event=>setForm(current=>({...current,tax_percentage:event.target.value}))}/></label></div><div className="pair"><label>Tip Received<input type="number" min="0" step=".01" readOnly={Number(order.tip_amount||0)>0} value={form.tip_amount} onChange={event=>setForm(current=>({...current,tip_amount:event.target.value}))}/><small>Include the tip inside Amount Received.</small></label>{tip>0&&<label>Tip Method<select value={form.tip_payment_method} onChange={event=>setForm(current=>({...current,tip_payment_method:event.target.value}))}><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online</option></select><small>May differ from the bill method.</small></label>}</div><div className="pair"><label>Amount Received<input type="number" min="0" step=".01" value={form.amount_received} onChange={event=>setForm(current=>({...current,amount_received:event.target.value}))}/><span className="quick-pay"><button type="button" onClick={()=>setForm(current=>({...current,amount_received:'0'}))}>Pay 0</button><button type="button" onClick={()=>setForm(current=>({...current,amount_received:(finalTotal+tip).toFixed(2)}))}>Pay Full</button></span></label><label>Bill Payment Method<select value={form.payment_method} onChange={event=>paymentMethod(event.target.value)}><option value="cash">Cash</option><option value="card">Card</option><option value="online">Online</option></select></label></div><dl><div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div><dt>Discount</dt><dd>- {money(discount)}</dd></div><div><dt>Tax</dt><dd>{money(tax)}</dd></div><div><dt>Grand Total</dt><dd>{money(finalTotal)}</dd></div>{difference<0?<div className="due"><dt>Remaining Due</dt><dd>{money(Math.abs(difference))}</dd></div>:difference>0?<div className="change"><dt>Change to Give</dt><dd>{money(difference)}</dd></div>:null}</dl><button className="primary" disabled={saving} onClick={submit}>{saving?'Processing...':'Complete Order'}</button></div></section></div>
}
