const sharp=require('sharp');
const {formats,matches}=require('./files.image-formats');
async function validate(input,expected,rules) {
  const bytes=Buffer.from(input);
  if(!matches(bytes,expected))throw new Error('Unsupported image signature.');
  if(!rules.types.includes(expected))throw new Error('Unsupported image type.');
  sharp.cache(false);sharp.concurrency(1);
  const metadata=await sharp(bytes,{limitInputPixels:rules.maxDecodedPixels,failOn:'warning',animated:true}).metadata();
  const frames=metadata.pages||1,height=metadata.pageHeight||metadata.height;
  if(metadata.format!==formats[expected].format||!metadata.width||!height||frames>rules.maxFrames||metadata.width*height*frames>rules.maxDecodedPixels)throw new Error('Invalid image format or dimensions.');
  const rotated=[5,6,7,8].includes(metadata.orientation),sourceWidth=rotated?height:metadata.width,sourceHeight=rotated?metadata.width:height;
  let scale=Math.min(1,rules.maxDimension/sourceWidth,rules.maxDimension/sourceHeight,Math.sqrt(rules.maxPixels/(sourceWidth*sourceHeight)));
  if(!rules.autoResize&&scale<1)throw new Error('Image exceeds output dimensions.');
  for(let attempt=0;attempt<5;attempt++){
    const width=Math.max(1,Math.round(sourceWidth*scale)),targetHeight=Math.max(1,Math.round(sourceHeight*scale));
    const result=await sharp(bytes,{limitInputPixels:rules.maxDecodedPixels,failOn:'warning',animated:frames>1}).rotate().resize({width,height:targetHeight,fit:'inside',withoutEnlargement:true}).toFormat(metadata.format).toBuffer({resolveWithObject:true});
    const outputHeight=result.info.pageHeight||Math.round(result.info.height/(result.info.pages||1)),pixels=result.info.width*outputHeight;
    if(result.data.length<=rules.maxBytes&&pixels<=rules.maxPixels)return {bytes:result.data,mime:expected,width:result.info.width,height:outputHeight};
    if(!rules.autoResize)break;
    scale*=Math.min(0.9,Math.sqrt(rules.maxBytes/result.data.length)*0.95,Math.sqrt(rules.maxPixels/pixels)*0.95);
  }
  throw new Error('Image cannot be fitted within processing limits.');
}
if(require.main===module) {
  process.once('message',async message=>{
    try{const result=await validate(message.bytes,message.expected,message.rules);process.send({result},()=>process.disconnect());}
    catch{process.send({invalid:true},()=>process.disconnect());}
  });
}
module.exports={validate};
