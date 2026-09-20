// api/admin.js
//
// Granting currency and items needs PlayFab's SERVER API, which requires the
// secret key. A browser can never hold that key, so these actions have to
// happen here.
//
// Every request is checked twice: the caller must be signed in, and their
// Firebase uid must be in the Firestore "owners" collection.
//
// Needs in Vercel:
//   PLAYFAB_TITLE_ID           17CF2A
//   PLAYFAB_SECRET_KEY         PlayFab > Settings > Secret Keys
//   FIREBASE_SERVICE_ACCOUNT   the service account JSON, one line

const admin = require('firebase-admin');

const ALLOWED_ORIGINS = [
    'https://crixgamingvr.com',
    'https://www.crixgamingvr.com'
];

function getAdmin() {
    if (admin.apps.length) return admin;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    const cred = JSON.parse(raw);
    if (cred.private_key) cred.private_key = cred.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(cred) });
    return admin;
}

async function playfab(endpoint, body) {
    const title = process.env.PLAYFAB_TITLE_ID;
    const secret = process.env.PLAYFAB_SECRET_KEY;
    if (!title || !secret) throw new Error('PlayFab is not configured in Vercel');

    const r = await fetch(`https://${title}.playfabapi.com${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SecretKey': secret },
        body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.errorMessage || `PlayFab ${r.status}`);
    return j.data;
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

    const { idToken, action, targetPlayFabId, amount, itemId, reason } = req.body || {};
    if (!idToken) return res.status(401).json({ error: 'Not signed in' });

    let fb, db, decoded;
    try {
        fb = getAdmin();
        db = fb.firestore();
        decoded = await fb.auth().verifyIdToken(idToken);
    } catch (e) {
        return res.status(401).json({ error: 'Could not verify who you are', detail: e.message });
    }

    // Owner check — this is the only thing standing between a signed-in user
    // and unlimited currency, so it is not optional.
    try {
        const owner = await db.collection('owners').doc(decoded.uid).get();
        if (!owner.exists) {
            return res.status(403).json({ error: 'Owners only' });
        }
    } catch (e) {
        return res.status(500).json({ error: 'Could not check permissions', detail: e.message });
    }

    if (!targetPlayFabId) return res.status(400).json({ error: 'No target player' });

    try {
        // ---- COINS ----
        if (action === 'giveCoins') {
            const amt = parseInt(amount, 10);
            if (!Number.isFinite(amt) || amt === 0) {
                return res.status(400).json({ error: 'Enter an amount' });
            }
            // A negative amount subtracts, which is how you correct a mistake
            const d = amt > 0
                ? await playfab('/Server/AddUserVirtualCurrency', {
                    PlayFabId: targetPlayFabId, VirtualCurrency: 'CN', Amount: amt })
                : await playfab('/Server/SubtractUserVirtualCurrency', {
                    PlayFabId: targetPlayFabId, VirtualCurrency: 'CN', Amount: Math.abs(amt) });

            await db.collection('adminLog').add({
                action: 'giveCoins', by: decoded.uid, target: targetPlayFabId,
                amount: amt, reason: reason || null, at: Date.now()
            }).catch(() => {});

            return res.status(200).json({ ok: true, balance: d.Balance });
        }

        // ---- ITEMS ----
        if (action === 'grantItem') {
            if (!itemId) return res.status(400).json({ error: 'No item chosen' });
            const d = await playfab('/Server/GrantItemsToUser', {
                PlayFabId: targetPlayFabId,
                ItemIds: [itemId],
                CatalogVersion: 'Main',
                Annotation: reason || 'Granted by staff'
            });

            await db.collection('adminLog').add({
                action: 'grantItem', by: decoded.uid, target: targetPlayFabId,
                itemId, reason: reason || null, at: Date.now()
            }).catch(() => {});

            return res.status(200).json({ ok: true, granted: d.ItemGrantResults || [] });
        }

        // ---- CATALOG (so the console can list real items) ----
        if (action === 'listItems') {
            const d = await playfab('/Server/GetCatalogItems', { CatalogVersion: 'Main' });
            return res.status(200).json({
                ok: true,
                items: (d.Catalog || []).map(i => ({
                    id: i.ItemId,
                    name: i.DisplayName || i.ItemId,
                    description: i.Description || '',
                    type: i.ItemClass || 'item',
                    price: (i.VirtualCurrencyPrices || {}).CN ?? null
                }))
            });
        }

        // ---- INVENTORY ----
        if (action === 'getInventory') {
            const d = await playfab('/Server/GetUserInventory', { PlayFabId: targetPlayFabId });
            return res.status(200).json({
                ok: true,
                balance: (d.VirtualCurrency || {}).CN ?? 0,
                items: (d.Inventory || []).map(i => ({
                    id: i.ItemId, instance: i.ItemInstanceId, name: i.DisplayName || i.ItemId
                }))
            });
        }

        // ---- REVOKE ----
        if (action === 'revokeItem') {
            const { itemInstanceId } = req.body;
            if (!itemInstanceId) return res.status(400).json({ error: 'No item instance given' });
            await playfab('/Server/RevokeInventoryItem', {
                PlayFabId: targetPlayFabId, ItemInstanceId: itemInstanceId
            });
            await db.collection('adminLog').add({
                action: 'revokeItem', by: decoded.uid, target: targetPlayFabId,
                itemInstanceId, at: Date.now()
            }).catch(() => {});
            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (e) {
        console.error('[admin]', action, e);
        return res.status(500).json({ error: 'That did not work', detail: e.message });
    }
};
