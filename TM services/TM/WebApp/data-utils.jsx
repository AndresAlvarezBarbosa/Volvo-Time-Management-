// data-utils.jsx — shared data layer + memoized aggregations
// Loads data.json on first mount, but can also accept a runtime data swap
// via the 'tm:data' window event (dispatched by excel-ingest.jsx when the
// user picks a fresh .xlsx through the native File → Open Excel… menu).

const DataCtx = React.createContext(null);

// Build the decorated state shape the artboards expect from a raw
// {records, employees, wbs} payload.
function buildDataState(raw) {
  const employees = Array.isArray(raw.employees) ? raw.employees : [];
  const wbs       = Array.isArray(raw.wbs)       ? raw.wbs       : [];
  const records0  = Array.isArray(raw.records)   ? raw.records   : [];

  const empByName = {};
  for (const e of employees) empByName[e.name] = e;
  const empByNameLC = {};
  for (const e of employees) empByNameLC[e.name.trim().toLowerCase()] = e;
  const wbsByCode = {};
  for (const w of wbs) wbsByCode[w.wbs] = w;
  const wbsByCodeTrimmed = {};
  for (const w of wbs) wbsByCodeTrimmed[w.wbs.trim()] = w;

  const records = records0.filter(r => r.hours > 0).map(r => {
    const emp = empByName[r.name] || empByNameLC[(r.name || '').trim().toLowerCase()];
    const w   = wbsByCode[r.wbs] || wbsByCodeTrimmed[(r.wbs || '').trim()];
    const wType = (w?.type || '').trim().toLowerCase();
    return {
      ...r,
      brand:       emp?.brand || 'Unknown',
      func:        emp?.func  || '',
      empType:     emp?.type  || '',
      project:     (w?.project || r.shortId || 'Unknown').trim(),
      projectType: w?.type || 'Unknown',
      billable:    wType === 'billable',
    };
  });

  const allDates = [...new Set(records.map(r => r.date))].sort();
  const minDate = allDates[0], maxDate = allDates[allDates.length - 1];

  window.__tmEmployees = employees;
  window.__tmWbs = wbs;

  return { records, employees, wbs, empByName, wbsByCode, allDates, minDate, maxDate };
}

function DataProvider({ children }) {
  const [data, setData] = React.useState(null);

  // Initial load from bundled data.json (preserves original behaviour).
  React.useEffect(() => {
    let cancelled = false;
    fetch('data.json')
      .then(r => r.json())
      .then(raw => { if (!cancelled) setData(buildDataState(raw)); })
      .catch(err => { console.warn('initial data.json load failed:', err); });
    return () => { cancelled = true; };
  }, []);

  // Hot-swap data when an .xlsx is ingested at runtime.
  React.useEffect(() => {
    function onSwap(ev) {
      const raw = ev && ev.detail;
      if (!raw || !Array.isArray(raw.records)) return;
      setData(buildDataState(raw));
    }
    window.addEventListener('tm:data', onSwap);
    return () => window.removeEventListener('tm:data', onSwap);
  }, []);

  return React.createElement(DataCtx.Provider, { value: data }, children);
}

const BrandCtx = React.createContext({
  selBrands: [], allBrands: [],
  addBrand: function(){}, removeBrand: function(){}, clearBrands: function(){},
});

function BrandProvider({ children }) {
  const [selBrands, setSelBrands] = React.useState([]);
  const raw = React.useContext(DataCtx);
  const allBrands = React.useMemo(() => {
    if (!raw) return [];
    const set = new Set(raw.records.map(r => r.brand));
    return [...set].filter(Boolean).sort();
  }, [raw]);
  const addBrand = (b) => setSelBrands(s => s.includes(b) ? s : [...s, b]);
  const removeBrand = (b) => setSelBrands(s => s.filter(x => x !== b));
  const clearBrands = () => setSelBrands([]);
  return React.createElement(BrandCtx.Provider, {
    value: { selBrands, allBrands, addBrand, removeBrand, clearBrands }
  }, children);
}

function useBrand() { return React.useContext(BrandCtx); }

const FuncCtx = React.createContext({
  selFuncs: [], allFuncs: [],
  addFunc: function(){}, removeFunc: function(){}, clearFuncs: function(){},
});

function FuncProvider({ children }) {
  const [selFuncs, setSelFuncs] = React.useState([]);
  const raw = React.useContext(DataCtx);
  const allFuncs = React.useMemo(() => {
    if (!raw) return [];
    const set = new Set(raw.records.map(r => r.func).filter(f => f && f.trim()));
    return [...set].sort();
  }, [raw]);
  const addFunc = (f) => setSelFuncs(s => s.includes(f) ? s : [...s, f]);
  const removeFunc = (f) => setSelFuncs(s => s.filter(x => x !== f));
  const clearFuncs = () => setSelFuncs([]);
  return React.createElement(FuncCtx.Provider, {
    value: { selFuncs, allFuncs, addFunc, removeFunc, clearFuncs }
  }, children);
}

function useFunc() { return React.useContext(FuncCtx); }

const FilterCtx = React.createContext({
  selEmps: [], selProjs: [],
  addEmp: function(){}, removeEmp: function(){}, clearEmps: function(){},
  addProj: function(){}, removeProj: function(){}, clearProjs: function(){},
  clearAll: function(){},
});

function FilterProvider({ children }) {
  const [selEmps, setSelEmps] = React.useState([]);
  const [selProjs, setSelProjs] = React.useState([]);
  const addEmp = (n) => setSelEmps(s => s.includes(n) ? s : [...s, n]);
  const removeEmp = (n) => setSelEmps(s => s.filter(x => x !== n));
  const clearEmps = () => setSelEmps([]);
  const addProj = (p) => setSelProjs(s => s.includes(p) ? s : [...s, p]);
  const removeProj = (p) => setSelProjs(s => s.filter(x => x !== p));
  const clearProjs = () => setSelProjs([]);
  const clearAll = () => { setSelEmps([]); setSelProjs([]); };
  return React.createElement(FilterCtx.Provider, {
    value: { selEmps, selProjs, addEmp, removeEmp, clearEmps, addProj, removeProj, clearProjs, clearAll }
  }, children);
}

function useFilter() { return React.useContext(FilterCtx); }

function useData() {
  const raw = React.useContext(DataCtx);
  const search = React.useContext(SearchCtx);
  const { selBrands } = React.useContext(BrandCtx);
  const { selFuncs } = React.useContext(FuncCtx);
  const { selEmps, selProjs } = React.useContext(FilterCtx);
  return React.useMemo(() => {
    if (!raw) return null;
    const q = (search?.query || '').trim().toLowerCase();
    const hasBrand = selBrands.length > 0;
    const hasFunc = selFuncs.length > 0;
    const hasEmp = selEmps.length > 0;
    const hasProj = selProjs.length > 0;
    if (!q && !hasBrand && !hasFunc && !hasEmp && !hasProj) return raw;

    let recs = raw.records;
    let emps = raw.employees;

    if (hasBrand) {
      const brandSet = new Set(selBrands);
      recs = recs.filter(r => brandSet.has(r.brand));
      emps = emps.filter(e => brandSet.has(e.brand));
    }

    if (hasFunc) {
      const funcSet = new Set(selFuncs);
      recs = recs.filter(r => funcSet.has(r.func));
      emps = emps.filter(e => funcSet.has(e.func));
    }

    if (hasEmp) {
      const empSet = new Set(selEmps);
      recs = recs.filter(r => empSet.has(r.name));
      emps = emps.filter(e => empSet.has(e.name));
    }

    if (hasProj) {
      const projSet = new Set(selProjs);
      recs = recs.filter(r => projSet.has(r.project));
    }

    if (q) {
      const scope = search?.scope || 'all';
      recs = recs.filter(r => {
        const mp = r.name.toLowerCase().includes(q);
        const mj = r.project.toLowerCase().includes(q);
        if (scope === 'person') return mp;
        if (scope === 'project') return mj;
        return mp || mj;
      });
    }

    if (recs.length === 0) return { ...raw, records: recs, employees: emps, isFiltered: true, isEmpty: true };
    const dates = [...new Set(recs.map(r => r.date))].sort();
    return {
      ...raw,
      records: recs,
      employees: emps,
      allDates: dates,
      minDate: dates[0] || raw.minDate,
      maxDate: dates[dates.length-1] || raw.maxDate,
      isFiltered: true,
    };
  }, [raw, search?.query, search?.scope, selBrands, selFuncs, selEmps, selProjs]);
}

// ── Aggregations ──────────────────────────────────────────────

function groupSum(records, keyFn, valFn = r => r.hours) {
  const m = new Map();
  for (const r of records) {
    const k = keyFn(r);
    m.set(k, (m.get(k) || 0) + valFn(r));
  }
  return m;
}

function dailyTotals(records) {
  const m = new Map();
  for (const r of records) m.set(r.date, (m.get(r.date) || 0) + r.hours);
  return [...m.entries()].sort(([a],[b]) => a < b ? -1 : 1).map(([date, hours]) => ({ date, hours }));
}

// Build a continuous date range, even for missing days
function fillDateRange(start, end) {
  const out = [];
  const d = new Date(start);
  const e = new Date(end);
  while (d <= e) {
    out.push(d.toISOString().slice(0,10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function dayOfWeek(dateStr) {
  // dateStr is YYYY-MM-DD; use UTC to avoid TZ drift
  const [y,m,d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m-1, d)).getUTCDay(); // 0=Sun
}

function weekOfYear(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m-1, d));
  // ISO week
  const target = new Date(date);
  const dayNr = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

function monthOf(dateStr) { return dateStr.slice(0, 7); }
function shortDate(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m-1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function monthLabel(monthStr) {
  const [y,m] = monthStr.split('-').map(Number);
  return new Date(Date.UTC(y, m-1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ── Format helpers ─────────────────────────────────────────────
function fmtNum(n, digits = 0) {
  if (n == null || isNaN(n)) return '–';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtHours(n) {
  if (n == null || isNaN(n)) return '–';
  if (n >= 1000) return (n/1000).toFixed(1) + 'k';
  return Math.round(n).toString();
}

// ── Color helpers ──────────────────────────────────────────────
// Single-hue scale via oklch. t ∈ [0,1].
function oklchScale(t, hue = 65, dark = false) {
  const L = dark ? (0.18 + t*0.5) : (0.97 - t*0.55);
  const C = dark ? (0.02 + t*0.13) : (0.005 + t*0.14);
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue})`;
}

// ── Project color coding ──────────────────────────────────────
// System-wide palette mapping each project to a hex color. Keyed by both
// WBS code and project name so callers can pass either. Unknown projects
// get a deterministic fallback from PROJECT_FALLBACK_PALETTE so colors
// stay stable across reloads.

const PROJECT_COLORS_BY_CODE = {
  'T10-00001-00-01':   '#2D3540', // ABSENCE — Graphite
  'T10-01951-DG-02':   '#B81F2A', // Mack Australia — Vivid Mack Red
  'T10-00009-00-01':   '#586273', // CONT IMPR — Steel
  'T10-01892-PM-02':   '#0077E6', // Mack LR/MR — Brilliant Blue
  'T10-01224-01-09-01':'#008294', // SVAT — Vivid Marine Teal
  'T10-00004-00-01':   '#424B59', // Management — Slate
  'T10-01030-PM-04':   '#003C8F', // P6720 — Deep Marine
  'T10-01489-02-01':   '#D62833', // Mack Brand Distinction — Bright Red
  'T10-00003-00-01':   '#6E7A8C', // TRAINING — Pewter
  'T10-00002-00-01':   '#8593A6', // MEETINGS — Silver
  'T10-02003-PM-02':   '#00A8C4', // Tech Upgrade VGDNA — Cyan Steel
  'T10-01951-DG-01':   '#E84252', // Mack Australia — Brick Red
  'T10-01488-01-01':   '#9DABBF', // VIVIS 3 — Mist
  'T10-01662-PM-01':   '#1A8AF0', // CARB 2027 — Azure
  'T10-01224-01-14':   '#00C2E0', // SVAT Other — Bright Cyan
  'T10-00283-01-01':   '#2B98FF', // VTNA PMR — Bright Sky
  'T10-01224-01-09-06':'#1BD4F0', // SVAT Aquila — Electric Aqua
  'T10-00030-00-01':   '#B6C2D4', // P&IT — Pebble
  'T10-00005-00-01':   '#CFDAEA', // NB SUPPORT — Cloud
  'T10-01029-PM-62':   '#0050B5', // P6710 — Vivid Volvo Blue
  'T10-00387-01-01':   '#F25A6B', // Mack PMR — Coral Red
  'T10-00282-01-01':   '#E5EDF7', // Quality PMR — Ash
  'T10-00010-00-01':   '#1A1F26', // KNOWL MGMT — Iron Black
  'T10-01326-01-04':   '#4FE0F5', // My Truck App — Lagoon
  'G10-06738-01-05-24':'#4FB3FF', // VTNA Marketing/Comm Support 2025-2026 — Sky Marine
  'T10-00389-01-01':   '#FFE066', // Mexico Localization — Sunshine
  'G10-06738-01-05-18':'#7FEDFA', // V3 CGI Support — Pale Aqua
  'G10-06738-01-02-58':'#0066D6', // MMD ADAS — Electric Marine
  'G10-06738-01-02-50':'#76C7FF', // MMD Gen 3 — Ice Blue
  'T10-01951-PM-01':   '#8856D1', // Mack Australia — Aubergine
  'T10-00238-01-01':   '#0A8C3D', // Power Management feature (VTNA) — Pine
  'T10-06618-01-01':   '#99632B', // Weight & Cost Reduction — Tobacco
  'T10-01733-PM-01':   '#5C2E94', // V7559 Cummins — Royal Purple
  'T10-01732-PM-01':   '#B87D3D', // Weight & Cost Reduction — Bronze
  'G10-06738-01-02-57':'#7340B8', // Mack Marketing — Vivid Plum
  'T10-01029-PM-64':   '#A3DBFF', // P6710 — Frost
  'G10-06738-01-02-66':'#A372E0', // Mack Marketing — Heather
  'T10-07579-PM-02':   '#7A4E1A', // NVCO — Espresso
  'G10-06738-01-05-16':'#14A84D', // Prevost EV Launch — Bright Green
  'G10-06738-01-04-05':'#C8EAFF', // P6720 Volvo Marketing trucks V3 builds — Polar
  'T10-01457-02-04':   '#006E2E', // Super Truck 3 — Vivid Forest
  'G10-06738-01-02-72':'#BB8FF0', // Mack Digital Drivers Guide — Soft Violet
  'T10-01908-01-01':   '#FFB800', // Mack Valve Cover Designs — Vivid Gold
  'T10-01029-PM-66':   '#FF9043', // P6710 — Bright Tangerine
  'G10-06738-01-10-01':'#D44A00', // VGD Bus Hub Cap — Deep Safety Orange
  'T10-00284-01-01':   '#ED5B00', // Mack, GuardDog Connect — Vital Orange
  'T10-01903-PM-02':   '#FF7220', // MMD ICE Support — Construction Orange
  'T10-01029-PM-71':   '#FFA85C', // P6710 — Sunbeam
  'T10-01275-01-01':   '#FFC07F', // Vanessa AI — Light Amber
  'G10-06738-01-02-37':'#FFD040', // MMD ICE Support — Bright Amber
  'G10-06738-01-05-26':'#2DC267', // VNL Electric CGI — Sage
  'T10-01733-PM-02':   '#5BD685', // Name 1 — Eucalyptus
  'T10-01396-PM-05':   '#8FE6A8', // Name 3 — Soft Sage
  'T10-01029-PM-74':   '#BAEFC8', // Name 2 — Mist Green
  'T10-00603-01-01-26':'#D49B5C', // Driver Experience Manual — Sandstone
};

// First-seen wins for names that share a code (aggregated views key by name).
// Record-level lookups (e.g., log table rows) prefer the by-code map above
// so each WBS keeps its distinct color.
const PROJECT_COLORS_BY_NAME = {
  'ABSENCE':                                '#2D3540',
  'Mack Australia':                         '#B81F2A',
  'CONT IMPR':                              '#586273',
  'Mack LR/MR':                             '#0077E6',
  'SVAT':                                   '#008294',
  'Management':                             '#424B59',
  'P6720':                                  '#003C8F',
  'Mack Brand Distinction':                 '#D62833',
  'TRAINING':                               '#6E7A8C',
  'MEETINGS':                               '#8593A6',
  'Tech Upgrade VGDNA':                     '#00A8C4',
  'VIVIS 3':                                '#9DABBF',
  'CARB 2027':                              '#1A8AF0',
  'SVAT Other':                             '#00C2E0',
  'VTNA PMR':                               '#2B98FF',
  'SVAT Aquila':                            '#1BD4F0',
  'P&IT':                                   '#B6C2D4',
  'NB SUPPORT':                             '#CFDAEA',
  'P6710':                                  '#0050B5',
  'Mack PMR':                               '#F25A6B',
  'Quality PMR':                            '#E5EDF7',
  'KNOWL MGMT':                             '#1A1F26',
  'My Truck App':                           '#4FE0F5',
  'VTNA Marketing/Comm Support 2025-2026':  '#4FB3FF',
  'Mexico Localization':                    '#FFE066',
  'V3 CGI Support':                         '#7FEDFA',
  'MMD ADAS':                               '#0066D6',
  'MMD Gen 3':                              '#76C7FF',
  'Power Management feature (VTNA)':        '#0A8C3D',
  'Weight & Cost Reduction':                '#99632B',
  'V7559 Cummins':                          '#5C2E94',
  'Mack Marketing':                         '#7340B8',
  'NVCO':                                   '#7A4E1A',
  'Prevost EV Launch':                      '#14A84D',
  'P6720 Volvo Marketing trucks V3 builds': '#C8EAFF',
  'Super Truck 3':                          '#006E2E',
  'Mack Digital Drivers Guide':             '#BB8FF0',
  'Mack Valve Cover Designs':               '#FFB800',
  'VGD Bus Hub Cap':                        '#D44A00',
  'Mack, GuardDog Connect':                 '#ED5B00',
  'MMD ICE Support':                        '#FF7220',
  'Vanessa AI':                             '#FFC07F',
  'VNL Electric CGI':                       '#2DC267',
  'Name 1':                                 '#5BD685',
  'Name 3':                                 '#8FE6A8',
  'Name 2':                                 '#BAEFC8',
  'Driver Experience Manual':               '#D49B5C',
};

// Palette used when a project isn't in the explicit map. Sampled from the
// vivid Volvo family so unknown projects feel of a piece with the system.
const PROJECT_FALLBACK_PALETTE = [
  '#0050B5', '#B81F2A', '#008294', '#14A84D', '#FFB800',
  '#ED5B00', '#7340B8', '#1A8AF0', '#586273', '#D49B5C',
];
const PROJECT_FALLBACK_COLOR = '#586273';

function _projHash(s) {
  // FNV-1a 32-bit. Stable across reloads.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

// Resolve a color for a project. Accepts a WBS code, a project name, or a
// record object ({wbs, project, ...}). Returns a hex string.
function getProjectColor(input) {
  if (input == null) return PROJECT_FALLBACK_COLOR;
  let code, name;
  if (typeof input === 'object') {
    code = input.wbs ? String(input.wbs).trim() : '';
    name = input.project ? String(input.project).trim() : '';
  } else {
    const s = String(input).trim();
    code = s;
    name = s;
  }
  if (code && PROJECT_COLORS_BY_CODE[code]) return PROJECT_COLORS_BY_CODE[code];
  if (name && PROJECT_COLORS_BY_NAME[name]) return PROJECT_COLORS_BY_NAME[name];
  const key = name || code || '';
  if (!key) return PROJECT_FALLBACK_COLOR;
  return PROJECT_FALLBACK_PALETTE[_projHash(key) % PROJECT_FALLBACK_PALETTE.length];
}

Object.assign(window, {
  DataProvider, useData, DataCtx,
  BrandCtx, BrandProvider, useBrand,
  FuncCtx, FuncProvider, useFunc,
  FilterCtx, FilterProvider, useFilter,
  groupSum, dailyTotals, fillDateRange, dayOfWeek, weekOfYear, monthOf,
  shortDate, monthLabel, fmtNum, fmtHours, oklchScale,
  getProjectColor, PROJECT_COLORS_BY_CODE, PROJECT_COLORS_BY_NAME,
});
