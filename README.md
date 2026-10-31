# ScoreZone production catalog and shared restream

This project supplies LiveScore catalogs with addon fallback, daily stored channel mappings, DaddyLive-to-IPTV matching, server-verified 4K Premium locks and one FFmpeg ingest per watched channel. HEVC-labelled options are excluded.

## Pxxl

Use Node 22+, build `npm run build`, start `npm start`, and port 3000. FFmpeg is provided by the pinned ffmpeg-static package; the build verifies it. The included Dockerfile installs native FFmpeg as an alternative.

Keep the existing RELAY_SECRET and SESSION_API_KEY. Add IPTV_PLAYLIST_URL as a private server variable containing the original provider playlist URL. Never use a VITE_ variable or put it in Git. SCOREZONE_PUBLIC_ORIGIN defaults to https://testscore.pxxl.pro. ALLOWED_ORIGINS must include https://scorezonetv.live and https://www.scorezonetv.live.

`GET /healthz` reports version `catalog-restream-v1`, FFmpeg readiness and whether the playlist variable is configured. The main frontend must only be deployed after this backend is healthy.

Internal ports 8791 and 8792 bind to loopback. Only PORT is exposed publicly. Public media is HTTPS through /restream; /hls remains compatible with existing signed relay links. No public endpoint accepts arbitrary provider URLs without the server API key.

Generated media and the daily catalog are under ./data by default. Set SCOREZONE_DATA_DIR to a persistent writable volume if Pxxl provides one. Without a persistent volume, a restart rebuilds the daily scan. Idle video ingests stop after 60 seconds; inactive output files are cleaned. This initial configuration permits eight simultaneous active channels, each shared by all of its viewers.

The server copies codecs without transcoding. Source/provider account limits still apply. Premium tickets are capped at verified entitlement expiry. Secrets and provider source URLs stay on the backend.
