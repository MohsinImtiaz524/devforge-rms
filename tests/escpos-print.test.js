const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const knex = require('knex');
const express = require('express');
const { Server } = require('socket.io');
const { io } = require('socket.io-client');
const sharp = require('sharp');
const encoder = require('../src/modules/escpos-print/escpos-encoder');
const templates = require('../src/modules/escpos-print/receipt-templates.json');
const { prepareData } = require('../src/modules/escpos-print/escpos-print.data');
const encode = (document, config, columns) => encoder.encode({ ...document, data: document.data || prepareData(document, config.receipt, config.timeZone) }, { ...config, templates: config.templates || templates }, columns);
const { createAgent } = require('../escpos-print-agent');

test('superscript item digits print as ordinary ASCII digits', () => {
  assert.equal(encoder.clean('Quadrant \u00b2 \u00b3 \u00b9 \u2070 \u2074\u2075\u2076\u2077\u2078\u2079'), 'Quadrant 2 3 1 0 456789');
  const document = { format: 'customer', sale: { id: 1, total: 2100 }, items: [{ name: 'Quadrant \u00b2', quantity: 2, price_at_sale: 1050 }] };
  const receipt = encode(document, { receipt: {}, assets: [] }).toString('latin1');
  assert.match(receipt, /Quadrant 2/); assert.match(receipt, /1050/); assert.match(receipt, /2100/);
});

test('a failed receipt does not strand later queued receipts without another notification', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'escpos-continue-'));
  let claims = 0, printed = 0, reported = 0;
  const agent = createAgent({ shopId: 1, serverUrl: 'https://rms.test' }, {
    encode: document => { if (document.invalid) throw new Error('Unsupported receipt text'); return Buffer.from('receipt'); }
  }, {
    directory, print: async () => { printed++; },
    fetch: async url => {
      if (url.endsWith('/config')) return new Response(JSON.stringify({ schema: 1, shopId: 1, receipt: {}, printers: [{ system_name: 'Counter' }], assets: [] }));
      if (url.endsWith('/claim')) {
        claims++;
        if (claims === 1) return new Response(JSON.stringify({ id: 1, document: { invalid: true } }));
        if (claims === 2) return new Response(JSON.stringify({ error: 'Sale missing', jobFailed: true }), { status: 422 });
        return new Response(JSON.stringify(claims === 3 ? { id: 3, document: {} } : null));
      }
      if (url.endsWith('/fail')) reported++;
      return new Response('{}');
    }
  });
  try {
    await agent.refresh(); await agent.drain('Counter');
    const deadline = Date.now() + 2000;
    while (claims < 4) { if (Date.now() > deadline) throw new Error('Queue stopped after a failed receipt'); await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.equal(reported, 1); assert.equal(printed, 1);
    assert.equal(agent.state().journal[1].state, 'failed');
    assert.equal(agent.state().journal[3].state, 'confirmed');
  } finally { await agent.stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('queue wake-up runs after successful order commit and never for status reads or agent claims', async () => {
  const notified = [];
  const middleware = require('../src/modules/escpos-print/escpos-print.changes').queueChanges(async id => notified.push(id));
  for (const [path, method, status, expected] of [
    ['/api/sales', 'POST', 200, true], ['/api/sales/2/pay', 'PATCH', 200, true],
    ['/api/print-jobs/queue', 'POST', 200, true], ['/api/sales', 'POST', 500, false],
    ['/api/sales', 'GET', 200, false], ['/api/escpos-print/claim', 'POST', 200, false],
    ['/api/escpos-print/status', 'GET', 200, false]
  ]) {
    const res = new EventEmitter(); res.statusCode = status;
    const before = notified.length;
    middleware({ originalUrl: path, method, session: { user: { shop_id: 4 } } }, res, () => {});
    assert.equal(notified.length, before);
    res.emit('finish'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(notified.length, before + Number(expected));
    if (expected) assert.equal(notified.at(-1), 4);
  }
});

test('paid receipt punctuation is normalized and drawer pulses bypass all text/template rendering', () => {
  const document = { format: 'customer', sale: { id: 1, customer_name: 'Ali\u2019s order\u00a0\u2014 takeaway' }, items: [{ name: 'Tea \u2022 Large', quantity: 1, price_at_sale: 100 }] };
  const output = encode(document, { receipt: { name: 'Shop\u2019s receipt', use_text_on_receipt: true }, assets: [] }).toString();
  assert.match(output, /Ali's order - takeaway/);
  assert.match(output, /Tea - Large/);
  assert.deepEqual(encoder.encode({ type: 'CASH_DRAWER' }, {}), Buffer.from([27,112,0,25,250]));
  assert.throws(() => encode({ ...document, sale: { customer_name: '\u0627' } }, { receipt: {}, assets: [] }), /U\+0627.*receipt text/);
});

test('slow dashboard status never delays printing and jobs queued during cache refresh resume without a page', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'escpos-fast-'));
  const socket = new EventEmitter(); socket.connected = true; socket.disconnect = () => {};
  let releaseStatus, releaseConfig, claims = 0, prints = 0;
  const statusWait = new Promise(resolve => releaseStatus = resolve);
  const configWait = new Promise(resolve => releaseConfig = resolve);
  let holdConfig = false;
  const config = { schema: 1, shopId: 1, receipt: {}, printers: [{ system_name: 'Counter' }], assets: [] };
  const agent = createAgent({ shopId: 1, serverUrl: 'https://rms.test' }, { encode }, {
    directory, connect: () => socket, print: async () => { prints++; },
    fetch: async url => {
      if (url.endsWith('/config')) { if (holdConfig) await configWait; return new Response(JSON.stringify(config)); }
      if (url.endsWith('/status')) { await statusWait; return new Response('{}'); }
      if (url.endsWith('/outstanding')) return new Response('[]');
      if (url.endsWith('/claim')) { claims++; return new Response(JSON.stringify(claims === 1 || claims === 3 ? { id: claims, document: { type: 'CASH_DRAWER' } } : null)); }
      return new Response('{}');
    }
  });
  const wait = async fn => { const deadline = Date.now() + 2000; while (!fn()) { if (Date.now() > deadline) throw new Error('Print waited for dashboard/page refresh'); await new Promise(resolve => setTimeout(resolve, 5)); } };
  try {
    await agent.start(0);
    socket.emit('print:ready', { printers: ['Counter'] });
    await wait(() => prints === 1);
    await wait(() => claims === 2);
    holdConfig = true;
    const refresh = agent.refresh();
    await agent.drain('Counter');
    assert.equal(claims, 2);
    releaseConfig(); await refresh;
    await wait(() => prints === 2);
    assert.equal(prints, 2, 'No browser page or manual refresh was needed');
  } finally { releaseStatus(); releaseConfig(); await agent.stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('RMS JSON layout changes alter output without agent changes and invalid templates are rejected', () => {
  const custom = structuredClone(templates);
  custom.version = '1.0.1';
  custom.formats.customer.nodes = [
    { type: 'text', value: 'NEW RMS FORMAT', align: 'center' },
    { type: 'text', value: 'Bill {{data.number}}' },
    { type: 'divider' },
    { type: 'table', value: { path: 'data.items' }, headers: ['Qty', 'Description'], widths: { 32: [5, 26], 48: [5, 42] }, aligns: ['right', 'left'], cells: [{ path: 'item.quantity' }, { path: 'item.name' }] }
  ];
  const document = { format: 'customer', sale: { id: 8 }, items: [{ name: 'Tea', quantity: 2 }] };
  const output = encode(document, { receipt: {}, templates: custom }, 32).toString('latin1');
  assert.match(output, /NEW RMS FORMAT/); assert.match(output, /Bill 8/); assert.match(output, /Qty +Description/);
  assert.doesNotMatch(output, /GRAND TOTAL|Customer Bill/);
  custom.formats.customer.nodes.push({ type: 'execute', command: 'unsafe' });
  assert.throws(() => encoder.validateTemplates(custom), /Unsupported RMS template operation/);
  assert.throws(() => encoder.validateTemplates({ ...templates, schema: 99 }), /Unsupported RMS template schema/);
  assert.throws(() => encoder.encode(document, { receipt: {}, assets: [] }), /Unsupported RMS template schema/);
});

test('RMS customer, unpaid and kitchen section order and columns are preserved at both paper widths', () => {
  const config = { receipt: { name: 'Shop', use_text_on_receipt: true, receipt_policies: 'Keep your receipt' }, assets: [] };
  const sale = { id: 7, order_number: 'B007', created_at: '2026-10-29T10:00:00Z', order_type: 'dine_in', table_id: 1, table_number: 'T1', total: 200, amount_received: 250, payment_method: 'cash', special_instructions: 'Serve together' };
  const document = { format: 'customer', sale, seller: { name: 'Staff' }, items: [{ name: 'Tea', quantity: 2, price_at_sale: 100, special_instructions: 'No sugar' }] };
  for (const width of [32, 48]) {
    const printed = encode(document, config, width).toString('latin1');
    const order = ['Customer Bill', 'Bill #: B007', 'Date:', 'Staff:', 'Customer:', 'Type:', 'Payment:', 'Item', 'Subtotal', 'GRAND TOTAL', 'Method:', 'Received', 'Change', 'Keep your receipt', 'Thank you'];
    let position = -1;
    for (const label of order) { const next = printed.indexOf(label, position + 1); assert.ok(next > position, `Missing/out-of-order ${label} at ${width} columns`); position = next; }
    assert.match(printed, /Item +Qty +Price +Total/);
    assert.doesNotMatch(printed, /No sugar|TABLE:|TOKEN:/);
    const unpaid = encode({ ...document, format: 'unpaid' }, config, width).toString('latin1');
    assert.match(unpaid, /\*\*\* UNPAID BILL \*\*\*/);
    assert.match(unpaid, /Amount Paid: Rs\. 200.00/);
    assert.match(unpaid, /Balance Due: Rs\. 0.00/);
    assert.doesNotMatch(unpaid, /Change|Method:|Tip received/);
    const kitchen = encode({ ...document, format: 'kitchen', route_label: 'Kitchen: Hot kitchen', is_update: true }, config, width).toString('latin1');
    assert.ok(kitchen.indexOf('Hot kitchen') < kitchen.indexOf('KITCHEN ORDER'));
    assert.match(kitchen, /Qty +Item Description/);
    assert.match(kitchen, /TABLE: T1/); assert.match(kitchen, /NOTE: No sugar/);
    assert.ok(kitchen.indexOf('Order Note:') < kitchen.indexOf('Generated at'));
    assert.doesNotMatch(kitchen, /Subtotal|GRAND TOTAL|Payment:|Customer Bill/);
  }
});

test('configuration notifications run only after successful shop-scoped changes', async () => {
  const { configurationChanges } = require('../src/modules/escpos-print/escpos-print.changes');
  const notified = [];
  const middleware = configurationChanges(async shopId => notified.push(shopId));
  for (const [url, method, status, expected] of [
    ['/api/shop-settings/logo', 'PUT', 200, 7],
    ['/api/printers', 'POST', 200, 7],
    ['/api/shops/9', 'PATCH', 200, 9],
    ['/api/shop-settings', 'POST', 403, null],
    ['/api/shop-settings', 'GET', 200, null],
    ['/api/sales', 'POST', 200, null]
  ]) {
    const response = new EventEmitter(); response.statusCode = status;
    const before = notified.length;
    middleware({ originalUrl: url, method, session: { user: { shop_id: 7 } } }, response, () => {});
    assert.equal(notified.length, before, 'No notification before the response commits');
    response.emit('finish'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(notified.length, before + (expected ? 1 : 0));
    if (expected) assert.equal(notified.at(-1), expected);
  }
});

test('WebSocket recovery is bounded, does not retry authorization, and holds a claim with a lost response', async t => {
  for (const mode of ['temporary', 'unauthorized', 'lost-claim']) await t.test(mode, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'escpos-recovery-'));
    const configuration = { schema: 1, shopId: 1, receipt: {}, printers: [{ id: 1, system_name: 'Counter' }], assets: [] };
    fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify(configuration));
    const socket = new EventEmitter(); socket.connected = false;
    socket.disconnect = () => { socket.connected = false; socket.emit('disconnect'); };
    let claims = 0, inspections = 0, prints = 0;
    const agent = createAgent({ shopId: 1, shopName: 'Test', serverUrl: 'https://rms.test' }, { encode }, {
      directory, recoveryDelays: [1, 2, 3], print: async () => { prints++; },
      connect: () => {
        setImmediate(() => { socket.connected = true; socket.emit('connect'); socket.emit('print:ready', { printers: ['Counter'] }); });
        return socket;
      },
      fetch: async url => {
        if (url.endsWith('/config')) return new Response(JSON.stringify(configuration));
        if (url.endsWith('/outstanding')) {
          inspections++;
          return new Response(JSON.stringify(mode === 'lost-claim' && claims ? [{ id: 901, station_name: 'Counter' }] : []));
        }
        if (url.endsWith('/status')) return new Response(JSON.stringify({ checkedAt: new Date().toISOString(), counts: {}, jobs: [], printers: [] }));
        if (url.endsWith('/claim')) {
          claims++;
          if (mode === 'lost-claim') throw new TypeError('Socket closed after the claim committed');
          return new Response('Test request failure', { status: mode === 'unauthorized' ? 401 : 503 });
        }
        return new Response('{}');
      }
    });
    try {
      await agent.start(0);
      const until = Date.now() + 3000;
      while (!(mode === 'temporary' ? claims >= 4 : mode === 'unauthorized' ? claims >= 1 : agent.state().journal[901]?.state === 'review')) {
        if (Date.now() > until) throw new Error('Recovery did not finish');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      const settled = claims;
      await new Promise(resolve => setTimeout(resolve, 60));
      assert.equal(claims, settled, 'Recovery stops rather than turning into periodic polling');
      assert.equal(prints, 0, 'Recovery never blindly prints');
      if (mode === 'temporary') { assert.equal(claims, 4); assert.match(agent.state().lastError, /stopped after 3 attempts/); }
      if (mode === 'unauthorized') { assert.equal(claims, 1); assert.match(agent.state().lastError, /Download a new agent/); }
      if (mode === 'lost-claim') { assert.equal(claims, 1); assert.ok(inspections > 1); assert.equal(agent.state().journal[901].state, 'review'); }
    } finally { await agent.stop(); fs.rmSync(directory, { recursive: true, force: true }); }
  });
});

test('download button displays JSON and unavailable-site errors without saving them as files', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  const helper = source.slice(source.indexOf('async function downloadEscposPrintAgent('), source.indexOf('async function setRealtimePrintingEnabled('));
  const messages = [], downloads = [];
  let response;
  const context = { fetch: async () => response, toast: (...args) => messages.push(args),
    Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }, setTimeout: fn => fn(),
    document: { body: { appendChild: () => {} }, createElement: () => {
      const link = { click: () => downloads.push(link.download), remove: () => {} }; return link;
    } }
  };
  vm.createContext(context); vm.runInContext(helper, context);
  const button = { disabled: false };
  response = new Response(JSON.stringify({ error: 'Printer configuration unavailable' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  await context.downloadEscposPrintAgent(button);
  assert.equal(downloads.length, 0); assert.equal(messages.at(-1)[0], 'Printer configuration unavailable'); assert.equal(button.disabled, false);
  response = new Response('<html>Site unavailable</html>', { status: 503, headers: { 'Content-Type': 'text/html' } });
  await context.downloadEscposPrintAgent(button); assert.equal(downloads.length, 0); assert.match(messages.at(-1)[0], /HTTP 503/);
  response = new Response('/** RMS ESC/POS agent */\nconst PROFILE = {};', { headers: { 'Content-Type': 'application/javascript', 'Content-Disposition': 'attachment; filename="agent.js"' } });
  await context.downloadEscposPrintAgent(button); assert.deepEqual(downloads, ['agent.js']); assert.equal(button.disabled, false);
});

test('encoder preserves totals, unpaid labels, kitchen snapshots, cuts, QR and blocks command injection', () => {
  const config = { receipt: { name: 'Shop', use_text_on_receipt: true, currency: 'PKR', google_maps_url: 'https://example.com/map' }, assets: [] };
  const document = { type: 'RECEIPT', format: 'customer', sale: { id: 12, total: 180, discount: 20, amount_received: 200, tip_amount: 10, tip_collection_mode: 'standalone' }, items: [{ quantity: 2, name: 'Tea\x1b@', price_at_sale: 100 }] };
  const data = encode(document, config).toString('latin1');
  assert.match(data, /GRAND TOTAL +Rs\. 180.00/);
  assert.match(data, /Total collected +Rs\. 190.00/);
  assert.match(data, /Change +Rs\. 20.00/);
  assert.match(data, /Tea@/);
  assert.ok(data.includes('https://example.com/map'));
  assert.ok(data.endsWith('\x1bd\x04\x1dV\x00'));
  assert.match(encode({ ...document, format: 'unpaid' }, config).toString(), /UNPAID BILL/);
  const kitchen = encode({ ...document, format: 'kitchen', is_update: true, items: [{ quantity: 1, name: 'Rice', change_action: 'remove' }] }, config).toString();
  assert.match(kitchen, /REMOVE/); assert.match(kitchen, /UPDATED/); assert.doesNotMatch(kitchen, /GRAND TOTAL|Tea/);
  assert.throws(() => encode({ ...document, sale: { customer_name: 'اردو' } }, config), /supports ASCII/);
  assert.deepEqual(encode({ type: 'CASH_DRAWER' }, config), Buffer.from([27, 112, 0, 25, 250]));
});

test('HTTP and WebSocket workflow scopes jobs, refreshes artwork, preserves old agent, and prints JSON once', async t => {
  const db = knex({ client: 'better-sqlite3', connection: { filename: ':memory:' }, useNullAsDefault: true });
  const dbPath = require.resolve('../db/knex');
  const salesPath = require.resolve('../services/SalesService');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
  require.cache[salesPath] = { id: salesPath, filename: salesPath, loaded: true, exports: {
    getBill: async (id, shopId) => ({ sale: { id, total: 100, amount_received: 100 }, items: [{ name: `Shop ${shopId} tea`, quantity: 1, price_at_sale: 100 }], seller: { name: 'Cashier' } })
  } };
  process.env.PRINT_AGENT_SECRET = 'escpos-test-secret';
  await db.schema.createTable('shops', table => {
    table.integer('id').primary(); for (const key of ['name', 'logo_data', 'receipt_images_json', 'receipt_policies', 'receipt_header_text']) table.text(key);
    table.boolean('use_logo_on_receipt'); table.boolean('use_text_on_receipt');
  });
  await db.schema.createTable('printers', table => { table.increments(); table.integer('shop_id'); table.text('system_name'); table.text('display_name'); });
  await db.schema.createTable('print_queue', table => {
    table.increments(); table.integer('shop_id'); table.text('station_name'); table.text('content_json'); table.text('status'); table.integer('attempts');
    for (const key of ['created_at', 'updated_at', 'claimed_at', 'printed_at', 'failed_at', 'last_error']) table.text(key);
  });
  const logo = 'data:image/png;base64,' + (await sharp({ create: { width: 40, height: 20, channels: 3, background: '#111' } }).png().toBuffer()).toString('base64');
  await db('shops').insert([{ id: 1, name: 'Test Shop', use_text_on_receipt: true, use_logo_on_receipt: true, logo_data: logo, receipt_images_json: '[]' }, { id: 2, name: 'Other Shop' }]);
  await db('printers').insert([{ shop_id: 1, system_name: 'Printer A', display_name: 'Counter' }, { shop_id: 2, system_name: 'Printer B', display_name: 'Other' }]);
  const service = require('../src/modules/escpos-print/escpos-print.service');
  const savedSnapshot = { id: 999, order_number: 1009, order_type: 'dine_in', table_id: 3, table_number: 'T3', created_at: '2026-10-30T10:00:00Z', special_instructions: 'Serve together' };
  const snapshotDocument = await service.documentFor({ content_json: JSON.stringify({
    format: 'kitchen', sale_id: 999, sale_snapshot: savedSnapshot, items: [{ name: 'Snapshot rice', quantity: 2 }], route_label: 'Hot kitchen', is_update: true
  }) }, 1);
  assert.equal(snapshotDocument.sale.order_number, 1009);
  assert.equal(snapshotDocument.data.table, 'T3');
  assert.equal(snapshotDocument.items[0].name, 'Snapshot rice');
  assert.equal(snapshotDocument.data.note, 'Serve together');
  const router = require('../src/modules/escpos-print/escpos-print.routes');
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { if (req.get('x-test-user')) { req.session = { user: { shop_id: 1, role: 'admin' } }; req.permissions = req.get('x-test-user') === 'admin' ? ['settings.update'] : []; } next(); });
  const notifications = new EventEmitter();
  app.use(require('../src/modules/escpos-print/escpos-print.changes').queueChanges(async shopId => {
    const pending = await db('print_queue').where({ shop_id: shopId, status: 'pending' }).distinct('station_name');
    for (const row of pending) notifications.emit('available', { shop_id: shopId, station_name: row.station_name });
  }));
  app.post('/api/sales/test-print', async (req, res) => {
    const [id] = await db('print_queue').insert({ shop_id: req.session.user.shop_id, station_name: 'Printer A',
      status: 'pending', created_at: new Date().toISOString(), content_json: JSON.stringify({ type: 'PRINT_URL', format: 'customer', sale_id: 123 }) });
    res.json({ id });
  });
  app.use('/api/escpos-print', router);
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  const server = http.createServer(app); const sockets = new Server(server);
  require('../src/modules/escpos-print/escpos-print.realtime').initialize(sockets, notifications);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = service.issueToken(1);
  const api = (url, body, credential = token) => fetch(base + '/api/escpos-print' + url, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let agent;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'escpos-test-'));
  t.after(async () => { if (agent) await agent.stop(); await new Promise(resolve => sockets.close(resolve)); await db.destroy(); fs.rmSync(directory, { recursive: true, force: true }); });
  assert.equal((await api('/config', undefined, 'bad-token')).status, 401);
  assert.equal((await api('/claim', { station_name: 'Printer B' })).status, 403);
  assert.equal((await fetch(base + '/api/escpos-print/download')).status, 401);
  assert.equal((await fetch(base + '/api/escpos-print/download', { headers: { 'x-test-user': 'viewer' } })).status, 403);
  const download = await fetch(base + '/api/escpos-print/download', { headers: { 'x-test-user': 'admin' } });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-disposition'), 'attachment; filename="agent.js"');
  const source = await download.text(); new vm.Script(source);
  assert.doesNotMatch(source, /setInterval|renderUrlToPdf|window\.print/);
  assert.match(source, /transports: \['websocket'\]/);
  const before = await (await api('/config')).json();
  assert.ok(before.assets[0].data_by_width[32]);
  await db('shops').where({ id: 1 }).update({ receipt_policies: 'New promotion' });
  const after = await (await api('/config')).json(); assert.notEqual(after.version, before.version);
  const insert = async (shopId, station, format = 'customer') => {
    const [id] = await db('print_queue').insert({ shop_id: shopId, station_name: station, status: 'pending', created_at: '2026-10-29', content_json: JSON.stringify({ type: 'PRINT_URL', format, sale_id: 123, items: format === 'kitchen' ? [{ name: 'Routed rice', quantity: 2 }] : undefined }, null, 2) }); return id;
  };
  const otherJob = await insert(2, 'Printer B');
  const shiftJob = await insert(1, 'Printer A', 'shift_close');
  const prints = [];
  let claims = 0;
  let httpPrintCalls = 0;
  agent = createAgent({ shopId: 1, shopName: 'Test Shop', serverUrl: base, token }, { encode }, {
    directory, connect: (...args) => { const socket = io(...args); socket.onAnyOutgoing(event => { if (event === 'print:claim') claims++; }); return socket; }, print: async (printer, data) => prints.push({ printer, data }),
    fetch: async (url, options) => { if (url.endsWith('/claim')) claims++; if (/\/claim$|\/confirm$/.test(url)) httpPrintCalls++; return fetch(url, options); }
  });
  await agent.start(0);
  const wait = async predicate => { const end = Date.now() + 5000; while (!await predicate()) { if (Date.now() > end) throw new Error('Timed out'); await new Promise(resolve => setTimeout(resolve, 20)); } };
  await wait(() => claims > 0);
  await new Promise(resolve => setTimeout(resolve, 50));
  const beforeWrongShop = claims;
  notifications.emit('available', { shop_id: 2, station_name: 'Printer A' });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(claims, beforeWrongShop, 'Other shops cannot wake this agent');
  const jobId = await insert(1, 'Printer A');
  notifications.emit('available', { shop_id: 1, station_name: 'Printer A' });
  await wait(async () => (await db('print_queue').where({ id: jobId }).first()).status === 'printed');
  assert.equal(prints.length, 1); assert.equal(prints[0].printer, 'Printer A'); assert.match(prints[0].data.toString(), /Shop 1 tea/);
  assert.equal(httpPrintCalls, 0, 'Job JSON and confirmation use WebSockets, not HTTP');
  // No manual notification, pause/resume, browser page or database trigger:
  // each completed order must wake the idle printer again.
  for (let order = 0; order < 3; order++) {
    const response = await fetch(base + '/api/sales/test-print', { method: 'POST', headers: { 'x-test-user': 'admin' } });
    const queued = await response.json();
    await wait(async () => (await db('print_queue').where({ id: queued.id }).first()).status === 'printed');
  }
  assert.equal(prints.length, 4, 'Consecutive orders wake without pause/resume');
  assert.equal((await db('print_queue').where({ id: otherJob }).first()).status, 'pending');
  assert.equal((await db('print_queue').where({ id: shiftJob }).first()).status, 'pending');
  const status = await (await api('/status')).json();
  assert.equal(status.counts.printed, 4);
  assert.ok(status.jobs.every(job => job.station_name === 'Printer A'));
  assert.ok(!JSON.stringify(status).includes('Printer B'));
  assert.ok(!status.jobs.some(job => Object.hasOwn(job, 'content_json')), 'Status does not expose raw receipt payloads');
  assert.equal((await api('/status', undefined, 'bad-token')).status, 401);
  await db('shops').where({ id: 1 }).update({ receipt_policies: 'Automatic settings refresh' });
  notifications.emit('configuration', { shop_id: 1 });
  await wait(() => JSON.parse(fs.readFileSync(path.join(directory, 'config.json'))).receipt.receipt_policies === 'Automatic settings refresh');
  await db('printers').insert({ shop_id: 1, display_name: 'New kitchen', system_name: 'Printer C' });
  notifications.emit('configuration', { shop_id: 1 });
  await wait(() => agent.state().config.printers.some(printer => printer.system_name === 'Printer C'));
  const kitchenId = await insert(1, 'Printer A', 'kitchen');
  const claimed = await service.documentFor(await db('print_queue').where({ id: kitchenId }).first(), 1);
  assert.equal(claimed.items[0].name, 'Routed rice');
  assert.equal((await api(`/${otherJob}/confirm`, {})).status, 404);
  notifications.emit('available', { shop_id: 1, station_name: 'Printer A' });
  await wait(async () => (await db('print_queue').where({ id: kitchenId }).first()).status === 'printed');
  const local = `http://127.0.0.1:${agent.server.address().port}`;
  assert.equal((await fetch(local + '/refresh', { method: 'POST', body: 'token=invalid' })).status, 403);
  const page = await (await fetch(local)).text(); assert.match(page, /Refresh Cache|Printer A/);
  const control = /name="token" value="([a-f0-9]+)"/.exec(page)[1];
  await db('shops').where({ id: 1 }).update({ logo_data: 'data:image/png;base64,invalid' });
  const cached = fs.readFileSync(path.join(directory, 'config.json'), 'utf8');
  assert.equal((await fetch(local + '/refresh', { method: 'POST', body: `token=${control}`, redirect: 'manual' })).status, 500);
  assert.equal(fs.readFileSync(path.join(directory, 'config.json'), 'utf8'), cached);
  await new Promise(resolve => setTimeout(resolve, 100)); const settledClaims = claims;
  await new Promise(resolve => setTimeout(resolve, 250)); assert.equal(claims, settledClaims, 'No periodic polling');
  assert.equal((await api(`/${jobId}/confirm`, {})).status, 200, 'Confirmation is idempotent');
});

test('lost confirmation never resubmits a receipt; interrupted RAW writes require review across restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'escpos-journal-'));
  const config = { schema: 1, shopId: 1, receipt: {}, printers: [{ system_name: 'Counter' }], assets: [] };
  const job = { id: 42, station_name: 'Counter', document: { type: 'CASH_DRAWER' } };
  let claimCount = 0, prints = 0, confirmCount = 0;
  const options = {
    directory, print: async () => { prints++; },
    fetch: async url => {
      if (url.endsWith('/config')) return { ok: true, json: async () => config };
      if (url.endsWith('/claim')) { claimCount++; return { ok: true, json: async () => claimCount === 1 ? job : null }; }
      if (url.endsWith('/confirm') && ++confirmCount === 1) throw new Error('Connection lost after spool accepted');
      return { ok: true, json: async () => ({ ok: true }) };
    }
  };
  try {
    let agent = createAgent({ shopId: 1, serverUrl: 'https://rms.test' }, { encode }, options);
    await agent.refresh(); await agent.drain('Counter');
    assert.equal(prints, 1); assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'jobs.json')))[42].state, 'submitted');
    agent = createAgent({ shopId: 1, serverUrl: 'https://rms.test' }, { encode }, options);
    await agent.drain('Counter'); assert.equal(prints, 1); assert.equal(confirmCount, 2);
    claimCount = 0; options.print = async () => { throw new Error('RAW write interrupted'); };
    fs.writeFileSync(path.join(directory, 'jobs.json'), '{}');
    agent = createAgent({ shopId: 1, serverUrl: 'https://rms.test' }, { encode }, options);
    await agent.drain('Counter');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'jobs.json')))[42].state, 'review');
    agent = createAgent({ shopId: 1, serverUrl: 'https://rms.test' }, { encode }, options);
    await agent.drain('Counter'); assert.equal(claimCount, 1, 'Review hold survives restart');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
