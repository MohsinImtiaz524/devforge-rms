(function(root){
  function escape(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function source(value){
    if(typeof value!=='string')return '';
    if(/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return value;
    if(/^\/?uploads\/(?:receipt-assets|products)\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp|gif)$/i.test(value))return '/'+value.replace(/^\//,'');
    if(/^\/api\/files\/[a-f0-9-]{36}\/content$/.test(value))return value;
    if(value.startsWith('blob:')&&root.location&&value.startsWith('blob:'+root.location.origin+'/'))return value;
    return '';
  }
  const api={escape,source,attribute:value=>escape(source(value))};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.RmsImageSafety=api;
})(globalThis);
