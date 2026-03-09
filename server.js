const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const multer = require('multer');
const db = require('./database');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// ── Ensure uploads directory exists ────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads', 'old_records');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Multer storage config ──────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const name = (req.body.patient_name_manual || 'record')
            .toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${name}_${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp|bmp|heic/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype.split('/')[1]);
        cb(null, ext || mime);
    }
});

// ── Middleware ──────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Helper: get today's date in D/M/YY format ──────────────────
function getTodayFormatted() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

// ════════════════════════════════════════════════════════════════
//  PATIENTS
// ════════════════════════════════════════════════════════════════

// GET all patients
app.get('/api/patients', (req, res) => {
    const search = req.query.search || '';
    let rows;
    if (search) {
        rows = db.prepare(`
      SELECT * FROM patients
      WHERE name LIKE @q OR case_no LIKE @q
      ORDER BY id DESC
    `).all({ q: `%${search}%` });
    } else {
        rows = db.prepare('SELECT * FROM patients ORDER BY id DESC').all();
    }
    res.json(rows);
});

// GET single patient + visits
app.get('/api/patients/:id', (req, res) => {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const visits = db.prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY id DESC').all(req.params.id);
    const oldRecords = db.prepare('SELECT * FROM old_records WHERE patient_id = ? ORDER BY id DESC').all(req.params.id);
    res.json({ patient, visits, oldRecords });
});

// POST create patient
app.post('/api/patients', (req, res) => {
    const { case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const info = db.prepare(`
      INSERT INTO patients (case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(case_no, name, age || null, sex, address, phone, referred_by, referrer_phone, created_date || getTodayFormatted());
        res.json({ id: info.lastInsertRowid, message: 'Patient registered successfully' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Case number already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT update patient
app.put('/api/patients/:id', (req, res) => {
    const { case_no, name, age, sex, address, phone, referred_by, referrer_phone } = req.body;
    try {
        db.prepare(`
      UPDATE patients SET case_no=?, name=?, age=?, sex=?, address=?, phone=?, referred_by=?, referrer_phone=?
      WHERE id=?
    `).run(case_no, name, age || null, sex, address, phone, referred_by, referrer_phone, req.params.id);
        res.json({ message: 'Patient updated successfully' });
    } catch (err) {
        if (err.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Case number already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE patient
app.delete('/api/patients/:id', (req, res) => {
    db.prepare('DELETE FROM visits WHERE patient_id = ?').run(req.params.id);
    db.prepare('DELETE FROM patients WHERE id = ?').run(req.params.id);
    res.json({ message: 'Patient deleted' });
});

// ════════════════════════════════════════════════════════════════
//  VISITS
// ════════════════════════════════════════════════════════════════

// GET today's appointments
app.get('/api/visits/today', (req, res) => {
    const today = getTodayFormatted();
    const rows = db.prepare(`
    SELECT v.*, p.name AS patient_name, p.case_no
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.visit_date = ? OR v.next_appointment_date = ?
    ORDER BY v.visit_time
  `).all(today, today);
    res.json(rows);
});

// GET upcoming appointments
app.get('/api/visits/upcoming', (req, res) => {
    const rows = db.prepare(`
    SELECT v.*, p.name AS patient_name, p.case_no
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.next_appointment_date IS NOT NULL AND v.next_appointment_date != ''
    ORDER BY v.id DESC
  `).all();
    res.json(rows);
});

// POST create visit
app.post('/api/visits', (req, res) => {
    const { patient_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes } = req.body;
    if (!patient_id) return res.status(400).json({ error: 'Patient ID is required' });
    const info = db.prepare(`
    INSERT INTO visits (patient_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(patient_id, visit_date || getTodayFormatted(), visit_time, work_done, findings, payment || 0, next_appointment_date, next_appointment_time, notes);
    res.json({ id: info.lastInsertRowid, message: 'Visit recorded successfully' });
});

// ════════════════════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════════════════════

app.get('/api/payments', (req, res) => {
    const rows = db.prepare(`
    SELECT v.id, v.visit_date, v.payment, v.work_done, p.name AS patient_name, p.case_no
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.payment > 0
    ORDER BY v.id DESC
  `).all();
    res.json(rows);
});

// ════════════════════════════════════════════════════════════════
//  STATS (for dashboard)
// ════════════════════════════════════════════════════════════════

app.get('/api/stats', (req, res) => {
    const totalPatients = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
    const totalVisits = db.prepare('SELECT COUNT(*) AS c FROM visits').get().c;
    const totalRevenue = db.prepare('SELECT COALESCE(SUM(payment),0) AS s FROM visits').get().s;
    const totalOldRecords = db.prepare('SELECT COUNT(*) AS c FROM old_records').get().c;
    const recentPatients = db.prepare('SELECT * FROM patients ORDER BY id DESC LIMIT 5').all();

    const today = getTodayFormatted();
    const todayAppointments = db.prepare(`
    SELECT v.*, p.name AS patient_name, p.case_no
    FROM visits v
    JOIN patients p ON p.id = v.patient_id
    WHERE v.visit_date = ? OR v.next_appointment_date = ?
    ORDER BY v.visit_time
  `).all(today, today);

    res.json({ totalPatients, totalVisits, totalRevenue, totalOldRecords, recentPatients, todayAppointments });
});

// ════════════════════════════════════════════════════════════════
//  OLD RECORDS
// ════════════════════════════════════════════════════════════════

// POST upload old record(s)
app.post('/api/old-records/upload', upload.array('photos', 10), (req, res) => {
    try {
        const { patient_id, patient_name_manual, record_date, description } = req.body;
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'At least one photo is required' });
        }

        const insertRecord = db.prepare(`
      INSERT INTO old_records (patient_id, patient_name_manual, record_date, upload_date, description, file_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

        const uploadDate = getTodayFormatted();
        const ids = [];

        const insertAll = db.transaction(() => {
            for (const file of req.files) {
                const filePath = '/uploads/old_records/' + file.filename;
                const info = insertRecord.run(
                    patient_id ? parseInt(patient_id) : null,
                    patient_name_manual || null,
                    record_date || '',
                    uploadDate,
                    description || '',
                    filePath
                );
                ids.push(info.lastInsertRowid);
            }
        });

        insertAll();
        res.json({ ids, message: `${req.files.length} record(s) uploaded successfully` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET all old records (with search support)
app.get('/api/old-records', (req, res) => {
    const search = req.query.search || '';
    let rows;
    if (search) {
        rows = db.prepare(`
      SELECT r.*, p.name AS linked_patient_name, p.case_no
      FROM old_records r
      LEFT JOIN patients p ON p.id = r.patient_id
      WHERE p.name LIKE @q OR r.patient_name_manual LIKE @q OR r.description LIKE @q
      ORDER BY r.id DESC
    `).all({ q: `%${search}%` });
    } else {
        rows = db.prepare(`
      SELECT r.*, p.name AS linked_patient_name, p.case_no
      FROM old_records r
      LEFT JOIN patients p ON p.id = r.patient_id
      ORDER BY r.id DESC
    `).all();
    }
    res.json(rows);
});

// GET old records for a specific patient
app.get('/api/old-records/:patientId', (req, res) => {
    const rows = db.prepare(`
    SELECT * FROM old_records WHERE patient_id = ? ORDER BY id DESC
  `).all(req.params.patientId);
    res.json(rows);
});

// DELETE an old record
app.delete('/api/old-records/:id', (req, res) => {
    const record = db.prepare('SELECT * FROM old_records WHERE id = ?').get(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });

    // Delete the file from disk
    const fullPath = path.join(__dirname, record.file_path);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }

    db.prepare('DELETE FROM old_records WHERE id = ?').run(req.params.id);
    res.json({ message: 'Record deleted' });
});

// ── SPA fallback ───────────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start Server ───────────────────────────────────────────────
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

app.listen(PORT, HOST, () => {
    const ip = getLocalIP();
    console.log('');
    console.log('  🦷  Vimisha\'s Dental Clinic Dashboard');
    console.log('  ─────────────────────────────────────');
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Network: http://${ip}:${PORT}`);
    console.log('');
    console.log('  All devices on the same network can access the dashboard');
    console.log('  using the Network URL above.');
    console.log('');

    // Write ready signal
    try {
        require('fs').writeFileSync(require('path').join(__dirname, 'server-ready.txt'), 'RUNNING');
    } catch (err) {
        console.error('Could not write server-ready.txt:', err);
    }
});
