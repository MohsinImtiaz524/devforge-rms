import { Printer, ChefHat, Receipt } from 'lucide-react'
import { useRef, useState } from 'react'
import PosDialog from './PosDialog'
import { can } from './orders.logic'
import { api } from '../../api/client'
import { UnpaidBillOptions } from '../sales/UnpaidBillOptions'

export default function PosPrintOptions({user,order,close,notify,printReceipt}) {
  const [saving,setSaving]=useState(false),submitting=useRef(false)
  const [unpaidBill,setUnpaidBill]=useState(null)
  const unpaidOnly=['waiter','order_taker'].includes(String(user?.role||'').toLowerCase())
  async function print(format){
    if(submitting.current||!can(user,'orders.view'))return
    submitting.current=true;setSaving(true)
    try{await printReceipt(order.id,format);close()}catch(error){notify(error.message||'Could not print bill','error')}finally{submitting.current=false;setSaving(false)}
  }
  async function openUnpaidOptions(){
    if(submitting.current||!can(user,'orders.view'))return
    submitting.current=true;setSaving(true)
    try{const bill=await api('/api/sales/'+order.id+'/bill');if(!bill?.sale)throw new Error('Order details not found');setUnpaidBill(bill)}
    catch(error){notify(error.message||'Could not load unpaid bill options','error')}
    finally{submitting.current=false;setSaving(false)}
  }
  if(unpaidBill)return <PosDialog title="Unpaid Bill Options" close={close} busy={saving} className="pos-payment-dialog pos-unpaid-bill-dialog"><UnpaidBillOptions data={unpaidBill} requestView={null} onCancel={close} onPrint={async(id,format)=>{setSaving(true);try{await printReceipt(id,format);close()}finally{setSaving(false)}}}/></PosDialog>
  return <PosDialog title="Print Receipt" close={close} busy={saving}><div className="payment-form pos-print-menu">{!unpaidOnly&&<button disabled={saving} onClick={()=>print('kitchen')}><ChefHat size={20}/><b>Kitchen Print</b><small>Preparation ticket.</small></button>}<button disabled={saving} onClick={openUnpaidOptions}><Receipt size={20}/><b>Unpaid Bill</b><small>Apply a percentage discount, review totals, and print.</small></button>{!unpaidOnly&&<button disabled={saving} onClick={()=>print('customer')}><Printer size={20}/><b>Paid Print</b><small>Customer payment receipt.</small></button>}</div></PosDialog>
}
