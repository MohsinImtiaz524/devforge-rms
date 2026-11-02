import { useEffect, useState } from 'react'
import { MoonStar, Orbit } from 'lucide-react'
import './analytics-moon-loader.css'

const panels = {
  overview: 'Overview', sales: 'Sales analytics', customers: 'Customer analytics',
  inventory: 'Inventory analytics', profit: 'Profit analytics', staff: 'Staff analytics',
  channels: 'Channel analytics', products: 'Product analytics', ingredients: 'Ingredient analytics',
  tips: 'Tip analytics', ai: 'AI insights', reports: 'Reports', custom_reports: 'Custom reports'
}

export function AnalyticsMoonLoader({ tab = 'overview' }) {
  const [takingLonger, setTakingLonger] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setTakingLonger(true), 8000)
    return () => window.clearTimeout(timer)
  }, [])
  const monthly = ['products', 'ingredients', 'tips'].includes(tab)
  const table = tab !== 'overview'
  const cards = ['staff', 'channels', 'ai', 'reports', 'custom_reports'].includes(tab) ? 0 : tab === 'ingredients' ? 4 : 3
  return <section className="analytics-moon-loader" aria-busy="true" aria-label={`Loading ${panels[tab] || 'analytics'}`}>
    <div className="aml-status" role="status" aria-live="polite" aria-atomic="true">
      <div className="aml-orbit" aria-hidden="true">
        <Orbit className="aml-satellite" size={64} strokeWidth={1.2} />
        <MoonStar className="aml-moon" size={30} strokeWidth={1.6} />
      </div>
      <div><span className="aml-eyebrow">Analytics Moon</span><h3>Loading {panels[tab] || 'analytics'}</h3><p>{takingLonger ? 'This is taking longer than usual. You can open another panel while we wait.' : 'Fetching this panel’s data. Your navigation stays available.'}</p></div>
    </div>
    {cards > 0 && <div className={`aml-cards aml-cards-${cards} ${monthly ? 'aml-monthly-cards' : ''}`} aria-hidden="true">{Array.from({ length: cards }, (_, index) => <div className="aml-card" key={index}><span className="aml-bone aml-label" /><span className="aml-bone aml-value" /><span className="aml-bone aml-detail" /></div>)}</div>}
    <div className={`aml-content ${table ? 'aml-content-table' : ''}`} aria-hidden="true">
      <div className="aml-panel"><span className="aml-bone aml-panel-title" />{table ? <div className="aml-table">{Array.from({ length: 6 }, (_, index) => <div className="aml-row" key={index}><span className="aml-bone" /><span className="aml-bone" /><span className="aml-bone" /></div>)}</div> : <div className="aml-chart">{[32, 55, 42, 73, 58, 88, 68, 95, 76, 62, 84, 70].map((height, index) => <span className="aml-bone" style={{ height: `${height}%` }} key={index} />)}</div>}</div>
      {!table && <div className="aml-panel aml-secondary"><span className="aml-bone aml-panel-title" /><div className="aml-chart">{[45,60,35,80,65,90,50,75].map((height,index)=><span className="aml-bone" key={index} style={{height:`${height}%`}} />)}</div></div>}
    </div>
  </section>
}
