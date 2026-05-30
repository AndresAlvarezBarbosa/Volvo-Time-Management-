// artboards/timeline.jsx — Cumulative timeline with playback scrubber
// Stacked area showing cumulative hours per brand over time, with a draggable scrubber + play/pause.

function ArtboardTimeline() {
  const data = useData();
  const [idx, setIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  const records = data?.records || [];
  const minDate = data?.minDate || '2026-01-01';
  const maxDate = data?.maxDate || '2026-01-01';

  const dates = React.useMemo(() => fillDateRange(minDate, maxDate), [minDate, maxDate]);
  const brands = ['VTNA','Mack','Multi-Brand'];

  // Cumulative per brand over each date
  const series = React.useMemo(() => {
    const init = {}; for (const b of brands) init[b] = 0;
    const byDate = {};
    for (const d of dates) byDate[d] = { ...init };
    for (const r of records) {
      if (byDate[r.date]) byDate[r.date][r.brand] = (byDate[r.date][r.brand]||0) + r.hours;
    }
    const cum = {}; for (const b of brands) cum[b] = 0;
    return dates.map(d => {
      for (const b of brands) cum[b] += (byDate[d][b]||0);
      return { date: d, ...cum, total: brands.reduce((s,b)=>s+cum[b], 0) };
    });
  }, [records, dates]);

  React.useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIdx(i => {
        if (i >= dates.length - 1) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 60);
    return () => clearInterval(id);
  }, [playing, dates.length]);

  // Initialize idx to last date once data loads
  React.useEffect(() => {
    if (dates.length > 1) setIdx(dates.length - 1);
  }, [dates.length]);

  const dailyByDate = React.useMemo(() => {
    const m = {};
    for (const r of records) m[r.date] = (m[r.date]||0) + r.hours;
    return dates.map(d => m[d] || 0);
  }, [records, dates]);

  const activeUntil = React.useMemo(() => {
    const cutoff = dates[idx] || dates[0];
    const filtered = records.filter(r => r.date <= cutoff);
    const byProj = groupSum(filtered, r => r.project);
    return [...byProj.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 5);
  }, [idx, records, dates]);

  if (!data) return React.createElement(LoadingFrame);

  const W = 1100, H = 340, padL = 60, padR = 24, padT = 28, padB = 36;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const total = series[series.length-1].total;
  const x = i => padL + (i / Math.max(1, dates.length-1)) * innerW;
  const y = v => padT + innerH - (v / total) * innerH;

  const colors = { 'Mack': 'oklch(0.25 0.0 0)', 'VTNA': 'oklch(0.72 0.18 175)', 'Multi-Brand': 'oklch(0.70 0.16 55)' };

  // Build stacked paths
  const stacked = series.map(s => {
    let acc = 0;
    const layers = {};
    for (const b of brands) { layers[b] = [acc, acc + s[b]]; acc += s[b]; }
    return layers;
  });
  const areaPath = (b) => {
    const top = stacked.map((s,i) => `${i===0?'M':'L'}${x(i)},${y(s[b][1])}`).join(' ');
    const bot = stacked.map((s,i) => `L${x(stacked.length-1-i)},${y(stacked[stacked.length-1-i][b][0])}`).join(' ');
    return top + ' ' + bot + ' Z';
  };

  // Up to current idx
  const cur = series[idx];
  const upTo = idx;

  // Daily bars (small, below the area to give rhythm)
  const maxDaily = Math.max(...dailyByDate);
  const barW = innerW / dates.length;

  return React.createElement('div', { className: 'ab-frame' },
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '05 / Timeline'),
      React.createElement('h1', { className: 'ab-title' }, 'Cumulative hours, replayed'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, 'Press play. Drag the scrubber. Watch the year accumulate.'),
      )
    ),
    // Live KPI strip
    React.createElement('div', { className: 'kpi-row' },
      React.createElement(KPI, { label: 'As of', value: shortDate(dates[idx]), unit: '', sub: dates[idx] }),
      React.createElement(KPI, { label: 'Hours to date', value: fmtNum(Math.round(cur.total)), unit: 'hrs', sub: `${(cur.total/total*100).toFixed(0)}% of full period` }),
      React.createElement(KPI, { label: 'VTNA', value: fmtNum(Math.round(cur['VTNA'])), unit: 'hrs', sub: '' }),
      React.createElement(KPI, { label: 'Mack', value: fmtNum(Math.round(cur['Mack'])), unit: 'hrs', sub: '' }),
    ),
    React.createElement('div', { className: 'panel' },
      React.createElement('div', { className: 'panel-h' },
        React.createElement('div', { className: 'panel-title' }, 'Cumulative hours by brand'),
        React.createElement('div', { className: 'panel-legend' },
          ...brands.map(b => React.createElement(LegendDot, { key: b, color: colors[b], label: b }))
        )
      ),
      React.createElement('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto', display: 'block' } },
        // y gridlines
        [0, 0.5, 1].map(t => {
          const yy = padT + innerH - t*innerH;
          const v = Math.round(total * t);
          return React.createElement('g', { key: t },
            React.createElement('line', { x1: padL, x2: W-padR, y1: yy, y2: yy, stroke: 'var(--rule)', strokeWidth: 0.5 }),
            React.createElement('text', { x: padL-10, y: yy+3, textAnchor: 'end', className: 'tick' }, fmtHours(v))
          );
        }),
        // month ticks
        (() => {
          const seen = new Set();
          return dates.map((d,i) => {
            const m = monthOf(d);
            if (seen.has(m)) return null; seen.add(m);
            return React.createElement('g', { key: m },
              React.createElement('line', { x1: x(i), x2: x(i), y1: padT, y2: padT+innerH, stroke: 'var(--rule)', strokeWidth: 0.4 }),
              React.createElement('text', { x: x(i)+4, y: H-padB+18, className: 'tick' }, monthLabel(m).split(' ')[0])
            );
          });
        })(),
        // stacked areas — clipped to current idx
        React.createElement('defs', null,
          React.createElement('clipPath', { id: 'tl-clip' },
            React.createElement('rect', { x: padL, y: padT, width: x(upTo) - padL, height: innerH }),
          ),
        ),
        React.createElement('g', { clipPath: 'url(#tl-clip)' },
          brands.map(b => React.createElement('path', {
            key: b, d: areaPath(b), fill: colors[b], opacity: 0.85,
          })),
        ),
        // Future portion ghosted
        React.createElement('g', { opacity: 0.08 },
          brands.map(b => React.createElement('path', { key: b, d: areaPath(b), fill: colors[b] })),
        ),
        // scrubber line
        React.createElement('line', {
          x1: x(idx), x2: x(idx), y1: padT-4, y2: padT+innerH+4,
          stroke: 'var(--accent-hi)', strokeWidth: 1.5
        }),
        React.createElement('circle', { cx: x(idx), cy: padT-4, r: 5, fill: 'var(--accent-hi)' }),
      ),
      // Scrubber control
      React.createElement('div', { className: 'scrubber' },
        React.createElement('button', {
          className: 'play-btn', onClick: () => {
            if (idx >= dates.length-1) setIdx(0);
            setPlaying(p => !p);
          }
        }, playing ? '❚❚' : '▶'),
        React.createElement('input', {
          type: 'range', min: 0, max: dates.length-1, value: idx, className: 'range',
          onChange: e => { setIdx(+e.target.value); setPlaying(false); }
        }),
        React.createElement('span', { className: 'mono scrubber-date' }, shortDate(dates[idx]))
      ),
      // Daily bars below
      React.createElement('div', { style: { height: 1, background: 'var(--rule)', margin: '8px 0' } }),
      React.createElement('svg', { viewBox: `0 0 ${W} 70`, style: { width: '100%', height: 70, display: 'block' } },
        dailyByDate.map((v, i) => React.createElement('rect', {
          key: i, x: x(i)-barW/2+0.4, y: 70 - (v/maxDaily)*60, width: Math.max(0.6, barW-0.8), height: (v/maxDaily)*60,
          fill: i <= idx ? 'var(--ink-50)' : 'var(--ink-15)'
        })),
        React.createElement('text', { x: padL, y: 12, className: 'tick' }, 'Daily hours'),
        React.createElement('text', { x: W-padR, y: 12, className: 'tick', textAnchor: 'end' }, `peak ${fmtHours(maxDaily)}h`),
      ),
    ),
    // Live top projects panel
    React.createElement('div', { className: 'panel' },
      React.createElement('div', { className: 'panel-h' },
        React.createElement('div', { className: 'panel-title' }, 'Top projects to date'),
        React.createElement('div', { className: 'panel-sub mono' }, `as of ${shortDate(dates[idx])}`)
      ),
      React.createElement('div', { className: 'bars' },
        activeUntil.map(([proj, h]) => {
          const pct = h / activeUntil[0][1];
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
  );
}

Object.assign(window, { ArtboardTimeline });
