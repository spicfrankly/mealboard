# Storage model

    React state  ──writes──▶  cache (localStorage)  ──reconcile──▶  data source
         ▲                          │                                    │
         └────────seeds on boot─────┘◀──────────merged result────────────┘

## 1. React state — the working copy

Every view reads from React state and nothing else. No screen ever waits on
I/O, so the app is usable offline, on a dead connection, and during a sync.

## 2. Cache — localStorage

Written synchronously on every mutation, and read synchronously on boot, so a
reload restores instantly instead of flashing empty while the network answers.
If `localStorage` is unavailable (private mode, sandboxed frame, storage
disabled) the same interface falls back to an in-memory map — the app keeps
working, it just forgets on reload. The Storage tab shows which mode is live.

Three keys:

- `mealboard.cache`    — current state
- `mealboard.baseline` — the state as it stood at the last successful sync
- `mealboard.roster`   — this device's copy of the peer-to-peer roster

The baseline is what makes reconciliation possible rather than guesswork.

## 3. Data source — chosen per user, per device

| Target        | Reads/writes                        | Needs                       |
|---------------|-------------------------------------|-----------------------------|
| This device   | nothing — the cache is the truth    | nothing                     |
| Google Drive  | five CSVs in an app-created folder  | OAuth client ID             |
| Self-hosted   | `GET`/`PUT` per CSV                 | a URL, optionally a token   |
| Peer-to-peer  | a Yjs document, over WebRTC or SMS  | a shared passphrase         |

The self-hosted contract is deliberately small: `GET {base}/entries.csv`,
`PUT {base}/entries.csv`. Nextcloud WebDAV satisfies it, as does the bundled
`deploy/dataserver/server.mjs`, as does anything else you already run. The
server must allow your site origin via CORS for GET and PUT.

## Peer-to-peer

No account and no server: collaborators who type the same passphrase sync
directly, browser to browser.

**The passphrase is the entire trust boundary.** Anyone who has it can read
and change the plan; anyone who does not cannot reach it at all. There is no
account to revoke and no server to lock — changing the passphrase means
everyone moves to a new room together, and stale copies of the plan stay on
whatever devices already had them. Share it in person or over a channel you
trust, and never in the same message as a sync link.

The passphrase itself never leaves the device. It is used three ways:

- `SHA-256("mealboard-room-v1:" + passphrase)`, truncated, is the room name
  peers announce to the public signalling relay. The relay sees that hash and
  nothing else — not the words, not the plan.
- `y-webrtc`'s own `password` option (PBKDF2 100k/SHA-256 → AES-256-GCM)
  encrypts the signalling traffic, so a peer without the passphrase cannot
  complete the handshake. The data channel itself is then protected by
  WebRTC's DTLS.
- A separately salted key (`mealboard-sms-v1`, same PBKDF2 → AES-256-GCM
  construction) encrypts sync links, keeping the link key independent of the
  room key.

**Store and forward by text message.** When nobody is online at the same
time, the Storage tab builds a link — `?sync=<base64url(iv‖ciphertext)>` —
and hands it to the phone's SMS composer, or the clipboard for devices with
no SMS app. The payload is the whole document (`Y.encodeStateAsUpdate`), not
a diff: applying it is idempotent and order-independent, so opening the same
link twice, or two links out of order, converges either way and the sender
never has to track what the other side already received — the receiver
reports that for itself, further down. The trade is link length, which grows
with the plan.

An arriving link is not applied blind. It is decrypted, replayed into a
scratch document, and fed to the same three-way reconcile every other target
uses, as one more `remote` snapshot — so a stale link can never roll back
newer local edits. The `?sync=` parameter stays in the address bar until the
update actually applies, so a first-time recipient who has not set the
passphrase yet does not lose it by opening the link. Because the update
arrived outside the configured data source, the baseline does not advance:
the new records stay pending until a real sync carries them onward.

### The roster

Who else is on the plan is part of the plan. Each member is one entry —
`memberId`, name, phone, `status`, invite code, and the two acknowledgement
fields below — living in a `roster` map inside the same Yjs document as the
tables, which costs nothing extra because the whole document syncs either
way. As with the tables, the document is only the transport: the store of
record is the plain object in `mealboard.roster`, and an entry's own
`updatedAt` decides which of two copies wins, so merging two snapshots is
order-independent and never depends on a document surviving a reload.

**Joining.** Anyone who types the passphrase takes a place on the roster the
first time they press Start. That is the plain case, and it never needs an
invite — the passphrase alone is what admits them.

**Inviting.** The nicer path is an invite: the inviter mints the new member's
id and a six-digit code, writes the entry as `pending`, and texts a link of
the form `?sync=…&iid=<memberId>&code=<code>`, with the code repeated in
plain text because phones truncate long messages. The invitee opens it,
enters the passphrase, and the code is matched against the pending entry,
which flips to `confirmed` in place — no re-keying, because the id came from
the inviter in the first place. The `iid` and `code` travel in the clear,
which costs nothing: they are meaningless without the encrypted payload
beside them, and without the passphrase that opens it.

**What a confirmed code proves**, exactly: whoever opened that link received
the text sent to that number. Not who owns the phone, not who the person is,
and above all not access — the passphrase is still the entire boundary, and
someone who has it is in the room whether or not anyone invited them.
Cancelling an invite or dropping someone from the roster revokes nothing, for
exactly the same reason the passphrase itself cannot be revoked: they keep
the words and their own copy of the plan. The roster is a courtesy layer for knowing who is
here and who has seen what — never a gate. (Cancelling writes a tombstone
rather than deleting the entry, because a deleted key would simply reappear
from the next peer to merge.)

### Acknowledgement

Each member writes one number into their own entry — `lastSeenEditAt`, the
newest `updated_at` they have personally applied — every time a sync or an
inbound link succeeds. "Needs update" beside somebody is that number compared
against the plan's current newest `updated_at`. Nobody guesses on anyone
else's behalf, which is the whole difference from the old per-device "unsent"
marker: it is a report from the receiver, not a memory of what the sender
tapped.

It is still not a delivery receipt, and the propagation is honestly
gossip-shaped. An acknowledgement is ordinary roster data, so it reaches you
the same way any other change does: over WebRTC while you are both online, or
carried inside the next link that person sends to anybody. **A member who
only ever receives and never sends anything onward never propagates their own
acknowledgement** — you will keep seeing "needs update" for them even though
they are perfectly up to date. Eventual, not instant, and not guaranteed.
The reminder banner that appears right after an inbound link applies is the
affordance that shortens the loop: relaying onward is what carries everyone's
acknowledgements with it.

Yjs is confined to this adapter. Above it, `readTables`/`writeTables`
exchange exactly the same flat CSV-shaped rows as Drive and self-hosted,
`readRoster`/`writeRoster` exchange plain roster entries, and `updated_at` —
not Yjs's last-write-wins — still decides every conflict.

## Reconciliation

Nothing is ever pushed as a blind overwrite. On every sync:

1. Fetch the source's current state.
2. Three-way compare `baseline` / `local` / `remote`, per record.
   - changed locally only  → keep yours
   - changed remotely only → take theirs
   - changed on both       → conflict; newer `updated_at` wins, and the
                             losing side is reported in the Storage tab
   - changed on neither    → unchanged
3. Write the merged result back, but only if your side contributed something.
4. Adopt the merged result as the new baseline and cache it.

Because the comparison is per record, two people shopping at once both keep
their work: your +200 g of rice and their checked-off eggs are different
records and never contend. Conflicts only arise when the *same* record moved
on both sides since your last sync, which the UI then shows you rather than
resolving in silence.

Deletes are tombstones (`deleted=1` plus `updated_at`), not row removals —
otherwise a delete on one device would look identical to a record the other
device had not seen yet, and would resurrect on the next sync.

## Choosing

- **This device** — one person, one phone, no setup. Export the CSVs for backup.
- **Google Drive** — a household that already lives in Google. The owner
  connects and shares the folder by link; everyone else joins it through
  the Picker flow in Storage settings rather than typing the same folder
  name — the `drive.file` scope only grants an app access to a folder
  when the user explicitly picks it, so a plain shared link never becomes
  visible to another account's own folder search.
- **Self-hosted** — you want the data on your own hardware and Google nowhere
  near it.
- **Peer-to-peer** — a household that wants to share a plan with no account
  and nothing to run. Agree on a passphrase, everyone types it, and the
  devices find each other. Invite the people you cannot rely on catching
  online so they appear on the roster, and the plan can still reach them by
  text when nobody is on at the same time.

Switching targets does not migrate data. Export the CSVs from the old target
and drop them into the new one if you need to carry the plan across.
