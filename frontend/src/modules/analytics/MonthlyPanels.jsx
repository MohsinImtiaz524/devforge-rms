import { useEffect, useState } from 'react'
import { api, legacyUrl } from '../../api/client'
import { getShopCurrency } from '../../currency'
import './analytics.generated.css'

const months = Array.from({ length: 12 }, (_, index) => new Date(2000, index, 1).toLocaleString('en', { month: 'long' }))
const years = Array.from({ length: new Date().getFullYear() - 1898 }, (_, index) => new Date().getFullYear() + 1 - index)
const panel = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6'
const control = 'px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm disabled:opacity-50 focus-visible:outline focus-visible:outline-2'
const numeric = value => new Intl.NumberFormat('en', { maximumFractionDigits: 6 }).format(value)
const money = value => value === null ? 'Unavailable' : new Intl.NumberFormat('en', { style: 'currency', currency: getShopCurrency(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
const csvCell = value => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`

export function MonthlyPanels({ tab, selection, onSelectionChange, loadingFallback, moonPresentation = false }) {
  const [result, setResult] = useState({})
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ field: tab === 'tips' ? 'revenue' : 'quantity', direction: -1 })
  const [page, setPage] = useState(1)
  const ingredients = tab === 'ingredients'
  const tips = tab === 'tips'
  const formatMoney = tips ? value => new Intl.NumberFormat('en', { style: 'currency', currency: 'PKR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : money
  const columns = [['name', tips ? 'Served By' : ingredients ? 'Ingredient Name' : 'Product Name'], ['quantity', tips ? 'Tips Received' : ingredients ? 'Consumed' : 'Units Sold'], [ingredients ? 'cost' : 'revenue', tips ? 'Amount (PKR)' : ingredients ? 'Usage Cost' : 'Revenue']]
  const key = JSON.stringify([tab, selection, retry])
  const data = result.key === key ? result.data : null
  const error = result.key === key ? result.error : null
  useEffect(() => {
    const controller = new AbortController()
    api(`/api/analytics/${tips ? 'monthly-tips' : 'monthly'}?` + new URLSearchParams(selection), { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ key, data }) })
      .catch(error => {
        if (controller.signal.aborted) return
        if (error.status === 401) window.location.replace(legacyUrl('/'))
        else setResult({ key, error: error.message })
      })
    return () => controller.abort()
  }, [key, selection, tips])
  const rows = (data?.[tips ? 'tips' : ingredients ? 'ingredients' : 'products'] || [])
    .filter(row => row.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort.direction * (typeof a[sort.field] === 'string' ? a[sort.field].localeCompare(b[sort.field]) : (a[sort.field] ?? -Infinity) - (b[sort.field] ?? -Infinity)) || a.id - b.id)
  const pages = Math.max(1, Math.ceil(rows.length / 20))
  const currentPage = Math.min(page, pages)
  const k = data?.kpi
  const metrics = k ? tips ? [['Total Tips', formatMoney(k.totalTips)], ['Tips Received', numeric(k.tipsReceived)], ['Top Waiter', k.topRecipient || (k.totalTips > 0 ? 'No assigned waiter' : 'No tips')]] : ingredients ? [
    ['Total Ingredients Tracked', numeric(k.totalIngredients)], ['Total Consumption Cost', money(k.consumptionCost)],
    ['Most Consumed Ingredient', k.mostConsumed || 'No consumption'], ['Total Wastage Cost', money(k.wastageCost)],
  ] : [['Total Units Sold', numeric(k.totalUnits)], ['Total Sales Revenue', money(k.totalRevenue)], ['Best-Selling Product', k.bestProduct || 'No sales']] : []
  function exportRows() {
    const content = [[...columns.map(([, label]) => label), ...(ingredients ? ['Unit', 'Estimated'] : [])],
      ...rows.map(r => [r.name, r.quantity, ingredients ? r.cost ?? 'Unavailable' : r.revenue, ...(ingredients ? [r.unit, r.estimated ? 'Yes' : 'No'] : [])])]
      .map(row => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `${tab}-${selection.year}-${selection.month}.csv`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function change(field, value) { onSelectionChange({ ...selection, [field]: value }); setPage(1) }
  return <div className="space-y-6 text-slate-900 dark:text-slate-200">
    <div className={panel + ' flex flex-wrap items-center gap-3'}>
      {moonPresentation && <p className="am-date-scope">Monthly reporting &middot; {months[Number(selection.month) - 1]} {selection.year}{tips ? " | Collection date" : ingredients ? " | Consumption and wastage" : " | Before returns; excludes tax"}</p>}
      <label>Month <select aria-label="Month" className={control} value={selection.month} onChange={e => change('month', e.target.value)}>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
      <label>Year <select aria-label="Year" className={control + ' w-24'} value={selection.year} onChange={e => change('year', e.target.value)}>{years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
      <span className="text-xs text-slate-500">{data?.timezone || 'Business reporting time'}</span>
    </div>
    {error ? <div role="alert" className={panel}><p>{error}</p><button className={control} onClick={() => setRetry(v => v + 1)}>Retry</button></div> : !data ?
      (loadingFallback || <div role="status" aria-label="Loading monthly analytics" className="space-y-6"><div className={tips ? 'grid grid-cols-1 lg:grid-cols-3 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>{(tips ? [1, 2, 3] : [1, 2, 3, 4]).map(i => <div key={i} className={panel + ' h-24 animate-pulse'} />)}</div><div className={panel + ' h-80 animate-pulse'}>Loading monthly records…</div></div>) : <>
        <div className={tips ? 'grid grid-cols-1 lg:grid-cols-3 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>{metrics.map(([label, value]) => <div key={label} className={panel}><div className="text-xs font-bold text-slate-500">{label}</div><div className="text-2xl font-black mt-2 break-words">{value}</div></div>)}</div>
        {moonPresentation ? <details className="am-methodology"><summary>How this is calculated</summary><p className="text-xs text-slate-500">{tips ? 'Tips are counted once by collection date, including checkout and standalone collections. Tips are attributed to the waiter assigned to the order, not the cashier who collected payment. Missing waiter assignments appear as Unassigned. Collector and register records are unchanged.' : ingredients ? 'Consumption uses recorded FIFO quantities and costs. Older sales use current linked recipes and the latest batch cost available at the sale date (estimated). Quantities use stock units. Leaders are shown separately for incompatible measurement units. Waste includes recorded ingredient waste lines.' : 'Completed sales in the selected month. Revenue is after discounts and excludes tax. Units and revenue are before returns; this panel reports sales activity.'}{ingredients && data.unlinkedItems > 0 && ` ${data.unlinkedItems} sale lines have no usable recipe or ingredient consumption record.`}</p></details> : <p className="text-xs text-slate-500">{tips ? 'Tips are counted once by collection date, including checkout and standalone collections. Tips are attributed to the waiter assigned to the order, not the cashier who collected payment. Missing waiter assignments appear as Unassigned. Collector and register records are unchanged.' : ingredients ? 'Consumption uses recorded FIFO quantities and costs. Older sales use current linked recipes and the latest batch cost available at the sale date (estimated). Quantities use stock units. Leaders are shown separately for incompatible measurement units. Waste includes recorded ingredient waste lines.' : 'Completed sales in the selected month. Revenue is after discounts and excludes tax. Units and revenue are before returns; this panel reports sales activity.'}{ingredients && data.unlinkedItems > 0 && ` ${data.unlinkedItems} sale lines have no usable recipe or ingredient consumption record.`}</p>}
        <div className={panel}>
          <div className="flex flex-wrap items-center gap-3 mb-4"><label className="flex-1">Search <input className={control} type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder={tips ? 'Waiter name' : ingredients ? 'Ingredient name' : 'Product name'} /></label><button className={control} disabled={!rows.length} onClick={exportRows}>Export CSV</button></div>
          <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{columns.map(([field, label]) => <th key={field} className="py-3" aria-sort={sort.field === field ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button onClick={() => { setSort({ field, direction: sort.field === field ? -sort.direction : 1 }); setPage(1) }}>{label} {sort.field === field ? sort.direction === 1 ? '↑' : '↓' : '↕'}</button></th>)}</tr></thead>
            <tbody>{rows.slice((currentPage - 1) * 20, currentPage * 20).map(row => <tr key={row.id} className="border-t border-slate-200 dark:border-slate-800"><td className="py-3">{row.name}{row.estimated && <span className="text-xs text-slate-500"> (estimated)</span>}</td><td>{numeric(row.quantity)}{ingredients ? ` ${row.unit}` : ''}</td><td>{formatMoney(ingredients ? row.cost : row.revenue)}</td></tr>)}{!rows.length && <tr><td colSpan="3" className="py-8 text-center text-slate-500">{search ? 'No matching records.' : 'No records for this month.'}</td></tr>}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm"><span>{rows.length} records · Page {currentPage} of {pages}</span><div className="flex gap-2"><button className={control} disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button className={control} disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
        </div>
      </>}
  </div>
}
