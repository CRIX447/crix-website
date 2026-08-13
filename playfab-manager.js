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
        get roles()     { return [...roles]; },
        get currencyCode() { return currencyCode; },

        /* ---- SETUP ------------------------------------------------ */
        async init(config) {
            titleId = config?.titleId || null;
            currencyCode = config?.currencyCode || 'CN';
            if (!titleId || titleId.startsWith('PASTE_')) {
                console.warn('[PlayFab] No titleId in api.json — PlayFab features disabled.');
                return false;
            }
            return true;
        },

        /* ---- LOGIN ------------------------------------------------
           customId should be stable per player. We use the Firebase UID
           so PlayFab and Firebase accounts stay linked.               */
        async login(customId, displayName) {
            if (!titleId) return null;
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

                // Roles live in ReadOnlyData (server-writable only, so players
                // can't grant themselves OWNER).
                const ro = data.InfoResultPayload?.UserReadOnlyData || {};
                roles = ro.roles?.Value ? JSON.parse(ro.roles.Value) : [];

                if (displayName) this.setDisplayName(displayName).catch(() => {});
                return data;
            } catch (e) {
                // AccountBanned = 1002. Surfaced so the caller can show a ban screen.
                if (e.playfabError === 'AccountBanned') { e.isBan = true; throw e; }
                console.warn('[PlayFab] Login failed:', e.message);
                return null;
            }
        },

        async setDisplayName(name) {
            return api('/Client/UpdateUserTitleDisplayName', { DisplayName: name.slice(0, 25) });
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
