// api/test.js
// Open https://crixgamingvr.com/api/test in a browser.
//
// If you see JSON, serverless functions are working and the problem is
// elsewhere. If you get a 404 or your site's error page, the api/ folder
// is not being deployed at all — which is the usual cause.

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const env = {
        DISCORD_CLIENT_ID:        !!process.env.DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET:    !!process.env.DISCORD_CLIENT_SECRET,
        DISCORD_REDIRECT_URI:     process.env.DISCORD_REDIRECT_URI || null,
        DISCORD_BOT_TOKEN:        !!process.env.DISCORD_BOT_TOKEN,
        DISCORD_GUILD_ID:         !!process.env.DISCORD_GUILD_ID,
        FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT,
        YOUTUBE_API_KEY:          !!process.env.YOUTUBE_API_KEY
    };

    const missing = Object.entries(env)
        .filter(([k, v]) => v === false)
        .map(([k]) => k);

    // firebase-admin is the one dependency the Discord function needs
    let firebaseAdmin = 'not installed';
    try {
        require('firebase-admin');
        firebaseAdmin = 'installed';
    } catch (e) {
        firebaseAdmin = 'MISSING — package.json may not be in the repo root';
    }

    return res.status(200).json({
        ok: true,
        message: 'Serverless functions are deploying correctly.',
        node: process.version,
        firebaseAdmin,
        environmentVariables: env,
        missing,
        nextStep: missing.length
            ? `Set these in Vercel → Settings → Environment Variables, then REDEPLOY: ${missing.join(', ')}`
            : 'Everything is configured. Discord linking should work.',
        time: new Date().toISOString()
    });
};
