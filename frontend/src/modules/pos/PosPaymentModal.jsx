import { CreditCard, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import PosDialog from './PosDialog'
import { can, completionPath, isRetailCompletion } from './orders.logic'
import { api } from '../../api/client'
import { formatShopCurrency as money } from '../../currency'
import PosCustomerFields from './PosCustomerFields'
import './pos.payment.css'

const emptyCustomer={customer_id:null,customer_name:'',customer_phone:''}

export default function PosPaymentModal({user,order,close,notify,onDone,printReceipt}){
  const total=Number(order.total||0)
  const currentTax=Number(order.tax_percentage||0),currentDiscount=Number(order.discount||0)
  const deliveryServiceCharge=Number(order.delivery_service_charge||0),storedDineInServiceCharge=Number(order.dine_in_service_charge||0),dineInServiceChargePercentage=Number(order.dine_in_service_charge_percentage||0)
  const taxableSubtotal=currentTax===-100?total-deliveryServiceCharge-storedDineInServiceCharge:(total-deliveryServiceCharge-storedDineInServiceCharge)/(1+(currentTax/100)),subtotal=taxableSubtotal+currentDiscount
  const initialDiscountPercentage=subtotal>0?(currentDiscount/subtotal)*100:0
  const [form,setForm]=useState({...emptyCustomer,customer_id:order.customer_id||null,customer_name:order.customer_name||'',customer_phone:order.customer_phone||'',discount_percentage:String(Number(initialDiscountPercentage.toFixed(2))),tax_percentage:String(currentTax),amount_received:String(Number(order.amount_received||0)>.01?order.amount_received:total),tip_amount:String(order.tip_amount||0),tip_payment_method:order.tip_payment_method||order.payment_method||'cash',payment_method:order.payment_method||'cash'})
  const [discounts,setDiscounts]=useState([]),[taxes,setTaxes]=useState([])
  const [selectedDiscountPreset,setSelectedDiscountPreset]=useState('')
  const [saving,setSaving]=useState(false)
  const submitting=useRef(false)
  const discountPercentage=Number(form.discount_percentage||0),discount=Math.round(subtotal*discountPercentage)/100,taxPercentage=Number(form.tax_percentage||0)
  const dineInServiceCharge=order.order_type==='dine_in'?Math.round(Math.max(0,subtotal-discount)*dineInServiceChargePercentage)/100:0,serviceCharge=deliveryServiceCharge+dineInServiceCharge
  const tax=(subtotal-discount)*(taxPercentage/100),finalTotal=(Math.round((subtotal-discount+tax)*100)+Math.round(serviceCharge*100))/100
  const received=Math.max(0,Number(form.amount_received||0)),tip=Number(form.tip_amount||0),payableTotal=(Math.round(finalTotal*100)+Math.round(tip*100))/100,difference=(Math.round(received*100)-Math.round(payableTotal*100))/100
  const previousPayableTotal=useRef(payableTotal)
  useEffect(()=>{Promise.all([api('/api/shop-settings/discounts').catch(()=>[]),api('/api/shop-settings/taxes').catch(()=>[])]).then(([discountRows,taxRows])=>{setDiscounts(discountRows);setTaxes(taxRows);setForm(current=>{
    const percentage=Number(taxRows.find(item=>item.linked_payment_method===current.payment_method)?.percentage??currentTax)
    const currentDiscount=Math.round(subtotal*Number(current.discount_percentage||0))/100
    const nextTotal=(Math.round(((subtotal-currentDiscount)*(1+percentage/100))*100)+Math.round(serviceCharge*100))/100
    return {...current,tax_percentage:String(percentage),...(Number(order.amount_received||0)<=.01?{amount_received:(nextTotal+Number(current.tip_amount||0)).toFixed(2)}:{})}
  })})},[])
  useEffect(()=>{if(Math.abs(previousPayableTotal.current-payableTotal)<.005)return;previousPayableTotal.current=payableTotal;setForm(current=>({...current,amount_received:payableTotal.toFixed(2)}))},[payableTotal])
  function paymentMethod(value){
    const linked=taxes.find(item=>item.linked_payment_method===value)
    const percentage=Number(linked?.percentage??currentTax)
    setForm(current=>{const currentDiscount=Math.round(subtotal*Number(current.discount_percentage||0))/100,nextTotal=(Math.round(((subtotal-currentDiscount)*(1+percentage/100))*100)+Math.round(serviceCharge*100)+Math.round(Number(current.tip_amount||0)*100))/100;return {...current,payment_method:value,tax_percentage:String(percentage),amount_received:nextTotal.toFixed(2)}})
  }
  function setDiscountPercentage(value){setForm(current=>{const nextDiscount=Math.round(subtotal*Number(value||0))/100,nextDineCharge=order.order_type==='dine_in'?Math.round(Math.max(0,subtotal-nextDiscount)*dineInServiceChargePercentage)/100:0,nextTotal=(Math.round(((subtotal-nextDiscount)*(1+Number(current.tax_percentage||0)/100))*100)+Math.round(deliveryServiceCharge*100)+Math.round(nextDineCharge*100)+Math.round(Number(current.tip_amount||0)*100))/100;return {...current,discount_percentage:value,amount_received:nextTotal.toFixed(2)}})}
  function discountPreset(value){const preset=discounts.find(item=>String(item.id)===value);if(!preset)return;setSelectedDiscountPreset(String(preset.id));const percentage=preset.type==='percentage'?Number(preset.value||0):(subtotal>0?(Number(preset.value||0)/subtotal)*100:0);setDiscountPercentage(String(Number(percentage.toFixed(2))))}
  function setTaxPercentage(value){setForm(current=>{const currentDiscount=Math.round(subtotal*Number(current.discount_percentage||0))/100,nextTotal=(Math.round(((subtotal-currentDiscount)*(1+Number(value||0)/100))*100)+Math.round(serviceCharge*100)+Math.round(Number(current.tip_amount||0)*100))/100;return {...current,tax_percentage:value,amount_received:nextTotal.toFixed(2)}})}
  function setTipAmount(value){setForm(current=>({...current,tip_amount:value,amount_received:((Math.round(finalTotal*100)+Math.round(Number(value||0)*100))/100).toFixed(2)}))}
  function setTipMethod(value){setForm(current=>({...current,tip_payment_method:value,amount_received:payableTotal.toFixed(2)}))}
  async function submit(){
    if(submitting.current)return
    if(!can(user,'orders.take_payment')||!can(user,'orders.complete'))return notify('Payment and complete permissions are required for this action.','error')
    if(!Number.isFinite(discountPercentage)||discountPercentage<0||discountPercentage>100)return notify('Enter a discount percentage from 0 to 100.','error')
    if(!Number.isFinite(tip)||tip<0||Math.abs(tip*100-Math.round(tip*100))>.00001)return notify('Enter a valid tip with at most two decimal places.','error')
    if(Math.round(received*100)<Math.round(finalTotal*100)+Math.round(tip*100)&&tip>0)return notify('Amount received must cover the bill and tip.','error')
    if(received<finalTotal-.01&&(!form.customer_name.trim()||!form.customer_phone.trim()))return notify('Customer name and phone are required when a balance remains unpaid.','error')
    try{
      submitting.current=true
      setSaving(true)
      if(received>Number(order.amount_received||0)+.01||tip>Number(order.tip_amount||0)){const shift=await api('/api/shifts/active');if(!shift?.id&&!shift?.shift?.id)throw new Error('Open a register shift before receiving payment.')}
      const body={customer_id:form.customer_id||null,customer_name:form.customer_name.trim(),customer_phone:form.customer_phone.trim(),discount,tax_percentage:taxPercentage,tip_amount:tip,tip_payment_method:tip>0?form.tip_payment_method:undefined,payment_method:form.payment_method}
      if(Math.abs(received-Number(order.amount_received||0))>.01)body.amount_received=received
      await api('/api/sales/'+order.id+'/details',{method:'PATCH',body})
      const retailCompletion=isRetailCompletion(user,order)
      await api(completionPath(user,order),{method:retailCompletion?'POST':'PATCH',body:retailCompletion?{}:{status:'completed'}})
      window.dispatchEvent(new Event('pos:tables-changed'))
      await printReceipt(order.id,received>=finalTotal-.01?'customer':'unpaid')
      close();onDone({id:order.id,number:order.order_number||order.id,total:finalTotal,status:'completed',detail:received>=finalTotal-.01?'Payment recorded':'Remaining balance saved to customer ledger.'})
    }catch(error){notify(error.message,'error')}finally{submitting.current=false;setSaving(false)}
  }
  return <PosDialog title="Complete Payment" close={close} busy={saving} className="pos-payment-dialog">
    <div className="payment-form payment-compact">
      <div className="payment-context"><span>Order #{order.order_number||order.id}</span><span>{order.order_type==='dine_in'?'Table '+(order.table_number||'?'):String(order.order_type||'Order').replaceAll('_',' ')}</span></div>
      <div className="payment-layout">
        <section className="payment-fields" aria-label="Payment details">
          <PosCustomerFields form={form} setForm={setForm} due={Math.max(0,finalTotal-received)}/>
          {discounts.length>0&&<fieldset className="payment-option-group"><legend>Discount presets</legend><div className="payment-option-cards discount-option-cards">{discounts.map(item=><button type="button" key={item.id} aria-pressed={selectedDiscountPreset===String(item.id)} onClick={()=>discountPreset(String(item.id))}><b>{item.name}</b><small>{item.type==='percentage'?item.value+'%':money(item.value)}</small></button>)}</div></fieldset>}
          <div className="pair payment-adjustments"><label>Custom Discount (%)<input aria-label="Discount percentage" type="number" min="0" max="100" step=".01" value={form.discount_percentage} onChange={event=>{setSelectedDiscountPreset('');setDiscountPercentage(event.target.value)}}/></label><label>Tax (%)<input type="number" step=".01" value={form.tax_percentage} onChange={event=>setTaxPercentage(event.target.value)}/></label></div>
          <fieldset className="payment-option-group"><legend>Bill payment method</legend><div className="payment-option-cards payment-method-cards">{[['cash','Cash'],['card','Card'],['online','Online']].map(([value,label])=><button type="button" key={value} aria-pressed={form.payment_method===value} onClick={()=>paymentMethod(value)}>{label}</button>)}</div></fieldset>
          <div className="payment-tip-row"><label>Tip Received<input type="number" min="0" step=".01" readOnly={Number(order.tip_amount||0)>0} aria-label="Tip Received" value={form.tip_amount} onChange={event=>setTipAmount(event.target.value)}/></label><fieldset className="payment-option-group"><legend>Tip Method</legend><div className="payment-option-cards payment-method-cards tip-method-cards">{[['cash','Cash'],['card','Card'],['online','Online']].map(([value,label])=><button type="button" key={value} aria-pressed={form.tip_payment_method===value} onClick={()=>setTipMethod(value)}>{label}</button>)}</div></fieldset></div>
          <small className="payment-hint">Include any tip in the amount received.</small>
        </section>
        <aside className="payment-summary" aria-label="Payment summary">
          <dl><div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div><dt>Discount</dt><dd>- {money(discount)}</dd></div><div><dt>Tax</dt><dd>{money(tax)}</dd></div>{deliveryServiceCharge>0&&<div><dt>Delivery charge</dt><dd>{money(deliveryServiceCharge)}</dd></div>}{dineInServiceCharge>0&&<div><dt>Dine-in service charge</dt><dd>{money(dineInServiceCharge)}</dd></div>}<div className="payment-grand-total"><dt>Total to pay</dt><dd>{money(finalTotal)}</dd></div></dl>
          <label>Amount Received<input type="number" min="0" step=".01" aria-label="Amount Received" value={form.amount_received} onChange={event=>setForm(current=>({...current,amount_received:event.target.value}))}/></label>
          <span className="quick-pay"><button type="button" onClick={()=>setForm(current=>({...current,amount_received:'0'}))}>Pay 0</button><button type="button" onClick={()=>setForm(current=>({...current,amount_received:payableTotal.toFixed(2)}))}>Pay Full</button></span>
          <div className={'payment-balance '+(difference<0?'due':'change')}><span>{difference<0?'Remaining Due':difference>0?'Change to Give':'Remaining Due'}</span><strong>{money(Math.abs(difference))}</strong></div>
        </aside>
      </div>
      <footer className="payment-footer"><button type="button" className="payment-cancel" disabled={saving} onClick={close}>Cancel</button><button className="primary" disabled={saving} onClick={submit}>{saving?<><LoaderCircle className="pos-spin" size={16}/> Saving payment...</>:<><CreditCard size={16}/> Confirm Payment & Complete</>}</button></footer>
    </div>
  </PosDialog>
}
