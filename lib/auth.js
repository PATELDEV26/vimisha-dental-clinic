const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(',').map(e => e.trim().toLowerCase());

function requireAuth(req, res, next) {
  // Simple cookie parsing
  const cookie = req.headers.cookie || "";
  const sessionCookie = cookie.split(';').find(c => c.trim().startsWith('session='));
  
  if (sessionCookie) {
    try {
      const base64 = sessionCookie.split('=')[1];
      req.session = JSON.parse(Buffer.from(base64, 'base64').toString());
    } catch (e) {
      req.session = null;
    }
  } else {
    req.session = null;
  }

  if (!req.session || !req.session.user) {
    if (res) res.status(401).json({ error: 'Unauthorized' });
    return true; // Error happened
  }

  const email = req.session.user.email ? req.session.user.email.toLowerCase() : '';
  if (!ALLOWED_EMAILS.includes(email)) {
    if (res) res.status(403).json({ error: 'Forbidden' });
    return true; // Error happened
  }

  if (next) next();
  return false; // No error
}

module.exports = { requireAuth, ALLOWED_EMAILS };
