const test=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {verify}=require('../src/modules/files/files.verification');
const {policy}=require('../src/modules/files/files.policies');
const {normalizedDataImage}=require('../utils/verified-image-upload');
const safety=require('../public/js/image-safety');
test('image verification strips trailing payloads and EXIF and rejects mismatched image formats',async()=>{
 const original=await sharp({create:{width:8,height:6,channels:3,background:'#abc'}}).withExif({IFD0:{Copyright:'private-metadata-marker'}}).jpeg().toBuffer();
 const result=await verify(Buffer.concat([original,Buffer.from('<script>payload-marker</script>')]),'image/jpeg',100000);
 assert.equal(result.bytes.includes(Buffer.from('payload-marker')),false);assert.equal(result.bytes.includes(Buffer.from('private-metadata-marker')),false);
 const metadata=await sharp(result.bytes).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);
 await assert.rejects(verify(original,'image/png',100000),{publicCode:'INVALID_FILE'});
});
test('GIF artwork preserves animation within limits while single-image logo policy rejects animation',async()=>{
 const frames=Buffer.alloc(2*2*3*2);frames.fill(255,0,12);frames.fill(80,12);
 const gif=await sharp(frames,{raw:{width:2,height:4,channels:3,pageHeight:2}}).gif({delay:[80,120],loop:0}).toBuffer();
 assert.equal((await sharp(gif,{animated:true}).metadata()).pages,2);
 const result=await verify(gif,'image/gif',100000,policy('announcement.artwork'));
 assert.equal((await sharp(result.bytes,{animated:true}).metadata()).pages,2);assert.equal(result.height,2);
 await assert.rejects(verify(gif,'image/gif',100000,{...policy('announcement.artwork'),maxFrames:1}),{publicCode:'INVALID_FILE'});
});
test('legacy base64 images use the same decoder and receipt values cannot break HTML attributes',async()=>{
 await assert.rejects(normalizedDataImage('x" onerror="alert(1)'),{publicCode:'INVALID_IMAGE'});
 await assert.rejects(normalizedDataImage('data:image/svg+xml;base64,PHN2Zy8+'),{publicCode:'INVALID_IMAGE'});
 const png=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();
 assert.match(await normalizedDataImage('data:image/png;base64,'+png.toString('base64')),/^data:image\/png;base64,/);
 assert.equal(safety.attribute('x" onerror="alert(1)'), '');assert.equal(safety.source('javascript:alert(1)'), '');
 assert.equal(safety.escape('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
 assert.equal(safety.source('/uploads/receipt-assets/shop-1.png'),'/uploads/receipt-assets/shop-1.png');
});
test('legacy multipart upload publishes only decoded images with server-generated extensions',async()=>{
 const express=require('express'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'rms-image-upload-'));
 const app=express();app.use((req,res,next)=>{req.session={user:{id:1,shop_id:1}};next();});
 app.post('/image',require('../utils/verified-image-upload').createVerifiedImageUpload({directory,prefix:'test',maxBytes:100000}).single('image'),(req,res)=>res.json({filename:req.file.filename,type:req.file.mimetype}));
 app.use((error,req,res,next)=>{res.status(error.status||400).json({code:error.publicCode||'INVALID_FILE'});});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/image';
 try{
  const png=await sharp({create:{width:3,height:2,channels:3,background:'red'}}).png().toBuffer();
  const valid=new FormData();valid.append('image',new Blob([png],{type:'image/png'}),'misleading.pnghtml');const response=await fetch(url,{method:'POST',body:valid});assert.equal(response.status,200);const file=await response.json();assert.match(file.filename,/^test-1-[a-f0-9-]+\.png$/);assert.equal((await sharp(await fs.readFile(path.join(directory,file.filename))).metadata()).format,'png');
  const invalid=new FormData();invalid.append('image',new Blob(['<html>not an image</html>'],{type:'image/png'}),'fake.png');assert.equal((await fetch(url,{method:'POST',body:invalid})).status,415);assert.equal((await fs.readdir(directory)).length,1);
 }finally{await new Promise(r=>server.close(r));for(const name of await fs.readdir(directory))await fs.unlink(path.join(directory,name));await fs.rmdir(directory);}
});

test('large and differently proportioned images shrink to fit without cropping or enlargement',async()=>{
 const wide=await sharp({create:{width:6000,height:1000,channels:3,background:'blue'}}).png().toBuffer();
 const result=await verify(wide,'image/png',policy('announcement.artwork').maxBytes,policy('announcement.artwork'));
 assert.equal(result.width,4000);assert.equal(result.height,667);assert.ok(Math.abs(result.width/result.height-6)<0.01);
 const portrait=await sharp({create:{width:600,height:1500,channels:3,background:'green'}}).png().toBuffer();
 const preserved=await verify(portrait,'image/png',1000000);assert.equal(preserved.width,600);assert.equal(preserved.height,1500);
 const extreme={...policy('announcement.artwork'),maxDecodedPixels:5000000};await assert.rejects(verify(wide,'image/png',extreme.maxBytes,extreme),{publicCode:'INVALID_FILE'});
});
