// ============================================================
// FMCK NOMINAL ROLL MANAGEMENT SYSTEM — app.js
// Frontend PWA Logic
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbxTi43Z2hGep8bHO4KDG3YQQNZxACz9-YwcNVD4VNg1T0jYDC2M2ne081E-mII6ygSg/exec'; // ← paste deployed GAS URL

// ─── State ───────────────────────────────────────────────────
let currentUser       = null;
let currentStaffData  = [];
let filteredStaffData = [];
let currentPostingsData   = [];
let filteredPostingsData  = [];
let currentLocumsData     = [];
let filteredLocumsData    = [];
let currentUsersData      = [];
let pendingFilter = null;
let nrPage = 1, ptPage = 1, lcPage = 1, auditPage = 1;
const PAGE_SIZE = 30;

// ─── Report columns definition ───────────────────────────────
const REPORT_COLUMNS = [
  { key: 'FolderNumber',        label: 'Folder No.' },
  { key: 'IPPISNo',             label: 'IPPIS No.' },
  { key: 'Surname',             label: 'Surname' },
  { key: 'FirstName',           label: 'First Name' },
  { key: 'OtherName',           label: 'Other Name' },
  { key: 'Gender',              label: 'Gender' },
  { key: 'DateOfBirth',         label: 'Date of Birth' },
  { key: 'StateOfOrigin',       label: 'State of Origin' },
  { key: 'LGA',                 label: 'LGA' },
  { key: 'GeopoliticalZone',    label: 'Geopolitical Zone' },
  { key: 'Qualification',       label: 'Qualification' },
  { key: 'PreviousSalaryGrade', label: 'Previous Salary Grade' },
  { key: 'AbsorbedSalaryGrade', label: 'Absorbed Salary Grade' },
  { key: 'Rank',                label: 'Rank / Cadre' },
  { key: 'Department',          label: 'Department' },
  { key: 'Unit',                label: 'Unit' },
  { key: 'DateOfFirstAppt',     label: '1st Appointment' },
  { key: 'DateOfConfirmation',  label: 'Date of Confirmation' },
  { key: 'DateOfPresentAppt',   label: 'Present Appointment' },
  { key: 'Phone',               label: 'Phone' },
  { key: 'Email',               label: 'Email' },
  { key: 'Location',            label: 'Location' },
  { key: 'Status',              label: 'Status' },
  { key: 'Remarks',             label: 'Remarks' },
];

// Default columns selected for Full Nominal Roll print
const DEFAULT_SELECTED_COLUMNS = [
  'FolderNumber','IPPISNo','Surname','FirstName','OtherName','Gender',
  'Rank','AbsorbedSalaryGrade','Department','DateOfFirstAppt','Phone','Status'
];

// ─── API wrapper ─────────────────────────────────────────────
async function apiCall(action, payload = {}) {
  const body = JSON.stringify({ action, ...payload });
  const res  = await fetch(API_URL, {
    method: 'POST', body,
    headers: { 'Content-Type': 'text/plain' }, // avoids CORS preflight
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Utilities ───────────────────────────────────────────────
function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // Return as-is if not parseable
  return d.toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' });
}

function fmtNum(n) {
  return (n || '').toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
}

function setFeedback(elId, msg, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.className   = `feedback-msg ${isError ? 'error' : 'success'}`;
}

function getStatusBadge(status) {
  const map = {
    'Active'             : 'badge-active',
    'On External Posting': 'badge-ext',
    'Retired'            : 'badge-ret',
    'Transferred'        : 'badge-ret',
    'Deceased'           : 'badge-danger',
    'Suspended'          : 'badge-warn',
    'Expired'            : 'badge-danger',
    'Absorbed'           : 'badge-active',
    'Migrated'           : 'badge-int',
    'Terminated'         : 'badge-danger',
    'Completed'          : 'badge-ret',
    'Recalled'           : 'badge-warn',
    'Cancelled'          : 'badge-danger',
    'Internal'           : 'badge-int',
    'External'           : 'badge-ext',
    'Fixed'              : 'badge-fixed',
    'Open'               : 'badge-open',
  };
  return `<span class="badge ${map[status] || 'badge-ret'}">${escapeHtml(status)}</span>`;
}

function paginate(data, page) {
  const total = data.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p     = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * PAGE_SIZE;
  return { items: data.slice(start, start + PAGE_SIZE), total, page: p, totalPages, start };
}

function renderPagination(containerId, current, total, fn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (total <= 1) { el.innerHTML = ''; return; }
  const from = Math.max(1, current - 2), to = Math.min(total, current + 2);
  let html = '<div class="pagination">';
  if (current > 1) html += `<button onclick="${fn}(${current - 1})">‹ Prev</button>`;
  for (let p = from; p <= to; p++)
    html += `<button class="${p === current ? 'active' : ''}" onclick="${fn}(${p})">${p}</button>`;
  if (current < total) html += `<button onclick="${fn}(${current + 1})">Next ›</button>`;
  html += `<span class="page-info">Page ${current} of ${total}</span></div>`;
  el.innerHTML = html;
}

// ─── Navigation ───────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view-${tabId}`);
  if (view) view.classList.add('active');

  if (tabId === 'dashboard')    loadDashboard();
  if (tabId === 'nominal-roll') loadNominalRoll();
  if (tabId === 'postings')     loadPostings();
  if (tabId === 'locum')        loadLocums();
  if (tabId === 'reports')      initReports();
  if (tabId === 'admin')        { loadUsers(); switchSubTab('users'); }
}

function navigateTo(tabId, filter) {
  pendingFilter = filter || null;
  switchTab(tabId);
}

function switchSubTab(name) {
  document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === name));
  document.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
  const el = document.getElementById(`subtab-${name}`);
  if (el) el.classList.add('active');
  if (name === 'audit') loadAuditLogs(1);
}

// ─── Auth ─────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btn-login');
  const errEl = document.getElementById('login-error');
  btn.textContent = 'Logging in…';
  btn.disabled    = true;
  errEl.textContent = '';
  try {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value;
    const res  = await apiCall('authenticateUser', { user, pass });
    if (res.success) {
      currentUser = res.user;
      document.getElementById('user-name').textContent   = res.user.Name;
      document.getElementById('user-role').textContent   = res.user.Role;
      document.getElementById('user-avatar').textContent = (res.user.Name || 'A')[0].toUpperCase();
      const adminNav = document.getElementById('nav-admin');
      if (adminNav) adminNav.style.display = res.user.Role === 'SuperAdmin' ? '' : '';
      document.getElementById('login-screen').classList.remove('active');
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app-screen').classList.remove('hidden');
      document.getElementById('app-screen').classList.add('active');
      switchTab('dashboard');
    } else {
      errEl.textContent = res.message || 'Login failed.';
    }
  } catch (err) {
    errEl.textContent = 'Connection error. Please check API URL.';
  } finally {
    btn.textContent = 'Login';
    btn.disabled    = false;
  }
}

function handleLogout() {
  currentUser = null;
  currentStaffData = []; filteredStaffData = [];
  currentPostingsData = []; currentLocumsData = [];
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('login-screen').style.display = '';
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ─── Dashboard ────────────────────────────────────────────────
async function loadDashboard(forceRefresh = false) {
  try {
    const data = await apiCall('getDashboardMetrics');
    document.getElementById('metric-total').textContent          = data.total          ?? '—';
    document.getElementById('metric-active').textContent         = data.active         ?? '—';
    document.getElementById('metric-senior').textContent         = data.senior         ?? '—';
    document.getElementById('metric-junior').textContent         = data.junior         ?? '—';
    document.getElementById('metric-locums').textContent         = data.activeLocums   ?? '—';
    document.getElementById('metric-external').textContent       = data.onExternalPosting ?? '—';
    document.getElementById('metric-missing-folder').textContent = data.missingFolderNo ?? '—';
    document.getElementById('metric-missing-ippis').textContent  = data.missingIppis   ?? '—';
    renderCompleteness(data.completeness || {});
    renderRecentPostings(data.recentPostings || []);
    if (forceRefresh) showToast('Dashboard refreshed.', 'success');
  } catch (err) {
    showToast('Failed to load dashboard metrics.', 'error');
  }
}

function renderCompleteness(obj) {
  const container = document.getElementById('completeness-bars');
  container.innerHTML = Object.entries(obj).map(([label, pct]) => {
    const cls = pct < 50 ? 'low' : pct < 80 ? 'medium' : '';
    return `<div class="completeness-row">
      <span class="completeness-label">${escapeHtml(label)}</span>
      <div class="completeness-track"><div class="completeness-fill ${cls}" style="width:${pct}%"></div></div>
      <span class="completeness-pct">${pct}%</span>
    </div>`;
  }).join('');
}

function renderRecentPostings(list) {
  const tbody = document.getElementById('recent-postings-body');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No postings in the last 30 days.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => `<tr>
    <td class="font-medium">${escapeHtml(p.StaffName)}</td>
    <td>${escapeHtml(p.FolderNumber)}</td>
    <td>${escapeHtml(p.FromDepartment || '—')}</td>
    <td>${escapeHtml(p.ToDepartment)}</td>
    <td>${getStatusBadge(p.PostingType)}</td>
    <td>${formatDate(p.EffectiveDate)}</td>
  </tr>`).join('');
}

// ─── NOMINAL ROLL ─────────────────────────────────────────────
async function loadNominalRoll() {
  if (!currentStaffData.length) {
    document.getElementById('nr-table-body').innerHTML =
      '<tr><td colspan="8" class="text-center"><div class="spinner"></div> Loading…</td></tr>';
    try {
      const res = await apiCall('getAllStaff');
      currentStaffData = res.data || res || [];
    } catch (err) {
      showToast('Failed to load staff records.', 'error'); return;
    }
  }
  // Apply pendingFilter from dashboard tile
  if (pendingFilter) {
    const f = pendingFilter; pendingFilter = null;
    if (f.status)  { document.getElementById('nr-filter-status').value = f.status; }
    if (f.level)   { document.getElementById('nr-filter-level').value  = f.level; }
    if (f.missing) {
      // Custom filter: show only records with a missing field
      filteredStaffData = currentStaffData.filter(s => !s[f.missing]);
      document.getElementById('nr-search').value = '';
      document.getElementById('nr-filter-status').value = '';
      document.getElementById('nr-filter-level').value  = '';
      nrPage = 1;
      renderNominalRoll();
      return;
    }
  }
  filterNominalRoll();
}

function filterNominalRoll() {
  const q      = document.getElementById('nr-search').value.toLowerCase();
  const status = document.getElementById('nr-filter-status').value;
  const level  = document.getElementById('nr-filter-level').value;

  filteredStaffData = currentStaffData.filter(s => {
    const matchQ = !q || [s.Surname, s.FirstName, s.OtherName, s.FolderNumber, s.IPPISNo, s.Rank, s.Department]
      .some(f => (f || '').toLowerCase().includes(q));
    const matchStatus = !status || s.Status === status;
    const folder = (s.FolderNumber || '').toUpperCase();
    const matchLevel = !level ||
      (level === 'Senior' && folder.includes('/SP/')) ||
      (level === 'Junior' && folder.includes('/JP/'));
    return matchQ && matchStatus && matchLevel;
  });

  nrPage = 1;
  renderNominalRoll();
}

function renderNominalRoll() {
  const { items, total, page, totalPages, start } = paginate(filteredStaffData, nrPage);
  nrPage = page;
  document.getElementById('nr-count').textContent = `${total} record${total !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('nr-table-body');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No records found.</td></tr>';
    document.getElementById('nr-pagination').innerHTML = '';
    return;
  }
  tbody.innerHTML = items.map((s, i) => `<tr>
    <td class="text-muted">${start + i + 1}</td>
    <td class="font-medium">${escapeHtml(s.FolderNumber) || '<span class="text-muted">—</span>'}</td>
    <td>
      <div style="font-weight:600">${escapeHtml(s.Surname)} ${escapeHtml(s.FirstName)} ${escapeHtml(s.OtherName || '')}</div>
    </td>
    <td>${escapeHtml(s.Rank) || '—'}</td>
    <td>${escapeHtml(s.AbsorbedSalaryGrade) || '—'}</td>
    <td>${escapeHtml(s.Department) || '—'}</td>
    <td>${getStatusBadge(s.Status || 'Active')}</td>
    <td>
      <button class="btn btn-text" style="padding:4px 10px; font-size:12px;" onclick="editStaff('${s.ID}')">✏ Edit</button>
      <button class="btn btn-danger" style="padding:4px 10px; font-size:12px;" onclick="deleteStaff('${s.ID}','${escapeHtml(s.Surname)} ${escapeHtml(s.FirstName)}')">🗑</button>
    </td>
  </tr>`).join('');

  renderPagination('nr-pagination', page, totalPages, 'goNrPage');
}

function goNrPage(p) { nrPage = p; renderNominalRoll(); }

function openStaffModal(id) {
  clearStaffModal();
  document.getElementById('staff-modal-title').textContent = id ? 'Edit Staff Record' : 'Add Staff Record';
  document.getElementById('staff-modal').classList.remove('hidden');
}

function closeStaffModal() {
  document.getElementById('staff-modal').classList.add('hidden');
}

function clearStaffModal() {
  ['s-id','s-surname','s-firstname','s-othername','s-dob','s-phone','s-email',
   's-address','s-state','s-lga','s-folder','s-ippis','s-rank','s-qual',
   's-prev-grade','s-abs-grade','s-first-appt','s-confirm','s-present-appt',
   's-dept','s-unit','s-location','s-remarks'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('s-gender').value = '';
  document.getElementById('s-zone').value   = '';
  document.getElementById('s-status').value = 'Active';
  setFeedback('staff-feedback', '');
}

function editStaff(id) {
  const s = currentStaffData.find(x => x.ID === id);
  if (!s) { showToast('Record not found.', 'error'); return; }
  clearStaffModal();
  document.getElementById('staff-modal-title').textContent = 'Edit Staff Record';
  document.getElementById('s-id').value           = s.ID;
  document.getElementById('s-surname').value      = s.Surname || '';
  document.getElementById('s-firstname').value    = s.FirstName || '';
  document.getElementById('s-othername').value    = s.OtherName || '';
  document.getElementById('s-gender').value       = s.Gender || '';
  document.getElementById('s-dob').value          = s.DateOfBirth ? s.DateOfBirth.substring(0,10) : '';
  document.getElementById('s-phone').value        = s.Phone || '';
  document.getElementById('s-email').value        = s.Email || '';
  document.getElementById('s-address').value      = s.PermanentAddress || '';
  document.getElementById('s-state').value        = s.StateOfOrigin || '';
  document.getElementById('s-lga').value          = s.LGA || '';
  document.getElementById('s-zone').value         = s.GeopoliticalZone || '';
  document.getElementById('s-folder').value       = s.FolderNumber || '';
  document.getElementById('s-ippis').value        = s.IPPISNo || '';
  document.getElementById('s-rank').value         = s.Rank || '';
  document.getElementById('s-qual').value         = s.Qualification || '';
  document.getElementById('s-prev-grade').value   = s.PreviousSalaryGrade || '';
  document.getElementById('s-abs-grade').value    = s.AbsorbedSalaryGrade || '';
  document.getElementById('s-first-appt').value   = s.DateOfFirstAppt ? s.DateOfFirstAppt.substring(0,10) : '';
  document.getElementById('s-confirm').value      = s.DateOfConfirmation ? s.DateOfConfirmation.substring(0,10) : '';
  document.getElementById('s-present-appt').value = s.DateOfPresentAppt ? s.DateOfPresentAppt.substring(0,10) : '';
  document.getElementById('s-dept').value         = s.Department || '';
  document.getElementById('s-unit').value         = s.Unit || '';
  document.getElementById('s-location').value     = s.Location || '';
  document.getElementById('s-status').value       = s.Status || 'Active';
  document.getElementById('s-remarks').value      = s.Remarks || '';
  document.getElementById('staff-modal').classList.remove('hidden');
}

async function submitStaffForm() {
  const data = {
    ID: document.getElementById('s-id').value || '',
    Surname: document.getElementById('s-surname').value.trim(),
    FirstName: document.getElementById('s-firstname').value.trim(),
    OtherName: document.getElementById('s-othername').value.trim(),
    Gender: document.getElementById('s-gender').value,
    DateOfBirth: document.getElementById('s-dob').value,
    Phone: document.getElementById('s-phone').value.trim(),
    Email: document.getElementById('s-email').value.trim(),
    PermanentAddress: document.getElementById('s-address').value.trim(),
    StateOfOrigin: document.getElementById('s-state').value.trim(),
    LGA: document.getElementById('s-lga').value.trim(),
    GeopoliticalZone: document.getElementById('s-zone').value,
    FolderNumber: document.getElementById('s-folder').value.trim(),
    IPPISNo: document.getElementById('s-ippis').value.trim(),
    Rank: document.getElementById('s-rank').value.trim(),
    Qualification: document.getElementById('s-qual').value.trim(),
    PreviousSalaryGrade: document.getElementById('s-prev-grade').value.trim(),
    AbsorbedSalaryGrade: document.getElementById('s-abs-grade').value.trim(),
    DateOfFirstAppt: document.getElementById('s-first-appt').value,
    DateOfConfirmation: document.getElementById('s-confirm').value,
    DateOfPresentAppt: document.getElementById('s-present-appt').value,
    Department: document.getElementById('s-dept').value.trim(),
    Unit: document.getElementById('s-unit').value.trim(),
    Location: document.getElementById('s-location').value.trim(),
    Status: document.getElementById('s-status').value,
    Remarks: document.getElementById('s-remarks').value.trim(),
  };
  if (!data.Surname || !data.FirstName) {
    setFeedback('staff-feedback', 'Surname and First Name are required.', true); return;
  }
  try {
    const res = await apiCall('saveStaffRecord', { currentUser, data });
    if (res.success) {
      showToast(res.message, 'success');
      closeStaffModal();
      currentStaffData = []; // Force reload
      loadNominalRoll();
    } else {
      setFeedback('staff-feedback', res.message, true);
    }
  } catch (err) {
    setFeedback('staff-feedback', 'Save failed. Please try again.', true);
  }
}

async function deleteStaff(id, name) {
  if (!confirm(`Delete record for "${name}"? This cannot be undone.`)) return;
  try {
    const res = await apiCall('deleteStaffRecord', { currentUser, id });
    if (res.success) {
      showToast(res.message, 'success');
      currentStaffData = []; loadNominalRoll();
    } else {
      showToast(res.message, 'error');
    }
  } catch (err) { showToast('Delete failed.', 'error'); }
}

// ─── POSTINGS ─────────────────────────────────────────────────
async function loadPostings() {
  if (!currentPostingsData.length) {
    document.getElementById('pt-table-body').innerHTML =
      '<tr><td colspan="9" class="text-center"><div class="spinner"></div> Loading…</td></tr>';
    try {
      const res = await apiCall('getAllPostings');
      currentPostingsData = (res.data || res || []).sort((a,b) => new Date(b.LoggedAt) - new Date(a.LoggedAt));
    } catch (err) {
      showToast('Failed to load postings.', 'error'); return;
    }
    // Also ensure staff data is loaded (needed for modal search)
    if (!currentStaffData.length) {
      try { const r = await apiCall('getAllStaff'); currentStaffData = r.data || r || []; } catch(e){}
    }
  }
  if (pendingFilter) {
    const f = pendingFilter; pendingFilter = null;
    if (f.type)   document.getElementById('pt-filter-type').value   = f.type;
    if (f.status) document.getElementById('pt-filter-status').value = f.status;
  }
  filterPostings();
}

function filterPostings() {
  const q      = document.getElementById('pt-search').value.toLowerCase();
  const type   = document.getElementById('pt-filter-type').value;
  const status = document.getElementById('pt-filter-status').value;

  filteredPostingsData = currentPostingsData.filter(p => {
    const matchQ = !q || [p.StaffName, p.FolderNumber, p.FromDepartment, p.ToDepartment]
      .some(f => (f || '').toLowerCase().includes(q));
    const matchType   = !type   || p.PostingType === type;
    const matchStatus = !status || p.Status === status;
    return matchQ && matchType && matchStatus;
  });
  ptPage = 1;
  renderPostings();
}

function renderPostings() {
  const { items, total, page, totalPages, start } = paginate(filteredPostingsData, ptPage);
  ptPage = page;
  document.getElementById('pt-count').textContent = `${total} record${total !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('pt-table-body');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No posting records found.</td></tr>';
    document.getElementById('pt-pagination').innerHTML = '';
    return;
  }
  tbody.innerHTML = items.map((p, i) => `<tr>
    <td class="text-muted">${start + i + 1}</td>
    <td class="font-medium">${escapeHtml(p.StaffName)}</td>
    <td>${escapeHtml(p.FolderNumber) || '—'}</td>
    <td>${escapeHtml(p.FromDepartment) || '—'}</td>
    <td>${escapeHtml(p.ToDepartment)}</td>
    <td>${getStatusBadge(p.PostingType)}</td>
    <td>${formatDate(p.EffectiveDate)}</td>
    <td>${getStatusBadge(p.Status)}</td>
    <td style="font-size:12px; color:var(--text-muted)">${escapeHtml(p.LoggedBy)}</td>
  </tr>`).join('');

  renderPagination('pt-pagination', page, totalPages, 'goPtPage');
}

function goPtPage(p) { ptPage = p; renderPostings(); }

function openPostingModal() {
  clearPostingModal();
  document.getElementById('posting-modal').classList.remove('hidden');
}

function closePostingModal() {
  document.getElementById('posting-modal').classList.add('hidden');
}

function clearPostingModal() {
  ['pt-id','pt-staff-search','pt-from-dept','pt-from-unit',
   'pt-to-dept','pt-to-unit','pt-effective-date','pt-destination',
   'pt-authority','pt-letter-ref','pt-return-date','pt-notes',
   'pt-staff-id','pt-staff-name-val'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('pt-type').value   = 'Internal';
  document.getElementById('pt-status').value = 'Active';
  const extFields = document.getElementById('external-fields');
  if (extFields) extFields.classList.add('hidden');
  const dd = document.getElementById('pt-staff-dropdown');
  if (dd) dd.classList.add('hidden');
  setFeedback('posting-feedback', '');
}

function searchStaffForPosting() {
  const q = document.getElementById('pt-staff-search').value.toLowerCase().trim();
  const dd = document.getElementById('pt-staff-dropdown');
  if (q.length < 2) { dd.classList.add('hidden'); return; }

  const matches = currentStaffData.filter(s =>
    `${s.Surname} ${s.FirstName}`.toLowerCase().includes(q) ||
    (s.FolderNumber || '').toLowerCase().includes(q)
  ).slice(0, 8);

  if (!matches.length) { dd.classList.add('hidden'); return; }
  dd.innerHTML = matches.map(s => `
    <div class="dropdown-item"
      onclick="selectStaffForPosting('${s.ID}','${escapeHtml(s.Surname+' '+s.FirstName)}','${escapeHtml(s.Department||'')}','${escapeHtml(s.Unit||'')}')">
      <strong>${escapeHtml(s.Surname)} ${escapeHtml(s.FirstName)}</strong>
      <small>${escapeHtml(s.FolderNumber || '—')} &nbsp;·&nbsp; ${escapeHtml(s.Rank || '')}</small>
    </div>`).join('');
  dd.classList.remove('hidden');
}

function selectStaffForPosting(id, name, dept, unit) {
  document.getElementById('pt-staff-id').value       = id;
  document.getElementById('pt-staff-name-val').value = name;
  document.getElementById('pt-staff-search').value   = name;
  document.getElementById('pt-from-dept').value      = dept;
  document.getElementById('pt-from-unit').value      = unit;
  document.getElementById('pt-staff-dropdown').classList.add('hidden');
}

function toggleExternalFields() {
  const isExternal = document.getElementById('pt-type').value === 'External';
  const extBlock   = document.getElementById('external-fields');
  if (isExternal) {
    extBlock.classList.remove('hidden');
    extBlock.style.display = 'grid';
  } else {
    extBlock.classList.add('hidden');
  }
}

async function submitPostingForm() {
  const staffId   = document.getElementById('pt-staff-id').value;
  const staffName = document.getElementById('pt-staff-name-val').value;
  const toDept    = document.getElementById('pt-to-dept').value.trim();
  const effDate   = document.getElementById('pt-effective-date').value;

  if (!staffId)  { setFeedback('posting-feedback','Please select a staff member.', true); return; }
  if (!toDept)   { setFeedback('posting-feedback','Destination department is required.', true); return; }
  if (!effDate)  { setFeedback('posting-feedback','Effective date is required.', true); return; }

  const data = {
    PostingID         : document.getElementById('pt-id').value || '',
    StaffID           : staffId,
    StaffName         : staffName,
    FolderNumber      : (currentStaffData.find(s => s.ID === staffId) || {}).FolderNumber || '',
    FromDepartment    : document.getElementById('pt-from-dept').value.trim(),
    FromUnit          : document.getElementById('pt-from-unit').value.trim(),
    ToDepartment      : toDept,
    ToUnit            : document.getElementById('pt-to-unit').value.trim(),
    PostingType       : document.getElementById('pt-type').value,
    Destination       : document.getElementById('pt-destination').value.trim(),
    ReleasingAuthority: document.getElementById('pt-authority').value.trim(),
    PostingLetterRef  : document.getElementById('pt-letter-ref').value.trim(),
    EffectiveDate     : effDate,
    ExpectedReturnDate: document.getElementById('pt-return-date').value,
    Status            : document.getElementById('pt-status').value,
    Notes             : document.getElementById('pt-notes').value.trim(),
  };

  try {
    const res = await apiCall('savePosting', { currentUser, data });
    if (res.success) {
      showToast(res.message, 'success');
      closePostingModal();
      currentPostingsData = []; currentStaffData = [];
      loadPostings();
    } else {
      setFeedback('posting-feedback', res.message, true);
    }
  } catch (err) {
    setFeedback('posting-feedback', 'Save failed. Please try again.', true);
  }
}

// ─── LOCUM REGISTER ───────────────────────────────────────────
async function loadLocums() {
  if (!currentLocumsData.length) {
    document.getElementById('lc-table-body').innerHTML =
      '<tr><td colspan="10" class="text-center"><div class="spinner"></div> Loading…</td></tr>';
    try {
      const res = await apiCall('getAllLocums');
      currentLocumsData = res.data || res || [];
    } catch (err) {
      showToast('Failed to load LOCUM register.', 'error'); return;
    }
  }
  if (pendingFilter) {
    const f = pendingFilter; pendingFilter = null;
    if (f.status) document.getElementById('lc-filter-status').value = f.status;
  }
  filterLocums();
}

function filterLocums() {
  const q        = document.getElementById('lc-search').value.toLowerCase();
  const status   = document.getElementById('lc-filter-status').value;
  const contract = document.getElementById('lc-filter-contract').value;

  filteredLocumsData = currentLocumsData.filter(l => {
    const matchQ = !q || [l.FullName, l.Cadre, l.Department]
      .some(f => (f || '').toLowerCase().includes(q));
    const matchS = !status   || l.Status === status;
    const matchC = !contract || l.ContractType === contract;
    return matchQ && matchS && matchC;
  });
  lcPage = 1;
  renderLocums();
}

function renderLocums() {
  const { items, total, page, totalPages, start } = paginate(filteredLocumsData, lcPage);
  lcPage = page;
  document.getElementById('lc-count').textContent = `${total} LOCUM${total !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('lc-table-body');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No LOCUM records found.</td></tr>';
    document.getElementById('lc-pagination').innerHTML = '';
    return;
  }
  tbody.innerHTML = items.map((l, i) => `<tr>
    <td class="text-muted">${start + i + 1}</td>
    <td class="font-medium">${escapeHtml(l.FullName)}</td>
    <td>${escapeHtml(l.Cadre) || '—'}</td>
    <td>${escapeHtml(l.Department) || '—'}</td>
    <td>${getStatusBadge(l.ContractType)}</td>
    <td>${formatDate(l.ContractStart)}</td>
    <td>${formatDate(l.ContractEnd)}</td>
    <td>${l.MonthlyCost ? '₦' + fmtNum(l.MonthlyCost) : '—'}</td>
    <td>${getStatusBadge(l.Status)}</td>
    <td>
      <button class="btn btn-text" style="padding:4px 10px; font-size:12px;" onclick="editLocum('${l.LocumID}')">✏ Edit</button>
      <button class="btn btn-danger" style="padding:4px 10px; font-size:12px;" onclick="deleteLocum('${l.LocumID}','${escapeHtml(l.FullName)}')">🗑</button>
    </td>
  </tr>`).join('');

  renderPagination('lc-pagination', page, totalPages, 'goLcPage');
}

function goLcPage(p) { lcPage = p; renderLocums(); }

function openLocumModal() {
  clearLocumModal();
  document.getElementById('locum-modal-title').textContent = 'Add LOCUM Staff';
  document.getElementById('locum-modal').classList.remove('hidden');
}

function closeLocumModal() {
  document.getElementById('locum-modal').classList.add('hidden');
}

function clearLocumModal() {
  ['lc-id','lc-name','lc-cadre','lc-dept','lc-phone','lc-email',
   'lc-start','lc-end','lc-vote','lc-cost','lc-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('lc-gender').value        = '';
  document.getElementById('lc-contract-type').value = 'Fixed';
  document.getElementById('lc-status').value        = 'Active';
  setFeedback('locum-feedback', '');
}

function editLocum(id) {
  const l = currentLocumsData.find(x => x.LocumID === id);
  if (!l) { showToast('LOCUM record not found.', 'error'); return; }
  clearLocumModal();
  document.getElementById('locum-modal-title').textContent = 'Edit LOCUM Staff';
  document.getElementById('lc-id').value            = l.LocumID;
  document.getElementById('lc-name').value          = l.FullName || '';
  document.getElementById('lc-gender').value        = l.Gender || '';
  document.getElementById('lc-cadre').value         = l.Cadre || '';
  document.getElementById('lc-dept').value          = l.Department || '';
  document.getElementById('lc-phone').value         = l.Phone || '';
  document.getElementById('lc-email').value         = l.Email || '';
  document.getElementById('lc-contract-type').value = l.ContractType || 'Fixed';
  document.getElementById('lc-start').value         = l.ContractStart ? l.ContractStart.substring(0,10) : '';
  document.getElementById('lc-end').value           = l.ContractEnd   ? l.ContractEnd.substring(0,10)   : '';
  document.getElementById('lc-vote').value          = l.IGRVoteCode || '';
  document.getElementById('lc-cost').value          = l.MonthlyCost || '';
  document.getElementById('lc-status').value        = l.Status || 'Active';
  document.getElementById('lc-notes').value         = l.Notes || '';
  document.getElementById('locum-modal').classList.remove('hidden');
}

async function submitLocumForm() {
  const name  = document.getElementById('lc-name').value.trim();
  const cadre = document.getElementById('lc-cadre').value.trim();
  const dept  = document.getElementById('lc-dept').value.trim();
  if (!name || !cadre || !dept) {
    setFeedback('locum-feedback', 'Name, Cadre, and Department are required.', true); return;
  }
  const data = {
    LocumID      : document.getElementById('lc-id').value || '',
    FullName     : name,
    Gender       : document.getElementById('lc-gender').value,
    Cadre        : cadre,
    Department   : dept,
    Phone        : document.getElementById('lc-phone').value.trim(),
    Email        : document.getElementById('lc-email').value.trim(),
    ContractType : document.getElementById('lc-contract-type').value,
    ContractStart: document.getElementById('lc-start').value,
    ContractEnd  : document.getElementById('lc-end').value,
    IGRVoteCode  : document.getElementById('lc-vote').value.trim(),
    MonthlyCost  : document.getElementById('lc-cost').value,
    Status       : document.getElementById('lc-status').value,
    Notes        : document.getElementById('lc-notes').value.trim(),
  };
  try {
    const res = await apiCall('saveLocumRecord', { currentUser, data });
    if (res.success) {
      showToast(res.message, 'success');
      closeLocumModal();
      currentLocumsData = []; loadLocums();
    } else {
      setFeedback('locum-feedback', res.message, true);
    }
  } catch (err) {
    setFeedback('locum-feedback', 'Save failed. Please try again.', true);
  }
}

async function deleteLocum(id, name) {
  if (!confirm(`Delete LOCUM record for "${name}"?`)) return;
  try {
    const res = await apiCall('deleteLocumRecord', { currentUser, id });
    if (res.success) { showToast(res.message, 'success'); currentLocumsData = []; loadLocums(); }
    else showToast(res.message, 'error');
  } catch (err) { showToast('Delete failed.', 'error'); }
}

// ─── REPORTS ─────────────────────────────────────────────────
function initReports() {
  buildColumnCheckboxes();
  // Ensure staff data is loaded
  if (!currentStaffData.length) {
    apiCall('getAllStaff').then(res => {
      currentStaffData = res.data || res || [];
    }).catch(() => {});
  }
}

function handleReportTypeChange() {
  const type  = document.querySelector('input[name="report-type"]:checked').value;
  const panel = document.getElementById('column-selector-panel');
  panel.style.display = type === 'full' ? '' : 'none';
  document.getElementById('report-preview').innerHTML =
    '<p class="placeholder-msg">Click Generate to preview the report.</p>';
}

function buildColumnCheckboxes() {
  const container = document.getElementById('column-checkboxes');
  container.innerHTML = REPORT_COLUMNS.map(col => `
    <label class="col-checkbox-item">
      <input type="checkbox" class="col-cb" value="${col.key}" ${DEFAULT_SELECTED_COLUMNS.includes(col.key) ? 'checked' : ''}>
      ${escapeHtml(col.label)}
    </label>`).join('');
}

function selectAllColumns(selectAll) {
  document.querySelectorAll('.col-cb').forEach(cb => cb.checked = selectAll);
}

function generateReport() {
  const type = document.querySelector('input[name="report-type"]:checked').value;
  const preview = document.getElementById('report-preview');

  if (!currentStaffData.length) {
    preview.innerHTML = '<p class="placeholder-msg" style="color:var(--warning)">Staff data not loaded yet. Please visit Nominal Roll first.</p>';
    return;
  }

  if (type === 'full') {
    const selectedKeys = [...document.querySelectorAll('.col-cb:checked')].map(cb => cb.value);
    if (!selectedKeys.length) {
      preview.innerHTML = '<p class="placeholder-msg" style="color:var(--danger)">Please select at least one column.</p>';
      return;
    }
    const cols = REPORT_COLUMNS.filter(c => selectedKeys.includes(c.key));
    const data = filteredStaffData.length ? filteredStaffData : currentStaffData;
    let html = `<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;"><strong>${data.length}</strong> records · ${cols.length} columns selected</p>`;
    html += '<div style="overflow-x:auto"><table>';
    html += '<thead><tr>' + cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('') + '</tr></thead><tbody>';
    html += data.map(s => '<tr>' + cols.map(c => {
      const v = s[c.key] || '';
      const display = c.key.toLowerCase().includes('date') ? formatDate(v) : escapeHtml(v);
      return `<td>${display}</td>`;
    }).join('') + '</tr>').join('');
    html += '</tbody></table></div>';
    preview.innerHTML = html;

  } else if (type === 'summary') {
    const data = filteredStaffData.length ? filteredStaffData : currentStaffData;
    // Group by Rank
    const byRank = {};
    data.forEach(s => {
      const rank = s.Rank || 'Unspecified';
      byRank[rank] = (byRank[rank] || 0) + 1;
    });
    const sorted = Object.entries(byRank).sort((a,b) => b[1] - a[1]);
    const total  = data.length;

    let html = `<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Total: <strong>${total}</strong> staff</p>`;
    html += '<table><thead><tr><th>S/N</th><th>Rank / Cadre</th><th>Count</th><th>%</th></tr></thead><tbody>';
    html += sorted.map(([ rank, count ], i) => `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(rank)}</td>
      <td><strong>${count}</strong></td>
      <td>${(count/total*100).toFixed(1)}%</td>
    </tr>`).join('');
    html += `<tr style="font-weight:700;border-top:2px solid var(--primary)">
      <td colspan="2">TOTAL</td><td>${total}</td><td>100%</td></tr>`;
    html += '</tbody></table>';
    preview.innerHTML = html;

  } else if (type === 'blank') {
    // Blank field template — all columns, 20 empty rows
    const cols = REPORT_COLUMNS;
    let html = '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Blank template — 20 empty rows for manual completion.</p>';
    html += '<div style="overflow-x:auto"><table>';
    html += '<thead><tr><th>S/N</th>' + cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('') + '</tr></thead><tbody>';
    for (let i = 1; i <= 20; i++) {
      html += '<tr><td>' + i + '</td>' + cols.map(() => '<td>&nbsp;</td>').join('') + '</tr>';
    }
    html += '</tbody></table></div>';
    preview.innerHTML = html;
  }
}

function printReport() {
  const type    = document.querySelector('input[name="report-type"]:checked').value;
  const preview = document.getElementById('report-preview');
  if (preview.querySelector('.placeholder-msg')) {
    showToast('Generate a report first before printing.', 'warning'); return;
  }
  const typeLabel = { full: 'NOMINAL ROLL', summary: 'CADRE SUMMARY', blank: 'BLANK FIELD TEMPLATE' }[type];
  const date = new Date().toLocaleDateString('en-NG', { day:'2-digit', month:'long', year:'numeric' });

  document.getElementById('print-area').innerHTML = `
    <div class="report-header">
      <h2>FEDERAL MEDICAL CENTRE, KUMO</h2>
      <h3>${typeLabel}</h3>
      <p>Generated: ${date} &nbsp;·&nbsp; ${currentUser ? currentUser.Name : ''}</p>
    </div>
    ${preview.innerHTML}`;
  window.print();
}

// ─── ADMIN PANEL ─────────────────────────────────────────────
async function loadUsers() {
  document.getElementById('users-table-body').innerHTML =
    '<tr><td colspan="6" class="text-center"><div class="spinner"></div></td></tr>';
  try {
    const res = await apiCall('getAllUsers');
    currentUsersData = res.data || res || [];
    renderUsers();
  } catch (err) { showToast('Failed to load users.', 'error'); }
}

function renderUsers() {
  const tbody = document.getElementById('users-table-body');
  if (!currentUsersData.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No users found.</td></tr>';
    return;
  }
  tbody.innerHTML = currentUsersData.map(u => `<tr>
    <td class="font-medium">${escapeHtml(u.Username)}</td>
    <td>${escapeHtml(u.Name)}</td>
    <td><span class="badge ${u.Role === 'SuperAdmin' ? 'badge-ext' : 'badge-int'}">${escapeHtml(u.Role)}</span></td>
    <td>${escapeHtml(u.Email) || '—'}</td>
    <td>${getStatusBadge(u.Status)}</td>
    <td>
      <button class="btn btn-text" style="padding:4px 10px; font-size:12px;" onclick="editUser('${u.ID}')">✏ Edit</button>
      <button class="btn btn-danger" style="padding:4px 10px; font-size:12px;" onclick="deleteUser('${u.ID}','${escapeHtml(u.Username)}')">🗑</button>
    </td>
  </tr>`).join('');
}

function openUserModal() {
  clearUserModal();
  document.getElementById('user-modal-title').textContent = 'Add System User';
  document.getElementById('user-modal').classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.add('hidden');
}

function clearUserModal() {
  ['u-id','u-name','u-username','u-password','u-email'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('u-role').value   = 'Admin';
  document.getElementById('u-status').value = 'Active';
  setFeedback('user-feedback', '');
}

function editUser(id) {
  const u = currentUsersData.find(x => x.ID === id);
  if (!u) return;
  clearUserModal();
  document.getElementById('user-modal-title').textContent = 'Edit System User';
  document.getElementById('u-id').value       = u.ID;
  document.getElementById('u-name').value     = u.Name || '';
  document.getElementById('u-username').value = u.Username || '';
  document.getElementById('u-role').value     = u.Role || 'Admin';
  document.getElementById('u-email').value    = u.Email || '';
  document.getElementById('u-status').value   = u.Status || 'Active';
  document.getElementById('user-modal').classList.remove('hidden');
}

async function submitUserForm() {
  const data = {
    ID      : document.getElementById('u-id').value || '',
    Name    : document.getElementById('u-name').value.trim(),
    Username: document.getElementById('u-username').value.trim(),
    Password: document.getElementById('u-password').value,
    Role    : document.getElementById('u-role').value,
    Email   : document.getElementById('u-email').value.trim(),
    Status  : document.getElementById('u-status').value,
  };
  if (!data.Name || !data.Username) {
    setFeedback('user-feedback', 'Name and Username are required.', true); return;
  }
  try {
    const res = await apiCall('saveUserRecord', { currentUser, data });
    if (res.success) {
      showToast(res.message, 'success');
      closeUserModal();
      loadUsers();
    } else {
      setFeedback('user-feedback', res.message, true);
    }
  } catch (err) {
    setFeedback('user-feedback', 'Save failed. Please try again.', true);
  }
}

async function deleteUser(id, username) {
  if (!confirm(`Delete user "${username}"?`)) return;
  try {
    const res = await apiCall('deleteUserRecord', { currentUser, id });
    if (res.success) { showToast(res.message, 'success'); loadUsers(); }
    else showToast(res.message, 'error');
  } catch (err) { showToast('Delete failed.', 'error'); }
}

async function loadAuditLogs(page) {
  auditPage = page || auditPage;
  document.getElementById('audit-table-body').innerHTML =
    '<tr><td colspan="5" class="text-center"><div class="spinner"></div></td></tr>';
  try {
    const res = await apiCall('getPaginatedAuditLogs', { page: auditPage, pageSize: PAGE_SIZE });
    const { data, page: p, totalPages } = res;

    const tbody = document.getElementById('audit-table-body');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No audit logs yet.</td></tr>';
      document.getElementById('audit-pagination').innerHTML = '';
      return;
    }
    tbody.innerHTML = data.map(a => `<tr>
      <td style="font-size:12px; white-space:nowrap; color:var(--text-muted)">${formatDate(a.Timestamp)}</td>
      <td>${escapeHtml(a.User)}</td>
      <td><span class="badge badge-int">${escapeHtml(a.Action)}</span></td>
      <td style="font-size:11px; color:var(--text-muted); max-width:120px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(a.TargetID)}</td>
      <td style="font-size:12px; color:var(--text-muted); max-width:200px; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(a.Details)}">${escapeHtml(a.Details)}</td>
    </tr>`).join('');

    renderPagination('audit-pagination', p, totalPages, 'loadAuditLogs');
  } catch (err) { showToast('Failed to load audit logs.', 'error'); }
}

// ─── IMPORT ──────────────────────────────────────────────────
let parsedImportRows = [];

// Expected camelCase headers (output of prepare_import.py)
const EXPECTED_HEADERS = [
  'FolderNumber','IPPISNo','Surname','FirstName','OtherName','Gender','DateOfBirth',
  'PermanentAddress','StateOfOrigin','LGA','GeopoliticalZone','Qualification',
  'PreviousSalaryGrade','AbsorbedSalaryGrade','Rank','Department','Unit',
  'DateOfFirstAppt','DateOfConfirmation','DateOfPresentAppt',
  'Phone','Email','Location','Status','Remarks'
];

// Also accept raw source column names from the spreadsheet directly
const SOURCE_HEADERS = [
  'FIRST NAME','SURNAME','OTHER','GENDER','PERMANENT ADDRESS',
  'DOB','STATE','LGC','GEOPOLITICAL ZONE','QUALIFICATION',
  'FOLDER NO./FILE_NO','IPPIS_NUMBER','PREVIOUS CONMESS/CONHESS',
  'ABSORBED CONMESS/CONHESS','RANK','1ST APPT.','CORNFIRM OF APPT.',
  'PRESENT APPT.','PHONE NUMBER','E-MAIL','LOCATION','REMARK'
];

function openImportModal() {
  parsedImportRows = [];
  document.getElementById('import-file').value  = '';
  document.getElementById('import-preview').innerHTML = `
    <div style="font-size:13px; color:var(--text-muted); line-height:1.7">
      <strong style="color:var(--text)">Accepted CSV format</strong><br>
      Run <code>prepare_import.py</code> on the nominal roll Excel file first.
      The script outputs <code>fmck_nominal_roll_import_ready.csv</code> — upload that file here.<br><br>
      <strong>Required columns (camelCase):</strong><br>
      <code>FolderNumber, IPPISNo, Surname, FirstName, OtherName, Gender,
      DateOfBirth, StateOfOrigin, LGA, Qualification, PreviousSalaryGrade,
      AbsorbedSalaryGrade, Rank, Department, Unit, DateOfFirstAppt,
      DateOfConfirmation, DateOfPresentAppt, Phone, Email, Location, Status, Remarks</code><br><br>
      <strong style="color:var(--warning)">⚠ Department and Unit will be blank after import.</strong>
      Use the Nominal Roll tab to assign each staff member to their department afterwards.
    </div>`;
  document.getElementById('import-btn').disabled = true;
  setFeedback('import-feedback', '');
  document.getElementById('import-modal').classList.remove('hidden');
}

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
}

function previewImportFile() {
  const file = document.getElementById('import-file').files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text  = e.target.result;
    // Split lines, handle both \r\n and \n
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      document.getElementById('import-preview').innerHTML =
        '<p style="color:var(--danger);font-size:13px;">File appears to be empty or has no data rows.</p>';
      return;
    }

    // Parse CSV header (handle quoted headers)
    const headers = parseCSVLine(lines[0]);

    // Detect format: camelCase (prepared) vs source column names
    const isSourceFormat = SOURCE_HEADERS.some(h => headers.includes(h));
    const isPreparedFormat = EXPECTED_HEADERS.some(h => headers.includes(h));
    const formatLabel = isSourceFormat ? 'Raw source format (will be remapped server-side)'
                      : isPreparedFormat ? 'Prepared format (prepare_import.py output)'
                      : 'Unknown format — check column headers';

    // Parse data rows
    parsedImportRows = lines.slice(1).map(line => {
      const vals = parseCSVLine(line);
      const obj  = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
      return obj;
    }).filter(r => {
      // Skip rows where all name fields are blank
      const surname   = r.Surname   || r['SURNAME']    || '';
      const firstname = r.FirstName || r['FIRST NAME'] || '';
      return surname || firstname;
    });

    const rowCount = parsedImportRows.length;
    const matchedExpected = EXPECTED_HEADERS.filter(h => headers.includes(h)).length;
    const matchedSource   = SOURCE_HEADERS.filter(h => headers.includes(h)).length;
    const matchScore      = Math.max(matchedExpected, matchedSource);
    const totalHeaders    = Math.max(EXPECTED_HEADERS.length, SOURCE_HEADERS.length);

    // Sample first row for preview
    const firstRow = parsedImportRows[0] || {};
    const previewFields = Object.entries(firstRow).slice(0, 6)
      .map(([k,v]) => `<span style="color:var(--text-muted)">${escapeHtml(k)}:</span> <strong>${escapeHtml(v) || '—'}</strong>`)
      .join(' &nbsp;|&nbsp; ');

    let warningHtml = '';
    if (!isPreparedFormat && !isSourceFormat) {
      warningHtml = `<p style="color:var(--danger);font-size:12px;margin-top:8px;">
        ⚠ Headers not recognised. Expected <code>prepare_import.py</code> output or raw spreadsheet export.
      </p>`;
    }

    document.getElementById('import-preview').innerHTML = `
      <div class="glass-panel" style="padding:1rem; font-size:13px;">
        <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:8px;">
          <span><strong>${rowCount}</strong> data rows</span>
          <span><strong>${matchScore}</strong> recognised columns</span>
          <span style="color:var(--text-muted)">${formatLabel}</span>
        </div>
        <div style="font-size:12px; color:var(--text-muted); overflow-x:auto; white-space:nowrap">
          <strong>First record preview:</strong><br>${previewFields}
        </div>
        ${warningHtml}
      </div>`;
    document.getElementById('import-btn').disabled = (rowCount === 0);
  };
  reader.readAsText(file);
}

// Minimal RFC-4180 CSV line parser (handles quoted fields with commas inside)
function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

async function submitImport() {
  if (!parsedImportRows.length) return;
  const btn = document.getElementById('import-btn');
  btn.textContent = 'Importing…'; btn.disabled = true;
  try {
    const res = await apiCall('importStaffData', { currentUser, rows: parsedImportRows });
    if (res.success) {
      showToast(res.message, 'success');
      if (res.errors && res.errors.length)
        console.warn('Import warnings:', res.errors);
      closeImportModal();
      currentStaffData = []; loadNominalRoll();
    } else {
      setFeedback('import-feedback', res.message, true);
      btn.textContent = 'Import Records'; btn.disabled = false;
    }
  } catch (err) {
    setFeedback('import-feedback', 'Import failed. Please try again.', true);
    btn.textContent = 'Import Records'; btn.disabled = false;
  }
}

// ─── Close dropdowns on outside click ────────────────────────
document.addEventListener('click', e => {
  const dd = document.getElementById('pt-staff-dropdown');
  if (dd && !dd.contains(e.target) && e.target.id !== 'pt-staff-search')
    dd.classList.add('hidden');
});

// ─── PWA Service Worker ───────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('SW registered'))
      .catch(err => console.warn('SW failed:', err));
  });
}
