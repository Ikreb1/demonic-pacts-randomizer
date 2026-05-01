# Hiscores worker

The community leaderboard is backed by a small Cloudflare Worker
(`dpl-hiscores`) with a KV namespace. One row per OSRS username,
last-write-wins, no auth. Submission is gated on a successful WikiSync
run client-side, so the username on a row is at least tied to a real
OSRS account that the player can read.

The worker source lives in [`worker-hiscores/`](../worker-hiscores). It's
intentionally separate from `worker/` (the WikiSync proxy) — that one is
stateless and trusts every origin, this one holds state and writes back,
so it has stricter CORS and validation.

## Deploy

```bash
cd worker-hiscores
npm install
npx wrangler login         # one-time browser auth

# Create the KV namespaces (production + preview):
npx wrangler kv namespace create HISCORES
npx wrangler kv namespace create HISCORES --preview

# Paste the two ids that wrangler prints into worker-hiscores/wrangler.toml:
#   id = "..."
#   preview_id = "..."
# (KV namespace ids are not secrets — they're scoped to your Cloudflare
# account, useless without your account credentials.)

npx wrangler deploy
```

Verify:

```bash
curl https://dpl-hiscores.<your-subdomain>.workers.dev/scores
# → {"rows":[]}
```

If you're hosting your own instance, paste the URL into the SyncPanel
sidebar (▸ Hiscores URL) — otherwise the app uses the shared default.

## API

| Method | Path                  | Body                                                | Notes                              |
|--------|-----------------------|-----------------------------------------------------|------------------------------------|
| GET    | `/scores?limit=100`   | —                                                   | Top N sorted by `score` desc       |
| GET    | `/scores/:username`   | —                                                   | Single row or 404                  |
| PUT    | `/scores/:username`   | `{ username, score, points, completedCount, regionsUnlocked, pactsUnlocked, clientUpdatedAt }` | Last-write-wins; server stamps `updatedAt` |
| DELETE | `/scores/:username`   | —                                                   | Self-delete; 404 also returns success |

Validation: username matches `/^[A-Za-z0-9 _\-]{1,12}$/`; numeric fields
finite; `score ∈ [-1_000_000, 10_000_000]`; `completedCount ∈ [0, 1000]`;
`clientUpdatedAt` within 24 h of server clock. 400 on violation.

CORS allowlist (writes accepted, so no `*`):

- `https://breki.github.io`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

Non-browser clients (curl) don't send `Origin` and pass through — useful
for testing.

## v1 trade-offs

**No auth, no signed submissions.** Anyone with the URL can `PUT` any
username. We accepted that for v1 because:

- Friction: a real auth flow (OAuth / signed token) is heavier than the
  feature warrants for a small community challenge.
- Forging is unrewarding here — there's no prize. The worst case is a
  bogus `#1`, which the OSRS community can name-and-shame.
- The leaderboard is read-only on the app side. A forged row doesn't
  affect any other player's local state.

If forgery becomes an actual problem, in order of cost:

1. **Cloudflare Rate Limiting Rules** (dashboard, no code) — cap to
   ~30 PUTs / 10 min / IP. Blocks naive scripts.
2. **HMAC mint from the WikiSync proxy** — when the wikisync-proxy
   forwards a successful sync, have it sign `{ username, exp }` with a
   shared Worker secret and return it in a custom header. The hiscores
   worker verifies before accepting a PUT. This binds publishing to a
   live WikiSync read; tampering still possible, but requires the user
   to actually own a profile under the claimed name.
3. **Server-side score recompute** — store the raw `syncedComplete`
   array, recompute `score`/`points` on the worker. Eliminates client
   tampering on the metric itself; cheating reduces to falsifying
   WikiSync data, which is OSRS's problem, not ours.

## Notes

- The `/scores` listing uses `KV.list({prefix})` plus a parallel `get`
  per key. Fine for tens-to-low-hundreds of users; the 30 s edge cache
  on the response absorbs bursts.
- Rows under a stale username (e.g. user changed their RSN) are
  orphaned, not auto-pruned. The "Remove me from the board" button on
  the Hiscores tab calls `DELETE /scores/:username`.
- KV is eventually consistent across regions (~60 s). A submit from
  browser A might not show up on a refresh from browser B until the
  next list call hits a fresh edge.
