const crypto = require('node:crypto');
const sharp = require('sharp');
const db = require('../../../db/knex');
const sales = require('../../../services/SalesService');
const { prepareImage } = require('../../../services/ReceiptImageService');
const templates = require('./receipt-templates.json');
const { validateTemplates } = require('./escpos-encoder');
const { prepareData } = require('./escpos-print.data');
validateTemplates(templates);

const SETTINGS = ['id', 'name', 'currency', 'receipt_header_text', 'receipt_extended_name',
  'receipt_phone', 'receipt_address', 'receipt_policies', 'use_logo_on_receipt', 'use_text_on_receipt',
  'receipt_font_family', 'header_font_size', 'header_font_weight', 'header_spacing',
  'extended_name_font_size', 'extended_name_font_weight', 'extended_name_spacing',
  'contact_font_size', 'contact_align', 'contact_padding', 'footer_font_size', 'footer_font_style',
  'footer_margin', 'divider_style', 'divider_width', 'section_gap', 'logo_print_width_mm', 'google_maps_url',
  'customer_bill_printer', 'unpaid_bill_printer'];
function secret() {
  const value = process.env.PRINT_AGENT_SECRET || process.env.SESSION_SECRET
    || (process.env.NODE_ENV !== 'production' ? 'dev-only-session-secret-change-me' : null);
  if (!value) throw new Error('Configure PRINT_AGENT_SECRET or SESSION_SECRET before downloading an ESC/POS agent.');
  return value;
}
function issueToken(shopId) {
  const body = Buffer.from(JSON.stringify({ purpose: 'escpos', shopId, expires: Date.now() + 180 * 86400000 })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret()).update(body).digest('base64url')}`;
}
function verifyToken(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 2) return null;
    const actual = Buffer.from(parts[1], 'base64url');
    const expected = crypto.createHmac('sha256', secret()).update(parts[0]).digest();
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const identity = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return identity.purpose === 'escpos' && Number.isSafeInteger(identity.shopId) && identity.shopId > 0
      && identity.expires > Date.now() ? identity : null;
  } catch (_) { return null; }
}
async function raster(source, width = 560, height = 200) {
  const prepared = await prepareImage(source);
  if (!prepared) throw new Error('Receipt artwork is missing or unsupported. Re-upload it in RMS.');
  const { data, info } = await sharp(Buffer.from(prepared.split(',')[1], 'base64'))
    .flatten({ background: '#fff' }).resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .greyscale().threshold(160).raw().toBuffer({ resolveWithObject: true });
  const stride = Math.ceil(info.width / 8);
  const bits = Buffer.alloc(stride * info.height);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * info.channels] < 128) bits[y * stride + (x >> 3)] |= 0x80 >> (x % 8);
  }
  return Buffer.concat([Buffer.from([0x1d, 0x76, 0x30, 0, stride & 255, stride >> 8, info.height & 255, info.height >> 8]), bits]).toString('base64');
}
async function configuration(shopId) {
  const [shop, printers] = await Promise.all([
    db('shops').where({ id: shopId }).first(),
    db('printers').where({ shop_id: shopId }).select('id', 'display_name', 'system_name').orderBy('id')
  ]);
  if (!shop) throw new Error('Shop not found');
  const receipt = Object.fromEntries(SETTINGS.map(key => [key, shop[key]]));
  receipt.use_logo_on_receipt = Boolean(shop.use_logo_on_receipt);
  receipt.use_text_on_receipt = Boolean(shop.use_text_on_receipt);
  const assets = [];
  if (receipt.use_logo_on_receipt && (shop.logo_data || shop.logo_path)) {
    const width = Math.round(Math.min(110, Math.max(10, Number(shop.logo_print_width_mm) || 60)) * 8);
    const source = shop.logo_data || shop.logo_path;
    assets.push({ kind: 'logo', data_by_width: {
      48: await raster(source, width, Math.round(width * 22 / 60)),
      32: await raster(source, Math.min(384, width), Math.round(Math.min(384, width) * 22 / 60))
    } });
  }
  let images = shop.receipt_images_json || [];
  if (typeof images === 'string') images = JSON.parse(images);
  for (const image of Array.isArray(images) ? images : []) {
    assets.push({ kind: 'promotion', description: image.description || '', data_by_width: {
      48: await raster(image.path), 32: await raster(image.path, 384, 200)
    } });
  }
  const payload = { schema: 1, shopId, receipt, printers, assets, templates, timeZone: process.env.APP_TIME_ZONE || 'Asia/Karachi' };
  return { ...payload, version: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}
async function documentFor(job, shopId) {
  const content = JSON.parse(job.content_json);
  if (content.type === 'CASH_DRAWER') return { type: 'CASH_DRAWER' };
  if (content.format === 'shift_close') {
    const shiftId = Number(content.shift_id);
    if (!Number.isSafeInteger(shiftId) || shiftId <= 0) throw new Error('Invalid shift summary job');
    const details = await require('../../../services/ShiftService').getShiftDetails(shopId, shiftId);
    if (!details?.shift || details.shift.status !== 'closed') throw new Error('Closed shift not found');
    return { type: 'RECEIPT', format: 'shift_close', data: require('./escpos-shift.data').prepareShiftData(details) };
  }
  if (!['customer', 'unpaid', 'kitchen'].includes(content.format) || !content.sale_id) {
    throw new Error('This job is not a supported sale receipt. Use the existing agent for other document types.');
  }
  if (content.format === 'kitchen' && content.sale_snapshot && Array.isArray(content.items)
      && Number(content.sale_snapshot.id) === Number(content.sale_id)) {
    const document = { type: 'RECEIPT', format: 'kitchen', sale: content.sale_snapshot,
      items: content.items, route_label: content.route_label, is_update: Boolean(content.is_update) };
    return { ...document, data: prepareData(document, {}, process.env.APP_TIME_ZONE || 'Asia/Karachi') };
  }
  const bill = await sales.getBill(content.sale_id, shopId, { receiptOnly: true, paymentQuotes: content.format === 'unpaid' });
  if (!bill) throw new Error('Sale not found');
  // Kitchen jobs contain the exact routed lines, including add/remove updates.
  if (content.format === 'kitchen' && !Array.isArray(content.items)) throw new Error('Kitchen job has no routed item snapshot');
  const document = { type: 'RECEIPT', format: content.format, payment_quotes: bill.payment_quotes, sale: bill.sale, seller: bill.seller,
    items: content.format === 'kitchen' ? content.items : bill.items,
    route_label: content.route_label, is_update: Boolean(content.is_update) };
  return { ...document, data: prepareData(document, bill.shop, process.env.APP_TIME_ZONE || 'Asia/Karachi') };
}
module.exports = { issueToken, verifyToken, configuration, documentFor, raster };
