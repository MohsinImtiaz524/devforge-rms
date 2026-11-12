const serviceRole = person => ['waiter','order_taker'].includes(String(person?.role||'').toLowerCase())
const active = person => String(person?.status||'active').toLowerCase()==='active'
export function orderTakerCandidates(user,staff,type){
  return [user,...staff.filter(person=>Number(person.id)!==Number(user?.id))].filter(person=>person&&active(person)&&(type!=='takeaway'||Number(person.id)===Number(user?.id)||serviceRole(person)))
}
export function orderTakerId(user,candidates,value,type){
  if(!value)return null
  const person=candidates.find(person=>Number(person.id)===Number(value))
  if(!person)throw new Error('Select an active order taker from this shop')
  // The existing API records the signed-in creator separately from waiter_id.
  if(type==='takeaway'&&!serviceRole(person)){
    if(Number(person.id)===Number(user.id))return null
    throw new Error('Takeaway assignments require an active waiter or order taker')
  }
  return Number(person.id)
}
