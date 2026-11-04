const { performance } = require('node:perf_hooks');
function createHealthService({ database, storage, runtime, now = Date.now, ttlMs = 10000 }) {
  let cached, expires = 0, pending;
  async function probe(id, name, check) {
    const started = performance.now();
    try { return { id, name, ...(await check()), durationMs: Math.round(performance.now() - started) }; }
    catch { return { id, name, status: 'error', detail: 'Check failed or timed out. Inspect server/provider logs; credentials and internal errors are hidden.', durationMs: Math.round(performance.now() - started) }; }
  }
  async function snapshot() {
    if (cached && now() < expires) return { ...cached, cached: true };
    if (pending) return pending;
    pending = (async () => {
      const checks = await Promise.all([
        probe('database', 'Database', database),
        probe('storage', 'Cloudflare R2', storage),
        probe('runtime', 'Backend and integrations', runtime),
      ]);
      cached = { checkedAt: new Date(now()).toISOString(), cached: false, checks };
      expires = now() + ttlMs;
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  }
  return { snapshot };
}
function createRuntimeHealthService() {
  const db = require('../../../db/knex');
  return createHealthService({
    database: async () => {
      await db.raw('SELECT 1').timeout(4000, { cancel: db.client.config.client === 'pg' });
      const pool = db.client.pool;
      return { status: 'ok', detail: 'Database responded to SELECT 1. This does not prove every query or tenant workflow is healthy.',
        data: { client: db.client.config.client, connectionsUsed: pool?.numUsed?.() ?? null,
          connectionsFree: pool?.numFree?.() ?? null, waitingRequests: pool?.numPendingAcquires?.() ?? null } };
    },
    storage: async () => {
      if (process.env.FILES_ENABLED !== 'true') return { status: 'disabled', detail: 'Shared file uploads are disabled; storage was not contacted.' };
      const { r2Config } = require('../files/files.config');
      let settings;
      try { settings = r2Config(); } catch { return { status: 'warning', detail: 'R2 configuration is missing or invalid.' }; }
      const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({ region: 'auto', endpoint: settings.endpoint, forcePathStyle: true,
        credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
        maxAttempts: 1, requestHandler: { connectionTimeout: 2000, requestTimeout: 4000 } });
      require('../request-monitor/request-monitor.service').monitor.instrumentS3(client);
      try {
        await client.send(new HeadBucketCommand({ Bucket: settings.bucket }), { abortSignal: AbortSignal.timeout(4000) });
        return { status: 'ok', detail: 'Read-only bucket probe succeeded. Upload, download, CORS and file verification still need an actual upload test.' };
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 403) return { status: 'warning', detail: 'R2 denied the bucket probe. This token may lack bucket-check permission; upload access is not proven broken.' };
        throw error;
      } finally { client.destroy(); }
    },
    runtime: async () => {
      const orders = require('../../../services/OrderRealtimeService');
      const printing = require('../../../services/RealtimePrintService');
      const worker = require('../files/files.worker').getFilesWorkerStatus();
      const postgres = process.env.DB_CLIENT === 'postgres';
      return { status: 'ok', detail: 'Local process snapshot only. Provider account health and other backend instances are not checked.', data: {
        host: process.env.RENDER ? 'Render' : 'Other/local', uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: Math.round(process.memoryUsage().rss / 1048576),
        webSockets: { initialized: Boolean(orders.io), connectedTransports: orders.io?.engine?.clientsCount ?? 0 },
        printing: { listener: !postgres ? 'not applicable' : printing.listener ? 'connected (delivery not verified)' : 'disconnected', lastNotificationAt: printing.lastNotificationAt },
        fileWorker: { enabled: process.env.FILES_ENABLED === 'true', ...worker },
        pushNotifications: { status: 'not tested', detail: 'Delivery requires a subscribed test device; this check sends no notifications.' },
        providerAccounts: 'Render deployment, Neon billing, Cloudflare DNS/CDN and external account status are not verified.'
      } };
    },
  });
}
module.exports = { createHealthService, createRuntimeHealthService };
