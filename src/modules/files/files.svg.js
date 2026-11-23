// Conservative SVG subset for platform icons; accepted bytes are preserved.
function validateSvg(bytes) {
 const original=bytes.toString('utf8');
 const source=require('./files.svg-source').svgSource(bytes);
 if(!Buffer.from(original).equals(bytes)||/[&]|<!|<\?|(?:javascript|data):/i.test(source))throw Error('Unsupported SVG content');
 const tags=new Set('svg g path rect circle ellipse line polyline polygon defs linearGradient radialGradient stop clipPath title desc'.split(' '));
 const attrs=new Set('xmlns xmlns:xlink xml:space version viewBox width height x y x1 y1 x2 y2 cx cy r rx ry d points fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity transform id offset stop-color stop-opacity gradientUnits gradientTransform clip-path preserveAspectRatio'.split(' '));
 const stack=[];let offset=0,root=false;
 for(const match of source.matchAll(/<[^>]*>/g)){
  if(source.slice(offset,match.index).trim() && !['title','desc'].includes(stack.at(-1)))throw Error('Unexpected SVG text');
  offset=match.index+match[0].length;
  const token=/^<(\/)?([A-Za-z][A-Za-z0-9]*)([\s\S]*?)(\/?)>$/.exec(match[0]);
  if(!token||!tags.has(token[2]))throw Error('Unsupported SVG element');
  const [,closing,tag,body,self]=token;
  if(closing){if(body.trim()||self||stack.pop()!==tag)throw Error('Invalid SVG nesting');continue;}
  if(!stack.length){if(root||tag!=='svg')throw Error('Invalid SVG root');root=true;}
  let rest=body;
  while(rest.trim()){
   const attr=/^\s+([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(rest);
   if(!attr||!attrs.has(attr[1]))throw Error('Unsupported SVG attribute');
   const value=attr[2]??attr[3];
   const namespace=(attr[1]==='xmlns'&&value==='http://www.w3.org/2000/svg')||(attr[1]==='xmlns:xlink'&&value==='http://www.w3.org/1999/xlink');
   if(/[<>\\]|@|\/\*|(?:https?:|\/\/)/i.test(value)&&!namespace)throw Error('External SVG content');
   if(/url\s*\(/i.test(value)&&!/^url\(#[A-Za-z_][\w-]*\)$/.test(value))throw Error('External SVG reference');
   rest=rest.slice(attr[0].length);
  }
  if(!self)stack.push(tag);
 }
 if(!root||stack.length||source.slice(offset).trim())throw Error('Invalid SVG');
 return {bytes,mime:'image/svg+xml',width:null,height:null};
}
module.exports={validateSvg};
