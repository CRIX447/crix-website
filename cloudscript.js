/* ============================================================
   FLAPPY CRIX — PlayFab CloudScript
   ------------------------------------------------------------
   WHERE THIS GOES:
     PlayFab Game Manager → Automation → CloudScript → Revisions
     Paste this whole file in, Save, then click "Deploy to live".

   WHY IT EXISTS:
     Granting currency and banning players require a secret key.
     A browser can never hold that key safely. This code runs on
     PlayFab's servers, so it can use the key — and it re-checks
     the caller's role on every call. Editing the game's client
     files gives a cheater nothing, because the real permission
     check happens here.

   HOW ROLES ARE SET (do this once, by hand):
     Game Manager → Players → pick your account → Data (Read Only)
       Key:   roles
       Value: ["OWNER"]
     Read-Only data can't be written by the player, only by the
     server — which is exactly why roles live there.
   ============================================================ */

var CURRENCY = "CN";              // must match api.json currencyCode
var MAX_GRANT_PER_CALL = 5000;    // anti-abuse ceiling on normal gameplay grants

/* ---------- helpers ---------- */

function getRoles(playFabId) {
    var res = server.GetUserReadOnlyData({
        PlayFabId: playFabId,
        Keys: ["roles"]
    });
    if (!res.Data || !res.Data.roles) return [];
    try { return JSON.parse(res.Data.roles.Value); }
    catch (e) { return []; }
}

function isOwner(playFabId) { return getRoles(playFabId).indexOf("OWNER") !== -1; }
function isMod(playFabId) {
    var r = getRoles(playFabId);
    return r.indexOf("OWNER") !== -1 || r.indexOf("MOD") !== -1;
}

/* ---------- normal gameplay currency grant ---------- */

handlers.grantCoins = function (args, context) {
    var amount = parseInt(args.amount, 10);
    if (isNaN(amount) || amount <= 0) return { error: "Invalid amount" };

    // Owners bypass the ceiling; everyone else is capped so a tampered
    // client can't mint a billion coins in one call.
    if (!isOwner(currentPlayerId) && amount > MAX_GRANT_PER_CALL) {
        amount = MAX_GRANT_PER_CALL;
    }

    var res = server.AddUserVirtualCurrency({
        PlayFabId: currentPlayerId,
        VirtualCurrency: CURRENCY,
        Amount: amount
    });

    return { balance: res.Balance, granted: amount, reason: args.reason || "gameplay" };
};

/* ---------- owner / mod actions ---------- */

handlers.adminAction = function (args, context) {
    var action = args.action;
    var target = args.targetPlayFabId;

    // Every action is gated here, server-side.
    var ownerOnly = ["giveCoins", "giveItem", "setRole", "reviveAll", "killAll", "bigAll"];
    var modOrOwner = ["kick", "ban", "unban"];

    if (ownerOnly.indexOf(action) !== -1 && !isOwner(currentPlayerId)) {
        return { error: "Owner only" };
    }
    if (modOrOwner.indexOf(action) !== -1 && !isMod(currentPlayerId)) {
        return { error: "Moderator or owner only" };
    }

    switch (action) {

        case "giveCoins": {
            var amt = parseInt(args.amount, 10);
            if (isNaN(amt)) return { error: "Invalid amount" };
            var r = server.AddUserVirtualCurrency({
                PlayFabId: target || currentPlayerId,
                VirtualCurrency: CURRENCY,
                Amount: amt
            });
            return { ok: true, balance: r.Balance };
        }

        case "giveItem": {
            if (!args.itemId) return { error: "No itemId" };
            server.GrantItemsToUser({
                PlayFabId: target || currentPlayerId,
                CatalogVersion: args.catalogVersion || "Main",
                ItemIds: [args.itemId]
            });
            return { ok: true, granted: args.itemId };
        }

        case "setRole": {
            if (!target) return { error: "No target" };
            var newRoles = args.roles || [];
            server.UpdateUserReadOnlyData({
                PlayFabId: target,
                Data: { roles: JSON.stringify(newRoles) }
            });
            return { ok: true, roles: newRoles };
        }

        case "ban": {
            if (!target) return { error: "No target" };
            var ban = {
                PlayFabId: target,
                Reason: args.reason || "Violation of the rules"
            };
            // Omitting DurationInHours makes the ban permanent.
            if (args.hours && parseInt(args.hours, 10) > 0) {
                ban.DurationInHours = parseInt(args.hours, 10);
            }
            var banRes = server.BanUsers({ Bans: [ban] });
            return { ok: true, banId: banRes.BanData[0].BanId };
        }

        case "unban": {
            if (!args.banId) return { error: "No banId" };
            server.RevokeBans({ BanIds: [args.banId] });
            return { ok: true };
        }

        // kick / killAll / reviveAll / bigAll are live match effects.
        // They're broadcast over Photon by the client after this call
        // confirms the caller actually has permission.
        case "kick":
        case "killAll":
        case "reviveAll":
        case "bigAll":
            return { ok: true, action: action, authorised: true };

        default:
            return { error: "Unknown action: " + action };
    }
};

/* ---------- read a player's ban state for the ban screen ---------- */

handlers.getMyBanInfo = function (args, context) {
    var res = server.GetUserBans({ PlayFabId: currentPlayerId });
    var active = (res.BanData || []).filter(function (b) { return b.Active; });
    if (!active.length) return { banned: false };
    var b = active[0];
    return {
        banned: true,
        reason: b.Reason || "No reason given",
        expires: b.Expires || null,          // null = permanent
        banId: b.BanId
    };
};
