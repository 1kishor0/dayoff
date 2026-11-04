const $ = (id) => document.getElementById(id);

let password = '';
let allRows = [];

async function api(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function showMsg(el, text) {
  el.textContent = text;
  el.className = 'msg error';
}

async function loadData() {
  const data = await api({ action: 'admin', password });
  if (!data.ok) throw new Error(data.error);
  allRows = data.rows;

  // Week filter (newest first)
  const weeks = [...new Set(allRows.map((r) => r.weekStart))].sort().reverse();
  const fWeek = $('f-week');
  const prevWeek = fWeek.value;
  fWeek.innerHTML = '<option value="">All weeks</option>' +
    weeks.map((w) => `<option value="${w}">${w}</option>`).join('');
  fWeek.value = weeks.includes(prevWeek) ? prevWeek : (weeks[0] || '');

  // Warehouse filter
  const fWh = $('f-wh');
  const prevWh = fWh.value;
  fWh.innerHTML = '<option value="">All warehouses</option>';
  data.warehouses.forEach((w) => {
    const o = document.createElement('option');
    o.value = w; o.textContent = w;
    fWh.appendChild(o);
  });
  fWh.value = prevWh;

  render();
}

function filteredRows() {
  const week = $('f-week').value;
  const wh = $('f-wh').value;
  return allRows.filter((r) => (!week || r.weekStart === week) && (!wh || r.warehouse === wh));
}

function render() {
  const rows = filteredRows();
  const tbody = $('rows');
  tbody.innerHTML = '';
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    [r.submittedAt, r.weekStart, r.warehouse, r.employeeId, r.daysOff, r.weekdays, r.reason]
      .forEach((val, i) => {
        const td = document.createElement('td');
        td.textContent = val; // textContent prevents HTML injection
        if (i === 6) td.className = 'reason';
        tr.appendChild(td);
      });
    tbody.appendChild(tr);
  });
  $('count').textContent = `${rows.length} submission(s)`;
}

function downloadExcel() {
  const rows = filteredRows().map((r) => ({
    'Submitted At': r.submittedAt,
    'Week Start': r.weekStart,
    'Warehouse': r.warehouse,
    'Employee ID': r.employeeId,
    'Days Off': r.daysOff,
    'Weekdays': r.weekdays,
    'Reason': r.reason,
  }));
  if (rows.length === 0) return alert('Nothing to export.');

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 24 }, { wch: 14 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Day-Off');

  const week = $('f-week').value || 'all-weeks';
  const wh = ($('f-wh').value || 'all-warehouses').replace(/[^a-z0-9]+/gi, '-');
  XLSX.writeFile(wb, `dayoff_${week}_${wh}.xlsx`);
}

$('btn-login').addEventListener('click', async () => {
  const msg = $('login-msg');
  msg.className = 'msg hidden';
  password = $('password').value;
  if (!password) return showMsg(msg, 'Enter the password.');

  const btn = $('btn-login');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    await loadData();
    $('login-wrap').classList.add('hidden');
    $('panel').classList.remove('hidden');
  } catch (err) {
    showMsg(msg, err.message || 'Could not log in.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
});

$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-login').click(); });
$('f-week').addEventListener('change', render);
$('f-wh').addEventListener('change', render);
$('btn-excel').addEventListener('click', downloadExcel);
$('btn-refresh').addEventListener('click', async () => {
  try { await loadData(); } catch (err) { alert(err.message); }
});
