const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {defaults,configuration,TEMPLATES}=require('../src/modules/moons/website/website.schema');
const {renderWebsite}=require('../src/modules/moons/website/website.render');
const {premiumDemo}=require('../src/modules/moons/website/premium.demo');
const {ownedAssetIds,createTemplateAssetHandler}=require('../src/modules/moons/website/premium.assets');
test('Premium Restaurant is registered and old website configurations receive safe defaults',()=>{
 assert.ok(TEMPLATES.some(item=>item.id==='premium-restaurant'));const c=configuration.parse(defaults());assert.equal(c.announcement.enabled,false);assert.equal(c.primaryCtaLabel,'Explore Menu');assert.deepEqual(c.menuItems,[]);
});
test('Premium Restaurant configuration rejects executable links, fake discounts and unknown fields',()=>{
 for(const patch of [{primaryCtaHref:'javascript:alert(1)'},{primaryCtaHref:'//evil.test'},{primaryCtaHref:'https://user:password@example.com'},{heroOverlay:1},{announcement:{enabled:true,text:'hi',backgroundColor:'red; color:black',textColor:'#ffffff',href:''}},{policyLinks:{terms:'data:text/html,evil',privacy:'',refund:''}},{menuItems:[{name:'Pizza',category:'',description:'',price:'500.00',originalPrice:'400.00'}]},{menuItems:[{name:'Pizza',category:'',description:'',price:'500.00',image:'/uploads/private-image.png'}]},{script:'alert(1)'}])assert.equal(configuration.safeParse({...defaults(),...patch}).success,false);
});
test('Premium Restaurant renderer escapes text, controls scripts with CSP, and only displays real configured promotions',()=>{
 const c=premiumDemo();c.businessName='<script>evil()</script>';c.announcement.text='</style><img src=x onerror=alert(1)>';c.menuItems[0].name='Pizza <img src=x onerror=alert(1)>';
 const rendered=renderWebsite(c);assert.ok(!rendered.html.includes('<script>evil'));assert.ok(rendered.html.includes('&lt;script&gt;evil'));assert.ok(!rendered.html.includes('<img src=x'));assert.match(rendered.headers['Content-Security-Policy'],/script-src 'nonce-/);assert.match(rendered.headers['Content-Security-Policy'],/connect-src 'none'/);assert.ok(!rendered.html.includes('Add to Cart'));assert.ok(!rendered.html.includes('Checkout'));assert.ok(rendered.html.includes('20% OFF'));assert.ok(!rendered.html.includes('25% OFF'));
 const noOffers=renderWebsite({...defaults(),template:'premium-restaurant'});assert.ok(!noOffers.html.includes('pr-hero-offer'));assert.ok(!noOffers.html.includes('pr-announcement">'));assert.ok(!noOffers.html.includes('Free delivery'));assert.ok(!noOffers.html.includes('id="deals"'));
});
test('Product photo references participate in tenant ownership, except exact approved shared images',()=>{
 const id='b7916f26-230d-4f09-b450-e1c52bd7ffab',c=premiumDemo();c.menuItems[0].image=id;assert.deepEqual(ownedAssetIds(c),[id]);c.menuItems[0].image='premium:pizza';assert.deepEqual(ownedAssetIds(c),[]);
});
test('Approved template assets are served without sessions and reject unknown paths and writes',async()=>{
 const app=express();let sessions=0;app.use(createTemplateAssetHandler());app.use((req,res)=>{sessions++;res.status(401).end();});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{let res=await fetch(base+'/website-templates/premium-restaurant/hero.webp');assert.equal(res.status,200);assert.equal(res.headers.get('set-cookie'),null);assert.match(res.headers.get('content-type'),/image\/webp/);assert.equal((await fetch(base+'/website-templates/premium-restaurant/private.env')).status,404);assert.equal((await fetch(base+'/website-templates/premium-restaurant/hero.webp',{method:'POST'})).status,405);assert.equal(sessions,0);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
