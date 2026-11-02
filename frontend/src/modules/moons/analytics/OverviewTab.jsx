import { useId, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowUpRight, Banknote, CalendarDays, ChevronRight, ReceiptText, ShoppingBag } from 'lucide-react'
import { getShopCurrency } from '../../../currency'
import './overview-reference.css'

const COLORS = ['#4f7ff0','#65b68a','#e7bc54','#9a8bd4','#a0aab9']
const number = value => new Intl.NumberFormat('en-IN', {maximumFractionDigits:0}).format(value || 0)
function Sparkline({ points, field, color, id }) {
  return <div className="ov-spark" aria-hidden="true"><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={points} margin={{top:4,right:0,bottom:0,left:0}} accessibilityLayer={false}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.15}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs><Area type="linear" dataKey={field} stroke={color} fill={`url(#${id})`} strokeWidth={1.5} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
}

export function OverviewTab({ data, analyticsPeriod, onNavigate }) {
  const [metric, setMetric] = useState('sales')
  const chartId = useId().replaceAll(':','')
  const k = data.kpi
  const currencyCode = getShopCurrency()
  const currency = value => new Intl.NumberFormat('en-IN', {style:'currency',currency:currencyCode,maximumFractionDigits:2}).format(value || 0)
  let barPoints = [];
  if (analyticsPeriod === 'today') {
    const intervals = ["12am - 4am", "4am - 8am", "8am - 12pm", "12pm - 4pm", "4pm - 8pm", "8pm - 12am"];
    barPoints = intervals.map(lbl => ({
      label: lbl,
      sales: 0,
      orders: 0
    }));
    if (data.trendSeries) {
      data.trendSeries.forEach(bp => {
        const hour = parseInt(bp.label, 10);
        if (!isNaN(hour)) {
          const blockIdx = Math.min(Math.max(Math.floor(hour / 4), 0), 5);
          barPoints[blockIdx].sales += bp.sales;
          barPoints[blockIdx].orders += bp.orders;
        }
      });
    }
  } else if (analyticsPeriod === '7days') {
    const list = [];
    const today = new Date(data.bounds.end.split(' ')[0]);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const r = String(d.getDate()).padStart(2, '0');
      list.push(`${y}-${m}-${r}`);
    }
    barPoints = list.map(dt => {
      const match = data.trendSeries ? data.trendSeries.find(r => r.label === dt) : null;
      const d = new Date(dt);
      const displayLbl = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });
      return {
        label: displayLbl,
        sales: match ? match.sales : 0,
        orders: match ? match.orders : 0
      };
    });
  } else if (analyticsPeriod === '30days') {
    const list = [];
    const today = new Date(data.bounds.end.split(' ')[0]);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const r = String(d.getDate()).padStart(2, '0');
      list.push(`${y}-${m}-${r}`);
    }
    barPoints = list.map(dt => {
      const match = data.trendSeries ? data.trendSeries.find(r => r.label === dt) : null;
      const d = new Date(dt);
      const displayLbl = d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });
      return {
        label: displayLbl,
        sales: match ? match.sales : 0,
        orders: match ? match.orders : 0
      };
    });
  } else if (analyticsPeriod === '12months') {
    const list = [];
    const today = new Date(data.bounds.end.split(' ')[0]);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      list.push(`${y}-${m}`);
    }
    barPoints = list.map(mth => {
      const match = data.trendSeries ? data.trendSeries.find(r => r.label === mth) : null;
      const [yVal, mVal] = mth.split('-');
      const d = new Date(parseInt(yVal, 10), parseInt(mVal, 10) - 1, 1);
      const displayLbl = d.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric'
      });
      return {
        label: displayLbl,
        sales: match ? match.sales : 0,
        orders: match ? match.orders : 0
      };
    });
  } else {
    barPoints = data.trendSeries.map(bp => {
      let lbl = bp.label;
      if (lbl.includes('-')) {
        const d = new Date(lbl);
        lbl = d.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        });
      }
      return {
        label: lbl,
        sales: bp.sales,
        orders: bp.orders
      };
    });
  }


  const billedSales = barPoints.reduce((sum,row)=>sum+Number(row.sales || 0),0)
  const points = barPoints.map(row=>({...row,average:row.orders>0?row.sales/row.orders:0}))
  const bucketSize = Math.max(1,Math.ceil(points.length/60))
  const plotted = []
  for(let i=0;i<points.length;i+=bucketSize){
    const batch=points.slice(i,i+bucketSize),sales=batch.reduce((sum,row)=>sum+row.sales,0),orders=batch.reduce((sum,row)=>sum+row.orders,0)
    plotted.push({label:batch.length===1?batch[0].label:batch[0].label+' - '+batch.at(-1).label,sales,orders,average:orders>0?sales/orders:0})
  }
  const metrics = [
    {label:'Billed Sales',value:currency(billedSales),note:'Includes tax; before refunds',field:'sales',Icon:Banknote,color:COLORS[0],tone:'blue'},
    {label:'Completed Orders',value:number(k.totalOrders),note:'Completed orders in this period',field:'orders',Icon:ShoppingBag,color:COLORS[1],tone:'green'},
    {label:'Average Bill Value',value:currency(k.avgOrderValue),note:'Includes tax; before refunds',field:'average',Icon:ReceiptText,color:COLORS[2],tone:'amber'}
  ]
  const label = {sales:'Billed sales',orders:'Completed orders',average:'Average bill value'}[metric]
  const format = value => metric==='orders'?number(value):currency(value)
  const compact = value => new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value)
  const ranked = points.filter(row=>row.sales>0).sort((a,b)=>b.sales-a.sales)
  const mix = ranked.slice(0,4).map(row=>({name:row.label,value:row.sales}))
  const other = ranked.slice(4).reduce((sum,row)=>sum+row.sales,0)
  if(other>0)mix.push({name:'Other periods',value:other})
  const periodLabel = analyticsPeriod==='today'?'Time':'Period'
  const period = data.bounds.start.slice(0,10)+' to '+data.bounds.end.slice(0,10)
  return <div className="am-reference-overview">
    <div className="ov-cards" aria-label="Overview key metrics">{metrics.map(({label:cardLabel,value,note,field,Icon,color,tone},index)=><article className="ov-card" key={field}>
      <div className="ov-card-top"><h3>{cardLabel}</h3><span className={`ov-metric-icon ov-${tone}`}><Icon size={18} strokeWidth={1.7}/></span></div>
      <p className="ov-value">{value}</p><p className="ov-note">{note}</p>
      <Sparkline points={plotted} field={field} color={color} id={chartId+'-spark-'+index}/>
    </article>)}</div>
    <section className="ov-panel ov-growth" aria-label="Period performance chart">
      <header><div><h3>Period Performance</h3><p>{period} &middot; {bucketSize>1?'Grouped into '+bucketSize+'-period intervals':'Selected reporting period'}</p></div><label className="ov-metric-select"><span className="ov-sr-only">Chart metric</span><select aria-label="Chart metric" value={metric} onChange={event=>setMetric(event.target.value)}><option value="sales">Billed sales</option><option value="orders">Orders</option><option value="average">Average bill</option></select></label></header>
      <div id="chart-sales-overview" className="ov-main-chart"><div id="chart-sales-trend" className="ov-chart-inner">
        {plotted.length?<ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={plotted} margin={{top:30,right:22,left:0,bottom:8}} accessibilityLayer>
          <defs><linearGradient id={chartId+'-main'} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS[0]} stopOpacity={.13}/><stop offset="100%" stopColor={COLORS[0]} stopOpacity={.01}/></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--ov-grid)"/>
          <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={22} tick={{fill:'var(--ov-muted)',fontSize:11}} dy={10}/>
          <YAxis axisLine={false} tickLine={false} width={58} tick={{fill:'var(--ov-muted)',fontSize:11}} tickFormatter={compact} allowDecimals={metric!=='orders'}/>
          <Tooltip formatter={value=>[format(value),label]} contentStyle={{background:'var(--ov-surface)',border:'1px solid var(--ov-border)',borderRadius:10,color:'var(--ov-ink)',fontSize:12}} labelStyle={{color:'var(--ov-muted)',marginBottom:5}}/>
          <Area type="linear" dataKey={metric} name={label} stroke={COLORS[0]} strokeWidth={2.1} fill={`url(#${chartId}-main)`} dot={plotted.length<=12?{r:3.5,fill:COLORS[0],stroke:'var(--ov-surface)',strokeWidth:1.5}:false} activeDot={{r:5}} isAnimationActive={false}>{plotted.length<=8&&<LabelList dataKey={metric} position="top" offset={12} formatter={compact} fill="var(--ov-muted)" fontSize={10}/>}</Area>
        </AreaChart></ResponsiveContainer>:<p className="ov-empty">No completed orders in this period.</p>}
      </div></div>
      <p className="ov-chart-caption">{metric==='orders'?'Completed orders only.':'Bill values include tax and are shown before refunds.'} Use arrow keys when the chart is focused to explore values.</p>
    </section>
    <div className="ov-bottom">
      <section className="ov-panel ov-breakdown"><header><h3>Period Breakdown</h3><span className="ov-small-icon"><CalendarDays size={16}/></span></header>
        <div className="ov-table-wrap"><table><thead><tr><th>{periodLabel}</th><th>Orders</th><th>Billed sales</th></tr></thead><tbody>{points.slice(-5).map((row,index)=><tr key={index}><td><span className="ov-period-dot"/>{row.label}</td><td>{number(row.orders)}</td><td>{currency(row.sales)}</td></tr>)}</tbody></table></div>
        {!points.length&&<p className="ov-empty">No period activity to show.</p>}
        <p className="ov-table-note">Latest {Math.min(points.length,5)} periods &middot; aggregated activity, not individual transactions.</p>
        <button className="ov-link" type="button" onClick={()=>onNavigate('sales')}>View Sales Details<ChevronRight size={14}/></button>
      </section>
      <section className="ov-panel ov-distribution"><header><h3>Sales Distribution</h3><span className="ov-muted-label">By reporting period</span></header>
        {mix.length?<div className="ov-mix"><div className="ov-donut" role="img" aria-label="Billed sales distribution by period"><ResponsiveContainer width="100%" height="100%" minWidth={0}><PieChart><Pie data={mix} dataKey="value" nameKey="name" innerRadius="66%" outerRadius="90%" paddingAngle={2} stroke="var(--ov-surface)" strokeWidth={2} isAnimationActive={false}>{mix.map((row,index)=><Cell key={row.name} fill={COLORS[index]}/>)}</Pie></PieChart></ResponsiveContainer><div className="ov-donut-center"><strong>{new Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(billedSales)}</strong><span>{currencyCode} billed sales</span></div></div><ul>{mix.map((row,index)=><li key={row.name}><span className="ov-legend-dot" style={{background:COLORS[index]}}/><span>{row.name}</span><strong>{(row.value/billedSales*100).toFixed(1)}%</strong></li>)}</ul></div>:<p className="ov-empty">No billed sales to break down.</p>}
        <button className="ov-link" type="button" onClick={()=>onNavigate('profit')}>View Profit Breakdown<ArrowUpRight size={14}/></button>
      </section>
    </div>
    <p className="ov-footer-note">Net revenue: <strong>{currency(k.totalSales)}</strong> after refunds, excluding tax. Product, stock, customer and tip details load only when their tabs are opened.</p>
  </div>
}
