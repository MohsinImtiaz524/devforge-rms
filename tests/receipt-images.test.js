const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const knex = require('knex');
const { prepareImage, prepareShopImages } = require('../services/ReceiptImageService');
const { renderSaleReceiptPage } = require('../services/ReceiptPrintService');

async function image(color = '#335588', width = 1600) {
  return 'data:image/png;base64,' + (await sharp({ create: {
    width, height: width / 2, channels: 4, background: color,
  } }).png().toBuffer()).toString('base64');
}
test('prepared copies preserve proportions, colour and alpha without enlarging small images', async () => {
  const source = await image();
  const prepared = await prepareImage(source);
  const metadata = await sharp(Buffer.from(prepared.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.width, 560);
  assert.equal(metadata.height, 280);
  assert.equal(metadata.hasAlpha, true);
  assert.ok(prepared.length < source.length);
  const small = await prepareImage(await image('#335588', 80));
  assert.equal((await sharp(Buffer.from(small.split(',')[1], 'base64')).metadata()).width, 80);
  assert.equal(await prepareImage('https://example.com/logo.png'), null);
  assert.equal(await prepareImage('/uploads/receipt-assets/../../secret.png'), null);
  assert.equal(await prepareImage('/api/files/123/content'), null);
});

test('print copies persist per shop, reuse unchanged sources, invalidate changes and preserve originals', async () => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  try {
    await db.schema.createTable('shops', t => {
      t.integer('id').primary(); t.text('logo_data'); t.text('logo_path');
      t.text('receipt_images_json'); t.text('receipt_print_assets_json');
    });
    const original = await image();
    const footer = await image('#ff5500');
    await db('shops').insert([{ id: 1, logo_data: original,
      receipt_images_json: JSON.stringify([{ path: footer, description: 'Footer' }]) },
    { id: 2, logo_data: footer }]);
    const before = await db('shops').where({ id: 1 }).first();
    const prepared = await prepareShopImages(db, before);
    assert.notEqual(prepared.logo_data, original);
    assert.notEqual(prepared.receipt_images[0].path, footer);
    const saved = await db('shops').where({ id: 1 }).first();
    assert.equal(saved.logo_data, original);
    assert.equal(saved.receipt_images_json, before.receipt_images_json);
    assert.equal((await db('shops').where({ id: 2 }).first()).receipt_print_assets_json, null);
    let writes = 0;
    const listener = query => { if (/^update/i.test(query.sql)) writes++; };
    db.on('query', listener);
    assert.equal((await prepareShopImages(db, saved)).logo_data, prepared.logo_data);
    assert.equal(writes, 0);
    db.removeListener('query', listener);
    await db('shops').where({ id: 1 }).update({ logo_data: footer, receipt_images_json: '[]' });
    const changed = await prepareShopImages(db, await db('shops').where({ id: 1 }).first());
    assert.notEqual(changed.logo_data, prepared.logo_data);
    assert.equal(Object.keys(JSON.parse((await db('shops').where({ id: 1 }).first()).receipt_print_assets_json)).length, 1);
    const html = renderSaleReceiptPage({ sale: { id: 1, total: 0 }, items: [],
      shop: { ...prepared, use_logo_on_receipt: true } }, { autoPrint: false });
    assert.match(html, /src="data:image\/png;base64,/);
    assert.doesNotMatch(html, /src="[^" ]*uploads\//);
    const broken = { id: 1, logo_data: 'data:image/png;base64,bad', receipt_images: [] };
    assert.equal((await prepareShopImages(db, broken)).logo_data, broken.logo_data);
    const failingDb = () => ({ where: () => ({ update: () => Promise.reject(new Error('offline')) }) });
    assert.ok((await prepareShopImages(failingDb, { ...before, receipt_print_assets_json: null })).logo_data);
  } finally { await db.destroy(); }
});
