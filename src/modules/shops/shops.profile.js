// Keep existing shop columns as the shared source for profile and receipts.
function validateProfile(body) {
  const values = {};
  const limits = {name:200, receipt_header_text:200, receipt_extended_name:300, receipt_phone:80, receipt_address:1000, google_maps_url:2048};
  for (const [key,max] of Object.entries(limits)) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].trim().length > max) return {error:`Invalid ${key.replaceAll('_',' ')} (maximum ${max} characters).`};
    values[key] = body[key].trim();
  }
  if (values.name !== undefined) {
    if (!values.name) return {error:'Shop name is required.'};
    values.receipt_header_text = values.name;
  }
  if (values.google_maps_url) {
    try {
      const url = new URL(values.google_maps_url);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== 'https:' || url.username || url.password || !(
        host === 'g.page' || host === 'maps.app.goo.gl' || host === 'goo.gl' && url.pathname.startsWith('/maps') ||
        host === 'maps.google.com' || (host === 'google.com' || host === 'www.google.com') && url.pathname.startsWith('/maps')
      )) throw new Error();
    } catch { return {error:'Enter a valid HTTPS Google Maps link.'}; }
  }
  return {values};
}
module.exports = {validateProfile};
