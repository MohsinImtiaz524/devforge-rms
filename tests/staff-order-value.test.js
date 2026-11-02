const test=require('node:test'),assert=require('node:assert/strict'),knex=require('knex');
const {orderMetrics}=require('../src/modules/staff-activity/staff-activity.orders');
test('staff order values credit only creators, sum equal bills and isolate shops/dates',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
  await db.schema.createTable('sales',t=>{t.integer('id').primary();t.integer('shop_id');t.integer('user_id');t.integer('waiter_id');t.integer('rider_id');t.integer('kitchen_id');t.decimal('total',14,2);t.string('created_at');});
  const rows=[];
  for(let i=0;i<500;i++)rows.push({id:i+1,shop_id:1,user_id:1,waiter_id:4,rider_id:5,kitchen_id:6,total:200,created_at:'2026-11-02 12:00:00'});
  for(let i=0;i<300;i++)rows.push({id:i+501,shop_id:1,user_id:2,waiter_id:1,rider_id:7,total:i<200?200:300,created_at:'2026-11-02 23:59:59'});
  rows.push({id:801,shop_id:1,user_id:3,waiter_id:4,total:500,created_at:'2026-11-01 00:00:00'}, {id:802,shop_id:1,user_id:3,waiter_id:4,total:500,created_at:'2026-11-02 15:00:00'});
  rows.push({id:803,shop_id:2,user_id:1,total:999999,created_at:'2026-11-02 12:00:00'}, {id:804,shop_id:1,user_id:1,total:999999,created_at:'2026-10-31 23:59:59'}, {id:805,shop_id:1,user_id:1,total:999999,created_at:'2026-11-03 00:00:00'}, {id:806,shop_id:1,waiter_id:4,rider_id:5,kitchen_id:6,total:100,created_at:'2026-11-02 12:00:00'});
  await db.batchInsert('sales',rows,50);
  const result=await orderMetrics(db,1,{from:'2026-11-01',to:'2026-11-02'}).orderBy('user_id');
  assert.deepEqual(result.map(row=>[row.user_id,Number(row.orders_handled),Number(row.orders_total)]),[[1,500,100000],[2,300,70000],[3,2,1000]]);
  assert.ok(!result.some(row=>[4,5,6,7].includes(row.user_id)),'Assigned staff do not receive creator order credit');
  assert.deepEqual(await orderMetrics(db,3,{from:'2026-11-01',to:'2026-11-02'}),[]);
  const other=await orderMetrics(db,2,{from:'2026-11-01',to:'2026-11-02'});assert.equal(Number(other[0].orders_total),999999);
 }finally{await db.destroy();}
});
