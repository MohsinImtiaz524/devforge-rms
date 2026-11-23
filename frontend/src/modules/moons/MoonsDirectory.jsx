import { MoonsSidebar } from './MoonsSidebar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Bell, Boxes, Check, ChevronDown, Image as ImageIcon, LayoutGrid, LogOut, Menu, Moon, Search, Settings, Store, Sun, X } from 'lucide-react';
import { api, legacyUrl } from '../../api/client';
import heroArtwork from './assets/moons-dashboard-hero.png';
import './marketplace.css';
import './directory-layout.css';
import FoodpandaIntegration from './FoodpandaIntegration';
import IntegrationCards from './IntegrationCards';

function directoryView() {const view=new URLSearchParams(location.search).get('tab');if(view==='discover')return 'store';if(view==='mine')return 'moons';return ['store','moons','integrations'].includes(view)?view:'home';}
const CATEGORIES = ['All','Insights','Sales','Operations','Marketing','Finance'];
const categoryLabel = moon => ({people:'Operations',insights:'Insights',web:'Marketing',other:'Operations'}[moon.category] || (moon.key === 'analytics' ? 'Insights' : 'Operations'));
const initials = name => name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase() || 'OS';
function priceLabel(price) {
  if (!price) return 'Pricing coming soon';
  if (Number(price.monthly_amount_minor) === 0) return 'Free';
  return price.currency+' '+(Number(price.monthly_amount_minor)/100).toLocaleString(undefined,{maximumFractionDigits:2})+' / month';
}
function Artwork({moon}) {
  const [failed,setFailed] = useState(false);
  const file=moon?.artwork?.find(item=>item.slot==='icon') || moon?.artwork?.find(item=>item.slot==='cover');
  return file && !failed ? <img src={file.preview_url} loading="lazy" decoding="async" alt="" onError={()=>setFailed(true)} className="market-moon-image"/> : <span className="market-art-placeholder" aria-hidden="true"><ImageIcon/></span>;
}
function Dialog({title,children,onClose}) {
  const dialog=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    const keydown=event=>{
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key==='Tab'){
        const controls=[...dialog.current.querySelectorAll('button:not(:disabled),a[href],input')];
        if(event.shiftKey && document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
        else if(!event.shiftKey && document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
      }
    };
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;previous?.focus();};
  },[onClose]);
  return <div className="market-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="market-dialog" role="dialog" aria-modal="true" aria-labelledby="market-dialog-title" ref={dialog}><header><h2 id="market-dialog-title">{title}</h2><button className="market-icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></header>{children}</section></div>;
}
export default function MoonsDirectory() {
  const [user,setUser]=useState(null),[items,setItems]=useState([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const [query,setQuery]=useState(''),[category,setCategory]=useState('All'),[tab,setTab]=useState(directoryView);
  const [drawer,setDrawer]=useState(false),[profile,setProfile]=useState(false),[dialog,setDialog]=useState(null);
  const [signingOut,setSigningOut]=useState(false);
  const [storeView,setStoreView]=useState('moons');
  const [foodpanda,setFoodpanda]=useState(null);
  const [canSubscribe,setCanSubscribe]=useState(false),[subscribing,setSubscribing]=useState(null),[notice,setNotice]=useState('');
  const subscribingRef=useRef(false);
  const [dark,setDark]=useState(()=>(document.cookie.match(/(?:^|; )rms_theme=(dark|light)(?:;|$)/)?.[1] || localStorage.getItem('theme'))==='dark');
  const profileRef=useRef(null),menuButton=useRef(null);
  const load=useCallback(async()=>{
    try{
      const directory=await api('/api/moons/directory');
      setUser(directory.user);setItems(directory.items);setCanSubscribe(Boolean(directory.can_subscribe));setError('');
      setFoodpanda(await api('/api/integrations/foodpanda'));
    }catch(requestError){if(requestError.status===401)location.replace(legacyUrl('/'));else setError(requestError.message);}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{let active=true;Promise.resolve().then(()=>{if(active)void load();});return()=>{active=false;};},[load]);
  useEffect(()=>{document.documentElement.classList.toggle('dark',dark);localStorage.setItem('theme',dark?'dark':'light');document.cookie='rms_theme='+(dark?'dark':'light')+'; Path=/; Max-Age=31536000; SameSite=Lax';},[dark]);
  useEffect(()=>{
    const outside=event=>{if(!profileRef.current?.contains(event.target))setProfile(false);};
    const keydown=event=>{if(event.key==='Escape'){setProfile(false);setDrawer(false);}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keydown);};
  },[]);
  async function logout(){
    if(signingOut)return;setSigningOut(true);
    try{await api('/api/auth/logout',{method:'POST'});location.replace(legacyUrl('/'));}
    catch(requestError){setError(requestError.message);setSigningOut(false);}
  }
  async function subscribe(moon){
    if(subscribingRef.current||!canSubscribe)return;
    subscribingRef.current=true;setSubscribing(moon.key);setError('');setNotice('');
    try{
      await api('/api/moons/directory/'+encodeURIComponent(moon.key)+'/subscribe',{method:'POST',body:{catalog_version:moon.version,price_id:moon.price.id}});
      const directory=await api('/api/moons/directory');
      setItems(directory.items);setCanSubscribe(Boolean(directory.can_subscribe));
      setDialog(null);selectTab('moons');setNotice(moon.name+' subscribed successfully. It is now in your Moons.');
    }catch(requestError){setError(requestError.message);}
    finally{subscribingRef.current=false;setSubscribing(null);}
  }
  function subscribeButton(moon){
    if(moon.subscription?.state==='active')return null;
    if(moon.launch_ready===false||!moon.price)return <span className="market-subscribe-unavailable">Coming soon</span>;
    return <button type="button" className="market-primary" aria-label={'Subscribe to '+moon.name} disabled={!canSubscribe||Boolean(subscribing)} onClick={()=>subscribe(moon)} title={canSubscribe?'Subscribe to '+moon.name:'Ask your shop administrator to subscribe'}>{subscribing===moon.key?'Subscribing...':'Subscribe'}<ArrowRight size={15}/></button>;
  }
  const name=user?.name || user?.username || 'Your account';
  const subscribed=items.filter(item=>item.subscription?.state==='active');
  const filtered=(tab==='moons'?subscribed:items.filter(item=>item.subscription?.state!=='active')).filter(item=>(category==='All'||categoryLabel(item)===category) && (item.name+' '+item.summary+' '+(item.description || '')).toLowerCase().includes(query.toLowerCase().trim()));
  const closeDrawer=useCallback(()=>setDrawer(false),[]);
  useEffect(()=>{const back=()=>setTab(directoryView());window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
  function selectTab(next){setTab(next);setQuery('');setCategory('All');const url=new URL(location.href);if(next==='home')url.searchParams.delete('tab');else url.searchParams.set('tab',next);history.pushState({},'',url);window.scrollTo({top:0,behavior:'instant'});}
  return <div className={'marketplace moons-directory '+(tab==='home'?'is-home':'')}>
    <MoonsSidebar user={user} drawerOpen={drawer} onClose={closeDrawer} onDiscover={()=>selectTab('home')} activeId={tab} items={[
      {key:'store',label:'Marketplace',icon:<Store size={21}/>,onClick:()=>selectTab('store')},
      {key:'moons',label:'Moons',icon:<Moon size={21}/>,count:subscribed.length,onClick:()=>selectTab('moons')},
      {key:'integrations',label:'Integrations',icon:<Boxes size={21}/>,onClick:()=>selectTab('integrations')},
      {key:'subscriptions',label:'Subscriptions',icon:<Settings size={21}/>,onClick:()=>setDialog({kind:'subscriptions'})}
    ]} >
      <div className="market-profile" ref={profileRef}>
        <div className="market-profile-row"><button className="market-profile-trigger" aria-expanded={profile} aria-label="Open account menu" onClick={()=>setProfile(value=>!value)}><span className="market-avatar">{initials(name)}</span><span><strong>{name}</strong><small>{user?.role || 'Account'}</small></span><ChevronDown size={15}/></button><a className="market-profile-notifications" title="Notifications" aria-label="Notifications" href={user?.role==='superadmin'?'/app/notifications':'/app/notification-inbox'}><Bell size={19}/></a></div>
        {profile&&<div className="market-profile-menu"><button onClick={()=>{setDark(value=>!value);setProfile(false);}}>{dark?<Sun size={17}/>:<Moon size={17}/>}Switch to {dark?'light':'dark'} mode</button><a href="/app/lobby"><LayoutGrid size={17}/>Switch workspace</a><button onClick={logout} disabled={signingOut}><LogOut size={17}/>{signingOut?'Signing out...':'Sign out'}</button></div>}
      </div>
    </MoonsSidebar>
    <div className="market-main">
      <button ref={menuButton} type="button" className="moons-mobile-navigation" aria-label="Open navigation" aria-expanded={drawer} onClick={()=>setDrawer(true)}><Menu size={21}/></button>
      {tab==='home'&&<section className="market-hero" aria-labelledby="market-hero-title"><div className="market-hero-copy"><p className="market-eyebrow">Your business, with more possibility</p><h2 id="market-hero-title">A little Moon.<br/>A whole new possibility.</h2><p>Discover helpful apps that bring new powers to your shop.</p><button className="market-primary" onClick={()=>selectTab('store')}>Explore your Moons<ArrowRight size={19}/></button></div>
        <div className="market-hero-art" aria-hidden="true"><img className="market-hero-combined" src={heroArtwork} fetchPriority="high" decoding="async" alt=""/></div>
      </section>}
      {tab!=='home'&&<div className="market-content">
        <div className="market-toolbar"><div className="market-view-heading"><h2>{tab==='integrations'?'Integrations':tab==='moons'?'Your Moons':'Marketplace'}</h2><p>{tab==='integrations'?'Your activated integrations and their records.':tab==='moons'?'Your subscribed Moons, all in one place.':'Discover new Moons, integrations and upcoming additions.'}</p></div>{tab==='store'?<div className="market-store-toggle" role="group" aria-label="Store catalog"><span className={'market-store-toggle-indicator '+(storeView==='integrations'?'is-integrations':'')} aria-hidden="true"/>{['moons','integrations'].map(view=><button key={view} type="button" aria-pressed={storeView===view} onClick={()=>setStoreView(view)}>{view==='moons'?'Moons':'Integrations'}</button>)}</div>:<button className="market-outline" onClick={()=>setDialog({kind:'subscriptions'})}><Settings size={18}/>Manage subscriptions</button>}</div>
        {notice&&<div className="market-subscription-notice" role="status"><Check size={17}/>{notice}</div>}
        {error&&<div className="market-error" role="alert"><span>{error}</span><button onClick={()=>{setLoading(true);void load();}}>Try again</button></div>}
        <section id="market-results" key={tab+storeView} className="market-catalog-transition" aria-label={tab==='integrations'||(tab==='store'&&storeView==='integrations')?'Integrations':'Moons catalog'}>
          {(tab==='moons'||(tab==='store'&&storeView==='moons'))&&<><div className="market-section-heading"><h2>{tab==='moons'?'Your Moons':'Explore Moons'}</h2><p>Extend your business with powerful new features.</p><span>{loading?'Finding your Moons...':filtered.length+(tab==='moons'?' in your workspace':' available')}</span></div><div className="market-filters"><label className="market-search"><Search size={19}/><input aria-label="Search Moons" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search Moons..."/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={15}/></button>}</label><div className="market-categories" aria-label="Moon categories">{CATEGORIES.map(value=><button key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{value}</button>)}</div></div>
          {loading?<div className="market-card-grid" aria-busy="true" aria-label="Loading Moons">{[1,2,3,4,5,6].map(id=><div className="market-card market-skeleton" key={id}><div/><span/><span/></div>)}</div>:filtered.length?<div className="market-card-grid">{filtered.map(moon=><article className="market-card" key={moon.key}><div className="market-card-top"><div className={'market-card-art art-'+(moon.category || 'insights')}><Artwork key={moon.artwork?.map(file=>file.id).join(',')} moon={moon}/></div><div className="market-card-copy"><div><h3><button className="market-card-title" onClick={()=>setDialog({kind:'moon',moon})} aria-label={'View details for '+moon.name}>{moon.name}</button></h3>{moon.subscription?.state==='active'?<span className="market-active">Subscribed</span>:moon.launch_ready===false?<span className="market-active">Coming soon</span>:null}</div><small>{categoryLabel(moon)}</small><p>{moon.summary}</p></div></div><footer><strong>{priceLabel(moon.price)}</strong>{tab==='store'?subscribeButton(moon):moon.can_open?<a href={moon.route} className="market-card-open" aria-label={'Open '+moon.name}>Open<ArrowUpRight size={14}/></a>:<button className="market-primary" onClick={()=>setDialog({kind:'moon',moon})}>View details</button>}</footer></article>)}</div>:<div className="market-empty"><Moon size={32}/><h3>{query || category!=='All'?'No matching Moons':tab==='moons'?'Your next possibility starts here':'Your next Moon is on its way'}</h3><p>{query || category!=='All'?'Try another search or category.':tab==='moons'?'Your active subscriptions will appear here. Explore new Moons in the Marketplace.':'New Moons will appear here when they launch.'}</p>{(query||category!=='All')?<button className="market-outline" onClick={()=>{setQuery('');setCategory('All');}}>Clear filters</button>:tab==='moons'?<button className="market-primary" onClick={()=>selectTab('store')}>Browse Marketplace<ArrowRight size={16}/></button>:user?.role==='superadmin'&&<a className="market-card-open" href="/app/moons/manage">Manage catalog</a>}</div>}</>}
          {(tab==='integrations'||(tab==='store'&&storeView==='integrations'))&&<section className="market-integrations integration-catalog is-expanded"><div><h2>{tab==='store'?'Discover integrations':'Your integrations'}</h2><p>{tab==='store'?'Upcoming services and integrations you can enable.':'Open your connected tools and preserved records.'}</p></div><IntegrationCards loading={loading} view={tab==='store'?'store':'enabled'} onBrowseStore={()=>selectTab('store')} foodpanda={foodpanda} onSelect={label=>label==='Foodpanda'&&(foodpanda?.enabled||foodpanda?.activated)?location.assign('/app/integrations/foodpanda'):setDialog({kind:'integration',name:label})}/></section>}
        </section>
        <footer className="market-page-footer"><span>Small additions. Bigger possibilities.</span>{user?.role==='superadmin'&&<a href="/app/moons/manage">Manage Moon catalog<ArrowUpRight size={13}/></a>}</footer>
      </div>}
    </div>
    {dialog&&<Dialog title={dialog.kind==='moon'?dialog.moon.name:dialog.kind==='subscriptions'?'Your Moon subscriptions':dialog.kind==='help'?'A little help with Moons':dialog.name+' integration'} onClose={()=>setDialog(null)}>
      {dialog.kind==='integration'&&dialog.name==='Foodpanda'?<FoodpandaIntegration/>:dialog.kind==='moon'?<div className="market-dialog-body"><div className="market-dialog-art"><Artwork moon={dialog.moon}/></div><p>{dialog.moon.description || dialog.moon.summary}</p><ul>{dialog.moon.features.map(feature=><li key={feature}><Check size={16}/>{feature}</li>)}</ul><strong>{priceLabel(dialog.moon.price)}</strong><p>Activation only. No payment is collected and no invoice is created.</p>{error&&<p role="alert">{error}</p>}{dialog.moon.subscription?.state!=='active'?subscribeButton(dialog.moon):dialog.moon.can_open?<a className="market-primary" href={dialog.moon.route}>Open {dialog.moon.name}<ArrowUpRight size={16}/></a>:<p>Ask your shop administrator for access to this Moon.</p>}</div>:<div className="market-dialog-body"><p>{dialog.kind==='subscriptions'?'Subscribe to available Moons in the Marketplace to add them to your Moons list. Activation does not collect payment or create invoices.':dialog.kind==='help'?'Browse new additions in Marketplace, find subscribed apps in Moons, and open activated services in Integrations. Your shop administrator manages your permissions.':dialog.name+' is not available to connect yet. It will appear here when setup is ready.'}</p><button className="market-outline" onClick={()=>setDialog(null)}>Got it</button></div>}
    </Dialog>}
  </div>;
}
