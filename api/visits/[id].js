const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    const { id } = req.query;
    const visitId = parseInt(id);

    if (req.method === 'PUT') {
        let { visit_date, visit_time, work_done, findings, payment, next_appointment_date, next_appointment_time, notes } = req.body;

        try {
            work_done = (work_done || '').toUpperCase();
            findings = (findings || '').toUpperCase();
            notes = (notes || '').toUpperCase();

            await sql`
                UPDATE visits 
                SET visit_date = ${visit_date}, visit_time = ${visit_time}, 
                    work_done = ${work_done}, findings = ${findings}, 
                    payment = ${payment ? parseInt(payment) : 0}, 
                    next_appointment_date = ${next_appointment_date}, 
                    next_appointment_time = ${next_appointment_time}, 
                    notes = ${notes}
                WHERE id = ${visitId}
            `;
            return res.json({ message: 'Visit updated' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            await sql`DELETE FROM visits WHERE id = ${visitId}`;
            return res.json({ message: 'Visit deleted' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
