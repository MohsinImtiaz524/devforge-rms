import { getShopCurrency } from '../../../currency';
import { useState } from 'react';
import { styleObject } from './analytics-ui';
export function SalesActivity({
  data
}) {
  const [activeCell, setActiveCell] = useState(null);
  const parseLocalDate = dateStr => new Date(`${dateStr}T00:00:00`);
  const datesList = [];
  const startD = parseLocalDate(data.bounds.start.split(' ')[0]);
  const endD = parseLocalDate(data.bounds.end.split(' ')[0]);
  const diffTime = Math.abs(endD - startD);
  let numDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (numDays > 30) numDays = 30;
  const startDObj = new Date(endD);
  startDObj.setDate(startDObj.getDate() - (numDays - 1));
  for (let i = 0; i < numDays; i++) {
    const d = new Date(startDObj);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    datesList.push(`${y}-${m}-${r}`);
  }
  const heatmapData = {};
  datesList.forEach(d => {
    heatmapData[d] = Array(6).fill(null).map(() => ({
      count: 0,
      sales: 0
    }));
  });
  if (data.heatmapRaw) {
    data.heatmapRaw.forEach(r => {
      if (heatmapData[r.dt]) {
        const blockIdx = Math.min(Math.max(Math.floor(Number(r.block_idx) || 0), 0), 5);
        heatmapData[r.dt][blockIdx].count = r.orders;
        heatmapData[r.dt][blockIdx].sales = r.sales;
      }
    });
  }
  let maxVolume = 1;
  datesList.forEach(d => {
    heatmapData[d].forEach(b => {
      if (b.sales > maxVolume) maxVolume = b.sales;
    });
  });
  const blockLabels = ["Night Shift", "Early Shift", "Morning Shift", "Afternoon Shift", "Evening Shift", "Late Shift"];
  const blockRanges = ["12am - 4am", "4am - 8am", "8am - 12pm", "12pm - 4pm", "4pm - 8pm", "8pm - 12am"];
  const formatDateParts = dateStr => {
    const date = parseLocalDate(dateStr);
    return {
      short: date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      }),
      day: date.toLocaleDateString(undefined, {
        weekday: 'short'
      }),
      full: date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        weekday: 'short'
      })
    };
  };
  const heatmapCellSize = 42;
  const heatmapCellGap = 8;
  const heatmapLabelWidth = 128;
  const heatmapMinWidth = heatmapLabelWidth + 16 + datesList.length * heatmapCellSize + Math.max(datesList.length - 1, 0) * heatmapCellGap;
  const dateColumnsStyle = `grid-template-columns: repeat(${datesList.length}, ${heatmapCellSize}px); gap: ${heatmapCellGap}px;`;
  const headerHtml = <div className={"flex items-end gap-2 md:gap-4 mb-2"} style={styleObject("min-width: " + heatmapMinWidth + "px;")}>
      <div className={"shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400 text-right pb-1"} style={styleObject("width: " + heatmapLabelWidth + "px;")}>Shift</div>
      <div className={"grid shrink-0"} style={styleObject(dateColumnsStyle)}>
        {datesList.map((dateStr, rowIndex) => {
        const parts = formatDateParts(dateStr);
        return <div className={"text-center leading-tight"} key={rowIndex}>
              <div className={"text-[9px] md:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase truncate"}>{parts.day}</div>
              <div className={"text-[9px] md:text-[10px] font-bold text-slate-400 truncate"}>{parts.short}</div>
            </div>;
      })}
      </div>
    </div>;
  const rowsHtml = blockLabels.map((shiftLabel, idx) => {
    const cellsHtml = datesList.map((dateStr, rowIndex) => {
      const block = heatmapData[dateStr][idx];
      const dateParts = formatDateParts(dateStr);
      const salesValue = Math.max(0, Number(block.sales || 0));
      const intensity = salesValue > 0 ? Math.log1p(salesValue) / Math.log1p(maxVolume) : 0;
      const bgClass = `analytics-heatmap-cell analytics-heatmap-level-${Math.ceil(intensity * 9)}`;
      const formattedSales = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: getShopCurrency(),
        maximumFractionDigits: 0
      }).format(block.sales);
      const cellTooltip = <div className={"flex flex-col gap-1 text-left min-w-[150px]"}>
          <span className={"text-[9px] uppercase font-black text-slate-400 border-b border-slate-700 pb-1 mb-1"}>{shiftLabel} · {blockRanges[idx]}</span>
          <span className={"text-[10px] text-slate-300 font-bold block"}>{dateParts.full}</span>
          <span className={"text-xs text-white font-extrabold mt-1"}>Revenue: {formattedSales}</span>
          <span className={"text-[10px] text-emerald-400 font-bold"}>{block.count} Orders</span>
        </div>;
      return <button type="button" title={"" + dateParts.full + " · " + shiftLabel + " · " + formattedSales + " · " + block.count + " orders"} aria-label={"" + dateParts.full + ", " + shiftLabel + ", " + formattedSales + ", " + block.count + " orders"} onMouseEnter={() => setActiveCell(cellTooltip)} onFocus={() => setActiveCell(cellTooltip)} onClick={() => setActiveCell(cellTooltip)} className={"rounded-md lg:rounded-lg " + bgClass + " border transition-all duration-300 flex items-center justify-center relative cursor-pointer hover:ring-2 focus-visible:ring-2 hover:ring-offset-2 focus-visible:ring-offset-2 hover:ring-emerald-500 focus-visible:ring-emerald-500 hover:scale-105 z-10"} style={styleObject("width: " + heatmapCellSize + "px; height: " + heatmapCellSize + "px;")} key={rowIndex}>
          <span className={"text-[9px] md:text-xs leading-none font-black opacity-70"}>{block.count}</span>
        </button>;
    });
    return <div className={"flex items-center gap-2 md:gap-4"} style={styleObject("min-width: " + heatmapMinWidth + "px;")} key={idx}>
        <div className={"shrink-0 text-right"} style={styleObject("width: " + heatmapLabelWidth + "px;")}>
          <div className={"text-[10px] md:text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-tight"}>{shiftLabel}</div>
          <div className={"text-[9px] text-slate-400 font-bold"}>{blockRanges[idx]}</div>
        </div>
        <div className={"grid shrink-0"} style={styleObject(dateColumnsStyle)}>
          {cellsHtml}
        </div>
      </div>;
  });
  return <div className={"w-full"}>
      <div aria-live="polite" className={"mb-3 min-h-[88px] rounded-xl border border-slate-200 bg-slate-950 p-3 text-white shadow-sm dark:border-slate-700"}>
        {activeCell}
      </div>
      <div className={"w-full overflow-x-auto pb-2"}>
        <div className={"flex flex-col gap-2 w-full select-none"}>
          {headerHtml}
          <div className={"flex flex-col gap-2"}>
            {rowsHtml}
          </div>
        </div>
      </div>
    </div>;
}
