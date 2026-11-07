// ================= Helpers =================
const $ = (id) => document.getElementById(id);

async function api(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

let memToken = '';
function getToken() {
  try { return sessionStorage.getItem('dayoff_admin') || memToken; } catch (e) { return memToken; }
}
function setToken(t) {
  memToken = t || '';
  try {
    if (t) sessionStorage.setItem('dayoff_admin', t);
    else sessionStorage.removeItem('dayoff_admin');
  } catch (e) { /* storage not available */ }
}

// Call an admin action; handles expired login and errors in one place.
async function adminCall(action, payload = {}) {
  let data;
  try {
    data = await api({ action, token: getToken(), ...payload });
  } catch (err) {
    flash('Network error. Please try again.');
    return null;
  }
  if (!data.ok) {
    if (data.loggedOut) { logoutLocal(data.error); return null; }
    flash(data.error);
    return null;
  }
  return data;
}

let flashTimer = null;
function flash(text, type = 'error') {
  const el = $('panel-msg');
  el.textContent = text;
  el.className = 'msg ' + type;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.className = 'msg hidden'; }, 5000);
}

function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'dataset') Object.assign(e.dataset, v);
    else e[k] = v;
  });
  children.forEach((c) => e.append(c));
  return e;
}

function fillSelect(select, items, allLabel) {
  const prev = select.value;
  select.innerHTML = '';
  if (allLabel !== undefined) select.append(el('option', { value: '', textContent: allLabel }));
  items.forEach((it) => {
    const [value, text] = Array.isArray(it) ? it : [it, it];
    select.append(el('option', { value, textContent: text }));
  });
  if ([...select.options].some((o) => o.value === prev)) select.value = prev;
}

const STATUS_CLS = { Pending: 'pending', Approved: 'approved', Refused: 'refused' };
const badge = (s) => el('span', { className: 'badge ' + (STATUS_CLS[s] || ''), textContent: s || '—' });

// ================= Login =================
$('btn-login').addEventListener('click', async () => {
  const msg = $('login-msg');
  msg.className = 'msg hidden';
  const password = $('password').value;
  if (!password) { msg.textContent = 'Enter the password.'; msg.className = 'msg error'; return; }

  const btn = $('btn-login');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const data = await api({ action: 'adminLogin', password });
    if (!data.ok) { msg.textContent = data.error; msg.className = 'msg error'; return; }
    setToken(data.token);
    $('password').value = '';
    await openPanel();
  } catch (err) {
    msg.textContent = 'Network error. Please try again.';
    msg.className = 'msg error';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
});
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-login').click(); });

function logoutLocal(message) {
  setToken('');
  $('panel').classList.add('hidden');
  $('login-wrap').classList.remove('hidden');
  const msg = $('login-msg');
  if (message) { msg.textContent = message; msg.className = 'msg error'; }
  else msg.className = 'msg hidden';
}
$('btn-logout').addEventListener('click', () => {
  api({ action: 'logout', token: getToken() }).catch(() => {});
  logoutLocal();
});

async function openPanel() {
  const ok = await loadData();
  if (!ok) return;
  $('login-wrap').classList.add('hidden');
  $('panel').classList.remove('hidden');
}

// ================= Tabs =================
document.querySelectorAll('.tabs [data-tab]').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs [data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    ['requests', 'shifts', 'employees'].forEach((t) => $('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
    if (b.dataset.tab === 'shifts' && $('s-wh').value) loadShifts();
  });
});

// ================= Data =================
let D = null; // { requests, employees, warehouses, statuses, shiftPresets, tomorrow }

async function loadData() {
  const data = await adminCall('adminData');
  if (!data) return false;
  D = data;

  // Request filters
  const weeks = [...new Set(D.requests.map((r) => r.weekStart))].sort().reverse();
  const fWeek = $('f-week');
  const firstLoad = fWeek.options.length === 0;
  fillSelect(fWeek, weeks, 'All weeks');
  if (firstLoad) {
    // default: the upcoming week, else newest
    const upcoming = weeks.filter((w) => w >= mondayOf(D.tomorrow)).sort()[0];
    fWeek.value = upcoming || weeks[0] || '';
  }
  fillSelect($('f-wh'), D.warehouses, 'All warehouses');
  fillSelect($('f-status'), D.statuses, 'All statuses');

  // Default warehouse = first one that has employees
  const withPeople = D.warehouses.find((w) => D.employees.some((e) => e.warehouse === w)) || D.warehouses[0];

  // Edit form
  fillSelect($('e-wh'), D.warehouses);
  fillSelect($('e-status'), D.statuses);
  if (firstLoad) { $('e-status').value = 'Approved'; $('e-wh').value = withPeople; }
  fillEmployeeSelect();

  // Shifts
  fillSelect($('s-wh'), D.warehouses);
  if (firstLoad) $('s-wh').value = withPeople;
  if (!$('s-date').value) $('s-date').value = D.tomorrow;
  $('shift-presets').innerHTML = '';
  D.shiftPresets.forEach((p) => $('shift-presets').append(el('option', { value: p })));
  fillSelect($('s-fill'), D.shiftPresets);

  // Employees
  fillSelect($('u-wh'), D.warehouses, 'All warehouses');

  renderRequests();
  renderEmployees();
  return true;
}

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// ================= Requests tab =================
function filteredRequests() {
  const w = $('f-week').value, wh = $('f-wh').value, st = $('f-status').value;
  return D.requests.filter((r) => (!w || r.weekStart === w) && (!wh || r.warehouse === wh) && (!st || r.status === st));
}

function renderRequests() {
  const rows = filteredRequests();
  const tbody = $('rows');
  tbody.innerHTML = '';
  rows.forEach((r) => {
    const actions = el('div', { className: 'actions' });
    if (r.status !== 'Approved') actions.append(el('button', { className: 'sm ok', textContent: 'Approve', dataset: { act: 'approve', id: r.id } }));
    if (r.status !== 'Refused') actions.append(el('button', { className: 'sm danger', textContent: 'Refuse', dataset: { act: 'refuse', id: r.id } }));
    actions.append(el('button', { className: 'sm secondary', textContent: 'Edit', dataset: { act: 'edit', id: r.id } }));
    actions.append(el('button', { className: 'sm secondary', textContent: 'Delete', dataset: { act: 'delete', id: r.id } }));

    tbody.append(el('tr', {}, [
      el('td', {}, [el('input', { type: 'checkbox', className: 'sel', dataset: { id: r.id } })]),
      el('td', { textContent: r.label }),
      el('td', { textContent: r.warehouse }),
      el('td', { textContent: r.employeeId }),
      el('td', { textContent: r.name }),
      el('td', { className: 'reason', textContent: r.reason }),
      el('td', {}, [badge(r.status)]),
      el('td', {}, [actions]),
    ]));
  });
  const pending = rows.filter((r) => r.status === 'Pending').length;
  $('count').textContent = `${rows.length} day(s) shown · ${pending} pending`;
  $('sel-all').checked = false;
  updateSelCount();
}

function selectedIds() {
  return [...document.querySelectorAll('#rows .sel:checked')].map((c) => c.dataset.id);
}
function updateSelCount() { $('sel-count').textContent = `${selectedIds().length} selected`; }

$('sel-all').addEventListener('change', (e) => {
  document.querySelectorAll('#rows .sel').forEach((c) => { c.checked = e.target.checked; });
  updateSelCount();
});
$('rows').addEventListener('change', (e) => { if (e.target.classList.contains('sel')) updateSelCount(); });

$('rows').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  const act = b.dataset.act;
  if (act === 'approve' || act === 'refuse') {
    b.disabled = true;
    await decide([id], act === 'approve' ? 'Approved' : 'Refused');
  } else if (act === 'edit') {
    startEdit(D.requests.find((r) => r.id === id));
  } else if (act === 'delete') {
    const r = D.requests.find((x) => x.id === id);
    if (!confirm(`Delete the day off of ${r.name} on ${r.label}?`)) return;
    if (await adminCall('adminDeleteDay', { id })) { flash('Deleted.', 'success'); await loadData(); }
  }
});

async function decide(ids, status) {
  if (!ids.length) return flash('Select at least one row first.');
  const data = await adminCall('adminDecide', { ids, status });
  if (data) {
    flash(`${data.count} day(s) set to ${status}.`, 'success');
    await loadData();
  }
}
$('btn-bulk-approve').addEventListener('click', () => decide(selectedIds(), 'Approved'));
$('btn-bulk-refuse').addEventListener('click', () => decide(selectedIds(), 'Refused'));

['f-week', 'f-wh', 'f-status'].forEach((id) => $(id).addEventListener('change', renderRequests));
$('btn-refresh').addEventListener('click', async () => { if (await loadData()) flash('Updated.', 'success'); });

$('btn-excel').addEventListener('click', () => {
  const rows = filteredRequests().map((r) => ({
    'Date': r.date, 'Day': r.label.split(',')[0], 'Week Start': r.weekStart, 'Warehouse': r.warehouse,
    'Employee ID': r.employeeId, 'Name': r.name, 'Reason': r.reason, 'Status': r.status,
    'Submitted At': r.submittedAt, 'Decided At': r.decidedAt, 'Changed By': r.changedBy,
  }));
  if (!rows.length) return flash('Nothing to export.');
  const name = `dayoff_${$('f-week').value || 'all-weeks'}_${($('f-wh').value || 'all').replace(/[^a-z0-9]+/gi, '-')}.xlsx`;
  writeExcel(rows, 'Day-Off', name, [12, 11, 12, 16, 11, 30, 36, 10, 20, 20, 11]);
});

function writeExcel(rows, sheetName, fileName, widths) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = widths.map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

// ---------- Add / edit a day off ----------
let editingId = '';

function fillEmployeeSelect() {
  const wh = $('e-wh').value;
  const list = D.employees.filter((e) => e.warehouse === wh).map((e) => [e.employeeId, `${e.employeeId} – ${e.name}`]);
  if (list.length) fillSelect($('e-emp'), list);
  else fillSelect($('e-emp'), [], 'No employees in this warehouse');
}
$('e-wh').addEventListener('change', fillEmployeeSelect);

function startEdit(r) {
  editingId = r.id;
  $('e-wh').value = r.warehouse;
  fillEmployeeSelect();
  $('e-emp').value = r.employeeId;
  $('e-date').value = r.date;
  $('e-status').value = r.status;
  $('e-reason').value = r.reason;
  $('edit-title').textContent = `Edit day off – ${r.name}`;
  $('edit-sub').textContent = `Currently: ${r.label} (${r.status}). Change the date, status or reason and click Save.`;
  $('btn-cancel-edit').classList.remove('hidden');
  $('edit-card').scrollIntoView({ behavior: 'smooth' });
}

function resetEdit() {
  editingId = '';
  $('e-date').value = '';
  $('e-reason').value = '';
  $('e-status').value = 'Approved';
  $('edit-title').textContent = 'Add a day off for an employee';
  $('edit-sub').textContent = 'Use this to add a day off yourself, or click “Edit” in the table to change one.';
  $('btn-cancel-edit').classList.add('hidden');
}
$('btn-cancel-edit').addEventListener('click', resetEdit);

$('btn-save-day').addEventListener('click', async () => {
  const payload = {
    warehouse: $('e-wh').value,
    employeeId: $('e-emp').value,
    date: $('e-date').value,
    status: $('e-status').value,
    reason: $('e-reason').value.trim(),
    replaceId: editingId,
  };
  if (!payload.employeeId) return flash('Please choose an employee.');
  if (!payload.date) return flash('Please choose a date.');
  const btn = $('btn-save-day');
  btn.disabled = true;
  const data = await adminCall('adminSaveDay', payload);
  btn.disabled = false;
  if (data) {
    flash(editingId ? 'Day off updated.' : 'Day off added.', 'success');
    resetEdit();
    await loadData();
  }
});

// ================= Shifts tab =================
async function loadShifts() {
  const warehouse = $('s-wh').value;
  const date = $('s-date').value;
  if (!warehouse || !date) return flash('Choose a warehouse and a date.');
  const data = await adminCall('adminShifts', { warehouse, date });
  if (!data) return;

  $('s-title').textContent = `${warehouse} · ${data.label}`;
  const tbody = $('s-rows');
  tbody.innerHTML = '';
  data.rows.forEach((r) => {
    const input = el('input', {
      type: 'text', className: 'shift-in', value: r.shift, placeholder: 'e.g. 06:00–14:30',
      dataset: { id: r.employeeId, orig: r.shift },
    });
    input.setAttribute('list', 'shift-presets');
    tbody.append(el('tr', { className: r.dayOffStatus === 'Approved' ? 'row-off' : '' }, [
      el('td', { textContent: r.employeeId }),
      el('td', { textContent: r.name }),
      el('td', {}, [r.dayOffStatus ? badge(r.dayOffStatus) : '']),
      el('td', {}, [input]),
    ]));
  });
}
$('btn-load-shifts').addEventListener('click', loadShifts);
$('s-wh').addEventListener('change', loadShifts);
$('s-date').addEventListener('change', loadShifts);

$('btn-fill').addEventListener('click', () => {
  const v = $('s-fill').value;
  document.querySelectorAll('#s-rows .shift-in').forEach((i) => {
    if (i.value.trim()) return;
    const offApproved = i.closest('tr').classList.contains('row-off');
    i.value = offApproved ? 'Off' : v;
  });
});

$('btn-save-shifts').addEventListener('click', async () => {
  const inputs = [...document.querySelectorAll('#s-rows .shift-in')];
  if (!inputs.length) return flash('Load a warehouse and date first.');
  const entries = inputs
    .filter((i) => i.value.trim() !== i.dataset.orig)
    .map((i) => ({ employeeId: i.dataset.id, shift: i.value.trim() }));
  if (!entries.length) return flash('No changes to save.', 'success');

  const btn = $('btn-save-shifts');
  btn.disabled = true;
  const data = await adminCall('adminSaveShifts', { warehouse: $('s-wh').value, date: $('s-date').value, entries });
  btn.disabled = false;
  if (data) {
    flash(`Saved ${data.saved} shift(s)` + (data.removed ? `, removed ${data.removed}` : '') + '.', 'success');
    loadShifts();
  }
});

$('btn-shift-excel').addEventListener('click', async () => {
  const date = $('s-date').value;
  if (!date) return flash('Choose a date.');
  const data = await adminCall('adminExportShifts', { date, warehouse: $('s-wh').value });
  if (!data) return;
  if (!data.rows.length) return flash('No shifts entered for this week.');
  const rows = data.rows.map((r) => ({
    'Date': r.date, 'Day': r.weekday, 'Warehouse': r.warehouse, 'Employee ID': r.employeeId, 'Name': r.name, 'Shift': r.shift,
  }));
  writeExcel(rows, 'Shifts', `shifts_week_${data.weekStart}.xlsx`, [12, 11, 16, 11, 30, 16]);
});

// ================= Employees tab =================
function renderEmployees() {
  const wh = $('u-wh').value;
  const q = $('u-search').value.trim().toLowerCase();
  const list = D.employees.filter((e) => (!wh || e.warehouse === wh) &&
    (!q || e.name.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q)));
  const tbody = $('u-rows');
  tbody.innerHTML = '';
  list.forEach((e) => {
    const action = e.hasPassword
      ? el('button', { className: 'sm secondary', textContent: 'Reset password', dataset: { wh: e.warehouse, id: e.employeeId, name: e.name } })
      : el('span', { className: 'sub', textContent: '—' });
    tbody.append(el('tr', {}, [
      el('td', { textContent: e.warehouse }),
      el('td', { textContent: e.employeeId }),
      el('td', { textContent: e.name }),
      el('td', {}, [el('span', {
        className: 'badge ' + (e.hasPassword ? 'approved' : 'pending'),
        textContent: e.hasPassword ? 'Password set' : 'Not registered yet',
      })]),
      el('td', {}, [action]),
    ]));
  });
  const registered = list.filter((e) => e.hasPassword).length;
  $('u-count').textContent = `${list.length} employee(s) · ${registered} registered`;
}
$('u-wh').addEventListener('change', renderEmployees);
$('u-search').addEventListener('input', renderEmployees);

$('u-rows').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  if (!confirm(`Reset the password of ${b.dataset.name} (${b.dataset.id})?\nThey will create a new one at their next login.`)) return;
  const data = await adminCall('adminResetPassword', { warehouse: b.dataset.wh, employeeId: b.dataset.id });
  if (data) {
    flash(`Password of ${b.dataset.name} was reset.`, 'success');
    await loadData();
  }
});

// ================= Start =================
if (!API_URL || API_URL.includes('PASTE_')) {
  $('login-msg').textContent = 'Setup missing: paste your Web App URL into config.js.';
  $('login-msg').className = 'msg error';
} else if (getToken()) {
  openPanel();
}
