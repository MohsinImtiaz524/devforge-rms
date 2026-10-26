// Only these raster encodings may reach the native image decoder.
const formats=Object.freeze({
 'image/jpeg':{format:'jpeg',extension:'.jpg',matches:b=>b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255},
 'image/png':{format:'png',extension:'.png',matches:b=>b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
 'image/webp':{format:'webp',extension:'.webp',matches:b=>b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'},
 'image/gif':{format:'gif',extension:'.gif',matches:b=>b.length>=6&&['GIF87a','GIF89a'].includes(b.toString('ascii',0,6))},
});
function matches(bytes,mime){return Object.hasOwn(formats,mime)&&formats[mime].matches(bytes);}
module.exports={formats,matches};
