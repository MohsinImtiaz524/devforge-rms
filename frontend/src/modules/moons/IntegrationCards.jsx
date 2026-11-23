import { ArrowRight, Boxes, Landmark } from 'lucide-react'
import FoodpandaIcon from '../pos/FoodpandaIcon'
import './integrations.css'

function PandaMark() {
  return <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true"><circle cx="8" cy="9" r="5" fill="currentColor"/><circle cx="26" cy="9" r="5" fill="currentColor"/><path d="M17 6C8.3 6 4 11.3 4 18c0 7 5.4 12 13 12s13-5 13-12C30 11.3 25.7 6 17 6Z" fill="currentColor"/><ellipse cx="17" cy="18.5" rx="11" ry="9.5" fill="white"/><ellipse cx="12" cy="17" rx="3.1" ry="4" transform="rotate(27 12 17)" fill="currentColor"/><ellipse cx="22" cy="17" rx="3.1" ry="4" transform="rotate(-27 22 17)" fill="currentColor"/><circle cx="12.7" cy="16.8" r="1" fill="white"/><circle cx="21.3" cy="16.8" r="1" fill="white"/><path d="M14.5 22h5L17 24l-2.5-2Z" fill="currentColor"/><path d="M17 24v1m-3 0c1.3 1.2 4.7 1.2 6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
}

function WhatsAppMark() {
  return <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M26.5 15.3a10.8 10.8 0 0 1-15.8 9.6L5 26.5l1.6-5.6a10.8 10.8 0 1 1 19.9-5.6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M11.4 10.2c-.5 0-1.5 1.3-1.3 2.7.3 2.6 4.5 6.9 7.5 7.5 1.5.3 3-.8 3-1.4 0-.5-2.6-2-3-1.8l-1.2 1c-1.6-.7-3-2-3.8-3.7l.9-1.2c.3-.4-1.6-3.1-2.1-3.1Z" fill="currentColor"/></svg>
}

export default function IntegrationCards({ foodpanda, onSelect, view = 'all', onBrowseStore, loading = false }) {
  const openFoodpanda = foodpanda?.enabled || foodpanda?.activated
  const integrations = [
    { name:'FBR', key:'fbr', category:'TAX & COMPLIANCE', description:'Bring tax reporting and invoice compliance into your restaurant workspace.', status:'Coming soon', Icon:Landmark },
    { name:'Foodpanda', key:'foodpanda', category:'FOOD DELIVERY', description:'Manage Foodpanda orders, sales and analytics in one dedicated workspace.', status:foodpanda?.enabled?'Enabled':foodpanda?.activated?'Ordering paused':'Available', Icon:FoodpandaIcon },
    { name:'WhatsApp', key:'whatsapp', category:'CUSTOMER MESSAGING', description:'Keep customer conversations and order updates closer to your business.', status:'Coming soon', Icon:WhatsAppMark },
  ]
  if (loading) return <div className="market-card-grid" role="status" aria-label="Loading integrations">{[1,2,3].map(key=><div className="market-card market-skeleton" key={key}><div/><span/><span/></div>)}</div>
  const visible = integrations.filter(item => view === 'enabled' ? item.key === 'foodpanda' && openFoodpanda : view === 'store' ? !(item.key === 'foodpanda' && openFoodpanda) : true)
  if (!visible.length) return <div className="market-empty"><Boxes size={32}/><h3>No integrations enabled yet</h3><p>Explore the Marketplace to add an integration to your workspace.</p><button type="button" className="market-outline" onClick={onBrowseStore}>Browse Marketplace<ArrowRight size={16}/></button></div>
  return <div className="integration-cards">{visible.map(({name,key,category,description,status,Icon})=><article className={'integration-tile integration-'+key} key={key}>
    <div className="integration-tile-top"><div className="integration-brand" aria-hidden="true">{key==='foodpanda'?<FoodpandaIcon size={34} fallback={<PandaMark/>}/>:<Icon size={32}/>}</div><span className={'integration-availability '+(key==='foodpanda'?'is-available':'')}>{key==='foodpanda'&&<i/>}{status}</span></div>
    <div className="integration-tile-copy"><small>{category}</small><h3>{name}</h3><p>{description}</p></div>
    <footer><span>{key==='foodpanda'?'Orders & analytics':key==='fbr'?'Business compliance':'Conversations'}</span><button type="button" className={key==='foodpanda'?'integration-action is-primary':'integration-action'} aria-label={name+': '+(key==='foodpanda'?(openFoodpanda?'Open':'Enable'):'View details')} onClick={()=>onSelect(name)}>{key==='foodpanda'?(openFoodpanda?'Open dashboard':'Enable Foodpanda'):'View details'}<ArrowRight size={15}/></button></footer>
  </article>)}</div>
}
