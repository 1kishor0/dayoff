// ---------- Helpers ----------
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

function showStep(id) {
  ['step-login', 'step-poll', 'step-done'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
}

// ---------- State ----------
let session = null; // { warehouse, employeeId, week, maxDays }

// ---------- Step 1: load warehouses ----------
async function loadWarehouses() {
  const select = $('warehouse');
  if (!API_URL || API_URL.includes('PASTE_')) {
    select.innerHTML = '<option value="">Not configured</option>';
    showMsg($('login-msg'), 'Setup missing: paste your Web App URL into config.js.');
    return;
  }
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
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
  const warehouse = $('warehouse').value;
  const employeeId = $('employeeId').value.trim();
  const msg = $('login-msg');
  hideMsg(msg);

  if (!warehouse) return showMsg(msg, 'Please select a warehouse.');
  if (!employeeId) return showMsg(msg, 'Please enter your employee ID.');

  const btn = $('btn-continue');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const data = await api({ action: 'verify', warehouse, employeeId });
    if (!data.ok) return showMsg(msg, data.error);
    session = data;
    renderPoll(data);
    showStep('step-poll');
  } catch (err) {
    showMsg(msg, 'Network error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Continue';
  }
});

$('employeeId').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-continue').click();
});

// ---------- Step 2: weekly poll ----------
function renderPoll(data) {
  $('info-id').textContent = data.employeeId;
  $('info-wh').textContent = data.warehouse;
  $('week-range').textContent =
    `Week: ${data.week[0].label} – ${data.week[6].label}. Pick up to ${data.maxDays} day(s).`;

  const selected = data.existing ? data.existing.days : [];
  const box = $('days');
  box.innerHTML = '';
  data.week.forEach((d) => {
    const label = document.createElement('label');
    label.className = 'day';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = d.date;
    cb.checked = selected.includes(d.date);
    cb.addEventListener('change', updateDayLimits);
    label.appendChild(cb);
    label.appendChild(document.createTextNode(d.label));
    box.appendChild(label);
  });

  $('reason').value = data.existing ? data.existing.reason : '';
  $('btn-submit').textContent = data.existing ? 'Update my selection' : 'Submit';
  hideMsg($('poll-msg'));
  if (data.existing) {
    showMsg($('poll-msg'), 'You already submitted for this week. You can change it below.', 'success');
  }
  updateDayLimits();
}

function updateDayLimits() {
  const boxes = [...document.querySelectorAll('#days input')];
  const count = boxes.filter((b) => b.checked).length;
  boxes.forEach((b) => {
    const atLimit = count >= session.maxDays && !b.checked;
    b.disabled = atLimit;
    b.parentElement.classList.toggle('checked', b.checked);
    b.parentElement.classList.toggle('disabled', atLimit);
  });
  $('counter').textContent = `${count} of ${session.maxDays} selected`;
}

$('btn-submit').addEventListener('click', async () => {
  const msg = $('poll-msg');
  hideMsg(msg);
  const days = [...document.querySelectorAll('#days input:checked')].map((b) => b.value);
  const reason = $('reason').value.trim();

  if (days.length === 0) return showMsg(msg, 'Please select at least one day.');
  if (!reason) return showMsg(msg, 'Please enter a reason.');

  const btn = $('btn-submit');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    const data = await api({
      action: 'submit',
      warehouse: session.warehouse,
      employeeId: session.employeeId,
      days,
      reason,
    });
    if (!data.ok) return showMsg(msg, data.error);
    $('done-msg').textContent =
      `${data.updated ? 'Updated' : 'Saved'}: ${session.employeeId} (${session.warehouse}) is off on ${data.weekdays}.`;
    showStep('step-done');
  } catch (err) {
    showMsg(msg, 'Network error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
});

$('btn-back').addEventListener('click', () => showStep('step-login'));

// ---------- Step 3 ----------
$('btn-again').addEventListener('click', () => {
  session = null;
  $('employeeId').value = '';
  $('reason').value = '';
  showStep('step-login');
});

loadWarehouses();
