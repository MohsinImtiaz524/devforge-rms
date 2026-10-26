async function ensureShopLogoSchema(db){
  if(!await db.schema.hasColumn('shops','google_maps_url'))await db.schema.alterTable('shops',t=>t.text('google_maps_url'));
  if(!await db.schema.hasColumn('shops','logo_print_width_mm'))await db.schema.alterTable('shops',t=>t.decimal('logo_print_width_mm',5,2).notNullable().defaultTo(60));
}
module.exports={ensureShopLogoSchema};
