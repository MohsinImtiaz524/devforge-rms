// Additive initialization only; called in a startup/deployment transaction.
async function ensureWebsiteSchema(db) {
  if (!await db.schema.hasTable('moon_websites')) await db.schema.createTable('moon_websites', t => {
    t.increments('id'); t.integer('shop_id').notNullable().unique().references('id').inTable('shops').onDelete('RESTRICT');
    t.string('subdomain',50).notNullable().unique(); t.text('draft_json').notNullable();
    t.integer('revision').notNullable().defaultTo(1); t.integer('published_revision').nullable();
    t.boolean('is_published').notNullable().defaultTo(false); t.timestamp('last_published_at');
    t.timestamp('updated_at').notNullable().defaultTo(db.fn.now()); t.unique(['shop_id','id']); t.check('revision > 0');
  });
  if (!await db.schema.hasTable('moon_website_versions')) await db.schema.createTable('moon_website_versions', t => {
    t.increments('id'); t.integer('shop_id').notNullable(); t.integer('website_id').notNullable();
    t.foreign(['shop_id','website_id']).references(['shop_id','id']).inTable('moon_websites').onDelete('RESTRICT');
    t.integer('revision').notNullable(); t.text('configuration_json').notNullable();
    t.integer('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now()); t.unique(['shop_id','website_id','revision']);
  });
  if (!await db.schema.hasTable('moon_website_assets')) await db.schema.createTable('moon_website_assets', t => {
    t.uuid('id').primary(); t.integer('shop_id').notNullable().references('id').inTable('shops').onDelete('RESTRICT');
    t.string('storage_key',180).notNullable().unique(); t.string('mime',30).notNullable(); t.integer('size').notNullable();
    t.string('checksum',64).notNullable(); t.integer('width').notNullable(); t.integer('height').notNullable();
    t.integer('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL'); t.timestamp('created_at').notNullable().defaultTo(db.fn.now()); t.index(['shop_id']);
  });
  if (!await db.schema.hasTable('moon_website_events')) await db.schema.createTable('moon_website_events', t => {
    t.increments('id'); t.integer('shop_id').notNullable(); t.integer('website_id').notNullable();
    t.foreign(['shop_id','website_id']).references(['shop_id','id']).inTable('moon_websites').onDelete('RESTRICT');
    t.integer('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('action',20).notNullable(); t.integer('revision').notNullable(); t.timestamp('created_at').notNullable().defaultTo(db.fn.now()); t.index(['shop_id','website_id','created_at']);
  });
}
// Add Website Moon access once for existing standard shop owners. Never reseed
// custom roles or restore permissions that an owner later explicitly revokes.
async function ensureWebsiteOwnerPermissions(db) {
  for(const table of ['roles','permissions','role_permissions','user_roles','users'])if(!await db.schema.hasTable(table))return;
  if(!await db.schema.hasTable('moon_website_owner_grants'))await db.schema.createTable('moon_website_owner_grants',t=>{
    t.integer('role_id').primary().references('id').inTable('roles').onDelete('CASCADE');
    t.integer('shop_id').notNullable().references('id').inTable('shops').onDelete('RESTRICT');
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now());
  });
  const permissions=await db('permissions').whereIn('key',['website.view','website.edit','website.publish']).select('id');
  if(permissions.length!==3)return;
  const roles=await db('roles as r').join('user_roles as ur','ur.role_id','r.id').join('users as u','u.id','ur.user_id')
    .where('r.is_system',true).whereIn('r.name',['Admin','Restaurant Admin']).where('u.role','admin').whereRaw('u.shop_id = r.shop_id')
    .whereNotExists(function(){this.select(db.raw('1')).from('moon_website_owner_grants as g').whereRaw('g.role_id = r.id');})
    .distinct('r.id','r.shop_id');
  for(const role of roles){
    const existing=await db('role_permissions').where({role_id:role.id}).whereIn('permission_id',permissions.map(p=>p.id)).first();
    // Any existing Website Moon permission choice is already authoritative.
    if(!existing)await db('role_permissions').insert(permissions.map(p=>({role_id:role.id,permission_id:p.id}))).onConflict(['role_id','permission_id']).ignore();
    await db('moon_website_owner_grants').insert({role_id:role.id,shop_id:role.shop_id}).onConflict('role_id').ignore();
  }
}
module.exports = { ensureWebsiteSchema, ensureWebsiteOwnerPermissions };
