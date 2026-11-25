import {useEffect, useRef, useState} from 'react'
import {api} from '../../api/client'
import MenuDialog from '../menu/MenuDialog'
import {wasteReasonLabel, buildWasteSourceOptions, selectedWastePayload} from './waste-options'

const sourceForms = {
  product: {title:'Product waste',item:'Select Product',quantity:'Quantity Wasted',hint:'Record lost or damaged finished goods.',notes:'Describe product damage, expiry, or stock loss.'},
  raw_ingredient: {title:'Ingredient waste',item:'Select Ingredient',quantity:'Quantity Wasted',hint:'Record ingredient loss in the ingredient usage unit.',notes:'Describe ingredient spoilage, expiry, or spillage.'},
  recipe_product: {title:'Recipe waste',item:'Select Recipe Product',quantity:'Quantity Wasted',hint:'Record waste for a recipe or linked menu product.',notes:'Describe a kitchen mistake, overproduction, or recipe loss.'},
  prepared_batch: {title:'Prepared batch waste',item:'Select Recipe',quantity:'Batches Wasted',hint:'Record prepared batches lost from a recipe.',notes:'Describe why the prepared batch was wasted.'},
  order: {title:'Order waste',item:'Select Sale / Order',quantity:'Quantity Wasted',hint:'Record waste associated with a sale or order.',notes:'Describe the cancelled order or preparation issue.'},
  return: {title:'Return waste',item:'Select Return',quantity:'Quantity Wasted',hint:'Record damage associated with a customer return.',notes:'Describe the returned item condition and damage.'}
}
const reasons = ['expired','spoiled','damaged','overproduction','kitchen_mistake','cancelled_order','customer_return','supplier_rejection','transfer_damage','stock_shrinkage','staff_use','other']
const actions = {deduct:'Deduct from stock',already_deducted:'Already deducted',no_stock:'Record only, no stock'}
const recovery = {full_loss:'Full loss',recoverable:'Move to damaged/recoverable',discounted:'Sold/used at discount',supplier_claim:'Supplier claim',staff_use:'Staff use'}

export default function WasteForm({source, onClose, onSaved}) {
  const [context,setContext] = useState(null), [error,setError] = useState(''), [saving,setSaving] = useState(false)
  const guard = useRef(false)
  const [revision,setRevision] = useState(0)
  const [form,setForm] = useState({source:'',quantity:'1',stock_action:['order','return'].includes(source)?'already_deducted':'deduct',reason_code:'expired',recovery_status:'full_loss',manual_cost_amount:'',reason:''})
  useEffect(()=>{
    let active=true
    api('/api/waste/context').then(data=>{if(active){setContext(data);setError('')}}).catch(e=>{if(active)setError(e.message)})
    return ()=>{active=false}
  },[revision])
  const fields=sourceForms[source]
  const options=context?buildWasteSourceOptions(context,source):[]
  const unit=options.find(o=>o.value===form.source)?.unit||'unit'
  const change=(key,value)=>setForm(old=>({...old,[key]:value}))
  async function submit(event) {
    event.preventDefault()
    if(guard.current)return
    const selected=selectedWastePayload(source,form.source)
    const quantity=Number(form.quantity), cost=Number(form.manual_cost_amount)
    if(!selected||!Number.isFinite(quantity)||quantity<=0){setError('Select item and quantity');return}
    if(form.manual_cost_amount!==''&&(!Number.isFinite(cost)||cost<0)){setError('Enter a valid manual cost');return}
    guard.current=true;setSaving(true);setError('')
    try {
      await api('/api/waste',{method:'POST',body:{...selected,source_type:source,quantity,unit,stock_action:form.stock_action,reason_code:form.reason_code,recovery_status:form.recovery_status,reason:form.reason,...(form.manual_cost_amount!==''?{manual_cost_amount:cost}:{})}})
      onSaved()
    } catch(e){setError(e.message)}
    finally{guard.current=false;setSaving(false)}
  }
  if(!context)return <MenuDialog label={fields.title} onClose={onClose}><div className="waste-form waste-form-loading" aria-busy={!error}><span className="waste-sr-only" role="status">{error?"Unable to load waste options":"Loading waste form"}</span><div aria-hidden="true"><div className="waste-skeleton-title"/><div className="waste-skeleton-description"/><div className="waste-skeleton-grid">{[1,2,3,4,5,6].map(i=><div key={i}><span className="waste-skeleton-label"/><span className="waste-skeleton-input"/></div>)}<div className="waste-skeleton-notes"><span className="waste-skeleton-label"/><span className="waste-skeleton-input"/></div></div></div>{error&&<p role="alert">{error}</p>}<footer><button type="button" onClick={onClose}>Cancel</button>{error?<button type="button" className="waste-primary menu-primary" onClick={()=>{setError("");setRevision(n=>n+1)}}>Try again</button>:<span className="waste-skeleton-button" aria-hidden="true"/>}</footer></div></MenuDialog>
  return <MenuDialog label={fields.title} onClose={()=>{if(!guard.current)onClose()}}>
    <form className="waste-form" onSubmit={submit}>
      <h2>{fields.title}</h2><p>{fields.hint}</p>
      {error&&<p role="alert">{error}</p>}
      <fieldset disabled={saving}>
        <label>{fields.item}<select required value={form.source} onChange={e=>change('source',e.target.value)}><option value="">Choose…</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}{!options.length&&<option disabled>No matching records</option>}</select></label>
        <label>{fields.quantity} ({unit})<input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={e=>change('quantity',e.target.value)}/></label>
        <label>Stock Action<select value={form.stock_action} onChange={e=>change('stock_action',e.target.value)}>{Object.entries(actions).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
        <label>Reason Type<select value={form.reason_code} onChange={e=>change('reason_code',e.target.value)}>{reasons.map(v=><option key={v} value={v}>{wasteReasonLabel(v)}</option>)}</select></label>
        <label>Recovery Status<select value={form.recovery_status} onChange={e=>change('recovery_status',e.target.value)}>{Object.entries(recovery).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
        <label>Manual Cost (Optional)<input type="number" min="0" step="0.01" placeholder="Auto calculated" value={form.manual_cost_amount} onChange={e=>change('manual_cost_amount',e.target.value)}/></label>
        <label className="waste-notes">Notes<textarea rows="3" placeholder={fields.notes} value={form.reason} onChange={e=>change('reason',e.target.value)}/></label>
      </fieldset>
      <footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="waste-primary menu-primary" disabled={!context||saving} type="submit">{saving?'Recording…':'Record Waste'}</button></footer>
    </form>
  </MenuDialog>
}
