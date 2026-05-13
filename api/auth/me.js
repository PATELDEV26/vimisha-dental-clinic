const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    // Check authentication
    // Note: requireAuth will handle sending 401 if not authed
    requireAuth(req, res);
    
    if (res.headersSent) return;

    if (req.method === 'GET') {
        // req.session.user should be populated by requireAuth if it's there
        return res.json(req.session.user);
    }

    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
};
