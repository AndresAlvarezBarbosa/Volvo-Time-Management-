 // excel-ingest.jsx — turn a base64-encoded .xlsx (handed in by the Swift host
// via window.tmIngestXlsxBase64) into the {records, employees, wbs} shape the
// dashboard already understands, and dispatch a 'tm:data' event to swap it in.
//
// Sheet detection is permissive — we tolerate a single-sheet workbook (records
// only) or a workbook with named sheets like "Records", "Employees", "WBS".
// Column headers are auto-mapped from common aliases so user spreadsheets with
// slightly different header text still work.

(function () {
  // ---- helpers --------------------------------------------------------------

  function b64ToUint8Array(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // For each canonical field, the list of header strings (normalised) that map to it.
  const FIELD_ALIASES = {
    records: {
      pn:       ['pn', 'pernr', 'personnelnumber', 'employeeid', 'empid', 'employeenumber', 'persno'],
      date:     ['date', 'workdate', 'postingdate', 'logdate', 'day', 'lastrecorddate', 'recorddate', 'entrydate', 'timedate'],
      hours:    ['hours', 'hrs', 'duration', 'qty', 'quantity', 'amount', 'hourslogged', 'loggedhours', 'totalhours', 'hourstotal', 'hoursworked', 'workhours'],
      activity: ['activity', 'activitytype', 'attendancetype', 'awart', 'wagetype'],
      wbs:      ['wbs', 'wbselement', 'wbscode', 'projectcode', 'wbsid', 'generalreceiver', 'receiver'],
      shortId:  ['shortid', 'short', 'projshort', 'wbsshort', 'wbsname', 'projectid', 'shortidentification'],
      name:     ['name', 'employee', 'employeename', 'fullname', 'person', 'worker', 'resource', 'staffname', 'personnelname', 'nameofemployeeorapplicant', 'employeeorapplicant'],
    },
    employees: {
      name:       ['name', 'employee', 'employeename', 'fullname', 'person'],
      pn:         ['pn', 'pernr', 'personnelnumber', 'employeeid', 'empid', 'persno'],
      lastLogged: ['lastlogged', 'lastlog', 'lastentry', 'lastdate', 'lastrecorddate'],
      status:     ['status', 'employmentstatus'],
      brand:      ['brand', 'company', 'companycode', 'org', 'division'],
      type:       ['type', 'employeetype', 'emptype'],
      func:       ['func', 'function', 'role', 'jobtitle', 'position'],
    },
    wbs: {
      wbs:         ['wbs', 'wbselement', 'wbscode', 'wbsid'],
      shortId:     ['shortid', 'short', 'wbsshort'],
      activity:    ['activity', 'activitytype'],
      lastRecord:  ['lastrecord', 'lastposting', 'lastentry', 'lastrecorddate'],
      hoursTotal:  ['hourstotal', 'totalhours', 'hours', 'hourslogged'],
      type:        ['type', 'projecttype', 'billingtype', 'wbstype'],
      status:      ['status'],
      project:     ['project', 'projectname'],
      projectType: ['projecttype', 'projkind'],
    },
  };

  function buildHeaderMap(headerRow, kind) {
    const aliases = FIELD_ALIASES[kind];
    const map = {}; // canonical -> column index
    headerRow.forEach((h, idx) => {
      const n = norm(h);
      for (const [canon, list] of Object.entries(aliases)) {
        if (map[canon] === undefined && list.includes(n)) map[canon] = idx;
      }
    });
    return map;
  }

  // Convert an array-of-arrays sheet (header row + body) to objects using the alias map.
  function rowsToObjects(rows, kind) {
    if (!rows.length) return [];
    const headerMap = buildHeaderMap(rows[0] || [], kind);
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      // Skip fully-empty rows
      if (!r || r.every(c => c == null || c === '')) continue;
      const obj = {};
      for (const [canon, idx] of Object.entries(headerMap)) {
        let v = r[idx];
        if (canon === 'date') v = coerceDate(v);
        else if (canon === 'hours' || canon === 'hoursTotal') v = coerceNumber(v);
        else if (v != null) v = String(v).trim();
        if (v !== undefined && v !== '') obj[canon] = v;
      }
      // Records require at least date+hours+name to be useful
      if (kind === 'records' && (!obj.date || obj.hours == null || !obj.name)) continue;
      out.push(obj);
    }
    return out;
  }

  function coerceNumber(v) {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  // SheetJS gives Excel dates as JS Date objects when cellDates:true; otherwise serials.
  function coerceDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') {
      // Excel serial date (1900-based, with the well-known leap-year bug handled by SheetJS via cellDates)
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    // ISO already
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
    return s;
  }

  // Pick the best-matching sheet name (case-insensitive substring) or null.
  function findSheet(wb, ...names) {
    const lc = wb.SheetNames.map(n => n.toLowerCase());
    for (const want of names) {
      const w = want.toLowerCase();
      const idx = lc.findIndex(n => n === w || n.includes(w));
      if (idx >= 0) return wb.SheetNames[idx];
    }
    return null;
  }

  // Score how well a sheet's headers match a given kind's required fields.
  function sheetMatchScore(wb, sheetName, kind, requiredFields) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1, raw: true, defval: '', blankrows: false,
    });
    if (!rows.length) return { score: 0, rows };
    const hmap = buildHeaderMap(rows[0], kind);
    const score = requiredFields.filter(f => hmap[f] !== undefined).length;
    return { score, rows };
  }

  // Find the sheet whose headers best match the required fields for a kind.
  function findSheetByHeaders(wb, kind, requiredFields) {
    let best = null, bestScore = 0, bestRows = null;
    for (const name of wb.SheetNames) {
      const { score, rows } = sheetMatchScore(wb, name, kind, requiredFields);
      if (score > bestScore) { best = name; bestScore = score; bestRows = rows; }
    }
    return bestScore > 0 ? { name: best, rows: bestRows } : null;
  }

  // Derive {employees, wbs} summaries from records when the workbook only has
  // a single sheet — keeps the dashboard's reference views populated.
  // Merges with previously loaded employee/wbs data to preserve brand, func, type, etc.
  function deriveLookups(records) {
    const prevEmpByName = {};
    const prevEmpByNameLC = {};
    if (Array.isArray(window.__tmEmployees)) {
      for (const e of window.__tmEmployees) {
        prevEmpByName[e.name] = e;
        prevEmpByNameLC[e.name.trim().toLowerCase()] = e;
      }
    }
    const prevWbsByCode = {};
    const prevWbsByCodeTrimmed = {};
    if (Array.isArray(window.__tmWbs)) {
      for (const w of window.__tmWbs) {
        prevWbsByCode[w.wbs] = w;
        prevWbsByCodeTrimmed[w.wbs.trim()] = w;
      }
    }

    const empMap = new Map();
    const wbsMap = new Map();
    for (const r of records) {
      if (r.name && !empMap.has(r.name)) {
        const prev = prevEmpByName[r.name] || prevEmpByNameLC[r.name.trim().toLowerCase()];
        empMap.set(r.name, {
          name: r.name, pn: r.pn || prev?.pn || '', lastLogged: r.date,
          status: prev?.status || 'Active',
          brand: prev?.brand || 'Unknown',
          type: prev?.type || 'Employee',
          func: prev?.func || '',
        });
      } else if (r.name) {
        const e = empMap.get(r.name);
        if (r.date && (!e.lastLogged || r.date > e.lastLogged)) e.lastLogged = r.date;
      }
      if (r.wbs && !wbsMap.has(r.wbs)) {
        const prev = prevWbsByCode[r.wbs] || prevWbsByCodeTrimmed[(r.wbs || '').trim()];
        wbsMap.set(r.wbs, {
          wbs: r.wbs, shortId: r.shortId || prev?.shortId || '',
          activity: r.activity || prev?.activity || '',
          lastRecord: r.date, hoursTotal: 0,
          type: prev?.type || 'Unknown',
          status: prev?.status || 'Active',
          project: prev?.project || r.shortId || r.wbs,
          projectType: prev?.projectType || '',
        });
      }
      if (r.wbs) {
        const w = wbsMap.get(r.wbs);
        w.hoursTotal += Number(r.hours) || 0;
        if (r.date && (!w.lastRecord || r.date > w.lastRecord)) w.lastRecord = r.date;
      }
    }
    return { employees: [...empMap.values()], wbs: [...wbsMap.values()] };
  }

  // ---- public bridge --------------------------------------------------------

  window.tmUploadXlsx = function () {
    console.log('TM: tmUploadXlsx called');
    var bridge = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.tmHost;
    if (bridge) {
      console.log('TM: posting openXlsx to bridge');
      window.tmToast && window.tmToast('Opening file picker…');
      bridge.postMessage({ type: 'openXlsx' });
      return;
    }
    console.log('TM: no bridge, using file input fallback');
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = function () {
      var file = input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var bytes = new Uint8Array(reader.result);
        var binary = '';
        for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        var b64 = btoa(binary);
        window.tmIngestXlsxBase64(b64, file.name);
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  };

  window.tmIngestXlsxBase64 = function (b64, filename) {
    console.log('TM ingest: called with', (b64 || '').length, 'chars, file:', filename);
    window.tmToast && window.tmToast('Processing ' + (filename || 'workbook') + '…');
    try {
      if (typeof XLSX === 'undefined') throw new Error('SheetJS not loaded');

      const bytes = b64ToUint8Array(b64);
      const wb = XLSX.read(bytes, { type: 'array', cellDates: true });

      const toAOA = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1, raw: true, defval: '', blankrows: false,
      });

      // 1) Try named sheet match first, then header-based detection
      let recSheetName = findSheet(wb, 'actuals', 'records', 'time', 'logs', 'data');
      let recRows = null;

      if (recSheetName) {
        recRows = toAOA(recSheetName);
      } else {
        // No name matched — scan all sheets for the one with the best record-like headers
        const best = findSheetByHeaders(wb, 'records', ['date', 'hours', 'name']);
        if (best) { recSheetName = best.name; recRows = best.rows; }
        else { recSheetName = wb.SheetNames[0]; recRows = toAOA(recSheetName); }
      }

      console.log('TM ingest — sheets:', wb.SheetNames, 'picked records:', recSheetName);
      console.log('TM ingest — headers:', recRows[0]);

      let records = rowsToObjects(recRows, 'records');

      // If named match yielded 0 records, try header-based detection on remaining sheets
      if (!records.length && wb.SheetNames.length > 1) {
        const best = findSheetByHeaders(wb, 'records', ['date', 'hours', 'name']);
        if (best) {
          recSheetName = best.name;
          recRows = best.rows;
          records = rowsToObjects(recRows, 'records');
          console.log('TM ingest — fallback to sheet:', recSheetName, 'records:', records.length);
        }
      }

      const empSheet = findSheet(wb, 'employees', 'employee', 'people', 'staff')
                    || (findSheetByHeaders(wb, 'employees', ['name', 'brand']) || {}).name;
      const wbsSheet = findSheet(wb, 'wbs', 'projects', 'project')
                    || (findSheetByHeaders(wb, 'wbs', ['wbs', 'project']) || {}).name;

      let employees = empSheet ? rowsToObjects(toAOA(empSheet), 'employees') : null;
      let wbs       = wbsSheet ? rowsToObjects(toAOA(wbsSheet), 'wbs')       : null;

      if (!records.length) {
        const hdr = recRows[0] || [];
        const hmap = buildHeaderMap(hdr, 'records');
        const mapped = Object.keys(hmap).join(', ') || 'none';
        const missing = ['date','hours','name'].filter(f => hmap[f] === undefined);
        const hdrs = hdr.map(h => String(h)).join(', ');
        window.tmToast && window.tmToast(
          'No records found. Mapped: [' + mapped + ']. Missing required: [' + missing.join(', ') + ']. Headers: ' + hdrs, true);
        return;
      }

      if (!employees || !wbs) {
        const derived = deriveLookups(records);
        if (!employees) employees = derived.employees;
        if (!wbs)       wbs       = derived.wbs;
      }

      const payload = { records, employees, wbs };
      window.dispatchEvent(new CustomEvent('tm:data', { detail: payload }));

      const fileLabel = filename ? ` from "${filename}"` : '';
      window.tmToast && window.tmToast(
        `Loaded ${records.length.toLocaleString()} records${fileLabel}`);
    } catch (err) {
      console.error('xlsx ingest failed:', err);
      window.tmToast && window.tmToast(
        'Couldn\'t parse that workbook: ' + (err && err.message || err), true);
    }
  };
})();
