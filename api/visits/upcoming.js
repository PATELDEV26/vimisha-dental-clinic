const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    if (req.method === 'GET') {
        try {
            const rows = await sql`
                SELECT v.*, p.name as patient_name, p.case_no 
                FROM visits v
                JOIN patients p ON v.patient_id = p.id
                WHERE v.next_appointment_date IS NOT NULL 
                  AND v.next_appointment_date != ''
                ORDER BY v.id DESC
            `;
            return res.json(rows);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
