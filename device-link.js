// api/device-link.js
// Lets a console sign in by entering a code on a phone.
//
// WHY THIS EXISTS
// ---------------
// Google blocks OAuth from console browsers ("This browser or app may not be
// secure"), so Sign in with Google simply cannot work on Xbox. There is no
// client-side fix — Google rejects it before it reaches us.
//
// Instead the console shows a short code. The player opens the site on their
// phone, signs in normally there, enters the code, and the console is signed
// in as the same account.
//
// FLOW
//   1. console  POST { action: 'create' }        -> { code, token }
//   2. phone    POST { action: 'claim', code, idToken }
//   3. console  POST { action: 'poll', token }   -> { customToken } once claimed
//
// Codes last 10 minutes and are single use.

const admin = require('firebase-admin');
const crypto = require('crypto');

const ALLOWED_ORIGINS = [
    'https://crixgamingvr.com',
    'https://www.crixgamingvr.com'
];

// Ambiguous characters left out so codes are easy to read off a TV
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL = 10 * 60 * 1000;
const PAIR_TTL = 24 * 60 * 60 * 1000;      // a pairing code lasts a day
const PAIR_REQUEST_TTL = 3 * 60 * 1000;    // an unanswered request lapses

function getAdmin() {
    if (admin.apps.length) return admin;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    const cred = JSON.parse(raw);
    if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    return admin;
}

function makeCode() {
    let out = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out.slice(0, 3) + '-' + out.slice(3);   // ABC-123, easier to read
}

module.exports = async function handler(req, res) {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let fb, db;
    try {
        fb = getAdmin();
        db = fb.firestore();
    } catch (e) {
        return res.status(500).json({ error: 'Server not configured', detail: e.message });
    }

    const action = req.body?.action;

    try {
        // ---- console asks for a code ----
        if (action === 'create') {
            const code = makeCode();
            // A separate secret token means only the console that created the
            // code can redeem it — knowing the code alone is not enough.
            const token = crypto.randomBytes(24).toString('hex');
            await db.collection('deviceLinks').doc(code).set({
                token,
                claimed: false,
                uid: null,
                createdAt: Date.now(),
                expiresAt: Date.now() + CODE_TTL
            });
            return res.status(200).json({ code, token, expiresIn: CODE_TTL / 1000 });
        }

        // ---- phone claims it ----
        if (action === 'claim') {
            const { code, idToken } = req.body;
            if (!code || !idToken) return res.status(400).json({ error: 'Missing code or idToken' });

            // Verify the phone really is signed in as who it claims
            let decoded;
            try {
                decoded = await fb.auth().verifyIdToken(idToken);
            } catch (e) {
                return res.status(401).json({ error: 'Not signed in' });
            }

            const ref = db.collection('deviceLinks').doc(String(code).toUpperCase().trim());
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'That code is not valid' });

            const d = doc.data();
            if (Date.now() > d.expiresAt) {
                await ref.delete().catch(() => {});
                return res.status(410).json({ error: 'That code has expired — get a new one' });
            }
            if (d.claimed) return res.status(409).json({ error: 'That code has already been used' });

            await ref.update({ claimed: true, uid: decoded.uid, claimedAt: Date.now() });

            let name = null;
            try { name = (await fb.auth().getUser(decoded.uid)).displayName; } catch (e) {}
            return res.status(200).json({ ok: true, displayName: name });
        }

        // ---- console checks whether it has been claimed ----
        if (action === 'poll') {
            const { code, token } = req.body;
            if (!code || !token) return res.status(400).json({ error: 'Missing code or token' });

            const ref = db.collection('deviceLinks').doc(String(code).toUpperCase().trim());
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'expired' });

            const d = doc.data();
            if (d.token !== token) return res.status(403).json({ error: 'Not your code' });
            if (Date.now() > d.expiresAt) {
                await ref.delete().catch(() => {});
                return res.status(410).json({ error: 'expired' });
            }
            if (!d.claimed) return res.status(200).json({ pending: true });

            // Claimed — hand back a token and burn the code
            const customToken = await fb.auth().createCustomToken(d.uid);
            await ref.delete().catch(() => {});
            return res.status(200).json({ customToken });
        }


        // ═══════════ PAIRING CODES ═══════════
        // The reverse of the flow above: the account owner has a code in
        // Settings, someone enters it on the sign-in page, and the owner
        // approves or denies with the requester's location shown.
        //
        // The approval step is what makes this safe — a leaked code alone
        // grants nothing.

        // Owner generates or rotates their code
        if (action === 'pair-create') {
            const { idToken } = req.body;
            if (!idToken) return res.status(400).json({ error: 'Not signed in' });
            let decoded;
            try { decoded = await fb.auth().verifyIdToken(idToken); }
            catch (e) { return res.status(401).json({ error: 'Not signed in' }); }

            // Retire any previous code for this account
            const old = await db.collection('pairCodes')
                .where('uid', '==', decoded.uid).get();
            await Promise.all(old.docs.map(d => d.ref.delete().catch(() => {})));

            const code = makeCode();
            await db.collection('pairCodes').doc(code).set({
                uid: decoded.uid,
                createdAt: Date.now(),
                expiresAt: Date.now() + PAIR_TTL,
                used: false
            });
            return res.status(200).json({ code, expiresIn: PAIR_TTL / 1000 });
        }

        // Someone enters the code — creates a request the owner must approve
        if (action === 'pair-request') {
            const code = String(req.body?.code || '').toUpperCase().trim();
            if (!code) return res.status(400).json({ error: 'Enter a code' });

            const ref = db.collection('pairCodes').doc(code);
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'That code is not valid' });

            const d = doc.data();
            if (d.used) return res.status(409).json({ error: 'That code has already been used' });
            if (Date.now() > d.expiresAt) {
                await ref.delete().catch(() => {});
                return res.status(410).json({ error: 'That code has expired' });
            }

            // Rough location from the request IP, purely so the owner can tell
            // whether the request is theirs. Never stored beyond the request.
            const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                       || req.socket?.remoteAddress || '';
            let where = 'Unknown location';
            try {
                const g = await fetch(`https://ipapi.co/${ip}/json/`);
                const j = await g.json();
                if (j && !j.error) {
                    where = [j.city, j.region, j.country_name].filter(Boolean).join(', ')
                            || 'Unknown location';
                }
            } catch (e) { /* location is a nicety, not a requirement */ }

            const ua = req.headers['user-agent'] || '';
            const device = /Xbox/i.test(ua) ? 'Xbox'
                         : /PlayStation/i.test(ua) ? 'PlayStation'
                         : /Android/i.test(ua) ? 'Android phone'
                         : /iPhone|iPad/i.test(ua) ? 'iPhone or iPad'
                         : /Windows/i.test(ua) ? 'Windows PC'
                         : /Mac/i.test(ua) ? 'Mac'
                         : 'Unknown device';

            const requestToken = crypto.randomBytes(24).toString('hex');
            await ref.update({
                pending: {
                    at: Date.now(),
                    location: where,
                    device,
                    requestToken
                }
            });

            return res.status(200).json({ ok: true, requestToken, device, location: where });
        }

        // Owner checks whether anyone is asking
        if (action === 'pair-pending') {
            const { idToken } = req.body;
            if (!idToken) return res.status(400).json({ error: 'Not signed in' });
            let decoded;
            try { decoded = await fb.auth().verifyIdToken(idToken); }
            catch (e) { return res.status(401).json({ error: 'Not signed in' }); }

            const q = await db.collection('pairCodes').where('uid', '==', decoded.uid).get();
            for (const doc of q.docs) {
                const d = doc.data();
                if (d.pending && Date.now() - d.pending.at < PAIR_REQUEST_TTL) {
                    return res.status(200).json({
                        request: {
                            code: doc.id,
                            device: d.pending.device,
                            location: d.pending.location,
                            at: d.pending.at
                        }
                    });
                }
            }
            return res.status(200).json({ request: null });
        }

        // Owner approves or denies
        if (action === 'pair-respond') {
            const { idToken, code, approve } = req.body;
            if (!idToken || !code) return res.status(400).json({ error: 'Missing details' });
            let decoded;
            try { decoded = await fb.auth().verifyIdToken(idToken); }
            catch (e) { return res.status(401).json({ error: 'Not signed in' }); }

            const ref = db.collection('pairCodes').doc(String(code).toUpperCase().trim());
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'No such request' });
            const d = doc.data();
            if (d.uid !== decoded.uid) return res.status(403).json({ error: 'Not your code' });

            if (approve) {
                await ref.update({ approved: true, used: true, approvedAt: Date.now() });
            } else {
                await ref.update({ denied: true, pending: null });
            }
            return res.status(200).json({ ok: true });
        }

        // Requester polls for the answer
        if (action === 'pair-poll') {
            const code = String(req.body?.code || '').toUpperCase().trim();
            const { requestToken } = req.body;
            if (!code || !requestToken) return res.status(400).json({ error: 'Missing details' });

            const ref = db.collection('pairCodes').doc(code);
            const doc = await ref.get();
            if (!doc.exists) return res.status(404).json({ error: 'expired' });
            const d = doc.data();

            if (d.pending?.requestToken !== requestToken && !d.approved) {
                return res.status(403).json({ error: 'Not your request' });
            }
            if (d.denied) {
                await ref.update({ denied: false, pending: null });
                return res.status(200).json({ denied: true });
            }
            if (d.approved) {
                const customToken = await fb.auth().createCustomToken(d.uid);
                // Single use — burn it
                await ref.delete().catch(() => {});
                return res.status(200).json({ customToken });
            }
            return res.status(200).json({ pending: true });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (e) {
        console.error('[device-link]', e);
        return res.status(500).json({ error: 'Something went wrong', detail: e.message });
    }
};
