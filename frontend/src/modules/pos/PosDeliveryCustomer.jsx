import { useState } from 'react'
import PosDialog from './PosDialog'
import PosCustomerFields from './PosCustomerFields'

export default function PosDeliveryCustomer({ value, close, save, busy=false }) {
  const [draft,setDraft]=useState({...value})
  const [error,setError]=useState('')
  function submit(event){
    event.preventDefault()
    if(!draft.customer_name.trim()||!draft.customer_phone.trim()||!draft.delivery_address.trim())return setError('Enter the customer name, phone number, and delivery address.')
    save({...draft,customer_name:draft.customer_name.trim(),customer_phone:draft.customer_phone.trim(),delivery_address:draft.delivery_address.trim()})
  }
  return <PosDialog title="Customer details" close={close} busy={busy}><form className="payment-form" onSubmit={submit}><PosCustomerFields form={draft} setForm={setDraft}/><label>Delivery Address<textarea aria-label="Delivery Address" value={draft.delivery_address} onChange={event=>setDraft(current=>({...current,delivery_address:event.target.value}))} maxLength={1000} rows={3}/></label>{error&&<p role="alert" className="pos-assignment-error">{error}</p>}<button disabled={busy} type="submit" className="primary">{busy?'Saving customer details...':'Save customer details'}</button></form></PosDialog>
}
