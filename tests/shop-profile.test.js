const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const knex = require('knex');
const {validateProfile} = require('../src/modules/shops/shops.profile');
const {ensureShopLogoSchema} = require('../src/modules/shops/shops.migration');

test('profile validates shared details and synchronizes shop and printed names', () => {
  assert.deepEqual(validateProfile({name:' X SQUARE ',receipt_phone:' 03249627570 '}).values,
    {name:'X SQUARE',receipt_header_text:'X SQUARE',receipt_phone:'03249627570'});
  for (const value of ['javascript:alert(1)','https://example.com/maps','https://google.com.evil.test/maps','https://user:pass@maps.google.com/']) {
    assert.ok(validateProfile({google_maps_url:value}).error);
  }
  for (const value of ['', 'https://maps.app.goo.gl/abc', 'https://www.google.com/maps/place/X']) {
    assert.equal(validateProfile({google_maps_url:value}).error, undefined);
  }
  assert.ok(validateProfile({name:'  '}).error);
  assert.ok(validateProfile({receipt_phone:[]}).error);
  assert.deepEqual(validateProfile({receipt_policies:'Thanks'}).values, {});
});

test('maps schema is additive and idempotent, preserving existing receipt details', async () => {
  const db=knex({client:'better-sqlite3',connection:{filename:':memory:'},useNullAsDefault:true});
  try {
    await db.schema.createTable('shops',t=>{t.integer('id').primary();t.text('receipt_phone');});
    await db('shops').insert({id:1,receipt_phone:'03249627570'});
    await ensureShopLogoSchema(db); await ensureShopLogoSchema(db);
    assert.equal((await db('shops').first()).receipt_phone,'03249627570');
    assert.equal((await db('shops').first()).google_maps_url,null);
  } finally {await db.destroy();}
});

test('maps QR is generated locally, cached, and omitted for empty or unsafe links', () => {
  const context=vm.createContext({URL});
  vm.runInContext('window = globalThis',context);
  vm.runInContext(fs.readFileSync('public/js/vendor/qrcode.js','utf8'),context);
  vm.runInContext(fs.readFileSync('public/js/shop-maps-qr.js','utf8'),context);
  const html=context.ShopMapsQr.render('https://maps.app.goo.gl/abc');
  assert.match(html, /<svg/);
  assert.match(html, /Scan for Google Maps/);
  assert.doesNotMatch(html, /<img|https:\/\//);
  assert.equal(context.ShopMapsQr.render('https://maps.app.goo.gl/abc'),html);
  assert.equal(context.ShopMapsQr.render(''), '');
  assert.equal(context.ShopMapsQr.render('javascript:alert(1)'), '');
});

test('saving receipt layout does not send or clear shop profile details', async () => {
  let submitted;
  const context=vm.createContext({
    document:{getElementById:id=>id === 'modal' ? {addEventListener:()=>{}} : null},FormData,
    fetch:async (url,options)=>{submitted=options.body;return {ok:true,json:async()=>({ok:true})};},
    toast:()=>{},renderSettings:()=>{},console
  });
  vm.runInContext(fs.readFileSync('public/js/settings.js','utf8'),context);
  vm.runInContext('fetchReceiptSettings = async () => ({});',context);
  await vm.runInContext('saveReceiptSettings()',context);
  for (const field of ['name','receipt_header_text','receipt_extended_name','receipt_phone','receipt_address','google_maps_url']) assert.equal(submitted.has(field),false);
  assert.equal(submitted.has('receipt_policies'),true);
});
