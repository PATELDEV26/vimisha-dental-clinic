const { PrismaClient } = require('@prisma/client');
const Database = require('better-sqlite3');
const prisma = new PrismaClient();
const db = new Database('./clinic.db');

async function migrate() {
  console.log('🚀 Starting migration from clinic.db to PostgreSQL...');

  try {
    // 1. Patients
    const oldPatients = db.prepare('SELECT * FROM patients').all();
    console.log(`Found ${oldPatients.length} patients in SQLite.`);
    
    const patientMap = new Map(); // oldId -> newId

    for (const p of oldPatients) {
      const { id, ...data } = p;
      const newP = await prisma.patient.create({ data });
      patientMap.set(id, newP.id);
    }
    console.log('✅ Patients migrated.');

    // 2. Treatments
    const oldTreatments = db.prepare('SELECT * FROM treatments').all();
    console.log(`Found ${oldTreatments.length} treatments in SQLite.`);
    
    const treatmentMap = new Map(); // oldId -> newId

    for (const t of oldTreatments) {
      const { id, patient_id, ...data } = t;
      const newPatientId = patientMap.get(patient_id);
      if (newPatientId) {
        const newT = await prisma.treatment.create({
          data: {
            ...data,
            patient_id: newPatientId
          }
        });
        treatmentMap.set(id, newT.id);
      } else {
        console.warn(`Skipping treatment ${id} because patient ${patient_id} not found.`);
      }
    }
    console.log('✅ Treatments migrated.');

    // 3. Visits
    const oldVisits = db.prepare('SELECT * FROM visits').all();
    console.log(`Found ${oldVisits.length} visits in SQLite.`);

    for (const v of oldVisits) {
      const { id, patient_id, treatment_id, ...data } = v;
      const newPatientId = patientMap.get(patient_id);
      const newTreatmentId = treatment_id ? treatmentMap.get(treatment_id) : null;
      
      if (newPatientId) {
        await prisma.visit.create({
          data: {
            ...data,
            patient_id: newPatientId,
            treatment_id: newTreatmentId
          }
        });
      } else {
        console.warn(`Skipping visit ${id} because patient ${patient_id} not found.`);
      }
    }
    console.log('✅ Visits migrated.');

    // 4. Old Records
    const oldRecords = db.prepare('SELECT * FROM old_records').all();
    console.log(`Found ${oldRecords.length} old records in SQLite.`);

    for (const r of oldRecords) {
      const { id, patient_id, ...data } = r;
      const newPatientId = patient_id ? patientMap.get(patient_id) : null;
      
      await prisma.oldRecord.create({
        data: {
          ...data,
          patient_id: newPatientId
        }
      });
    }
    console.log('✅ Old records migrated.');

    console.log('🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
    db.close();
  }
}

migrate();
