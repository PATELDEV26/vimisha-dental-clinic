const Database = require('better-sqlite3');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);
const localDb = new Database('./clinic.db');

async function migrate() {
  console.log('Starting migration...');
  
  // 1. Patients
  const patients = localDb.prepare('SELECT * FROM patients').all();
  console.log(`Migrating ${patients.length} patients...`);
  for (const p of patients) {
    await sql`
      INSERT INTO patients 
      (id, case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date)
      VALUES (${p.id}, ${p.case_no}, ${p.name}, ${p.age}, ${p.sex}, ${p.address}, ${p.phone},
              ${p.referred_by}, ${p.referrer_phone}, ${p.created_date})
      ON CONFLICT (id) DO UPDATE SET
        case_no = EXCLUDED.case_no,
        name = EXCLUDED.name,
        age = EXCLUDED.age,
        sex = EXCLUDED.sex,
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        referred_by = EXCLUDED.referred_by,
        referrer_phone = EXCLUDED.referrer_phone,
        created_date = EXCLUDED.created_date
    `;
  }

  // 2. Treatments (If they exist in SQLite - check schema first)
  try {
      const treatments = localDb.prepare('SELECT * FROM treatments').all();
      console.log(`Migrating ${treatments.length} treatments...`);
      for (const t of treatments) {
        await sql`
          INSERT INTO treatments
          (id, patient_id, name, description, created_date)
          VALUES (${t.id}, ${t.patient_id}, ${t.name}, ${t.description}, ${t.created_date})
          ON CONFLICT (id) DO NOTHING
        `;
      }
  } catch (e) {
      console.log('No treatments table found in SQLite or error migrating treatments.');
  }
  
  // 3. Visits
  const visits = localDb.prepare('SELECT * FROM visits').all();
  console.log(`Migrating ${visits.length} visits...`);
  for (const v of visits) {
    await sql`
      INSERT INTO visits
      (id, patient_id, treatment_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes)
      VALUES (${v.id}, ${v.patient_id}, ${v.treatment_id || null}, ${v.visit_date}, ${v.visit_time}, ${v.work_done},
              ${v.findings}, ${v.payment}, ${v.next_appointment_date}, ${v.next_appointment_time}, ${v.notes})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // 4. Old Records
  const oldRecords = localDb.prepare('SELECT * FROM old_records').all();
  console.log(`Migrating ${oldRecords.length} old records...`);
  for (const r of oldRecords) {
    await sql`
      INSERT INTO old_records
      (id, patient_id, patient_name_manual, case_no, record_date, upload_date, description, file_path, file_url)
      VALUES (${r.id}, ${r.patient_id}, ${r.patient_name_manual}, ${r.case_no}, ${r.record_date}, ${r.upload_date}, ${r.description}, ${r.file_path}, ${r.file_url})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  
  console.log('Migration complete!');
  localDb.close();
}

migrate().catch(console.error);
