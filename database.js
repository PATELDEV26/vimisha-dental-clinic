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
    record_date TEXT,
    upload_date TEXT,
    description TEXT,
    file_path TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
  );
`);

// ── Seed Data (only if DB is empty) ────────────────────────────
const count = db.prepare('SELECT COUNT(*) AS c FROM patients').get().c;
if (count === 0) {
  const insertPatient = db.prepare(`
    INSERT INTO patients (case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date)
    VALUES (@case_no, @name, @age, @sex, @address, @phone, @referred_by, @referrer_phone, @created_date)
  `);

  const insertVisit = db.prepare(`
    INSERT INTO visits (patient_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes)
    VALUES (@patient_id, @visit_date, @visit_time, @work_done, @findings, @payment, @next_appointment_date, @next_appointment_time, @notes)
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

    insertVisit.run({
      patient_id: patientId,
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
