const { subdomain } = require('./website.schema');
function configuredDomain(raw = process.env.WEBSITE_DOMAIN) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value || value.length > 253 || value.includes(':') || !value.includes('.') || !value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('WEBSITE_DOMAIN must be a DNS domain without a scheme, port or path.');
  return value;
}
// Use the actual Host header, never X-Forwarded-Host or tenant query parameters.
function hostname(raw) {
  if (typeof raw !== 'string' || raw.length > 260 || /[\s,@/\\?#]/.test(raw)) return null;
  const match = /^([a-z0-9.-]+)(?::([0-9]{1,5}))?$/i.exec(raw);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return null;
  return match[1].toLowerCase();
}
function websiteLabel(host, domain) {
  const name = hostname(host);
  if (!name || !name.endsWith('.' + domain)) return null;
  const label = name.slice(0, -(domain.length + 1));
  return subdomain.safeParse(label).success ? label : null;
}
function websiteOrigin(label, domain) { return `https://${subdomain.parse(label)}.${configuredDomain(domain)}`; }
function localPathsEnabled() { return process.env.NODE_ENV !== 'production' && process.env.WEBSITE_LOCAL_PATHS === 'true'; }
function localWebsitePath(label) { return `/app/moon/${subdomain.parse(label)}/website`; }
module.exports = { localPathsEnabled, localWebsitePath, configuredDomain, hostname, websiteLabel, websiteOrigin };
