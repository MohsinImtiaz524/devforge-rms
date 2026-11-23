async function assertOrderAssignment(db, shopId, orderType, waiterId) {
  if (!waiterId || !['dine_in','takeaway','delivery','foodpanda'].includes(orderType)) return;
  const member = await db('users').where({ id: waiterId, shop_id: shopId }).first('role','status');
  const roles = orderType === 'delivery' ? ['waiter','order_taker','rider'] : ['waiter','order_taker'];
  if (!member || !roles.includes(String(member.role || '').toLowerCase()) || String(member.status || 'active').toLowerCase() !== 'active') {
    throw Object.assign(new Error('Select an active order taker from this shop'), {status:400});
  }
}
module.exports = { assertOrderAssignment };
