/* ============================================================
   FLAPPY CRIX — PlayFab Manager
   ------------------------------------------------------------
   Handles: login, currency, catalog, inventory, progress saving,
            player roles/tags, and player reporting.

   Title ID goes in api.json under  "playfab": { "titleId": "XXXXX" }
   (Get it from PlayFab Game Manager → Title Settings → API Features)

   IMPORTANT — what a browser is allowed to do:
     Safe from the client:  login, read catalog, read inventory,
                            PurchaseItem, ReportPlayer, read/write own data.
     NOT safe / blocked:    granting currency, banning, editing other
                            players. Those need a secret key and must live
                            in CloudScript (see cloudscript.js).
   ============================================================ */

const PLAYFAB_MANAGER_VERSION = '2026.08.16-hosttransfer';
const PlayFabManager = (() => {
    let titleId = null;
    let sessionTicket = null;
    let playFabId = null;
    let ready = false;
    let currencyCode = 'CN';          // overridden from api.json
    let roles = [];                   // e.g. ['OWNER'] or ['MOD']
    let status = 'not_started';       // machine-readable state
    let statusDetail = '';            // human-readable reason

    const api = (endpoint, body, useAuth = true) => {
        if (!titleId) return Promise.reject(new Error('PlayFab titleId not set'));
        const headers = { 'Content-Type': 'application/json' };
        if (useAuth) {
            if (!sessionTicket) return Promise.reject(new Error('Not logged in to PlayFab'));
            headers['X-Authorization'] = sessionTicket;
        }
        return fetch(`https://${titleId}.playfabapi.com${endpoint}`, {
            method: 'POST', headers, body: JSON.stringify(body)
        }).then(async res => {
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = new Error(json.errorMessage || `PlayFab ${res.status}`);
                err.playfabError = json.error;
                err.errorCode = json.errorCode;
                err.raw = json;
                throw err;
            }
            return json.data;
        });
    };

    return {
        get isReady()   { return ready; },
        get playFabId() { return playFabId; },
        get _titleId()  { return titleId; },
        get version()   { return PLAYFAB_MANAGER_VERSION; },
        get _ticket()   { return sessionTicket; },
        get status()    { return status; },
        get statusDetail() { return statusDetail; },

        /* One-line explanation of exactly why login isn't working,
           so the Settings panel can tell the user what to fix. */
        get statusMessage() {
            switch (status) {
                case 'ok':            return null;
                case 'no_title_id':   return 'PlayFab not set up — add your Title ID to api.json';
                case 'no_firebase':   return 'Sign in to the game first';
                case 'configured':    return 'Sign in to get your Player ID';
                case 'account_missing':
                    return 'No PlayFab account yet — enable "Allow client to create account" in PlayFab (see below)';
                case 'login_failed':  return 'PlayFab login failed: ' + statusDetail;
                case 'banned':        return 'This account is banned';
                default:              return 'PlayFab not connected';
            }
        },
        get roles()     { return [...roles]; },
        get currencyCode() { return currencyCode; },

        /* ---- SETUP ------------------------------------------------ */
        async init(config) {
            titleId = config?.titleId || null;
            currencyCode = config?.currencyCode || 'CN';
            if (!titleId || titleId.startsWith('PASTE_') || titleId.trim() === '') {
                status = 'no_title_id';
                statusDetail = 'api.json -> playfab.titleId is still the placeholder';
                console.warn('[PlayFab] ' + statusDetail);
                return false;
            }
            status = 'configured';
            return true;
        },

        /* ---- LOGIN ------------------------------------------------
           customId should be stable per player. We use the Firebase UID
           so PlayFab and Firebase accounts stay linked.               */
        async login(customId, displayName) {
            if (!titleId) { status = 'no_title_id'; return null; }
            if (!customId) {
                status = 'no_firebase';
                statusDetail = 'no Firebase UID to use as PlayFab CustomId';
                return null;
            }
            try {
                const data = await api('/Client/LoginWithCustomID', {
                    TitleId: titleId,
                    CustomId: customId,
                    CreateAccount: true,
                    InfoRequestParameters: {
                        GetUserVirtualCurrency: true,
                        GetUserInventory: true,
                        GetPlayerProfile: true,
                        GetUserData: true,
                        GetUserReadOnlyData: true
                    }
                }, false);

                sessionTicket = data.SessionTicket;
                playFabId     = data.PlayFabId;
                ready         = true;

                roles = this._extractRoles(data.InfoResultPayload || {});
                PlayFabManager._ownedItems =
                    (data.InfoResultPayload?.UserInventory || []).map(i => i.ItemId);
                status = 'ok';
                statusDetail = '';
                console.log('[PlayFab] Signed in. PlayFabId:', playFabId, '| roles:', roles);

                if (displayName) this.setDisplayName(displayName).catch(() => {});
                return data;
            } catch (e) {
                // AccountBanned = 1002. Surfaced so the caller can show a ban screen.
                if (e.playfabError === 'AccountBanned') {
                    status = 'banned'; e.isBan = true; throw e;
                }
                // PlayFab disabled client-side account creation for titles made
                // after 30 Jun 2025. Without it, a first-time login has nothing
                // to log in to. This is by far the most common setup failure.
                if (e.playfabError === 'AccountNotFound' ||
                    e.errorCode === 1001 || e.errorCode === 1002) {
                    status = 'account_missing';
                } else {
                    status = 'login_failed';
                }
                statusDetail = e.message || String(e);
                console.error('[PlayFab] Login failed —', e.playfabError || '', e.message);
                console.error('[PlayFab] Full response:', e.raw);
                return null;
            }
        },

        async setDisplayName(name) {
            return api('/Client/UpdateUserTitleDisplayName', { DisplayName: name.slice(0, 25) });
        },

        /* ---- ROLES ------------------------------------------------
           Roles are catalog items in the player's inventory (role_owner,
           role_mod). Those items have NO price, so PurchaseItem can never
           buy them — only a server-side grant can add them.
           ReadOnlyData is still checked as a fallback so older accounts
           set up the previous way keep working.                        */
        _extractRoles(payload) {
            const found = [];

            // Primary source: inventory items of class "role"
            const inv = payload.UserInventory || [];
            inv.forEach(item => {
                if (item.ItemId === 'role_owner') found.push('OWNER');
                else if (item.ItemId === 'role_mod') found.push('MOD');
            });

            // Fallback: legacy ReadOnlyData roles array
            const ro = payload.UserReadOnlyData || {};
            if (ro.roles?.Value) {
                try {
                    JSON.parse(ro.roles.Value).forEach(r => {
                        if (!found.includes(r)) found.push(r);
                    });
                } catch (e) {}
            }
            return found;
        },

        /* Re-check roles without a full re-login (after a grant). */
        async refreshRoles() {
            const [invData, roData] = await Promise.all([
                api('/Client/GetUserInventory', {}),
                api('/Client/GetUserReadOnlyData', { Keys: ['roles'] }).catch(() => ({ Data: {} }))
            ]);
            roles = this._extractRoles({
                UserInventory: invData.Inventory || [],
                UserReadOnlyData: roData.Data || {}
            });
            return [...roles];
        },

        /* ---- CURRENCY --------------------------------------------- */
        async getCurrency() {
            const data = await api('/Client/GetUserInventory', {});
            return data.VirtualCurrency?.[currencyCode] ?? 0;
        },

        /* Spending is client-safe (it can only ever reduce balance). */
        async spendCurrency(amount) {
            return api('/Client/SubtractUserVirtualCurrency', {
                VirtualCurrency: currencyCode, Amount: Math.floor(amount)
            });
        },

        /* Granting must go through CloudScript — the direct grant API
           requires a secret key and is not callable from a browser.    */
        async grantCurrency(amount, reason = 'gameplay') {
            return api('/Client/ExecuteCloudScript', {
                FunctionName: 'grantCoins',
                FunctionParameter: { amount: Math.floor(amount), reason },
                GeneratePlayStreamEvent: true
            }).then(r => {
                if (r.Error) throw new Error(r.Error.Message || 'CloudScript error');
                return r.FunctionResult;
            });
        },

        /* ---- CATALOG / INVENTORY ---------------------------------- */
        async getCatalog(version = 'Main') {
            const data = await api('/Client/GetCatalogItems', { CatalogVersion: version });
            return data.Catalog || [];
        },

        async getInventory() {
            const data = await api('/Client/GetUserInventory', {});
            return {
                items: data.Inventory || [],
                currency: data.VirtualCurrency?.[currencyCode] ?? 0
            };
        },

        async purchaseItem(itemId, price, version = 'Main') {
            return api('/Client/PurchaseItem', {
                CatalogVersion: version,
                ItemId: itemId,
                Price: Math.floor(price),
                VirtualCurrency: currencyCode
            });
        },

        /* ---- PROGRESS SAVING --------------------------------------
           Player-writable data. Anything the player must NOT be able to
           edit (currency, roles, bans) is deliberately not stored here. */
        async saveProgress(progress) {
            return api('/Client/UpdateUserData', {
                Data: { progress: JSON.stringify(progress) },
                Permission: 'Private'
            });
        },

        async loadProgress() {
            const data = await api('/Client/GetUserData', { Keys: ['progress'] });
            const raw = data.Data?.progress?.Value;
            if (!raw) return null;
            try { return JSON.parse(raw); } catch { return null; }
        },

        /* ---- REPORTING (client-safe, shows in PlayFab Game Manager) */
        async reportPlayer(targetPlayFabId, comment) {
            return api('/Client/ReportPlayer', {
                ReporteeId: targetPlayFabId,
                Comment: (comment || '').slice(0, 1000)
            });
        },

        /* ---- OWNER/MOD ACTIONS ------------------------------------
           All of these are CloudScript calls. The server re-checks the
           caller's role, so a player editing this file client-side
           achieves nothing.                                            */
        async adminAction(action, params = {}) {
            return api('/Client/ExecuteCloudScript', {
                FunctionName: 'adminAction',
                FunctionParameter: { action, ...params },
                GeneratePlayStreamEvent: true
            }).then(r => {
                if (r.Error) {
                    const msg = r.Error.Message || 'CloudScript error';
                    if (/no function named/i.test(msg)) {
                        throw new Error('CloudScript is not deployed. Paste cloudscript.js into ' +
                            'PlayFab → Automation → CloudScript and click "Deploy to live".');
                    }
                    throw new Error(msg);
                }
                if (r.FunctionResult?.error) throw new Error(r.FunctionResult.error);
                return r.FunctionResult;
            });
        },

        hasRole(role) { return roles.includes(role); },
        get isOwner()  { return roles.includes('OWNER'); },
        get isMod()    { return roles.includes('OWNER') || roles.includes('MOD'); },

        logout() { sessionTicket = null; playFabId = null; ready = false; roles = []; }
    };
})();

if (typeof window !== 'undefined') {
    window.PlayFabManager = PlayFabManager;
    window.PLAYFAB_MANAGER_VERSION = PLAYFAB_MANAGER_VERSION;
}

/* ============================================================
   FRIENDS / PRESENCE / PROGRESS  (extension)
   Appended so the core object above stays readable.
   ============================================================ */
(function (PFM) {
    if (typeof PFM === 'undefined') return;

    const call = (endpoint, body) => {
        if (!PFM.isReady) return Promise.reject(new Error('Not logged in to PlayFab'));
        return fetch(`https://${PFM._titleId}.playfabapi.com${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Authorization': PFM._ticket },
            body: JSON.stringify(body)
        }).then(async res => {
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                const e = new Error(j.errorMessage || `PlayFab ${res.status}`);
                e.playfabError = j.error; e.errorCode = j.errorCode; e.raw = j;
                throw e;
            }
            return j.data;
        });
    };

    /* ---- FRIENDS ---------------------------------------------
       PlayFab tags are how we mark favourites — they survive on
       the server, so favourites follow the account, not the device. */
    PFM.addFriend = function (opts) {
        const body = {};
        if (opts.playFabId)   body.FriendPlayFabId = opts.playFabId;
        if (opts.displayName) body.FriendTitleDisplayName = opts.displayName;
        if (opts.username)    body.FriendUsername = opts.username;
        if (opts.email)       body.FriendEmail = opts.email;
        return call('/Client/AddFriend', body);
    };

    PFM.removeFriend = function (playFabId) {
        return call('/Client/RemoveFriend', { FriendPlayFabId: playFabId });
    };

    PFM.getFriends = function () {
        return call('/Client/GetFriendsList', {
            ProfileConstraints: {
                ShowDisplayName: true,
                ShowAvatarUrl: true,
                ShowLastLogin: true,
                ShowStatistics: true
            }
        }).then(d => (d.Friends || []).map(f => ({
            playFabId:   f.FriendPlayFabId,
            displayName: f.TitleDisplayName || f.Profile?.DisplayName || 'Player',
            avatarUrl:   f.Profile?.AvatarUrl || null,
            lastLogin:   f.Profile?.LastLogin || null,
            tags:        f.Tags || [],
            favourite:   (f.Tags || []).includes('favourite'),
            statistics:  f.Profile?.Statistics || []
        })));
    };

    /* ---- FRIEND REQUESTS ----
       All four go through CloudScript because PlayFab's client AddFriend
       only writes to your own list — the other person would never see it. */
    PFM.sendFriendRequest = function (targetPlayFabId) {
        return PFM.adminAction ? cloud('sendFriendRequest', { targetPlayFabId })
                               : Promise.reject(new Error('not ready'));
    };
    PFM.respondToFriendRequest = function (requesterPlayFabId, accept) {
        return cloud('respondToFriendRequest', { requesterPlayFabId, accept: !!accept });
    };
    PFM.cancelFriendRequest = function (targetPlayFabId) {
        return cloud('cancelFriendRequest', { targetPlayFabId });
    };
    PFM.removeFriendBoth = function (targetPlayFabId) {
        return cloud('removeFriendBoth', { targetPlayFabId });
    };

    function cloud(fn, params) {
        return call('/Client/ExecuteCloudScript', {
            FunctionName: fn,
            FunctionParameter: params,
            GeneratePlayStreamEvent: true
        }).then(r => {
            if (r.Error) throw new Error(r.Error.Message || 'CloudScript error');
            if (r.FunctionResult && r.FunctionResult.error) throw new Error(r.FunctionResult.error);
            return r.FunctionResult;
        });
    }

    /* Friends split by request state. */
    PFM.getFriendsSplit = function () {
        return PFM.getFriends().then(all => ({
            friends:  all.filter(f => !f.tags.includes('incoming') && !f.tags.includes('outgoing')),
            incoming: all.filter(f =>  f.tags.includes('incoming')),
            outgoing: all.filter(f =>  f.tags.includes('outgoing'))
        }));
    };

    /* Favourites are stored as a PlayFab friend tag. */
    PFM.setFavourite = function (playFabId, isFav) {
        // Preserve 'friend' — SetFriendTags replaces the whole list
        return call('/Client/SetFriendTags', {
            FriendPlayFabId: playFabId,
            Tags: isFav ? ['friend', 'favourite'] : ['friend']
        });
    };

    /* ---- PRESENCE --------------------------------------------
       Stored as Public UserData so it persists across sessions.
       Live status for players in your current room comes over
       Photon instead — see broadcastPresence() in game.html.     */
    PFM.setPresence = function (status) {
        return call('/Client/UpdateUserData', {
            Data: { presence: status, presenceAt: String(Date.now()) },
            Permission: 'Public'
        });
    };

    /* ---- PROGRESS (level / RP / stats) ------------------------
       Statistics are used rather than UserData because they can be
       leaderboard-ranked later without a migration.                */
    PFM.saveStats = function (stats) {
        const updates = Object.entries(stats).map(([k, v]) => ({
            StatisticName: k, Value: Math.floor(v)
        }));
        return call('/Client/UpdatePlayerStatistics', { Statistics: updates });
    };

    PFM.loadStats = function (names) {
        return call('/Client/GetPlayerStatistics', { StatisticNames: names })
            .then(d => {
                const out = {};
                (d.Statistics || []).forEach(s => { out[s.StatisticName] = s.Value; });
                return out;
            });
    };
})(typeof PlayFabManager !== 'undefined' ? PlayFabManager : undefined);


/* ============================================================
   FRIEND CODES / AVATAR / PRIVACY  (extension 2)
   ------------------------------------------------------------
   Friend codes work by baking a short code into the PlayFab
   display name as "Name#AB12". PlayFab's AddFriend already
   supports exact display-name lookup, so no custom backend is
   needed — the code IS part of the name.
   ============================================================ */
(function (PFM) {
    if (typeof PFM === 'undefined') return;

    const call = (endpoint, body) => {
        if (!PFM.isReady) return Promise.reject(new Error('Not logged in to PlayFab'));
        return fetch(`https://${PFM._titleId}.playfabapi.com${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Authorization': PFM._ticket },
            body: JSON.stringify(body)
        }).then(async res => {
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                const e = new Error(j.errorMessage || `PlayFab ${res.status}`);
                e.playfabError = j.error; e.errorCode = j.errorCode; e.raw = j;
                throw e;
            }
            return j.data;
        });
    };

    /* Deterministic 4-character code derived from the PlayFab ID, so the
       same account always produces the same code. Ambiguous characters
       (0/O, 1/I) are excluded so codes are easy to read out loud. */
    PFM.friendCodeFor = function (playFabId) {
        const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        if (!playFabId) return null;
        let h = 0;
        for (let i = 0; i < playFabId.length; i++) {
            h = ((h << 5) - h + playFabId.charCodeAt(i)) | 0;
        }
        h = Math.abs(h);
        let code = '';
        for (let i = 0; i < 4; i++) { code += ALPHA[h % ALPHA.length]; h = Math.floor(h / ALPHA.length) + 7; }
        return code;
    };

    /* Sets the display name to "Name#CODE" so friend lookups work. */
    PFM.setNameWithCode = async function (baseName) {
        const code = PFM.friendCodeFor(PFM.playFabId);
        if (!code) return null;
        const clean = String(baseName).replace(/#.*$/, '').trim().slice(0, 18);
        const full = `${clean}#${code}`;
        await call('/Client/UpdateUserTitleDisplayName', { DisplayName: full });
        return full;
    };

    /* Add by the full "Name#CODE" string. */
    PFM.addFriendByCode = function (nameWithCode) {
        return call('/Client/AddFriend', { FriendTitleDisplayName: nameWithCode.trim() });
    };

    /* Does the player own a given catalog item? Cached from login,
       refreshable after a purchase. */
    PFM._ownedItems = [];
    PFM.refreshInventory = function () {
        return call('/Client/GetUserInventory', {}).then(d => {
            PFM._ownedItems = (d.Inventory || []).map(i => i.ItemId);
            return { items: PFM._ownedItems, currency: d.VirtualCurrency || {} };
        });
    };
    PFM.owns = function (itemId) { return PFM._ownedItems.includes(itemId); };

    /* Avatar. PlayFab stores a URL — we don't host uploads. */
    PFM.setAvatar = function (url) {
        return call('/Client/UpdateAvatarUrl', { ImageUrl: url });
    };

    /* Privacy preference. Stored public so a lookup can honour it. */
    PFM.setAllowFriendRequests = function (allow) {
        return call('/Client/UpdateUserData', {
            Data: { allowFriendRequests: allow ? 'true' : 'false' },
            Permission: 'Public'
        });
    };

    PFM.getMyPrivacy = function () {
        return call('/Client/GetUserData', { Keys: ['allowFriendRequests'] })
            .then(d => d.Data?.allowFriendRequests?.Value !== 'false');
    };
})(typeof PlayFabManager !== 'undefined' ? PlayFabManager : undefined);


/* ============================================================
   FRIEND REQUESTS / INVITES  (extension 3)
   All of these call CloudScript, because writing to another
   player's data requires the server.
   ============================================================ */
(function (PFM) {
    if (typeof PFM === 'undefined') return;

    const cs = (fn, params = {}) => {
        if (!PFM.isReady) return Promise.reject(new Error('Not logged in to PlayFab'));
        return fetch(`https://${PFM._titleId}.playfabapi.com/Client/ExecuteCloudScript`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Authorization': PFM._ticket },
            body: JSON.stringify({ FunctionName: fn, FunctionParameter: params, GeneratePlayStreamEvent: false })
        })
        .then(r => r.json())
        .then(j => {
            const d = j.data;
            if (!d) throw new Error(j.errorMessage || 'CloudScript call failed');
            if (d.Error) {
                const msg = d.Error.Message || 'CloudScript error';
                if (/no function named/i.test(msg)) {
                    throw new Error(
                        `"${fn}" is not deployed to PlayFab. Paste cloudscript.js into ` +
                        `Game Manager → Automation → CloudScript, then click "Deploy to live" ` +
                        `(saving a revision alone is not enough).`);
                }
                throw new Error(msg);
            }
            const res = d.FunctionResult || {};
            if (res.error) throw new Error(res.error);
            return res;
        });
    };

    PFM.cloudScriptVersion   = ()            => cs('version');
    PFM.sendFriendRequest    = id            => cs('sendFriendRequest', { targetPlayFabId: id });
    PFM.cancelFriendRequest  = id            => cs('cancelFriendRequest', { targetPlayFabId: id });
    PFM.removeFriendBoth     = id            => cs('removeFriendBoth', { targetPlayFabId: id });
    PFM.blockPlayer          = id            => cs('blockPlayer', { targetPlayFabId: id });
    PFM.unblockPlayer        = id            => cs('unblockPlayer', { targetPlayFabId: id });
    PFM.setLobbyBlock        = (code, ids)   => cs('setLobbyBlock', { roomCode: code, blocked: ids });
    PFM.getFriendRequests    = ()            => cs('getFriendRequests').then(r => r.requests || []);
    PFM.respondFriendRequest = (id, accept)  => cs('respondToFriendRequest', { requesterPlayFabId: id, accept });
    PFM.sendInvite           = (id, code, mode) => cs('sendInvite', { targetPlayFabId: id, roomCode: code, mode });
    PFM.getInvites           = ()            => cs('getInvites').then(r => r.invites || []);
    PFM.csVersion            = ()            => cs('version');
    // Calls any handler by name — used by the console's health check
    PFM.callHandler          = (fn, params)  => cs(fn, params || {});
    PFM.clearInvites         = ()            => cs('clearInvites');
})(typeof PlayFabManager !== 'undefined' ? PlayFabManager : undefined);

/* Startup self-check: shouts loudly if a stale cached copy is running. */
(function () {
    if (typeof window === 'undefined') return;
    const need = ['addFriend','getFriends','removeFriend','setFavourite','setPresence','saveStats','loadStats','friendCodeFor','addFriendByCode','setAvatar','setNameWithCode','owns','refreshInventory','sendFriendRequest','getFriendRequests','respondFriendRequest','getInvites','sendFriendRequest','respondToFriendRequest','getFriendsSplit'];
    const missing = need.filter(fn => typeof PlayFabManager[fn] !== 'function');
    if (missing.length) {
        console.error('[PlayFab] STALE FILE — playfab-manager.js is missing:', missing.join(', '),
                      '\nYour browser is running an old cached copy. Hard-refresh with Ctrl+Shift+R (Cmd+Shift+R on Mac).');
    } else {
        console.log('[PlayFab] playfab-manager.js', PLAYFAB_MANAGER_VERSION, '— all methods loaded ✓');
    }
})();
