const test=require('node:test'),assert=require('node:assert/strict'),knex=require('knex'),express=require('express');
const {getOrderWorkload}=require('../src/modules/order-workload/order-workload.service');
const {createOrderWorkloadRouter}=require('../src/modules/order-workload/order-workload.routes');
const {enforceApiPermissions}=require('../authorization/api-policy');
test('workload aggregates active assignments, isolates tenants and protects HTTP reads',async t=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 let server;try{
 await db.schema.createTable('users',x=>{x.integer('id').primary();x.integer('shop_id');x.string('role');x.string('status')});
 await db.schema.createTable('sales',x=>{x.increments('id');x.integer('shop_id');x.integer('user_id');x.integer('waiter_id');x.integer('rider_id');x.string('order_type');x.string('order_status')});
 await db('users').insert([{id:1,shop_id:1,role:'cashier',status:'active'},{id:2,shop_id:1,role:'waiter',status:'active'},{id:3,shop_id:1,role:'rider',status:null},{id:4,shop_id:1,role:'order_taker',status:'inactive'},{id:5,shop_id:1,role:'waiter',status:'active'},{id:99,shop_id:2,role:'waiter',status:'active'}]);
 const row=(status,changes={})=>({shop_id:1,user_id:1,waiter_id:2,rider_id:null,order_type:'takeaway',order_status:status,...changes});
 await db('sales').insert([row('pending'),row('preparing'),row('served'),row('completed'),row('cancelled'),row('ready',{waiter_id:null,rider_id:3,order_type:'delivery'}),row('completed',{waiter_id:null,rider_id:3,order_type:'delivery'}),row('payment_pending',{waiter_id:null}),row('pending',{waiter_id:4}),row('pending',{shop_id:2,user_id:99,rider_id:3,order_type:'delivery'}),row('pending',{waiter_id:99})]);
 await t.test('counts each active assignment once with creator fallback and rider delivery totals',async()=>{
  const result=await getOrderWorkload(db,1);assert.deepEqual(result.members,[{user_id:1,active_orders:2,active_deliveries:0},{user_id:2,active_orders:3,active_deliveries:0},{user_id:3,active_orders:0,active_deliveries:1},{user_id:5,active_orders:0,active_deliveries:0}]);
  const repeats=await Promise.all([getOrderWorkload(db,1),getOrderWorkload(db,1)]);assert.deepEqual(repeats[0].members,repeats[1].members);assert.equal((await db('sales')).length,11);
  assert.deepEqual((await getOrderWorkload(db,3)).members,[]);assert.deepEqual((await getOrderWorkload(db,2)).members,[{user_id:99,active_orders:0,active_deliveries:0}]);
 });
 const app=express();app.use((req,res,next)=>{req.session={};if(req.headers['x-user'])req.session.user=JSON.parse(req.headers['x-user']);req.permissions=JSON.parse(req.headers['x-permissions']||'[]');next()});app.use(enforceApiPermissions);app.use('/api/order-workload',createOrderWorkloadRouter({db}));app.use((error,req,res,next)=>res.status(500).json({error:'Workload unavailable'}));
 server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance))});
 const request=(user,permissions=[],query='')=>fetch('http://127.0.0.1:'+server.address().port+'/api/order-workload'+query,{headers:{...(user?{'x-user':JSON.stringify(user)}:{}),'x-permissions':JSON.stringify(permissions)}});
 await t.test('requires authentication, assignment permission and a valid session shop',async()=>{
  assert.equal((await request(null)).status,401);assert.equal((await request({id:1,shop_id:1})).status,403);assert.equal((await request({id:1,shop_id:null},['orders.create'])).status,403);assert.equal((await request({id:1,shop_id:'invalid'},['orders.create'])).status,403);
 });
 await t.test('cashier receives totals without order details and cannot override tenant via query',async()=>{
  const response=await request({id:1,role:'cashier',shop_id:1},['orders.create'],'?shop_id=2');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.members.length,4);assert.equal(body.members[1].active_orders,3);assert.deepEqual(Object.keys(body.members[0]).sort(),['active_deliveries','active_orders','user_id']);
  assert.equal((await request({id:1,shop_id:1},['orders.update'])).status,200);
 });
 await t.test('completed/reassigned orders update totals and database errors reach error handling',async()=>{
  await db('sales').where({id:1,shop_id:1}).update({waiter_id:5});assert.equal((await getOrderWorkload(db,1)).members.find(x=>x.user_id===5).active_orders,1);
  await db('sales').where({id:1,shop_id:1}).update({order_status:'completed'});assert.equal((await getOrderWorkload(db,1)).members.find(x=>x.user_id===5).active_orders,0);
  await db.schema.dropTable('sales');assert.equal((await request({id:1,shop_id:1},['orders.create'])).status,500);
 });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.destroy()}
});
