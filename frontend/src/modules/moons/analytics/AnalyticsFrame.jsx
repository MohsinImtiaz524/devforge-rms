import { headers } from "./analytics-navigation";
export function AnalyticsFrame({
  activeAnalyticsTab,
  analyticsPeriod,
  analyticsCustomFrom,
  analyticsCustomTo,
  analyticsBrandId,
  customDateLimits,
  brands,
  toggleAnalyticsSidebar,
  onPeriodChange,
  onDateChange,
  onPartnerChange,
  pageHeader,
  children
}) {
  const partnerFilter = brands.length ? <div className={"flex w-full sm:w-auto items-center gap-2 bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800"}>
      <span className={"text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap"}>Profit Partner:</span>
      <select id={"analytics-brand-select"} value={analyticsBrandId} onChange={event => {
      onPartnerChange(event.target.value);
    }} className={"min-w-0 flex-1 sm:flex-none bg-transparent text-xs font-bold text-teal-600 dark:text-teal-400 outline-none cursor-pointer max-w-[170px]"}>
        <option value={""}>All Partners</option>
        {brands.map((brand, rowIndex) => <option value={brand.id} key={rowIndex}>{brand.name} ({brand.partner_type === "product_based" ? "Product" : "Share"})</option>)}
      </select>
    </div> : null;
  return <div className={"flex min-w-0 flex-col gap-6 " + (activeAnalyticsTab === "overview" ? "am-overview-frame" : "")}>
      {pageHeader}
      {! ["products", "ingredients", "tips"].includes(activeAnalyticsTab) && <p className="am-date-scope">Report scope: {analyticsPeriod === "custom" ? `${analyticsCustomFrom} to ${analyticsCustomTo}` : ({all:"All time",today:"Today","7days":"Last 7 days","30days":"Last 30 days","12months":"Last 12 months"}[analyticsPeriod] || analyticsPeriod)} &middot; {activeAnalyticsTab === "ai" ? "AI uses the period preset. Custom dates and partner selection are not applied." : "Sales totals exclude tax and account for refunds. Trend charts use completed bill totals including tax."}</p>}
      
      
      <div className={"am-overview-toolbar flex flex-col gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm"}>
        
        
        <div className={"flex flex-col lg:flex-row justify-between lg:items-center gap-4"}>
          
          <div className={"flex items-center gap-4"}>
            <button onClick={() => {
              toggleAnalyticsSidebar();
            }} className={"hidden p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all active:scale-95 shadow-sm border border-slate-200 dark:border-slate-700"}>
              <svg className={"w-5 h-5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M4 6h16M4 12h16M4 18h7"} /></svg>
            </button>
            <div>
              <span className={"am-engine-label text-[9px] uppercase font-black tracking-widest text-slate-400 hidden sm:block"}>Analytics Engine</span>
              <h4 className={(activeAnalyticsTab === "overview" ? "am-overview-heading " : "") + "text-base font-black text-slate-800 dark:text-white mt-0.5 tracking-tight flex items-center gap-1.5"}>
                <svg className={"am-engine-icon w-5 h-5 text-blue-600 hidden sm:inline"} fill={"none"} stroke={"currentColor"} strokeWidth={"2.5"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} d={"M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"} /></svg> {activeAnalyticsTab === "overview" ? "Overview" : "Metrics Suite"}
              </h4>
            </div>
          </div>

          
          {activeAnalyticsTab !== "products" && activeAnalyticsTab !== "ingredients" && activeAnalyticsTab !== "tips" && <div className={"grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto"}>
            
            <div id={"analytics-custom-dates"} className={"" + (analyticsPeriod === 'custom' ? 'flex' : 'hidden') + " w-full sm:w-auto flex-col min-[380px]:flex-row items-stretch min-[380px]:items-center gap-1 sm:gap-2 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800"}>
              <input type={"date"} id={"custom-from"} value={analyticsCustomFrom} onChange={event => {
                onDateChange('from', event.target.value);
              }} className={"bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[110px] cursor-pointer"} />
              <span className={"text-slate-400 text-xs"}>to</span>
              <input type={"date"} id={"custom-to"} min={customDateLimits?.min} max={customDateLimits?.max} value={analyticsCustomTo} onChange={event => {
                onDateChange('to', event.target.value);
              }} className={"bg-transparent text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1 max-w-[110px] cursor-pointer"} />
            </div>

            
            <div className={"flex w-full sm:w-auto items-center gap-2 bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800"}>
              <span className={"text-[10px] font-bold text-slate-400 uppercase tracking-widest"}>Period:</span>
              <select id={"analytics-period-select"} value={analyticsPeriod} onChange={event => {
                onPeriodChange(event.target.value);
              }} className={"flex-1 sm:flex-none bg-transparent text-xs font-bold text-blue-600 dark:text-blue-400 outline-none cursor-pointer"}>
                <option value={"all"}>All Time</option>
                <option value={"today"}>Today</option>
                <option value={"7days"}>Last 7 Days</option>
                <option value={"30days"}>Last 30 Days</option>
                <option value={"12months"}>Last 12 Months</option>
                <option value={"custom"}>Custom Range</option>
              </select>
            </div>

            <div id={"analytics-brand-filter-container"}>{activeAnalyticsTab === "profit" && partnerFilter}</div>

            
            <button onClick={() => window.print()} className={"w-full sm:w-auto justify-center px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 transition-all flex items-center gap-1.5 active:scale-[0.98]"}>
              <svg className={"w-3.5 h-3.5"} fill={"none"} stroke={"currentColor"} viewBox={"0 0 24 24"}><path strokeLinecap={"round"} strokeLinejoin={"round"} strokeWidth={"2"} d={"M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"} /></svg>
              Export Report
            </button>
          </div>}
        </div>
      </div>

      
      <main className={"w-full flex flex-col gap-6 min-w-0"}>
        
        {activeAnalyticsTab !== "overview" && <div className={"px-1"}>
          <h3 className={"text-lg font-black text-slate-800 dark:text-white tracking-tight"} id={"analytics-tab-title"}>{headers[activeAnalyticsTab].title}</h3>
          <p className={"text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5"} id={"analytics-tab-subtitle"}>{headers[activeAnalyticsTab].subtitle}</p>
        </div>}

        
        <div id={"analytics-viewport"} className={"w-full flex-1"}>
          {children}
        </div>
      </main>
    </div>;
}
