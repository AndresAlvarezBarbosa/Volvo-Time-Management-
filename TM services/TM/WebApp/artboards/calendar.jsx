// artboards/calendar.jsx — Month-by-month calendar grid + brand/project pies
// Each month is its own mini calendar; cells stretch responsively. Two donut
// pies below break the same filtered range down by brand and by project.

function ArtboardCalendar() {
  const data = useData();
  const [filter, setFilter] = React.useState('all');
  const [hover, setHover] = React.useState(null);
  const [hoverBrand, setHoverBrand] = React.useState(null);
  const [hoverProj, setHoverProj] = React.useState(null);
  const [expandedMonth, _setExpandedMonth] = React.useState(null); // 'YYYY-M' or null
  const [zoom, setZoom] = React.useState(1);

  function setExpandedMonth(key) { setZoom(1); _setExpandedMonth(key); }
  function zoomIn() { setZoom(function (z) { return Math.min(2.5, Math.round((z + 0.25) * 100) / 100); }); }
  function zoomOut() { setZoom(function (z) { return Math.max(0.5, Math.round((z - 0.25) * 100) / 100); }); }
  function zoomReset() { setZoom(1); }

  const records = data?.records || [];
  const minDate = data?.minDate;
  const maxDate = data?.maxDate;

  const filtered = React.useMemo(() => {
    if (filter === 'billable') return records.filter(r => r.billable);
    if (filter === 'nonbillable') return records.filter(r => !r.billable);
    return records;
  }, [records, filter]);

  const byDay = React.useMemo(() => {
    const m = new Map();
    for (const r of filtered) {
      const cur = m.get(r.date) || { hours: 0, billable: 0, contributors: new Set(), projects: new Set() };
      cur.hours += r.hours;
      if (r.billable) cur.billable += r.hours;
      cur.contributors.add(r.name);
      cur.projects.add(r.project);
      m.set(r.date, cur);
    }
    return m;
  }, [filtered]);

  const byBrand = React.useMemo(() => {
    const m = new Map();
    for (const r of filtered) m.set(r.brand || 'Unknown', (m.get(r.brand || 'Unknown') || 0) + r.hours);
    const entries = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    return { entries, total };
  }, [filtered]);

  const byProject = React.useMemo(() => {
    const m = new Map();
    for (const r of filtered) m.set(r.project || 'Unknown', (m.get(r.project || 'Unknown') || 0) + r.hours);
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 8);
    const rest = sorted.slice(8);
    const entries = top.slice();
    if (rest.length > 0) {
      const restSum = rest.reduce((a, [, v]) => a + v, 0);
      entries.push(['Other (' + rest.length + ')', restSum]);
    }
    const total = sorted.reduce((a, [, v]) => a + v, 0);
    return { entries, total };
  }, [filtered]);

  if (!data) return React.createElement(LoadingFrame);

  // Build month list spanning the data range
  const months = (() => {
    if (!minDate || !maxDate) return [];
    const result = [];
    const sParts = minDate.split('-').map(Number);
    const eParts = maxDate.split('-').map(Number);
    let y = sParts[0], m = sParts[1];
    while (y < eParts[0] || (y === eParts[0] && m <= eParts[1])) {
      result.push({ year: y, month: m });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return result;
  })();

  const maxH = Math.max(...[...byDay.values()].map(v => v.hours), 1);

  // Brand colors
  const brandColorMap = {
    'Mack': 'oklch(0.45 0.08 0)',
    'VTNA': 'oklch(0.60 0.16 175)',
    'Multi-Brand': 'oklch(0.65 0.16 55)',
    'Unknown': 'var(--ink-30)'
  };
  // Project pie/legend pull from the system-wide project palette.
  // The synthetic "Other (n)" slice falls back to a neutral grey.
  const projColorFor = (label) => {
    if (typeof label === 'string' && label.startsWith('Other (')) return 'var(--ink-30)';
    return getProjectColor(label);
  };

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Build month grid (array of weeks, each week is 7 cells)
  function buildMonth(year, month) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weeks = [];
    let week = new Array(7).fill(null);
    for (let day = 1; day <= lastDay; day++) {
      const dStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      week[dow] = dStr;
      if (dow === 6 || day === lastDay) {
        weeks.push(week);
        week = new Array(7).fill(null);
      }
    }
    return weeks;
  }

  function monthHours(year, month) {
    let h = 0;
    for (const [date, v] of byDay.entries()) {
      const dp = date.split('-');
      if (Number(dp[0]) === year && Number(dp[1]) === month) h += v.hours;
    }
    return h;
  }

  // Render a single month card. `big` = expanded full-width view.
  function renderMonth(year, month, big) {
    const key = year + '-' + month;
    const weeks = buildMonth(year, month);
    const monthLbl = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const total = monthHours(year, month);

    // Spacing — uniform 4px scale
    const z = big ? zoom : 1;
    const cardPad = big ? Math.round(24 * z) + 'px' : '20px';
    const cardGap = big ? Math.round(16 * z) + 'px' : '12px';
    const headerSize = big ? Math.round(22 * z) + 'px' : '14px';
    const cellGap = big ? Math.round(8 * z) + 'px' : '4px';
    const cellPad = big ? Math.round(12 * z) + 'px' : '8px';
    const cellRadius = big ? Math.round(8 * z) + 'px' : '6px';
    const dayNumSize = big ? Math.round(13 * z) + 'px' : '10px';
    const hoursSize = big ? Math.round(15 * z) + 'px' : '0px';
    const billSize = big ? Math.round(10 * z) + 'px' : '0px';
    const dowSize = big ? Math.round(11 * z) + 'px' : '9px';
    const minCellH = big ? Math.round(64 * z) + 'px' : '36px';
    const dayNumOffset = big ? Math.round(8 * z) + 'px' : '6px';

    return React.createElement('div', {
      key: key,
      style: {
        background: 'var(--panel)', border: '1px solid ' + (big ? 'var(--ink-30)' : 'var(--rule)'),
        borderRadius: '8px', padding: cardPad,
        display: 'flex', flexDirection: 'column', gap: cardGap,
        cursor: big ? 'default' : 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: big ? '0 4px 16px rgba(0,0,0,0.06)' : 'none'
      },
      onClick: big ? undefined : function () { setExpandedMonth(key); }
    },
      // Header
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' } },
        React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' } },
          React.createElement('span', { style: { fontFamily: 'var(--font-display)', fontSize: headerSize, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.01em' } }, monthLbl),
          React.createElement('span', { className: 'mono', style: { fontSize: big ? '13px' : '11px', color: 'var(--ink-50)' } }, fmtHours(total) + 'h total')
        ),
        big
          ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              // Zoom controls
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', border: '1px solid var(--rule)', borderRadius: '6px', overflow: 'hidden' } },
                React.createElement('button', {
                  onClick: function (e) { e.stopPropagation(); zoomOut(); },
                  disabled: zoom <= 0.5,
                  style: {
                    width: '28px', height: '28px', border: 'none',
                    borderRight: '1px solid var(--rule)', background: 'transparent',
                    color: zoom <= 0.5 ? 'var(--ink-15)' : 'var(--ink-70)',
                    cursor: zoom <= 0.5 ? 'default' : 'pointer',
                    fontSize: '16px', fontFamily: 'var(--font-body)', lineHeight: 1
                  }
                }, '−'),
                React.createElement('button', {
                  onClick: function (e) { e.stopPropagation(); zoomReset(); },
                  style: {
                    minWidth: '52px', height: '28px', padding: '0 8px', border: 'none',
                    background: 'transparent', color: 'var(--ink-70)',
                    cursor: 'pointer', fontSize: '11px', fontFamily: 'var(--font-mono)'
                  }
                }, Math.round(zoom * 100) + '%'),
                React.createElement('button', {
                  onClick: function (e) { e.stopPropagation(); zoomIn(); },
                  disabled: zoom >= 2.5,
                  style: {
                    width: '28px', height: '28px', border: 'none',
                    borderLeft: '1px solid var(--rule)', background: 'transparent',
                    color: zoom >= 2.5 ? 'var(--ink-15)' : 'var(--ink-70)',
                    cursor: zoom >= 2.5 ? 'default' : 'pointer',
                    fontSize: '14px', fontFamily: 'var(--font-body)', lineHeight: 1
                  }
                }, '+')
              ),
              React.createElement('button', {
                onClick: function (e) { e.stopPropagation(); setExpandedMonth(null); },
                style: {
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 12px', height: '28px',
                  border: '1px solid var(--rule)', borderRadius: '6px',
                  background: 'transparent', color: 'var(--ink-70)',
                  cursor: 'pointer', fontSize: '11px', fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s'
                }
              }, '← All months')
            )
          : React.createElement('span', { style: { fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--ink-30)', letterSpacing: '0.06em', textTransform: 'uppercase' } }, 'click to expand')
      ),
      // Day-of-week labels
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: cellGap, paddingBottom: '8px', borderBottom: '1px solid var(--ink-04)' } },
        dayLabels.map(function (d, i) {
          return React.createElement('div', {
            key: i,
            style: { fontFamily: 'var(--font-mono)', fontSize: dowSize, color: 'var(--ink-50)', textAlign: 'center', letterSpacing: '0.1em', padding: '4px 0', fontWeight: 500 }
          }, d);
        })
      ),
      // Day cells
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: cellGap } },
        weeks.flatMap(function (w, wi) {
          return w.map(function (dStr, di) {
            if (!dStr) {
              return React.createElement('div', { key: wi + '-' + di, style: { aspectRatio: '1 / 1' } });
            }
            const d = byDay.get(dStr);
            const t = d ? d.hours / maxH : 0;
            const isHover = hover === dStr;
            const dayNum = Number(dStr.split('-')[2]);
            const hasData = !!d;
            const isWeekend = di === 0 || di === 6;
            return React.createElement('div', {
              key: dStr,
              onClick: function (e) { e.stopPropagation(); },
              onMouseEnter: function () { setHover(dStr); },
              onMouseLeave: function () { setHover(null); },
              style: {
                aspectRatio: '1 / 1',
                background: hasData ? oklchScale(Math.max(0.06, t), 155, false) : (isWeekend ? 'var(--ink-04)' : 'transparent'),
                border: '0.5px solid ' + (isHover ? 'var(--ink)' : 'var(--rule)'),
                borderRadius: big ? '6px' : '4px',
                padding: cellPad,
                position: 'relative',
                cursor: 'default', transition: 'all 0.1s',
                boxShadow: isHover ? '0 0 0 1px var(--ink)' : 'none',
                minHeight: minCellH,
                overflow: 'hidden'
              }
            },
              // Day number — absolutely positioned top-left
              React.createElement('span', {
                style: {
                  position: 'absolute', top: big ? Math.round(6 * z) + 'px' : '4px', left: big ? Math.round(8 * z) + 'px' : '5px',
                  fontFamily: 'var(--font-mono)', fontSize: dayNumSize, lineHeight: 1,
                  fontWeight: 500, color: hasData ? '#fff' : 'var(--ink-30)'
                }
              }, dayNum),
              // Detail (hours + billable) — only in big mode, positioned bottom-right
              big && hasData && React.createElement('div', {
                style: {
                  position: 'absolute', bottom: Math.round(6 * z) + 'px', right: Math.round(8 * z) + 'px',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: Math.round(2 * z) + 'px'
                }
              },
                React.createElement('span', {
                  style: { fontFamily: 'var(--font-mono)', fontSize: hoursSize, lineHeight: 1, fontWeight: 600, color: '#fff' }
                }, fmtHours(d.hours) + 'h'),
                React.createElement('span', {
                  style: { fontFamily: 'var(--font-mono)', fontSize: billSize, lineHeight: 1, color: 'rgba(255,255,255,0.75)' }
                }, fmtNum(Math.round(d.billable)) + ' bill')
              )
            );
          });
        })
      )
    );
  }

  // Pie chart renderer (donut)
  function renderPie(entries, total, getColor, hoverIdx, setHoverIdx) {
    const size = 240, cx = size / 2, cy = size / 2;
    const r = 100, inner = 58;
    if (total === 0 || entries.length === 0) {
      return React.createElement('div', { style: { padding: '40px', textAlign: 'center', color: 'var(--ink-30)', fontSize: '11px' } }, 'No data');
    }
    let angle = -Math.PI / 2;
    const slices = entries.map(([label, value], i) => {
      const startAngle = angle;
      const sliceAngle = (value / total) * Math.PI * 2;
      angle += sliceAngle;
      const endAngle = angle;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const ix1 = cx + inner * Math.cos(startAngle);
      const iy1 = cy + inner * Math.sin(startAngle);
      const ix2 = cx + inner * Math.cos(endAngle);
      const iy2 = cy + inner * Math.sin(endAngle);
      const path = 'M ' + x1 + ' ' + y1 +
        ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 +
        ' L ' + ix2 + ' ' + iy2 +
        ' A ' + inner + ' ' + inner + ' 0 ' + largeArc + ' 0 ' + ix1 + ' ' + iy1 + ' Z';
      return { label, value, path, color: getColor(label, i) };
    });

    const focused = hoverIdx != null ? slices[hoverIdx] : null;
    const centerPrimary = focused ? fmtHours(focused.value) : fmtHours(total);
    const centerSecondary = focused ? focused.label : 'total hours';
    const centerPct = focused ? (focused.value / total * 100).toFixed(1) + '%' : '';

    return React.createElement('svg', {
      viewBox: '0 0 ' + size + ' ' + size,
      style: { width: '100%', height: 'auto', maxWidth: size + 'px', display: 'block' },
      onMouseLeave: () => setHoverIdx(null)
    },
      slices.map((s, i) => React.createElement('path', {
        key: s.label, d: s.path, fill: s.color,
        stroke: 'var(--panel)', strokeWidth: 1.5,
        opacity: hoverIdx == null || hoverIdx === i ? 1 : 0.4,
        style: { transition: 'opacity 0.15s', cursor: 'pointer' },
        onMouseEnter: () => setHoverIdx(i)
      })),
      // Center text
      React.createElement('text', { x: cx, y: cy - 6, textAnchor: 'middle',
        style: { fontSize: '22px', fontFamily: 'var(--font-display)', fontWeight: 500, fill: 'var(--ink)', letterSpacing: '-0.02em' }
      }, centerPrimary),
      centerPct && React.createElement('text', { x: cx, y: cy + 12, textAnchor: 'middle',
        style: { fontSize: '12px', fontFamily: 'var(--font-mono)', fill: 'var(--accent-hi)', fontWeight: 600 }
      }, centerPct),
      React.createElement('text', { x: cx, y: cy + (centerPct ? 26 : 14), textAnchor: 'middle',
        style: { fontSize: '9px', fontFamily: 'var(--font-mono)', fill: 'var(--ink-50)', letterSpacing: '0.1em', textTransform: 'uppercase' }
      }, centerSecondary.length > 22 ? centerSecondary.slice(0, 21) + '…' : centerSecondary)
    );
  }

  function renderLegend(entries, total, getColor, hoverIdx, setHoverIdx) {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 } },
      entries.map(([label, value], i) => {
        const pct = total > 0 ? (value / total * 100).toFixed(1) : '0.0';
        const isH = hoverIdx === i;
        return React.createElement('button', {
          key: label,
          onMouseEnter: () => setHoverIdx(i),
          onMouseLeave: () => setHoverIdx(null),
          style: {
            display: 'grid', gridTemplateColumns: '12px 1fr auto auto',
            alignItems: 'center', gap: '8px',
            padding: '5px 8px',
            background: isH ? 'var(--ink-04)' : 'transparent',
            border: 'none', borderRadius: '4px',
            cursor: 'pointer', textAlign: 'left',
            fontFamily: 'var(--font-body)', transition: 'background 0.1s',
            opacity: hoverIdx == null || isH ? 1 : 0.5
          }
        },
          React.createElement('span', { style: { width: 10, height: 10, borderRadius: 2, background: getColor(label, i) } }),
          React.createElement('span', { style: { fontSize: '11.5px', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }, title: label }, label),
          React.createElement('span', { className: 'mono', style: { fontSize: '10.5px', color: 'var(--ink-70)', textAlign: 'right' } }, fmtHours(value) + 'h'),
          React.createElement('span', { className: 'mono', style: { fontSize: '10px', color: 'var(--ink-50)', textAlign: 'right', minWidth: 38 } }, pct + '%')
        );
      })
    );
  }

  return React.createElement('div', { className: 'ab-frame' },
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '02 / Calendar'),
      React.createElement('h1', { className: 'ab-title' }, 'Daily logged hours'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, 'Each cell is one day. Months break out individually.')
      )
    ),
    // Calendar panel
    React.createElement('div', { className: 'panel' },
      React.createElement('div', { className: 'panel-h' },
        React.createElement('div', { className: 'panel-title' }, 'Month-by-month heatmap'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
          React.createElement('div', { className: 'pill-group' },
            ['all', 'billable', 'nonbillable'].map(k => React.createElement('button', {
              key: k, className: 'pill' + (filter === k ? ' on' : ''),
              onClick: () => setFilter(k)
            }, k === 'all' ? 'All' : k === 'billable' ? 'Billable' : 'Non-billable'))
          )
        )
      ),
      expandedMonth
        ? (function () {
            const parts = expandedMonth.split('-').map(Number);
            return React.createElement('div', { style: { width: '100%', overflow: 'auto' } },
              renderMonth(parts[0], parts[1], true)
            );
          })()
        : React.createElement('div', { style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '22px', alignItems: 'start'
          } },
            months.map(function (mn) { return renderMonth(mn.year, mn.month, false); })
          ),
      // Hover detail / legend strip
      React.createElement('div', { className: 'cal-detail' },
        hover && byDay.has(hover) ? (() => {
          const d = byDay.get(hover);
          return React.createElement(React.Fragment, null,
            React.createElement('span', { className: 'mono' }, shortDate(hover)),
            React.createElement('span', null, fmtNum(Math.round(d.hours)) + ' hrs total'),
            React.createElement('span', { className: 'muted' },
              fmtNum(Math.round(d.billable)) + ' billable · ' + d.contributors.size + ' contributors · ' + d.projects.size + ' projects'
            )
          );
        })() : (() => {
          const stops = 6;
          return React.createElement(React.Fragment, null,
            React.createElement('span', { className: 'muted' }, 'Hover a day for detail'),
            React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
              React.createElement('span', { className: 'tick', style: { fontSize: 10 } }, 'less'),
              ...[...Array(stops)].map((_, i) => React.createElement('span', {
                key: i,
                style: { width: 12, height: 12, borderRadius: 2, background: oklchScale(i / (stops - 1) * 0.85 + 0.08, 155, false), border: '0.5px solid var(--rule)' }
              })),
              React.createElement('span', { className: 'tick', style: { fontSize: 10 } }, 'more · max ' + fmtHours(maxH) + 'h/day')
            )
          );
        })()
      )
    ),

    // Two pie charts — brand + projects
    React.createElement('div', { className: 'two-up' },
      // Brand pie
      React.createElement('div', { className: 'panel' },
        React.createElement('div', { className: 'panel-h' },
          React.createElement('div', { className: 'panel-title' }, 'Time usage by brand'),
          React.createElement('div', { className: 'panel-sub mono' }, byBrand.entries.length + ' brands')
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) minmax(0, 1fr)', gap: '24px', alignItems: 'center', padding: '8px 4px' } },
          renderPie(byBrand.entries, byBrand.total,
            (label) => brandColorMap[label] || 'var(--ink-50)',
            hoverBrand, setHoverBrand),
          renderLegend(byBrand.entries, byBrand.total,
            (label) => brandColorMap[label] || 'var(--ink-50)',
            hoverBrand, setHoverBrand)
        )
      ),
      // Project pie
      React.createElement('div', { className: 'panel' },
        React.createElement('div', { className: 'panel-h' },
          React.createElement('div', { className: 'panel-title' }, 'Time usage by project'),
          React.createElement('div', { className: 'panel-sub mono' }, 'top 8 + others')
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) minmax(0, 1fr)', gap: '24px', alignItems: 'center', padding: '8px 4px' } },
          renderPie(byProject.entries, byProject.total,
            (label) => projColorFor(label),
            hoverProj, setHoverProj),
          renderLegend(byProject.entries, byProject.total,
            (label) => projColorFor(label),
            hoverProj, setHoverProj)
        )
      )
    )
  );
}

Object.assign(window, { ArtboardCalendar });
