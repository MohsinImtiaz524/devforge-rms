import { useState } from 'react'
import { getShopCurrency } from '../../../currency'

export default function ExpenseForm({ expense, categories, onSave, onCancel }) {
  const [form,setForm]=useState(()=>({title:expense?.title||'',category_id:String(expense?.category_id||categories[0]?.id||''),amount:expense?.amount||'',expense_date:String(expense?.date||new Date().toISOString().slice(0,10)).slice(0,10),vendor:expense?.vendor||'',reference_number:expense?.reference_number||'',note:expense?.note||'',...(expense?{version:Number(expense.version||0)}:{})}))
  const [receipt,setReceipt]=useState(null),[saving,setSaving]=useState(false),[error,setError]=useState('')
  const update=(key,value)=>setForm(current=>({...current,[key]:value}))
  async function submit(event){event.preventDefault();if(!form.title.trim()||!form.category_id||!(Number(form.amount)>0))return setError('Title, category and a positive amount are required.');try{setSaving(true);setError('');await onSave({...form,category_id:Number(form.category_id),amount:Number(form.amount),receipt})}catch(e){setError(e.message)}finally{setSaving(false)}}
  return <form className="expense-form" onSubmit={submit}>
    {error&&<div className="expense-error" role="alert">{error}</div>}
    <label>Title *<input autoFocus required maxLength="160" value={form.title} onChange={e=>update('title',e.target.value)} placeholder="e.g. Electricity bill" /></label>
    <div className="expense-form-grid"><label>Category *<select required value={form.category_id} onChange={e=>update('category_id',e.target.value)}><option value="">Select category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.emoji||''} {c.name}</option>)}</select></label><label>Expense date *<input required type="date" value={form.expense_date} onChange={e=>update('expense_date',e.target.value)} /></label></div>
    <div className="expense-form-grid"><label>Amount ({getShopCurrency()}) *<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>update('amount',e.target.value)} placeholder="0.00" /></label><label>Vendor / payee<input maxLength="160" value={form.vendor} onChange={e=>update('vendor',e.target.value)} placeholder="Optional" /></label></div>
    <label>Invoice or reference number<input maxLength="120" value={form.reference_number} onChange={e=>update('reference_number',e.target.value)} placeholder="Optional" /></label>
    <label>Receipt (PDF, JPEG, PNG or WebP; maximum 10 MB)<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setReceipt(e.target.files?.[0]||null)} /></label>
    <label>Note<textarea rows="3" maxLength="2000" value={form.note} onChange={e=>update('note',e.target.value)} placeholder="Optional details" /></label>
    <div className="expense-form-actions">{onCancel&&<button type="button" onClick={onCancel}>Cancel</button>}<button className="primary" disabled={saving}>{saving?'Saving…':expense?'Update Expense':'Submit Expense'}</button></div>
  </form>
}