// api/discord-auth.js
// Vercel Serverless Function — exchanges a Discord OAuth code for a Firebase
// custom token, so a Discord login maps to the SAME Firebase account every time.
//
// WHY THIS EXISTS
// ---------------
// The previous flow called signInAnonymously(), which mints a NEW Firebase UID
// on every login. Because PlayFab keys off that UID, players lost their coins,
// level, rank and friends each time they signed in with Discord.
//
// This returns a custom token with uid = "discord:<their discord id>", which is
// stable forever. It also keeps the Discord client secret server-side.
//
// SETUP — Vercel → Settings → Environment Variables
// -------------------------------------------------
//   DISCORD_CLIENT_ID       from discord.com/developers
//   DISCORD_CLIENT_SECRET   same page (never goes in api.json)
//   DISCORD_REDIRECT_URI    https://crixgamingvr.com/flappycrix
//   FIREBASE_SERVICE_ACCOUNT   the whole service-account JSON, as one line
//        Firebase Console → Project Settings → Service Accounts
//        → Generate new private key → paste the file contents
//
// Then: npm i firebase-admin  (add it to package.json dependencies)

const admin = require('firebase-admin');

const ALLOWED_ORIGINS = [
    'https://crixgamingvr.com',
    'https://www.crixgamingvr.com'
];

function getAdmin() {
    if (admin.apps.length) return admin;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    let cred;
    try {
        cred = JSON.parse(raw);
    } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    }
    // Vercel turns real newlines in env vars into literal \n
    if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    return admin;
}

module.exports = async (req, res) => {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
    const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
    const REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI || 'https://crixgamingvr.com/flappycrix';

    if (!CLIENT_ID || !CLIENT_SECRET) {
        return res.status(500).json({
            error: 'Server not configured',
            detail: 'DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be set in Vercel.'
        });
    }

    const code = req.body?.code;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    try {
        // 1. Exchange the one-time code for an access token
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            })
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
            return res.status(400).json({
                error: 'Discord rejected the code',
                detail: tokenData.error_description || tokenData.error ||
                        'The redirect URI must match the Discord portal exactly.'
            });
        }

        // 2. Read the Discord profile
        const userRes = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const u = await userRes.json();
        if (!u.id) return res.status(502).json({ error: 'Could not read Discord profile' });

        // 3. Mint a Firebase token with a STABLE uid derived from the Discord id
        const uid = `discord:${u.id}`;
        const displayName = u.global_name || u.username || `User_${u.id}`;
        const photoURL = u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) >> 22n) % 6}.png`;

        const fb = getAdmin();

        // Keep the Auth user record in step with their Discord profile
        try {
            await fb.auth().updateUser(uid, { displayName, photoURL });
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                await fb.auth().createUser({ uid, displayName, photoURL });
            }
        }

        const customToken = await fb.auth().createCustomToken(uid, {
            provider: 'discord',
            discordId: u.id
        });

        return res.status(200).json({
            token: customToken,
            profile: { id: u.id, username: u.username, displayName, photoURL }
        });

    } catch (e) {
        console.error('[discord-auth]', e);
        return res.status(500).json({ error: 'Sign-in failed', detail: e.message });
    }
};
