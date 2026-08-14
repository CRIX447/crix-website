{
  "_readme": "Import in PlayFab Game Manager -> Economy -> Catalogs -> Upload JSON. Catalog version must be 'Main' to match playfab-manager.js. Create currency code 'CN' under Economy -> Currency FIRST. NOTE: role_owner / role_mod deliberately have NO price so they can never be purchased - grant them from Players -> Inventory or via CloudScript. player_menu IS purchasable (5000 CN) and unlocks the single-player sandbox menu.",
  "CatalogVersion": "Main",
  "Catalog": [
    {
      "ItemId": "role_owner",
      "DisplayName": "Owner Role",
      "Description": "Grants the [OWNER] tag and full admin menu access. Grant-only, never purchasable.",
      "ItemClass": "role",
      "Tags": [
        "role",
        "staff",
        "nopurchase"
      ],
      "IsStackable": false,
      "IsTradable": false,
      "CustomData": "{\"tag\":\"OWNER\",\"colour\":\"#FF0000\",\"priority\":100}"
    },
    {
      "ItemId": "role_mod",
      "DisplayName": "Moderator Role",
      "Description": "Grants the [MOD] tag and moderation tools. Grant-only, never purchasable.",
      "ItemClass": "role",
      "Tags": [
        "role",
        "staff",
        "nopurchase"
      ],
      "IsStackable": false,
      "IsTradable": false,
      "CustomData": "{\"tag\":\"MOD\",\"colour\":\"#00ffd5\",\"priority\":50}"
    },
    {
      "ItemId": "player_menu",
      "DisplayName": "Player Menu",
      "Description": "Unlocks the sandbox menu: godmode, big/tiny bird, slow motion, coin rain, low gravity and sandbox coins. Single player only \u2014 it stays locked in multiplayer so matches remain fair.",
      "ItemClass": "unlock",
      "VirtualCurrencyPrices": {
        "CN": 5000
      },
      "Tags": [
        "unlock",
        "sandbox"
      ],
      "IsStackable": false,
      "IsTradable": false,
      "CustomData": "{\"unlocks\":\"playerMenu\",\"singlePlayerOnly\":true}"
    },
    {
      "ItemId": "hat_bucket",
      "DisplayName": "Bucket Hat",
      "Description": "Certified drip. Keeps the sun off while you fly.",
      "ItemClass": "hat",
      "VirtualCurrencyPrices": {
        "CN": 50
      },
      "Tags": [
        "cosmetic",
        "hat"
      ],
      "IsStackable": false,
      "IsTradable": false,
      "CustomData": "{\"image\":\"bucket-hat.avif\",\"slot\":\"hat\"}"
    },
    {
      "ItemId": "hat_cap",
      "DisplayName": "Baseball Cap",
      "Description": "Classic fit, backwards optional.",
      "ItemClass": "hat",
      "VirtualCurrencyPrices": {
        "CN": 45
      },
      "Tags": [
        "cosmetic",
        "hat"
      ],
      "IsStackable": false,
      "IsTradable": false,
      "CustomData": "{\"image\":\"cap.png\",\"slot\":\"hat\"}"
    },
    {
      "ItemId": "shirt_tank",
      "DisplayName": "Tank Top",
      "Description": "Army green, arms out.",
      "ItemClass": "shirt",
      "VirtualCurrencyPrices": {
        "CN": 40
      },
      "Tags": [
        "cosmetic",
        "shirt"
      ],
      "IsStackable": false,
      "IsTradable": false,
      "CustomData": "{\"image\":\"tank-top.avif\",\"slot\":\"shirt\"}"
    },
    {
      "ItemId": "shirt_tee",
      "DisplayName": "T-Shirt",
      "Description": "The everyday CRIX fit.",
      "ItemClass": "shirt",
      "VirtualCurrencyPrices": {
        "CN": 35
      },
      "Tags": [
        "cosmetic",
        "shirt"
      ],
      "IsStackable": false,
      "IsTradable": false,
      "CustomData": "{\"image\":\"new-t-shirt.png\",\"slot\":\"shirt\"}"
    },
    {
      "ItemId": "pu_x2coins",
      "DisplayName": "2x Coins",
      "Description": "Double coins for 30 seconds.",
      "ItemClass": "powerup",
      "VirtualCurrencyPrices": {
        "CN": 100
      },
      "Tags": [
        "powerup",
        "consumable"
      ],
      "IsStackable": true,
      "IsTradable": false,
      "Consumable": {
        "UsageCount": 1
      },
      "CustomData": "{\"duration\":30,\"effect\":\"x2coins\"}"
    },
    {
      "ItemId": "pu_shield",
      "DisplayName": "Shield",
      "Description": "Invincible for 20 seconds.",
      "ItemClass": "powerup",
      "VirtualCurrencyPrices": {
        "CN": 75
      },
      "Tags": [
        "powerup",
        "consumable"
      ],
      "IsStackable": true,
      "IsTradable": false,
      "Consumable": {
        "UsageCount": 1
      },
      "CustomData": "{\"duration\":20,\"effect\":\"shield\"}"
    },
    {
      "ItemId": "pu_magnet",
      "DisplayName": "Coin Magnet",
      "Description": "Pulls nearby coins toward you for 15 seconds.",
      "ItemClass": "powerup",
      "VirtualCurrencyPrices": {
        "CN": 60
      },
      "Tags": [
        "powerup",
        "consumable"
      ],
      "IsStackable": true,
      "IsTradable": false,
      "Consumable": {
        "UsageCount": 1
      },
      "CustomData": "{\"duration\":15,\"effect\":\"magnet\"}"
    }
  ]
}
