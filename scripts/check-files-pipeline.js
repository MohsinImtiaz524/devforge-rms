// Read-only deployment preflight. Does not upload objects or change schemas/configuration.
require('dotenv').config({quiet:true});
const {r2Config,uploadConfig}=require('../src/modules/files/files.config');
const {S3Client,HeadBucketCommand,GetBucketCorsCommand}=require('@aws-sdk/client-s3');
async function main(){
 const config=r2Config();uploadConfig();const bytes=await require('sharp')({create:{width:2,height:2,channels:3,background:'white'}}).png().toBuffer();await require('../src/modules/files/files.verification').verify(bytes,'image/png',10240);console.log('PASS: native image decoder and child-process verification work.');console.log('PASS: private R2 configuration and operational limits are valid.');
 const args=process.argv.slice(2);if(!args.includes('--remote')){console.log('Remote checks not requested. Use --remote --origin=https://your-frontend to check bucket/CORS metadata.');return;}
 const input=args.find(arg=>arg.startsWith('--origin='));if(!input)throw Error('Provide the exact frontend origin with --origin.');const origin=new URL(input.slice(9));if(origin.origin!==input.slice(9)||origin.protocol!=='https:')throw Error('Use an exact HTTPS origin without a path.');
 const s3=new S3Client({region:'auto',endpoint:config.endpoint,forcePathStyle:true,credentials:{accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey},requestHandler:{connectionTimeout:5000,requestTimeout:10000},maxAttempts:1});
 try{
  await s3.send(new HeadBucketCommand({Bucket:config.bucket}));console.log('PASS: bucket is reachable with configured credentials.');
  const result=await s3.send(new GetBucketCorsCommand({Bucket:config.bucket}));
  const matches=(result.CORSRules||[]).some(rule=>rule.AllowedOrigins?.includes(origin.origin)&&['PUT','GET'].every(m=>rule.AllowedMethods?.includes(m))&&rule.AllowedHeaders?.some(h=>h.toLowerCase()==='content-type'));
  if(!matches)throw Error('Bucket CORS does not explicitly allow the frontend origin, PUT/GET and Content-Type.');
  if((result.CORSRules||[]).some(rule=>rule.AllowedOrigins?.includes('*')))throw Error('Wildcard bucket origins are present; review private upload CORS.');
  console.log('PASS: bucket CORS explicitly allows the supplied frontend origin and required methods/headers.');
  console.log('Still required: browser PUT, verified content preview, recipient permissions, replacement, and cleanup on a staging bucket. Bucket privacy is configured separately in Cloudflare.');
 }finally{s3.destroy();}
}
main().catch(()=>{console.error('FAIL: preflight failed. Check server configuration, bucket access/CORS, and origin. Credentials and signed URLs are intentionally omitted.');process.exitCode=1;});
