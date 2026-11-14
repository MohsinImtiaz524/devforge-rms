export const can = (user, permission) => user?.role === 'superadmin' || user?.permissions?.includes(permission)
export const serviceLabel = type => ({dine_in:'Dine-in',takeaway:'Takeaway',walk_in:'Walk-in',delivery:'Delivery'})[type] || type
export function orderStatusLabel(order, retail = false) {
  if ((retail && !['completed','cancelled'].includes(order.order_status)) || (order.order_type === 'walk_in' && order.order_status === 'payment_pending')) return 'Saved'
  if (order.order_status === 'preparing') return 'In Progress'
  if (order.order_type === 'takeaway' && order.order_status === 'ready') return 'Ready for pickup'
  if (order.order_type === 'takeaway' && order.order_status === 'served') return 'Handed over'
  return String(order.order_status || 'pending').replaceAll('_',' ').replace(/\b\w/g, letter=>letter.toUpperCase())
}
export function relativeOrderTime(value) {
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000))
  if(seconds<60)return 'Just now'
  const minutes=Math.floor(seconds/60)
  if(minutes<60)return `${minutes} minute${minutes===1?'':'s'} ago`
  const hours=Math.floor(minutes/60)
  if(hours<24)return `${hours} hour${hours===1?'':'s'} ago`
  const days=Math.floor(hours/24)
  return `${days} day${days===1?'':'s'} ago`
}
export const filterOrders = (orders,type,search,options) => {
  const query=String(search||'').trim().toLowerCase().replace(/^#/, '')
  const rows=orders.filter(order=>{
    const status=order.order_status||'pending'
    const completedActiveShifts=options?.status==='completed_active_shifts'
    if(status==='completed'&&!completedActiveShifts)return false
    const statusMatches=completedActiveShifts
      ? status==='completed'&&order.order_shift_status==='open'
      : options?.status==='all'||(options?.status&&options.status!=='active'?(options.status==='payment_pending'&&options.savedShop?!['completed','cancelled'].includes(status):status===options.status):options? !['completed','cancelled'].includes(status):status!=='completed')
    const searchable=options?[order.order_number||order.id,order.table_number,order.customer_name,order.customer_phone,order.delivery_address,order.waiter_name].join(' ').toLowerCase():String(order.order_number||order.id)
    return statusMatches&&(!type||order.order_type===type)&&(!options?.table||String(order.table_id)===String(options.table))&&(!query||searchable.includes(query))
  })
  return options?rows:rows.slice(0,50)
}
export const canServe = (user,order) => ['dine_in','takeaway'].includes(order.order_type)&&order.order_status==='ready'&&(Number(order.user_id)===Number(user?.id)||Number(order.waiter_id)===Number(user?.id)||user?.role==='receptionist')
export const isRetailCompletion = (user,order) => order.order_type==='walk_in'||(user?.shop_type==='retail'&&order.order_status==='payment_pending')
export const completionPath = (user,order) => isRetailCompletion(user,order)?'/api/sales/'+order.id+'/complete':'/api/kds/'+order.id+'/status'
export const tipOrderContext = order => order.order_type==='dine_in'?`Table ${order.table_number||'N/A'}`:`${order.order_type==='delivery'?'Delivery':'Takeaway'}${order.customer_name?' · '+order.customer_name:''}`
export const validTip = amount => Number.isFinite(amount)&&amount>0&&Math.abs(amount*100-Math.round(amount*100))<=.00001
export function karachiToday() {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
