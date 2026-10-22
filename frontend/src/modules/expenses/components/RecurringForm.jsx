import {useState} from 'react'
import {RefreshCw} from 'lucide-react'

const dateValue=value=>String(value||'').slice(0,10)
const blank=categories=>({title:'',category_id:categories[0]?.id||'',amount:'',vendor:'',reference_number:'',note:'',frequency:'monthly',start_date:new Date().toISOString().slice(0,10),next_run_date:new Date().toISOString().slice(0,10),end_date:''})

export default function RecurringForm({categories,template,onSave,onCancel}){
 const [form,setForm]=useState(()=>template?{title:template.title,category_id:template.category_id,amount:template.amount,vendor:template.vendor||'',reference_number:template.reference_number||'',note:template.note||'',frequency:template.frequency,start_date:dateValue(template.start_date),next_run_date:dateValue(template.next_run_date),end_date:dateValue(template.end_date),version:template.version}:blank(categories))
 const [saving,setSaving]=useState(false),[error,setError]=useState('')

 const update=(key,value)=>setForm(current=>({...current,[key]:value}))
 async function submit(event){event.preventDefault();try{setSaving(true);setError('');await onSave({...form,category_id:Number(form.category_id),amount:Number(form.amount)})}catch(err){setError(err.message)}finally{setSaving(false)}}
 return <form className="expense-form" onSubmit={submit}>
  {error&&<div className="expense-state-message" role="alert"><span>{error}</span></div>}
  <label>Title *<input required minLength="2" value={form.title} onChange={event=>update('title',event.target.value)}/></label>
  <div className="expense-form-grid"><label>Category *<select required value={form.category_id} onChange={event=>update('category_id',event.target.value)}>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Amount *<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={event=>update('amount',event.target.value)}/></label></div>
  <div className="expense-form-grid"><label>Frequency<select value={form.frequency} onChange={event=>update('frequency',event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label><label>Next occurrence<input required type="date" min={form.start_date} value={form.next_run_date} onChange={event=>update('next_run_date',event.target.value)}/></label></div>
  <div className="expense-form-grid"><label>Start date<input required type="date" value={form.start_date} onChange={event=>update('start_date',event.target.value)}/></label><label>End date<input type="date" min={form.next_run_date||form.start_date} value={form.end_date} onChange={event=>update('end_date',event.target.value)}/></label></div>
  <label>Vendor / payee<input value={form.vendor} onChange={event=>update('vendor',event.target.value)}/></label>
  <label>Reference<input value={form.reference_number} onChange={event=>update('reference_number',event.target.value)}/></label>
  <label>Note<textarea rows="3" value={form.note} onChange={event=>update('note',event.target.value)}/></label>
  <div className="expense-form-actions"><button type="button" onClick={onCancel}>Cancel</button><button className="primary" disabled={saving}>{saving?<><RefreshCw className="spin"/> Saving…</>:template?'Save changes':'Create recurring expense'}</button></div>
 </form>
}