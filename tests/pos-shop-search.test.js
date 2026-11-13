const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const db=require('knex')({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
require.cache[require.resolve('../db/knex')]={exports:db};
const service=require('../services/ProductService');
test('POS product-only search excludes variant matches; retail and existing product screens retain them',async t=>{
 t.after(()=>db.destroy());
 await db.schema.createTable('customer_ledger',t=>{t.increments('id');t.integer('sale_id');t.integer('shop_id');t.integer('customer_id');t.integer('shift_id');t.text('type');t.decimal('amount')});
 await db.schema.createTable('customers',t=>{t.increments('id');t.integer('shop_id');t.text('name');t.decimal('current_balance')});
 const c=await db.client.acquireConnection();try{c.exec(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8'))}finally{db.client.releaseConnection(c)}
 const columns={products:{product_type:'text',is_component:'integer',variants_config:'text',addons_config:'text',updated_at:'text'},raw_stocks:{usage_unit:'text',conversion_factor:'numeric'},product_compositions:{custom_name:'text'}};
 for(const [table,fields]of Object.entries(columns))for(const [name,type]of Object.entries(fields))if(!await db.schema.hasColumn(table,name))await db.schema.alterTable(table,t=>t.specificType(name,type));
 await db.raw('PRAGMA foreign_keys = OFF');
 await db('products').insert([{id:1,shop_id:1,user_id:1,brand_id:1,sku:'MEAL',name:'Burger',category:'Food',selling_price:100,stock:10,product_type:'stock_based'},{id:2,shop_id:2,user_id:2,brand_id:2,sku:'OTHER',name:'Other shop',category:'Food',selling_price:100,stock:10,product_type:'stock_based'}]);
 await db('product_stock_variants').insert([{id:1,shop_id:1,product_id:1,name:'Jumbo',sku:'JUMBO-1',barcode:'987654',selling_price:150,stock:10,is_active:true,is_on_menu:true},{id:2,shop_id:2,product_id:2,name:'Jumbo',sku:'JUMBO-2',barcode:'987655',selling_price:200,stock:10,is_active:true,is_on_menu:true}]);
 const find=(search,searchVariants)=>service.getAllProducts(1,{paginate:true,search,searchVariants,menuOnly:true,includeBrandName:false,excludeBatches:true});
 for(const term of ['Jumbo','JUMBO-1','987654']){
   assert.equal((await find(term,false)).items.length,0);
   assert.deepEqual((await find(term,true)).items.map(p=>p.id),[1]);
   assert.deepEqual((await find(term,undefined)).items.map(p=>p.id),[1]);
 }
 assert.deepEqual((await find('Burger',false)).items.map(p=>p.id),[1]);
 assert.deepEqual((await find('MEAL',false)).items.map(p=>p.id),[1]);
 assert.equal((await find('987655',true)).items.length,0);
 assert.equal((await find('',false)).pagination.total,1);
});
