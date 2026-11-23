async function ensureIconSchema(db) {
  if (!await db.schema.hasTable('platform_icons')) await db.schema.createTable('platform_icons', table => {
    table.string('file_id',36).nullable(); table.string('key', 64).primary(); table.string('label', 100).notNullable(); table.text('image_data').nullable();
  });
  if(!await db.schema.hasColumn('platform_icons','file_id'))await db.schema.alterTable('platform_icons',table=>table.string('file_id',36).nullable());
}
module.exports = { ensureIconSchema };
