// Attribute order count and full bill value only to the account that created it.
// Keep orders_handled as the API field name for compatibility with report clients.
function orderMetrics(db,shop,filters) {
  const exclusiveEnd=new Date(filters.to+'T00:00:00Z');
  exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate()+1);
  return db('sales').select('shop_id','user_id')
    .where('shop_id',shop).whereNotNull('user_id')
    .where('created_at','>=',filters.from)
    .where('created_at','<',exclusiveEnd.toISOString().slice(0,10))
    .select(db.raw('CAST(COUNT(id) AS INTEGER) AS orders_handled'))
    .sum({orders_total:'total'}).groupBy('shop_id','user_id');
}
module.exports={orderMetrics};
