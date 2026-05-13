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
        let { treatment_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes } = req.body;
        if (!treatment_id) return res.status(400).json({ error: 'Treatment ID is required' });

        try {
            const tid = parseInt(treatment_id);
            const treatments = await sql`SELECT patient_id FROM treatments WHERE id = ${tid}`;
            if (treatments.length === 0) return res.status(404).json({ error: 'Treatment not found' });
            const patient_id = treatments[0].patient_id;

            work_done = (work_done || '').toUpperCase();
            findings = (findings || '').toUpperCase();
            notes = (notes || '').toUpperCase();

            const result = await sql`
                INSERT INTO visits 
                (patient_id, treatment_id, visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes)
                VALUES (${patient_id}, ${tid}, ${visit_date || getTodayFormatted()}, ${visit_time}, ${work_done}, ${findings}, 
                        ${payment ? parseInt(payment) : 0}, ${next_appointment_date}, ${next_appointment_time}, ${notes})
                RETURNING id
            `;
            return res.json({ id: result[0].id, message: 'Sitting recorded successfully' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
