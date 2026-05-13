const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

function getTodayFormatted() {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    if (req.method === 'GET') {
        const today = getTodayFormatted();
        try {
            const rows = await sql`
                SELECT v.*, p.name as patient_name, p.case_no 
                FROM visits v
                JOIN patients p ON v.patient_id = p.id
                WHERE v.visit_date = ${today} 
                   OR v.next_appointment_date = ${today}
                ORDER BY v.visit_time ASC
            `;
            return res.json(rows);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
