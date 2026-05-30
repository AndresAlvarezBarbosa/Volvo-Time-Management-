// artboards/flow.jsx — Brand → Project Type → Project flow (Sankey-ish)
// Three columns of stacked bands; ribbons connect them sized by hours.

function ArtboardFlow() {
  const data = useData();
  const [hover, setHover] = React.useState(null); // {kind, key}
  const panelRef = React.useRef(null);
  const [box, setBox] = React.useState({ w: 1500, h: 620 });

  // Measure the panel so the flow can relayout to fill the actual screen
  // area. Triggered on mount and any window/container resize.
  React.useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      if (r.width > 200 && r.height > 200) setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data) return React.createElement(LoadingFrame);
  const { records } = data;

  // Aggregate Brand x Type x Project (top projects only)
  const brandTotals = groupSum(records, r => r.brand);
  const projTotals = groupSum(records, r => r.project);
  const topProjects = new Set([...projTotals.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 12).map(([p])=>p));

  const flows = [];
  for (const r of records) {
    if (!topProjects.has(r.project)) continue;
    flows.push({ brand: r.brand, type: r.billable ? 'Billable' : 'Non-billable', project: r.project, hours: r.hours });
  }

  const sumBy = (arr, k) => {
    const m = new Map();
    for (const x of arr) m.set(x[k], (m.get(x[k])||0) + x.hours);
    return m;
  };
  const brandSums = sumBy(flows, 'brand');
  const typeSums = sumBy(flows, 'type');
  const projSums = sumBy(flows, 'project');

  const brands = [...brandSums.entries()].sort((a,b)=>b[1]-a[1]);
  const types = [...typeSums.entries()].sort((a,b)=>b[1]-a[1]);
  const projects = [...projSums.entries()].sort((a,b)=>b[1]-a[1]);

  const total = flows.reduce((s,f)=>s+f.hours, 0);
  // Responsive geometry — recomputed each render from the observed panel
  // size. All downstream coordinates are derived from W/H so labels,
  // ribbons, and the column layout all scale with the screen.
  const W = Math.max(900, box.w);
  const H = Math.max(520, box.h);
  // Tight horizontal padding so brand labels sit near the panel's left edge.
  const padT = 60, padB = 40, padX = 8;
  const colY = padT, colH = H - padT - padB;
  // Project name labels need a right-side budget that's wide enough for
  // long project names but tight enough that ribbons reach the far right.
  // Sized to fit the longest top-12 project ("Weight & Cost Reduction"
  // etc.) plus the hours line, then clamped for very narrow/wide screens.
  const labelReserve = Math.max(180, Math.min(230, W * 0.14));
  // Brand-side budget — sized to fit "Multi-Brand" + "8.7kh · 40%" with
  // no clipping but otherwise as tight as possible so the leftmost label
  // char sits flush with the SVG's left padding edge.
  const brandReserve = 76;
  const brandLabelGap = 6; // gap between brand label and column rect
  const colX = [padX + brandReserve, W/2, W - padX - 60 - labelReserve];
  const colW = 14, gap = 4;
  const labelGap = 16; // horizontal gap between project rect and label text

  // Build node positions
  function buildNodes(list) {
    let y = colY;
    const out = [];
    for (const [k, v] of list) {
      const h = v / total * (colH - (list.length-1)*gap);
      out.push({ key: k, y, h, v });
      y += h + gap;
    }
    return out;
  }
  const brandNodes = buildNodes(brands);
  const typeNodes = buildNodes(types);
  const projNodes = buildNodes(projects);

  const findNode = (arr, k) => arr.find(n => n.key === k);

  // Compute per-link offsets within each node (so ribbons stack)
  function computeLinks(srcNodes, tgtNodes, links, srcKey, tgtKey) {
    // group flows
    const grouped = {};
    for (const f of links) {
      const k = f[srcKey] + '||' + f[tgtKey];
      grouped[k] = (grouped[k]||0) + f.hours;
    }
    const linkObjs = Object.entries(grouped).map(([k,v]) => {
      const [s,t] = k.split('||');
      return { src: s, tgt: t, v };
    });
    // Sort and stack on src side
    const srcOff = {};
    for (const n of srcNodes) srcOff[n.key] = 0;
    const tgtOff = {};
    for (const n of tgtNodes) tgtOff[n.key] = 0;

    // Sort links so larger ones go first
    linkObjs.sort((a,b) => b.v - a.v);

    const result = [];
    for (const l of linkObjs) {
      const s = findNode(srcNodes, l.src);
      const t = findNode(tgtNodes, l.tgt);
      if (!s || !t) continue;
      const sH = l.v / s.v * s.h;
      const tH = l.v / t.v * t.h;
      const sY0 = s.y + srcOff[l.src]; srcOff[l.src] += sH;
      const tY0 = t.y + tgtOff[l.tgt]; tgtOff[l.tgt] += tH;
      result.push({ ...l, sY0, sY1: sY0+sH, tY0, tY1: tY0+tH });
    }
    return result;
  }

  // links per layer using the original flows
  const layer1 = computeLinks(brandNodes, typeNodes, flows, 'brand', 'type');
  const layer2 = computeLinks(typeNodes, projNodes, flows, 'type', 'project');

  function ribbon(x0, x1, y0a, y0b, y1a, y1b) {
    const cx = (x0 + x1) / 2;
    return `M${x0},${y0a} C${cx},${y0a} ${cx},${y1a} ${x1},${y1a} L${x1},${y1b} C${cx},${y1b} ${cx},${y0b} ${x0},${y0b} Z`;
  }

  const isHovered = (kind, key) => hover && hover.kind === kind && hover.key === key;
  const linkActive = (l, srcKind, tgtKind) =>
    !hover || (hover.kind === srcKind && hover.key === l.src) || (hover.kind === tgtKind && hover.key === l.tgt);

  function colorFor(kind, key) {
    if (kind === 'type') return key === 'Billable' ? 'var(--accent)' : 'var(--ink-50)';
    if (kind === 'brand') {
      if (key === 'Mack') return 'oklch(0.25 0.0 0)';
      if (key === 'VTNA') return 'oklch(0.72 0.18 175)';
      return 'oklch(0.70 0.16 55)';
    }
    if (kind === 'project') return getProjectColor(key);
    return 'var(--ink-30)';
  }

  // De-collide project labels: small-hour projects produce tiny rects whose
  // labels end up stacked on top of each other. We compute desired centers,
  // then push down/up so adjacent labels keep a minimum vertical gap.
  const LABEL_MIN_GAP = 30;
  const projLabelYs = (() => {
    const ys = projNodes.map(n => n.y + n.h/2);
    // Forward pass — never closer than MIN to previous
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] < ys[i-1] + LABEL_MIN_GAP) ys[i] = ys[i-1] + LABEL_MIN_GAP;
    }
    // Backward pass — pull up if pushed past the column bottom
    const maxY = colY + colH - 8;
    if (ys.length > 0 && ys[ys.length-1] > maxY) ys[ys.length-1] = maxY;
    for (let i = ys.length - 2; i >= 0; i--) {
      if (ys[i+1] - ys[i] < LABEL_MIN_GAP) ys[i] = ys[i+1] - LABEL_MIN_GAP;
    }
    return ys;
  })();

  return React.createElement('div', { className: 'ab-frame ab-frame--tight', style: { height: '100%' } },
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '04 / Flow'),
      React.createElement('h1', { className: 'ab-title' }, 'Brand → Type → Project'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, `Top ${topProjects.size} projects · ${fmtNum(Math.round(total))} hrs flow`),
      )
    ),
    React.createElement('div', { ref: panelRef, className: 'panel', style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '10px 4px 12px' } },
      React.createElement('svg', {
        viewBox: `0 0 ${W} ${H}`,
        preserveAspectRatio: 'xMidYMid meet',
        style: { width: '100%', height: '100%', flex: 1, display: 'block' },
        onMouseLeave: () => setHover(null),
      },
        // Column headers
        React.createElement('text', { x: colX[0]+colW/2, y: 30, className: 'flow-h', textAnchor: 'middle' }, 'BRAND'),
        React.createElement('text', { x: colX[1]+colW/2, y: 30, className: 'flow-h', textAnchor: 'middle' }, 'BILLABLE TYPE'),
        React.createElement('text', { x: colX[2]+colW/2, y: 30, className: 'flow-h', textAnchor: 'middle' }, 'PROJECT'),
        // Layer 1 ribbons
        layer1.map((l, i) => React.createElement('path', {
          key: i, d: ribbon(colX[0]+colW, colX[1], l.sY0, l.sY1, l.tY0, l.tY1),
          fill: colorFor('brand', l.src), opacity: linkActive(l, 'brand', 'type') ? 0.25 : 0.05,
          onMouseEnter: () => setHover({ kind: 'link', key: l.src+'→'+l.tgt, v: l.v }),
        })),
        // Layer 2 ribbons — colored by destination project so each project
        // reads as a distinct stream into its node.
        layer2.map((l, i) => React.createElement('path', {
          key: i, d: ribbon(colX[1]+colW, colX[2], l.sY0, l.sY1, l.tY0, l.tY1),
          fill: colorFor('project', l.tgt), opacity: linkActive(l, 'type', 'project') ? 0.40 : 0.06,
          onMouseEnter: () => setHover({ kind: 'link', key: l.src+'→'+l.tgt, v: l.v }),
        })),
        // Brand nodes
        brandNodes.map(n => React.createElement('g', {
          key: n.key, onMouseEnter: () => setHover({ kind: 'brand', key: n.key, v: n.v }),
        },
          React.createElement('rect', { x: colX[0], y: n.y, width: colW, height: n.h, fill: colorFor('brand', n.key) }),
          React.createElement('text', { x: colX[0]-brandLabelGap, y: n.y + n.h/2 + 4, textAnchor: 'end', className: 'flow-label' }, n.key),
          React.createElement('text', { x: colX[0]-brandLabelGap, y: n.y + n.h/2 + 18, textAnchor: 'end', className: 'flow-sub mono' }, fmtHours(n.v)+'h · '+(n.v/total*100).toFixed(0)+'%'),
        )),
        // Type nodes
        typeNodes.map(n => React.createElement('g', {
          key: n.key, onMouseEnter: () => setHover({ kind: 'type', key: n.key, v: n.v }),
        },
          React.createElement('rect', { x: colX[1], y: n.y, width: colW, height: n.h, fill: colorFor('type', n.key) }),
          React.createElement('text', { x: colX[1]+colW+8, y: n.y + 12, className: 'flow-label' }, n.key),
          React.createElement('text', { x: colX[1]+colW+8, y: n.y + 26, className: 'flow-sub mono' }, fmtHours(n.v)+'h · '+(n.v/total*100).toFixed(0)+'%'),
        )),
        // Project nodes — labels use de-collided Y positions and a thin
        // leader line connects each rect to its (possibly offset) label.
        projNodes.map((n, i) => {
          const nodeCenter = n.y + n.h/2;
          const labelY = projLabelYs[i];
          const offset = Math.abs(labelY - nodeCenter);
          const projColor = colorFor('project', n.key);
          return React.createElement('g', {
            key: n.key, onMouseEnter: () => setHover({ kind: 'project', key: n.key, v: n.v }),
          },
            React.createElement('rect', { x: colX[2], y: n.y, width: colW, height: n.h, fill: projColor }),
            offset > 2 && React.createElement('path', {
              d: `M${colX[2]+colW},${nodeCenter} L${colX[2]+colW+labelGap-2},${labelY}`,
              stroke: projColor, strokeWidth: 0.75, fill: 'none', opacity: 0.6,
            }),
            React.createElement('text', { x: colX[2]+colW+labelGap, y: labelY, className: 'flow-label' }, n.key.length>26?n.key.slice(0,25)+'…':n.key),
            React.createElement('text', { x: colX[2]+colW+labelGap, y: labelY + 14, className: 'flow-sub mono' }, fmtHours(n.v)+'h · '+(n.v/total*100).toFixed(0)+'%'),
          );
        }),
      ),
      React.createElement('div', { className: 'cal-detail' },
        hover
          ? React.createElement(React.Fragment, null,
              React.createElement('span', { className: 'mono' }, hover.kind),
              React.createElement('span', null, hover.key),
              React.createElement('span', { className: 'muted' }, `${fmtNum(Math.round(hover.v))} hrs · ${(hover.v/total*100).toFixed(1)}% of flow`),
            )
          : React.createElement('span', { className: 'muted' }, 'Hover any band to trace the flow')
      )
    )
  );
}

Object.assign(window, { ArtboardFlow });
