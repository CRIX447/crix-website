# Seasonal themes

Halloween, Christmas and Easter switch themselves on by date and off again
afterwards. Nothing needs deploying when a season starts.

| Season | Runs | Calendar |
|---|---|---|
| 🎃 Halloween | the whole of October | TRICK OR TREAT — 31 doors |
| 🎄 Christmas | 1–26 December | ADVENT CALENDAR — 24 doors |
| 🐣 Easter | Palm Sunday to Easter Monday | EGG HUNT — 7 doors |

Easter is computed each year rather than listed, so it never needs updating.

## Forcing a season

Two places, both writing the same `config/season` document, so a change lands
on every player at once rather than only in the browser that pressed it:

* **Owner console** → the **🎃 Seasons** tab
* **In game** → the 🛡️ **Staff** button in the icon row → scroll to *🗓️ Seasonal theme*

`Follow the calendar` is the normal setting. `Off` suppresses seasons
altogether, which is the one to reach for if a season ever causes trouble.

A forced season changes the colours, music and fly-by immediately, but the
calendar still goes by the real date — forcing Christmas in July shows the
advent calendar with every door shut. That is deliberate: a preview should not
hand out coins out of season.

## Turning one on just for yourself

Both places also have a **Just for me** section. It beats the setting above and
changes nothing for anybody else, so a season can be tried out on the live site
in the middle of the year without a soul noticing.

It is stored against your account rather than your browser, so setting it in the
console on a desktop turns it on in the game on a phone — no copying links, no
signing in twice. Signing out clears it.

Four switches decide which parts of the season you get, so each piece can be
checked on its own:

| Switch | Off means |
|---|---|
| Colours | plain interface and plain playfield |
| Music | the usual `music.mp3` |
| Fly-by | no witch, no sleigh |
| Calendar | the calendar button disappears |

Useful for checking a newly uploaded witch without the music playing over it.

## Artwork and sound

None of these files are required. Any that is missing is simply skipped — no
error, no silence, no blank sprite — so they can be uploaded one at a time.

| File | Used for |
|---|---|
| `img/witch.png` | the witch that crosses the sky during Halloween |
| `img/witchl.mp3` | the sound she makes on the way past |
| `img/santasley.png` | Santa's sleigh, crossing during Christmas |
| `img/santahohoho.mp3` | the sound it makes on the way past |
| `img/halloweenmusic.mp3` | replaces the menu and game music in October |
| `img/christmasmusic.mp3` | replaces it in December |
| `img/eastermusic.mp3` | replaces it over Easter week |

Music that is missing falls back to the usual `img/music.mp3`.

The two fly-by images should face the way they travel: the witch flies right to
left, the sleigh left to right. If one comes out facing backwards, set
`flip: true` on that season's `flyer` in `flappycrix.html` rather than editing
the artwork.

Transparent PNGs, roughly 2:1 or wider. The witch is drawn 96px across and the
sleigh 132px on a 400px-wide canvas, so about 400×200 is plenty.

## Rewards

One door a day, 60 coins plus 12 per door, and 750 for the last one. Doors
already missed stay open so a day away costs nothing; doors still to come do
not open early. Claims are per browser, recorded before the coins are granted.

Some doors also hold a cosmetic. Those are marked in the grid before they open,
since knowing one is coming is the reason to come back on the day:

| Season | Door | Prize |
|---|---|---|
| 🎃 Halloween | 7 | Witch hat |
| | 14 | Skeleton mask |
| | 21 | Ghost trail |
| | 31 | Pumpkin head |
| 🎄 Christmas | 6 | Reindeer ears |
| | 12 | Tinsel trail |
| | 24 | Santa's hat |
| 🐣 Easter | 4 | Bunny ears |
| | 7 | Pastel trail |

They are event rewards: earned from the calendar, never sold, and they stay
yours once the season ends. Opening a door you have already collected the prize
from just pays the coins.

## The seasonal hats are drawn, not loaded

Unlike the bucket hat and the cap, the six seasonal head items have no PNG.
They are drawn on the canvas from `HAT_SHAPES` in `flappycrix.html`, the same
way trails are, which is why they worked the day they were written rather than
waiting on artwork.

They live in `cosmetic-art.js`, shared by the game and the owner console so the
two cannot drift apart.

**Before moving any of those numbers, read the header of that file.** The
geometry was measured off the sprite's pixels, and it is not what you would
guess. Each shape draws in the bird's own space — origin at the middle, `s` is
the bird's size, art from `-s/2` to `+s/2` — and the sprite is opaque all the
way to the top edge of its box. That top band, `-0.50` to `-0.24`, is already
the character's hood. There is no clear air above his head at all. A hat rests
its brim at `HEAD_TOP` (`-0.455`) and puts its body **above** the sprite, in
negative space; a mask (the pumpkin, the skull) is centred over the face near
`y = -0.05`. The first version of these hats assumed headroom that does not
exist, which is why every band drew as a bar painted across his head.

### They move

A cap's tip, a pair of ears and a witch's cone hang off the bird rather than
being welded to it, so they lag what it does: stream up on a fall, whip over on
a flap, settle in about a quarter second. One damped spring per wearer, driven
by that wearer's vertical speed, hard-stopped at 0.52 radians.

It costs nothing on the wire — every client already knows every player's
velocity, so each runs the same spring locally. Masks are rigid, which is what
a pumpkin worn over your head does. Any item can opt out with `rigid: true`.

Replacing one with real artwork later is a one-line change: swap `draw: 'santa'`
for `image: '/img/santa-hat.png'` on that item and the existing image path takes
over. An image hat rests on the same brim line and gets the same swing, so the
artwork lands where the drawn shape was.

## Limited gamemodes

Each season brings one extra way to play, and it only exists while that season
is on. The button sits beside MULTIPLAYER on the menu and disappears with the
season.

| Season | Mode | What you do | Target |
|---|---|---|---|
| 🎃 Halloween | Candy Hunt | Ninety seconds of sweets. About one in five is sour and costs you two. | 40 |
| 🎄 Christmas | Deliver the Presents | Collect presents, carry up to three, post them down the chimneys on the pipes. | 30 |
| 🐣 Easter | Find the Eggs | Eggs are a tuft of grass until you are within 125px. One in eight is golden, worth five. | 70 |

They share one engine (`SEASON_MODES` and the `sm*` functions in
`flappycrix.html`) — a timed run down the ordinary lane with the season's own
thing to collect. Beating the target pays 250 bonus coins on top of the
per-pickup rate. Dying ends the run early and you keep what you collected.

Personal bests are kept per mode in `localStorage` under `crix_sm_best_v1`.

### In multiplayer

Each one is also a room mode. While its season is on it appears as a fifth
card in the create form's GAME MODE grid, marked LIMITED; the rest of the year
the card is not there. If the season turns over while the form is open the
card un-selects itself and hands the selection back to Freemode, so a lobby
cannot be created on a mode that no longer exists.

A seasonal match is a race for the *same* lane rather than a solo score
attack:

* every pickup comes off the room's shared seed, so the sweets are in the
  same places on everyone's screen;
* every pickup has an id, and taking one tells the room, so it leaves
  everybody else's lane — one sweet, not one each. A chimney is scenery, so
  everyone can keep posting into it;
* going down respawns you, the way Race and Coin Rush do. The clock decides
  the match, not your last mistake.

The solo payout (coins, the target bonus, personal best) applies only to solo
runs. A room match is scored by the standings like any other mode.

Forcing a season from the owner panel turns its mode on too, which is how to
try one out of season.

## Halloween dressing

Two things appear during Halloween and nowhere else.

**Cobwebs** are strung across all four corners of the screen. They are pinned
to the viewport rather than scrolling with the lane, because they are on the
window you are looking through rather than in the world — so they draw last
and nothing passes in front of them.

**Pumpkins** sit in the lane, on the line you were already flying. Fly into
one and it bursts into eight pieces, plays `/img/smash.mp3` and kicks the
screen. It is deliberately not an obstacle — no damage, no slowdown, no score.
A cost would make people avoid the one thing that is meant to be fun to hit.

In a room they come off the shared generator like everything else, so they sit
in the same place for everyone; whether one has been smashed stays local, so
each player gets to hit their own.

`smash.mp3` is the only file these need. Without it the burst and the shake
still happen — the sound fails once, is noted as missing, and is never asked
for again.

### If you want to move them

`PUMPKIN_EVERY` in `flappycrix.html` is the gap between them, in ticks at
60Hz — `[520, 900]` is roughly nine to fifteen seconds. `drawWholePumpkin`
draws one, and every part of it is measured from `r`, the same radius the
collision uses, centred on the origin. Keep it that way: the first version
borrowed the pumpkin *hat's* drawing, which is built to sit over a face, and
it came out as a tall egg whose visual centre sat 12px above the point being
collided against.
