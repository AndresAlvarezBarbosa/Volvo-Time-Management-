// artboards/billability.jsx — Billability analysis
// KPIs, weekly trend, breakdown by function and by person.

function ArtboardBillability() {
  var data = useData();
  var _hover = React.useState(null), hoverWk = _hover[0], setHoverWk = _hover[1];

  if (!data) return React.createElement(LoadingFrame);

  var records = data.records;
  var employees = data.employees;

  // Single-pass aggregation
  var agg = React.useMemo(function () {
    var totalH = 0, billH = 0;
    var weekMap = {}, funcMap = {}, personMap = {}, brandMap = {};

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      totalH += r.hours;
      if (r.billable) billH += r.hours;

      // Weekly
      var wk = r.date.slice(0, 4) + '-W' + (weekOfYear(r.date) < 10 ? '0' : '') + weekOfYear(r.date);
      if (!weekMap[wk]) weekMap[wk] = { total: 0, bill: 0 };
      weekMap[wk].total += r.hours;
      if (r.billable) weekMap[wk].bill += r.hours;

      // By function
      var fn = r.func || 'Unknown';
      if (!funcMap[fn]) funcMap[fn] = { total: 0, bill: 0 };
      funcMap[fn].total += r.hours;
      if (r.billable) funcMap[fn].bill += r.hours;

      // By person
      if (!personMap[r.name]) personMap[r.name] = { name: r.name, func: fn, total: 0, bill: 0 };
      personMap[r.name].total += r.hours;
      if (r.billable) personMap[r.name].bill += r.hours;

      // By brand
      var brand = r.brand || 'Unknown';
      if (!brandMap[brand]) brandMap[brand] = { total: 0, bill: 0 };
      brandMap[brand].total += r.hours;
      if (r.billable) brandMap[brand].bill += r.hours;
    }

    var weeks = Object.keys(weekMap).sort().map(function (wk) {
      var d = weekMap[wk];
      return { wk: wk, total: d.total, bill: d.bill, pct: d.total > 0 ? d.bill / d.total * 100 : 0 };
    });

    var funcs = Object.keys(funcMap).map(function (f) {
      var d = funcMap[f];
      return { name: f, total: d.total, bill: d.bill, pct: d.total > 0 ? d.bill / d.total * 100 : 0 };
    }).sort(function (a, b) { return b.total - a.total; });

    var people = Object.values(personMap).sort(function (a, b) { return b.total - a.total; });
    for (var j = 0; j < people.length; j++) {
      people[j].pct = people[j].total > 0 ? people[j].bill / people[j].total * 100 : 0;
    }

    return { totalH: totalH, billH: billH, weeks: weeks, funcs: funcs, people: people, brandMap: brandMap };
  }, [records]);

  var billPct = agg.totalH > 0 ? (agg.billH / agg.totalH * 100) : 0;
  var nonBillH = agg.totalH - agg.billH;

  // Weekly trend chart
  var weeks = agg.weeks;
  var CW = 1020, CH = 240, cPadL = 56, cPadR = 20, cPadT = 20, cPadB = 32;
  var cInnerW = CW - cPadL - cPadR, cInnerH = CH - cPadT - cPadB;
  var maxWkTotal = 1;
  for (var i = 0; i < weeks.length; i++) { if (weeks[i].total > maxWkTotal) maxWkTotal = weeks[i].total; }

  var xStep = weeks.length > 1 ? cInnerW / (weeks.length - 1) : cInnerW;
  var yH = function (v) { return cPadT + cInnerH - (v / maxWkTotal) * cInnerH; };

  // Paths
  var totalPts = '', billPts = '', areaPts = '';
  for (var i = 0; i < weeks.length; i++) {
    var wx = cPadL + i * xStep;
    totalPts += (i === 0 ? 'M' : 'L') + wx + ',' + yH(weeks[i].total);
    billPts += (i === 0 ? 'M' : 'L') + wx + ',' + yH(weeks[i].bill);
  }
  if (weeks.length > 0) {
    areaPts = billPts + ' L' + (cPadL + (weeks.length - 1) * xStep) + ',' + (cPadT + cInnerH) + ' L' + cPadL + ',' + (cPadT + cInnerH) + ' Z';
  }

  // Billable % line (secondary axis)
  var pctPts = '';
  for (var i = 0; i < weeks.length; i++) {
    var wx = cPadL + i * xStep;
    var py = cPadT + cInnerH - (weeks[i].pct / 100) * cInnerH;
    pctPts += (i === 0 ? 'M' : 'L') + wx + ',' + py;
  }

  // Bar chart for functions
  var topFunc = agg.funcs.slice(0, 10);
  var maxFuncH = topFunc.length > 0 ? topFunc[0].total : 1;

  // People sorted by billable %
  var peopleSorted = agg.people.slice().sort(function (a, b) { return b.pct - a.pct; });

  // Brand gauge data
  var mackAgg = agg.brandMap['Mack'] || { total: 0, bill: 0 };
  var vtnaAgg = agg.brandMap['VTNA'] || { total: 0, bill: 0 };
  var mbAgg = agg.brandMap['Multi-Brand'] || { total: 0, bill: 0 };
  var studioGauge = { label: 'Whole Studio', pct: agg.totalH > 0 ? agg.billH / agg.totalH * 100 : 0, bill: agg.billH, total: agg.totalH, color: 'var(--accent)' };
  var brandGauges = [
    { label: 'Mack', pct: mackAgg.total > 0 ? mackAgg.bill / mackAgg.total * 100 : 0, bill: mackAgg.bill, total: mackAgg.total, color: 'oklch(0.45 0.08 0)' },
    { label: 'Volvo', pct: vtnaAgg.total > 0 ? vtnaAgg.bill / vtnaAgg.total * 100 : 0, bill: vtnaAgg.bill, total: vtnaAgg.total, color: 'oklch(0.60 0.16 175)' },
    { label: 'Multi-Brand', pct: mbAgg.total > 0 ? mbAgg.bill / mbAgg.total * 100 : 0, bill: mbAgg.bill, total: mbAgg.total, color: 'oklch(0.70 0.16 55)' }
  ];

  function makeGauge(g, large) {
    var r = large ? 70 : 60, cx = large ? 90 : 80, cy = large ? 80 : 75;
    var sw = large ? 14 : 12, vbW = large ? 180 : 160, vbH = large ? 95 : 90;
    var hc = Math.PI * r;
    var arc = 'M ' + (cx - r) + ' ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy;
    var fl = (g.pct / 100) * hc;
    return React.createElement('div', { key: g.label, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' } },
      React.createElement('svg', { viewBox: '0 0 ' + vbW + ' ' + vbH, style: { width: vbW + 'px', height: vbH + 'px' } },
        React.createElement('path', { d: arc, fill: 'none', stroke: 'var(--ink-08)', strokeWidth: sw, strokeLinecap: 'round' }),
        React.createElement('path', { d: arc, fill: 'none', stroke: g.color, strokeWidth: sw, strokeLinecap: 'round',
          strokeDasharray: fl + ' ' + (hc - fl), style: { transition: 'stroke-dasharray 0.5s ease' }
        }),
        React.createElement('text', { x: cx, y: cy - (large ? 16 : 14), textAnchor: 'middle',
          style: { fontSize: large ? '34px' : '28px', fontWeight: 500, fontFamily: 'var(--font-display)', fill: 'var(--ink)', letterSpacing: '-0.02em' }
        }, g.pct.toFixed(1) + '%')
      ),
      React.createElement('div', { style: { fontFamily: 'var(--font-display)', fontSize: large ? '16px' : '14px', fontWeight: 500, color: 'var(--ink)' } }, g.label),
      React.createElement('div', { className: 'mono', style: { fontSize: '11px', color: 'var(--ink-50)' } },
        fmtNum(Math.round(g.bill)) + 'h billable / ' + fmtNum(Math.round(g.total)) + 'h total')
    );
  }

  return React.createElement('div', { className: 'ab-frame' },
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '09 / Billability'),
      React.createElement('h1', { className: 'ab-title' }, 'Billability analysis'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, 'How hours split between billable and non-billable work.'),
        React.createElement('span', { className: 'ab-dot' }),
        React.createElement('span', null, fmtNum(records.length) + ' records')
      )
    ),

    // KPI strip
    React.createElement('div', { className: 'kpi-row' },
      React.createElement(KPI, { label: 'Total hours', value: fmtNum(Math.round(agg.totalH)), unit: 'hrs', sub: employees.length + ' contributors' }),
      React.createElement(KPI, { label: 'Billable hours', value: fmtNum(Math.round(agg.billH)), unit: 'hrs', sub: billPct.toFixed(1) + '% of total' }),
      React.createElement(KPI, { label: 'Non-billable', value: fmtNum(Math.round(nonBillH)), unit: 'hrs', sub: (100 - billPct).toFixed(1) + '% of total' }),
      React.createElement(KPI, { label: 'Billable rate', value: billPct.toFixed(1), unit: '%', sub: 'target typically 70–80%' })
    ),

    // Brand billability gauges
    React.createElement('div', { className: 'panel' },
      React.createElement('div', { className: 'panel-h' },
        React.createElement('div', { className: 'panel-title' }, 'Billability by brand')
      ),
      // Studio gauge — top row, centered
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', paddingBottom: '20px', marginBottom: '20px', borderBottom: '1px solid var(--rule)' } },
        makeGauge(studioGauge, true)
      ),
      // Brand gauges — bottom row
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' } },
        brandGauges.map(function (g) { return makeGauge(g, false); })
      )
    ),

    // Weekly trend
    React.createElement('div', { className: 'panel' },
      React.createElement('div', { className: 'panel-h' },
        React.createElement('div', { className: 'panel-title' }, 'Weekly billability trend'),
        React.createElement('div', { className: 'panel-legend' },
          React.createElement(LegendDot, { color: 'var(--accent)', label: 'Billable' }),
          React.createElement(LegendDot, { color: 'var(--ink-50)', label: 'Total', dashed: true }),
          React.createElement(LegendDot, { color: 'var(--accent-hi)', label: 'Bill %' })
        )
      ),
      React.createElement('svg', {
        viewBox: '0 0 ' + CW + ' ' + CH,
        style: { width: '100%', height: 'auto', display: 'block' },
        onMouseLeave: function () { setHoverWk(null); },
        onMouseMove: function (e) {
          var rect = e.currentTarget.getBoundingClientRect();
          var x = (e.clientX - rect.left) / rect.width * CW - cPadL;
          var idx = Math.max(0, Math.min(weeks.length - 1, Math.round(x / xStep)));
          setHoverWk(idx);
        }
      },
        // Y gridlines (hours)
        [0, 0.25, 0.5, 0.75, 1].map(function (t) {
          var yy = cPadT + cInnerH - t * cInnerH;
          return React.createElement('g', { key: 'g' + t },
            React.createElement('line', { x1: cPadL, x2: CW - cPadR, y1: yy, y2: yy, stroke: 'var(--rule)', strokeWidth: 0.5 }),
            React.createElement('text', { x: cPadL - 10, y: yy + 3, textAnchor: 'end', className: 'tick' }, fmtHours(Math.round(maxWkTotal * t)))
          );
        }),
        // Right-axis % labels
        [0, 50, 100].map(function (p) {
          var yy = cPadT + cInnerH - (p / 100) * cInnerH;
          return React.createElement('text', { key: 'p' + p, x: CW - cPadR + 8, y: yy + 3, className: 'tick', fill: 'var(--accent-hi)' }, p + '%');
        }),
        // X ticks
        weeks.map(function (w, i) {
          if (i % 4 !== 0) return null;
          return React.createElement('text', { key: w.wk, x: cPadL + i * xStep, y: CH - cPadB + 16, textAnchor: 'middle', className: 'tick' }, w.wk.slice(5));
        }),
        // Billable area fill
        areaPts && React.createElement('path', { d: areaPts, fill: 'var(--accent)', opacity: 0.12 }),
        // Total line (dashed)
        React.createElement('path', { d: totalPts, fill: 'none', stroke: 'var(--ink-50)', strokeWidth: 1, strokeDasharray: '3 3' }),
        // Billable line
        React.createElement('path', { d: billPts, fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.75 }),
        // % line
        React.createElement('path', { d: pctPts, fill: 'none', stroke: 'var(--accent-hi)', strokeWidth: 1.25, strokeDasharray: '5 3' }),
        // Hover guide
        hoverWk !== null && weeks[hoverWk] && React.createElement('g', null,
          React.createElement('line', { x1: cPadL + hoverWk * xStep, x2: cPadL + hoverWk * xStep, y1: cPadT, y2: cPadT + cInnerH, stroke: 'var(--ink)', strokeWidth: 0.5 }),
          React.createElement('circle', { cx: cPadL + hoverWk * xStep, cy: yH(weeks[hoverWk].bill), r: 4, fill: 'var(--accent)', stroke: 'var(--panel)', strokeWidth: 1.5 }),
          React.createElement('circle', { cx: cPadL + hoverWk * xStep, cy: yH(weeks[hoverWk].total), r: 3.5, fill: 'var(--panel)', stroke: 'var(--ink-50)', strokeWidth: 1.25 })
        )
      ),
      hoverWk !== null && weeks[hoverWk] && React.createElement('div', { className: 'panel-hover' },
        React.createElement('span', { className: 'mono' }, weeks[hoverWk].wk),
        React.createElement('span', null, 'Billable ' + fmtNum(Math.round(weeks[hoverWk].bill)) + 'h'),
        React.createElement('span', null, 'Total ' + fmtNum(Math.round(weeks[hoverWk].total)) + 'h'),
        React.createElement('span', { style: { color: 'var(--accent-hi)' } }, weeks[hoverWk].pct.toFixed(0) + '% billable')
      )
    ),

    // Two-up: by function + by person
    React.createElement('div', { className: 'two-up' },
      // By function
      React.createElement('div', { className: 'panel' },
        React.createElement('div', { className: 'panel-h' },
          React.createElement('div', { className: 'panel-title' }, 'Billability by function'),
          React.createElement('div', { className: 'panel-sub mono' }, topFunc.length + ' functions')
        ),
        React.createElement('div', { className: 'bars' },
          topFunc.map(function (f) {
            var billW = f.total > 0 ? (f.bill / maxFuncH * 100) : 0;
            var nonW = f.total > 0 ? ((f.total - f.bill) / maxFuncH * 100) : 0;
            return React.createElement('div', { key: f.name, className: 'bar-row' },
              React.createElement('div', { className: 'bar-label', title: f.name }, f.name),
              React.createElement('div', { className: 'bar-track', style: { display: 'flex', gap: 0 } },
                React.createElement('div', { style: { width: billW + '%', height: '100%', background: 'var(--accent)', transition: 'width 0.2s' } }),
                React.createElement('div', { style: { width: nonW + '%', height: '100%', background: 'var(--ink-15)', transition: 'width 0.2s' } })
              ),
              React.createElement('div', { className: 'bar-value mono' }, f.pct.toFixed(0) + '%'),
              React.createElement('div', { className: 'bar-pct mono' }, fmtNum(Math.round(f.bill)) + 'h')
            );
          })
        )
      ),

      // By person (top 15, sorted by billable %)
      React.createElement('div', { className: 'panel' },
        React.createElement('div', { className: 'panel-h' },
          React.createElement('div', { className: 'panel-title' }, 'Billability by person'),
          React.createElement('div', { className: 'panel-sub mono' }, 'sorted by bill %')
        ),
        React.createElement('div', { className: 'bars' },
          peopleSorted.slice(0, 15).map(function (p) {
            var maxP = peopleSorted[0].total || 1;
            var billW = p.bill / maxP * 100;
            var nonW = (p.total - p.bill) / maxP * 100;
            return React.createElement('div', { key: p.name, className: 'bar-row' },
              React.createElement('div', { className: 'bar-label', title: p.name }, p.name),
              React.createElement('div', { className: 'bar-track', style: { display: 'flex', gap: 0 } },
                React.createElement('div', { style: { width: billW + '%', height: '100%', background: 'var(--accent)', transition: 'width 0.2s' } }),
                React.createElement('div', { style: { width: nonW + '%', height: '100%', background: 'var(--ink-15)', transition: 'width 0.2s' } })
              ),
              React.createElement('div', { className: 'bar-value mono' }, p.pct.toFixed(0) + '%'),
              React.createElement('div', { className: 'bar-pct mono' }, fmtNum(Math.round(p.total)) + 'h')
            );
          })
        )
      )
    ),

    // Decomposition tree — hours
    React.createElement(DecompTree, { records: records, mode: 'hours',
      title: 'Decomposition tree — hours',
      subtitle: 'brand → type → project → function → employee' }),

    // Decomposition tree — billable ratio
    React.createElement(DecompTree, { records: records, mode: 'ratio',
      title: 'Decomposition tree — billable ratio',
      subtitle: 'brand → project → function → employee' })
  );
}

// ── Drill-down decomposition tree (hours or ratio) ────────────
function DecompTree(props) {
  var records = props.records;
  var mode = props.mode || 'hours';
  var title = props.title || 'Decomposition tree';
  var subtitle = props.subtitle || 'click to drill down';

  var _path = React.useState(['root']), path = _path[0], setPath = _path[1];
  var _hov = React.useState(null), hovIdx = _hov[0], setHovIdx = _hov[1];
  var MAX_KIDS = 8;
  var BE_DEPTH = 3;

  var depthLabels = mode === 'ratio'
    ? ['total', 'brand', 'project', 'function', 'employee']
    : ['total', 'brand', 'type', 'project', 'function', 'employee'];
  var dColors = ['var(--accent)', 'oklch(0.55 0.14 220)', 'oklch(0.58 0.16 145)', 'oklch(0.60 0.12 55)', 'oklch(0.55 0.08 280)', 'var(--ink-50)'];
  var brandColors = {
    'Mack': 'oklch(0.45 0.08 0)',
    'VTNA': 'oklch(0.60 0.16 175)',
    'Multi-Brand': 'oklch(0.65 0.16 55)'
  };
  // Brand-aware color: depth 1 nodes use the brand's color when available
  function colorAt(d, label) {
    if (d === 1 && brandColors[label]) return brandColors[label];
    return dColors[Math.min(d, 5)];
  }

  // Build tree based on mode
  var root = React.useMemo(function () {
    var m = {}, totalH = 0, totalB = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      totalH += r.hours; if (r.billable) totalB += r.hours;
      var keys = mode === 'hours'
        ? [r.brand || 'Unknown', r.billable ? 'Billable' : 'Non-billable', r.project || 'Unknown', r.func || 'Unknown', r.name || 'Unknown']
        : [r.brand || 'Unknown', r.project || 'Unknown', r.func || 'Unknown', r.name || 'Unknown'];
      var cur = m;
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j];
        if (!cur[k]) cur[k] = { h: 0, b: 0, kids: {} };
        cur[k].h += r.hours;
        if (r.billable) cur[k].b += r.hours;
        cur = cur[k].kids;
      }
    }
    function topKeys(obj) { return Object.keys(obj).sort(function (a, b) { return obj[b].h - obj[a].h; }); }
    function build(obj, prefix, lvl) {
      var keys = topKeys(obj), out = [];
      for (var i = 0; i < Math.min(keys.length, MAX_KIDS); i++) {
        var k = keys[i], v = obj[k], id = prefix + '/' + lvl + ':' + k;
        out.push({ id: id, label: k, hours: v.h, bill: v.b, children: build(v.kids, id, lvl + 1) });
      }
      if (keys.length > MAX_KIDS) out.push({ id: prefix + '/_m_' + lvl, label: '+ ' + (keys.length - MAX_KIDS) + ' more', hours: 0, bill: 0, children: [], extra: true });
      return out;
    }
    return { id: 'root', label: 'Total Hours', hours: totalH, bill: totalB, children: build(m, '', 0) };
  }, [records, mode]);

  function findNode(node, id) {
    if (node.id === id) return node;
    for (var i = 0; i < node.children.length; i++) { var f = findNode(node.children[i], id); if (f) return f; }
    return null;
  }
  function findPathTo(node, targetId, curr) {
    var nc = curr.concat([node.id]);
    if (node.id === targetId) return nc;
    for (var i = 0; i < node.children.length; i++) {
      var p = findPathTo(node.children[i], targetId, nc);
      if (p) return p;
    }
    return null;
  }

  function navigateTo(id) { var p = findPathTo(root, id, []); if (p) setPath(p); setHovIdx(null); }
  function drillInto(id) { setPath(function (p) { return p.concat([id]); }); setHovIdx(null); }
  function goBack() { setPath(function (p) { return p.length > 1 ? p.slice(0, -1) : p; }); setHovIdx(null); }
  function goToLevel(idx) { setPath(function (p) { return p.slice(0, idx + 1); }); setHovIdx(null); }
  function clearAll() { setPath(['root']); setHovIdx(null); }

  var focusId = path[path.length - 1];
  var focusNode = findNode(root, focusId) || root;
  var kids = [], extraLabel = null;
  for (var ci = 0; ci < focusNode.children.length; ci++) {
    if (focusNode.children[ci].extra) extraLabel = focusNode.children[ci].label;
    else kids.push(focusNode.children[ci]);
  }
  var depth = path.length - 1;
  var canBack = path.length > 1;
  var focusH = focusNode.hours || 1;
  var crumbs = path.map(function (id) { var n = findNode(root, id); return n ? n.label : '?'; });

  function nodeValue(n, parentH) {
    if (mode === 'ratio') {
      var ratio = n.hours > 0 ? n.bill / n.hours : 0;
      return { primary: (ratio * 100).toFixed(1) + '%', secondary: fmtNum(Math.round(n.hours)) + 'h', bar: ratio };
    }
    return {
      primary: fmtNum(Math.round(n.hours)) + 'h',
      secondary: parentH > 0 ? (n.hours / parentH * 100).toFixed(1) + '%' : '0%',
      bar: parentH > 0 ? n.hours / parentH : 0
    };
  }
  var focusVal = nodeValue(focusNode, focusNode.hours);

  // SVG layout
  var PW = 180, PH = 78, CW = 240, CH = 60, CG = 10, CURVE_W = 80, PAD = 28;
  var totalCH = kids.length * CH + Math.max(0, kids.length - 1) * CG + (extraLabel ? 28 : 0);
  var contentH = Math.max(PH, totalCH);
  var svgH = contentH + PAD * 2;
  var svgW = PAD + PW + CURVE_W + CW + PAD;
  var py = PAD + contentH / 2 - PH / 2;
  var cy0 = PAD + contentH / 2 - totalCH / 2;
  var cx0 = PAD + PW + CURVE_W;
  var pCol = colorAt(depth, focusNode.label);

  var els = [];

  // Curves (color matches each child's color)
  for (var i = 0; i < kids.length; i++) {
    var cY = cy0 + i * (CH + CG) + CH / 2;
    var x1 = PAD + PW, y1 = py + PH / 2, x2 = cx0, y2 = cY;
    var mx = (x1 + x2) / 2;
    var isH = hovIdx === i;
    var dim = hovIdx !== null && !isH;
    var curveCol = colorAt(depth + 1, kids[i].label);
    els.push(React.createElement('path', { key: 'cv-' + i,
      d: 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2,
      fill: 'none', stroke: isH ? curveCol : 'var(--ink-15)', strokeWidth: isH ? 2.5 : 1.5,
      opacity: dim ? 0.2 : 1, style: { transition: 'all 0.2s' }
    }));
    if (isH) {
      els.push(React.createElement('circle', { key: 'fd-' + i, r: 3.5, fill: curveCol },
        React.createElement('animateMotion', { dur: '1s', repeatCount: 'indefinite',
          path: 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2 })
      ));
    }
  }

  // Parent card
  var pTrunc = focusNode.label.length > 16 ? focusNode.label.slice(0, 15) + '…' : focusNode.label;
  els.push(React.createElement('g', { key: 'par' },
    React.createElement('rect', { x: PAD + 1, y: py + 2, width: PW, height: PH, rx: 10, fill: 'var(--ink)', opacity: 0.05 }),
    React.createElement('rect', { x: PAD, y: py, width: PW, height: PH, rx: 10, fill: 'var(--panel)', stroke: pCol, strokeWidth: 2 }),
    React.createElement('rect', { x: PAD, y: py, width: 5, height: PH, rx: 2, fill: pCol }),
    React.createElement('text', { x: PAD + 14, y: py + 23, style: { fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-body)', fill: 'var(--ink)' } }, pTrunc),
    React.createElement('text', { x: PAD + 14, y: py + 42, style: { fontSize: '11px', fontFamily: 'var(--font-mono)', fill: 'var(--ink-50)' } }, focusVal.primary),
    mode === 'ratio' && React.createElement('text', { x: PAD + 14, y: py + 56, style: { fontSize: '9.5px', fontFamily: 'var(--font-mono)', fill: 'var(--ink-30)' } }, focusVal.secondary),
    React.createElement('text', { x: PAD + 14, y: py + PH - 10, style: { fontSize: '9px', fontFamily: 'var(--font-mono)', fill: pCol, letterSpacing: '0.08em', textTransform: 'uppercase' } }, depthLabels[depth] || ''),
    kids.length > 0 && React.createElement('g', null,
      React.createElement('circle', { cx: PAD + PW - 16, cy: py + PH - 16, r: 11, fill: pCol, opacity: 0.12 }),
      React.createElement('text', { x: PAD + PW - 16, y: py + PH - 12, textAnchor: 'middle', style: { fontSize: '10px', fontFamily: 'var(--font-mono)', fill: pCol, fontWeight: 700 } }, String(kids.length))
    )
  ));

  // Child cards
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i], cY = cy0 + i * (CH + CG);
    var val = nodeValue(c, focusH);
    var barW = val.bar * (CW - 28);
    var hasK = c.children && c.children.filter(function (x) { return !x.extra; }).length > 0;
    var isH = hovIdx === i, dim = hovIdx !== null && !isH;
    var cTrunc = c.label.length > 24 ? c.label.slice(0, 23) + '…' : c.label;
    var childCol = colorAt(depth + 1, c.label);

    els.push(React.createElement('g', { key: 'ch-' + i,
      style: { cursor: hasK ? 'pointer' : 'default', transition: 'opacity 0.2s' },
      opacity: dim ? 0.35 : 1,
      onMouseEnter: (function (idx) { return function () { setHovIdx(idx); }; })(i),
      onMouseLeave: function () { setHovIdx(null); },
      onClick: hasK ? (function (id) { return function () { drillInto(id); }; })(c.id) : undefined
    },
      React.createElement('rect', { x: cx0 + 1, y: cY + 2, width: CW, height: CH, rx: 10, fill: 'var(--ink)', opacity: 0.04 }),
      React.createElement('rect', { x: cx0, y: cY, width: CW, height: CH, rx: 10,
        fill: 'var(--panel)', stroke: isH ? childCol : 'var(--rule)', strokeWidth: isH ? 2 : 1,
        style: { transition: 'stroke 0.15s, stroke-width 0.15s' }
      }),
      React.createElement('rect', { x: cx0, y: cY, width: 4, height: CH, rx: 2, fill: childCol, opacity: isH ? 1 : 0.45, style: { transition: 'opacity 0.15s' } }),
      React.createElement('rect', { x: cx0 + 14, y: cY + CH - 15, width: CW - 28, height: 5, rx: 2.5, fill: 'var(--ink-04)' }),
      React.createElement('rect', { x: cx0 + 14, y: cY + CH - 15, width: Math.max(barW, 2), height: 5, rx: 2.5, fill: childCol, opacity: 0.85 }),
      React.createElement('text', { x: cx0 + 14, y: cY + 22, style: { fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-body)', fill: 'var(--ink)' } }, cTrunc),
      React.createElement('text', { x: cx0 + 14, y: cY + 38, style: { fontSize: '10px', fontFamily: 'var(--font-mono)', fill: 'var(--ink-50)' } }, val.secondary),
      React.createElement('text', { x: cx0 + CW - 14, y: cY + 38, textAnchor: 'end', style: { fontSize: '10px', fontFamily: 'var(--font-mono)', fill: childCol, fontWeight: 600 } }, val.primary),
      hasK && React.createElement('text', { x: cx0 + CW - 14, y: cY + 22, textAnchor: 'end',
        style: { fontSize: '14px', fill: isH ? childCol : 'var(--ink-15)', transition: 'fill 0.15s' } }, '→')
    ));
  }

  // "more" label
  if (extraLabel) {
    var mY = cy0 + kids.length * (CH + CG) + 10;
    els.push(React.createElement('text', { key: 'more', x: cx0 + CW / 2, y: mY + 8, textAnchor: 'middle',
      style: { fontSize: '10px', fontFamily: 'var(--font-mono)', fill: 'var(--ink-30)', fontStyle: 'italic' } }, extraLabel));
  }

  // Column depth labels
  els.push(React.createElement('text', { key: 'dl0', x: PAD + PW / 2, y: PAD - 6, textAnchor: 'middle',
    style: { fontSize: '8.5px', fontFamily: 'var(--font-mono)', fill: 'var(--ink-30)', letterSpacing: '0.1em', textTransform: 'uppercase' } }, depthLabels[depth] || ''));
  if (kids.length > 0) els.push(React.createElement('text', { key: 'dl1', x: cx0 + CW / 2, y: PAD - 6, textAnchor: 'middle',
    style: { fontSize: '8.5px', fontFamily: 'var(--font-mono)', fill: 'var(--ink-30)', letterSpacing: '0.1em', textTransform: 'uppercase' } }, depthLabels[depth + 1] || ''));

  // Bird's eye view — vertical chain of the selected path only
  function renderBirdsEye() {
    var pathNodes = [];
    for (var i = 0; i < path.length; i++) {
      var n = findNode(root, path[i]);
      if (n) pathNodes.push(n);
    }

    var CARD_W = 144, CARD_H = 68, GAP = 28;

    var items = [];
    for (var idx = 0; idx < pathNodes.length; idx++) {
      var node = pathNodes[idx];
      var isLast = idx === pathNodes.length - 1;
      var col = colorAt(idx, node.label);
      var val = mode === 'ratio'
        ? (node.hours > 0 ? (node.bill / node.hours * 100).toFixed(1) + '%' : '0%')
        : fmtNum(Math.round(node.hours)) + 'h';
      var secondary = mode === 'ratio'
        ? fmtNum(Math.round(node.hours)) + 'h'
        : (idx > 0 && pathNodes[idx - 1].hours > 0 ? (node.hours / pathNodes[idx - 1].hours * 100).toFixed(1) + '%' : '');

      items.push(React.createElement('button', {
        key: 'pc-' + node.id,
        onClick: isLast ? undefined : (function (i) { return function () { goToLevel(i); }; })(idx),
        style: {
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px',
          width: CARD_W + 'px', height: CARD_H + 'px',
          padding: '8px 12px',
          border: '1px solid ' + (isLast ? col : 'var(--rule)'),
          borderLeft: '4px solid ' + col,
          borderRadius: '8px',
          background: 'var(--panel)',
          boxShadow: isLast ? 'inset 0 0 0 1px ' + col + ', 0 2px 8px ' + col + '20' : 'none',
          cursor: isLast ? 'default' : 'pointer',
          transition: 'all 0.15s', fontFamily: 'var(--font-body)', textAlign: 'left',
          flexShrink: 0, position: 'relative'
        }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } },
          React.createElement('span', { style: { fontSize: '8px', fontFamily: 'var(--font-mono)', color: col, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 } }, depthLabels[idx] || ''),
          isLast && React.createElement('span', { style: { fontSize: '7.5px', fontFamily: 'var(--font-mono)', color: col, letterSpacing: '0.1em', fontWeight: 700, padding: '1px 5px', border: '1px solid ' + col, borderRadius: '3px' } }, 'HERE')
        ),
        React.createElement('span', { style: { fontSize: '12px', color: 'var(--ink)', fontWeight: isLast ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, node.label),
        React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px' } },
          React.createElement('span', { className: 'mono', style: { fontSize: '11px', color: 'var(--ink)', fontWeight: 600 } }, val),
          secondary && React.createElement('span', { className: 'mono', style: { fontSize: '9px', color: 'var(--ink-50)' } }, secondary)
        )
      ));

      if (!isLast) {
        items.push(React.createElement('div', { key: 'cn-' + idx,
          style: { display: 'flex', alignItems: 'center', flexShrink: 0, height: CARD_H + 'px' }
        },
          React.createElement('svg', { width: GAP, height: CARD_H, style: { display: 'block' } },
            React.createElement('path', {
              d: 'M0,' + (CARD_H / 2) + ' L' + (GAP - 2) + ',' + (CARD_H / 2),
              stroke: 'var(--ink-30)', strokeWidth: 1.5, opacity: 0.5, fill: 'none'
            }),
            React.createElement('path', {
              d: 'M' + (GAP - 7) + ',' + (CARD_H / 2 - 4) + ' L' + (GAP - 1) + ',' + (CARD_H / 2) + ' L' + (GAP - 7) + ',' + (CARD_H / 2 + 4),
              stroke: 'var(--ink-30)', strokeWidth: 1.5, opacity: 0.7, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round'
            })
          )
        ));
      }
    }

    return [
      React.createElement('div', { key: 'be-h-outer',
        style: { display: 'flex', justifyContent: 'center', overflowX: 'auto', overflowY: 'hidden', padding: '6px 4px' }
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0', flexShrink: 0, margin: '0 auto' } },
          items
        )
      )
    ];
  }

  return React.createElement('div', { className: 'panel' },
    React.createElement('div', { className: 'panel-h' },
      React.createElement('div', { className: 'panel-title' }, title),
      React.createElement('div', { className: 'panel-sub mono' }, subtitle)
    ),
    // Nav bar: back + breadcrumbs + clear
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--rule)', marginBottom: '4px' } },
      React.createElement('button', { onClick: goBack, disabled: !canBack,
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px',
          border: '1px solid ' + (canBack ? 'var(--rule)' : 'var(--ink-04)'), borderRadius: '6px',
          background: 'transparent', color: canBack ? 'var(--ink-70)' : 'var(--ink-15)',
          cursor: canBack ? 'pointer' : 'default', fontSize: '14px', fontFamily: 'var(--font-body)', transition: 'all 0.15s', flexShrink: 0 }
      }, '←'),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', fontSize: '11px', overflow: 'hidden', gap: '0', flex: 1, minWidth: 0 } },
        crumbs.map(function (label, idx) {
          var isLast = idx === crumbs.length - 1;
          return React.createElement('span', { key: idx, style: { display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' } },
            idx > 0 && React.createElement('span', { style: { color: 'var(--ink-15)', margin: '0 5px', fontSize: '10px' } }, '›'),
            React.createElement('button', {
              onClick: isLast ? undefined : (function (i) { return function () { goToLevel(i); }; })(idx),
              style: { border: 'none', background: 'transparent', padding: '3px 4px', cursor: isLast ? 'default' : 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '11px', color: isLast ? 'var(--ink)' : 'var(--ink-50)',
                fontWeight: isLast ? 600 : 400, borderRadius: '3px', transition: 'color 0.15s' }
            }, label)
          );
        })
      ),
      // Clear button — top right
      React.createElement('button', { onClick: clearAll, disabled: !canBack,
        style: { display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px',
          border: '1px dashed ' + (canBack ? 'var(--ink-30)' : 'var(--ink-04)'),
          borderRadius: '6px', background: 'transparent',
          color: canBack ? 'var(--ink-50)' : 'var(--ink-15)',
          cursor: canBack ? 'pointer' : 'default',
          fontSize: '10px', fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          transition: 'all 0.15s', flexShrink: 0, marginLeft: 'auto' }
      },
        React.createElement('span', { style: { fontSize: '12px', lineHeight: 1 } }, '✕'),
        React.createElement('span', null, 'Clear')
      )
    ),
    // Horizontal selected-path bird's eye (centered, full width)
    React.createElement('div', { style: { borderBottom: '1px solid var(--rule)', padding: '8px 0 14px' } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' } },
        React.createElement('span', { style: { fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--ink-50)', letterSpacing: '0.1em', textTransform: 'uppercase' } }, 'Selected path'),
        React.createElement('span', { style: { fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--ink-30)' } }, 'click a card to go back')
      ),
      renderBirdsEye()
    ),
    // Drill-down SVG
    React.createElement('div', { style: { overflowX: 'auto', overflowY: 'auto', maxHeight: '600px', paddingTop: '12px' } },
      kids.length > 0
        ? React.createElement('svg', { width: svgW, height: svgH, style: { display: 'block', margin: '0 auto' },
            onMouseLeave: function () { setHovIdx(null); } }, els)
        : React.createElement('div', { style: { padding: '48px', textAlign: 'center', color: 'var(--ink-30)', fontSize: '11px', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' } },
            'Leaf level — no further breakdown')
    )
  );
}

Object.assign(window, { ArtboardBillability });
