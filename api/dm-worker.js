/**
 * api/dm-worker.js — delivers the queued Discord DMs
 *
 * Two places in this codebase write to the `dmQueue` collection: the game when
 * a Discord account is linked, and playfab-manager when staff send someone a
 * message. Nothing read it. The queue simply filled up and no DM was ever
 * delivered, which is why the bot appeared to do nothing.
 *
 * Runs on a schedule from vercel.json, and can be poked by hand:
 *
 *     curl -X POST https://crixgamingvr.com/api/dm-worker \
 *          -H "x-dm-secret: $DM_WORKER_SECRET"
 *
 * Environment:
 *     DISCORD_BOT_TOKEN        the bot that sends the messages   (required)
 *     FIREBASE_SERVICE_ACCOUNT the service account JSON, one line (required)
 *     DM_WORKER_SECRET         shared secret for manual runs      (optional)
 *     CRON_SECRET              set by Vercel Cron                 (optional)
 */

const admin = require('firebase-admin');

const SITE = process.env.SITE_ORIGIN || 'https://crixgamingvr.com';
const BATCH = 25;          // Discord rate limits; a small batch per run is kinder

function getAdmin() {
    if (admin.apps.length) return admin;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    let cred;
    try {
        cred = JSON.parse(raw);
    } catch (e) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON: ' + e.message);
    }
    // Vercel's env editor turns real newlines in the private key into \n
    if (cred.private_key && cred.private_key.includes('\\n')) {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    return admin;
}

/* The message bodies. `kind` comes from whoever queued it. */
function buildEmbed(job) {
    const base = { color: 0xFF4655, timestamp: new Date().toISOString(),
                   footer: { text: 'Turn these off any time — Settings → Discord → Unlink' } };
    switch (job.kind) {
        case 'linked':
            return { ...base, title: '👋 Hey, I am Flappy Crix',
                description: 'Your Discord is now linked to the game.\n\n' +
                    'I will message you here about:\n' +
                    '🎉  New updates and what changed\n' +
                    '🔨  Moderation action on your account\n' +
                    '🏆  Rank milestones',
                fields: [{ name: '🎮 Play', value: `[Open the game](${SITE}/flappycrix)`, inline: true }] };
        case 'moderation':
            return { ...base, title: '🔨 Action on your account',
                description: job.message || 'A moderator has acted on your account.',
                color: 0xFF8A00 };
        case 'rank':
            return { ...base, title: '🏆 Rank up',
                description: job.message || 'You reached a new rank.', color: 0x00CC7A };
        case 'update':
            return { ...base, title: '🎉 Flappy Crix updated',
                description: job.message || 'There is a new version.' };
        default:
            return { ...base, title: 'Flappy Crix',
                description: job.message || 'You have a new message.' };
    }
}

async function sendDm(token, discordId, embed) {
    // A bot can only open a DM with someone who shares a server with it, so a
    // 403 here usually means they never joined, not that anything is broken.
    const open = await fetch('https://discord.com/api/v10/users/@me/channels', {
        method: 'POST',
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: String(discordId) })
    });
    const channel = await open.json().catch(() => ({}));
    if (!open.ok || !channel.id) {
        return { ok: false, error: `open DM ${open.status}: ${channel.message || 'no channel'}` };
    }
    const post = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
    });
    if (post.status === 429) {
        const body = await post.json().catch(() => ({}));
        return { ok: false, retry: true, error: `rate limited, retry after ${body.retry_after}s` };
    }
    if (!post.ok) {
        const body = await post.json().catch(() => ({}));
        return { ok: false, error: `send ${post.status}: ${body.message || 'failed'}` };
    }
    return { ok: true };
}

module.exports = async (req, res) => {
    // Vercel Cron sends GET; a manual poke sends POST with the shared secret.
    const secret = process.env.DM_WORKER_SECRET;
    const fromCron = !!(req.headers['x-vercel-cron'] ||
        (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`));
    if (!fromCron && secret && req.headers['x-dm-secret'] !== secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
        return res.status(500).json({ error: 'DISCORD_BOT_TOKEN is not set — nothing can be delivered' });
    }

    let db;
    try { db = getAdmin().firestore(); }
    catch (e) { return res.status(500).json({ error: e.message }); }

    let snap;
    try {
        snap = await db.collection('dmQueue').where('sent', '==', false).limit(BATCH).get();
    } catch (e) {
        // An index or a rules problem here is exactly the sort of thing that
        // has been failing quietly, so it gets named.
        return res.status(500).json({ error: 'Could not read dmQueue: ' + e.message });
    }

    const out = { scanned: snap.size, sent: 0, failed: 0, details: [] };
    for (const doc of snap.docs) {
        const job = doc.data() || {};
        if (!job.discordId) {
            await doc.ref.set({ sent: true, error: 'no discordId', sentAt: Date.now() }, { merge: true });
            out.failed++;
            out.details.push({ id: doc.id, error: 'no discordId' });
            continue;
        }
        const r = await sendDm(token, job.discordId, buildEmbed(job));
        if (r.ok) {
            await doc.ref.set({ sent: true, sentAt: Date.now() }, { merge: true });
            out.sent++;
        } else if (r.retry) {
            // leave it queued for the next run
            out.details.push({ id: doc.id, error: r.error, requeued: true });
        } else {
            const tries = (job.tries || 0) + 1;
            // Give up after three, or a permanently closed DM retries forever.
            await doc.ref.set({ tries, error: r.error, sent: tries >= 3,
                                sentAt: tries >= 3 ? Date.now() : null }, { merge: true });
            out.failed++;
            out.details.push({ id: doc.id, error: r.error, tries });
        }
    }
    return res.status(200).json(out);
};
