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

Two keys:

- `mealboard.cache`    — current state
- `mealboard.baseline` — the state as it stood at the last successful sync

The baseline is what makes reconciliation possible rather than guesswork.

## 3. Data source — chosen per user, per device

| Target        | Reads/writes                        | Needs                       |
|---------------|-------------------------------------|-----------------------------|
| This device   | nothing — the cache is the truth    | nothing                     |
| Google Drive  | five CSVs in an app-created folder  | OAuth client ID             |
| Self-hosted   | `GET`/`PUT` per CSV                 | a URL, optionally a token   |

The self-hosted contract is deliberately small: `GET {base}/entries.csv`,
`PUT {base}/entries.csv`. Nextcloud WebDAV satisfies it, as does the bundled
`deploy/dataserver/server.mjs`, as does anything else you already run. The
server must allow your site origin via CORS for GET and PUT.

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

Switching targets does not migrate data. Export the CSVs from the old target
and drop them into the new one if you need to carry the plan across.
