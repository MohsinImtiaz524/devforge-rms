import {CalendarClock,FileSearch,History,RefreshCw} from 'lucide-react'
import {formatShopCurrency} from '../../../currency'

const dt=value=>value?new Date(value).toLocaleString():'—'
const day=value=>String(value||'').slice(0,10)||'—'
const actionLabel={recurring_created:'Created',recurring_updated:'Edited',recurring_pause:'Paused',recurring_resume:'Resumed',recurring_archive:'Archived',recurring_restore:'Restored'}

export default function RecurringDetails({data,loading,error,onRetry,onExpense}){
 if(loading)return <div className="expense-details-loading"><div/><div/><div/><div/></div>
 if(error)return <div className="expense-details-error" role="alert"><p>{error}</p><button onClick={onRetry}><RefreshCw/> Retry</button></div>
 if(!data)return null
 const {template,generated_expenses:generated=[],audit=[]}=data
 return <div className="recurring-details">
  <section className="expense-details-hero"><div><span className={'expense-status '+template.status}>{template.status}</span><h2>{template.title}</h2><p>{template.category_emoji||'•'} {template.category_name}</p></div><strong>{formatShopCurrency(template.amount)}</strong></section>
  <section><h3>Template schedule</h3><dl className="expense-details-grid"><div><dt>Frequency</dt><dd>{template.frequency}</dd></div><div><dt>Next occurrence</dt><dd>{day(template.next_run_date)}</dd></div><div><dt>Start date</dt><dd>{day(template.start_date)}</dd></div><div><dt>End date</dt><dd>{day(template.end_date)}</dd></div><div><dt>Vendor / payee</dt><dd>{template.vendor||'—'}</dd></div><div><dt>Reference</dt><dd>{template.reference_number||'—'}</dd></div><div><dt>Created by</dt><dd>{template.created_by_name||'System'}</dd></div><div><dt>Last updated</dt><dd>{dt(template.updated_at)}</dd></div><div><dt>Last attempted run</dt><dd>{dt(template.last_attempted_at)}</dd></div><div><dt>Last successful run</dt><dd>{dt(template.last_success_at)}</dd></div><div><dt>Consecutive failures</dt><dd>{Number(template.consecutive_failures||0)}</dd></div>{template.last_error&&<div className="wide"><dt>Last processing issue</dt><dd>{template.last_error}</dd></div>}{template.note&&<div className="wide"><dt>Note</dt><dd>{template.note}</dd></div>}</dl></section>
  <section><h3>Generated expenses ({generated.length})</h3>{generated.length?<div className="recurring-generated-list">{generated.map(expense=><button key={expense.id} type="button" onClick={()=>onExpense(expense)}><span><FileSearch/><span><strong>{day(expense.date)}</strong><small>{expense.status.replaceAll('_',' ')}</small></span></span><b>{formatShopCurrency(expense.amount)}</b></button>)}</div>:<div className="expense-audit-empty"><CalendarClock/><span>No expenses have been generated from this template yet.</span></div>}</section>
  <section><h3>Template history</h3>{audit.length?<ol className="expense-audit-timeline">{audit.map(event=><li key={event.id}><span className={'expense-audit-marker '+event.action}><History/></span><div><header><strong>{actionLabel[event.action]||event.action.replaceAll('_',' ')}</strong><time>{dt(event.created_at)}</time></header><p>{event.action==='recurring_updated'?'Template schedule or details were changed.':'Template was '+(actionLabel[event.action]||event.action).toLowerCase()+'.'}</p><small>By {event.actor_name||event.actor_username||'System'}</small></div></li>)}</ol>:<div className="expense-audit-empty"><History/><span>No template history is available.</span></div>}</section>
 </div>
}