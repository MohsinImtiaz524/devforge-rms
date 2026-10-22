import { Search, SlidersHorizontal, X } from 'lucide-react'

export default function ExpenseFilters({tab,categories,options,values,advancedOpen,activeCount,onToggle,onChange,onClear}){
 const set=(key,value)=>onChange(key,value)
 return <section className="expense-card expense-filters">
  <div className="expense-filter-primary">
   <label><span>Month</span><input type="month" value={values.month} onChange={event=>set('month',event.target.value)}/></label>
   <label className="expense-search"><span>Search</span><div><Search/><input value={values.query} onChange={event=>set('query',event.target.value)} placeholder="Title, vendor or reference"/></div></label>
   <label><span>Category</span><select value={values.categoryId} onChange={event=>set('categoryId',event.target.value)}><option value="">All categories</option>{categories.filter(category=>category.is_active!==false).map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
   {tab==='expenses'?<label><span>Status</span><select value={values.status} onChange={event=>set('status',event.target.value)}><option value="all">Active records</option><option value="approved">Approved</option><option value="pending_review">Pending review</option><option value="rejected">Rejected</option></select></label>:<div className="expense-filter-fixed"><span>Status</span><strong>{tab==='approvals'?'Pending review':'Archived'}</strong></div>}
<div className="expense-filter-actions"><button type="button" className={advancedOpen?'active':''} onClick={onToggle} aria-expanded={advancedOpen}><SlidersHorizontal/> Filters{activeCount>0&&<b>{activeCount}</b>}</button><button type="button" className="expense-filter-clear" onClick={onClear} disabled={!activeCount}><X/> Clear all filters</button></div>
  </div>
  {advancedOpen&&<div className="expense-filter-advanced">
   <label><span>From date</span><input type="date" value={values.from} onChange={event=>set('from',event.target.value)}/></label>
   <label><span>To date</span><input type="date" value={values.to} onChange={event=>set('to',event.target.value)}/></label>
   <label><span>Minimum amount</span><input type="number" min="0" step="0.01" value={values.minAmount} onChange={event=>set('minAmount',event.target.value)} placeholder="No minimum"/></label>
   <label><span>Maximum amount</span><input type="number" min="0" step="0.01" value={values.maxAmount} onChange={event=>set('maxAmount',event.target.value)} placeholder="No maximum"/></label>
   <label><span>Vendor</span><input list="expense-vendors" value={values.vendor} onChange={event=>set('vendor',event.target.value)} placeholder="Any vendor"/><datalist id="expense-vendors">{(options.vendors||[]).map(vendor=><option key={vendor} value={vendor}/>)}</datalist></label>
   <label><span>Submitted by</span><select value={values.submitterId} onChange={event=>set('submitterId',event.target.value)}><option value="">Anyone</option>{(options.submitters||[]).map(person=><option key={person.id} value={person.id}>{person.name||`User #${person.id}`}</option>)}</select></label>
   <label><span>Reviewed by</span><select value={values.reviewerId} onChange={event=>set('reviewerId',event.target.value)}><option value="">Anyone</option>{(options.reviewers||[]).map(person=><option key={person.id} value={person.id}>{person.name||`User #${person.id}`}</option>)}</select></label>
   <label><span>Source</span><select value={values.source} onChange={event=>set('source',event.target.value)}><option value="">All sources</option><option value="manual">Manual entry</option><option value="recurring">Recurring</option><option value="cash_drop">Cash drop</option></select></label>
   <label><span>Receipt</span><select value={values.receiptState} onChange={event=>set('receiptState',event.target.value)}><option value="">Attached or missing</option><option value="attached">Attached</option><option value="missing">Missing</option></select></label>
   <label><span>Sort by</span><select value={values.sort} onChange={event=>set('sort',event.target.value)}><option value="expense_date">Expense date</option><option value="created_at">Created time</option><option value="title">Expense name</option><option value="category">Category</option><option value="submitter">Submitted by</option><option value="status">Status</option><option value="amount">Amount</option><option value="vendor">Vendor</option></select></label>
   <label><span>Direction</span><select value={values.direction} onChange={event=>set('direction',event.target.value)}><option value="desc">Newest / highest first</option><option value="asc">Oldest / lowest first</option></select></label>
  </div>}
 </section>
}
