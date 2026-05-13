const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    const { id } = req.query;
    const treatmentId = parseInt(id);

    if (req.method === 'GET') {
        try {
            const treatments = await sql`SELECT * FROM treatments WHERE id = ${treatmentId}`;
            if (treatments.length === 0) return res.status(404).json({ error: 'Treatment not found' });
            
            const visits = await sql`
                SELECT * FROM visits 
                WHERE treatment_id = ${treatmentId} 
                ORDER BY id DESC
            `;
            
            return res.json({ ...treatments[0], sittings: visits });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'PUT') {
        let { name, description } = req.body;
        name = name ? name.toUpperCase() : name;
        description = description ? description.toUpperCase() : description;

        try {
            await sql`
                UPDATE treatments 
                SET name = ${name}, description = ${description} 
                WHERE id = ${treatmentId}
            `;
            return res.json({ message: 'Treatment updated' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            await sql`DELETE FROM visits WHERE treatment_id = ${treatmentId}`;
            await sql`DELETE FROM treatments WHERE id = ${treatmentId}`;
            return res.json({ message: 'Treatment deleted' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
