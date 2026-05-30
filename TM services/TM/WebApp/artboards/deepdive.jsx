// artboards/deepdive.jsx — Project deep-dive
// Pick a project from a sortable list (left). Right shows: contributor breakdown,
// daily cadence sparkline, and key stats.

function ArtboardDeepDive() {
  const data = useData();
  const [sel, setSel] = React.useState(null);
  const [search, setSearch] = React.useState('');

  const records = data?.records || [];
  const wbs = data?.wbs || [];
  const minDate = data?.minDate || '2026-01-01';
  const maxDate = data?.maxDate || '2026-01-01';

  // Project list with totals
  const projInfo = React.useMemo(() => {
    const m = new Map();
    for (const r of records) {
      const cur = m.get(r.project) || { name: r.project, hours: 0, billable: r.billable, contributors: new Set(), dates: new Set() };
      cur.hours += r.hours;
      cur.contributors.add(r.name);
      cur.dates.add(r.date);
      m.set(r.project, cur);
    }
    return [...m.values()].sort((a,b) => b.hours - a.hours);
  }, [records]);

  // Initialize sel once data loads
  React.useEffect(() => {
    if (!sel && projInfo.length) setSel(projInfo[0].name);
  }, [projInfo, sel]);

  const projRecords = React.useMemo(() => records.filter(r => r.project === sel), [records, sel]);

  if (!data) return React.createElement(LoadingFrame);

  const filteredList = projInfo.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const proj = sel ? projInfo.find(p => p.name === sel) : null;

  // Contributor split
  const byPerson = groupSum(projRecords, r => r.name);
  const contribs = [...byPerson.entries()].sort((a,b)=>b[1]-a[1]);

  // Daily cadence
  const dates = fillDateRange(minDate, maxDate);
  const dailyMap = {};
  for (const r of projRecords) dailyMap[r.date] = (dailyMap[r.date]||0) + r.hours;
  const dailyArr = dates.map(d => ({ date: d, hours: dailyMap[d] || 0 }));
  const maxD = Math.max(1, ...dailyArr.map(d=>d.hours));

  const W = 720, H = 130, padL = 40, padR = 12, padT = 12, padB = 22;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  // Activity types share
  const activityShare = groupSum(projRecords, r => r.activity);
  const totalAct = [...activityShare.values()].reduce((s,v)=>s+v, 0);

  return React.createElement('div', { className: 'ab-frame' },
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '06 / Deep dive'),
      React.createElement('h1', { className: 'ab-title' }, 'Project teardown'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, 'Pick any project to see who, when, how much.'),
      )
    ),
    React.createElement('div', { className: 'dd-grid' },
      // Left: project list
      React.createElement('div', { className: 'panel dd-list-panel' },
        React.createElement('div', { className: 'panel-h' },
          React.createElement('div', { className: 'panel-title' }, 'Projects'),
          React.createElement('span', { className: 'panel-sub mono' }, `${projInfo.length} total`)
        ),
        React.createElement('input', {
          className: 'dd-search', placeholder: 'Search projects…',
          value: search, onChange: e => setSearch(e.target.value)
        }),
        React.createElement('div', { className: 'dd-list' },
          filteredList.map(p => React.createElement('button', {
            key: p.name, className: 'dd-row' + (sel===p.name?' on':''),
            style: { '--proj-color': getProjectColor(p.name) },
            onClick: () => setSel(p.name)
          },
            React.createElement('span', { className: 'dd-row-name' }, p.name),
            React.createElement('span', { className: 'dd-row-hrs mono' }, fmtHours(p.hours)+'h'),
          ))
        )
      ),
      // Right: project detail
      React.createElement('div', { className: 'dd-detail' },
        proj ? React.createElement(React.Fragment, null,
          // Header card
          React.createElement('div', { className: 'panel', style: { borderLeft: `4px solid ${getProjectColor(proj.name)}` } },
            React.createElement('div', { className: 'dd-projhead' },
              React.createElement('div', null,
                React.createElement('div', { className: 'panel-sub mono' }, proj.contributors.size+' contributors · '+proj.dates.size+' active days'),
                React.createElement('h2', { className: 'dd-projtitle', style: { display: 'flex', alignItems: 'center', gap: 10 } },
                  React.createElement('span', { className: 'proj-swatch', style: { width: 14, height: 14, background: getProjectColor(proj.name) } }),
                  proj.name
                ),
              ),
              React.createElement('div', { className: 'dd-projstats' },
                React.createElement('div', null,
                  React.createElement('div', { className: 'dd-stat-num' }, fmtNum(Math.round(proj.hours))),
                  React.createElement('div', { className: 'dd-stat-lbl mono' }, 'hours'),
                ),
                React.createElement('div', null,
                  React.createElement('div', { className: 'dd-stat-num' }, (proj.hours/proj.contributors.size).toFixed(0)),
                  React.createElement('div', { className: 'dd-stat-lbl mono' }, 'avg / person'),
                ),
                React.createElement('div', null,
                  React.createElement('div', { className: 'dd-stat-num' }, (proj.hours/proj.dates.size).toFixed(1)),
                  React.createElement('div', { className: 'dd-stat-lbl mono' }, 'avg / active day'),
                ),
              )
            ),
            // Cadence sparkline
            React.createElement('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', height: 'auto' } },
              [0, 0.5, 1].map(t => {
                const y = padT + innerH - t*innerH;
                return React.createElement('line', {
                  key: t, x1: padL, x2: W-padR, y1: y, y2: y, stroke: 'var(--rule)', strokeWidth: 0.5
                });
              }),
              (() => { const projColor = getProjectColor(proj.name); return dailyArr.map((d, i) => {
                const x = padL + (i/(dailyArr.length-1)) * innerW;
                const h = (d.hours / maxD) * innerH;
                return React.createElement('rect', {
                  key: i, x: x-1, y: padT+innerH-h, width: 2, height: h, fill: d.hours ? projColor : 'transparent'
                });
              }); })(),
              React.createElement('text', { x: padL, y: H-4, className: 'tick' }, shortDate(minDate)),
              React.createElement('text', { x: W-padR, y: H-4, textAnchor: 'end', className: 'tick' }, shortDate(maxDate)),
              React.createElement('text', { x: padL-6, y: padT+8, textAnchor: 'end', className: 'tick' }, fmtHours(maxD)),
            ),
          ),
          // Two-up: contributors + activity share
          React.createElement('div', { className: 'two-up' },
            React.createElement('div', { className: 'panel' },
              React.createElement('div', { className: 'panel-h' },
                React.createElement('div', { className: 'panel-title' }, 'Contributors'),
                React.createElement('span', { className: 'panel-sub mono' }, `${contribs.length} people`)
              ),
              React.createElement('div', { className: 'bars' },
                contribs.slice(0, 12).map(([name, h]) => {
                  const pct = h / contribs[0][1];
                  return React.createElement('div', { key: name, className: 'bar-row' },
                    React.createElement('div', { className: 'bar-label', title: name }, name),
                    React.createElement('div', { className: 'bar-track' },
                      React.createElement('div', { className: 'bar-fill', style: { width: `${pct*100}%`, background: 'var(--accent)' } })
                    ),
                    React.createElement('div', { className: 'bar-value mono' }, `${fmtNum(Math.round(h))} h`),
                  );
                })
              )
            ),
            React.createElement('div', { className: 'panel' },
              React.createElement('div', { className: 'panel-h' },
                React.createElement('div', { className: 'panel-title' }, 'Activity type'),
              ),
              React.createElement('div', { className: 'bars' },
                [...activityShare.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v]) => {
                  const pct = v / totalAct;
                  return React.createElement('div', { key: k, className: 'bar-row' },
                    React.createElement('div', { className: 'bar-label' },
                      k,
                      React.createElement('span', { className: 'muted', style: { marginLeft: 8, fontSize: 10 } },
                        k === 'MWCSTD' ? '· billable engineering' : '· overhead/absence')
                    ),
                    React.createElement('div', { className: 'bar-track' },
                      React.createElement('div', { className: 'bar-fill', style: { width: `${pct*100}%` } })
                    ),
                    React.createElement('div', { className: 'bar-pct mono' }, `${(pct*100).toFixed(0)}%`),
                  );
                })
              ),
              // WBS codes
              (() => {
                const wbsCodes = wbs.filter(w => w.project === proj.name);
                if (!wbsCodes.length) return null;
                return React.createElement('div', { className: 'wbs-block' },
                  React.createElement('div', { className: 'panel-sub mono', style: { marginBottom: 8 } }, 'WBS CODES'),
                  wbsCodes.map(w => React.createElement('div', { key: w.wbs, className: 'wbs-row mono' },
                    React.createElement('span', null, w.wbs),
                    React.createElement('span', { className: 'muted' }, w.shortId),
                    React.createElement('span', { className: 'muted' }, w.type),
                  ))
                );
              })(),
            )
          )
        ) : React.createElement('div', { className: 'panel' }, 'Pick a project')
      )
    )
  );
}

Object.assign(window, { ArtboardDeepDive });
