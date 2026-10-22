const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const storage = require('../src/modules/announcements/announcements.storage');

test('local image round trip, traversal protection, and partial R2 configuration', async () => {
  const names = ['R2_BUCKET_NAME', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'ANNOUNCEMENT_MEDIA_DIR'];
  const saved = names.map(name => process.env[name]);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'announcement-storage-'));
  try {
    names.forEach(name => delete process.env[name]);
    process.env.ANNOUNCEMENT_MEDIA_DIR = dir;
    const bytes = Buffer.from('test image');
    const key = await storage.put(bytes, '.png', 'image/png');
    assert.deepEqual(await storage.read(key), bytes);
    await assert.rejects(storage.read('../outside.png'), /Invalid announcement/);
    process.env.R2_BUCKET_NAME = 'test';
    await assert.rejects(storage.put(bytes, '.png', 'image/png'), /all four/);
    // Existing local images remain readable even if remote configuration is incomplete.
    assert.deepEqual(await storage.read(key), bytes);
    await storage.remove(key);
    await assert.rejects(storage.read(key), { code: 'ENOENT' });
    process.env.R2_ENDPOINT = 'https://example.com';
    process.env.R2_ACCESS_KEY_ID = 'test';
    process.env.R2_SECRET_ACCESS_KEY = 'test';
    assert.throws(() => storage.config(), /Cloudflare HTTPS/);
  } finally {
    names.forEach((name, i) => saved[i] === undefined ? delete process.env[name] : process.env[name] = saved[i]);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
