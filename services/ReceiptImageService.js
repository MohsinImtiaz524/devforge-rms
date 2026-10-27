const sharp = require('sharp');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const safety = require('../public/js/image-safety');

// 560 pixels covers the existing 70mm layout at 203dpi. Keep colour and alpha
// so preparing a receipt never changes the original artwork or background.
const VERSION = 1;
const MAX_BYTES = 5 * 1024 * 1024;
function fingerprint(source) {
  return createHash('sha256').update(`${VERSION}:${source}`).digest('hex');
}
async function prepareImage(source) {
  const safe = safety.source(source);
  let bytes;
  if (safe.startsWith('data:')) {
    if (safe.length > Math.ceil(MAX_BYTES / 3) * 4 + 100) return null;
    bytes = Buffer.from(safe.slice(safe.indexOf(',') + 1), 'base64');
  } else if (/^\/uploads\/receipt-assets\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp|gif)$/i.test(safe)) {
    const file = path.join(__dirname, '..', 'public', safe);
    if ((await fs.stat(file)).size > MAX_BYTES) return null;
    bytes = await fs.readFile(file);
  } else return null; // Never fetch arbitrary URLs or session-protected files.
  const optimized = await sharp(bytes, { limitInputPixels: 32000000 })
    .rotate().resize({ width: 560, height: 560, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${optimized.toString('base64')}`;
}
function parse(value, fallback) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || fallback; }
  catch (_) { return fallback; }
}
async function prepareShopImages(db, shop) {
  if (!shop?.id) return shop;
  const parsedImages = parse(shop.receipt_images_json, shop.receipt_images || []);
  const images = Array.isArray(parsedImages) ? parsedImages : [];
  const sources = [...new Set([shop.logo_data || shop.logo_path, ...images.map(image => image.path)].filter(Boolean))];
  const previous = parse(shop.receipt_print_assets_json, {});
  const prepared = {};
  for (const source of sources) {
    const key = fingerprint(source);
    if (safety.source(previous[key]).startsWith('data:')) prepared[key] = previous[key];
    else {
      // Invalid/missing legacy artwork must never prevent a bill from printing.
      try { const data = await prepareImage(source); if (data) prepared[key] = data; }
      catch (_) {}
    }
  }
  const serialized = JSON.stringify(prepared);
  if (serialized !== JSON.stringify(previous)) {
    // Compare the source fields as well as the tenant, so an in-flight print
    // cannot overwrite copies prepared by a concurrent settings update.
    const match = { id: shop.id };
    for (const field of ['logo_data', 'logo_path', 'receipt_images_json']) {
      if (Object.hasOwn(shop, field)) match[field] = shop[field];
    }
    // Derivatives are disposable; a storage failure must not block a receipt.
    await db('shops').where(match).update({ receipt_print_assets_json: serialized }).catch(() => {});
  }
  const logo = shop.logo_data || shop.logo_path;
  return { ...shop, logo_data: prepared[fingerprint(logo || '')] || shop.logo_data,
    receipt_images: images.map(image => ({ ...image, path: prepared[fingerprint(image.path || '')] || image.path })) };
}
async function refreshShopImages(db, shopId) {
  const shop = await db('shops').where({ id: Number(shopId) }).first();
  if (shop) await prepareShopImages(db, shop);
}
module.exports = { prepareImage, prepareShopImages, refreshShopImages };
