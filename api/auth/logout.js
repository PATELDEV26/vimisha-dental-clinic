module.exports = async (req, res) => {
    res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return res.redirect('/login.html');
};
