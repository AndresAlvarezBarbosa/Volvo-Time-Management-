// search-bar.jsx — Global search across people + projects
// Floating, persistent across all artboards. Live results dropdown.
// When a query is set, all artboards filter their records via useFilteredData.

const SearchCtx = React.createContext({ query: '', setQuery: () => {}, scope: 'all', setScope: () => {} });

function SearchProvider({ children }) {
  const [query, setQuery] = React.useState('');
  const [scope, setScope] = React.useState('all'); // all | person | project
  return React.createElement(SearchCtx.Provider, { value: { query, setQuery, scope, setScope } }, children);
}

function useSearch() { return React.useContext(SearchCtx); }

// Hook each artboard uses to get records filtered by the active search.
function useFilteredRecords() {
  const data = useData();
  const { query, scope } = useSearch();
  return React.useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.records;
    return data.records.filter(r => {
      const matchPerson = r.name.toLowerCase().includes(q);
      const matchProject = r.project.toLowerCase().includes(q);
      if (scope === 'person') return matchPerson;
      if (scope === 'project') return matchProject;
      return matchPerson || matchProject;
    });
  }, [data, query, scope]);
}

function SearchBar() {
  const data = useData();
  const { query, setQuery, scope, setScope } = useSearch();
  const [open, setOpen] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const inputRef = React.useRef(null);

  // Build searchable index
  const index = React.useMemo(() => {
    if (!data) return [];
    const out = [];
    const projHours = new Map();
    const empHours = new Map();
    for (const r of data.records) {
      projHours.set(r.project, (projHours.get(r.project)||0) + r.hours);
      empHours.set(r.name, (empHours.get(r.name)||0) + r.hours);
    }
    for (const e of data.employees) {
      out.push({ kind: 'person', label: e.name, sub: `${e.brand} · ${fmtNum(Math.round(empHours.get(e.name)||0))} hrs`, score: empHours.get(e.name) || 0 });
    }
    const seenProj = new Set();
    for (const r of data.records) {
      if (seenProj.has(r.project)) continue;
      seenProj.add(r.project);
      out.push({ kind: 'project', label: r.project, sub: `${r.billable?'Billable':'Non-billable'} · ${fmtNum(Math.round(projHours.get(r.project)||0))} hrs`, score: projHours.get(r.project) || 0 });
    }
    return out.sort((a,b) => b.score - a.score);
  }, [data]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter(item => {
      if (scope === 'person' && item.kind !== 'person') return false;
      if (scope === 'project' && item.kind !== 'project') return false;
      return item.label.toLowerCase().includes(q);
    }).slice(0, 12);
  }, [index, query, scope]);

  React.useEffect(() => { setFocusIdx(0); }, [query, scope]);

  // Keyboard: Cmd/Ctrl-K focuses, Esc clears, ↑↓ navigate, Enter applies
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery(''); setOpen(false); inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setQuery]);

  const showResults = open && query.trim().length > 0 && results.length > 0;

  function pick(item) {
    setQuery(item.label);
    setScope(item.kind);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onInputKey(e) {
    if (!showResults) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(results.length-1, i+1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(0, i-1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[focusIdx]); }
  }

  return React.createElement('div', { className: 'sb-wrap' + (open?' open':'') },
    React.createElement('div', { className: 'sb-bar' },
      React.createElement('div', { className: 'sb-icon' },
        React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
          React.createElement('circle', { cx: 11, cy: 11, r: 7 }),
          React.createElement('line', { x1: 21, y1: 21, x2: 16.5, y2: 16.5 }),
        )
      ),
      React.createElement('input', {
        ref: inputRef, className: 'sb-input',
        placeholder: 'Search people or projects…  ⌘K',
        value: query,
        onChange: e => { setQuery(e.target.value); setOpen(true); },
        onFocus: () => setOpen(true),
        onBlur: () => setTimeout(() => setOpen(false), 150),
        onKeyDown: onInputKey,
      }),
      React.createElement('div', { className: 'sb-scopes' },
        ['all','person','project'].map(s => React.createElement('button', {
          key: s, className: 'sb-scope' + (scope===s?' on':''),
          onMouseDown: e => { e.preventDefault(); setScope(s); },
        }, s === 'all' ? 'All' : s === 'person' ? 'People' : 'Projects'))
      ),
      query && React.createElement('button', {
        className: 'sb-clear', onMouseDown: e => { e.preventDefault(); setQuery(''); inputRef.current?.focus(); },
        title: 'Clear'
      }, '×'),
    ),
    showResults && React.createElement('div', { className: 'sb-results' },
      results.map((r, i) => React.createElement('button', {
        key: r.kind+'|'+r.label, className: 'sb-result' + (i===focusIdx?' on':''),
        onMouseDown: e => { e.preventDefault(); pick(r); },
        onMouseEnter: () => setFocusIdx(i),
      },
        React.createElement('span', { className: 'sb-kind' }, r.kind === 'person' ? 'PERSON' : 'PROJECT'),
        React.createElement('span', { className: 'sb-label' }, r.label),
        React.createElement('span', { className: 'sb-sub mono' }, r.sub),
      ))
    ),
    query && React.createElement('div', { className: 'sb-status mono' },
      `Filtering all artboards · ${scope === 'all' ? 'people + projects' : scope+'s'} matching "${query}"`
    )
  );
}

Object.assign(window, { SearchProvider, SearchCtx, useSearch, useFilteredRecords, SearchBar });
