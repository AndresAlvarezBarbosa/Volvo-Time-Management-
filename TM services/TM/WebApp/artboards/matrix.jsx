// artboards/matrix.jsx — Employee × Project heatmap matrix
// Rows: contributors (sortable), Cols: top projects, Cells: hours
// Click a row or column to filter; click a cell for detail

function ArtboardMatrix() {
  const data = useData();
  const [sortBy, setSortBy] = React.useState('hours');
  const [selRow, setSelRow] = React.useState(null);
  const [selCol, setSelCol] = React.useState(null);
  const [hover, setHover] = React.useState(null);
  const [pQ, setPQ] = React.useState(''); // people query
  const [jQ, setJQ] = React.useState(''); // project query
  if (!data) return React.createElement(LoadingFrame);
  const { records, employees } = data;

  // Top N projects by hours (billable + non-billable)
  const projHours = groupSum(records, r => r.project);
  const allTopProjects = [...projHours.entries()].sort((a,b) => b[1]-a[1]).slice(0, 18).map(([p]) => p);
  const topProjects = jQ.trim()
    ? allTopProjects.filter(p => p.toLowerCase().includes(jQ.trim().toLowerCase()))
    : allTopProjects;

  // Per-employee hours
  const empHours = {};
  for (const r of records) empHours[r.name] = (empHours[r.name]||0) + r.hours;

  // Sort employees, then filter by people query
  const empsAll = [...employees].sort((a,b) => {
    if (sortBy === 'hours') return (empHours[b.name]||0) - (empHours[a.name]||0);
    if (sortBy === 'brand') return (a.brand||'').localeCompare(b.brand||'') || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  const emps = pQ.trim()
    ? empsAll.filter(e => e.name.toLowerCase().includes(pQ.trim().toLowerCase()))
    : empsAll;

  // Build matrix
  const matrix = {};
  let cellMax = 0;
  for (const r of records) {
    if (!topProjects.includes(r.project)) continue;
    const k = r.name + '|' + r.project;
    matrix[k] = (matrix[k]||0) + r.hours;
    cellMax = Math.max(cellMax, matrix[k]);
  }

  const cellW = 30, cellH = 18, labelW = 180, headerH = 110;
  const totalW = labelW + topProjects.length * cellW + 80;
  const totalH = headerH + emps.length * cellH + 30;

  const projTrunc = p => p.length > 22 ? p.slice(0, 21) + '…' : p;

  // ── Projects-over-time line chart data ──
  const lineProjects = topProjects.slice(0, 8);
  const [hoverLine, setHoverLine] = React.useState(null);
  const [hoverWeekIdx, setHoverWeekIdx] = React.useState(null);

  const projWeekly = React.useMemo(() => {
    const weekSet = new Set();
    const map = {};
    for (const r of records) {
      if (!lineProjects.includes(r.project)) continue;
      const wk = r.date.slice(0, 4) + '-W' + String(weekOfYear(r.date)).padStart(2, '0');
      weekSet.add(wk);
      const k = r.project + '|' + wk;
      map[k] = (map[k] || 0) + r.hours;
    }
    const weeks = [...weekSet].sort();
    const series = lineProjects.map((proj) => ({
      project: proj,
      color: getProjectColor(proj),
      points: weeks.map(wk => ({ wk, hours: map[proj + '|' + wk] || 0 })),
    }));
    return { weeks, series };
  }, [records, lineProjects.join(',')]);

  const lcW = 920, lcH = 260, lcPadL = 56, lcPadR = 24, lcPadT = 24, lcPadB = 36;
  const lcInnerW = lcW - lcPadL - lcPadR, lcInnerH = lcH - lcPadT - lcPadB;
  const lcMaxY = Math.max(1, ...projWeekly.series.flatMap(s => s.points.map(p => p.hours)));
  const lcXStep = projWeekly.weeks.length > 1 ? lcInnerW / (projWeekly.weeks.length - 1) : lcInnerW;
  const lcY = h => lcPadT + lcInnerH - (h / lcMaxY) * lcInnerH;

  return React.createElement('div', { className: 'ab-frame' },
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '03 / Matrix'),
      React.createElement('h1', { className: 'ab-title' }, 'Who works on what'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, `${emps.length} contributors × top ${topProjects.length} projects`),
      )
    ),
    React.createElement('div', { className: 'panel' },
      React.createElement('div', { className: 'panel-h' },
        React.createElement('div', { className: 'panel-title' }, 'Hours matrix'),
        React.createElement('div', { className: 'pill-group' },
          React.createElement('span', { className: 'pill-label' }, 'Sort'),
          ['hours','name','brand'].map(k => React.createElement('button', {
            key: k, className: 'pill' + (sortBy===k?' on':''), onClick: () => setSortBy(k)
          }, k.charAt(0).toUpperCase()+k.slice(1)))
        )
      ),
      React.createElement('div', { className: 'mtx-search' },
        React.createElement('div', { className: 'mtx-search-field' },
          React.createElement('span', { className: 'mtx-search-lbl mono' }, 'PEOPLE'),
          React.createElement('input', {
            className: 'mtx-search-input', placeholder: 'Filter rows by name…',
            value: pQ, onChange: e => setPQ(e.target.value)
          }),
          pQ && React.createElement('button', { className: 'mtx-search-x', onClick: () => setPQ('') }, '×'),
          React.createElement('span', { className: 'mtx-search-count mono' },
            `${emps.length}/${empsAll.length}`)
        ),
        React.createElement('div', { className: 'mtx-search-field' },
          React.createElement('span', { className: 'mtx-search-lbl mono' }, 'PROJECTS'),
          React.createElement('input', {
            className: 'mtx-search-input', placeholder: 'Filter columns by project…',
            value: jQ, onChange: e => setJQ(e.target.value)
          }),
          jQ && React.createElement('button', { className: 'mtx-search-x', onClick: () => setJQ('') }, '×'),
          React.createElement('span', { className: 'mtx-search-count mono' },
            `${topProjects.length}/${allTopProjects.length}`)
        ),
      ),
      React.createElement('div', { className: 'mtx-scroll' },
        React.createElement('svg', { viewBox: `0 0 ${totalW} ${totalH}`, style: { width: totalW, maxWidth: '100%' } },
          // Column headers (rotated) + project-color tick above each column
          topProjects.map((p, ci) => {
            const x = labelW + ci*cellW + cellW/2;
            const isSel = selCol === p;
            const pColor = getProjectColor(p);
            return React.createElement('g', { key: p },
              React.createElement('rect', {
                x: labelW + ci*cellW + 1, y: headerH - 4, width: cellW - 2, height: 3, rx: 1,
                fill: pColor, opacity: isSel ? 1 : 0.85,
              }),
              React.createElement('g', {
                transform: `translate(${x}, ${headerH-8}) rotate(-55)`,
                onClick: () => setSelCol(selCol === p ? null : p),
                style: { cursor: 'pointer' }
              },
                React.createElement('text', {
                  className: 'mtx-collabel' + (isSel?' on':''), textAnchor: 'start',
                }, projTrunc(p))
              )
            );
          }),
          // Brand grouping band on left
          emps.map((e, ri) => {
            const y = headerH + ri*cellH;
            const isSel = selRow === e.name;
            const brandColor = e.brand === 'Mack' ? 'oklch(0.25 0.0 0)' : e.brand === 'VTNA' ? 'oklch(0.72 0.18 175)' : 'oklch(0.70 0.16 55)';
            return React.createElement('g', { key: e.name },
              React.createElement('rect', {
                x: 0, y, width: 4, height: cellH-2, fill: brandColor
              }),
              React.createElement('text', {
                x: 12, y: y + cellH*0.7, className: 'mtx-rowlabel' + (isSel?' on':''),
                onClick: () => setSelRow(selRow === e.name ? null : e.name),
                style: { cursor: 'pointer' },
              }, e.name.length > 22 ? e.name.slice(0,21)+'…' : e.name),
              React.createElement('text', {
                x: labelW - 10, y: y + cellH*0.7, textAnchor: 'end', className: 'mtx-rowtotal mono',
              }, fmtHours(empHours[e.name]||0))
            );
          }),
          // Cells
          emps.flatMap((e, ri) => topProjects.map((p, ci) => {
            const v = matrix[e.name + '|' + p] || 0;
            const t = v / cellMax;
            const x = labelW + ci*cellW, y = headerH + ri*cellH;
            const dim = (selRow && selRow !== e.name) || (selCol && selCol !== p);
            const hoverK = e.name + '|' + p;
            return React.createElement('rect', {
              key: hoverK, x: x+1, y: y+1, width: cellW-2, height: cellH-2, rx: 1,
              fill: v ? oklchScale(Math.max(0.1, t), 65, false) : 'transparent',
              stroke: hover === hoverK ? 'var(--ink)' : 'var(--rule)',
              strokeWidth: hover === hoverK ? 1.25 : 0.4,
              opacity: dim ? 0.18 : 1,
              onMouseEnter: () => setHover(hoverK),
              onMouseLeave: () => setHover(null),
              style: { cursor: 'crosshair' },
            });
          })),
        )
      ),
      React.createElement('div', { className: 'cal-detail' },
        hover ? (() => {
          const [n, p] = hover.split('|');
          const v = matrix[hover] || 0;
          return React.createElement(React.Fragment, null,
            React.createElement('span', { className: 'mono' }, n),
            React.createElement('span', null, '→'),
            React.createElement('span', null, p),
            React.createElement('span', { className: 'muted' }, `${fmtNum(Math.round(v))} hrs logged`),
          );
        })() : React.createElement('span', { className: 'muted' }, 'Hover a cell · click row/column to highlight')
      )
    ),

    // ── Projects over time line chart ──
    React.createElement('div', { className: 'panel', style: { marginTop: 16 } },
      React.createElement('div', { className: 'panel-h' },
        React.createElement('div', { className: 'panel-title' }, 'Projects over time'),
        React.createElement('div', { className: 'panel-sub mono' }, 'weekly hours · top 8 projects'),
      ),
      React.createElement('div', { className: 'panel-legend', style: { flexWrap: 'wrap', gap: '4px 14px', marginBottom: 4 } },
        projWeekly.series.map(s => React.createElement('div', {
          key: s.project, className: 'legend',
          style: { cursor: 'pointer', opacity: hoverLine && hoverLine !== s.project ? 0.3 : 1 },
          onMouseEnter: () => setHoverLine(s.project),
          onMouseLeave: () => setHoverLine(null),
        },
          React.createElement('span', { className: 'legend-dot', style: { background: s.color } }),
          React.createElement('span', null, projTrunc(s.project)),
        ))
      ),
      React.createElement('svg', {
        className: 'chart',
        viewBox: `0 0 ${lcW} ${lcH}`,
        onMouseLeave: () => setHoverWeekIdx(null),
        onMouseMove: e => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width * lcW - lcPadL;
          const i = Math.max(0, Math.min(projWeekly.weeks.length - 1, Math.round(x / lcXStep)));
          setHoverWeekIdx(i);
        },
      },
        // y gridlines
        [0, 0.25, 0.5, 0.75, 1].map(t => {
          const y = lcPadT + lcInnerH - t * lcInnerH;
          const v = Math.round(lcMaxY * t);
          return React.createElement('g', { key: t },
            React.createElement('line', { x1: lcPadL, x2: lcW - lcPadR, y1: y, y2: y, stroke: 'var(--rule)', strokeWidth: 0.5 }),
            React.createElement('text', { x: lcPadL - 10, y: y + 3, textAnchor: 'end', className: 'tick' }, fmtHours(v)),
          );
        }),
        // x ticks
        projWeekly.weeks.map((wk, i) => i % 4 === 0 ? React.createElement('text', {
          key: wk, x: lcPadL + i * lcXStep, y: lcH - lcPadB + 18, textAnchor: 'middle', className: 'tick',
        }, wk.slice(5)) : null),
        // lines
        projWeekly.series.map(s => {
          const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${lcPadL + i * lcXStep},${lcY(p.hours)}`).join(' ');
          const active = !hoverLine || hoverLine === s.project;
          return React.createElement('path', {
            key: s.project, d, fill: 'none', stroke: s.color,
            strokeWidth: hoverLine === s.project ? 2.5 : 1.5,
            opacity: active ? 1 : 0.12,
            onMouseEnter: () => setHoverLine(s.project),
            onMouseLeave: () => setHoverLine(null),
            style: { cursor: 'pointer' },
          });
        }),
        // hover guide
        hoverWeekIdx !== null && React.createElement('line', {
          x1: lcPadL + hoverWeekIdx * lcXStep, x2: lcPadL + hoverWeekIdx * lcXStep,
          y1: lcPadT, y2: lcPadT + lcInnerH, stroke: 'var(--ink)', strokeWidth: 0.5,
        }),
        // hover dots
        hoverWeekIdx !== null && projWeekly.series.map(s => {
          const p = s.points[hoverWeekIdx];
          if (!p || !p.hours) return null;
          const active = !hoverLine || hoverLine === s.project;
          return React.createElement('circle', {
            key: s.project, cx: lcPadL + hoverWeekIdx * lcXStep, cy: lcY(p.hours),
            r: hoverLine === s.project ? 5 : 3.5, fill: s.color, stroke: 'var(--bg)', strokeWidth: 1.5,
            opacity: active ? 1 : 0.15,
          });
        }),
      ),
      // hover detail
      hoverWeekIdx !== null && React.createElement('div', { className: 'cal-detail' },
        React.createElement('span', { className: 'mono' }, projWeekly.weeks[hoverWeekIdx]),
        projWeekly.series
          .filter(s => s.points[hoverWeekIdx]?.hours > 0)
          .sort((a, b) => b.points[hoverWeekIdx].hours - a.points[hoverWeekIdx].hours)
          .slice(0, 4)
          .map(s => React.createElement('span', { key: s.project, style: { color: s.color } },
            `${projTrunc(s.project)}: ${fmtNum(Math.round(s.points[hoverWeekIdx].hours))}h`
          )),
      ),
    )
  );
}

Object.assign(window, { ArtboardMatrix });
