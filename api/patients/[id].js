const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    // Check authentication
    const authError = requireAuth(req, res);
    if (authError) return;

    const { id } = req.query;
    const patientId = parseInt(id);

    if (req.method === 'GET') {
        try {
            const patients = await sql`SELECT * FROM patients WHERE id = ${patientId}`;
            if (patients.length === 0) return res.status(404).json({ error: 'Patient not found' });
            
            const treatments = await sql`
                SELECT * FROM treatments 
                WHERE patient_id = ${patientId} 
                ORDER BY id DESC
            `;
            
            // For each treatment, get visits
            for (let t of treatments) {
                t.sittings = await sql`
                    SELECT * FROM visits 
                    WHERE treatment_id = ${t.id} 
                    ORDER BY id DESC
                `;
            }

            const oldRecords = await sql`
                SELECT * FROM old_records 
                WHERE patient_id = ${patientId} 
                ORDER BY id DESC
            `;

            return res.json({
                patient: patients[0],
                treatments: treatments,
                oldRecords: oldRecords
            });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'PUT') {
        let { case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date } = req.body;

        name = (name || '').toUpperCase();
        case_no = (case_no || '').toUpperCase();
        sex = (sex || '').toUpperCase();
        address = (address || '').toUpperCase();
        referred_by = (referred_by || '').toUpperCase();

        try {
            await sql`
                UPDATE patients 
                SET case_no = ${case_no}, name = ${name}, age = ${age ? parseInt(age) : null}, 
                    sex = ${sex}, address = ${address}, phone = ${phone}, 
                    referred_by = ${referred_by}, referrer_phone = ${referrer_phone}, 
                    created_date = ${created_date}
                WHERE id = ${patientId}
            `;
            return res.json({ message: 'Patient updated successfully' });
        } catch (err) {
            if (err.message.includes('unique constraint') || err.code === '23505') {
                return res.status(400).json({ error: 'Case number already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            // Neon/Postgres doesn't necessarily have cascade unless defined in schema
            // But let's assume we want to delete related data if not cascaded
            await sql`DELETE FROM visits WHERE patient_id = ${patientId}`;
            await sql`DELETE FROM old_records WHERE patient_id = ${patientId}`;
            await sql`DELETE FROM patients WHERE id = ${patientId}`;
            return res.json({ message: 'Patient deleted' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
