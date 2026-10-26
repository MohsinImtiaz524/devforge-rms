// Additive tables only. Called at startup when FILES_ENABLED=true, never from a request.
async function ensureFilesSchema(db) {
  if (!await db.schema.hasTable('file_scopes')) await db.schema.createTable('file_scopes', t => { t.string('scope_key',80).primary(); });
  if (!await db.schema.hasTable('files')) await db.schema.createTable('files', t => {
    t.string('id',36).primary(); t.integer('shop_id').references('id').inTable('shops');
    t.string('scope_key',80).notNullable(); t.integer('uploader_id').notNullable().references('id').inTable('users');
    t.string('purpose',80).notNullable(); t.string('original_name',255).notNullable();
    t.string('mime_type',80); t.bigInteger('verified_bytes'); t.string('checksum',64); t.integer('width'); t.integer('height');
    t.string('storage_key',200).notNullable().unique(); t.string('status',20).notNullable().defaultTo('pending');
    t.timestamp('created_at').notNullable().defaultTo(db.fn.now()); t.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
    t.check("status IN ('pending','verifying','ready','rejected','expired','deleting','deleted')"); t.check("(scope_key = 'platform' AND shop_id IS NULL) OR (shop_id IS NOT NULL AND scope_key = 'shop:' || CAST(shop_id AS TEXT))"); t.unique(['scope_key','id']); t.index(['scope_key','status','created_at']);
  });
  if (!await db.schema.hasTable('file_upload_sessions')) await db.schema.createTable('file_upload_sessions', t => {
    t.string('id',36).primary(); t.string('file_id',36).notNullable().unique().references('id').inTable('files');
    t.string('scope_key',80).notNullable(); t.integer('uploader_id').notNullable(); t.string('idempotency_key',36).notNullable();
    t.string('staging_key',200).notNullable().unique(); t.bigInteger('expected_bytes').notNullable(); t.bigInteger('reserved_final_bytes').notNullable().defaultTo(0); t.string('expected_type',80).notNullable();
    t.timestamp('expires_at').notNullable(); t.timestamp('created_at').notNullable().defaultTo(db.fn.now());
    t.unique(['scope_key','uploader_id','idempotency_key']);
  });
  if (!await db.schema.hasColumn('file_upload_sessions','reserved_final_bytes')) {
    await db.schema.alterTable('file_upload_sessions',t=>t.bigInteger('reserved_final_bytes').notNullable().defaultTo(0));
    await db('file_upload_sessions').update({reserved_final_bytes:db.ref('expected_bytes')});
    for(const [purpose,rules] of Object.entries(require('./files.policies').policies))await db('file_upload_sessions').whereIn('file_id',db('files').select('id').where({purpose})).update({reserved_final_bytes:rules.maxBytes});
  }
  if (!await db.schema.hasTable('file_attachments')) await db.schema.createTable('file_attachments', t => {
    t.increments('id'); t.integer('shop_id').references('id').inTable('shops'); t.string('scope_key',80).notNullable();
    t.string('file_id',36).notNullable(); t.string('resource_type',80).notNullable(); t.string('resource_id',80).notNullable();
    t.string('slot',80).notNullable().defaultTo('attachments'); t.integer('display_order').notNullable();
    t.integer('attached_by').notNullable().references('id').inTable('users'); t.timestamp('created_at').defaultTo(db.fn.now());
    t.foreign(['scope_key','file_id']).references(['scope_key','id']).inTable('files');
    t.unique(['scope_key','file_id']); t.unique(['scope_key','resource_type','resource_id','slot','display_order']);
    t.index(['scope_key','resource_type','resource_id']);
  });
  await db.raw('CREATE INDEX IF NOT EXISTS idx_file_attachments_file ON file_attachments(file_id)');
  if (!await db.schema.hasTable('file_jobs')) await db.schema.createTable('file_jobs', t => {
    t.string('id',36).primary(); t.string('file_id',36).notNullable().references('id').inTable('files');
    t.string('kind',20).notNullable(); t.integer('attempts').notNullable().defaultTo(0); t.timestamp('run_at').notNullable();
    t.string('last_error',80); t.unique(['file_id','kind']); t.index(['run_at','attempts']);
  });
}
module.exports = { ensureFilesSchema };
