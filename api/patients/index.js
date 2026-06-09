const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

function getTodayFormatted() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

module.exports = async (req, res) => {
    // Check authentication
    const authError = requireAuth(req, res);
    if (authError) return;

    if (req.method === 'GET') {
        const search = (req.query.search || '').trim();
        try {
            let patients;
            if (search) {
                const searchPattern = `%${search}%`;
                patients = await sql`
                    SELECT *, 'patient' as type FROM patients 
                    WHERE name ILIKE ${searchPattern} 
                       OR case_no ILIKE ${searchPattern} 
                       OR phone ILIKE ${searchPattern}
                    ORDER BY NULLIF(TRIM(case_no), '') ASC NULLS LAST
                    LIMIT 100
                `;
                
                const unlinkedRecords = await sql`
                    SELECT id, case_no, patient_name_manual as name, 
                           NULL as age, NULL as sex, NULL as address, NULL as phone, 
                           NULL as referred_by, NULL as referrer_phone,
                           upload_date as created_date, file_path, description, 
                           'old_record' as type
                    FROM old_records
                    WHERE patient_id IS NULL
                      AND (patient_name_manual ILIKE ${searchPattern} 
                           OR case_no ILIKE ${searchPattern} 
                           OR description ILIKE ${searchPattern})
                    ORDER BY NULLIF(TRIM(case_no), '') ASC NULLS LAST
                    LIMIT 100
                `;
                return res.json([...patients, ...unlinkedRecords]);
            } else {
                patients = await sql`
                    SELECT *, 'patient' as type FROM patients 
                    ORDER BY NULLIF(TRIM(case_no), '') ASC NULLS LAST
                    LIMIT 100
                `;
                const unlinkedRecords = await sql`
                    SELECT id, case_no, patient_name_manual as name, 
                           NULL as age, NULL as sex, NULL as address, NULL as phone, 
                           NULL as referred_by, NULL as referrer_phone,
                           upload_date as created_date, file_path, description, 
                           'old_record' as type
                    FROM old_records
                    WHERE patient_id IS NULL
                    ORDER BY NULLIF(TRIM(case_no), '') ASC NULLS LAST
                    LIMIT 100
                `;
                return res.json([...patients, ...unlinkedRecords]);
            }
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'POST') {
        let { case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        name = (name || '').toUpperCase();
        case_no = (case_no || '').toUpperCase();
        sex = (sex || '').toUpperCase();
        address = (address || '').toUpperCase();
        referred_by = (referred_by || '').toUpperCase();

        try {
            const result = await sql`
                INSERT INTO patients 
                (case_no, name, age, sex, address, phone, referred_by, referrer_phone, created_date)
                VALUES (${case_no}, ${name}, ${age ? parseInt(age) : null}, ${sex}, 
                        ${address}, ${phone}, ${referred_by}, ${referrer_phone}, 
                        ${created_date || getTodayFormatted()})
                RETURNING id
            `;
            return res.json({ id: result[0].id, message: 'Patient registered successfully' });
        } catch (err) {
            if (err.message.includes('unique constraint') || err.code === '23505') {
                return res.status(400).json({ error: 'Case number already exists' });
            }
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
