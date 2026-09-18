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
