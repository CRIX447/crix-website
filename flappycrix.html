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

/* ============================================================
   FRIEND REQUESTS
   ------------------------------------------------------------
   PlayFab's AddFriend only writes to the caller's own list, so a
   client can't notify anyone that it wants to be friends. The
   server can write to both sides, so the request flow lives here.

   State is modelled with friend tags:
     outgoing  – I sent this person a request
     incoming  – this person sent me a request
     friend    – accepted, both directions
   ============================================================ */

function setTags(playFabId, friendId, tags) {
    server.SetFriendTags({
        PlayFabId: playFabId,
        FriendPlayFabId: friendId,
        Tags: tags
    });
}

function friendEntry(playFabId, friendId) {
    var res = server.GetFriendsList({ PlayFabId: playFabId });
    var list = res.Friends || [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].FriendPlayFabId === friendId) return list[i];
    }
    return null;
}

handlers.sendFriendRequest = function (args) {
    var target = args.targetPlayFabId;
    if (!target) return { error: "No target" };
    if (target === currentPlayerId) return { error: "You can't add yourself" };

    // Respect the recipient's privacy setting
    var pref = server.GetUserData({ PlayFabId: target, Keys: ["allowFriendRequests"] });
    if (pref.Data && pref.Data.allowFriendRequests &&
        pref.Data.allowFriendRequests.Value === "false") {
        return { error: "This player isn't accepting friend requests" };
    }

    var existing = friendEntry(currentPlayerId, target);
    if (existing) {
        var t = existing.Tags || [];
        if (t.indexOf("friend") !== -1)   return { error: "Already friends" };
        if (t.indexOf("outgoing") !== -1) return { error: "Request already sent" };
        // They already asked us — treat this as accepting
        if (t.indexOf("incoming") !== -1) {
            setTags(currentPlayerId, target, ["friend"]);
            setTags(target, currentPlayerId, ["friend"]);
            return { ok: true, autoAccepted: true };
        }
    }

    // Write both directions so each side sees the request
    server.AddFriend({ PlayFabId: currentPlayerId, FriendPlayFabId: target });
    server.AddFriend({ PlayFabId: target, FriendPlayFabId: currentPlayerId });
    setTags(currentPlayerId, target, ["outgoing"]);
    setTags(target, currentPlayerId, ["incoming"]);

    return { ok: true, sent: true };
};

handlers.respondToFriendRequest = function (args) {
    var requester = args.requesterPlayFabId;
    var accept = args.accept === true || args.accept === "true";
    if (!requester) return { error: "No requester" };

    var entry = friendEntry(currentPlayerId, requester);
    if (!entry || (entry.Tags || []).indexOf("incoming") === -1) {
        return { error: "No pending request from that player" };
    }

    if (accept) {
        setTags(currentPlayerId, requester, ["friend"]);
        setTags(requester, currentPlayerId, ["friend"]);
        return { ok: true, accepted: true };
    }

    // Declined — remove from both lists so it doesn't linger
    server.RemoveFriend({ PlayFabId: currentPlayerId, FriendPlayFabId: requester });
    server.RemoveFriend({ PlayFabId: requester, FriendPlayFabId: currentPlayerId });
    return { ok: true, declined: true };
};

handlers.cancelFriendRequest = function (args) {
    var target = args.targetPlayFabId;
    if (!target) return { error: "No target" };
    server.RemoveFriend({ PlayFabId: currentPlayerId, FriendPlayFabId: target });
    server.RemoveFriend({ PlayFabId: target, FriendPlayFabId: currentPlayerId });
    return { ok: true };
};

/* Removing a friend should clear both sides, not just yours. */
handlers.removeFriendBoth = function (args) {
    var target = args.targetPlayFabId;
    if (!target) return { error: "No target" };
    server.RemoveFriend({ PlayFabId: currentPlayerId, FriendPlayFabId: target });
    server.RemoveFriend({ PlayFabId: target, FriendPlayFabId: currentPlayerId });
    return { ok: true };
};


handlers.getFriendRequests = function () {
    // Incoming requests are friends tagged "incoming" — no separate storage needed.
    var out = [];
    try {
        var res = server.GetFriendsList({ PlayFabId: currentPlayerId });
        (res.Friends || []).forEach(function (f) {
            if ((f.Tags || []).indexOf("incoming") !== -1) {
                out.push({
                    from: f.FriendPlayFabId,
                    name: f.TitleDisplayName || (f.Profile && f.Profile.DisplayName) || "Player",
                    avatar: (f.Profile && f.Profile.AvatarUrl) || null,
                    at: Date.now()
                });
            }
        });
    } catch (e) {}
    return { requests: out };
};

/* Lobby invites — same storage pattern, separate key. */
handlers.sendInvite = function (args) {
    var target = args.targetPlayFabId;
    if (!target || !args.roomCode) return { error: "Missing target or room code" };

    var me = server.GetPlayerProfile({
        PlayFabId: currentPlayerId,
        ProfileConstraints: { ShowDisplayName: true }
    });

    var existing = [];
    try {
        var r = server.GetUserInternalData({ PlayFabId: target, Keys: ["invites"] });
        if (r.Data && r.Data.invites) existing = JSON.parse(r.Data.invites.Value);
    } catch (e) {}

    existing.push({
        from: currentPlayerId,
        name: (me.PlayerProfile && me.PlayerProfile.DisplayName) || "Player",
        roomCode: args.roomCode,
        mode: args.mode || "freemode",
        at: Date.now()
    });

    server.UpdateUserInternalData({
        PlayFabId: target,
        Data: { invites: JSON.stringify(existing.slice(-10)) }
    });
    return { ok: true };
};

handlers.getInvites = function () {
    try {
        var r = server.GetUserInternalData({ PlayFabId: currentPlayerId, Keys: ["invites"] });
        var list = (r.Data && r.Data.invites) ? JSON.parse(r.Data.invites.Value) : [];
        // Invites older than 10 minutes are stale
        var fresh = list.filter(function (i) { return Date.now() - i.at < 600000; });
        return { invites: fresh };
    } catch (e) { return { invites: [] }; }
};

handlers.clearInvites = function () {
    server.UpdateUserInternalData({
        PlayFabId: currentPlayerId,
        Data: { invites: "[]" }
    });
    return { ok: true };
};
