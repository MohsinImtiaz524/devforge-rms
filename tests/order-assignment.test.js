const test=require('node:test'),assert=require('node:assert/strict');
const {assertOrderAssignment}=require('../utils/assert-order-assignment');
test('order assignment validates service roles, active status, and shop ownership',async t=>{
 const db=require('knex')({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});t.after(()=>db.destroy());
 await db.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');t.text('role');t.text('status')});
 await db('users').insert([{id:1,shop_id:1,role:'waiter',status:'active'},{id:2,shop_id:1,role:'order_taker',status:null},{id:3,shop_id:1,role:'rider',status:'active'},{id:4,shop_id:1,role:'waiter',status:'inactive'},{id:5,shop_id:2,role:'waiter',status:'active'},{id:6,shop_id:1,role:'admin',status:'active'}]);
 for(const type of ['dine_in','takeaway','delivery']){for(const id of [1,2])await assertOrderAssignment(db,1,type,id);for(const id of [4,5,6,999])await assert.rejects(assertOrderAssignment(db,1,type,id),/active order taker/);await assertOrderAssignment(db,1,type,null)}
 for(const type of ['dine_in','takeaway'])await assert.rejects(assertOrderAssignment(db,1,type,3),/active order taker/);
 await assertOrderAssignment(db,1,'delivery',3);
 assert.equal(await db('users').count('* as total').first().then(row=>row.total),6);
});
