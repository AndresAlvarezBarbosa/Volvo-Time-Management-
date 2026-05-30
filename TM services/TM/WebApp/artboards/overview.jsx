// artboards/overview.jsx — KPI overview with headline trend
// Aggregates: total hours, billable %, employee count, project count + sparkline of daily hours.

function ArtboardOverview() {
  const data = useData();
  const [hoverWk, setHoverWk] = React.useState(null);
  if (!data) return React.createElement(LoadingFrame);

  const { records, employees, wbs, allDates, minDate, maxDate } = data;

  // KPIs
  const totalHours = records.reduce((s,r)=>s+r.hours, 0);
  const billableHours = records.filter(r => r.billable).reduce((s,r)=>s+r.hours, 0);
  const billablePct = billableHours / totalHours * 100;
  const avgPerEmpDay = totalHours / employees.length / allDates.length;
  const activeProjects = new Set(records.filter(r => r.billable).map(r => r.project)).size;

  // Daily trend
  const daily = dailyTotals(records);
  const maxDaily = Math.max(...daily.map(d => d.hours));

  // Brand split
  const byBrand = groupSum(records, r => r.brand);
  const brandList = [...byBrand.entries()].sort((a,b) => b[1]-a[1]);

  // Top projects (billable)
  const byProj = groupSum(records.filter(r => r.billable), r => r.project);
  const topProjects = [...byProj.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8);

  // Weekly trend (line + area)
  const byWeek = new Map();
  for (const r of records) {
    const wk = `${r.date.slice(0,4)}-W${String(weekOfYear(r.date)).padStart(2,'0')}`;
    const cur = byWeek.get(wk) || { wk, total: 0, billable: 0 };
    cur.total += r.hours;
    if (r.billable) cur.billable += r.hours;
    byWeek.set(wk, cur);
  }
  const weeks = [...byWeek.values()].sort((a,b) => a.wk < b.wk ? -1 : 1);

  // Trend chart geometry
  const chartW = 920, chartH = 260, padL = 56, padR = 24, padT = 24, padB = 36;
  const innerW = chartW - padL - padR, innerH = chartH - padT - padB;
  const maxWeek = Math.max(...weeks.map(w => w.total));
  const xStep = innerW / Math.max(1, weeks.length - 1);
  const yScale = h => padT + innerH - (h / maxWeek) * innerH;

  const totalPath = weeks.map((w,i) => `${i===0?'M':'L'}${padL+i*xStep},${yScale(w.total)}`).join(' ');
  const billablePath = weeks.map((w,i) => `${i===0?'M':'L'}${padL+i*xStep},${yScale(w.billable)}`).join(' ');
  const totalArea = totalPath + ` L${padL+(weeks.length-1)*xStep},${padT+innerH} L${padL},${padT+innerH} Z`;

  // Format date-range label
  const monthSpan = `${shortDate(minDate)} – ${shortDate(maxDate)}, 2026`;

  return React.createElement('div', { className: 'ab-frame' },
    // Header
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '01 / Overview'),
      React.createElement('h1', { className: 'ab-title' }, 'Labor logs, Q1–Q2 2026'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, monthSpan),
        React.createElement('span', { className: 'ab-dot' }),
        React.createElement('span', null, `${fmtNum(records.length)} records`),
        React.createElement('span', { className: 'ab-dot' }),
        React.createElement('span', null, `${employees.length} contributors`),
      )
    ),

    // KPIs row
    React.createElement('div', { className: 'kpi-row' },
      React.createElement(KPI, { label: 'Total hours logged', value: fmtNum(Math.round(totalHours)), unit: 'hrs', sub: monthSpan }),
      React.createElement(KPI, { label: 'Billable share', value: billablePct.toFixed(1), unit: '%', sub: `${fmtNum(Math.round(billableHours))} of ${fmtNum(Math.round(totalHours))} hrs` }),
      React.createElement(KPI, { label: 'Active contributors', value: employees.length, unit: '', sub: `${brandList.length} brands · ${employees.filter(e=>e.status==='Active').length} active` }),
      React.createElement(KPI, { label: 'Projects touched', value: activeProjects, unit: '', sub: `${wbs.length} WBS codes` }),
    ),

    // Headline chart
    React.createElement('div', { className: 'panel' },
      React.createElement('div', { className: 'panel-h' },
        React.createElement('div', { className: 'panel-title' }, 'Weekly hours'),
        React.createElement('div', { className: 'panel-legend' },
          React.createElement(LegendDot, { color: 'var(--accent)', label: 'Billable' }),
          React.createElement(LegendDot, { color: 'var(--ink-50)', label: 'Total', dashed: true }),
        )
      ),
      React.createElement('svg', {
        className: 'chart',
        viewBox: `0 0 ${chartW} ${chartH}`,
        onMouseLeave: () => setHoverWk(null),
        onMouseMove: e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width * chartW - padL;
          const i = Math.max(0, Math.min(weeks.length-1, Math.round(x / xStep)));
          setHoverWk(i);
        },
      },
        // y gridlines
        [0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = padT + innerH - t*innerH;
          const v = Math.round(maxWeek * t);
          return React.createElement('g', { key: t },
            React.createElement('line', { x1: padL, x2: chartW-padR, y1: y, y2: y, stroke: 'var(--rule)', strokeWidth: 0.5 }),
            React.createElement('text', { x: padL-10, y: y+3, textAnchor: 'end', className: 'tick' }, fmtHours(v))
          );
        }),
        // x ticks: every 4th week
        weeks.map((w, i) => i % 4 === 0 ? React.createElement('text', {
          key: w.wk, x: padL+i*xStep, y: chartH-padB+18, textAnchor: 'middle', className: 'tick'
        }, w.wk.slice(5)) : null),
        // total area
        React.createElement('path', { d: totalArea, fill: 'var(--ink-04)', stroke: 'none' }),
        React.createElement('path', { d: totalPath, fill: 'none', stroke: 'var(--ink-50)', strokeWidth: 1, strokeDasharray: '3 3' }),
        React.createElement('path', { d: billablePath, fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.75 }),
        // hover guide
        hoverWk !== null && React.createElement('g', null,
          React.createElement('line', { x1: padL+hoverWk*xStep, x2: padL+hoverWk*xStep, y1: padT, y2: padT+innerH, stroke: 'var(--ink)', strokeWidth: 0.5 }),
          React.createElement('circle', { cx: padL+hoverWk*xStep, cy: yScale(weeks[hoverWk].billable), r: 4, fill: 'var(--accent)', stroke: 'var(--bg)', strokeWidth: 1.5 }),
          React.createElement('circle', { cx: padL+hoverWk*xStep, cy: yScale(weeks[hoverWk].total), r: 3.5, fill: 'var(--bg)', stroke: 'var(--ink-50)', strokeWidth: 1.25 }),
        )
      ),
      hoverWk !== null && React.createElement('div', { className: 'panel-hover' },
        React.createElement('span', { className: 'mono' }, weeks[hoverWk].wk),
        React.createElement('span', null, `Billable ${fmtNum(Math.round(weeks[hoverWk].billable))}h`),
        React.createElement('span', null, `Total ${fmtNum(Math.round(weeks[hoverWk].total))}h`),
        React.createElement('span', { className: 'muted' }, `${(weeks[hoverWk].billable/weeks[hoverWk].total*100).toFixed(0)}% billable`),
      )
    ),

    // Two-up: brand split + top projects
    React.createElement('div', { className: 'two-up' },
      React.createElement('div', { className: 'panel' },
        React.createElement('div', { className: 'panel-h' },
          React.createElement('div', { className: 'panel-title' }, 'Hours by brand'),
        ),
        React.createElement('div', { className: 'bars' },
          brandList.map(([brand, h]) => {
            const pct = h / totalHours;
            return React.createElement('div', { key: brand, className: 'bar-row' },
              React.createElement('div', { className: 'bar-label' }, brand),
              React.createElement('div', { className: 'bar-track' },
                React.createElement('div', { className: 'bar-fill', style: { width: `${pct*100}%` } })
              ),
              React.createElement('div', { className: 'bar-value mono' }, `${fmtNum(Math.round(h))} h`),
              React.createElement('div', { className: 'bar-pct mono' }, `${(pct*100).toFixed(0)}%`),
            );
          })
        )
      ),
      React.createElement('div', { className: 'panel' },
        React.createElement('div', { className: 'panel-h' },
          React.createElement('div', { className: 'panel-title' }, 'Top billable projects'),
          React.createElement('div', { className: 'panel-sub mono' }, 'by hours logged'),
        ),
        React.createElement('div', { className: 'bars' },
          topProjects.map(([proj, h]) => {
            const pct = h / topProjects[0][1];
            const color = getProjectColor(proj);
            return React.createElement('div', { key: proj, className: 'bar-row' },
              React.createElement('div', { className: 'bar-label', title: proj, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                React.createElement('span', { className: 'proj-swatch', style: { background: color } }),
                React.createElement('span', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, proj),
              ),
              React.createElement('div', { className: 'bar-track' },
                React.createElement('div', { className: 'bar-fill', style: { width: `${pct*100}%`, background: color } })
              ),
              React.createElement('div', { className: 'bar-value mono' }, `${fmtNum(Math.round(h))} h`),
            );
          })
        )
      )
    )
  );
}

// ── Subcomponents ──
function KPI({ label, value, unit, sub }) {
  return React.createElement('div', { className: 'kpi' },
    React.createElement('div', { className: 'kpi-label' }, label),
    React.createElement('div', { className: 'kpi-num' },
      React.createElement('span', { className: 'kpi-value' }, value),
      unit && React.createElement('span', { className: 'kpi-unit' }, unit),
    ),
    React.createElement('div', { className: 'kpi-sub mono' }, sub),
  );
}

function LegendDot({ color, label, dashed }) {
  return React.createElement('div', { className: 'legend' },
    dashed
      ? React.createElement('span', { className: 'legend-line', style: { borderColor: color } })
      : React.createElement('span', { className: 'legend-dot', style: { background: color } }),
    React.createElement('span', null, label)
  );
}

function LoadingFrame() {
  return React.createElement('div', { style: { padding: 60, color: 'var(--ink-50)', fontFamily: 'monospace', fontSize: 12 } }, 'Loading data…');
}

Object.assign(window, { ArtboardOverview, KPI, LegendDot, LoadingFrame });
