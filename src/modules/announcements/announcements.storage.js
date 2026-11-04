const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

function config() {
  const names = ['R2_BUCKET_NAME', 'R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  const values = names.map(name => (process.env[name] || '').trim());
  if (!values.some(Boolean)) return null;
  if (!values.every(Boolean)) throw new Error('Set all four R2 environment variables before uploading announcement images.');
  let endpoint;
  try { endpoint = new URL(values[1]); } catch { throw new Error('R2_ENDPOINT must be a valid HTTPS S3 API endpoint.'); }
  if (endpoint.protocol !== 'https:' || !/^[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname) || !['', '/'].includes(endpoint.pathname) || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
    throw new Error('R2_ENDPOINT must be the Cloudflare HTTPS S3 API endpoint without a bucket path.');
  }
  return { bucket: values[0], endpoint: endpoint.origin, accessKeyId: values[2], secretAccessKey: values[3] };
}
function client(settings) {
  return new S3Client({ region: 'auto', endpoint: settings.endpoint, forcePathStyle: true,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 }, maxAttempts: 2 });
}
function localPath(key) {
  const root = path.resolve(process.env.ANNOUNCEMENT_MEDIA_DIR || path.join(process.cwd(), 'data', 'announcement-media'));
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid announcement media storage key.');
  return { root, full };
}
async function remote(command) {
  const settings = config();
  if (!settings) throw new Error('R2 configuration is required to access this announcement image.');
  const s3 = require('../request-monitor/request-monitor.service').monitor.instrumentS3(client(settings));
  try {
    const result = await s3.send(command(settings.bucket));
    if (result.Body) return Buffer.from(await result.Body.transformToByteArray());
    return result;
  } finally { s3.destroy(); }
}
async function put(buffer, ext, contentType) {
  const name = `${crypto.randomUUID()}${ext}`;
  if (config()) {
    const key = `announcements/${name}`;
    await remote(Bucket => new PutObjectCommand({ Bucket, Key: key, Body: buffer, ContentType: contentType }));
    return `r2:${key}`;
  }
  const { root, full } = localPath(name);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(full, buffer, { flag: 'wx' });
  return name;
}
async function read(key) {
  if (!key.startsWith('r2:')) return fs.readFile(localPath(key).full);
  return remote(Bucket => new GetObjectCommand({ Bucket, Key: key.slice(3) }));
}
async function remove(key) {
  if (!key.startsWith('r2:')) return fs.unlink(localPath(key).full);
  return remote(Bucket => new DeleteObjectCommand({ Bucket, Key: key.slice(3) }));
}
module.exports = { put, read, remove, config };
