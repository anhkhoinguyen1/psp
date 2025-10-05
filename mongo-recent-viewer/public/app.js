const API_BASE = ''; // same-origin; if you proxy elsewhere, set e.g. 'https://api.yourdomain.com'

const statusEl = document.getElementById('status');
const dotEl = document.getElementById('dot');
const table = document.getElementById('data-table');
const thead = document.getElementById('table-head');
const tbody = document.getElementById('table-body');

const POLL_MS = 500; // 0.5 s
let pollTimer = null;
let lastId = null;
let headerKeys = null;

function setOnline(ok, textIfOk = 'Live') {
  if (ok) {
    dotEl.classList.add('ok');
    statusEl.textContent = textIfOk;
  } else {
    dotEl.classList.remove('ok');
    statusEl.textContent = 'Disconnected';
  }
}

function buildHeader(keys) {
  headerKeys = keys.slice();
  thead.innerHTML = '';
  const tr = document.createElement('tr');
  for (const k of keys) {
    const th = document.createElement('th');
    th.textContent = k;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
}

function makeCell(value, keyName) {
  const td = document.createElement('td');

  // Nicely format timestamp fields
  if (keyName && keyName.toLowerCase() === 'ts') {
    let v = value;
    if (typeof v === 'number') v = new Date(v).toLocaleString();
    else if (typeof v === 'string' && !isNaN(Date.parse(v))) v = new Date(v).toLocaleString();
    td.textContent = v ?? '';
    return td;
  }

  // --- NEW: render arrays (like FSR) horizontally on one line ---
  if (Array.isArray(value)) {
    td.textContent = `[ ${value.join(', ')} ]`;   // <— horizontal array
    return td;
  }

  // Objects still as compact JSON, scalars as-is
  if (typeof value === 'object' && value !== null) {
    td.textContent = JSON.stringify(value);       // no pretty newline
  } else {
    td.textContent = value ?? '';
  }
  return td;
}

function prependRow(doc) {
  const tr = document.createElement('tr');
  for (const k of headerKeys) {
    tr.appendChild(makeCell(doc[k], k));
  }
  if (tbody.firstChild) tbody.insertBefore(tr, tbody.firstChild);
  else tbody.appendChild(tr);
}

async function fetchLatestOne() {
  const url = `${API_BASE}/api/latest-one`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error('API error');
  return data.doc || null;
}

async function tick() {
  try {
    const doc = await fetchLatestOne();

    if (!doc) {
      setOnline(true, 'No data yet…');
      table.hidden = true;
      return;
    }

    if (!headerKeys) {
      const keys = Object.keys(doc);
      buildHeader(keys);
      table.hidden = false;
    }

    if (!lastId) {
      prependRow(doc);
      lastId = doc._id;
      setOnline(true, 'Live');
      return;
    }

    if (doc._id !== lastId) {
      prependRow(doc);
      lastId = doc._id;
    }
    setOnline(true, 'Live');
  } catch (e) {
    console.error(e);
    setOnline(false);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(tick, POLL_MS);
}

// Start
tick();
startPolling();