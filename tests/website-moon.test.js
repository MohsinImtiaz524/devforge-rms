const test = require('node:test');
const assert = require('node:assert/strict');
const { configuration, defaults, save } = require('../src/modules/moons/website/website.schema');
const { configuredDomain, hostname, websiteLabel } = require('../src/modules/moons/website/website.hosts');
const { renderWebsite } = require('../src/modules/moons/website/website.render');
test('Website Moon configuration only accepts approved fields and template IDs', () => {
  assert.equal(configuration.parse(defaults()).template,'signature');
  for (const patch of [{template:'uploaded-code'},{tenantId:2},{primaryColor:'red; background:url(https://evil.test)'},{logo:'../../private'},{heroImage:'https://evil.test/a.png'},{socialUrls:['javascript:alert(1)']},{socialUrls:['https://instagram.com.evil.test']},{socialUrls:['https://user:secret@instagram.com']},{heroHeading:'x'.repeat(161)}]) assert.equal(configuration.safeParse({...defaults(),...patch}).success,false);
  assert.equal(save.safeParse({revision:0,subdomain:'admin',configuration:defaults()}).success,false);
  assert.equal(save.safeParse({revision:0,subdomain:'my-shop',configuration:defaults(),shop_id:2}).success,false);
});
test('Website Moon renders hostile text as inert escaped text with script-free CSP', () => {
  const result = renderWebsite({...defaults(),businessName:'<script>alert(1)</script>',heroHeading:'<img src=x onerror=alert(1)>',heroDescription:'</style><script>evil()</script>'});
  assert.ok(!result.html.includes('<script>'));
  assert.ok(!result.html.includes('<img src=x'));
  assert.ok(result.html.includes('&lt;script&gt;'));
  assert.match(result.headers['Content-Security-Policy'],/script-src 'none'/);
  assert.match(result.headers['Content-Security-Policy'],/style-src 'nonce-/);
  assert.equal(result.headers['Cache-Control'],'private, no-store');
});
test('Website Moon hostname authority rejects ambiguous hosts and nested labels', () => {
  const domain = configuredDomain('sites.example.test');
  assert.equal(websiteLabel('SHOP.sites.example.test:443',domain),'shop');
  for (const host of ['shop.sites.example.test.evil.test','shop.other.test','a.b.sites.example.test','sites.example.test','shop.sites.example.test,evil.test','shop.sites.example.test.','https://shop.sites.example.test','shop.sites.example.test:99999']) assert.equal(websiteLabel(host,domain),null,host);
  assert.equal(hostname('user@shop.sites.example.test'),null);
  for(const invalid of ['https://sites.test','sites.test/path','sites.test:443','localhost','*.sites.test','']) assert.throws(()=>configuredDomain(invalid));
});
test('Website Moon private previews use authenticated asset routes and deny indexing', () => {
  const logo='b7916f26-230d-4f09-b450-e1c52bd7ffab';
  const result=renderWebsite({...defaults(),logo},{preview:true});
  assert.ok(result.html.includes('/api/moons/website/assets/'+logo));
  assert.ok(result.html.includes('noindex,nofollow'));
  assert.match(result.headers['Content-Security-Policy'],/frame-ancestors 'self'/);
});
