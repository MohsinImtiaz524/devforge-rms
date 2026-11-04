const { z } = require('zod');
const TEMPLATES = Object.freeze([
  Object.freeze({id:'premium-restaurant',name:'Premium Restaurant',description:'A rich food banner, photo menu, category navigation and restaurant footer.',previewUrl:'/website-templates/premium-restaurant/preview.webp',preset:{primaryColor:'#c70816',secondaryColor:'#ffd43b',backgroundColor:'#ffffff',textColor:'#181818',heroHeading:'Fresh flavor.\nMade for you.',heroDescription:'Explore our menu and find your next favorite.',primaryCtaLabel:'Explore Menu',primaryCtaHref:'#menu'}}),
  Object.freeze({ id: 'signature', name: 'Signature', description: 'A bold introduction for restaurants and shops.' }),
  Object.freeze({ id: 'studio', name: 'Studio', description: 'A quiet, editorial layout for your business.' }),
  Object.freeze({ id: 'neighbourhood', name: 'Neighbourhood', description: 'A welcoming layout that puts contact details first.' }),
]);
const text = max => z.string().trim().max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'Unsupported control character.');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color.');
const asset = z.union([z.string().uuid(), z.literal('')]);
const social = z.union([z.literal(''), z.url().max(500).refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && ['facebook.com','www.facebook.com','instagram.com','www.instagram.com','tiktok.com','www.tiktok.com','youtube.com','www.youtube.com','youtu.be','x.com','www.x.com','linkedin.com','www.linkedin.com'].includes(url.hostname); } catch { return false; }
}, 'Use an HTTPS link to a supported social network.')]);
const safeLink=z.union([z.literal(''),z.string().max(500).refine(value=>{
 if(/^#[a-z][a-z0-9-]*$/i.test(value))return ['#home','#menu','#deals','#about','#contact'].includes(value);
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
},'Use HTTPS or an approved page section link.')]);
const menuItem=z.object({name:text(160).min(1),category:text(80),description:text(500),price:z.string().regex(/^\d{1,8}\.\d{2}$/),image:z.union([asset,z.enum(Object.keys(require('./premium.assets').sharedPhotos))]).default(''),label:z.enum(['','New','Popular','Best Seller','Featured','Limited Time','Spicy','Vegetarian','Customizable']).default(''),available:z.boolean().default(true),isDeal:z.boolean().default(false),originalPrice:z.union([z.literal(''),z.string().regex(/^\d{1,8}\.\d{2}$/)]).default('')}).strict().refine(item=>!item.originalPrice||Number(item.originalPrice)>Number(item.price),'Original price must exceed the current price.');
const configuration = z.object({
  template: z.enum(TEMPLATES.map(item => item.id)),
  businessName: text(100).min(1), logo: asset, tagline: text(160),
  primaryColor: color, secondaryColor: color, backgroundColor: color, textColor: color,
  heroHeading: text(160).min(1), heroDescription: text(1500), heroImage: asset,
  phone: text(40).refine(value => !value || /^[+\d() .-]+$/.test(value), 'Invalid phone number.'),
  email: z.union([z.literal(''), z.email().max(254)]), address: text(500),
  socialUrls: z.array(social).max(6),
  menuCurrency: z.string().regex(/^[A-Z]{3}$/).default('PKR'),
  menuItems:z.array(menuItem).max(100).default([]),
  primaryCtaLabel:text(40).default('Explore Menu'),primaryCtaHref:safeLink.default('#menu'),secondaryCtaLabel:text(40).default(''),secondaryCtaHref:safeLink.default('#contact'),
  heroAlignment:z.enum(['left','center','right']).default('left'),heroOverlay:z.number().min(0).max(0.8).default(0.15),stickyHeader:z.boolean().default(true),
  announcement:z.object({enabled:z.boolean().default(false),text:text(200).default(''),backgroundColor:color.default('#b6000b'),textColor:color.default('#ffffff'),href:safeLink.default('')}).strict().default({enabled:false,text:'',backgroundColor:'#b6000b',textColor:'#ffffff',href:''}),
  aboutHeading:text(100).default('Made with care.'),aboutText:text(2000).default(''),openingHours:text(300).default(''),mapUrl:safeLink.default(''),
  footerDescription:text(500).default(''),copyrightLabel:text(160).default(''),
  policyLinks:z.object({terms:safeLink.default(''),privacy:safeLink.default(''),refund:safeLink.default('')}).strict().default({terms:'',privacy:'',refund:''}),
}).strict();
const subdomain = z.string().min(3).max(50).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine(value => !['www','app','api','admin','mail','support','assets','static','cdn','status','orbit','localhost'].includes(value), 'This subdomain is reserved.');
const save = z.object({ revision: z.number().int().nonnegative(), subdomain, configuration }).strict();
const transition = z.object({ revision: z.number().int().positive() }).strict();
function defaults(name = 'Your business') {
  return configuration.parse({template:'signature',businessName:name,logo:'',tagline:'A little closer to you.',primaryColor:'#6338ed',secondaryColor:'#e8dfc9',backgroundColor:'#fffdf8',textColor:'#202022',heroHeading:'Something good starts here.',heroDescription:'Welcome to our corner of the neighbourhood.',heroImage:'',phone:'',email:'',address:'',socialUrls:[]});
}
module.exports = { TEMPLATES, configuration, subdomain, save, transition, defaults };
