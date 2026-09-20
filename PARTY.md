# Party and invites

## What it is

An Xbox-style party: a group that persists across games. Voice for whoever has
a microphone, text party chat for whoever does not, and the leader's lobby
takes everyone with them.

The handle is the 🎧 pill — top right on the menu, bottom right during a match.
Tapping it starts a party if you are not in one, and opens the panel if you are.

## Before it works: publish the rules

`firestore.rules` in this repo has the `parties` collection in it, but the repo
is not what Firebase reads. **Paste the file into Firebase Console → Firestore
Database → Rules → Publish.** Until you do, starting a party fails with a
permission error and nothing else in this document happens.

That is the same file, and the same step, as the seasonal config and the
cosmetic fit. Publishing it once covers all of them.

## Why it is in Firestore rather than Photon

In-game voice is signalled through the Photon room, which works because
everyone in that voice mesh is in that room. A party outlives rooms — half of
it can be in a match while the rest is on the menu — and a Photon client can
only be in one room at a time.

So the party lives in Firestore instead:

```
parties/{id}              leader, leaderName, memberIds[], members{}, room
parties/{id}/chat/{id}    uid, name, text, at
parties/{id}/signal/{id}  from, to, type, data      (the WebRTC handshake)
```

Party voice therefore survives joining and leaving lobbies, which is the whole
point of a party. The in-game room voice is untouched and still runs over
Photon; the two meshes are independent and can both be live at once.

The handshake messages are read once and deleted. Who is talking is measured
locally, off streams each client already has, so the ring round an avatar costs
nothing on the wire.

## Who can do what

| | Leader | Member |
|---|---|---|
| Invite | ✅ | ✅ |
| Remove someone | ✅ | — |
| Take the party into a lobby | ✅ | — |
| Change their own name/mic state | ✅ | ✅ |
| Leave | ✅ (hands over) | ✅ |

The rules enforce the middle rows: a member may only add or edit **their own**
entry in `members`, so one member cannot rename, mute or eject another. The
last person out closes the party and clears its chat and signalling.

A party holds 8. It is remembered across a refresh (`crix_party_v1`), and
closing the tab leaves it rather than leaving a ghost in everyone's list.

## Invites

Invites were already being written to Firestore before this and never read
live: the poll that would have surfaced them only ran at sign-in and when the
notification panel was opened, and both of those suppress the toast. An invite
sat in the database until the recipient happened to open a panel.

There is now a listener, so an invite arrives while the person is looking at
whatever they are looking at, with a fallback to polling if the listener is
refused. One collection carries both kinds:

* **lobby invite** — has a `roomCode`. Accepting joins that lobby.
* **party invite** — has a `partyId`. Accepting joins that party.

Both are sent from the **INVITE FRIENDS** button — in the lobby's action row,
and in the party panel. Either opens the same picker: it searches, puts
whoever is online at the top because they are the ones who can accept, says
where the person is being invited to, and greys out anyone already in your
party. An offline friend can still be invited; the invite waits in Firestore
until they next open the game.

(The ✉ and 🎧 buttons on a friend row still work and do the same thing.)

Inviting to a party you have not started yet starts one first. Invites expire
after ten minutes and are deleted once answered.

## Making one

**Create** — in the matchmaking row or the lobby browser — asks what you are
making: a **game lobby** (a room to play in, with a mode and a privacy
setting) or a **party** (voice and chat that follow you between games).

## No microphone

This is deliberate and it is half the feature. Someone without a mic is not
shown as broken — their row says **typing only**, and the chat box says *no
mic? type here*. They read everything the party says in chat and the party
reads them. Nothing else about the party treats them differently.
