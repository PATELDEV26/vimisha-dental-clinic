const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Writable } = require('stream');
const multer = require('multer');
const PDFDocument = require('pdfkit');
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
        try {
            const raw = (req.body && req.body.patient_name_manual) || 'record';
            const name = String(raw)
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '_')
                .replace(/_+/g, '_')
                .slice(0, 30) || 'record';
            const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
            cb(null, `${name}_${Date.now()}${ext}`);
        } catch (e) {
            cb(e);
        }
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
    fileFilter: (req, file, cb) => {
        try {
            const allowed = /jpeg|jpg|png|gif|webp|bmp|heic/;
            const ext = path.extname(file.originalname || '').toLowerCase().replace(/^\./, '');
            const mimePart = (file.mimetype || '').split('/')[1] || '';
            const ok = allowed.test(ext) || allowed.test(mimePart);
            cb(null, !!ok);
        } catch (e) {
            cb(e);
        }
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

// GET all patients (search: name, case_no, or phone – partial match)
app.get('/api/patients', (req, res) => {
    const search = (req.query.search || '').trim();
    let rows;
    if (search) {
        const pattern = `%${search}%`;
        const prefix = `${search}%`;
        // Union actual patients and unlinked old records
        rows = db.prepare(`
          SELECT * FROM (
            SELECT 
              id, case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date,
              NULL as file_path, NULL as description, 'patient' as type
            FROM patients
            WHERE name LIKE @q
               OR case_no LIKE @q
               OR phone LIKE @q
               OR REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '+', '') LIKE @q

            UNION ALL

            SELECT
              id, case_no, patient_name_manual as name, NULL as age, NULL as sex, NULL as address, NULL as phone, NULL as referred_by, NULL as referrer_phone, upload_date as created_date,
              file_path, description, 'old_record' as type
            FROM old_records
            WHERE patient_id IS NULL AND (patient_name_manual LIKE @q OR case_no LIKE @q OR description LIKE @q)
          )
          ORDER BY
            CASE
              WHEN type = 'patient' AND case_no = @exact THEN 1
              WHEN type = 'patient' AND case_no LIKE @prefix THEN 2
              WHEN type = 'old_record' AND case_no LIKE @prefix THEN 3
              WHEN name LIKE @prefix THEN 4
              ELSE 5
            END,
            id DESC
          LIMIT 100
        `).all({ q: pattern, prefix: prefix, exact: search });
    } else {
        rows = db.prepare(`
          SELECT * FROM (
            SELECT 
              id, case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date,
              NULL as file_path, NULL as description, 'patient' as type
            FROM patients

            UNION ALL

            SELECT
              id, case_no, patient_name_manual as name, NULL as age, NULL as sex, NULL as address, NULL as phone, NULL as referred_by, NULL as referrer_phone, upload_date as created_date,
              file_path, description, 'old_record' as type
            FROM old_records
            WHERE patient_id IS NULL
          )
          ORDER BY id DESC
          LIMIT 100
        `).all();
    }
    res.json(rows);
});

// GET single patient + treatments (with seatings) + oldRecords
app.get('/api/patients/:id', (req, res) => {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const treatments = db.prepare('SELECT * FROM treatments WHERE patient_id = ? ORDER BY id DESC').all(req.params.id);
    const allVisits = db.prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY id DESC').all(req.params.id);
    const treatmentsWithSittings = treatments.map(t => ({
        ...t,
        sittings: allVisits.filter(v => v.treatment_id === t.id)
    }));
    const oldRecords = db.prepare('SELECT * FROM old_records WHERE patient_id = ? ORDER BY id DESC').all(req.params.id);
    res.json({ patient, treatments: treatmentsWithSittings, oldRecords });
});

// POST create patient
app.post('/api/patients', (req, res) => {
    let { case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    // Enforce uppercase
    name = (name || '').toUpperCase();
    case_no = (case_no || '').toUpperCase();
    sex = (sex || '').toUpperCase();
    address = (address || '').toUpperCase();
    referred_by = (referred_by || '').toUpperCase();
    
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
    let { case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date } = req.body;
    
    // Enforce uppercase
    name = (name || '').toUpperCase();
    case_no = (case_no || '').toUpperCase();
    sex = (sex || '').toUpperCase();
    address = (address || '').toUpperCase();
    referred_by = (referred_by || '').toUpperCase();

    try {
        db.prepare(`
      UPDATE patients SET case_no=?, name=?, age=?, sex=?, address=?, phone=?, referred_by=?, referrer_phone=?, created_date=?
      WHERE id=?
    `).run(case_no, name, age || null, sex, address, phone, referred_by, referrer_phone, created_date, req.params.id);
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
    db.prepare('DELETE FROM treatments WHERE patient_id = ?').run(req.params.id);
    db.prepare('DELETE FROM patients WHERE id = ?').run(req.params.id);
    res.json({ message: 'Patient deleted' });
});

// ════════════════════════════════════════════════════════════════
//  TREATMENTS
// ════════════════════════════════════════════════════════════════

// GET treatments for a patient (optional; profile already includes these)
app.get('/api/patients/:id/treatments', (req, res) => {
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.params.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const treatments = db.prepare('SELECT * FROM treatments WHERE patient_id = ? ORDER BY id DESC').all(req.params.id);
    const allVisits = db.prepare('SELECT * FROM visits WHERE patient_id = ? ORDER BY id DESC').all(req.params.id);
    const withSittings = treatments.map(t => ({
        ...t,
        sittings: allVisits.filter(v => v.treatment_id === t.id)
    }));
    res.json(withSittings);
});

// POST create treatment
app.post('/api/treatments', (req, res) => {
    let { patient_id, name, description, created_date } = req.body;
    const pid = patient_id != null ? parseInt(patient_id, 10) : NaN;
    if (!name || (typeof name === 'string' && !name.trim())) return res.status(400).json({ error: 'Treatment name is required' });
    if (!pid || isNaN(pid)) return res.status(400).json({ error: 'Patient ID is required' });
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(pid);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    // Enforce uppercase
    name = (name || '').toUpperCase();
    description = (description || '').toUpperCase();

    const info = db.prepare(`
    INSERT INTO treatments (patient_id, name, description, created_date)
    VALUES (?, ?, ?, ?)
  `).run(pid, (name && name.trim()) || name, description || null, (created_date && created_date.trim()) || getTodayFormatted());
    res.json({ id: info.lastInsertRowid, message: 'Treatment created', sittings: [] });
});

// GET treatment report as PDF (patient + treatment + seatings) – must be before /:id
app.get('/api/treatments/:id/pdf', (req, res) => {
    const treatmentId = req.params.id;
    const treatment = db.prepare('SELECT * FROM treatments WHERE id = ?').get(treatmentId);
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(treatment.patient_id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    const sittings = db.prepare('SELECT * FROM visits WHERE treatment_id = ? ORDER BY visit_date, id').all(treatmentId);

    const safe = (s) => (s == null || s === '' ? '-' : String(s).toUpperCase());
    const safeFilename = (s) => (s || 'REPORT').toUpperCase().replace(/[^A-Z0-9._-]/g, '_').replace(/_+/g, '_').slice(0, 80);
    const colCharLimits = [8, 6, 14, 11, 8, 10, 11];
    const truncate = (str, maxChars) => { const s = String(str || '-').toUpperCase(); return s.length <= maxChars ? s : s.slice(0, maxChars - 2) + '..'; };
    const filename = `${safeFilename(patient.name)}_${safeFilename(treatment.name)}_REPORT.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 40, bufferPages: false });
    doc.on('error', (err) => { console.error('PDF error:', err); });
    doc.pipe(res);

    try {
        const margin = 40;
        const pageWidth = doc.page.width - margin * 2;
        let y = margin;

        // Simple Header
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000').text("VIMISHA'S DENTAL CLINIC", margin, y, { align: 'center' });
        y += 22;
        doc.fontSize(10).font('Helvetica').text('TREATMENT CASE RECORD', margin, y, { align: 'center' });
        y += 20;

        // Thin separator line
        doc.moveTo(margin, y).lineTo(margin + pageWidth, y).strokeColor('#000000').lineWidth(1).stroke();
        y += 15;

        // Patient Details Section (2 columns)
        doc.fontSize(10).font('Helvetica-Bold').text('PATIENT INFORMATION', margin, y);
        y += 15;
        
        const col1X = margin;
        const col2X = margin + (pageWidth / 2);
        let sectionY = y;

        const leftSide = [
            ['NAME', patient.name],
            ['CASE NO.', patient.case_no],
            ['AGE / SEX', `${patient.age || '-'} / ${patient.sex === 'M' ? 'MALE' : patient.sex === 'F' ? 'FEMALE' : (patient.sex || '-')}`],
            ['PHONE', patient.phone]
        ];
        const rightSide = [
            ['ADDRESS', patient.address],
            ['REFERRED BY', [patient.referred_by, patient.referrer_phone ? `(${patient.referrer_phone})` : ''].filter(Boolean).join(' ')],
            ['REG. DATE', patient.created_date]
        ];

        doc.font('Helvetica');
        leftSide.forEach(([label, val]) => {
            doc.font('Helvetica-Bold').text(`${label}: `, col1X, sectionY, { continued: true });
            doc.font('Helvetica').text(safe(val));
            sectionY += 14;
        });

        let sectionY2 = y;
        rightSide.forEach(([label, val]) => {
            doc.font('Helvetica-Bold').text(`${label}: `, col2X, sectionY2, { continued: true });
            doc.font('Helvetica').text(safe(val));
            sectionY2 += 14;
        });

        y = Math.max(sectionY, sectionY2) + 20;

        // Treatment Header
        doc.font('Helvetica-Bold').fontSize(11).text('TREATMENT:', margin, y, { continued: true });
        doc.font('Helvetica').text(` ${safe(treatment.name)}`);
        y += 14;
        if (treatment.description) {
            doc.font('Helvetica-Bold').text('REMARKS:', margin, y, { continued: true });
            doc.font('Helvetica').text(` ${safe(treatment.description)}`);
            y += 14;
        }
        y += 15;

        // Sittings Table
        doc.font('Helvetica-Bold').fontSize(11).text('SITTINGS / VISIT RECORDS', margin, y);
        y += 15;

        const headers = ['DATE', 'TIME', 'WORK DONE', 'FINDINGS', 'PAYMENT', 'NEXT APPT', 'NOTES'];
        const colWidths = [50, 40, 95, 80, 55, 65, 130]; // Adjusted for a cleaner look
        const rowHeight = 20;

        // Table Header
        doc.rect(margin, y, pageWidth, rowHeight).stroke();
        let currentX = margin;
        doc.fontSize(8);
        headers.forEach((h, i) => {
            doc.text(h, currentX + 4, y + 6, { width: colWidths[i] - 8 });
            currentX += colWidths[i];
        });
        y += rowHeight;

        // Table Rows
        sittings.forEach((s, idx) => {
            if (y > doc.page.height - 60) {
                doc.addPage();
                y = margin;
            }

            const paymentStr = s.payment ? 'RS.' + Number(s.payment).toLocaleString('en-IN') : '-';
            const nextApptStr = s.next_appointment_date ? safe(s.next_appointment_date) : '-';
            const cells = [safe(s.visit_date), safe(s.visit_time), safe(s.work_done), safe(s.findings), paymentStr, nextApptStr, safe(s.notes)];

            doc.rect(margin, y, pageWidth, rowHeight).stroke();
            currentX = margin;
            cells.forEach((cell, ci) => {
                doc.text(truncate(cell, colCharLimits[ci]), currentX + 4, y + 6, { width: colWidths[ci] - 8 });
                currentX += colWidths[ci];
            });
            y += rowHeight;
        });

        // Footer
        const footerY = doc.page.height - 40;
        doc.fontSize(8).fillColor('#666666');
        doc.text(`PRINTED ON: ${new Date().toLocaleString('en-IN').toUpperCase()}`, margin, footerY);
        doc.text(`PAGE RECORD — VIMISHA'S DENTAL CLINIC`, margin, footerY, { align: 'right' });

        doc.end();
    } catch (err) {
        if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed', detail: err.message });
    }
});

// GET single treatment with seatings
app.get('/api/treatments/:id', (req, res) => {
    const treatment = db.prepare('SELECT * FROM treatments WHERE id = ?').get(req.params.id);
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
    const sittings = db.prepare('SELECT * FROM visits WHERE treatment_id = ? ORDER BY id DESC').all(req.params.id);
    res.json({ ...treatment, sittings });
});

// PUT update treatment
app.put('/api/treatments/:id', (req, res) => {
    let { name, description } = req.body;
    const treatment = db.prepare('SELECT * FROM treatments WHERE id = ?').get(req.params.id);
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });

    // Enforce uppercase
    name = name ? name.toUpperCase() : name;
    description = description ? description.toUpperCase() : description;

    db.prepare('UPDATE treatments SET name = ?, description = ? WHERE id = ?').run(name ?? treatment.name, description !== undefined ? description : treatment.description, req.params.id);
    res.json({ message: 'Treatment updated' });
});

// DELETE treatment (visits under it are deleted by app or cascade)
app.delete('/api/treatments/:id', (req, res) => {
    const treatment = db.prepare('SELECT * FROM treatments WHERE id = ?').get(req.params.id);
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
    db.prepare('DELETE FROM visits WHERE treatment_id = ?').run(req.params.id);
    db.prepare('DELETE FROM treatments WHERE id = ?').run(req.params.id);
    res.json({ message: 'Treatment deleted' });
});

// ════════════════════════════════════════════════════════════════
//  VISITS (seatings)
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

// POST create visit (seating) – requires treatment_id
app.post('/api/visits', (req, res) => {
    let { treatment_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes } = req.body;
    if (!treatment_id) return res.status(400).json({ error: 'Treatment ID is required' });
    const treatment = db.prepare('SELECT * FROM treatments WHERE id = ?').get(treatment_id);
    if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
    const patient_id = treatment.patient_id;

    // Enforce uppercase
    work_done = (work_done || '').toUpperCase();
    findings = (findings || '').toUpperCase();
    notes = (notes || '').toUpperCase();

    const info = db.prepare(`
    INSERT INTO visits (patient_id, treatment_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(patient_id, treatment_id, visit_date || getTodayFormatted(), visit_time, work_done, findings, payment || 0, next_appointment_date, next_appointment_time, notes);
    res.json({ id: info.lastInsertRowid, message: 'Sitting recorded successfully' });
});

// PUT update visit (seating)
app.put('/api/visits/:id', (req, res) => {
    let { visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes } = req.body;
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.id);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    // Enforce uppercase
    work_done = work_done !== undefined ? work_done.toUpperCase() : undefined;
    findings = findings !== undefined ? findings.toUpperCase() : undefined;
    notes = notes !== undefined ? notes.toUpperCase() : undefined;

    db.prepare(`
    UPDATE visits SET visit_date = ?, visit_time = ?, work_done = ?, findings = ?, payment = ?, next_appointment_date = ?, next_appointment_time = ?, notes = ?
    WHERE id = ?
  `).run(
        visit_date !== undefined ? visit_date : visit.visit_date,
        visit_time !== undefined ? visit_time : visit.visit_time,
        work_done !== undefined ? work_done : visit.work_done,
        findings !== undefined ? findings : visit.findings,
        payment !== undefined ? (parseInt(payment, 10) || 0) : visit.payment,
        next_appointment_date !== undefined ? next_appointment_date : visit.next_appointment_date,
        next_appointment_time !== undefined ? next_appointment_time : visit.next_appointment_time,
        notes !== undefined ? notes : visit.notes,
        req.params.id
    );
    res.json({ message: 'Visit updated' });
});

// DELETE visit (seating)
app.delete('/api/visits/:id', (req, res) => {
    const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(req.params.id);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    db.prepare('DELETE FROM visits WHERE id = ?').run(req.params.id);
    res.json({ message: 'Visit deleted' });
});

// ════════════════════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════════════════════

app.get('/api/payments', (req, res) => {
    const rows = db.prepare(`
    SELECT v.id, v.patient_id, v.visit_date, v.payment, v.work_done, p.name AS patient_name, p.case_no
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

// POST upload old record(s) – multer errors handled by error middleware below
app.post('/api/old-records/upload', (req, res, next) => {
    upload.array('photos', 10)(req, res, (err) => {
        if (err) return next(err);
        next();
    });
}, (req, res, next) => {
    try {
        const { patient_id, patient_name_manual, case_no, record_date, description } = req.body || {};
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'At least one photo is required' });
        }

        const insertRecord = db.prepare(`
      INSERT INTO old_records (patient_id, patient_name_manual, case_no, record_date, upload_date, description, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        const uploadDate = getTodayFormatted();
        const ids = [];
        let newPatientId = null;

        const insertAll = db.transaction(() => {
            let linkedPatientId = patient_id ? parseInt(patient_id, 10) : null;

            // If manual name provided and no existing patient linked, create a new patient
            if (!linkedPatientId && patient_name_manual) {
                const patientInfo = db.prepare(`
                    INSERT INTO patients (name, created_date) VALUES (?, ?)
                `).run(patient_name_manual, uploadDate);
                linkedPatientId = patientInfo.lastInsertRowid;
                newPatientId = linkedPatientId;
            }

            for (const file of req.files) {
                const filePath = '/uploads/old_records/' + file.filename;
                const info = insertRecord.run(
                    linkedPatientId,
                    patient_name_manual || null,
                    case_no || null,
                    record_date || '',
                    uploadDate,
                    description || '',
                    filePath
                );
                ids.push(info.lastInsertRowid);
            }
        });

        insertAll();
        res.json({ ids, newPatientId, message: `${req.files.length} record(s) uploaded successfully` });
    } catch (err) {
        next(err);
    }
});

// GET all old records (with search support)
app.get('/api/old-records', (req, res) => {
    const search = req.query.search || '';
    let rows;
    if (search) {
        const pattern = `%${search}%`;
        const prefix = `${search}%`;
        rows = db.prepare(`
      SELECT r.*, p.name AS linked_patient_name, p.case_no
      FROM old_records r
      LEFT JOIN patients p ON p.id = r.patient_id
      WHERE p.name LIKE @q OR r.patient_name_manual LIKE @q OR r.description LIKE @q
      ORDER BY
        CASE
          WHEN p.name LIKE @prefix THEN 1
          WHEN r.patient_name_manual LIKE @prefix THEN 2
          WHEN p.name LIKE @q THEN 3
          WHEN r.patient_name_manual LIKE @q THEN 4
          ELSE 5
        END,
        r.id DESC
    `).all({ q: pattern, prefix: prefix });
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

    // Delete the file from disk (file_path is stored as /uploads/old_records/filename)
    const filename = record.file_path ? path.basename(record.file_path) : '';
    const fullPath = filename ? path.join(uploadsDir, filename) : null;
    if (fullPath && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }

    db.prepare('DELETE FROM old_records WHERE id = ?').run(req.params.id);
    res.json({ message: 'Record deleted' });
});

// ── Error handler for API (e.g. multer / upload errors) ─────────
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const isApi = (req.path || '').startsWith('/api/');
    const status = err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT' || (err instanceof multer.MulterError)
        ? 400
        : 500;
    const message = err.message || 'Internal server error';
    if (status === 500) console.error('Upload/API error:', err);
    if (isApi) return res.status(status).json({ error: message });
    res.status(status).send(message);
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
        fs.writeFileSync(path.join(__dirname, 'server-ready.txt'), 'RUNNING');
    } catch (err) {
        console.error('Could not write server-ready.txt:', err);
    }
});
