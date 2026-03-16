const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'clinic.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create Tables ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_no TEXT UNIQUE,
    name TEXT NOT NULL,
    age INTEGER,
    sex TEXT,
    address TEXT,
    phone TEXT,
    referred_by TEXT,
    referrer_phone TEXT,
    created_date TEXT
  );

  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    visit_date TEXT,
    visit_time TEXT,
    work_done TEXT,
    findings TEXT,
    payment INTEGER DEFAULT 0,
    next_appointment_date TEXT,
    next_appointment_time TEXT,
    notes TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS old_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER,
    patient_name_manual TEXT,
    case_no TEXT,
    record_date TEXT,
    upload_date TEXT,
    description TEXT,
    file_path TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS treatments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_date TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
  );
`);

// Add treatment_id to visits if missing (e.g. existing DBs)
const visitCols = db.prepare("PRAGMA table_info(visits)").all().map(r => r.name);
if (!visitCols.includes('treatment_id')) {
  db.exec('ALTER TABLE visits ADD COLUMN treatment_id INTEGER');
}

// Add case_no to old_records if missing (e.g. existing DBs)
const oldRecordCols = db.prepare("PRAGMA table_info(old_records)").all().map(r => r.name);
if (!oldRecordCols.includes('case_no')) {
  db.exec('ALTER TABLE old_records ADD COLUMN case_no TEXT');
  console.log('✅ Added case_no to old_records.');
}

// ── Migration: assign existing visits to a "Legacy" treatment per patient ──
const needsMigration = db.prepare('SELECT 1 FROM visits WHERE treatment_id IS NULL LIMIT 1').get();
if (needsMigration) {
  const patientIds = db.prepare('SELECT DISTINCT patient_id FROM visits WHERE treatment_id IS NULL').all();
  const insertTreatment = db.prepare(`
    INSERT INTO treatments (patient_id, name, description, created_date)
    VALUES (?, 'Legacy', 'Migrated visit history', date('now'))
  `);
  const updateVisits = db.prepare('UPDATE visits SET treatment_id = ? WHERE patient_id = ? AND treatment_id IS NULL');
  db.transaction(() => {
    for (const { patient_id } of patientIds) {
      const info = insertTreatment.run(patient_id);
      updateVisits.run(info.lastInsertRowid, patient_id);
    }
  })();
  console.log('✅ Migrated existing visits to Legacy treatments.');
}

// ── Seed Data (only if DB is empty) ────────────────────────────
const count = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
if (count === 0) {
  const insertPatient = db.prepare(`
    INSERT INTO patients (case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date)
    VALUES (@case_no, @name, @age, @sex, @address, @phone, @referred_by, @referrer_phone, @created_date)
  `);
  const insertTreatment = db.prepare(`
    INSERT INTO treatments (patient_id, name, description, created_date)
    VALUES (?, ?, ?, ?)
  `);
  const insertVisit = db.prepare(`
    INSERT INTO visits (patient_id, treatment_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes)
    VALUES (@patient_id, @treatment_id, @visit_date, @visit_time, @work_done, @findings, @payment, @next_appointment_date, @next_appointment_time, @notes)
  `);

  const seed = db.transaction(() => {
    const info = insertPatient.run({
      case_no: 'K 8 133',
      name: 'Shalantala Kalci',
      age: 72,
      sex: 'F',
      address: 'Sheetningen',
      phone: '63590-21933',
      referred_by: 'Subhash Bhai Patel',
      referrer_phone: '875829 5490',
      created_date: '7/8/24'
    });

    const patientId = info.lastInsertRowid;
    const treatmentInfo = insertTreatment.run(patientId, 'Legacy', 'Migrated visit history', '7/8/24');
    const treatmentId = treatmentInfo.lastInsertRowid;

    insertVisit.run({
      patient_id: patientId,
      treatment_id: treatmentId,
      visit_date: '7/8/24',
      visit_time: '10:30',
      work_done: 'Filling 6|64 done. Adv crown cleaning. SCtpal SCtpal 1 done.',
      findings: '',
      payment: 1500,
      next_appointment_date: '20/1/26',
      next_appointment_time: '6:00',
      notes: ''
    });

    insertVisit.run({
      patient_id: patientId,
      treatment_id: treatmentId,
      visit_date: '20/1/26',
      visit_time: '',
      work_done: '',
      findings: 'Gingival inflammation, spongy gums, severe bleeding',
      payment: 0,
      next_appointment_date: '',
      next_appointment_time: '',
      notes: ''
    });
  });

  seed();
  console.log('✅ Database seeded with sample data.');
}

module.exports = db;
