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
                if (r.Error) throw new Error(r.Error.Message || 'CloudScript error');
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

if (typeof window !== 'undefined') window.PlayFabManager = PlayFabManager;
