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
            const result = await sql`
                INSERT INTO treatments 
                (patient_id, name, description, created_date)
                VALUES (${pid}, ${name}, ${description || null}, ${created_date || getTodayFormatted()})
                RETURNING id
            `;
            return res.json({ id: result[0].id, message: 'Treatment created', sittings: [] });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
