// artboards/log.jsx — Full hours log table
// Sortable, scrollable table with pill + dropdown date selection.

function ArtboardLog() {
  const data = useData();
  const [sortCol, setSortCol] = React.useState('date');
  const [sortDir, setSortDir] = React.useState(-1);
  const [category, setCategory] = React.useState('all');
  const [sub, setSub] = React.useState('');

  const records = data?.records || [];

  // Build sub-options per category
  const subOptions = React.useMemo(() => {
    if (!records.length) return { year: [], month: [], week: [] };

    const years = [...new Set(records.map(r => r.date.slice(0, 4)))].sort().reverse();

    const monthKeys = [...new Set(records.map(r => r.date.slice(0, 7)))].sort().reverse();
    const months = monthKeys.map(m => {
      const [y, mo] = m.split('-').map(Number);
      const label = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      return { value: m, label };
    });

    const weekMap = new Map();
    for (const r of records) {
      const wk = weekOfYear(r.date);
      const y = r.date.slice(0, 4);
      const key = `${y}-W${String(wk).padStart(2, '0')}`;
      if (!weekMap.has(key)) weekMap.set(key, r.date);
      else if (r.date < weekMap.get(key)) weekMap.set(key, r.date);
    }
    const weeks = [...weekMap.keys()].sort().reverse().map(wk => ({
      value: weekMap.get(wk), label: `${wk}  (${shortDate(weekMap.get(wk))})`
    }));

    return {
      year: years.map(y => ({ value: y, label: y })),
      month: months,
      week: weeks,
    };
  }, [records]);

  // Auto-select first sub-option when switching category
  React.useEffect(() => {
    if (category === 'year' && subOptions.year.length) setSub(subOptions.year[0].value);
    else if (category === 'month' && subOptions.month.length) setSub(subOptions.month[0].value);
    else if (category === 'week' && subOptions.week.length) setSub(subOptions.week[0].value);
    else setSub('');
  }, [category, subOptions]);

  // Date range filtering
  const filtered = React.useMemo(() => {
    if (category === 'all') return records;

    if (category === 'latest') {
      const maxDate = records.reduce((m, r) => r.date > m ? r.date : m, '');
      return records.filter(r => r.date === maxDate);
    }

    if (category === 'year' && sub) {
      return records.filter(r => r.date.startsWith(sub));
    }

    if (category === 'month' && sub) {
      return records.filter(r => r.date.startsWith(sub));
    }

    if (category === 'week' && sub) {
      const start = new Date(sub);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const endStr = end.toISOString().slice(0, 10);
      return records.filter(r => r.date >= sub && r.date <= endStr);
    }

    return records;
  }, [records, category, sub]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (sortCol === 'hours') return (va - vb) * sortDir;
      va = String(va || '').toLowerCase();
      vb = String(vb || '').toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  if (!data) return React.createElement(LoadingFrame);

  const totalHours = sorted.reduce((s, r) => s + r.hours, 0);

  const columns = [
    { key: 'name',     label: 'Employee',  w: 180 },
    { key: 'project',  label: 'Project',   w: 180 },
    { key: 'date',     label: 'Date',      w: 100 },
    { key: 'hours',    label: 'Hours',     w: 70 },
    { key: 'activity', label: 'Activity',  w: 100 },
    { key: 'brand',    label: 'Brand',     w: 100 },
    { key: 'wbs',      label: 'WBS',       w: 160 },
  ];
  const tableW = columns.reduce((s, c) => s + c.w, 0);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d * -1);
    else { setSortCol(col); setSortDir(col === 'hours' ? -1 : 1); }
  }

  const arrow = (col) => sortCol === col ? (sortDir === 1 ? ' ▲' : ' ▼') : '';

  const pills = [
    { key: 'all',    label: 'All' },
    { key: 'latest', label: 'Latest entry' },
    { key: 'year',   label: 'Year' },
    { key: 'month',  label: 'Month' },
    { key: 'week',   label: 'Work week' },
  ];

  const hasDropdown = category === 'year' || category === 'month' || category === 'week';
  const currentOptions = hasDropdown ? subOptions[category] : [];

  return React.createElement('div', { className: 'ab-frame', style: { overflow: 'hidden' } },
    React.createElement('header', { className: 'ab-header' },
      React.createElement('div', { className: 'ab-eyebrow' }, '07 / Log'),
      React.createElement('h1', { className: 'ab-title' }, 'Hours log'),
      React.createElement('div', { className: 'ab-meta' },
        React.createElement('span', null, `${fmtNum(sorted.length)} entries`),
        React.createElement('span', { className: 'ab-dot' }),
        React.createElement('span', null, `${fmtNum(Math.round(totalHours))} total hours`),
      )
    ),
    // Pills + dropdown row
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' } },
      React.createElement('div', { className: 'pill-group' },
        React.createElement('span', { className: 'pill-label' }, 'Period'),
        pills.map(p => React.createElement('button', {
          key: p.key, className: 'pill' + (category === p.key ? ' on' : ''),
          onClick: () => setCategory(p.key),
        }, p.label))
      ),
      hasDropdown && currentOptions.length > 0 && React.createElement('select', {
        className: 'log-select mono',
        value: sub,
        onChange: e => setSub(e.target.value),
      },
        currentOptions.map(o => React.createElement('option', { key: o.value, value: o.value }, o.label))
      ),
    ),
    // Scrollable table
    React.createElement('div', { className: 'panel', style: { flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', minHeight: 0 } },
      React.createElement('div', { style: { flex: 1, overflow: 'auto', minHeight: 0 } },
        React.createElement('table', { className: 'log-table', style: { minWidth: tableW } },
          React.createElement('thead', null,
            React.createElement('tr', null,
              columns.map(c => React.createElement('th', {
                key: c.key, className: 'log-th mono' + (sortCol === c.key ? ' active' : ''),
                style: { width: c.w }, onClick: () => toggleSort(c.key),
              }, c.label + arrow(c.key)))
            )
          ),
          React.createElement('tbody', null,
            sorted.map((r, i) => React.createElement('tr', {
              key: i, className: 'log-tr' + (i % 2 === 0 ? '' : ' alt'),
            },
              React.createElement('td', { className: 'log-td' }, r.name),
              React.createElement('td', { className: 'log-td' },
                React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 8 } },
                  React.createElement('span', { className: 'proj-swatch proj-swatch--dot', style: { background: getProjectColor(r) } }),
                  React.createElement('span', null, r.project)
                )
              ),
              React.createElement('td', { className: 'log-td mono' }, r.date),
              React.createElement('td', { className: 'log-td mono', style: { textAlign: 'right' } }, fmtNum(r.hours, 1)),
              React.createElement('td', { className: 'log-td mono' }, r.activity || '–'),
              React.createElement('td', { className: 'log-td' }, r.brand),
              React.createElement('td', { className: 'log-td mono' },
                React.createElement('span', { title: r.wbs }, r.wbs || '–')
              ),
            ))
          ),
        )
      ),
      React.createElement('div', { className: 'log-pager' },
        React.createElement('span', { className: 'mono' },
          `${fmtNum(sorted.length)} rows · ${fmtNum(Math.round(totalHours))} hours`
        ),
      ),
    )
  );
}

Object.assign(window, { ArtboardLog });
