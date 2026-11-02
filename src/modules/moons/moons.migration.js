const { REGISTRY } = require('./moons.registry');
// Run in a startup/deployment transaction, never on a request.
async function ensureMoonsSchema(db) {
  if (!await db.schema.hasTable('moon_catalog')) await db.schema.createTable('moon_catalog', t => {
    t.increments('id'); t.string('key',60).notNullable().unique(); t.string('name',100).notNullable();
    t.string('summary',240).notNullable(); t.text('description').notNullable().defaultTo('');
    t.string('category',30).notNullable().defaultTo('other'); t.string('status',20).notNullable().defaultTo('draft');
    t.integer('sort_order').notNullable().defaultTo(0); t.integer('version').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now()); t.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
    t.check("status IN ('draft','published','archived')"); t.check('version >= 0'); t.index(['status','sort_order']);
  });
  if (!await db.schema.hasTable('moon_prices')) await db.schema.createTable('moon_prices', t => {
    t.increments('id'); t.integer('moon_id').notNullable().references('id').inTable('moon_catalog').onDelete('RESTRICT');
    t.string('currency',3).notNullable(); t.bigInteger('monthly_amount_minor').notNullable();
    t.integer('catalog_version').notNullable(); t.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now()); t.unique(['moon_id','catalog_version']); t.unique(['moon_id','id']);
    t.check('monthly_amount_minor >= 0 AND monthly_amount_minor <= 100000000'); t.index(['moon_id','id']);
  });
  if (!await db.schema.hasTable('moon_catalog_events')) await db.schema.createTable('moon_catalog_events', t => {
    t.increments('id'); t.integer('moon_id').notNullable().references('id').inTable('moon_catalog').onDelete('RESTRICT');
    t.integer('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL'); t.string('action',30).notNullable();
    t.integer('version').notNullable(); t.text('details_json').notNullable(); t.timestamp('created_at').notNullable().defaultTo(db.fn.now());
    t.unique(['moon_id','version']);
  });
  if (!await db.schema.hasTable('shop_moon_subscriptions')) await db.schema.createTable('shop_moon_subscriptions', t => {
    t.increments('id'); t.integer('shop_id').notNullable().references('id').inTable('shops').onDelete('RESTRICT');
    t.integer('moon_id').notNullable().references('id').inTable('moon_catalog').onDelete('RESTRICT');
    t.string('state',20).notNullable().defaultTo('ended'); t.boolean('cancel_at_period_end').notNullable().defaultTo(false);
    t.integer('current_price_id').nullable(); t.foreign(['moon_id','current_price_id']).references(['moon_id','id']).inTable('moon_prices').onDelete('RESTRICT');
    t.timestamp('current_period_start'); t.timestamp('current_period_end'); t.integer('version').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now()); t.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
    t.unique(['shop_id','moon_id']); t.unique(['shop_id','id']); t.unique(['shop_id','moon_id','id']); t.check("state IN ('active','ended')");
    t.check("state <> 'active' OR (current_period_start IS NOT NULL AND current_period_end IS NOT NULL AND current_period_end > current_period_start)");
    t.index(['shop_id','state']); t.index(['state','current_period_end']);
  });
  if (!await db.schema.hasTable('moon_subscription_periods')) await db.schema.createTable('moon_subscription_periods', t => {
    t.increments('id'); t.integer('shop_id').notNullable(); t.integer('moon_id').notNullable(); t.integer('subscription_id').notNullable();
    t.foreign(['shop_id','moon_id','subscription_id']).references(['shop_id','moon_id','id']).inTable('shop_moon_subscriptions');
    t.integer('price_id').nullable(); t.foreign(['moon_id','price_id']).references(['moon_id','id']).inTable('moon_prices');
    t.timestamp('service_start').notNullable(); t.timestamp('service_end').notNullable();
    t.bigInteger('monthly_price_minor').notNullable(); t.string('currency',3).notNullable();
    t.string('billing_kind',20).notNullable(); t.timestamp('created_at').notNullable().defaultTo(db.fn.now());
    t.unique(['subscription_id','service_start']); t.check('service_end > service_start'); t.check('monthly_price_minor >= 0');
    t.check("billing_kind IN ('paid','free','migration_grant')"); t.index(['shop_id','service_start']);
  });
  if (!await db.schema.hasTable('moon_subscription_events')) await db.schema.createTable('moon_subscription_events', t => {
    t.increments('id'); t.integer('shop_id').notNullable().references('id').inTable('shops').onDelete('RESTRICT');
    t.integer('subscription_id').notNullable(); t.foreign(['shop_id','subscription_id']).references(['shop_id','id']).inTable('shop_moon_subscriptions');
    t.integer('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL'); t.string('action',30).notNullable();
    t.text('details_json').notNullable(); t.timestamp('created_at').notNullable().defaultTo(db.fn.now()); t.index(['shop_id','subscription_id','created_at']);
  });
  await db('moon_catalog').insert(Object.values(REGISTRY).map((moon) => ({ key: moon.key, name: moon.name, summary: moon.summary, description: '', category: moon.category, sort_order: moon.sortOrder }))).onConflict('key').ignore();
}
module.exports = { ensureMoonsSchema };
