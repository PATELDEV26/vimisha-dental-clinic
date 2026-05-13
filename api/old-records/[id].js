const sql = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    const { id } = req.query;
    const recordId = parseInt(id);

    if (req.method === 'DELETE') {
        try {
            // Note: In a real app, you might want to also delete from Cloudinary
            // but the request only asked to delete the record.
            await sql`DELETE FROM old_records WHERE id = ${recordId}`;
            return res.json({ message: 'Record deleted successfully' });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    res.setHeader('Allow', ['DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
