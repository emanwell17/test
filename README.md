# ScoreZone HTTPS relay — standalone Pxxl test

Deploy this as a **new test project** on Pxxl. Keep your existing website project
unchanged until video has played successfully from Pxxl.

## Pxxl setup

1. Upload the ZIP. Its root contains `package.json`, `server.mjs` and `Dockerfile`.
2. Choose **Node.js / Web Service**, Node **22 or newer**, start command
   **`npm start`**, port **3000**. No dependencies or frontend output directory
   are needed. The optional build command is `npm run build`.
   If using Dockerfile deployment instead, select the included `Dockerfile`.
3. Add these server environment variables before deploying:

   | Variable | Value |
   | --- | --- |
   | `RELAY_SECRET` | A random secret of at least 32 characters |
   | `SESSION_API_KEY` | A different random secret of at least 24 characters |
   | `PORT` | `3000` |
   | `ALLOWED_ORIGINS` | `https://scorezonetv.live,https://www.scorezonetv.live` |

   Generate two secrets in PowerShell with:

   ```powershell
   node -e "const c=require('node:crypto'); console.log('RELAY_SECRET='+c.randomBytes(32).toString('hex')); console.log('SESSION_API_KEY='+c.randomBytes(32).toString('hex'))"
   ```

   Do not commit the generated secrets or put them in frontend `VITE_` variables.
4. Open the generated **HTTPS** project URL. `/healthz` should return `ok: true`.
5. On the test page, enter your `SESSION_API_KEY` and a **fresh direct IPTV URL**
   from the addon, such as an HTTPS `vps-65a08dc7.vps.ovh.ca/svt/hls/...m3u8?t=...`
   link. Do not enter the complete IPTV channel-list M3U or a Flixnest web-player
   `/wp-relay/` link: this test builds our own relay from the direct source.
6. Click **Test through relay**. Confirm video and sound on both desktop and
   phone. In Network, playlists and video segments should use your Pxxl host's
   `/hls/` paths. The page displays `Playing through this relay` only after the
   browser emits its real `playing` event.

If session creation shows **403**, Pxxl cannot fetch the source playlist. If a
`/hls/` segment shows **403**, the upstream segment server rejected Pxxl. A relay
cannot guarantee upstream permission or remove provider quotas. Keep the current
site unchanged if either test fails. An expired addon URL also requires a new URL.

## How it works

- Only the session-creation endpoint accepts source URLs, and it requires your
  server API key. Root URLs are restricted to the configured IPTV provider's HLS
  paths. Session keys are never included in playback links.
- Playlists, variants, audio, video, encryption keys and initialization files use
  encrypted, expiring links. Every downstream request remains on HTTPS from the
  browser's perspective, even when a provider segment is HTTP.
- Child destinations must come from the upstream playlist. Private, loopback,
  link-local and reserved destinations are rejected. DNS is checked and pinned
  when connecting; redirects are validated too. TLS certificate checks stay on.
- Successful playlists cache for **2 seconds** and media objects for **5 minutes**.
  Concurrent requests for the same upstream URL share one fetch per process.
  Request queries remain part of cache keys so different signed sources are not
  accidentally mixed. Different user tokens can share the same upstream object.
- Default cache budget: **64 MiB** (`CACHE_MAX_MB`, configurable 8–256). Maximum
  object size: **32 MiB**. Maximum distinct simultaneous upstream fetches: **12**.
  Cache entries may be evicted earlier than their TTL when the budget is full.
  Objects are buffered before delivery, which makes this test simple and bounded
  but can delay slow or large segments. This is not a transcoder.
  Each upstream fetch has a 60-second total deadline.
- Playback sessions last **10 minutes** (`SESSION_TTL_SECONDS`, 60–3600).
  A test session does not auto-renew; create another session after expiry.
- Cache/coalescing are per Node process. Multiple replicas need shared storage
  for global deduplication. The relay is on-demand: it does not prefetch channels
  or maintain a full recording of a live stream.

## Integrating later

Your authenticated site backend should check Premium access before calling
`POST /api/sessions` with `Authorization: Bearer <SESSION_API_KEY>` and JSON
`{"url":"<server-resolved IPTV URL>"}`. Use the returned `path` on the relay
origin. Never send this API key to normal viewers or add a public URL-signing
endpoint. The test page is for you as operator. This package does not change
your website or its Premium rules by itself.

## Local checks

```powershell
# Create a local .env with PORT, RELAY_SECRET and SESSION_API_KEY as above.
# Keep .env out of Git and deployment uploads.
npm test
npm run build
npm start
```

The player uses bundled Hls.js on compatible desktop browsers and native HLS on
Safari. Hls.js's license is included alongside its bundled file.
