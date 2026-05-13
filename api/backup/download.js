const { requireAuth } = require('../../lib/auth');

module.exports = async (req, res) => {
    const authError = requireAuth(req, res);
    if (authError) return;

    return res.status(501).json({ 
        message: "Backups are now automatically handled by Neon (Database) and Cloudinary (Files). Manual SQLite backup download is no longer available in the cloud version." 
    });
};
