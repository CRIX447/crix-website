# PlayFab setup — Flappy Crix

Everything the title needs, in the order it has to be done. Title ID `17CF2A`,
catalog version `Main`, currency code `CN` — all three come from `api.json`, so
change them there first if you ever change them in PlayFab.

## 1. Create the currency (do this first)

Game Manager → **Economy → Currency → New currency**

| Field | Value |
|---|---|
| Currency code | `CN` |
| Display name | Coins |
| Initial deposit | `0` |
| Recharge rate | leave off |

The code must be exactly two characters and must match `playfab.currencyCode` in
`api.json`. Uploading a catalog that prices items in a currency that does not
exist yet is rejected, which is why this step comes first.

## 2. Upload the catalog

Game Manager → **Economy → Catalogs** → catalog `Main` → **Upload JSON**, and
give it [`playfab-catalog.json`](playfab-catalog.json).

The same file is a valid request body for the Admin API if you would rather
script it:

```
POST https://17CF2A.playfabapi.com/Admin/SetCatalogItems
X-SecretKey: <your title secret key>
Content-Type: application/json

<contents of playfab-catalog.json>
```

**The secret key is server-side only.** Never put it in `api.json`, in the page,
or anywhere else the browser can reach.

### What is in it

| Group | Items | Notes |
|---|---|---|
| Hats | `crown`, `bucket`, `cap` | `crown` has no price — event reward only |
| Trails | `trail_rainbow`, `trail_ember`, `trail_frost`, `trail_toxic`, `trail_void` | colours live in `CustomData` |
| Power-ups | `x2coins`, `shield`, `magnet` | consumable, `UsagePeriod` = the in-game duration |
| Unlocks | `player_menu` | 100,000,000 CN |
| Roles | `role_owner`, `role_dev`, `role_mod` | **no price at all** |
| Seasonal | `hat_witch`, `hat_skull`, `hat_pumpkin`, `trail_ghost` | Halloween — **no price**, granted by the calendar |
| | `hat_reindeer`, `hat_santa`, `trail_tinsel` | Christmas — same |
| | `hat_bunny`, `trail_pastel` | Easter — same |

The nine seasonal items carry no `VirtualCurrencyPrices` at all, deliberately.
They are awarded by the season's calendar, and a price would be a second way to
get them that bypasses the thing they exist to reward. Their `CustomData`
records which season, which calendar and which door, so the catalog says where
each one comes from without anyone opening the game.

Hats carry both `image` and `draw`. The drawing is what players see until the
PNG is uploaded; once the file exists it takes over on its own.

Item IDs, prices, durations, trail colours, hat artwork and every calendar
prize are checked against the running game rather than transcribed. If you
change a price in `flappycrix.html` you have to change it here too, or a
PlayFab purchase will be charged at a different number than the shop showed.

## 3. Grant a staff role

Roles are inventory items, not a flag. Game Manager → **Players** → pick the
player → **Inventory → Grant item** → `role_owner`, `role_dev` or `role_mod`.

Those three items deliberately carry **no `VirtualCurrencyPrices` block**, so
`PurchaseItem` can never award one — a player cannot buy their way to staff no
matter what they send from the browser. The client reads them back out of the
inventory in `playfab-manager.js` → `_extractRoles`.

The old `UserReadOnlyData.roles` array is still read as a fallback so accounts
set up the previous way keep working.

## 4. Lock the API down

Game Manager → **Settings → API Features**

- **Allow client to add virtual currency** — OFF
- **Allow client to subtract virtual currency** — leave ON only while you still
  award coins from the browser; it is the one setting standing between a player
  and free coins.
- **Enable API access to player profiles** — ON (needed for names and avatars)

## What the game currently buys through PlayFab

Only `player_menu`. Cosmetics and power-ups are still spent from the local coin
balance, so the catalog entries for them are the definition PlayFab needs in
order for a server-authoritative purchase to be switched on later — uploading
them now costs nothing and means the IDs and prices are already agreed.

Moving cosmetics onto `PurchaseItem` is a separate job, and it has one real
consequence worth deciding before starting: guests have no PlayFab account, so
a server-authoritative shop is a shop guests cannot use.
