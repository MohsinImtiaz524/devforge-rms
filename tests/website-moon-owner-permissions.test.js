const test=require('node:test'),assert=require('node:assert/strict'),knex=require('knex');
const {ensureWebsiteOwnerPermissions}=require('../src/modules/moons/website/website.migration');
test('Website Moon owner permission upgrade is scoped, one-time and respects existing choices',async()=>{
 const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
 try{
  await db.schema.createTable('shops',t=>t.integer('id').primary());
  await db.schema.createTable('users',t=>{t.integer('id').primary();t.integer('shop_id');t.string('role');});
  await db.schema.createTable('roles',t=>{t.integer('id').primary();t.integer('shop_id');t.string('name');t.boolean('is_system');});
  await db.schema.createTable('permissions',t=>{t.integer('id').primary();t.string('key');});
  await db.schema.createTable('role_permissions',t=>{t.integer('role_id');t.integer('permission_id');t.primary(['role_id','permission_id']);});
  await db.schema.createTable('user_roles',t=>{t.integer('user_id');t.integer('role_id');});
  await db('shops').insert([{id:1},{id:2}]);await db('permissions').insert([{id:1,key:'website.view'},{id:2,key:'website.edit'},{id:3,key:'website.publish'},{id:4,key:'orders.view'}]);
  await db('roles').insert([{id:1,shop_id:1,name:'Admin',is_system:true},{id:2,shop_id:1,name:'Custom owner',is_system:false},{id:3,shop_id:1,name:'Restaurant Admin',is_system:true},{id:4,shop_id:2,name:'Admin',is_system:true}]);
  await db('users').insert([{id:1,shop_id:1,role:'admin'},{id:2,shop_id:1,role:'admin'},{id:3,shop_id:1,role:'admin'},{id:4,shop_id:1,role:'admin'}]);await db('user_roles').insert([{user_id:1,role_id:1},{user_id:2,role_id:2},{user_id:3,role_id:3},{user_id:4,role_id:4}]);
  await db('role_permissions').insert([{role_id:1,permission_id:4},{role_id:3,permission_id:1}]);
  await db.transaction(ensureWebsiteOwnerPermissions);
  assert.deepEqual((await db('role_permissions').where({role_id:1}).orderBy('permission_id').pluck('permission_id')),[1,2,3,4]);
  assert.equal((await db('role_permissions').where({role_id:2})).length,0);assert.deepEqual(await db('role_permissions').where({role_id:3}).pluck('permission_id'),[1]);assert.equal((await db('role_permissions').where({role_id:4})).length,0);
  await db('role_permissions').where({role_id:1,permission_id:3}).del();await db.transaction(ensureWebsiteOwnerPermissions);
  assert.deepEqual(await db('role_permissions').where({role_id:1}).orderBy('permission_id').pluck('permission_id'),[1,2,4]);assert.equal((await db('moon_website_owner_grants')).length,2);
 }finally{await db.destroy();}
});
