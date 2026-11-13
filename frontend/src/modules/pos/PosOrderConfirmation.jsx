import { useEffect } from 'react'
import { CircleCheck } from 'lucide-react'
import { formatShopCurrency as money } from '../../currency'

export default function PosOrderConfirmation({result,dismiss}) {
  useEffect(()=>{const timer=setTimeout(dismiss,3000);return()=>clearTimeout(timer)},[result,dismiss])
  const title=result.updated?'Order updated':result.status==='completed'?'Order completed':result.saved?'Order saved':'Order placed'
  return <div className="rms-order-confirmation" role="status" aria-live="polite" aria-atomic="true"><span className="rms-confirmation-icon" aria-hidden="true"><CircleCheck size={25} strokeWidth={1.8}/></span><div className="rms-confirmation-copy"><strong>{title}</strong><span>Order #{result.number||result.id}{Number.isFinite(Number(result.total))&&<> &middot; {money(result.total)}</>}</span>{result.token&&<small>Token: {result.token}</small>}{result.detail&&<small>{result.detail}</small>}</div><span className="rms-confirmation-progress" aria-hidden="true"/></div>
}
