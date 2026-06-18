require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Writable } = require('stream');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { PrismaClient } = require('@prisma/client');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// ── Auth Configuration ──────────────────────────────────────────
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`
}, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
    if (email && ALLOWED_EMAILS.includes(email)) {
        return done(null, profile);
    } else {
        return done(null, false, { message: 'Unauthorized email' });
    }
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ── Middleware ──────────────────────────────────────────────────
app.use(express.json());
app.use(session({
    store: new pgSession({
        conString: process.env.DATABASE_URL,
        tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'dental-clinic-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

app.use(passport.initialize());
app.use(passport.session());

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// ── Ensure uploads directory exists ────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads', 'old_records');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Backup Download (SQLite) ───────────────────────────────────
app.get('/api/backup/download', ensureAuthenticated, (req, res) => {
    try {
        const dbPath = path.join(__dirname, 'clinic.db');
        
        // Checkpoint WAL before download
        const Database = require('better-sqlite3');
        const db = new Database(dbPath);
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        
        const date = new Date().toISOString().split('T')[0];
        const filename = `vimisha-dental-backup-${date}.db`;
        
        res.download(dbPath, filename, (err) => {
          if (err) {
            console.error('Download error:', err);
            if (!res.headersSent) res.status(500).json({ error: 'Backup failed' });
          }
        });
    } catch (err) {
        console.error('Backup error:', err);
        res.status(500).json({ error: 'Backup process failed' });
    }
});

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
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, `${name}_${uniqueSuffix}${ext}`);
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

// ── Public Routes ──────────────────────────────────────────────
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/unauthorized.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'unauthorized.html')));

// ── Auth Routes ─────────────────────────────────────────────────
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            if (info && info.message === 'Unauthorized email') {
                return res.redirect('/unauthorized.html');
            }
            return res.redirect('/login.html');
        }
        req.logIn(user, (err) => {
            if (err) return next(err);
            return res.redirect('/');
        });
    })(req, res, next);
});

app.get('/auth/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/login.html');
    });
});

app.get('/api/me', ensureAuthenticated, (req, res) => {
    res.json(req.user);
});

// ── Protected API & Static Middleware ───────────────────────────
app.use('/api', ensureAuthenticated);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', ensureAuthenticated, express.static(path.join(__dirname, 'uploads')));

// ── Helper: get today's date in D/M/YY format ──────────────────
function getTodayFormatted() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

// ════════════════════════════════════════════════════════════════
//  PATIENTS
// ════════════════════════════════════════════════════════════════

// GET all patients (search: name, case_no, or phone – partial match)
app.get('/api/patients', async (req, res) => {
    const search = (req.query.search || '').trim();
    try {
        let patients;
        if (search) {
            patients = await prisma.patient.findMany({
                where: {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { case_no: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } }
                    ]
                },
                orderBy: { id: 'desc' },
                limit: 100
            });

            const unlinkedRecords = await prisma.oldRecord.findMany({
                where: {
                    patient_id: null,
                    OR: [
                        { patient_name_manual: { contains: search, mode: 'insensitive' } },
                        { case_no: { contains: search, mode: 'insensitive' } },
                        { description: { contains: search, mode: 'insensitive' } }
                    ]
                },
                orderBy: { id: 'desc' },
                limit: 100
            });

            // Format for UI
            const formattedPatients = patients.map(p => ({ ...p, type: 'patient' }));
            const formattedRecords = unlinkedRecords.map(r => ({
                id: r.id,
                case_no: r.case_no,
                name: r.patient_name_manual,
                age: null, sex: null, address: null, phone: null, referred_by: null, referrer_phone: null,
                created_date: r.upload_date,
                file_path: r.file_path,
                description: r.description,
                type: 'old_record'
            }));

            res.json([...formattedPatients, ...formattedRecords]);
        } else {
            const patients = await prisma.patient.findMany({
                orderBy: { id: 'desc' },
                take: 100
            });
            const unlinkedRecords = await prisma.oldRecord.findMany({
                where: { patient_id: null },
                orderBy: { id: 'desc' },
                take: 100
            });

            const formattedPatients = patients.map(p => ({ ...p, type: 'patient' }));
            const formattedRecords = unlinkedRecords.map(r => ({
                id: r.id,
                case_no: r.case_no,
                name: r.patient_name_manual,
                age: null, sex: null, address: null, phone: null, referred_by: null, referrer_phone: null,
                created_date: r.upload_date,
                file_path: r.file_path,
                description: r.description,
                type: 'old_record'
            }));

            res.json([...formattedPatients, ...formattedRecords]);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single patient + treatments (with seatings) + oldRecords
app.get('/api/patients/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const patient = await prisma.patient.findUnique({
            where: { id },
            include: {
                treatments: {
                    include: { visits: { orderBy: { id: 'desc' } } },
                    orderBy: { id: 'desc' }
                },
                old_records: { orderBy: { id: 'desc' } }
            }
        });

        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        // Format to match old structure
        const formattedTreatments = patient.treatments.map(t => ({
            ...t,
            sittings: t.visits
        }));

        res.json({
            patient: { ...patient, treatments: undefined, old_records: undefined },
            treatments: formattedTreatments,
            oldRecords: patient.old_records
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create patient
app.post('/api/patients', async (req, res) => {
    let { case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    name = (name || '').toUpperCase();
    case_no = (case_no || '').toUpperCase();
    sex = (sex || '').toUpperCase();
    address = (address || '').toUpperCase();
    referred_by = (referred_by || '').toUpperCase();

    try {
        const patient = await prisma.patient.create({
            data: {
                case_no,
                name,
                age: age ? parseInt(age) : null,
                sex,
                address,
                phone,
                referred_by,
                referrer_phone,
                created_date: created_date || getTodayFormatted()
            }
        });
        res.json({ id: patient.id, message: 'Patient registered successfully' });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(400).json({ error: 'Case number already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT update patient
app.put('/api/patients/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    let { case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date } = req.body;

    name = (name || '').toUpperCase();
    case_no = (case_no || '').toUpperCase();
    sex = (sex || '').toUpperCase();
    address = (address || '').toUpperCase();
    referred_by = (referred_by || '').toUpperCase();

    try {
        await prisma.patient.update({
            where: { id },
            data: {
                case_no,
                name,
                age: age ? parseInt(age) : null,
                sex,
                address,
                phone,
                referred_by,
                referrer_phone,
                created_date
            }
        });
        res.json({ message: 'Patient updated successfully' });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(400).json({ error: 'Case number already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE patient
app.delete('/api/patients/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.patient.delete({ where: { id } });
        res.json({ message: 'Patient deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════
//  TREATMENTS
// ════════════════════════════════════════════════════════════════

// GET treatments for a patient (optional; profile already includes these)
app.get('/api/patients/:id/treatments', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const treatments = await prisma.treatment.findMany({
            where: { patient_id: id },
            include: { visits: { orderBy: { id: 'desc' } } },
            orderBy: { id: 'desc' }
        });
        const formatted = treatments.map(t => ({ ...t, sittings: t.visits }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create treatment
app.post('/api/treatments', async (req, res) => {
    let { patient_id, name, description, created_date } = req.body;
    const pid = patient_id != null ? parseInt(patient_id, 10) : NaN;
    if (!name || (typeof name === 'string' && !name.trim())) return res.status(400).json({ error: 'Treatment name is required' });
    if (!pid || isNaN(pid)) return res.status(400).json({ error: 'Patient ID is required' });

    name = (name || '').toUpperCase();
    description = (description || '').toUpperCase();

    try {
        const treatment = await prisma.treatment.create({
            data: {
                patient_id: pid,
                name: (name && name.trim()) || name,
                description: description || null,
                created_date: (created_date && created_date.trim()) || getTodayFormatted()
            }
        });
        res.json({ id: treatment.id, message: 'Treatment created', sittings: [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET treatment report as PDF (patient + treatment + seatings) – must be before /:id
app.get('/api/treatments/:id/pdf', async (req, res) => {
    try {
        const treatmentId = parseInt(req.params.id);
        const treatment = await prisma.treatment.findUnique({
            where: { id: treatmentId },
            include: { patient: true, visits: { orderBy: { id: 'asc' } } }
        });

        if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
        const patient = treatment.patient;
        const sittings = treatment.visits;

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

        const margin = 40;
        const pageWidth = doc.page.width - margin * 2;
        let y = margin;

        doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000').text("VIMISHA'S DENTAL CLINIC", margin, y, { align: 'center' });
        y += 22;
        doc.fontSize(10).font('Helvetica').text('TREATMENT CASE RECORD', margin, y, { align: 'center' });
        y += 20;

        doc.moveTo(margin, y).lineTo(margin + pageWidth, y).strokeColor('#000000').lineWidth(1).stroke();
        y += 15;

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

        doc.font('Helvetica-Bold').fontSize(11).text('TREATMENT:', margin, y, { continued: true });
        doc.font('Helvetica').text(` ${safe(treatment.name)}`);
        y += 14;
        if (treatment.description) {
            doc.font('Helvetica-Bold').text('REMARKS:', margin, y, { continued: true });
            doc.font('Helvetica').text(` ${safe(treatment.description)}`);
            y += 14;
        }
        y += 15;

        doc.font('Helvetica-Bold').fontSize(11).text('SITTINGS / VISIT RECORDS', margin, y);
        y += 15;

        const headers = ['DATE', 'TIME', 'WORK DONE', 'FINDINGS', 'PAYMENT', 'NEXT APPT', 'NOTES'];
        const colWidths = [50, 40, 95, 80, 55, 65, 130];
        const rowHeight = 20;

        doc.rect(margin, y, pageWidth, rowHeight).stroke();
        let currentX = margin;
        doc.fontSize(8);
        headers.forEach((h, i) => {
            doc.text(h, currentX + 4, y + 6, { width: colWidths[i] - 8 });
            currentX += colWidths[i];
        });
        y += rowHeight;

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
app.get('/api/treatments/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const treatment = await prisma.treatment.findUnique({
            where: { id },
            include: { visits: { orderBy: { id: 'desc' } } }
        });
        if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
        res.json({ ...treatment, sittings: treatment.visits });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update treatment
app.put('/api/treatments/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let { name, description } = req.body;
        name = name ? name.toUpperCase() : name;
        description = description ? description.toUpperCase() : description;

        await prisma.treatment.update({
            where: { id },
            data: { name, description }
        });
        res.json({ message: 'Treatment updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE treatment (visits under it are deleted by cascade)
app.delete('/api/treatments/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.treatment.delete({ where: { id } });
        res.json({ message: 'Treatment deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════
//  VISITS (seatings)
// ════════════════════════════════════════════════════════════════

// GET today's appointments
app.get('/api/visits/today', async (req, res) => {
    const today = getTodayFormatted();
    try {
        const rows = await prisma.visit.findMany({
            where: {
                OR: [
                    { visit_date: today },
                    { next_appointment_date: today }
                ]
            },
            include: { patient: true },
            orderBy: { visit_time: 'asc' }
        });
        const formatted = rows.map(r => ({ ...r, patient_name: r.patient.name, case_no: r.patient.case_no }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET upcoming appointments
app.get('/api/visits/upcoming', async (req, res) => {
    try {
        const rows = await prisma.visit.findMany({
            where: {
                AND: [
                    { next_appointment_date: { not: null } },
                    { next_appointment_date: { not: '' } }
                ]
            },
            include: { patient: true },
            orderBy: { id: 'desc' }
        });
        const formatted = rows.map(r => ({ ...r, patient_name: r.patient.name, case_no: r.patient.case_no }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST create visit (seating) – requires treatment_id
app.post('/api/visits', async (req, res) => {
    let { treatment_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes } = req.body;
    if (!treatment_id) return res.status(400).json({ error: 'Treatment ID is required' });

    try {
        const tid = parseInt(treatment_id);
        const treatment = await prisma.treatment.findUnique({ where: { id: tid } });
        if (!treatment) return res.status(404).json({ error: 'Treatment not found' });
        const patient_id = treatment.patient_id;

        work_done = (work_done || '').toUpperCase();
        findings = (findings || '').toUpperCase();
        notes = (notes || '').toUpperCase();

        const visit = await prisma.visit.create({
            data: {
                patient_id,
                treatment_id: tid,
                visit_date: visit_date || getTodayFormatted(),
                visit_time,
                work_done,
                findings,
                payment: payment ? parseInt(payment) : 0,
                next_appointment_date,
                next_appointment_time,
                notes
            }
        });
        res.json({ id: visit.id, message: 'Sitting recorded successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT update visit (seating)
app.put('/api/visits/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    let { visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes } = req.body;

    try {
        const visit = await prisma.visit.findUnique({ where: { id } });
        if (!visit) return res.status(404).json({ error: 'Visit not found' });

        work_done = work_done !== undefined ? work_done.toUpperCase() : undefined;
        findings = findings !== undefined ? findings.toUpperCase() : undefined;
        notes = notes !== undefined ? notes.toUpperCase() : undefined;

        await prisma.visit.update({
            where: { id },
            data: {
                visit_date: visit_date !== undefined ? visit_date : visit.visit_date,
                visit_time: visit_time !== undefined ? visit_time : visit.visit_time,
                work_done: work_done !== undefined ? work_done : visit.work_done,
                findings: findings !== undefined ? findings : visit.findings,
                payment: payment !== undefined ? (parseInt(payment, 10) || 0) : visit.payment,
                next_appointment_date: next_appointment_date !== undefined ? next_appointment_date : visit.next_appointment_date,
                next_appointment_time: next_appointment_time !== undefined ? next_appointment_time : visit.next_appointment_time,
                notes: notes !== undefined ? notes : visit.notes
            }
        });
        res.json({ message: 'Visit updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE visit (seating)
app.delete('/api/visits/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.visit.delete({ where: { id } });
        res.json({ message: 'Visit deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════
//  PAYMENTS
// ════════════════════════════════════════════════════════════════

app.get('/api/payments', async (req, res) => {
    try {
        const rows = await prisma.visit.findMany({
            where: { payment: { gt: 0 } },
            include: { patient: true },
            orderBy: { id: 'desc' }
        });
        const formatted = rows.map(r => ({
            id: r.id,
            patient_id: r.patient_id,
            visit_date: r.visit_date,
            payment: r.payment,
            work_done: r.work_done,
            patient_name: r.patient.name,
            case_no: r.patient.case_no
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════
//  STATS (for dashboard)
// ════════════════════════════════════════════════════════════════

app.get('/api/stats', async (req, res) => {
    try {
        const totalPatients = await prisma.patient.count();
        const totalVisits = await prisma.visit.count();
        const totalRevenueResult = await prisma.visit.aggregate({
            _sum: { payment: true }
        });
        const totalRevenue = totalRevenueResult._sum.payment || 0;
        const totalOldRecords = await prisma.oldRecord.count();
        const recentPatients = await prisma.patient.findMany({
            orderBy: { id: 'desc' },
            take: 5
        });

        const today = getTodayFormatted();
        const todayAppointmentsRows = await prisma.visit.findMany({
            where: {
                OR: [
                    { visit_date: today },
                    { next_appointment_date: today }
                ]
            },
            include: { patient: true },
            orderBy: { visit_time: 'asc' }
        });
        const todayAppointments = todayAppointmentsRows.map(r => ({
            ...r,
            patient_name: r.patient.name,
            case_no: r.patient.case_no
        }));

        res.json({ totalPatients, totalVisits, totalRevenue, totalOldRecords, recentPatients, todayAppointments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════
//  OLD RECORDS
// ════════════════════════════════════════════════════════════════

// POST upload old record(s)
app.post('/api/old-records/upload', (req, res, next) => {
    upload.array('photos', 50)(req, res, (err) => {
        if (err) return next(err);
        next();
    });
}, async (req, res, next) => {
    try {
        const { patient_id, patient_name_manual, case_no, record_date, description } = req.body || {};
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'At least one photo is required' });
        }

        const uploadDate = getTodayFormatted();
        const ids = [];
        let newPatientId = null;

        let linkedPatientId = patient_id ? parseInt(patient_id, 10) : null;

        // If manual name provided and no existing patient linked, create a new patient
        if (!linkedPatientId && patient_name_manual) {
            const patient = await prisma.patient.create({
                data: { name: patient_name_manual, created_date: uploadDate }
            });
            linkedPatientId = patient.id;
            newPatientId = linkedPatientId;
        }

        const filePaths = [];
        for (const file of req.files) {
            filePaths.push('/uploads/old_records/' + file.filename);
        }

        const record = await prisma.oldRecord.create({
            data: {
                patient_id: linkedPatientId,
                patient_name_manual: patient_name_manual || null,
                case_no: case_no || null,
                record_date: record_date || '',
                upload_date: uploadDate,
                description: description || '',
                file_path: JSON.stringify(filePaths)
            }
        });
        ids.push(record.id);

        res.json({ ids, newPatientId, message: `1 record (${req.files.length} photos) uploaded successfully` });
    } catch (err) {
        next(err);
    }
});

// GET all old records (with search support)
app.get('/api/old-records', async (req, res) => {
    const search = req.query.search || '';
    try {
        let records;
        if (search) {
            records = await prisma.oldRecord.findMany({
                where: {
                    OR: [
                        { patient_name_manual: { contains: search, mode: 'insensitive' } },
                        { description: { contains: search, mode: 'insensitive' } },
                        { patient: { name: { contains: search, mode: 'insensitive' } } }
                    ]
                },
                include: { patient: true },
                orderBy: { id: 'desc' }
            });
        } else {
            records = await prisma.oldRecord.findMany({
                include: { patient: true },
                orderBy: { id: 'desc' }
            });
        }
        const formatted = records.map(r => ({
            ...r,
            linked_patient_name: r.patient ? r.patient.name : null,
            case_no: r.patient ? r.patient.case_no : r.case_no
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET old records for a specific patient
app.get('/api/old-records/:patientId', async (req, res) => {
    try {
        const patientId = parseInt(req.params.patientId);
        const rows = await prisma.oldRecord.findMany({
            where: { patient_id: patientId },
            orderBy: { id: 'desc' }
        });
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE an old record
app.delete('/api/old-records/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const record = await prisma.oldRecord.findUnique({ where: { id } });
        if (!record) return res.status(404).json({ error: 'Record not found' });

        const filename = record.file_path ? path.basename(record.file_path) : '';
        const fullPath = filename ? path.join(uploadsDir, filename) : null;
        if (fullPath && fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
        }

        await prisma.oldRecord.delete({ where: { id } });
        res.json({ message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
