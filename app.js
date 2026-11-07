// ================= Helpers =================
const $ = (id) => document.getElementById(id);

// text/plain avoids a CORS preflight, which Google Apps Script does not support.
async function api(payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function showMsg(el, text, type = 'error') {
  el.textContent = text;
  el.className = 'msg ' + type;
}
function hideMsg(el) { el.className = 'msg hidden'; }

async function busy(btn, text, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = text;
  try { return await fn(); }
  catch (err) { return { ok: false, error: 'Network error. Please try again.' }; }
  finally { btn.disabled = false; btn.textContent = old; }
}

// Login token (kept until the browser tab is closed)
let memToken = '';
function getToken() {
  try { return sessionStorage.getItem('dayoff_token') || memToken; } catch (e) { return memToken; }
}
function setToken(t) {
  memToken = t || '';
  try {
    if (t) sessionStorage.setItem('dayoff_token', t);
    else sessionStorage.removeItem('dayoff_token');
  } catch (e) { /* storage not available */ }
}

const STATUS_UI = {
  Pending:  { cls: 'pending',  text: '⏳ Pending' },
  Approved: { cls: 'approved', text: '✅ Approved' },
  Refused:  { cls: 'refused',  text: '❌ Not approved' },
};

function badge(status) {
  const s = STATUS_UI[status] || { cls: '', text: status };
  const b = document.createElement('span');
  b.className = 'badge ' + s.cls;
  b.textContent = s.text;
  return b;
}

// ================= Views =================
function showLogin(message) {
  $('view-profile').classList.add('hidden');
  $('view-login').classList.remove('hidden');
  $('step-id').classList.remove('hidden');
  $('step-password').classList.add('hidden');
  ['password', 'new-password', 'new-password2'].forEach((id) => { $(id).value = ''; });
  if (message) showMsg($('login-msg'), message);
  else hideMsg($('login-msg'));
}

function showProfile() {
  $('view-login').classList.add('hidden');
  $('view-profile').classList.remove('hidden');
}

// ================= Login =================
let loginState = null; // { warehouse, employeeId }

async function loadWarehouses() {
  const select = $('warehouse');
  if (!API_URL || API_URL.includes('PASTE_')) {
    select.innerHTML = '<option value="">Not configured</option>';
    showMsg($('login-msg'), 'Setup missing: paste your Web App URL into config.js.');
    return;
  }
  try {
    const data = await (await fetch(API_URL)).json();
    select.innerHTML = '<option value="">— Select Warehouse —</option>';
    data.warehouses.forEach((w) => {
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = w;
      select.appendChild(opt);
    });
    select.disabled = false;
  } catch (err) {
    select.innerHTML = '<option value="">Could not load</option>';
    showMsg($('login-msg'), 'Could not reach the server. Please try again later.');
  }
}

$('btn-continue').addEventListener('click', async () => {
  const msg = $('login-msg');
  hideMsg(msg);
  const warehouse = $('warehouse').value;
  const employeeId = $('employeeId').value.trim();
  if (!warehouse) return showMsg(msg, 'Please select a warehouse.');
  if (!employeeId) return showMsg(msg, 'Please enter your employee ID.');

  const data = await busy($('btn-continue'), 'Checking…', () => api({ action: 'checkId', warehouse, employeeId }));
  if (!data.ok) return showMsg(msg, data.error);

  loginState = { warehouse, employeeId: data.employeeId };
  $('login-name').textContent = data.name;
  $('login-id').textContent = data.employeeId;
  $('step-id').classList.add('hidden');
  $('step-password').classList.remove('hidden');
  showPasswordMode(data.hasPassword);
});

function showPasswordMode(hasPassword) {
   ['password', 'new-password', 'new-password2'].forEach((id) => { if ($(id)) $(id).value = ''; });
  if ($('pw-hint')) $('pw-hint').classList.add('hidden');
  $('pw-login').classList.toggle('hidden', !hasPassword);
  $('pw-create').classList.toggle('hidden', hasPassword);
  setTimeout(() => $(hasPassword ? 'password' : 'new-password').focus(), 0);
}

$('btn-login').addEventListener('click', async () => {
  const msg = $('login-msg');
  hideMsg(msg);
  const password = $('password').value;
  if (!password) return showMsg(msg, 'Please enter your password.');

  const data = await busy($('btn-login'), 'Logging in…', () => api({ action: 'login', ...loginState, password }));
   if (!data.ok) {
    if (data.needsSetup) showPasswordMode(false);
        else if ($('pw-hint')) $('pw-hint').classList.remove('hidden');
    return showMsg(msg, data.error);
  }
  setToken(data.token);
  loadProfile();
});

$('btn-create').addEventListener('click', async () => {
  const msg = $('login-msg');
  hideMsg(msg);
  const p1 = $('new-password').value;
  const p2 = $('new-password2').value;
  if (p1.length < 6) return showMsg(msg, 'Password must be at least 6 characters.');
  if (p1 !== p2) return showMsg(msg, 'The two passwords do not match.');

  const data = await busy($('btn-create'), 'Saving…', () => api({ action: 'setPassword', ...loginState, password: p1 }));
  if (!data.ok) return showMsg(msg, data.error);
  setToken(data.token);
  loadProfile();
});

$('btn-change-id').addEventListener('click', () => {
  loginState = null;
  $('employeeId').value = '';
  showLogin();
});

$('employeeId').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-continue').click(); });
$('password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-login').click(); });
$('new-password2').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-create').click(); });

// ================= Profile =================
let profile = null;

async function loadProfile(flash) {
  let data;
  try {
    data = await api({ action: 'profile', token: getToken() });
  } catch (err) {
    return showLogin('Could not reach the server. Please try again.');
  }
  if (!data.ok) {
    setToken('');
    return showLogin(data.error);
  }
  profile = data;
  renderProfile(data);
  showProfile();
  if (flash) showMsg($('req-msg'), flash, 'success');
}

function renderProfile(data) {
  $('p-name').textContent = data.name;
  $('p-meta').textContent = `ID ${data.employeeId} · ${data.warehouse}`;

  // --- Next shift ---
  const t = data.tomorrow;
  const next = data.nextShift;
  const box = $('t-shift');
  const note = $('t-note');
  note.classList.add('hidden');
  if (next) {
    $('t-date').textContent = next.label;
    box.className = 'shift-box';
    box.textContent = next.shift;
  } else {
    $('t-date').textContent = '';
    box.className = 'shift-box empty';
    box.textContent = 'No shift entered yet. Please check again later.';
  }
  if (t.dayOffStatus === 'Approved') {
    note.textContent = `Tomorrow (${t.label}) is your approved day off.`;
    note.classList.remove('hidden');
  } else if (t.dayOffStatus === 'Pending') {
    note.textContent = 'Your day-off request for tomorrow is still pending.';
    note.classList.remove('hidden');
  } else if (t.dayOffStatus === 'Refused') {
    note.textContent = 'Your day off for tomorrow was not approved – you may have a shift.';
    note.classList.remove('hidden');
  }

  // --- My requests ---
  const list = $('my-requests');
  list.innerHTML = '';
  if (data.requests.length === 0) {
    const p = document.createElement('p');
    p.className = 'sub';
    p.textContent = 'No upcoming requests.';
    list.appendChild(p);
  }
  data.requests.forEach((r) => {
    const row = document.createElement('div');
    row.className = 'req';
    const left = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = r.label;
    const reason = document.createElement('small');
    reason.textContent = r.reason;
    left.append(title, reason);
    if (r.status === 'Refused') {
      const n = document.createElement('div');
      n.className = 'note';
      n.textContent = 'Not approved – you may have a shift on this day.';
      left.appendChild(n);
    }
    row.append(left, badge(r.status));
    list.appendChild(row);
  });

  // --- Request form for next week ---
  const byDate = {};
  data.requests.forEach((r) => { byDate[r.date] = r; });

  $('week-range').textContent =
    `${data.week[0].label} – ${data.week[6].label}. Max ${data.maxDays} day(s) per week.`;

  const days = $('days');
  days.innerHTML = '';
  let pendingReason = '';
  data.week.forEach((d) => {
    const r = byDate[d.date];
    const label = document.createElement('label');
    label.className = 'day';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = d.date;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(d.label));

    if (r) {
      label.appendChild(badge(r.status));
      if (r.status === 'Pending') {
        cb.checked = true;
        if (!pendingReason) pendingReason = r.reason;
      } else {
        cb.checked = r.status === 'Approved';
        cb.disabled = true;
        cb.dataset.locked = r.status;
        label.classList.add('locked');
      }
    }
    cb.addEventListener('change', updateDayLimits);
    days.appendChild(label);
  });

  $('reason').value = pendingReason;
  const hasPending = data.week.some((d) => byDate[d.date] && byDate[d.date].status === 'Pending');
  $('btn-submit').textContent = hasPending ? 'Update request' : 'Send request';
  hideMsg($('req-msg'));
  updateDayLimits();
}

function updateDayLimits() {
  const boxes = [...document.querySelectorAll('#days input')];
  const approved = boxes.filter((b) => b.dataset.locked === 'Approved').length;
  const chosen = boxes.filter((b) => !b.dataset.locked && b.checked).length;
  const count = approved + chosen;
  boxes.forEach((b) => {
    if (b.dataset.locked) return;
    const atLimit = count >= profile.maxDays && !b.checked;
    b.disabled = atLimit;
    b.parentElement.classList.toggle('checked', b.checked);
    b.parentElement.classList.toggle('disabled', atLimit);
  });
  $('counter').textContent = `${count} of ${profile.maxDays} day(s) used` +
    (approved ? ` (${approved} already approved)` : '');
}

$('btn-submit').addEventListener('click', async () => {
  const msg = $('req-msg');
  hideMsg(msg);
  const days = [...document.querySelectorAll('#days input')]
    .filter((b) => !b.dataset.locked && b.checked)
    .map((b) => b.value);
  const reason = $('reason').value.trim();
  const hasPending = profile.requests.some((r) => r.status === 'Pending' &&
    profile.week.some((d) => d.date === r.date));

  if (days.length === 0 && !hasPending) return showMsg(msg, 'Please select at least one day.');
  if (days.length > 0 && !reason) return showMsg(msg, 'Please enter a reason.');

  const data = await busy($('btn-submit'), 'Sending…', () =>
    api({ action: 'submitRequest', token: getToken(), days, reason }));
  if (!data.ok) {
    if (data.loggedOut) { setToken(''); return showLogin(data.error); }
    return showMsg(msg, data.error);
  }
  loadProfile(data.message);
});

$('btn-logout').addEventListener('click', async () => {
  const token = getToken();
  setToken('');
  profile = null;
  showLogin();
  try { await api({ action: 'logout', token }); } catch (e) { /* ignore */ }
});

// ================= Start =================
loadWarehouses();
if (getToken()) loadProfile();
