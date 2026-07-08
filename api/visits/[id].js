const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    const { id } = req.query;
    const numericId = parseInt(id);

    if (req.method === 'GET') {
        try {
            const visits = await sql`
                SELECT * FROM visits 
                WHERE patient_id = ${numericId} 
                ORDER BY id DESC
            `;
            return res.json(visits);
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'PUT') {
        let { visit_date, payment, payment_method } = req.body;

        try {
            // Ensure payment_method exists on live Vercel Postgres DB
            try { await sql`ALTER TABLE visits ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'Cash'`; } catch (e) { }

            await sql`
                UPDATE visits 
                SET visit_date = ${visit_date}, 
                    payment = ${payment ? parseInt(payment) : 0}, 
                    payment_method = ${payment_method || 'Cash'}
                WHERE id = ${numericId}
            `;
            return res.json({ message: 'Payment updated' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            await sql`DELETE FROM visits WHERE id = ${numericId}`;
            return res.json({ message: 'Visit deleted' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
