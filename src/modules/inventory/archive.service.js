const { archiveInput, restoreInput } = require('./archive.schema');
const { planFifoAllocations } = require('./inventory-costing.service');
const { quantity: round, addQuantity, subtractQuantity } = require('./inventory-quantity');

function fail(message, status = 409) { throw Object.assign(new Error(message), { status }); }
function tenant(user) {
  if (!Number.isInteger(Number(user?.shop_id)) || Number(user.shop_id) <= 0) fail('Select a restaurant before using inventory archives.', 400);
  return Number(user.shop_id);
}
const actor = user => ({ actor_id: user.id, actor_name: user.name || user.username || `User ${user.id}` });

function createArchiveService(db) {
  async function target(trx, shopId, entity, id) {
    if (entity === 'ingredient') {
      const row = await trx('raw_stocks').where({ id, shop_id: shopId }).forUpdate().first();
      if (!row) fail('Ingredient not found.', 404);
      return { row, table: 'raw_stocks', field: 'current_stock', unit: row.unit };
    }
    // Lock product before variants, matching stock-product sale lock ordering.
    const ref = entity === 'variant' ? await trx('product_stock_variants').where({ id, shop_id: shopId }).first() : null;
    if (entity === 'variant' && !ref) fail('Variant not found.', 404);
    const product = await trx('products').where({ id: ref?.product_id || id, shop_id: shopId }).forUpdate().first();
    if (!product || product.product_type !== 'stock_based') fail('Stock product not found.', 404);
    const row = entity === 'variant' ? await trx('product_stock_variants').where({ id, shop_id: shopId }).forUpdate().first() : product;
    return { row, product, table: entity === 'variant' ? 'product_stock_variants' : 'products', field: 'stock', unit: 'units' };
  }
  async function dependencies(trx, shopId, entity, row) {
    if (entity === 'ingredient') {
      // Conservative: retain recipe links until an operator explicitly removes/replaces them.
      if (await trx('recipe_ingredients as ri').join('recipes as r', 'r.id', 'ri.recipe_id').where({ 'r.shop_id': shopId, 'ri.raw_stock_id': row.id }).first('ri.id')) {
        fail('This ingredient is linked to a recipe. Replace or unlink it before archiving the item. You can archive a quantity instead.');
      }
      const linked = await trx('products').where({ shop_id: shopId, is_deleted: 0 }).whereRaw(`
        jsonb_path_exists(COALESCE(variants_config::jsonb,'[]'::jsonb), ?::jsonpath, jsonb_build_object('id',?::int,'text',?::text))
        OR jsonb_path_exists(COALESCE(addons_config::jsonb,'[]'::jsonb), ?::jsonpath, jsonb_build_object('id',?::int,'text',?::text))
      `, ['$.**.raw_stock_id ? (@ == $id || @ == $text)',row.id, String(row.id),'$.**.raw_stock_id ? (@ == $id || @ == $text)', row.id, String(row.id)]).first('id');
      const legacyAddon = await trx('menu_addons').where({shop_id:shopId,is_active:1,raw_stock_id:row.id}).first('id');
      if (legacyAddon) fail('This ingredient is linked to an active add-on. Unlink it before archiving.');
      const addon = await trx('menu_addon_ingredients as mai').join('menu_addons as ma', 'ma.id', 'mai.menu_addon_id')
        .where({ 'ma.shop_id': shopId, 'ma.is_active': 1, 'mai.raw_stock_id': row.id }).first('ma.id');
      if (linked || addon) fail('This ingredient is linked to an active menu item or add-on. Replace or unlink it before archiving.');
    } else {
      const pending = await trx('sale_items as si').join('sales as s', 's.id', 'si.sale_id')
        .where('s.shop_id', shopId).where('si.product_id', entity === 'variant' ? row.product_id : row.id)
        .whereRaw("COALESCE(s.order_status,'pending') NOT IN ('completed','cancelled','returned')").first('s.id');
      if (pending) fail('This product has an unfinished order. Complete or cancel it before archiving the item.');
      const composition = await trx('product_compositions as pc').join('products as p','p.id','pc.parent_product_id')
        .where({ 'p.shop_id': shopId, 'p.is_deleted': 0, 'pc.component_product_id': entity === 'variant' ? row.product_id : row.id }).first('p.id');
      if (composition) fail('This product is used in a product composition. Unlink it before archiving.');
    }
  }
  async function syncProduct(trx, shopId, productId) {
    const sum = await trx('product_stock_variants').where({ shop_id: shopId, product_id: productId, is_active: true }).sum('stock as total').first();
    await trx('products').where({ id: productId, shop_id: shopId }).update({ stock: Number(sum.total || 0) });
  }
  async function moveQuantity(trx, shopId, t, entity, amount) {
    const { row, field } = t;
    if (round(row[field]) < amount) fail('Quantity exceeds available stock.');
    let allocations;
    if (entity === 'variant') {
      allocations = [{ source: 'variant', id: row.id, quantity: amount, unitCost: String(row.buying_price) }];
      await trx(t.table).where({ id: row.id, shop_id: shopId }).update({ stock: subtractQuantity(row.stock, amount) });
    } else if (entity === 'product') {
      const variants = await trx('product_stock_variants').where({ product_id: row.id, shop_id: shopId, is_active: true }).orderBy('id').forUpdate();
      if (!variants.length) fail('This legacy product has no active variants. Configure its variants before archiving a quantity.');
      const plan = planFifoAllocations(variants.map(v => ({ ...v, quantity: v.stock })), amount);
      if (plan.remaining > 0) fail('Variant stock does not match the product total. Reconcile it first.');
      allocations = plan.allocations.map(a => ({ source: 'variant', id: a.batchId, quantity: a.quantity, unitCost: String(variants.find(v => v.id === a.batchId).buying_price) }));
      for (const a of allocations) await trx('product_stock_variants').where({ id: a.id, shop_id: shopId }).decrement('stock', a.quantity);
    } else {
      const batches = await trx('raw_stock_batches').where({ raw_stock_id: row.id, shop_id: shopId }).select('*',trx.raw("to_char(expiry_date,'YYYY-MM-DD') as archive_expiry")).where('quantity','>',0).orderBy([{ column:'created_at' },{ column:'id' }]).forUpdate();
      const plan = planFifoAllocations(batches, amount);
      if (plan.remaining > 0) fail('Batch stock does not match the ingredient total. Reconcile it first.');
      allocations = plan.allocations.map(a => {
        const batch = batches.find(b => b.id === a.batchId);
        return { source:'batch',id:a.batchId,quantity:a.quantity,unitCost:String(batch.buying_price),expiry_date:batch.archive_expiry,created_at:batch.created_at };
      });
      for (const a of allocations) await trx('raw_stock_batches').where({ id: a.id, raw_stock_id: row.id, shop_id: shopId }).decrement('quantity', a.quantity);
      await trx('raw_stocks').where({ id: row.id, shop_id: shopId }).update({ current_stock: subtractQuantity(row.current_stock, amount) });
    }
    if (t.product) await syncProduct(trx, shopId, t.product.id);
    return allocations;
  }
  return {
    async list(user, { page = 1, kind, status = 'active' } = {}) {
      const shopId = tenant(user);
      const query = db('inventory_archives as a').leftJoin('inventory_archive_restores as r', function () { this.on('r.archive_id','=','a.id').andOn('r.shop_id','=','a.shop_id'); }).where('a.shop_id', shopId);
      if (kind) query.where('a.kind',kind);
      if (status === 'active') query.whereNull('r.id');
      if (status === 'restored') query.whereNotNull('r.id');
      const [{ count }] = await query.clone().count('a.id as count');
      const items = await query.select('a.*','r.reason as restore_reason','r.actor_name as restored_by','r.actor_id as restored_actor_id','r.created_at as restored_at','r.before_state as restore_before','r.after_state as restore_after').orderBy('a.id','desc').limit(25).offset((page-1)*25);
      return { items, page, total: Number(count), pages: Math.max(1,Math.ceil(Number(count)/25)) };
    },
    async archive(user, input) {
      const data = archiveInput.parse(input), shopId = tenant(user);
      return db.transaction(async trx => {
        await trx.raw('SELECT pg_advisory_xact_lock(?,?)',[72401390,shopId]);
        await trx('shops').where({ id:shopId }).forUpdate().first('id');
        const duplicate = await trx('inventory_archives').where({ shop_id: shopId, request_id: data.requestId }).first();
        if (duplicate) {
          if (duplicate.entity !== data.entity || duplicate.entity_id !== data.entityId || duplicate.kind !== data.kind || duplicate.reason !== data.reason || (data.kind === 'quantity' && Number(duplicate.quantity) !== data.quantity)) fail('This request ID was already used for another archive.');
          return duplicate;
        }
        const t = await target(trx,shopId,data.entity,data.entityId), { row } = t;
        if (row.is_deleted || (data.entity === 'variant' && (!row.is_active || t.product.is_deleted))) fail('This item is already archived or inactive.');
        const before = { ...row }, amount = data.kind === 'quantity' ? round(data.quantity) : round(row[t.field]);
        if (data.entity === 'product' && data.kind === 'item') before.variants = await trx('product_stock_variants').where({product_id:row.id,shop_id:shopId}).orderBy('id').forUpdate();
        let allocations = [];
        if (data.kind === 'item') {
          await dependencies(trx,shopId,data.entity,row);
          if (data.entity === 'variant') {
            await trx(t.table).where({ id: row.id, shop_id: shopId }).update({ is_active:false, is_on_menu:false });
            await syncProduct(trx,shopId,row.product_id);
          } else {
            await trx(t.table).where({ id: row.id, shop_id: shopId }).update({ is_deleted:1 });
            if (data.entity === 'product') await trx('shops').where({ id:shopId }).decrement('product_count',1);
          }
        } else allocations = await moveQuantity(trx,shopId,t,data.entity,amount);
        const after = await trx(t.table).where({ id:row.id,shop_id:shopId }).first();
        if (before.variants) after.variants = before.variants;
        const [entry] = await trx('inventory_archives').insert({
          shop_id:shopId, kind:data.kind, entity:data.entity, entity_id:row.id, product_id:t.product?.id || null,
          name:data.entity === 'variant' ? `${t.product.name} / ${row.name}` : row.name,
          unit:t.unit, quantity:amount, reason:data.reason, ...actor(user), request_id:data.requestId,
          snapshot:JSON.stringify({ before, after }), allocations:JSON.stringify(allocations),
        }).returning('*');
        return entry;
      });
    },
    async restore(user, id, input) {
      const data = restoreInput.parse(input), shopId = tenant(user);
      return db.transaction(async trx => {
        await trx.raw('SELECT pg_advisory_xact_lock(?,?)',[72401390,shopId]);
        await trx('shops').where({ id:shopId }).forUpdate().first('id');
        const entry = await trx('inventory_archives').where({ id,shop_id:shopId }).first();
        if (!entry) fail('Archive not found.',404);
        const previous = await trx('inventory_archive_restores').where({ archive_id:id,shop_id:shopId }).first();
        if (previous) return previous;
        const t = await target(trx,shopId,entry.entity,entry.entity_id), before = { ...t.row };
        if (entry.entity === 'variant' && t.product.is_deleted) fail('Restore the parent product first.');
        if (entry.kind === 'item') {
          if (entry.entity === 'ingredient') {
            const clash = await trx('raw_stocks').where({ shop_id:shopId,is_deleted:0 }).whereNot('id',entry.entity_id).whereRaw('LOWER(BTRIM(name)) = LOWER(BTRIM(?))',[t.row.name]).first('id');
            if (clash) fail('An active ingredient already uses this name. Rename it before restoring.');
          }
          await trx(t.table).where({ id:entry.entity_id,shop_id:shopId }).update(entry.entity === 'variant' ? { is_active:true, is_on_menu:false } : { is_deleted:0 });
          if (entry.entity === 'product') await trx('shops').where({ id:shopId }).increment('product_count',1);
        } else {
          if (t.row.is_deleted || (entry.entity === 'variant' && !t.row.is_active)) fail('Restore the item before restoring its stock.');
          if (entry.entity === 'ingredient' && entry.unit !== t.row.unit) fail(`This ingredient's unit changed. Change it back to ${entry.unit} before restoring this quantity.`);
          for (const a of entry.allocations) {
            const table = a.source === 'batch' ? 'raw_stock_batches' : 'product_stock_variants';
            const query = trx(table).where({ id:a.id,shop_id:shopId, ...(a.source === 'batch' ? { raw_stock_id:entry.entity_id } : { product_id:t.product.id }) });
            const source = await query.clone().forUpdate().first();
            if (!source || (a.source === 'variant' && !source.is_active)) fail('An original batch or variant is unavailable. Restore the variant first.');
            const field = a.source === 'batch' ? 'quantity' : 'stock';
            if (a.source === 'batch' && Number(source.buying_price) !== Number(a.unitCost)) {
              // Preserve the archived cost if the source batch's price was edited while held aside.
              await trx(table).insert({ shop_id:shopId,raw_stock_id:entry.entity_id,quantity:a.quantity,buying_price:a.unitCost,expiry_date:a.expiry_date,created_at:a.created_at });
            } else {
              const updates = { [field]:addQuantity(source[field],a.quantity) };
              if (a.source === 'variant') updates.buying_price = trx.raw('( ?::numeric * ?::numeric + ?::numeric * ?::numeric ) / ?::numeric',[source.stock,source.buying_price,a.quantity,a.unitCost,updates.stock]);
              await query.update(updates);
            }
          }
          if (entry.entity === 'ingredient') await trx(t.table).where({ id:entry.entity_id,shop_id:shopId }).update({ current_stock:addQuantity(t.row.current_stock,entry.quantity) });
        }
        if (entry.entity === 'variant' || (entry.kind === 'quantity' && entry.entity === 'product')) await syncProduct(trx,shopId,t.product.id);
        const after = await trx(t.table).where({ id:entry.entity_id,shop_id:shopId }).first();
        const [event] = await trx('inventory_archive_restores').insert({ shop_id:shopId,archive_id:id,reason:data.reason,...actor(user),before_state:JSON.stringify(before),after_state:JSON.stringify(after) }).returning('*');
        return event;
      });
    },
  };
}
module.exports = { createArchiveService };
