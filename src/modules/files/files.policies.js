const MB = 1024 * 1024;
const imageDefaults = { maxDimension:4000, maxPixels:16000000, maxFrames:1, maxDecodedPixels:32000000, autoResize:true, processingTimeoutMs:15000, inline:true };
const stillTypes = ['image/jpeg','image/png','image/webp'];
const definitions = {
  'moon.icon': { ...imageDefaults, types:stillTypes, maxBytes:2*MB, maxCount:1, maxTotalBytes:2*MB, scope:'platform', authority:'platform_admin' },
  'moon.cover': { ...imageDefaults, types:stillTypes, maxBytes:5*MB, maxCount:1, maxTotalBytes:5*MB, scope:'platform', authority:'platform_admin' },
  'moon.screenshot': { ...imageDefaults, types:stillTypes, maxBytes:5*MB, maxCount:6, maxTotalBytes:30*MB, scope:'platform', authority:'platform_admin' },
  'announcement.artwork': { ...imageDefaults, types:[...stillTypes,'image/gif'], maxBytes:8*MB, maxCount:1, maxTotalBytes:8*MB, maxFrames:100, maxDecodedPixels:32000000, scope:'platform', authority:'platform_admin' },
  'announcement.attachment': { ...imageDefaults, types:stillTypes, maxBytes:10*MB, maxCount:5, maxTotalBytes:50*MB, scope:'platform', authority:'platform_admin' },
  'employee.avatar': { ...imageDefaults, types:stillTypes, maxBytes:5*MB, maxCount:1, maxTotalBytes:5*MB, scope:'tenant' },
  'employee.document': { ...imageDefaults, types:['image/jpeg','image/png'], maxBytes:10*MB, maxCount:10, maxTotalBytes:100*MB, scope:'tenant' },
  'company.logo': { ...imageDefaults, types:stillTypes, maxBytes:5*MB, maxCount:1, maxTotalBytes:5*MB, scope:'tenant' },
};
const policies=Object.freeze(Object.fromEntries(Object.entries(definitions).map(([name,p])=>[name,Object.freeze({...p,types:Object.freeze([...p.types])})])));
function fail(status,message,code){const error=new Error(message);Object.assign(error,{status,publicCode:code});throw error;}
function policy(purpose){if(!Object.hasOwn(policies,purpose))fail(400,'Unknown upload purpose.','TYPE_NOT_ALLOWED');return policies[purpose];}
function scope(user,purpose,{allowTenant=false}={}) {
  const rules=policy(purpose);
  if(!user?.id)fail(401,'Unauthorized','UNAUTHORIZED');
  if(rules.authority==='platform_admin'&&user.role!=='superadmin')fail(403,'Only platform administrators may upload these files.','FORBIDDEN');
  if(rules.scope==='platform')return 'platform';
  const shop=Number(user.shop_id);if(!Number.isSafeInteger(shop)||shop<=0)fail(403,'Select a restaurant first.','FORBIDDEN');
  if(!allowTenant)fail(409,'This upload purpose has not been migrated yet.','PURPOSE_NOT_ENABLED');
  return `shop:${shop}`;
}
function projection(purpose){const p=policy(purpose);return {purpose,types:p.types,maxBytes:p.maxBytes,maxCount:p.maxCount,maxTotalBytes:p.maxTotalBytes,maxDimension:p.maxDimension,autoResize:p.autoResize,maxFrames:p.maxFrames};}
module.exports={imageDefaults,stillTypes,policies,policy,scope,projection,fail};
