const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

function getTodayFormatted() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    if (req.method === 'POST') {
        let { treatment_id, visit_date, payment, payment_method } = req.body;
        if (!treatment_id) return res.status(400).json({ error: 'Treatment ID is required' });

        try {
            const tid = parseInt(treatment_id);
            const treatments = await sql`SELECT patient_id FROM treatments WHERE id = ${tid}`;
            if (treatments.length === 0) return res.status(404).json({ error: 'Treatment not found' });
            const patient_id = treatments[0].patient_id;
            
            // Ensure payment_method exists on live Vercel Postgres DB
            try { await sql`ALTER TABLE visits ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash'`; } catch (e) { }

            const result = await sql`
                INSERT INTO visits 
                (patient_id, treatment_id, visit_date, payment, payment_method, work_done)
                VALUES (${patient_id}, ${tid}, ${visit_date || getTodayFormatted()}, ${payment ? parseInt(payment) : 0}, ${payment_method || 'Cash'}, 'PAYMENT')
                RETURNING id
            `;
            return res.json({ id: result[0].id, message: 'Payment recorded successfully' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
