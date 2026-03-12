/* ════════════════════════════════════════════════════════════════
   Vimisha's Dental Clinic — Frontend Application
   Handles SPA routing, API calls, DOM rendering, modals
   ════════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────
let currentPatientId = null;

// ── Helpers ────────────────────────────────────────────────────
function getTodayFormatted() {
  const d = new Date();
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

function formatDateForDisplay() {
  const d = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return d.toLocaleDateString('en-IN', options);
}

function flash(message, type = 'success') {
  const el = document.getElementById('flashMessage');
  el.textContent = message;
  el.className = `flash ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    flash(err.message, 'error');
    throw err;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Live date
  document.getElementById('liveDate').textContent = formatDateForDisplay();

  // Auto-fill registration date
  document.getElementById('regDate').value = getTodayFormatted();
  document.getElementById('visitDate').value = getTodayFormatted();

  // Navigation
  setupNav();

  // Load dashboard
  loadDashboard();

  // Setup event listeners
  setupSearches();
  setupForms();
  setupModals();
  setupOldRecords();
});

// ══════════════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════════════

function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      navigateTo(page);
    });
  });

  document.getElementById('backToPatients').addEventListener('click', () => {
    navigateTo('patients');
  });
}

function navigateTo(page) {
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add('active');

  // Show page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  // Load data for the page
  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'patients': loadPatients(); break;
    case 'appointments': loadAppointments(); break;
    case 'payments': loadPayments(); break;
    case 'oldrecords': loadOldRecordsArchive(); break;
  }
}

function openProfile(patientId) {
  currentPatientId = patientId;
  // Remove active from nav
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-profile').classList.add('active');
  loadProfile(patientId);
}

// ══════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════

async function loadDashboard() {
  try {
    const stats = await api('/api/stats');

    // Stats cards
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon patients">👥</div>
        <div>
          <div class="stat-value">${stats.totalPatients}</div>
          <div class="stat-label">Total Patients</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon visits">🗂️</div>
        <div>
          <div class="stat-value">${stats.totalVisits}</div>
          <div class="stat-label">Total Visits</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon revenue">💰</div>
        <div>
          <div class="stat-value">₹${stats.totalRevenue.toLocaleString('en-IN')}</div>
          <div class="stat-label">Total Revenue</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon records">📁</div>
        <div>
          <div class="stat-value">${stats.totalOldRecords || 0}</div>
          <div class="stat-label">Old Records</div>
        </div>
      </div>
    `;

    // Recent patients
    const recentEl = document.getElementById('recentPatients');
    if (stats.recentPatients.length === 0) {
      recentEl.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">👤</span>
          No patients yet — register your first patient!
        </div>`;
    } else {
      recentEl.innerHTML = stats.recentPatients.map(p => {
        const initials = p.name ? p.name.trim().substring(0, 2).toUpperCase() : '👤';
        return `
        <div class="recent-item" onclick="openProfile(${p.id})">
          <div class="avatar">${escapeHtml(initials)}</div>
          <div class="appt-info">
            <div class="appt-name">${escapeHtml(p.name)}</div>
            <div class="appt-case">${escapeHtml(p.case_no)} · Age ${p.age || '—'}</div>
          </div>
          <span class="appt-time">${escapeHtml(p.created_date)}</span>
        </div>
      `}).join('');
    }
  } catch (_) { }
}

// ══════════════════════════════════════════════════════════════
//  SEARCH
// ══════════════════════════════════════════════════════════════

function setupSearches() {
  // Dashboard search
  const dashInput = document.getElementById('dashSearch');
  const dashResults = document.getElementById('dashSearchResults');
  let searchTimeout;

  dashInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = dashInput.value.trim();
    if (q.length < 2) {
      dashResults.classList.remove('show');
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const patients = await api(`/api/patients?search=${encodeURIComponent(q)}`);
        if (patients.length === 0) {
          dashResults.innerHTML = '<div class="search-result-item"><em>No results found</em></div>';
        } else {
          dashResults.innerHTML = patients.slice(0, 8).map(p => `
            <div class="search-result-item" onclick="openProfile(${p.id}); document.getElementById('dashSearchResults').classList.remove('show'); document.getElementById('dashSearch').value = '';">
              <div class="search-result-name">${escapeHtml(p.name)}</div>
              <div class="search-result-case">Case: ${escapeHtml(p.case_no)} · Phone: ${escapeHtml(p.phone)}</div>
            </div>
          `).join('');
        }
        dashResults.classList.add('show');
      } catch (_) { }
    }, 300);
  });

  // Close search on outside click
  document.addEventListener('click', (e) => {
    if (!dashInput.contains(e.target) && !dashResults.contains(e.target)) {
      dashResults.classList.remove('show');
    }
  });

  // Patient list search
  const patientSearchInput = document.getElementById('patientSearch');
  let patientSearchTimeout;
  patientSearchInput.addEventListener('input', () => {
    clearTimeout(patientSearchTimeout);
    patientSearchTimeout = setTimeout(() => loadPatients(patientSearchInput.value.trim()), 300);
  });
}

// ══════════════════════════════════════════════════════════════
//  PATIENTS LIST
// ══════════════════════════════════════════════════════════════

async function loadPatients(search = '') {
  try {
    const url = search ? `/api/patients?search=${encodeURIComponent(search)}` : '/api/patients';
    const patients = await api(url);
    const tbody = document.getElementById('patientTableBody');

    if (patients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center empty-state">No patients found</td></tr>`;
      return;
    }

    tbody.innerHTML = patients.map(p => `
      <tr class="clickable" onclick="openProfile(${p.id})">
        <td class="td-case">${escapeHtml(p.case_no)}</td>
        <td class="td-name">${escapeHtml(p.name)}</td>
        <td>${p.age || '—'}</td>
        <td class="td-mono">${escapeHtml(p.phone)}</td>
        <td class="td-date">${escapeHtml(p.created_date)}</td>
        <td class="td-actions">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openProfile(${p.id})">👁️ View</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deletePatient(${p.id}, '${escapeHtml(p.name)}')">🗑️ Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (_) { }
}

async function deletePatient(id, name) {
  if (!confirm(`Are you sure you want to delete patient "${name}" and all their visits?`)) return;
  try {
    await api(`/api/patients/${id}`, { method: 'DELETE' });
    flash('Patient deleted successfully');
    loadPatients();
  } catch (_) { }
}

// ══════════════════════════════════════════════════════════════
//  PATIENT PROFILE
// ══════════════════════════════════════════════════════════════

async function loadProfile(id) {
  try {
    const { patient, visits, oldRecords } = await api(`/api/patients/${id}`);

    // Profile card
    document.getElementById('profileCard').innerHTML = `
      <div class="profile-info">
        <div class="profile-name">${escapeHtml(patient.name)}</div>
        <span class="profile-case">📋 ${escapeHtml(patient.case_no)}</span>

        <div class="profile-detail">
          <span class="profile-detail-label">Age</span>
          <span class="profile-detail-value">${patient.age || '—'}</span>
        </div>
        <div class="profile-detail">
          <span class="profile-detail-label">Sex</span>
          <span class="profile-detail-value">${patient.sex === 'M' ? 'Male' : patient.sex === 'F' ? 'Female' : '—'}</span>
        </div>
        <div class="profile-detail">
          <span class="profile-detail-label">Phone</span>
          <span class="profile-detail-value">${escapeHtml(patient.phone) || '—'}</span>
        </div>
        <div class="profile-detail">
          <span class="profile-detail-label">Address</span>
          <span class="profile-detail-value">${escapeHtml(patient.address) || '—'}</span>
        </div>
        <div class="profile-detail">
          <span class="profile-detail-label">Referred By</span>
          <span class="profile-detail-value">${escapeHtml(patient.referred_by) || '—'}${patient.referrer_phone ? ' (' + escapeHtml(patient.referrer_phone) + ')' : ''}</span>
        </div>
        <div class="profile-detail">
          <span class="profile-detail-label">Registered</span>
          <span class="profile-detail-value">${escapeHtml(patient.created_date)}</span>
        </div>
      </div>
      <div class="profile-actions">
        <button class="btn btn-outline" onclick="openEditPatient(${patient.id})">✏️ Edit Info</button>
      </div>
    `;

    // Visit table
    const vtbody = document.getElementById('visitTableBody');
    if (visits.length === 0) {
      vtbody.innerHTML = `<tr><td colspan="7" class="text-center empty-state">No visits recorded yet</td></tr>`;
    } else {
      vtbody.innerHTML = visits.map(v => `
        <tr>
          <td>${escapeHtml(v.visit_date)}</td>
          <td>${escapeHtml(v.visit_time) || '—'}</td>
          <td>${escapeHtml(v.work_done) || '—'}</td>
          <td>${escapeHtml(v.findings) || '—'}</td>
          <td>${v.payment ? '₹' + v.payment.toLocaleString('en-IN') : '—'}</td>
          <td>${v.next_appointment_date ? escapeHtml(v.next_appointment_date) + (v.next_appointment_time ? ' at ' + escapeHtml(v.next_appointment_time) : '') : '—'}</td>
          <td>${escapeHtml(v.notes) || '—'}</td>
        </tr>
      `).join('');
    }

    // Old Records in profile
    renderOldRecordsGrid(oldRecords || [], 'profileOldRecordsGrid', true);

    // Store patient ID for the add-visit button
    document.getElementById('visitPatientId').value = id;

    // Reset tab to visits
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.profile-tab[data-tab="visits"]').classList.add('active');
    document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('profileTabVisits').classList.add('active');
  } catch (_) { }
}

// ══════════════════════════════════════════════════════════════
//  FORMS
// ══════════════════════════════════════════════════════════════

function setupForms() {
  // Register form
  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    if (!name) { flash('Patient name is required', 'error'); return; }

    const sexRadio = document.querySelector('input[name="regSex"]:checked');

    const body = {
      case_no: document.getElementById('regCaseNo').value.trim(),
      name: name,
      age: parseInt(document.getElementById('regAge').value) || null,
      sex: sexRadio ? sexRadio.value : '',
      address: document.getElementById('regAddress').value.trim(),
      phone: document.getElementById('regPhone').value.trim(),
      referred_by: document.getElementById('regReferredBy').value.trim(),
      referrer_phone: document.getElementById('regReferrerPhone').value.trim(),
      created_date: document.getElementById('regDate').value.trim(),
    };

    try {
      const result = await api('/api/patients', { method: 'POST', body: JSON.stringify(body) });
      flash('Patient registered successfully! 🎉');
      e.target.reset();
      document.getElementById('regDate').value = getTodayFormatted();
      openProfile(result.id);
    } catch (_) { }
  });

  // Visit form
  document.getElementById('visitForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const patientId = document.getElementById('visitPatientId').value;

    const body = {
      patient_id: parseInt(patientId),
      visit_date: document.getElementById('visitDate').value.trim(),
      visit_time: document.getElementById('visitTime').value.trim(),
      work_done: document.getElementById('visitWorkDone').value.trim(),
      findings: document.getElementById('visitFindings').value.trim(),
      payment: parseInt(document.getElementById('visitPayment').value) || 0,
      next_appointment_date: document.getElementById('visitNextDate').value.trim(),
      next_appointment_time: document.getElementById('visitNextTime').value.trim(),
      notes: document.getElementById('visitNotes').value.trim(),
    };

    try {
      await api('/api/visits', { method: 'POST', body: JSON.stringify(body) });
      flash('Visit recorded successfully! 🎉');
      closeVisitModal();
      loadProfile(patientId);
    } catch (_) { }
  });

  // Edit patient form
  document.getElementById('editPatientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editPatientId').value;
    const name = document.getElementById('editName').value.trim();
    if (!name) { flash('Patient name is required', 'error'); return; }

    const sexRadio = document.querySelector('input[name="editSex"]:checked');

    const body = {
      case_no: document.getElementById('editCaseNo').value.trim(),
      name: name,
      age: parseInt(document.getElementById('editAge').value) || null,
      sex: sexRadio ? sexRadio.value : '',
      address: document.getElementById('editAddress').value.trim(),
      phone: document.getElementById('editPhone').value.trim(),
      referred_by: document.getElementById('editReferredBy').value.trim(),
      referrer_phone: document.getElementById('editReferrerPhone').value.trim(),
    };

    try {
      await api(`/api/patients/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      flash('Patient info updated! ✅');
      document.getElementById('editPatientModal').classList.remove('show');
      loadProfile(id);
    } catch (_) { }
  });

  // Payment filter
  document.getElementById('filterPayments').addEventListener('click', () => loadPayments());
  document.getElementById('clearPaymentFilter').addEventListener('click', () => {
    document.getElementById('paymentFrom').value = '';
    document.getElementById('paymentTo').value = '';
    loadPayments();
  });
}

// ══════════════════════════════════════════════════════════════
//  MODALS
// ══════════════════════════════════════════════════════════════

function setupModals() {
  const addVisitBtn = document.getElementById('addVisitBtn');
  addVisitBtn.addEventListener('click', () => {
    document.getElementById('visitForm').reset();
    document.getElementById('visitDate').value = getTodayFormatted();
    document.getElementById('visitPatientId').value = currentPatientId;
    document.getElementById('visitModal').classList.add('show');
  });

  document.getElementById('closeModal').addEventListener('click', closeVisitModal);
  document.getElementById('closeEditModal').addEventListener('click', () => {
    document.getElementById('editPatientModal').classList.remove('show');
  });
  document.getElementById('closeOldRecordModal').addEventListener('click', () => {
    document.getElementById('oldRecordModal').classList.remove('show');
  });

  // Close modal on overlay click
  document.getElementById('visitModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeVisitModal();
  });
  document.getElementById('editPatientModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('show');
  });
  document.getElementById('oldRecordModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('show');
  });

  // Close modals with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeVisitModal();
      document.getElementById('editPatientModal').classList.remove('show');
      document.getElementById('oldRecordModal').classList.remove('show');
      document.getElementById('lightbox').classList.remove('show');
    }
  });

  // Profile tabs
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
      const target = tab.dataset.tab === 'visits' ? 'profileTabVisits' : 'profileTabOldRecords';
      document.getElementById(target).classList.add('active');
    });
  });
}

function closeVisitModal() {
  document.getElementById('visitModal').classList.remove('show');
}

async function openEditPatient(id) {
  try {
    const { patient } = await api(`/api/patients/${id}`);
    document.getElementById('editPatientId').value = patient.id;
    document.getElementById('editCaseNo').value = patient.case_no || '';
    document.getElementById('editName').value = patient.name || '';
    document.getElementById('editAge').value = patient.age || '';
    document.getElementById('editAddress').value = patient.address || '';
    document.getElementById('editPhone').value = patient.phone || '';
    document.getElementById('editReferredBy').value = patient.referred_by || '';
    document.getElementById('editReferrerPhone').value = patient.referrer_phone || '';

    // Set sex radio
    document.querySelectorAll('input[name="editSex"]').forEach(r => r.checked = false);
    if (patient.sex) {
      const radio = document.querySelector(`input[name="editSex"][value="${patient.sex}"]`);
      if (radio) radio.checked = true;
    }

    document.getElementById('editPatientModal').classList.add('show');
  } catch (_) { }
}

// ══════════════════════════════════════════════════════════════
//  APPOINTMENTS
// ══════════════════════════════════════════════════════════════

async function loadAppointments() {
  try {
    const appointments = await api('/api/visits/upcoming');
    const tbody = document.getElementById('appointmentsTableBody');

    if (appointments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center empty-state">No upcoming appointments</td></tr>`;
      return;
    }

    tbody.innerHTML = appointments.map(a => `
      <tr>
        <td><strong>${escapeHtml(a.patient_name)}</strong></td>
        <td>${escapeHtml(a.case_no)}</td>
        <td>${escapeHtml(a.next_appointment_date)}</td>
        <td>${escapeHtml(a.next_appointment_time) || '—'}</td>
        <td>${escapeHtml(a.work_done) || '—'}</td>
        <td><button class="btn btn-outline btn-sm" onclick="openProfile(${a.patient_id})">View Patient</button></td>
      </tr>
    `).join('');
  } catch (_) { }
}

// ══════════════════════════════════════════════════════════════
//  PAYMENTS
// ══════════════════════════════════════════════════════════════

async function loadPayments() {
  try {
    const payments = await api('/api/payments');

    // Client-side date filtering
    const fromStr = document.getElementById('paymentFrom').value;
    const toStr = document.getElementById('paymentTo').value;

    let filtered = payments;
    if (fromStr || toStr) {
      const from = fromStr ? new Date(fromStr) : null;
      const to = toStr ? new Date(toStr) : null;

      filtered = payments.filter(p => {
        const dateParts = p.visit_date ? p.visit_date.split('/') : null;
        if (!dateParts || dateParts.length < 3) return true;
        // Parse D/M/YY
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1;
        let year = parseInt(dateParts[2]);
        if (year < 100) year += 2000;
        const vDate = new Date(year, month, day);
        if (from && vDate < from) return false;
        if (to && vDate > to) return false;
        return true;
      });
    }

    const total = filtered.reduce((sum, p) => sum + (p.payment || 0), 0);
    document.getElementById('paymentTotal').innerHTML = `
      Total Collected: <span class="total-amount">₹${total.toLocaleString('en-IN')}</span>
      ${filtered.length !== payments.length ? ` (${filtered.length} of ${payments.length} records)` : ` (${payments.length} records)`}
    `;

    const tbody = document.getElementById('paymentsTableBody');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center empty-state">No payment records found</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => `
      <tr class="clickable" onclick="openProfile(${p.patient_id || ''})">
        <td>${escapeHtml(p.visit_date)}</td>
        <td>${escapeHtml(p.patient_name)}</td>
        <td>${escapeHtml(p.case_no)}</td>
        <td>${escapeHtml(p.work_done) || '—'}</td>
        <td><strong>₹${(p.payment || 0).toLocaleString('en-IN')}</strong></td>
      </tr>
    `).join('');
  } catch (_) { }
}

// ══════════════════════════════════════════════════════════════
//  OLD RECORDS
// ══════════════════════════════════════════════════════════════

function setupOldRecords() {
  // Open upload modal from multiple places
  const openUploadModal = (patientId) => {
    document.getElementById('oldRecordForm').reset();
    document.getElementById('orPreview').innerHTML = '';
    document.getElementById('orPatientId').value = patientId || '';
    document.getElementById('orPatientSearch').value = '';
    document.getElementById('orSelectedPatient').style.display = 'none';
    document.getElementById('orManualName').style.display = 'none';
    document.getElementById('orManualCheck').checked = false;

    // If opening from patient profile, pre-fill
    if (patientId && currentPatientId) {
      document.getElementById('orPatientSearch').style.display = 'none';
      document.getElementById('orSelectedPatient').style.display = 'flex';
      document.getElementById('orSelectedPatient').innerHTML = `
                <span>Patient ID: ${patientId} (from profile)</span>
                <button type="button" class="or-clear" onclick="clearOldRecordPatient()">&times;</button>
            `;
    } else {
      document.getElementById('orPatientSearch').style.display = '';
    }

    document.getElementById('oldRecordModal').classList.add('show');
  };

  document.getElementById('dashUploadOldRecordBtn').addEventListener('click', () => openUploadModal(null));
  document.getElementById('profileUploadOldRecordBtn').addEventListener('click', () => openUploadModal(currentPatientId));
  document.getElementById('archiveUploadBtn').addEventListener('click', () => openUploadModal(null));

  // Patient search in upload modal
  const orSearch = document.getElementById('orPatientSearch');
  const orResults = document.getElementById('orPatientSearchResults');
  let orTimeout;

  orSearch.addEventListener('input', () => {
    clearTimeout(orTimeout);
    const q = orSearch.value.trim();
    if (q.length < 2) { orResults.classList.remove('show'); return; }
    orTimeout = setTimeout(async () => {
      try {
        const patients = await api(`/api/patients?search=${encodeURIComponent(q)}`);
        if (patients.length === 0) {
          orResults.innerHTML = '<div class="search-result-item"><em>No patients found</em></div>';
        } else {
          orResults.innerHTML = patients.slice(0, 6).map(p => `
                        <div class="search-result-item" onclick="selectOldRecordPatient(${p.id}, '${escapeHtml(p.name)}', '${escapeHtml(p.case_no)}')">
                            <div class="search-result-name">${escapeHtml(p.name)}</div>
                            <div class="search-result-case">Case: ${escapeHtml(p.case_no)}</div>
                        </div>
                    `).join('');
        }
        orResults.classList.add('show');
      } catch (_) { }
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!orSearch.contains(e.target) && !orResults.contains(e.target)) {
      orResults.classList.remove('show');
    }
  });

  // Manual check toggle
  document.getElementById('orManualCheck').addEventListener('change', (e) => {
    const manualInput = document.getElementById('orManualName');
    const searchInput = document.getElementById('orPatientSearch');
    const selected = document.getElementById('orSelectedPatient');
    if (e.target.checked) {
      manualInput.style.display = '';
      searchInput.style.display = 'none';
      selected.style.display = 'none';
      document.getElementById('orPatientId').value = '';
    } else {
      manualInput.style.display = 'none';
      searchInput.style.display = '';
    }
  });

  // File preview
  document.getElementById('orPhotos').addEventListener('change', (e) => {
    const preview = document.getElementById('orPreview');
    preview.innerHTML = '';
    Array.from(e.target.files).forEach((file, i) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const div = document.createElement('div');
        div.className = 'or-preview-item';
        div.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
        preview.appendChild(div);
      };
      reader.readAsDataURL(file);
    });
  });

  // Upload form submit
  document.getElementById('oldRecordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = document.getElementById('orPhotos').files;
    if (!files || files.length === 0) {
      flash('Please select at least one photo', 'error');
      return;
    }

    const patientId = document.getElementById('orPatientId').value;
    const manualName = document.getElementById('orManualName').value.trim();
    const isManual = document.getElementById('orManualCheck').checked;

    if (!patientId && !isManual) {
      flash('Please select a patient or check "Patient not in system yet"', 'error');
      return;
    }
    if (isManual && !manualName) {
      flash('Please enter the patient name', 'error');
      return;
    }

    const formData = new FormData();
    if (patientId) formData.append('patient_id', patientId);
    formData.append('patient_name_manual', isManual ? manualName : '');
    formData.append('record_date', document.getElementById('orRecordDate').value);
    formData.append('description', document.getElementById('orDescription').value.trim());
    for (const file of files) {
      formData.append('photos', file);
    }

    try {
      const res = await fetch('/api/old-records/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      flash(data.message + ' 📁');
      document.getElementById('oldRecordModal').classList.remove('show');

      // Reload whatever page is active
      if (currentPatientId) loadProfile(currentPatientId);
      const activePage = document.querySelector('.page.active');
      if (activePage && activePage.id === 'page-oldrecords') loadOldRecordsArchive();
      if (activePage && activePage.id === 'page-dashboard') loadDashboard();
    } catch (err) {
      flash(err.message, 'error');
    }
  });

  // Archive search
  const archiveSearchInput = document.getElementById('oldRecordSearch');
  let archiveSearchTimeout;
  archiveSearchInput.addEventListener('input', () => {
    clearTimeout(archiveSearchTimeout);
    archiveSearchTimeout = setTimeout(() => loadOldRecordsArchive(archiveSearchInput.value.trim()), 300);
  });

  // Lightbox
  document.getElementById('lightboxClose').addEventListener('click', () => {
    document.getElementById('lightbox').classList.remove('show');
  });
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('show');
  });
}

function selectOldRecordPatient(id, name, caseNo) {
  document.getElementById('orPatientId').value = id;
  document.getElementById('orPatientSearch').style.display = 'none';
  document.getElementById('orPatientSearchResults').classList.remove('show');
  const el = document.getElementById('orSelectedPatient');
  el.style.display = 'flex';
  el.innerHTML = `
        <span>${escapeHtml(name)} (${escapeHtml(caseNo)})</span>
        <button type="button" class="or-clear" onclick="clearOldRecordPatient()">&times;</button>
    `;
}

function clearOldRecordPatient() {
  document.getElementById('orPatientId').value = '';
  document.getElementById('orSelectedPatient').style.display = 'none';
  document.getElementById('orPatientSearch').style.display = '';
  document.getElementById('orPatientSearch').value = '';
}

async function loadOldRecordsArchive(search = '') {
  try {
    const url = search ? `/api/old-records?search=${encodeURIComponent(search)}` : '/api/old-records';
    const records = await api(url);

    document.getElementById('oldRecordsStat').innerHTML = `
            Total Archived Records: <span class="total-amount">${records.length}</span>
        `;

    renderOldRecordsGrid(records, 'archiveOldRecordsGrid', false);
  } catch (_) { }
}

function renderOldRecordsGrid(records, containerId, isProfile) {
  const container = document.getElementById(containerId);
  if (records.length === 0) {
    container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1">
                <span class="empty-icon">📁</span>
                No records uploaded yet
                <div class="mt-16">
                    <button class="btn btn-accent" onclick="document.getElementById('${isProfile ? 'profileUploadOldRecordBtn' : 'archiveUploadBtn'}').click()">📤 Upload First Record</button>
                </div>
            </div>`;
    return;
  }

  container.innerHTML = records.map(r => {
    const patientName = r.linked_patient_name || r.patient_name_manual || '—';
    return `
        <div class="or-card">
            <img class="or-card-img" src="${escapeHtml(r.file_path)}" alt="Record"
                 onclick="openLightbox('${escapeHtml(r.file_path)}', '${escapeHtml(r.description)}', '${escapeHtml(r.record_date)}', '${escapeHtml(r.upload_date)}')">
            <div class="or-card-body">
                ${!isProfile ? `<div class="or-card-patient">${escapeHtml(patientName)}</div>` : ''}
                <div class="or-card-desc">${escapeHtml(r.description) || 'No description'}</div>
                <div class="or-card-meta">
                    ${r.record_date ? 'Record: ' + escapeHtml(r.record_date) + ' · ' : ''}
                    Uploaded: ${escapeHtml(r.upload_date)}
                </div>
                <div class="or-card-actions">
                    <button class="btn btn-outline btn-sm" onclick="event.preventDefault(); downloadRecordAsPDF('${escapeHtml(patientName)}', '${escapeHtml(r.record_date || '')}', '${escapeHtml(r.description || '')}', '${escapeHtml(r.upload_date)}', '${escapeHtml(r.file_path)}')">⬇ Download PDF</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteOldRecord(${r.id})">🗑 Delete</button>
                </div>
            </div>
        </div>`;
  }).join('');
}

function openLightbox(src, desc, recordDate, uploadDate) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxDownload').onclick = (e) => {
    e.preventDefault();
    downloadRecordAsPDF('Patient Record', recordDate, desc, uploadDate, src);
  };
  document.getElementById('lightboxInfo').innerHTML = `
        <strong>${escapeHtml(desc) || 'No description'}</strong><br>
        ${recordDate ? 'Original date: ' + escapeHtml(recordDate) + ' · ' : ''}
        Uploaded: ${escapeHtml(uploadDate)}
    `;
  document.getElementById('lightbox').classList.add('show');
}

async function deleteOldRecord(id) {
  if (!confirm('Delete this record? The photo will be permanently removed.')) return;
  try {
    await api(`/api/old-records/${id}`, { method: 'DELETE' });
    flash('Record deleted');
    if (currentPatientId) loadProfile(currentPatientId);
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-oldrecords') loadOldRecordsArchive();
    if (activePage && activePage.id === 'page-dashboard') loadDashboard();
  } catch (_) { }
}

async function downloadRecordAsPDF(patientName, recordDate, description, uploadDate, imageSrc) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Configuration
    const margin = 20;
    let currentY = 20;

    // Header Background
    doc.setFillColor(53, 88, 114); // #355872
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    // Header Text
    doc.setTextColor(247, 248, 240); // #F7F8F0
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Vimisha's Dental Clinic", margin, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Patient Medical Record", margin, 30);

    // Reset Text Color
    doc.setTextColor(53, 88, 114); // #355872
    currentY = 55;

    // Patient Details
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Patient Name:", margin, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(patientName || "—", margin + 35, currentY);
    currentY += 10;

    if (recordDate) {
      doc.setFont("helvetica", "bold");
      doc.text("Record Date:", margin, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(recordDate, margin + 35, currentY);
      currentY += 10;
    }

    if (description) {
      doc.setFont("helvetica", "bold");
      doc.text("Description:", margin, currentY);
      doc.setFont("helvetica", "normal");
      // word wrap description
      const splitDesc = doc.splitTextToSize(description, pageWidth - margin * 2 - 35);
      doc.text(splitDesc, margin + 35, currentY);
      currentY += 10 * splitDesc.length;
    }

    doc.setFontSize(10);
    doc.setTextColor(122, 170, 206); // #7AAACE
    doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, margin, currentY);
    doc.text(`Uploaded: ${uploadDate || '—'}`, margin, currentY + 6);
    doc.setTextColor(53, 88, 114); // #355872
    
    currentY += 15;

    // Wait for image to load to get dimensions
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageSrc;
    
    // We must await image load
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    // Calculate dimensions to fit on page
    const maxWidth = pageWidth - (margin * 2);
    const maxHeight = pageHeight - currentY - margin;
    
    let imgWidth = img.width;
    let imgHeight = img.height;
    
    // Scale image
    const widthRatio = maxWidth / imgWidth;
    const heightRatio = maxHeight / imgHeight;
    const ratio = Math.min(widthRatio, heightRatio); // prevent overflowing either dimension
    
    // Only downscale, don't upscale small images
    if (ratio < 1) {
      imgWidth = imgWidth * ratio;
      imgHeight = imgHeight * ratio;
    }
    
    // Draw Border Box around image
    doc.setDrawColor(156, 213, 255); // #9CD5FF
    doc.rect(margin - 1, currentY - 1, imgWidth + 2, imgHeight + 2);
    
    // Add image
    doc.addImage(img, 'JPEG', margin, currentY, imgWidth, imgHeight);

    // Footer
    doc.setFontSize(9);
    doc.setTextColor(122, 170, 206); // #7AAACE
    doc.text("Vimisha's Dental Clinic — Confidential Medical Record", pageWidth / 2, pageHeight - 10, { align: "center" });

    // Download
    const cleanName = (patientName || 'record').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`${cleanName}_dental_record.pdf`);

  } catch (err) {
    console.error(err);
    flash("Failed to generate PDF. Check console.", "error");
  }
}
