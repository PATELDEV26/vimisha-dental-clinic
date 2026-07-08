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
        let { patient_id, name, description, created_date } = req.body;
        const pid = patient_id != null ? parseInt(patient_id, 10) : NaN;
        
        if (!name || (typeof name === 'string' && !name.trim())) {
            return res.status(400).json({ error: 'Treatment name is required' });
        }
        if (!pid || isNaN(pid)) {
            return res.status(400).json({ error: 'Patient ID is required' });
        }

        name = (name || '').toUpperCase();
        description = (description || '').toUpperCase();

        try {
            // Ensure payment_method exists on live Vercel Postgres DB
            try { await sql`ALTER TABLE visits ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash'`; } catch (e) { }

            const result = await sql`
                INSERT INTO treatments 
                (patient_id, name, description, created_date)
                VALUES (${pid}, ${name}, ${description || null}, ${created_date || getTodayFormatted()})
                RETURNING id, created_date
            `;
            
            const treatmentId = result[0].id;
            const treatmentDate = result[0].created_date;
            
            let sittings = [];
            const paymentAmount = req.body.initial_payment ? parseInt(req.body.initial_payment, 10) : 0;
            const paymentMethod = req.body.payment_method || 'Cash';
            
            if (paymentAmount > 0) {
                const visit = await sql`
                    INSERT INTO visits
                    (patient_id, treatment_id, visit_date, work_done, payment, payment_method)
                    VALUES (${pid}, ${treatmentId}, ${treatmentDate}, 'INITIAL PAYMENT', ${paymentAmount}, ${paymentMethod})
                    RETURNING *
                `;
                sittings.push(visit[0]);
            }

            return res.json({ id: treatmentId, message: 'Treatment created', sittings });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
