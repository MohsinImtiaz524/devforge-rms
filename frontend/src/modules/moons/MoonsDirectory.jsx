import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Bell, Bike, Boxes, Check, ChevronDown, CircleHelp, FileText, Image as ImageIcon, LayoutGrid, LogOut, Menu, Moon, Search, Settings, Sun, MessageCircle, X } from 'lucide-react';
import { api, legacyUrl } from '../../api/client';
import heroArtwork from './assets/moons-dashboard-hero.png';
import './marketplace.css';

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
  const [query,setQuery]=useState(''),[category,setCategory]=useState('All'),[tab,setTab]=useState('discover');
  const [drawer,setDrawer]=useState(false),[profile,setProfile]=useState(false),[dialog,setDialog]=useState(null);
  const [signingOut,setSigningOut]=useState(false);
  const [dark,setDark]=useState(()=>(document.cookie.match(/(?:^|; )rms_theme=(dark|light)(?:;|$)/)?.[1] || localStorage.getItem('theme'))==='dark');
  const profileRef=useRef(null),resultsRef=useRef(null),menuButton=useRef(null);
  const load=useCallback(async()=>{
    try{
      const directory=await api('/api/moons/directory');
      setUser(directory.user);setItems(directory.items);setError('');
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
  useEffect(()=>{
    if(!drawer)return;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const trigger=menuButton.current;
    const sidebar=document.querySelector('.market-sidebar');
    sidebar?.querySelector('a')?.focus();
    const trap=event=>{
      if(event.key!=='Tab')return;
      const controls=[...sidebar.querySelectorAll('a[href],button:not(:disabled)')];
      if(event.shiftKey && document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
      else if(!event.shiftKey && document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
    };
    document.addEventListener('keydown',trap);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',trap);trigger?.focus();};
  },[drawer]);
  async function logout(){
    if(signingOut)return;setSigningOut(true);
    try{await api('/api/auth/logout',{method:'POST'});location.replace(legacyUrl('/'));}
    catch(requestError){setError(requestError.message);setSigningOut(false);}
  }
  const name=user?.name || user?.username || 'Your account';
  const subscribed=items.filter(item=>item.subscription?.state==='active');
  const filtered=(tab==='mine'?subscribed:items).filter(item=>(category==='All'||categoryLabel(item)===category) && (item.name+' '+item.summary+' '+(item.description || '')).toLowerCase().includes(query.toLowerCase().trim()));
  function selectTab(next){setTab(next);setQuery('');setCategory('All');}
  return <div className="marketplace">
    {drawer&&<button className="market-sidebar-scrim" aria-label="Close navigation" onClick={()=>setDrawer(false)}/>}
    <aside className={'market-sidebar '+(drawer?'is-open':'')} aria-label="Workspace sidebar">
      <a className="market-brand" href="/app/lobby">Orbit<span>OS</span></a>
      <div className="market-shop"><Moon size={22}/><span><strong>Moons workspace</strong><small>{user?.shop_name || 'My shop'}</small></span></div>
      <p className="market-nav-label">Your Moons</p>
      <nav className="market-navigation" aria-label="Moons navigation">
        {[{key:'discover',label:'Discover',icon:LayoutGrid},{key:'mine',label:'My Moons',icon:Moon},{key:'integrations',label:'Integrations',icon:Boxes}].map(({key,label,icon:Icon})=><button key={key} className={tab===key?'is-active':''} aria-pressed={tab===key} onClick={()=>{selectTab(key);setDrawer(false);}}><Icon size={21}/>{label}{key==='mine'&&<span className="market-nav-count">{subscribed.length}</span>}</button>)}
        <button onClick={()=>{setDialog({kind:'subscriptions'});setDrawer(false);}}><Settings size={21}/>Subscriptions</button>
      </nav>
      <div className="market-sidebar-bottom"><button onClick={()=>{setDialog({kind:'help'});setDrawer(false);}}><CircleHelp size={20}/>Moons help</button><a href="/app/lobby"><ArrowLeft size={20}/>Back to workspace</a></div>
      <div className="market-profile" ref={profileRef}>
        <button className="market-profile-trigger" aria-expanded={profile} aria-label="Open account menu" onClick={()=>setProfile(value=>!value)}><span className="market-avatar">{initials(name)}</span><span><strong>{name}</strong><small>{user?.role || 'Account'}</small></span><ChevronDown size={15}/></button>
        {profile&&<div className="market-profile-menu"><button onClick={()=>{setDark(value=>!value);setProfile(false);}}>{dark?<Sun size={17}/>:<Moon size={17}/>}Switch to {dark?'light':'dark'} mode</button><a href="/app/lobby"><LayoutGrid size={17}/>Switch workspace</a><button onClick={logout} disabled={signingOut}><LogOut size={17}/>{signingOut?'Signing out...':'Sign out'}</button></div>}
      </div>
    </aside>
    <div className="market-main">
      <header className="market-topbar"><div><button ref={menuButton} className="market-icon-button market-menu-toggle" aria-label="Open navigation" aria-expanded={drawer} onClick={()=>setDrawer(value=>!value)}><Menu size={21}/></button><a href="/app/lobby">Workspace</a><span>/</span><h1>Moons</h1></div><div><a className="market-icon-button" aria-label="Notifications" href={user?.role==='superadmin'?'/app/notifications':'/app/notification-inbox'}><Bell size={21}/></a><span className="market-avatar" aria-label={name}>{initials(name)}</span></div></header>
      <section className="market-hero" aria-labelledby="market-hero-title"><div className="market-hero-copy"><p className="market-eyebrow">Your business, with more possibility</p><h2 id="market-hero-title">A little Moon.<br/>A whole new possibility.</h2><p>Discover helpful apps that bring new powers to your shop.</p><button className="market-primary" onClick={()=>{selectTab('discover');resultsRef.current?.scrollIntoView({behavior:'smooth',block:'start'});}}>Explore your Moons<ArrowRight size={19}/></button></div>
        <div className="market-hero-art" aria-hidden="true"><img className="market-hero-combined" src={heroArtwork} fetchPriority="high" decoding="async" alt=""/></div>
      </section>
      <div className="market-content" ref={resultsRef}>
        <div className="market-toolbar"><div className="market-tabs" role="tablist" aria-label="Moons views">{[{key:'discover',label:'Discover'},{key:'mine',label:'My Moons'},{key:'integrations',label:'Integrations'}].map(item=><button id={'market-tab-'+item.key} key={item.key} role="tab" aria-selected={tab===item.key} aria-controls="market-results" tabIndex={tab===item.key?0:-1} onKeyDown={event=>{const tabs=['discover','mine','integrations'];if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'discover':event.key==='End'?'integrations':tabs[(tabs.indexOf(tab)+(event.key==='ArrowRight'?1:2))%3];selectTab(next);document.getElementById('market-tab-'+next)?.focus();}}} onClick={()=>selectTab(item.key)}>{item.label}{item.key==='mine'&&<span>{subscribed.length}</span>}</button>)}</div><button className="market-outline" onClick={()=>setDialog({kind:'subscriptions'})}><Settings size={18}/>Manage subscriptions</button></div>
        {error&&<div className="market-error" role="alert"><span>{error}</span><button onClick={()=>{setLoading(true);void load();}}>Try again</button></div>}
        <section id="market-results" role="tabpanel" aria-labelledby={'market-tab-'+tab}>
          {tab!=='integrations'&&<><div className="market-filters"><label className="market-search"><Search size={19}/><input aria-label="Search Moons" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search Moons and integrations..."/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={15}/></button>}</label><div className="market-categories" aria-label="Moon categories">{CATEGORIES.map(value=><button key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{value}</button>)}</div></div><div className="market-section-heading"><h2>{tab==='mine'?'Your Moons':'Find your next Moon'}</h2><span>{loading?'Finding your Moons...':filtered.length+' '+(filtered.length===1?'Moon':'Moons')+(tab==='mine'?' in your workspace':' to explore')}</span></div>
          {loading?<div className="market-card-grid" aria-busy="true" aria-label="Loading Moons">{[1,2,3,4,5,6].map(id=><div className="market-card market-skeleton" key={id}><div/><span/><span/></div>)}</div>:filtered.length?<div className="market-card-grid">{filtered.map(moon=><article className="market-card" key={moon.key}><div className="market-card-top"><div className={'market-card-art art-'+(moon.category || 'insights')}><Artwork key={moon.artwork?.map(file=>file.id).join(',')} moon={moon}/></div><div className="market-card-copy"><div><h3><button className="market-card-title" onClick={()=>setDialog({kind:'moon',moon})} aria-label={'View details for '+moon.name}>{moon.name}</button></h3>{moon.subscription?.state==='active'&&<span className="market-active">Active</span>}</div><small>{categoryLabel(moon)}</small><p>{moon.summary}</p></div></div><footer><strong>{priceLabel(moon.price)}</strong>{moon.can_open?<a href={moon.route} className="market-card-open" aria-label={'Open '+moon.name}>Open<ArrowUpRight size={14}/></a>:<button className="market-primary" onClick={()=>setDialog({kind:'moon',moon})}>Discover</button>}</footer></article>)}</div>:<div className="market-empty"><Moon size={32}/><h3>{query || category!=='All'?'No matching Moons':tab==='mine'?'Your next possibility starts here':'Your next Moon is on its way'}</h3><p>{query || category!=='All'?'Try another search or category.':tab==='mine'?'Subscribed Moons will appear here. You can explore available apps in Discover.':'New Moons will appear here when they launch.'}</p>{(query||category!=='All')?<button className="market-outline" onClick={()=>{setQuery('');setCategory('All');}}>Clear filters</button>:tab==='mine'?<button className="market-primary" onClick={()=>selectTab('discover')}>Discover Moons<ArrowRight size={16}/></button>:user?.role==='superadmin'&&<a className="market-card-open" href="/app/moons/manage">Manage catalog</a>}</div>}</>}
          {(tab==='integrations'||tab==='discover')&&<section className={'market-integrations '+(tab==='integrations'?'is-expanded':'')}><div><h2>Connect your tools</h2><p>Bring your favourite tools into your OrbitOS workspace.</p>{tab==='integrations'&&<p className="market-integration-note">Connections will appear here when integration setup is available.</p>}</div><div className="market-integration-grid">{[{name:'FBR',icon:FileText},{name:'Foodpanda',icon:Bike},{name:'WhatsApp',icon:MessageCircle}].map(({name:label,icon:Icon})=><button className="market-integration-card" key={label} onClick={()=>setDialog({kind:'integration',name:label})}><Icon size={24}/><strong>{label}</strong><span>Coming soon<ArrowRight size={13}/></span></button>)}</div></section>}
        </section>
        <footer className="market-page-footer"><span>Small additions. Bigger possibilities.</span>{user?.role==='superadmin'&&<a href="/app/moons/manage">Manage Moon catalog<ArrowUpRight size={13}/></a>}</footer>
      </div>
    </div>
    {dialog&&<Dialog title={dialog.kind==='moon'?dialog.moon.name:dialog.kind==='subscriptions'?'Your Moon subscriptions':dialog.kind==='help'?'A little help with Moons':dialog.name+' integration'} onClose={()=>setDialog(null)}>
      {dialog.kind==='moon'?<div className="market-dialog-body"><div className="market-dialog-art"><Artwork moon={dialog.moon}/></div><p>{dialog.moon.description || dialog.moon.summary}</p><ul>{dialog.moon.features.map(feature=><li key={feature}><Check size={16}/>{feature}</li>)}</ul><strong>{priceLabel(dialog.moon.price)}</strong>{dialog.moon.can_open?<a className="market-primary" href={dialog.moon.route}>Open {dialog.moon.name}<ArrowUpRight size={16}/></a>:<p>Ask your shop administrator for access to this Moon.</p>}</div>:<div className="market-dialog-body"><p>{dialog.kind==='subscriptions'?'Shop subscriptions are coming soon. You can open available Moons using your existing workspace permissions.':dialog.kind==='help'?'Explore Moons in Discover, search by name or category, and open the apps your shop has access to. Your shop administrator manages your permissions.':dialog.name+' is not available to connect yet. It will appear here when setup is ready.'}</p><button className="market-outline" onClick={()=>setDialog(null)}>Got it</button></div>}
    </Dialog>}
  </div>;
}
