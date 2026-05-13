const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    const { patientId } = req.query;
    const pid = parseInt(patientId);

    if (req.method === 'GET') {
        try {
            const visits = await sql`
                SELECT * FROM visits 
                WHERE patient_id = ${pid} 
                ORDER BY id DESC
            `;
            return res.json(visits);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
