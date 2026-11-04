const { fail } = require('./files.policies');
function r2Config() {
  const names=['R2_BUCKET_NAME','R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'];
  const values=names.map(name=>String(process.env[name]||'').trim());
  if(!values.every(Boolean))fail(503,'Configure all four R2 settings before enabling file uploads.','STORAGE_UNAVAILABLE');
  let endpoint;try{endpoint=new URL(values[1]);}catch{fail(503,'Invalid private R2 endpoint.','STORAGE_UNAVAILABLE');}
  if(endpoint.protocol!=='https:'||!/^[a-z0-9.-]+\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)||!['','/'].includes(endpoint.pathname)||endpoint.port||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)fail(503,'Use the private Cloudflare R2 S3 API endpoint.','STORAGE_UNAVAILABLE');
  return {bucket:values[0],endpoint:endpoint.origin,accessKeyId:values[2],secretAccessKey:values[3]};
}
function uploadConfig(){
 const number=(name,fallback,min,max)=>{const value=Number(process.env[name]||fallback);if(!Number.isSafeInteger(value)||value<min||value>max)fail(503,'Invalid file pipeline configuration: '+name,'FILES_CONFIGURATION');return value;};
 return {storageTimeoutMs:number('FILES_STORAGE_TIMEOUT_MS',30000,1000,120000),imageConcurrency:number('FILES_IMAGE_CONCURRENCY',1,1,2),imageQueueLimit:number('FILES_IMAGE_QUEUE_LIMIT',4,0,20),maxPending:number('FILES_MAX_PENDING_UPLOADS',20,1,100),scopeQuotaBytes:number('FILES_SCOPE_QUOTA_BYTES',1073741824,20971520,1099511627776),uploadTtlSeconds:number('FILES_UPLOAD_TTL_SECONDS',900,60,900),unattachedHours:number('FILES_UNATTACHED_RETENTION_HOURS',24,1,720),maxAttempts:number('FILES_JOB_MAX_ATTEMPTS',5,1,10),workerIntervalMs:number('FILES_WORKER_INTERVAL_MS',5000,1000,60000),cleanupIntervalMs:number('FILES_CLEANUP_INTERVAL_MS',3600000,60000,86400000)};
}
module.exports={r2Config,uploadConfig};
