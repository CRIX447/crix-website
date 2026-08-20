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

const SITE_ORIGIN = process.env.SITE_URL || 'https://crixgamingvr.com';
const GAME_LINK   = `${SITE_ORIGIN}/flappycrix`;
const GAME_HOST   = GAME_LINK.replace('https://', '');

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
    const linkMode = req.body?.link === true;      // attaching to an existing account
    const linkUid  = req.body?.uid || null;
    if (!code) return res.status(400).json({ error: 'Missing code' });
    if (linkMode && !linkUid) return res.status(400).json({ error: 'Missing uid for linking' });

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

        // 2b. Add them to the Discord server, if configured.
        // Done quietly — a failure here should never block sign-in.
        let joinedGuild = false;
        const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
        const GUILD_ID  = process.env.DISCORD_GUILD_ID;
        if (BOT_TOKEN && GUILD_ID && tokenData.scope && tokenData.scope.includes('guilds.join')) {
            try {
                const join = await fetch(
                    `https://discord.com/api/guilds/${GUILD_ID}/members/${u.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bot ${BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ access_token: tokenData.access_token })
                    });
                // 201 = added, 204 = already a member
                joinedGuild = join.status === 201 || join.status === 204;
            } catch (e) {
                console.warn('[discord-auth] guild join failed:', e.message);
            }
        }

        // 2c. Welcome DM. Quiet on failure — plenty of people have DMs from
        // servers switched off, and that is their choice, not an error.
        if (BOT_TOKEN) {
            try {
                const dm = await fetch('https://discord.com/api/users/@me/channels', {
                    method: 'POST',
                    headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recipient_id: u.id })
                });
                const channel = await dm.json();
                if (channel.id) {
                    await fetch(`https://discord.com/api/channels/${channel.id}/messages`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: '👋 Hey, I am Flappy Crix',
                                description:
                                    `Your Discord is now linked to the game.\n\n` +
                                    `I will message you here about:\n` +
                                    `🎉  New updates and what changed\n` +
                                    `🔨  Moderation action on your account\n` +
                                    `🏆  Rank milestones\n\n` +
                                    `**Try these in the server**\n` +
                                    `\`/stats\` — show off your rank\n` +
                                    `\`/leaderboard\` — see the top players\n` +
                                    `\`/patchnotes\` — what changed recently`,
                                color: 0xFF4655,
                                thumbnail: { url: `${SITE_ORIGIN}/img/newfavicon.png` },
                                fields: [
                                    { name: '🎮 Play', value: `[${GAME_HOST}](${GAME_LINK})`, inline: true },
                                    { name: '💬 Chat', value: `[Open CRIX Chat](${SITE_ORIGIN}/crixchat)`, inline: true }
                                ],
                                footer: { text: 'Turn these off any time — Settings → Discord → Unlink' },
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                }
            } catch (e) {
                console.warn('[discord-auth] welcome DM failed:', e.message);
            }
        }

        // Linking attaches Discord to an account that already exists, so there
        // is no token to mint — the caller is already signed in.
        if (linkMode) {
            return res.status(200).json({
                linked: true,
                joinedGuild,
                profile: {
                    id: u.id,
                    username: u.username,
                    displayName: u.global_name || u.username,
                    photoURL: u.avatar
                        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : null
                }
            });
        }

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
            profile: { id: u.id, username: u.username, displayName, photoURL },
            joinedGuild
        });

    } catch (e) {
        console.error('[discord-auth]', e);
        return res.status(500).json({ error: 'Sign-in failed', detail: e.message });
    }
};
