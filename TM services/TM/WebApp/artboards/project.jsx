// artboards/project.jsx — Project view
// Select a project, see function charges over time (stacked bars + animated line) and contributors.

var FUNC_HUES = [145, 55, 210, 25, 290, 95, 340, 175];
function funcColor(i) {
  return 'oklch(0.60 0.15 ' + FUNC_HUES[i % FUNC_HUES.length] + ')';
}

function ArtboardProject() {
  var data = useData();
  var _sel = React.useState(null), sel = _sel[0], setSel = _sel[1];
  var _search = React.useState(''), search = _search[0], setSearch = _search[1];
  var _lineIdx = React.useState(0), lineIdx = _lineIdx[0], setLineIdx = _lineIdx[1];
  var _playing = React.useState(false), playing = _playing[0], setPlaying = _playing[1];
  var _zoomStart = React.useState(0), zoomStart = _zoomStart[0], setZoomStart = _zoomStart[1];
  var _zoomEnd = React.useState(0), zoomEnd = _zoomEnd[0], setZoomEnd = _zoomEnd[1];

  var records = data?.records || [];

  // Project list — single pass
  var projInfo = React.useMemo(function () {
    var m = new Map();
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var cur = m.get(r.project);
      if (!cur) { cur = { name: r.project, hours: 0, contributors: new Set(), funcs: new Set() }; m.set(r.project, cur); }
      cur.hours += r.hours;
      cur.contributors.add(r.name);
      if (r.func) cur.funcs.add(r.func);
    }
    return [...m.values()].sort(function (a, b) { return b.hours - a.hours; });
  }, [records]);

  React.useEffect(function () {
    if (!sel && projInfo.length) setSel(projInfo[0].name);
  }, [projInfo, sel]);

  var projRecords = React.useMemo(function () {
    return records.filter(function (r) { return r.project === sel; });
  }, [records, sel]);

  var filteredList = React.useMemo(function () {
    var q = search.toLowerCase();
    if (!q) return projInfo;
    return projInfo.filter(function (p) { return p.name.toLowerCase().indexOf(q) >= 0; });
  }, [projInfo, search]);

  // Single-pass aggregation: monthly, weekly, people, functions
  var agg = React.useMemo(function () {
    var monthlyByFunc = {}, weeklyByFunc = {}, peopleMap = new Map(), funcSet = new Set();
    var months = new Set(), weeks = new Set();

    for (var i = 0; i < projRecords.length; i++) {
      var r = projRecords[i];
      var f = r.func || 'Unknown';
      var mo = r.date.slice(0, 7);
      var yr = r.date.slice(0, 4);
      var wn = weekOfYear(r.date);
      var wk = yr + '-W' + (wn < 10 ? '0' : '') + wn;

      funcSet.add(f);
      months.add(mo);
      weeks.add(wk);

      // Monthly
      if (!monthlyByFunc[mo]) monthlyByFunc[mo] = {};
      monthlyByFunc[mo][f] = (monthlyByFunc[mo][f] || 0) + r.hours;

      // Weekly
      if (!weeklyByFunc[wk]) weeklyByFunc[wk] = {};
      weeklyByFunc[wk][f] = (weeklyByFunc[wk][f] || 0) + r.hours;

      // People
      var p = peopleMap.get(r.name);
      if (!p) { p = { name: r.name, hours: 0, func: f, dates: new Set() }; peopleMap.set(r.name, p); }
      p.hours += r.hours;
      p.dates.add(r.date);
    }

    var allFuncs = [...funcSet].sort();
    var allMonths = [...months].sort();
    var allWeeks = [...weeks].sort();
    var people = [...peopleMap.values()].sort(function (a, b) { return b.hours - a.hours; });

    // Max month total (stacked)
    var maxMonthTotal = 0;
    for (var mi = 0; mi < allMonths.length; mi++) {
      var t = 0;
      var moData = monthlyByFunc[allMonths[mi]];
      for (var fi = 0; fi < allFuncs.length; fi++) t += (moData?.[allFuncs[fi]] || 0);
      if (t > maxMonthTotal) maxMonthTotal = t;
    }

    return { monthlyByFunc: monthlyByFunc, weeklyByFunc: weeklyByFunc, people: people, allFuncs: allFuncs, allMonths: allMonths, allWeeks: allWeeks, maxMonthTotal: maxMonthTotal || 1 };
  }, [projRecords]);

  var allWeeks = agg.allWeeks;

  // Reset animation + zoom when project changes
  React.useEffect(function () {
    if (allWeeks.length > 0) {
      setZoomStart(0);
      setZoomEnd(allWeeks.length - 1);
      setLineIdx(allWeeks.length - 1);
      setPlaying(false);
    }
  }, [allWeeks.length, sel]);

  // Playback interval
  React.useEffect(function () {
    if (!playing) return;
    var id = setInterval(function () {
      setLineIdx(function (i) {
        if (i >= zoomEnd) { setPlaying(false); return i; }
        return i + 1;
      });
    }, 80);
    return function () { clearInterval(id); };
  }, [playing, zoomEnd]);

  // Zoomed slice + max
  var visibleWeeks = React.useMemo(function () {
    return allWeeks.slice(zoomStart, zoomEnd + 1);
  }, [allWeeks, zoomStart, zoomEnd]);

  var maxWeekFunc = React.useMemo(function () {
    var mx = 0, wbf = agg.weeklyByFunc;
    for (var i = 0; i < visibleWeeks.length; i++) {
      var obj = wbf[visibleWeeks[i]];
      if (!obj) continue;
      var keys = Object.keys(obj);
      for (var j = 0; j < keys.length; j++) { if (obj[keys[j]] > mx) mx = obj[keys[j]]; }
    }
    return mx || 1;
  }, [agg.weeklyByFunc, visibleWeeks]);

  if (!data) return React.createElement(LoadingFrame);

  // Chart constants
  var W = 700, H = 200, padL = 48, padR = 12, padT = 16, padB = 28;
  var innerW = W - padL - padR, innerH = H - padT - padB;
  var LW = 700, LH = 190, lPadL = 48, lPadR = 12, lPadT = 16, lPadB = 28;
  var lInnerW = LW - lPadL - lPadR, lInnerH = LH - lPadT - lPadB;

  var months = agg.allMonths, allFuncs = agg.allFuncs, monthlyByFunc = agg.monthlyByFunc;
  var barGroupW = months.length > 0 ? innerW / months.length : innerW;
  var barW = Math.min(barGroupW * 0.7, 48);

  var proj = sel ? projInfo.find(function (p) { return p.name === sel; }) : null;
  var totalHrs = proj ? proj.hours : 0;

  return React.createElement('div', { className: 'ab-frame' },
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '08 / Project view'),
      React.createElement('h1', { className: 'ab-title' }, 'Project charge profile'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, 'Select a project to see function charges over time and contributors.')
      )
    ),
    React.createElement('div', { className: 'dd-grid', style: { flex: 1, minHeight: 0 } },
      // Left: project list
      React.createElement('div', { className: 'panel dd-list-panel', style: { maxHeight: 'none' } },
        React.createElement('div', { className: 'panel-h' },
          React.createElement('div', { className: 'panel-title' }, 'Projects'),
          React.createElement('span', { className: 'panel-sub mono' }, projInfo.length + ' total')
        ),
        React.createElement('input', {
          className: 'dd-search', placeholder: 'Search projects…',
          value: search, onChange: function (e) { setSearch(e.target.value); }
        }),
        React.createElement('div', { className: 'dd-list' },
          filteredList.map(function (p) {
            return React.createElement('button', {
              key: p.name, className: 'dd-row' + (sel === p.name ? ' on' : ''),
              style: { '--proj-color': getProjectColor(p.name) },
              onClick: function () { setSel(p.name); }
            },
              React.createElement('span', { className: 'dd-row-name' }, p.name),
              React.createElement('span', { className: 'dd-row-hrs mono' }, fmtHours(p.hours) + 'h')
            );
          })
        )
      ),
      // Right: detail
      React.createElement('div', { className: 'dd-detail' },
        proj ? React.createElement(React.Fragment, null,
          // Header
          React.createElement('div', { className: 'panel', style: { borderLeft: '4px solid ' + getProjectColor(proj.name) } },
            React.createElement('div', { className: 'dd-projhead' },
              React.createElement('div', null,
                React.createElement('div', { className: 'panel-sub mono' },
                  proj.contributors.size + ' contributors · ' + proj.funcs.size + ' functions'),
                React.createElement('h2', { className: 'dd-projtitle', style: { display: 'flex', alignItems: 'center', gap: 10 } },
                  React.createElement('span', { className: 'proj-swatch', style: { width: 14, height: 14, background: getProjectColor(proj.name) } }),
                  proj.name
                )
              ),
              React.createElement('div', { className: 'dd-projstats' },
                React.createElement('div', null,
                  React.createElement('div', { className: 'dd-stat-num' }, fmtNum(Math.round(totalHrs))),
                  React.createElement('div', { className: 'dd-stat-lbl mono' }, 'hours')
                ),
                React.createElement('div', null,
                  React.createElement('div', { className: 'dd-stat-num' }, months.length),
                  React.createElement('div', { className: 'dd-stat-lbl mono' }, 'months active')
                ),
                React.createElement('div', null,
                  React.createElement('div', { className: 'dd-stat-num' }, (totalHrs / Math.max(1, proj.contributors.size)).toFixed(0)),
                  React.createElement('div', { className: 'dd-stat-lbl mono' }, 'avg / person')
                )
              )
            )
          ),

          // Monthly function charges (stacked bars)
          allFuncs.length > 0 && months.length > 0 ? React.createElement('div', { className: 'panel' },
            React.createElement('div', { className: 'panel-h' },
              React.createElement('div', { className: 'panel-title' }, 'Function charges by month'),
              React.createElement('div', { className: 'panel-legend' },
                allFuncs.slice(0, 6).map(function (f, i) {
                  return React.createElement(LegendDot, { key: f, color: funcColor(i), label: f });
                })
              )
            ),
            React.createElement('svg', {
              viewBox: '0 0 ' + W + ' ' + H,
              style: { width: '100%', height: 'auto', display: 'block' }
            },
              [0, 0.5, 1].map(function (t) {
                var yy = padT + innerH - t * innerH;
                return React.createElement('g', { key: t },
                  React.createElement('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, stroke: 'var(--rule)', strokeWidth: 0.5 }),
                  React.createElement('text', { x: padL - 8, y: yy + 3, textAnchor: 'end', className: 'tick' }, fmtHours(Math.round(agg.maxMonthTotal * t)))
                );
              }),
              months.map(function (mo, mi) {
                var cx = padL + (mi + 0.5) * barGroupW;
                var acc = 0;
                return React.createElement('g', { key: mo },
                  allFuncs.map(function (f, fi) {
                    var h = monthlyByFunc[mo]?.[f] || 0;
                    if (h === 0) return null;
                    var barH = (h / agg.maxMonthTotal) * innerH;
                    var yPos = padT + innerH - acc - barH;
                    acc += barH;
                    return React.createElement('rect', { key: f, x: cx - barW / 2, y: yPos, width: barW, height: barH, fill: funcColor(fi), rx: 1 });
                  }),
                  React.createElement('text', { x: cx, y: H - 4, textAnchor: 'middle', className: 'tick' }, monthLabel(mo).split(' ')[0])
                );
              })
            )
          ) : null,

          // Line graph: function activity over weeks (animated + zoomable)
          allFuncs.length > 0 && allWeeks.length > 1 ? (function () {
            var vLen = visibleWeeks.length;
            var clipIdx = Math.max(0, Math.min(lineIdx - zoomStart, vLen - 1));
            var lx = function (i) { return lPadL + (i / Math.max(1, vLen - 1)) * lInnerW; };
            var ly = function (v) { return lPadT + lInnerH - (v / maxWeekFunc) * lInnerH; };
            var clipX = lx(clipIdx);
            var tickStep = Math.max(1, Math.ceil(vLen / 10));
            var wbf = agg.weeklyByFunc;

            return React.createElement('div', { className: 'panel' },
              React.createElement('div', { className: 'panel-h' },
                React.createElement('div', { className: 'panel-title' }, 'Function activity over time'),
                React.createElement('div', { className: 'panel-sub mono' },
                  'week ' + (visibleWeeks[0]?.slice(5) || '') + ' – ' + (visibleWeeks[vLen - 1]?.slice(5) || ''))
              ),
              React.createElement('svg', {
                viewBox: '0 0 ' + LW + ' ' + LH,
                style: { width: '100%', height: 'auto', display: 'block' }
              },
                React.createElement('defs', null,
                  React.createElement('clipPath', { id: 'pv-line-clip' },
                    React.createElement('rect', { x: lPadL, y: 0, width: Math.max(0, clipX - lPadL + 4), height: LH })
                  )
                ),
                [0, 0.5, 1].map(function (t) {
                  var yy = lPadT + lInnerH - t * lInnerH;
                  return React.createElement('g', { key: 'lg' + t },
                    React.createElement('line', { x1: lPadL, x2: LW - lPadR, y1: yy, y2: yy, stroke: 'var(--rule)', strokeWidth: 0.5 }),
                    React.createElement('text', { x: lPadL - 8, y: yy + 3, textAnchor: 'end', className: 'tick' }, fmtHours(Math.round(maxWeekFunc * t)))
                  );
                }),
                visibleWeeks.map(function (wk, i) {
                  if (i % tickStep !== 0 && i !== vLen - 1) return null;
                  return React.createElement('text', { key: wk, x: lx(i), y: LH - 4, textAnchor: 'middle', className: 'tick' }, wk.slice(5));
                }),
                // Ghost lines
                React.createElement('g', { opacity: 0.1 },
                  allFuncs.map(function (f, fi) {
                    var pts = '';
                    for (var i = 0; i < vLen; i++) { var v = wbf[visibleWeeks[i]]?.[f] || 0; pts += (i === 0 ? 'M' : 'L') + lx(i) + ',' + ly(v); }
                    return React.createElement('path', { key: f, d: pts, fill: 'none', stroke: funcColor(fi), strokeWidth: 1.5 });
                  })
                ),
                // Animated lines
                React.createElement('g', { clipPath: 'url(#pv-line-clip)' },
                  allFuncs.map(function (f, fi) {
                    var pts = '';
                    for (var i = 0; i < vLen; i++) { var v = wbf[visibleWeeks[i]]?.[f] || 0; pts += (i === 0 ? 'M' : 'L') + lx(i) + ',' + ly(v); }
                    return React.createElement('path', { key: f, d: pts, fill: 'none', stroke: funcColor(fi), strokeWidth: 1.5, opacity: 0.85 });
                  }),
                  allFuncs.map(function (f, fi) {
                    var dots = [];
                    for (var i = 0; i < vLen; i++) {
                      var v = wbf[visibleWeeks[i]]?.[f] || 0;
                      if (v > 0) dots.push(React.createElement('circle', { key: f + i, cx: lx(i), cy: ly(v), r: 2.5, fill: funcColor(fi), stroke: 'var(--panel)', strokeWidth: 1 }));
                    }
                    return dots;
                  })
                ),
                React.createElement('line', { x1: clipX, x2: clipX, y1: lPadT - 4, y2: lPadT + lInnerH + 4, stroke: 'var(--accent-hi)', strokeWidth: 1.5 }),
                React.createElement('circle', { cx: clipX, cy: lPadT - 4, r: 5, fill: 'var(--accent-hi)' })
              ),
              // Scrubber
              React.createElement('div', { className: 'scrubber' },
                React.createElement('button', {
                  className: 'play-btn',
                  onClick: function () {
                    if (lineIdx >= zoomEnd) setLineIdx(zoomStart);
                    setPlaying(function (p) { return !p; });
                  }
                }, playing ? '❚❚' : '▶'),
                React.createElement('input', {
                  type: 'range', min: zoomStart, max: zoomEnd, value: lineIdx, className: 'range',
                  onChange: function (e) { setLineIdx(+e.target.value); setPlaying(false); }
                }),
                React.createElement('span', { className: 'mono scrubber-date' },
                  visibleWeeks[Math.max(0, Math.min(clipIdx, vLen - 1))] || '')
              ),
              // Zoom
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rule)' } },
                React.createElement('span', { className: 'panel-sub mono', style: { minWidth: 32 } }, 'ZOOM'),
                React.createElement('span', { className: 'mono', style: { fontSize: 10, color: 'var(--ink-50)', minWidth: 36 } },
                  allWeeks[zoomStart]?.slice(5) || ''),
                React.createElement('input', {
                  type: 'range', min: 0, max: Math.max(0, allWeeks.length - 2),
                  value: zoomStart, className: 'range', style: { flex: 1 },
                  onChange: function (e) {
                    var v = +e.target.value;
                    if (v < zoomEnd) { setZoomStart(v); setLineIdx(function (idx) { return Math.max(v, Math.min(idx, zoomEnd)); }); }
                  }
                }),
                React.createElement('input', {
                  type: 'range', min: 1, max: allWeeks.length - 1,
                  value: zoomEnd, className: 'range', style: { flex: 1 },
                  onChange: function (e) {
                    var v = +e.target.value;
                    if (v > zoomStart) { setZoomEnd(v); setLineIdx(function (idx) { return Math.max(zoomStart, Math.min(idx, v)); }); }
                  }
                }),
                React.createElement('span', { className: 'mono', style: { fontSize: 10, color: 'var(--ink-50)', minWidth: 36, textAlign: 'right' } },
                  allWeeks[zoomEnd]?.slice(5) || '')
              ),
              // Legend
              React.createElement('div', { className: 'panel-legend', style: { marginTop: 8, flexWrap: 'wrap', gap: '6px 12px' } },
                allFuncs.slice(0, 8).map(function (f, i) {
                  return React.createElement(LegendDot, { key: f, color: funcColor(i), label: f });
                })
              )
            );
          })() : null,

          // Contributors
          React.createElement('div', { className: 'panel' },
            React.createElement('div', { className: 'panel-h' },
              React.createElement('div', { className: 'panel-title' }, 'Contributors'),
              React.createElement('span', { className: 'panel-sub mono' }, agg.people.length + ' people')
            ),
            React.createElement('div', { className: 'bars' },
              agg.people.slice(0, 15).map(function (p) {
                var pct = p.hours / (agg.people[0]?.hours || 1);
                return React.createElement('div', { key: p.name, className: 'bar-row' },
                  React.createElement('div', { className: 'bar-label', title: p.name }, p.name),
                  React.createElement('div', { className: 'bar-track' },
                    React.createElement('div', { className: 'bar-fill', style: { width: (pct * 100) + '%', background: 'var(--accent)' } })
                  ),
                  React.createElement('div', { className: 'bar-value mono' }, fmtNum(Math.round(p.hours)) + ' h'),
                  React.createElement('div', { className: 'bar-pct mono' }, p.func || '–')
                );
              })
            )
          )
        ) : React.createElement('div', { className: 'panel' }, 'Pick a project')
      )
    )
  );
}

Object.assign(window, { ArtboardProject });
