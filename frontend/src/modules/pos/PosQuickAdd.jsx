import { Search, ScanLine, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatShopCurrency as money } from '../../currency'
import { isRecipeProduct, menuVariants, parseList } from './pos.logic'

const expired = record => {
  const value = record?.expiry_date || record?.expires_at || record?.expiration_date
  if (!value) return false
  const expiry = new Date(String(value).slice(0,10)+'T23:59:59')
  return Number.isFinite(expiry.getTime()) && expiry.getTime()<Date.now()
}

export default function PosQuickAdd({ add, notify, query, onQueryChange, loadMenu }) {
  const [results,setResults] = useState([]), [status,setStatus] = useState('')
  const input = useRef(null), request = useRef(0)
  useEffect(()=>{const shortcut=event=>{if(event.key==='F2'){event.preventDefault();input.current?.focus()}};addEventListener('keydown',shortcut);return()=>removeEventListener('keydown',shortcut)},[])
  useEffect(()=>{input.current?.focus()},[])
  function clear() { request.current++; onQueryChange(''); setResults([]); setStatus(''); input.current?.focus() }
  function choose({product,variant}) {
    const recipe = isRecipeProduct(product)
    if (expired(product) || expired(variant)) return notify('This product or variant has expired','error')
    if (parseList(product.components).length) return notify('This product requires detailed configuration','error')
    const batches = parseList(product.batches).filter(batch=>Number(batch.quantity)>0&&!expired(batch))
    if (!recipe && !variant && parseList(product.batches).length && !batches.length) return notify('All available batches for this product have expired','error')
    const stock = recipe ? Infinity : Number(variant?.stock ?? product.stock ?? 0)
    const price = Number(variant?.price ?? variant?.selling_price ?? product.selling_price)
    if (stock<=0) return notify('This product or variant is out of stock','error')
    if (!Number.isFinite(price)||price<=0) return notify('This product does not have a valid selling price','error')
    add({product,product_id:product.id,name:product.name,quantity:1,selling_price:price,batch_id:batches[0]?.id||parseList(product.batches)[0]?.id||null,
      stock_variant_id:!recipe&&variant?Number(variant.id):null,
      variants:variant?[{id:variant.id,name:variant.name||variant.variant_name,price}]:null})
    clear()
  }
  async function search(value,submit=false) {
    const id=++request.current
    if (!value.trim()) return
    setStatus('Searching...')
    try {
      const rows=await loadMenu(value)
      if(id!==request.current)return
      const entries=(Array.isArray(rows?.items)?rows.items:[]).flatMap(product=>{
        const variants=menuVariants(product)
        return variants.length?variants.map(variant=>({product,variant})):[{product,variant:null}]
      })
      const normalized=value.trim().toLowerCase()
      const barcode=entries.filter(({product,variant})=>[variant?.barcode,product.barcode].some(code=>code&&String(code).trim().toLowerCase()===normalized))
      const exact=entries.filter(({product,variant})=>[variant?.barcode,variant?.sku,product.barcode,product.sku].some(code=>code&&String(code).toLowerCase()===normalized))
      if(!submit&&barcode.length===1)return choose(barcode[0])
      if(submit&&(exact.length===1||entries.length===1))return choose(exact.length===1?exact[0]:entries[0])
      setResults(entries);setStatus(entries.length?'':'No matching product or variant')
    } catch(error) { if(id===request.current){setResults([]);setStatus(error.message);notify(error.message,'error')} }
  }
  useEffect(()=>{
    const requestToken=request
    const timer=setTimeout(()=>{if(query.trim())search(query)},180)
    return()=>{clearTimeout(timer);requestToken.current++}
    // Search runs for the current input; events use the latest add/notify callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[query,loadMenu])
  return <div className="pos-quick-add pos-unified-search"><Search className="pos-search-icon" size={18}/><label className="pos-search-label"><span className="sr-only">Search products or variants</span><input aria-label="Search products or variants" ref={input} value={query} placeholder="Search name, SKU, barcode or scan QR" onChange={event=>{request.current++;onQueryChange(event.target.value);setResults([]);setStatus('')}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();search(query,true)}if(event.key==='Escape')clear();if(event.key==='ArrowDown'){event.preventDefault();event.currentTarget.closest('.pos-quick-add').querySelector('[role=option]:not(:disabled)')?.focus()}}}/></label><kbd className="pos-search-key">F2</kbd><button type="button" className="pos-scan-button" aria-label="Focus barcode scanner input" title="Scan a barcode using your connected scanner" onClick={()=>input.current?.focus()}><ScanLine size={19}/></button>{query&&<button className="pos-quick-clear" onClick={clear} aria-label="Clear product search"><X size={16}/></button>}{query&&(results.length>0||status)&&<div className="pos-quick-results" role="listbox" aria-label="Quick-add search results">{results.map(({product,variant})=><button role="option" aria-selected="false" type="button" key={product.id+'-'+(variant?.id||'base')} disabled={!isRecipeProduct(product)&&Number(variant?.stock??product.stock??0)<=0} onClick={()=>choose({product,variant})}><span>{product.name}{variant?' - '+(variant.name||variant.variant_name):''}</span><b>{money(variant?.price??product.selling_price,{style:'decimal'})}</b></button>)}{status&&<p role="status">{status}</p>}</div>}</div>
}
