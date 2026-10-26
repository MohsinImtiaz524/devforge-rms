const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { r2Config, uploadConfig } = require('./files.config');
const { fail } = require('./files.policies');
function createStorage() {
  const settings = r2Config();
  const timeout=uploadConfig().storageTimeoutMs;
  if (!settings) fail(503, 'Private R2 storage is not configured.', 'STORAGE_UNAVAILABLE');
  const client = new S3Client({ region:'auto', endpoint:settings.endpoint, forcePathStyle:true,
    credentials:{accessKeyId:settings.accessKeyId,secretAccessKey:settings.secretAccessKey},
    requestChecksumCalculation:'WHEN_REQUIRED', responseChecksumValidation:'WHEN_REQUIRED',
    requestHandler:{connectionTimeout:Math.min(5000,timeout),requestTimeout:timeout}, maxAttempts:2 });
  const bucket = settings.bucket;
  return {
    async uploadUrl(key, type, seconds) { return getSignedUrl(client, new PutObjectCommand({ Bucket:bucket, Key:key, ContentType:type }), { expiresIn:seconds, signableHeaders:new Set(['content-type']) }); },
    async downloadUrl(key, filename) { return getSignedUrl(client, new GetObjectCommand({Bucket:bucket,Key:key,ResponseContentDisposition:`attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`}), {expiresIn:60}); },
    async read(key, limit) {
      const controller=new AbortController();let stream;const timer=setTimeout(()=>{controller.abort();stream?.destroy?.();},timeout);
      try {
      const result = await client.send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:controller.signal});
      stream = result.Body;
        if (Number(result.ContentLength) > limit) fail(413,'File exceeds its size limit.','FILE_TOO_LARGE');
        const chunks=[]; let size=0;
        for await (const chunk of stream) { size+=chunk.length; if(size>limit) fail(413,'File exceeds its size limit.','FILE_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
        return Buffer.concat(chunks);
      } finally { clearTimeout(timer);stream?.destroy?.(); }
    },
    async put(key, buffer, type) { await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:buffer,ContentType:type}),{abortSignal:AbortSignal.timeout(timeout)}); },
    async remove(key) { await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(30000)}); },
    close() { client.destroy(); }
  };
}
module.exports = { createStorage };
