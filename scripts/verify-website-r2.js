// Explicit live-storage opt-in only. No database access or application asset writes.
// Creates, reads and removes exactly one generated object under a dedicated test prefix.
require('dotenv').config({quiet:true});
const crypto=require('node:crypto');
const sharp=require('sharp');
const {verify}=require('../src/modules/files/files.verification');
const {imageDefaults,stillTypes}=require('../src/modules/files/files.policies');
const {createStorage}=require('../src/modules/files/files.storage');
async function main(){
 if(process.env.WEBSITE_R2_VERIFICATION_APPROVED!=='true')throw new Error('Not run: explicit approval is required before a live R2 verification object is written.');
 const key='website-moon-verification/'+crypto.randomUUID()+'/verified-image';
 if(!/^website-moon-verification\/[a-f0-9-]{36}\/verified-image$/.test(key))throw new Error('Invalid verification key.');
 const source=await sharp({create:{width:8,height:8,channels:3,background:'#6338ed'}}).png().toBuffer();
 const verified=await verify(source,'image/png',100000,{...imageDefaults,types:stillTypes,maxBytes:100000,maxFrames:1});
 const storage=createStorage();let attempted=false,primaryError;
 try{
  attempted=true;await storage.put(key,verified.bytes,verified.mime);
  const actual=await storage.read(key,100000);
  if(!actual.equals(verified.bytes))throw new Error('Verification image did not round-trip exactly.');
  const metadata=await sharp(actual).metadata();if(metadata.width!==8||metadata.height!==8)throw new Error('Verification image dimensions changed.');
  console.log('PASS: verified PNG upload, private adapter read, byte integrity and raster decode.');
 }catch(error){primaryError=error;throw error;}
 finally{
  try{if(attempted){await storage.remove(key);console.log('Verification object removed:',key);}}
  catch(cleanupError){console.error('Verification object requires operator cleanup:',key);if(!primaryError)throw cleanupError;}
  finally{storage.close();}
 }
}
main().catch(error=>{console.error('Website Moon R2 verification failed:',error.publicCode||error.code||error.message);process.exitCode=1;});
