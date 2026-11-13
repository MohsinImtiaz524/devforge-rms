import { Printer, ChefHat, Receipt } from 'lucide-react'
import { useRef, useState } from 'react'
import PosDialog from './PosDialog'
import { can } from './orders.logic'

export default function PosPrintOptions({user,order,close,notify,printReceipt}) {
  const [saving,setSaving]=useState(false),submitting=useRef(false)
  const unpaidOnly=['waiter','order_taker'].includes(String(user?.role||'').toLowerCase())
  async function print(format){
    if(submitting.current||!can(user,'orders.view'))return
    submitting.current=true;setSaving(true)
    try{await printReceipt(order.id,format);close()}catch(error){notify(error.message||'Could not print bill','error')}finally{submitting.current=false;setSaving(false)}
  }
  return <PosDialog title="Print Receipt" close={close} busy={saving}><div className="payment-form pos-print-menu">{!unpaidOnly&&<button disabled={saving} onClick={()=>print('kitchen')}><ChefHat size={20}/><b>Kitchen Print</b><small>Preparation ticket.</small></button>}<button disabled={saving} onClick={()=>print('unpaid')}><Receipt size={20}/><b>Unpaid Bill</b><small>Cash and card reference totals. No billing changes.</small></button>{!unpaidOnly&&<button disabled={saving} onClick={()=>print('customer')}><Printer size={20}/><b>Paid Print</b><small>Customer payment receipt.</small></button>}</div></PosDialog>
}
