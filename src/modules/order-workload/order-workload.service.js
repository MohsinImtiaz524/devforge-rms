const ACTIVE_STATUSES = ['pending','preparing','ready','served','payment_pending'];
async function getOrderWorkload(db, shopId) {
  const orders = db('sales').where({shop_id:shopId}).whereIn('order_status',ACTIVE_STATUSES)
    .select(db.raw('COALESCE(waiter_id, user_id) AS assigned_user_id')).count({active_orders:'*'})
    .groupByRaw('COALESCE(waiter_id, user_id)').as('orders');
  const deliveries = db('sales').where({shop_id:shopId,order_type:'delivery'}).whereIn('order_status',ACTIVE_STATUSES)
    .select('rider_id').count({active_deliveries:'*'}).groupBy('rider_id').as('deliveries');
  const rows = await db('users as u').where({'u.shop_id':shopId}).whereNot('u.role','superadmin')
    .where(function(){this.whereNull('u.status').orWhere('u.status','active')})
    .leftJoin(orders,'orders.assigned_user_id','u.id').leftJoin(deliveries,'deliveries.rider_id','u.id')
    .select('u.id as user_id',db.raw('COALESCE(orders.active_orders,0) AS active_orders'),db.raw('COALESCE(deliveries.active_deliveries,0) AS active_deliveries'))
    .orderBy('u.id');
  return {members:rows.map(row=>({user_id:Number(row.user_id),active_orders:Number(row.active_orders),active_deliveries:Number(row.active_deliveries)})),updated_at:new Date().toISOString()};
}
module.exports={getOrderWorkload,ACTIVE_STATUSES};
