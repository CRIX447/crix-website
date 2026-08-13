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

var ROLE_ITEMS = { OWNER: "role_owner", MOD: "role_mod" };

/* Roles are catalog items in the player's inventory. Those items have no
   price, so they can only ever arrive via a server-side grant.
   ReadOnlyData is still read as a fallback for older accounts.          */
function getRoles(playFabId) {
    var found = [];

    try {
        var inv = server.GetUserInventory({ PlayFabId: playFabId });
        (inv.Inventory || []).forEach(function (item) {
            if (item.ItemId === ROLE_ITEMS.OWNER && found.indexOf("OWNER") === -1) found.push("OWNER");
            if (item.ItemId === ROLE_ITEMS.MOD   && found.indexOf("MOD")   === -1) found.push("MOD");
        });
    } catch (e) {}

    try {
        var res = server.GetUserReadOnlyData({ PlayFabId: playFabId, Keys: ["roles"] });
        if (res.Data && res.Data.roles) {
            JSON.parse(res.Data.roles.Value).forEach(function (r) {
                if (found.indexOf(r) === -1) found.push(r);
            });
        }
    } catch (e) {}

    return found;
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
            var newRoles = args.roles || [];          // e.g. ["MOD"] or [] to strip all
            var catalog  = args.catalogVersion || "Main";

            // Work out what they already hold so we only add/remove the difference
            var current = [];
            var inv = server.GetUserInventory({ PlayFabId: target });
            var instanceByRole = {};
            (inv.Inventory || []).forEach(function (item) {
                if (item.ItemId === ROLE_ITEMS.OWNER) { current.push("OWNER"); instanceByRole.OWNER = item.ItemInstanceId; }
                if (item.ItemId === ROLE_ITEMS.MOD)   { current.push("MOD");   instanceByRole.MOD   = item.ItemInstanceId; }
            });

            // Grant anything newly added
            var toGrant = [];
            newRoles.forEach(function (r) {
                if (ROLE_ITEMS[r] && current.indexOf(r) === -1) toGrant.push(ROLE_ITEMS[r]);
            });
            if (toGrant.length) {
                server.GrantItemsToUser({
                    PlayFabId: target,
                    CatalogVersion: catalog,
                    ItemIds: toGrant
                });
            }

            // Revoke anything removed
            current.forEach(function (r) {
                if (newRoles.indexOf(r) === -1 && instanceByRole[r]) {
                    server.RevokeInventoryItem({
                        PlayFabId: target,
                        ItemInstanceId: instanceByRole[r]
                    });
                }
            });

            // Keep legacy ReadOnlyData in sync so nothing stale lingers
            server.UpdateUserReadOnlyData({
                PlayFabId: target,
                Data: { roles: JSON.stringify(newRoles) }
            });

            return { ok: true, roles: newRoles, granted: toGrant };
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
