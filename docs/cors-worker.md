# CORS proxy for WikiSync

The OSRS wiki's WikiSync endpoint doesn't send `Access-Control-Allow-Origin`
to third-party sites, so a browser fetch from this app is blocked by CORS.
A tiny Cloudflare Worker fixes it. Free tier is 100,000 requests/day, vastly
more than personal use.

The worker source lives in [`worker/src/index.js`](../worker/src/index.js).
Two ways to deploy it.

## Option A — Wrangler CLI (recommended)

The dashboard UI in 2024+ has a known confusion where saving code in the
editor only creates a draft "version" and doesn't actually deploy. Wrangler
sidesteps this entirely.

```bash
cd worker
npm install
npx wrangler login         # one-time browser auth with your Cloudflare account
npx wrangler deploy
```

The first deploy creates the worker named `dpl-wikisync-proxy` (set in
`wrangler.toml`). Subsequent `npx wrangler deploy` calls update the live
version atomically — no draft state, no UI clicks.

To verify:

```bash
curl https://dpl-wikisync-proxy.<your-subdomain>.workers.dev/runelite/player/zezima/DEMONIC_PACTS_LEAGUE
```

Should return JSON (or 404 for an unknown player), not "Hello World!".

## Option B — Cloudflare dashboard (manual)

1. Sign in at <https://dash.cloudflare.com>.
2. **Workers & Pages** → **Create** → **Create Worker**. Name it
   `dpl-wikisync-proxy` (or anything; remember it). Click **Deploy**.
3. Click **Edit code**. Paste the contents of
   [`worker/src/index.js`](../worker/src/index.js).
4. **Important:** click **Deploy** in the editor — not just **Save**. In the
   new UI these are separate buttons. After deploying, open the
   **Deployments** tab and confirm your edit is the active version (not the
   "Hello World" template).
5. Copy the worker URL Cloudflare shows (e.g.
   `https://dpl-wikisync-proxy.<you>.workers.dev`).

## Wire it into the app

In the **Sync Completion** panel, expand **Proxy URL** and paste your worker
URL. Then enter your RS display name and click **WikiSync**. The default in
the app already points at `dpl-wikisync-proxy.breki.workers.dev`; if that's
your worker, you don't have to change anything.

## Notes

- The worker only forwards `GET` requests under `/runelite/player/`, so it
  can't be abused as an open relay.
- It preserves upstream status codes — a 404 still means "no profile found",
  not "proxy is broken".
- Don't poll. One request per "WikiSync" click is plenty.
