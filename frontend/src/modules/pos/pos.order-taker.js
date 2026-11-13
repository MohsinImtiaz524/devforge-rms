const serviceRole = person => ['waiter','order_taker'].includes(String(person?.role||'').toLowerCase())
const active = person => String(person?.status||'active').toLowerCase()==='active'
export const canAssignOrderTaker = user => ['admin','superadmin','owner','cashier','pos_user'].includes(String(user?.role||'').toLowerCase())
export function orderTakerCandidates(user,staff,type){
  return [user,...staff.filter(person=>Number(person.id)!==Number(user?.id))].filter(person=>person&&active(person)&&(serviceRole(person)||(type==='delivery'&&String(person.role).toLowerCase()==='rider')))
}
export function orderTakerId(user,candidates,value,type){
  if(!value)return null
  const person=candidates.find(person=>Number(person.id)===Number(value))
  if(!person||!active(person)||(!serviceRole(person)&&!(type==='delivery'&&String(person.role).toLowerCase()==='rider')))throw new Error('Select an active order taker from this shop')
  return Number(person.id)
}
