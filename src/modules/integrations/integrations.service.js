async function ensureIntegrationsSchema(db) {
  if (!await db.schema.hasColumn('shops', 'foodpanda_enabled')) {
    await db.schema.alterTable('shops', table => table.boolean('foodpanda_enabled').notNullable().defaultTo(false));
  }
  await ensureFoodpandaHistorySchema(db);
}
async function ensureFoodpandaHistorySchema(db) {
  if (!await db.schema.hasColumn('shops', 'foodpanda_activated')) {
    await db.schema.alterTable('shops', table => table.boolean('foodpanda_activated').notNullable().defaultTo(false));
    await db('shops').where({foodpanda_enabled:true}).update({foodpanda_activated:true});
  }
}
async function foodpandaSettings(db, shopId) {
  const shop = await db('shops').where({ id: shopId }).first('foodpanda_enabled','foodpanda_activated');
  if (!shop) throw Object.assign(new Error('Shop not found.'), { status: 404 });
  return { enabled: shop.foodpanda_enabled === true || shop.foodpanda_enabled === 1, activated: shop.foodpanda_activated === true || shop.foodpanda_activated === 1 };
}
async function assertFoodpandaEnabled(db, shopId) {
  if (!(await foodpandaSettings(db, shopId)).enabled) {
    throw Object.assign(new Error('Enable Foodpanda in Integrations before placing Foodpanda orders.'), { status: 403 });
  }
}
module.exports = { ensureIntegrationsSchema, ensureFoodpandaHistorySchema, foodpandaSettings, assertFoodpandaEnabled };
