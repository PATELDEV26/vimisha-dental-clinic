// This is a simplified version. In a real app, you'd use a library like 'openid-client' or '@auth/core'
// but for this conversion, we'll implement the redirect logic.

module.exports = async (req, res) => {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const options = {
        redirect_uri: `${process.env.BASE_URL}/api/auth/callback`,
        client_id: process.env.GOOGLE_CLIENT_ID,
        access_type: 'offline',
        response_type: 'code',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
        ].join(' '),
    };

    const queryString = new URLSearchParams(options).toString();
    return res.redirect(`${rootUrl}?${queryString}`);
};
