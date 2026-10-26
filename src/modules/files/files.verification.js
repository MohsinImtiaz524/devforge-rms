const { fork }=require('node:child_process');
const { fail,imageDefaults,stillTypes }=require('./files.policies');
let active=0;const waiting=[];
async function acquire(){
 const config=require('./files.config').uploadConfig();
 if(active<config.imageConcurrency){active++;return;}
 if(waiting.length>=config.imageQueueLimit)fail(429,'Image processing is busy. Please retry shortly.','PROCESSING_BUSY');
 await new Promise(resolve=>waiting.push(resolve));
}
function release(){const next=waiting.shift();if(next)next();else active--;}
// A separate process contains decoder crashes and has a hard wall-clock deadline.
// It is not an OS sandbox: deployment memory limits and patched decoders remain required.
async function verify(bytes,expected,limit,rules={...imageDefaults,types:stillTypes,maxBytes:limit}) {
  if(!rules.types.includes(expected)||!expected.startsWith('image/'))fail(415,'Only supported images are allowed.','TYPE_NOT_ALLOWED');
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>limit)fail(413,'Image exceeds its size limit.','FILE_TOO_LARGE');
  if(!require('./files.image-formats').matches(bytes,expected))fail(415,'Image bytes do not match the selected format.','INVALID_FILE');
  await acquire();
  try{return await new Promise((resolve,reject)=>{
    const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','TMPDIR','HOME'])if(process.env[key])env[key]=process.env[key];
    const child=fork(require.resolve('./files.verify-worker'),[],{execArgv:['--max-old-space-size=128'],env,serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
    let settled=false;
    const timer=setTimeout(()=>done(Object.assign(new Error('Image processing timed out.'),{status:415,publicCode:'INVALID_FILE'})),rules.processingTimeoutMs);
    function done(error,result){if(settled)return;settled=true;clearTimeout(timer);child.kill('SIGKILL');if(error)reject(error);else resolve({...result,bytes:Buffer.from(result.bytes)});}
    child.once('message',message=>{
      if(message.invalid||!message.result||message.result.bytes.length>limit)return done(Object.assign(new Error('Image is corrupt or exceeds processing limits.'),{status:415,publicCode:'INVALID_FILE'}));
      done(null,message.result);
    });
    const failed=()=>done(Object.assign(new Error('Image processing failed.'),{status:415,publicCode:'INVALID_FILE'}));
    child.once('error',failed);child.once('exit',failed);
    child.send({bytes,expected,rules},error=>{if(error)failed();});
  });}finally{release();}
}
module.exports={verify};
